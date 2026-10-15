-- =====================================================================
--  SATURNO NFC · CRM — assinaturas pagas pela STRIPE (Gestão Saturno)
--  Rode DEPOIS do schema.sql: Supabase > SQL Editor > New query > cole tudo > Run
--  (pode rodar mais de uma vez sem problema)
--  Guarda os ids da Stripe para a função "stripe" achar o cliente, a assinatura
--  e não registrar o mesmo pagamento duas vezes.
-- =====================================================================

alter table public.clientes              add column if not exists stripe_cliente_id    text unique;   -- cus_...
alter table public.assinaturas           add column if not exists stripe_assinatura_id text unique;   -- sub_...
alter table public.assinatura_pagamentos add column if not exists stripe_fatura_id     text unique;   -- in_...

notify pgrst, 'reload schema';
