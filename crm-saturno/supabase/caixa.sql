-- =====================================================================
--  SATURNO NFC · FLUXO DE CAIXA (seção "Fluxo de caixa" da CRM)
--  Rode DEPOIS do schema.sql (Supabase > SQL Editor > New query > cole > Run).
--  Pode rodar de novo: não apaga nada.
--
--  A CRM já soma sozinha as entradas (pedidos, vendas ganhas e mensalidades recebidas)
--  e o custo das plataformas ativas como saída. Esta tabela guarda o resto:
--  produção, fornecedores, frete, impostos, retiradas de pró-labore, aportes etc.
--  Só a equipe logada vê e edita.
-- =====================================================================

create table if not exists public.caixa_lancamentos (
  id          uuid primary key default gen_random_uuid(),
  data        date not null default (now() at time zone 'America/Sao_Paulo')::date,
  tipo        text not null check (tipo in ('entrada', 'saida')),
  categoria   text not null check (length(trim(categoria)) > 0),
  descricao   text,
  valor       numeric(12,2) not null check (valor > 0),
  forma       text,                     -- Pix, dinheiro, cartão, boleto, transferência
  criado_por  text,
  criado_em   timestamptz not null default now()
);
create index if not exists caixa_lancamentos_data_idx on public.caixa_lancamentos (data desc);

alter table public.caixa_lancamentos enable row level security;
drop policy if exists equipe_total on public.caixa_lancamentos;
create policy equipe_total on public.caixa_lancamentos for all to authenticated using (true) with check (true);
revoke all on public.caixa_lancamentos from anon;
grant select, insert, update, delete on public.caixa_lancamentos to authenticated;
grant all on public.caixa_lancamentos to service_role;

-- tempo real: lançamento feito por um aparece na hora para os outros
do $$ begin
  alter publication supabase_realtime add table public.caixa_lancamentos;
exception when duplicate_object then null; when undefined_object then null;
end $$;

notify pgrst, 'reload schema';
