-- =====================================================================
--  SATURNO NFC · CRM
--  Banco completo para Supabase (Postgres): leads, funil, tarefas, clientes,
--  produtos, pedidos, margem, assinaturas e funções do agente de WhatsApp.
--  Como usar: Supabase > SQL Editor > New query > cole tudo > Run
--  Pode rodar mais de uma vez: não apaga dados.
--  Depois rode o whatsapp.sql (caixa de entrada do WhatsApp dentro do CRM).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. TABELAS
-- ---------------------------------------------------------------------

-- Clientes (quem já comprou). Lead ganho vira cliente.
create table if not exists public.clientes (
  id              uuid primary key default gen_random_uuid(),
  nome            text not null,
  telefone        text unique,                     -- só dígitos, ex: 5531999998888
  email           text,
  empresa         text,
  documento       text,                            -- CPF ou CNPJ
  endereco        text,
  bairro          text,
  cidade          text,
  uf              text,
  cep             text,
  link_pagina     text,                            -- página NFC do cliente
  link_avaliacao  text,                            -- link de avaliação Google gravado no cartão do cliente
  observacoes     text,
  tags            text[] not null default '{}',
  origem          text not null default 'manual'
                  check (origem in ('manual','whatsapp','site','instagram','indicacao','google','agente','importado')),
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

-- Leads (funil de vendas: tabela, kanban e relatórios)
create table if not exists public.leads (
  id             uuid primary key default gen_random_uuid(),
  nome           text not null,
  telefone       text,                             -- só dígitos
  email          text,
  empresa        text,
  cidade         text,
  interesse      text,                             -- plano/produto de interesse (ex.: Essencial, Espelho)
  valor          numeric(10,2) not null default 0 check (valor >= 0),   -- valor estimado do negócio
  etapa          text not null default 'novo'
                 check (etapa in ('novo','ia','humano','reuniao','proposta','ganho','perdido','sem_interesse')),
  etapa_max      smallint not null default 0,      -- etapa mais avançada já alcançada (funil de conversão)
  origem         text not null default 'manual'
                 check (origem in ('manual','whatsapp','site','instagram','indicacao','google','agente','importado')),
  motivo_perda   text,
  observacoes    text,
  cliente_id     uuid references public.clientes(id) on delete set null,
  etapa_em       timestamptz not null default now(),   -- quando entrou na etapa atual
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

-- Histórico do lead: notas de interação e mudanças de etapa (registradas sozinhas)
create table if not exists public.lead_atividades (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references public.leads(id) on delete cascade,
  tipo       text not null default 'nota' check (tipo in ('criado','etapa','nota','tarefa','whatsapp','pedido','agente')),
  texto      text not null,
  autor      text,                                 -- e-mail de quem registrou (vazio = sistema/agente)
  criado_em  timestamptz not null default now()
);

-- Tarefas / lembretes de follow-up
create table if not exists public.tarefas (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid references public.leads(id) on delete cascade,
  cliente_id  uuid references public.clientes(id) on delete cascade,
  titulo      text not null,
  vence_em    date,
  feita       boolean not null default false,
  feita_em    timestamptz,
  criado_em   timestamptz not null default now()
);

-- Catálogo: cartões NFC, cartões Google Avaliação, espelhos, planos e serviços
create table if not exists public.produtos (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  categoria   text not null default 'Outros',
  preco       numeric(10,2) not null default 0 check (preco >= 0),
  recorrente  boolean not null default false,      -- cobrança mensal (ex.: manutenção da página)
  estoque     integer check (estoque is null or estoque >= 0),   -- vazio = sem controle
  descricao   text,
  ativo       boolean not null default true,
  excluido    boolean not null default false,      -- excluído no CRM (some das telas, fica para o histórico)
  criado_em   timestamptz not null default now()
);

-- Custos (aba Margem de lucro): tabela separada, só a equipe logada lê
create table if not exists public.produto_custos (
  produto_id    uuid primary key references public.produtos(id) on delete cascade,
  custo         numeric(10,2) check (custo >= 0),
  frete         numeric(10,2) not null default 0 check (frete >= 0),
  taxa_pct      numeric(6,2)  not null default 0 check (taxa_pct >= 0),
  fornecedor    text,
  atualizado_em timestamptz not null default now()
);

create sequence if not exists public.pedidos_numero_seq start 1001;

-- Pedidos / vendas
create table if not exists public.pedidos (
  id               uuid primary key default gen_random_uuid(),
  numero           integer not null unique default nextval('public.pedidos_numero_seq'),
  cliente_id       uuid not null references public.clientes(id) on delete restrict,
  lead_id          uuid references public.leads(id) on delete set null,
  status           text not null default 'novo'
                   check (status in ('novo','arte','aprovacao','producao','enviado','entregue','cancelado')),
  forma_pagamento  text check (forma_pagamento in ('pix','cartao_credito','cartao_debito','boleto','dinheiro','link')),
  parcelas         smallint not null default 1 check (parcelas between 1 and 24),
  pago             boolean not null default false,
  tipo_entrega     text not null default 'correios' check (tipo_entrega in ('correios','motoboy','retirada','instalacao','digital')),
  endereco_entrega text,
  codigo_rastreio  text,
  prazo            date,                             -- previsão de entrega
  subtotal         numeric(10,2) not null default 0,
  desconto         numeric(10,2) not null default 0 check (desconto >= 0),
  frete            numeric(10,2) not null default 0 check (frete >= 0),
  total            numeric(10,2) not null default 0,
  observacoes      text,
  origem           text not null default 'manual' check (origem in ('manual','whatsapp','site','instagram','agente','indicacao')),
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now()
);

create table if not exists public.pedido_itens (
  id              uuid primary key default gen_random_uuid(),
  pedido_id       uuid not null references public.pedidos(id) on delete cascade,
  produto_id      uuid references public.produtos(id) on delete set null,
  produto         text not null,                    -- nome gravado no momento da venda
  categoria       text,
  quantidade      integer not null default 1 check (quantidade > 0),
  preco_unitario  numeric(10,2) not null default 0 check (preco_unitario >= 0),
  personalizacao  text,                             -- nome/arte/link gravado no cartão
  subtotal        numeric(10,2) generated always as (quantidade * preco_unitario) stored
);

-- Assinaturas (cobrança mensal: manutenção da página NFC, planos mensais)
create table if not exists public.assinaturas (
  id                  uuid primary key default gen_random_uuid(),
  cliente_id          uuid not null references public.clientes(id) on delete cascade,
  produto_id          uuid references public.produtos(id) on delete set null,
  descricao           text not null,
  valor               numeric(10,2) not null check (valor >= 0),
  dia_vencimento      smallint not null default 10 check (dia_vencimento between 1 and 28),
  proximo_vencimento  date not null,
  status              text not null default 'ativa' check (status in ('ativa','pausada','cancelada')),
  forma_pagamento     text,
  observacoes         text,
  criado_em           timestamptz not null default now(),
  cancelada_em        timestamptz
);

create table if not exists public.assinatura_pagamentos (
  id             uuid primary key default gen_random_uuid(),
  assinatura_id  uuid not null references public.assinaturas(id) on delete cascade,
  referencia     date not null,                     -- vencimento que foi pago
  valor          numeric(10,2) not null,
  pago_em        timestamptz not null default now()
);

-- Chave secreta do agente de WhatsApp (não é exposta pela API)
create table if not exists public.agente_config (
  id     int primary key default 1 check (id = 1),
  chave  text not null default encode(gen_random_bytes(24), 'hex')
);
insert into public.agente_config (id) values (1) on conflict do nothing;

create index if not exists idx_leads_etapa      on public.leads(etapa);
create index if not exists idx_leads_telefone   on public.leads(telefone);
create index if not exists idx_leads_criado     on public.leads(criado_em desc);
create index if not exists idx_ativ_lead        on public.lead_atividades(lead_id, criado_em desc);
create index if not exists idx_tarefas_pend     on public.tarefas(feita, vence_em);
create index if not exists idx_pedidos_cliente  on public.pedidos(cliente_id);
create index if not exists idx_pedidos_criado   on public.pedidos(criado_em desc);
create index if not exists idx_itens_pedido     on public.pedido_itens(pedido_id);
create index if not exists idx_assin_venc       on public.assinaturas(status, proximo_vencimento);

-- ---------------------------------------------------------------------
-- 2. FUNÇÕES E TRIGGERS
-- ---------------------------------------------------------------------

-- telefone só com dígitos e DDI 55 (aceita "(31) 99999-8888", "+55 31…")
create or replace function public._fone(p text) returns text
language sql immutable as $$
  select case
    when p is null or regexp_replace(p, '\D', '', 'g') = '' then null
    when length(regexp_replace(p, '\D', '', 'g')) in (10, 11) then '55' || regexp_replace(p, '\D', '', 'g')
    else regexp_replace(p, '\D', '', 'g') end
$$;

create or replace function public.tg_atualizado_em() returns trigger
language plpgsql as $$
begin new.atualizado_em := now(); return new; end $$;

drop trigger if exists t_clientes_upd on public.clientes;
create trigger t_clientes_upd before update on public.clientes
for each row execute function public.tg_atualizado_em();
drop trigger if exists t_custos_upd on public.produto_custos;
create trigger t_custos_upd before update on public.produto_custos
for each row execute function public.tg_atualizado_em();

-- ordem das etapas do funil (perdido/sem interesse ficam fora da escada)
create or replace function public._etapa_ordem(p text) returns smallint
language sql immutable as $$
  select case p when 'novo' then 0 when 'ia' then 1 when 'humano' then 2 when 'reuniao' then 3
                when 'proposta' then 4 when 'ganho' then 5 else null end::smallint
$$;
create or replace function public._etapa_nome(p text) returns text
language sql immutable as $$
  select case p when 'novo' then 'Novo lead' when 'ia' then 'Em atendimento IA' when 'humano' then 'Atendimento humano'
                when 'reuniao' then 'Reunião agendada' when 'proposta' then 'Proposta enviada' when 'ganho' then 'Ganho'
                when 'perdido' then 'Perdido' when 'sem_interesse' then 'Sem interesse' else p end
$$;

-- lead: telefone normalizado, etapa mais avançada, data da etapa e atualizado_em
create or replace function public.tg_lead_antes() returns trigger
language plpgsql as $$
begin
  new.telefone := public._fone(new.telefone);
  new.etapa_max := greatest(coalesce(new.etapa_max, 0), coalesce(public._etapa_ordem(new.etapa), 0));
  if tg_op = 'UPDATE' then
    if new.etapa is distinct from old.etapa then new.etapa_em := now(); end if;
    new.atualizado_em := now();
  end if;
  return new;
end $$;
drop trigger if exists t_lead_antes on public.leads;
create trigger t_lead_antes before insert or update on public.leads
for each row execute function public.tg_lead_antes();

-- histórico automático: lead criado e etapa alterada (vale para CRM, agente e importação)
create or replace function public.tg_lead_historico() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.lead_atividades (lead_id, tipo, texto, autor)
    values (new.id, 'criado', 'Lead criado: ' || new.nome, auth.jwt() ->> 'email');
  elsif new.etapa is distinct from old.etapa then
    insert into public.lead_atividades (lead_id, tipo, texto, autor)
    values (new.id, 'etapa', 'Etapa alterada: ' || public._etapa_nome(old.etapa) || ' → ' || public._etapa_nome(new.etapa)
            || case when new.etapa in ('perdido','sem_interesse') and new.motivo_perda is not null then ' (' || new.motivo_perda || ')' else '' end,
            auth.jwt() ->> 'email');
  end if;
  return null;
end $$;
drop trigger if exists t_lead_historico on public.leads;
create trigger t_lead_historico after insert or update of etapa on public.leads
for each row execute function public.tg_lead_historico();

drop trigger if exists t_clientes_fone on public.clientes;
create or replace function public.tg_cliente_fone() returns trigger
language plpgsql as $$ begin new.telefone := public._fone(new.telefone); return new; end $$;
create trigger t_clientes_fone before insert or update of telefone on public.clientes
for each row execute function public.tg_cliente_fone();

-- total do pedido = subtotal - desconto + frete (nunca negativo)
create or replace function public.tg_pedido_total() returns trigger
language plpgsql as $$
begin
  new.total := greatest(0, coalesce(new.subtotal,0) - coalesce(new.desconto,0) + coalesce(new.frete,0));
  new.atualizado_em := now();
  return new;
end $$;
drop trigger if exists t_pedidos_total on public.pedidos;
create trigger t_pedidos_total before insert or update on public.pedidos
for each row execute function public.tg_pedido_total();

-- subtotal do pedido = soma dos itens
create or replace function public.tg_itens_recalc() returns trigger
language plpgsql as $$
declare pid uuid := coalesce(new.pedido_id, old.pedido_id);
begin
  update public.pedidos
     set subtotal = coalesce((select sum(subtotal) from public.pedido_itens where pedido_id = pid), 0)
   where id = pid;
  return null;
end $$;
drop trigger if exists t_itens_recalc on public.pedido_itens;
create trigger t_itens_recalc after insert or update or delete on public.pedido_itens
for each row execute function public.tg_itens_recalc();

-- Estoque: pedido criado baixa; cancelado devolve; "descancelado" baixa de novo
create or replace function public._mover_estoque(p_produto uuid, p_qtd int) returns void
language sql security definer set search_path = public as $$
  update public.produtos set estoque = greatest(estoque + p_qtd, 0)
   where id = p_produto and estoque is not null
$$;
revoke all on function public._mover_estoque(uuid, int) from public, anon, authenticated;

create or replace function public.tg_itens_estoque() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  select status into v_status from public.pedidos where id = coalesce(new.pedido_id, old.pedido_id);
  if v_status is distinct from 'cancelado' then
    if tg_op = 'INSERT' then perform public._mover_estoque(new.produto_id, -new.quantidade);
    else perform public._mover_estoque(old.produto_id, old.quantidade); end if;
  end if;
  return null;
end $$;
drop trigger if exists t_itens_estoque on public.pedido_itens;
create trigger t_itens_estoque after insert or delete on public.pedido_itens
for each row execute function public.tg_itens_estoque();

create or replace function public.tg_pedido_estoque() returns trigger
language plpgsql security definer set search_path = public as $$
declare i record;
begin
  if old.status <> 'cancelado' and new.status = 'cancelado' then
    for i in select * from public.pedido_itens where pedido_id = new.id loop perform public._mover_estoque(i.produto_id, i.quantidade); end loop;
  elsif old.status = 'cancelado' and new.status <> 'cancelado' then
    for i in select * from public.pedido_itens where pedido_id = new.id loop perform public._mover_estoque(i.produto_id, -i.quantidade); end loop;
  end if;
  return null;
end $$;
drop trigger if exists t_pedido_estoque on public.pedidos;
create trigger t_pedido_estoque after update of status on public.pedidos
for each row execute function public.tg_pedido_estoque();

-- ---------------------------------------------------------------------
-- 3. VIEWS
-- ---------------------------------------------------------------------

-- resumo do cliente: pedidos (sem cancelados), total gasto, último pedido, assinatura ativa
create or replace view public.clientes_resumo
with (security_invoker = true) as
select c.*,
       (select count(*) from public.pedidos p where p.cliente_id = c.id and p.status <> 'cancelado')                 as total_pedidos,
       (select coalesce(sum(p.total), 0) from public.pedidos p where p.cliente_id = c.id and p.status <> 'cancelado') as total_gasto,
       (select max(p.criado_em) from public.pedidos p where p.cliente_id = c.id)                                     as ultimo_pedido_em,
       (select coalesce(sum(a.valor), 0) from public.assinaturas a where a.cliente_id = c.id and a.status = 'ativa') as mensalidade
from public.clientes c;

-- ---------------------------------------------------------------------
-- 4. SEGURANÇA (RLS): só usuários logados no CRM acessam os dados
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['clientes','leads','lead_atividades','tarefas','produtos','produto_custos','pedidos','pedido_itens',
                           'assinaturas','assinatura_pagamentos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists equipe_total on public.%I', t);
    execute format('create policy equipe_total on public.%I for all to authenticated using (true) with check (true)', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
alter table public.agente_config enable row level security;   -- sem policy = ninguém lê pela API
revoke all on public.agente_config from anon, authenticated;
grant select on public.clientes_resumo to authenticated;
grant usage on sequence public.pedidos_numero_seq to authenticated;

-- ---------------------------------------------------------------------
-- 5. FUNÇÕES DO AGENTE DE WHATSAPP (n8n)  — POST /rest/v1/rpc/<funcao>
--    Todas exigem p_chave = agente_config.chave
-- ---------------------------------------------------------------------
create or replace function public._agente_validar(p_chave text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_chave is null or not exists (select 1 from public.agente_config where chave = p_chave) then
    raise exception 'chave do agente inválida' using errcode = '42501';
  end if;
end $$;
revoke all on function public._agente_validar(text) from public, anon, authenticated;

-- lead aberto mais recente do telefone (ou o mais recente de todos)
create or replace function public._lead_por_fone(p_tel text) returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.leads
   where telefone = public._fone(p_tel)
   order by (etapa not in ('ganho','perdido','sem_interesse')) desc, criado_em desc
   limit 1
$$;
revoke all on function public._lead_por_fone(text) from public, anon, authenticated;

-- Início da conversa: quem é esse contato? (lead, cliente e últimos pedidos)
create or replace function public.agente_buscar_contato(p_chave text, p_telefone text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_fone text := public._fone(p_telefone); v_lead uuid; v_cli uuid;
begin
  perform public._agente_validar(p_chave);
  v_lead := public._lead_por_fone(v_fone);
  select id into v_cli from public.clientes where telefone = v_fone;
  return jsonb_build_object(
    'lead', (select to_jsonb(l) - 'etapa_max' from public.leads l where l.id = v_lead),
    'cliente', (select to_jsonb(c) from public.clientes c where c.id = v_cli),
    'pedidos', coalesce((select jsonb_agg(jsonb_build_object('numero', p.numero, 'status', p.status, 'total', p.total, 'criado_em', p.criado_em,
                 'itens', (select jsonb_agg(jsonb_build_object('produto', i.produto, 'quantidade', i.quantidade)) from public.pedido_itens i where i.pedido_id = p.id))
                 order by p.criado_em desc)
                 from (select * from public.pedidos where cliente_id = v_cli order by criado_em desc limit 5) p), '[]'::jsonb));
end $$;

-- Cria ou atualiza o lead do telefone. Campos vazios não apagam dados.
-- p_dados: { telefone*, nome, email, empresa, cidade, interesse, valor, etapa, observacoes }
-- Lead novo do agente entra em "Em atendimento IA".
create or replace function public.agente_salvar_lead(p_chave text, p_dados jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_fone text := public._fone(p_dados->>'telefone'); v_id uuid; v_etapa text := nullif(p_dados->>'etapa', '');
begin
  perform public._agente_validar(p_chave);
  if v_fone is null then raise exception 'telefone obrigatório'; end if;
  if v_etapa is not null and public._etapa_nome(v_etapa) = v_etapa then raise exception 'etapa inválida: %', v_etapa; end if;
  v_id := public._lead_por_fone(v_fone);
  if v_id is not null and (select etapa from public.leads where id = v_id) in ('ganho','perdido','sem_interesse') and v_etapa is null then
    v_id := null;    -- negócio anterior já fechado: contato voltou, abre um lead novo
  end if;
  if v_id is null then
    -- nome: o informado, ou o que já se conhece desse telefone (cliente ou lead anterior)
    insert into public.leads (nome, telefone, email, empresa, cidade, interesse, valor, etapa, origem, observacoes, cliente_id)
    values (coalesce(nullif(trim(p_dados->>'nome'), ''),
                     (select nome from public.clientes where telefone = v_fone),
                     (select nome from public.leads where telefone = v_fone order by criado_em desc limit 1),
                     'Contato ' || right(v_fone, 4)), v_fone,
            nullif(lower(trim(p_dados->>'email')), ''), nullif(trim(p_dados->>'empresa'), ''), nullif(trim(p_dados->>'cidade'), ''),
            nullif(trim(p_dados->>'interesse'), ''), greatest(coalesce(nullif(p_dados->>'valor', '')::numeric, 0), 0),
            coalesce(v_etapa, 'ia'), 'agente', nullif(trim(p_dados->>'observacoes'), ''),
            (select id from public.clientes where telefone = v_fone))
    returning id into v_id;
  else
    update public.leads set
      nome = coalesce(nullif(trim(p_dados->>'nome'), ''), nome),
      email = coalesce(nullif(lower(trim(p_dados->>'email')), ''), email),
      empresa = coalesce(nullif(trim(p_dados->>'empresa'), ''), empresa),
      cidade = coalesce(nullif(trim(p_dados->>'cidade'), ''), cidade),
      interesse = coalesce(nullif(trim(p_dados->>'interesse'), ''), interesse),
      valor = coalesce(nullif(p_dados->>'valor', '')::numeric, valor),
      etapa = coalesce(v_etapa, etapa),
      observacoes = coalesce(nullif(trim(p_dados->>'observacoes'), ''), observacoes)
    where id = v_id;
  end if;
  return (select to_jsonb(l) - 'etapa_max' from public.leads l where l.id = v_id);
end $$;

-- Registra uma nota no histórico do lead (ex.: resumo da conversa, pedido de orçamento)
create or replace function public.agente_registrar_nota(p_chave text, p_telefone text, p_texto text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform public._agente_validar(p_chave);
  v_id := public._lead_por_fone(p_telefone);
  if v_id is null then raise exception 'lead não encontrado para esse telefone: use agente_salvar_lead antes'; end if;
  if coalesce(trim(p_texto), '') = '' then raise exception 'texto vazio'; end if;
  insert into public.lead_atividades (lead_id, tipo, texto) values (v_id, 'agente', left(trim(p_texto), 2000));
  return jsonb_build_object('ok', true, 'lead_id', v_id);
end $$;

-- Pede um atendente humano: move o lead para "Atendimento humano" (aparece no CRM em tempo real)
create or replace function public.agente_chamar_humano(p_chave text, p_telefone text, p_motivo text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform public._agente_validar(p_chave);
  v_id := public._lead_por_fone(p_telefone);
  if v_id is null then raise exception 'lead não encontrado para esse telefone: use agente_salvar_lead antes'; end if;
  update public.leads set etapa = 'humano' where id = v_id and etapa in ('novo','ia');
  if coalesce(trim(p_motivo), '') <> '' then
    insert into public.lead_atividades (lead_id, tipo, texto) values (v_id, 'agente', 'Pediu atendente: ' || left(trim(p_motivo), 1000));
  end if;
  return jsonb_build_object('ok', true, 'lead_id', v_id);
end $$;

-- Catálogo para o agente responder preços (só ativos)
create or replace function public.agente_listar_produtos(p_chave text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public._agente_validar(p_chave);
  return coalesce((select jsonb_agg(jsonb_build_object('nome', nome, 'categoria', categoria, 'preco', preco,
                                    'mensal', recorrente, 'descricao', descricao) order by categoria, preco)
                     from public.produtos where ativo and not excluido and (estoque is null or estoque > 0)), '[]'::jsonb);
end $$;

-- "Como está meu pedido?"
create or replace function public.agente_status_pedido(p_chave text, p_telefone text, p_numero int default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public._agente_validar(p_chave);
  return coalesce((select jsonb_agg(jsonb_build_object('numero', p.numero, 'status', p.status, 'total', p.total,
                     'codigo_rastreio', p.codigo_rastreio, 'prazo', p.prazo, 'criado_em', p.criado_em) order by p.criado_em desc)
                     from public.pedidos p join public.clientes c on c.id = p.cliente_id
                    where c.telefone = public._fone(p_telefone) and (p_numero is null or p.numero = p_numero)), '[]'::jsonb);
end $$;

do $$
declare f text;
begin
  foreach f in array array['agente_buscar_contato(text,text)','agente_salvar_lead(text,jsonb)','agente_registrar_nota(text,text,text)',
                           'agente_chamar_humano(text,text,text)','agente_listar_produtos(text)','agente_status_pedido(text,text,int)'] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end $$;

-- Para a tela "Agente WhatsApp" do CRM mostrar/gerar a chave (só logados)
create or replace function public.ver_chave_agente() returns text
language sql security definer set search_path = public as $$
  select chave from public.agente_config where id = 1 and auth.uid() is not null
$$;
create or replace function public.gerar_nova_chave_agente() returns text
language plpgsql security definer set search_path = public as $$
declare k text;
begin
  if auth.uid() is null then raise exception 'não autenticado'; end if;
  update public.agente_config set chave = encode(gen_random_bytes(24), 'hex') where id = 1 returning chave into k;
  return k;
end $$;
revoke all on function public.ver_chave_agente()        from public, anon;
revoke all on function public.gerar_nova_chave_agente() from public, anon;
grant execute on function public.ver_chave_agente()        to authenticated;
grant execute on function public.gerar_nova_chave_agente() to authenticated;

-- ---------------------------------------------------------------------
-- 6. TEMPO REAL: lead/pedido novo aparece no CRM sem recarregar
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['leads','lead_atividades','tarefas','pedidos','clientes','produtos','assinaturas'] loop
      begin execute format('alter publication supabase_realtime add table public.%I', t); exception when duplicate_object then null; end;
    end loop;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 7. CATÁLOGO INICIAL (preços do site; edite depois pelo CRM)
-- ---------------------------------------------------------------------
insert into public.produtos (nome, categoria, preco, recorrente, descricao)
select * from (values
  ('Plano Essencial',                     'Planos',            600.00, false, 'Cartão NFC + página personalizada'),
  ('Plano Profissional',                  'Planos',           1000.00, false, 'Cartões NFC + página completa'),
  ('Plano Fora de Órbita',                'Planos',           2000.00, false, 'Para grandes empresas'),
  ('Cartão NFC avulso',                   'Cartões NFC',         0.00, false, 'Defina o preço no CRM'),
  ('Cartão Google Avaliação',             'Google Avaliação',   60.00, false, '1 cartão de avaliação no Google'),
  ('Kit 2 Cartões Google Avaliação',      'Google Avaliação',  100.00, false, '2 cartões de avaliação no Google'),
  ('Espelho Instagramável',               'Espelhos',            0.00, false, 'Defina o preço no CRM'),
  ('Manutenção da página NFC (mensal)',   'Serviços',           89.90, true,  'Alterações ilimitadas, relatórios e suporte')
) v(nome, categoria, preco, recorrente, descricao)
where not exists (select 1 from public.produtos);

-- Faz a API do Supabase enxergar as tabelas/funções novas na hora
notify pgrst, 'reload schema';
