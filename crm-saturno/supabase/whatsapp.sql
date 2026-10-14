-- =====================================================================
--  SATURNO NFC · CRM
--  WhatsApp Business (API oficial da Meta) dentro do CRM: conversas e mensagens
--  Rode DEPOIS do schema.sql: Supabase > SQL Editor > New query > cole tudo > Run
--  (pode rodar mais de uma vez sem problema)
-- =====================================================================

create table if not exists public.wa_conversas (
  id                 uuid primary key default gen_random_uuid(),
  telefone           text not null unique,              -- wa_id do contato, só dígitos (ex: 5531999998888)
  nome               text,                              -- nome do perfil no WhatsApp
  cliente_id         uuid references public.clientes(id) on delete set null,
  lead_id            uuid references public.leads(id) on delete set null,
  ultima_msg         text,
  ultima_msg_em      timestamptz,
  ultima_entrada_em  timestamptz,                       -- última msg DO contato (janela de 24 h da Meta)
  nao_lidas          integer not null default 0,
  bot_pausado        boolean not null default false,    -- true = atendente humano assumiu (não repassa ao agente/n8n)
  criado_em          timestamptz not null default now()
);
alter table public.wa_conversas add column if not exists lead_id uuid references public.leads(id) on delete set null;
-- WhatsApp pelo Chatwoot (caixa "Canal da API"): ids da conversa e do contato lá no Chatwoot
alter table public.wa_conversas add column if not exists chatwoot_conversa_id integer;
alter table public.wa_conversas add column if not exists chatwoot_contato_id integer;

create table if not exists public.wa_mensagens (
  id             uuid primary key default gen_random_uuid(),
  conversa_id    uuid not null references public.wa_conversas(id) on delete cascade,
  wa_message_id  text unique,
  direcao        text not null check (direcao in ('entrada','saida')),
  tipo           text not null default 'text',
  texto          text,
  status         text not null default 'recebida'
                 check (status in ('recebida','enviando','enviada','entregue','lida','falhou')),
  erro           text,
  enviado_por    uuid,
  criado_em      timestamptz not null default now()
);

create index if not exists idx_wa_conv_ultima on public.wa_conversas(ultima_msg_em desc);
create index if not exists idx_wa_msg_conv    on public.wa_mensagens(conversa_id, criado_em);

-- Segurança: só a equipe logada lê/responde. O webhook grava com a service role (Edge Function).
alter table public.wa_conversas enable row level security;
alter table public.wa_mensagens enable row level security;
drop policy if exists equipe_total on public.wa_conversas;
drop policy if exists equipe_total on public.wa_mensagens;
create policy equipe_total on public.wa_conversas for all to authenticated using (true) with check (true);
create policy equipe_total on public.wa_mensagens for all to authenticated using (true) with check (true);
revoke all on public.wa_conversas, public.wa_mensagens from anon;
grant select, insert, update, delete on public.wa_conversas, public.wa_mensagens to authenticated;

-- variações do telefone com/sem o 9 (o WhatsApp às vezes entrega 553199998888)
create or replace function public._fone_variantes(p_tel text) returns text[]
language sql immutable as $$
  select array_remove(array[
    p_tel,
    case when p_tel ~ '^55\d{10}$' then substr(p_tel, 1, 4) || '9' || substr(p_tel, 5) end,
    case when p_tel ~ '^55\d{2}9\d{8}$' then substr(p_tel, 1, 4) || substr(p_tel, 6) end], null)
$$;

create or replace function public.wa_cliente_por_telefone(p_tel text) returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.clientes where telefone = any(public._fone_variantes(p_tel)) limit 1
$$;
create or replace function public.wa_lead_por_telefone(p_tel text) returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.leads where telefone = any(public._fone_variantes(p_tel))
   order by (etapa not in ('ganho','perdido','sem_interesse')) desc, criado_em desc limit 1
$$;
revoke all on function public.wa_cliente_por_telefone(text) from public, anon;
revoke all on function public.wa_lead_por_telefone(text) from public, anon;
grant execute on function public.wa_cliente_por_telefone(text) to authenticated, service_role;
grant execute on function public.wa_lead_por_telefone(text) to authenticated, service_role;

-- Contato novo no WhatsApp (sem lead nem cliente) vira lead sozinho
-- (etapa "Em atendimento IA" quando o agente está respondendo; "Novo lead" quando não)
drop function if exists public.wa_garantir_lead(text, text);
create or replace function public.wa_garantir_lead(p_tel text, p_nome text, p_etapa text default 'novo') returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid := public.wa_lead_por_telefone(p_tel);
begin
  if v is null and public.wa_cliente_por_telefone(p_tel) is null then
    insert into public.leads (nome, telefone, origem, etapa)
    values (coalesce(nullif(trim(p_nome), ''), 'Contato ' || right(p_tel, 4)), p_tel, 'whatsapp',
            case when p_etapa in ('novo','ia','humano') then p_etapa else 'novo' end)
    returning id into v;
  end if;
  return v;
end $$;
revoke all on function public.wa_garantir_lead(text, text, text) from public, anon, authenticated;
grant execute on function public.wa_garantir_lead(text, text, text) to service_role;

-- Cliente/lead cadastrado depois já aparece ligado à conversa existente
create or replace function public.tg_wa_vincular_cliente() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.wa_conversas set cliente_id = new.id
   where cliente_id is null and new.telefone is not null and telefone = any(public._fone_variantes(new.telefone));
  return null;
end $$;
drop trigger if exists t_wa_vincular_cliente on public.clientes;
create trigger t_wa_vincular_cliente after insert or update of telefone on public.clientes
for each row execute function public.tg_wa_vincular_cliente();

create or replace function public.tg_wa_vincular_lead() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.wa_conversas set lead_id = new.id
   where lead_id is null and new.telefone is not null and telefone = any(public._fone_variantes(new.telefone));
  return null;
end $$;
drop trigger if exists t_wa_vincular_lead on public.leads;
create trigger t_wa_vincular_lead after insert or update of telefone on public.leads
for each row execute function public.tg_wa_vincular_lead();

-- Tempo real
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.wa_conversas; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.wa_mensagens; exception when duplicate_object then null; end;
  end if;
end $$;

notify pgrst, 'reload schema';
