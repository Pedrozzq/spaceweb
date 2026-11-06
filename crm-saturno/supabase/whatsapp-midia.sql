-- =====================================================================
--  SATURNO NFC · CRM
--  WhatsApp: imagens e áudios dentro do chat
--  Rode DEPOIS do whatsapp.sql: Supabase > SQL Editor > New query > cole tudo > Run
--  (pode rodar mais de uma vez sem problema)
-- =====================================================================

alter table public.wa_mensagens add column if not exists midia_path text;   -- caminho no bucket wa-midia
alter table public.wa_mensagens add column if not exists midia_mime text;

-- Bucket privado: os arquivos só abrem com link temporário, gerado para quem está logado
insert into storage.buckets (id, name, public, file_size_limit)
values ('wa-midia', 'wa-midia', false, 16777216)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

-- A equipe logada só lê. Quem grava é a Edge Function (service role).
drop policy if exists wa_midia_equipe_le on storage.objects;
create policy wa_midia_equipe_le on storage.objects for select to authenticated
  using (bucket_id = 'wa-midia');
