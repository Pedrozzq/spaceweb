-- =====================================================================
--  SATURNO NFC · CRM — pedidos pagos pelo site (Mercado Pago, Checkout Pro)
--  Rode DEPOIS do schema.sql e do site-pedidos.sql:
--  Supabase > SQL Editor > New query > cole tudo > Run (pode rodar mais de uma vez)
--
--  Só a função "mercadopago" (service role) lê e grava esta tabela: o RLS fica
--  ligado e sem nenhuma permissão para o site ou para usuários sem login.
-- =====================================================================
create table if not exists public.mp_pedidos (
  id             uuid primary key default gen_random_uuid(),   -- vai como external_reference
  nome           text not null,
  empresa        text not null,
  pedido         text not null,
  cartoes        integer not null default 0 check (cartoes between 0 and 200),
  tags           integer not null default 0 check (tags between 0 and 200),
  crm            boolean not null default false,
  valor          numeric(10,2) not null check (valor > 0),     -- calculado no servidor
  lead_id        uuid references public.leads(id) on delete set null,
  preference_id  text,
  pagamento_id   text,
  status         text not null default 'aberto',               -- aberto ou o status do Mercado Pago
  email          text,                                         -- informado no site antes do pagamento
  telefone       text,                                         -- só dígitos, com DDD
  cep            text,
  endereco       text,                                         -- rua, número, complemento e bairro
  cidade         text,
  uf             text,
  pagador_email  text,
  pagador_nome   text,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);
alter table public.mp_pedidos add column if not exists email text;
alter table public.mp_pedidos add column if not exists telefone text;
alter table public.mp_pedidos add column if not exists cep text;
alter table public.mp_pedidos add column if not exists endereco text;
alter table public.mp_pedidos add column if not exists cidade text;
alter table public.mp_pedidos add column if not exists uf text;
-- chaveiro NFC (R$ 30 cada), desde 2026-11-11
alter table public.mp_pedidos add column if not exists chaveiros integer not null default 0 check (chaveiros between 0 and 200);

create index if not exists mp_pedidos_criado_idx on public.mp_pedidos (criado_em desc);

alter table public.mp_pedidos enable row level security;
revoke all on table public.mp_pedidos from anon, authenticated;

notify pgrst, 'reload schema';
