// =====================================================================
//  SATURNO NFC · CRM — Visão geral
// =====================================================================
'use strict';
async function viewDashboard() {
  const [leads, peds, tarefas, assin] = await Promise.all([cache.leads(true), cache.pedidos(true), cache.tarefas(true), API.assinaturas().catch(() => [])]);
  const mes = mesKey(Date.now()), hoje = hojeKey();
  const ok = peds.filter(contaVenda);
  const pedMes = ok.filter(p => mesKey(p.criado_em) === mes);
  const fatMes = pedMes.reduce((s, p) => s + +p.total, 0);
  const ativas = assin.filter(a => a.status === 'ativa');
  const mrr = ativas.reduce((s, a) => s + +a.valor, 0);
  const leadsMes = leads.filter(l => mesKey(l.criado_em) === mes);
  const ganhosMes = leads.filter(l => l.etapa === 'ganho' && mesKey(l.etapa_em) === mes);
  const fechados = leads.filter(l => ['ganho', 'perdido', 'sem_interesse'].includes(l.etapa));
  const conv = fechados.length ? Math.round(fechados.filter(l => l.etapa === 'ganho').length / fechados.length * 100) : 0;
  const abertos = peds.filter(p => PED_ABERTOS.includes(p.status));
  const pend = tarefas.filter(t => !t.feita && t.vence_em && t.vence_em <= dayKey(Date.now() + 864e5)).slice(0, 8);
  const chamando = leads.filter(l => l.etapa === 'humano' || l.etapa === 'novo').sort((a, b) => String(b.etapa_em).localeCompare(String(a.etapa_em))).slice(0, 6);
  const vencendo = ativas.filter(a => diasAte(a.proximo_vencimento) <= 5).slice(0, 6);
  const negociando = leads.filter(l => ETAPAS_ABERTAS.includes(l.etapa)).reduce((s, l) => s + +l.valor, 0);

  // faturamento por mês: pedidos + vendas ganhas que não viraram pedido (ex.: vindas do CRM antigo) + mensalidades recebidas
  const comPedido = new Set(peds.map(p => p.lead_id).filter(Boolean));
  const ganhosSemPedido = leads.filter(l => l.etapa === 'ganho' && +l.valor > 0 && !comPedido.has(l.id));
  const meses = mesesGrafico([...ok.map(p => p.criado_em), ...ganhosSemPedido.map(l => l.etapa_em)]);
  const pags = await API.pagamentosTodos(meses[0] + '-01T00:00:00Z').catch(() => []);

  $('#view').innerHTML = header('Visão geral', new Date().toLocaleDateString('pt-BR', {timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long'}),
    `<span class="live"><i></i>${DEMO ? 'Demonstração' : 'Ao vivo'}</span><button class="btn pri" id="dNovo">+ Novo lead</button>`) + `
    <div class="kpis">
      <div class="kpi hl"><span>Vendas no mês</span><b>${brl(fatMes)}</b><small>${pedMes.length} pedido${pedMes.length === 1 ? '' : 's'}</small></div>
      <a class="kpi" href="#assinaturas" style="color:inherit"><span>Receita recorrente</span><b>${brl(mrr)}</b><small>${ativas.length} assinatura${ativas.length === 1 ? '' : 's'} ativa${ativas.length === 1 ? '' : 's'}</small></a>
      <a class="kpi" href="#leads" style="color:inherit"><span>Leads no mês</span><b>${leadsMes.length}</b><small>${ganhosMes.length} ganho${ganhosMes.length === 1 ? '' : 's'} no mês</small></a>
      <div class="kpi"><span>Taxa de conversão</span><b>${conv}%</b><small>${brlCurto(negociando)} em negociação</small></div>
    </div>
    <div class="cols">
      <div class="card"><h3>Pedidos em andamento <a href="#pedidos" class="small">Ver todos →</a></h3>
        ${abertos.length ? `<div style="overflow:auto"><table style="min-width:520px"><tbody>${abertos.slice(0, 7).map(p => `
          <tr class="click" data-ped="${p.id}"><td class="strong sora">#${p.numero}</td>
          <td><b>${esc(p.clientes?.nome)}</b><div class="small mut trunc">${esc(itensResumo(p.pedido_itens))}</div></td>
          <td class="num r">${brl(p.total)}</td><td>${statusSelect(p)}</td><td class="small mut">${p.prazo ? `prazo ${dOnly(p.prazo)}` : ago(p.criado_em)}</td></tr>`).join('')}
        </tbody></table></div>` : '<div class="empty">Nenhum pedido em andamento</div>'}
      </div>
      <div class="card"><h3>Para fazer hoje <a href="#tarefas" class="small">Tarefas →</a></h3>
        <div id="dTk">${tarefasHTML(pend) || '<div class="empty">Nada pendente para hoje 🎉</div>'}</div>
      </div>
    </div>
    <div class="cols2">
      <div class="card"><h3>Leads esperando resposta <a href="#leads" class="small">Funil →</a></h3>
        ${chamando.map(l => `<div class="rank click" data-lead="${l.id}" style="cursor:pointer"><div class="av">${esc(initials(l.nome))}</div>
          <div class="grow"><b class="strong">${esc(l.nome)}</b><div class="small mut">${esc(l.empresa || l.interesse || ORIGEM[l.origem] || '')} · ${ago(l.etapa_em)}</div></div>
          ${etapaPill(l.etapa)}</div>`).join('') || '<div class="empty">Nenhum lead esperando</div>'}
      </div>
      <div class="card"><h3>Mensalidades a vencer <a href="#assinaturas" class="small">Assinaturas →</a></h3>
        ${vencendo.map(a => { const d = diasAte(a.proximo_vencimento); return `<div class="rank"><div class="av">${esc(initials(a.clientes?.nome))}</div>
          <div class="grow"><b class="strong">${esc(a.clientes?.nome || '—')}</b><div class="small mut">${esc(a.descricao)}</div></div>
          <div class="r"><b class="num">${brl(a.valor)}</b><div class="small ${d < 0 ? 'neg-txt' : 'mut'}">${d < 0 ? `venceu há ${-d} d` : d === 0 ? 'vence hoje' : `em ${d} d`}</div></div></div>`; }).join('') || '<div class="empty">Nenhuma mensalidade nos próximos 5 dias</div>'}
      </div>
    </div>
    <div class="cols2">
      <div class="card"><h3>Faturamento <span class="small mut">pedidos, vendas ganhas e mensalidades</span></h3><div id="dFat"></div></div>
      <div class="card"><h3>Vendas por categoria <span class="small mut">todos os pedidos</span></h3><div id="dCat"></div></div>
    </div>`;

  G.barras($('#dFat'), meses.map(m => ({k: mesNome(m), v: ok.filter(p => mesKey(p.criado_em) === m).reduce((s, p) => s + +p.total, 0)
      + ganhosSemPedido.filter(l => mesKey(l.etapa_em) === m).reduce((s, l) => s + +l.valor, 0)
      + pags.filter(p => mesKey(p.pago_em) === m).reduce((s, p) => s + +p.valor, 0)})),
    {fmt: v => brlCurto(v), nome: 'Faturamento'});
  const cat = {}; ok.forEach(p => (p.pedido_itens || []).forEach(i => { const k = i.categoria || 'Outros'; cat[k] = (cat[k] || 0) + i.quantidade * i.preco_unitario; }));
  G.horiz($('#dCat'), Object.entries(cat).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({k, v})), {fmt: brl, nome: 'Vendido'});

  $('#dNovo').onclick = () => formLead();
  document.querySelectorAll('[data-ped]').forEach(el => el.onclick = e => { if (!e.target.closest('select')) openPedido(el.dataset.ped); });
  document.querySelectorAll('[data-lead]').forEach(el => el.onclick = () => openLead(el.dataset.lead));
  bindTarefas($('#dTk'), tarefas, viewDashboard);
  bindSelects(() => setTimeout(viewDashboard, 400));
}
