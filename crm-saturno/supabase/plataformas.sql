-- =====================================================================
--  SATURNO NFC · CRM — plataformas (custos fixos mensais da Saturno)
--  Rode DEPOIS do schema.sql: Supabase > SQL Editor > New query > cole tudo > Run
--  (pode rodar mais de uma vez sem problema)
--  Assinaturas que a Saturno paga (Supabase, Easypanel, domínio, Canva...).
--  Cobrança anual entra no custo do mês dividida por 12.
-- =====================================================================

create table if not exists public.plataformas (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  categoria     text,
  valor         numeric(10,2) not null default 0 check (valor >= 0),
  ciclo         text not null default 'mensal' check (ciclo in ('mensal','anual')),
  ativo         boolean not null default true,
  link          text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

drop trigger if exists t_plataformas_upd on public.plataformas;
create trigger t_plataformas_upd before update on public.plataformas
for each row execute function public.tg_atualizado_em();

alter table public.plataformas enable row level security;
drop policy if exists equipe_total on public.plataformas;
create policy equipe_total on public.plataformas for all to authenticated using (true) with check (true);
revoke all on public.plataformas from anon;
grant select, insert, update, delete on public.plataformas to authenticated;

notify pgrst, 'reload schema';
