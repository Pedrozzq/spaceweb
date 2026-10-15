-- =====================================================================
--  SATURNO NFC · CRM — tira as etapas "Reunião agendada" e "Sem interesse"
--  Rode uma vez no SQL Editor do Supabase (pode rodar de novo sem problema).
-- =====================================================================

-- 1) leads que estavam nessas etapas vão para a etapa equivalente
update public.leads set etapa = 'proposta' where etapa = 'reuniao';
update public.leads set etapa = 'perdido'  where etapa = 'sem_interesse';

-- 2) daqui pra frente: se alguém (ex.: o agente do n8n) mandar uma etapa antiga,
--    o banco converte sozinho antes de gravar
create or replace function public._etapa_atual() returns trigger
language plpgsql as $$
begin
  if new.etapa = 'reuniao' then new.etapa := 'proposta'; end if;
  if new.etapa = 'sem_interesse' then new.etapa := 'perdido'; end if;
  return new;
end $$;

drop trigger if exists leads_etapa_atual on public.leads;
create trigger leads_etapa_atual before insert or update of etapa on public.leads
  for each row execute function public._etapa_atual();
