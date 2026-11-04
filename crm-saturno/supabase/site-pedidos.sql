-- =====================================================================
--  SATURNO NFC · CRM
--  Pedido feito no site: cadastra o cliente e abre o lead no funil
--  Rode DEPOIS do schema.sql (pode rodar mais de uma vez sem problema)
--
--  O site só pede nome e empresa, então o cliente entra sem telefone.
--  Mesmo nome e mesma empresa contam como a mesma pessoa.
--
--  O site chama esta função sem login, então ela:
--  - só aceita os campos abaixo e nunca devolve dados do banco;
--  - nunca altera os dados de um cliente que já existe;
--  - para de aceitar depois de 60 pedidos do site na mesma hora (proteção contra robôs).
--
--  p_dados: { nome*, empresa*, pedido*, valor }
-- =====================================================================
create or replace function public.site_registrar_pedido(p_dados jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_nome    text := left(trim(p_dados->>'nome'), 60);
  v_empresa text := left(trim(p_dados->>'empresa'), 80);
  v_pedido  text := left(trim(p_dados->>'pedido'), 300);
  v_valor   numeric := case when jsonb_typeof(p_dados->'valor') = 'number'
                            then least(greatest((p_dados->>'valor')::numeric, 0), 99999) else 0 end;
  v_cliente uuid;
  v_lead    uuid;
  v_antes   text;
begin
  if length(coalesce(v_nome, '')) < 2 or length(coalesce(v_empresa, '')) < 2 or coalesce(v_pedido, '') = '' then
    return jsonb_build_object('ok', false, 'erro', 'dados inválidos');
  end if;
  if (select count(*) from public.leads where origem = 'site' and criado_em > now() - interval '1 hour') >= 60 then
    return jsonb_build_object('ok', false, 'erro', 'limite atingido');
  end if;

  select id into v_cliente from public.clientes
   where lower(nome) = lower(v_nome) and lower(empresa) = lower(v_empresa)
   order by criado_em limit 1;
  if v_cliente is null then
    insert into public.clientes (nome, empresa, origem) values (v_nome, v_empresa, 'site')
    returning id into v_cliente;
  end if;

  -- negociação do site ainda em aberto para esse cliente: atualiza; senão abre outra
  select id, interesse into v_lead, v_antes from public.leads
   where cliente_id = v_cliente and origem = 'site' and etapa not in ('ganho','perdido','sem_interesse')
   order by criado_em desc limit 1;

  if v_lead is null then
    insert into public.leads (nome, empresa, interesse, valor, etapa, origem, cliente_id)
    values (v_nome, v_empresa, v_pedido, v_valor, 'novo', 'site', v_cliente)
    returning id into v_lead;
  else
    update public.leads set interesse = v_pedido, valor = v_valor where id = v_lead;
  end if;

  if v_antes is distinct from v_pedido then
    insert into public.lead_atividades (lead_id, tipo, texto) values (v_lead, 'nota', 'Pedido pelo site: ' || v_pedido);
  end if;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.site_registrar_pedido(jsonb) from public;
grant execute on function public.site_registrar_pedido(jsonb) to anon, authenticated;
