-- =====================================================================
--  SATURNO NFC · CRM
--  Pedido feito no site: cadastra o cliente e abre o lead no funil
--  Rode DEPOIS do schema.sql (pode rodar mais de uma vez sem problema)
--
--  O site chama esta função sem login, então ela:
--  - só aceita os campos abaixo e nunca devolve dados do banco;
--  - nunca sobrescreve os dados de um cliente que já existe, só completa o que está vazio;
--  - para de aceitar depois de 60 pedidos do site na mesma hora (proteção contra robôs).
--
--  p_dados: { nome*, empresa, telefone*, pedido*, valor }
-- =====================================================================
create or replace function public.site_registrar_pedido(p_dados jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_nome    text := left(trim(p_dados->>'nome'), 60);
  v_empresa text := nullif(left(trim(p_dados->>'empresa'), 80), '');
  v_pedido  text := left(trim(p_dados->>'pedido'), 300);
  v_fone    text := public._fone(left(p_dados->>'telefone', 30));
  v_valor   numeric := case when jsonb_typeof(p_dados->'valor') = 'number'
                            then least(greatest((p_dados->>'valor')::numeric, 0), 99999) else 0 end;
  v_cliente uuid;
  v_lead    uuid;
  v_antes   text;
begin
  if length(coalesce(v_nome, '')) < 2 or coalesce(v_pedido, '') = ''
     or v_fone is null or v_fone !~ '^55[0-9]{10,11}$' then
    return jsonb_build_object('ok', false, 'erro', 'dados inválidos');
  end if;
  if (select count(*) from public.leads where origem = 'site' and criado_em > now() - interval '1 hour') >= 60 then
    return jsonb_build_object('ok', false, 'erro', 'limite atingido');
  end if;

  insert into public.clientes (nome, telefone, empresa, origem)
  values (v_nome, v_fone, v_empresa, 'site')
  on conflict (telefone) do update set empresa = coalesce(public.clientes.empresa, excluded.empresa)
  returning id into v_cliente;

  -- conversa em aberto desse telefone: atualiza; negócio já encerrado: abre outro
  v_lead := public._lead_por_fone(v_fone);
  if v_lead is not null and (select etapa from public.leads where id = v_lead) in ('ganho','perdido','sem_interesse') then
    v_lead := null;
  end if;

  if v_lead is null then
    insert into public.leads (nome, telefone, empresa, interesse, valor, etapa, origem, cliente_id)
    values (v_nome, v_fone, v_empresa, v_pedido, v_valor, 'novo', 'site', v_cliente)
    returning id into v_lead;
  else
    select interesse into v_antes from public.leads where id = v_lead;
    update public.leads set
      empresa = coalesce(empresa, v_empresa),
      interesse = v_pedido,
      valor = v_valor,
      cliente_id = coalesce(cliente_id, v_cliente)
    where id = v_lead;
  end if;

  if v_antes is distinct from v_pedido then
    insert into public.lead_atividades (lead_id, tipo, texto) values (v_lead, 'nota', 'Pedido pelo site: ' || v_pedido);
  end if;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.site_registrar_pedido(jsonb) from public;
grant execute on function public.site_registrar_pedido(jsonb) to anon, authenticated;
