// =====================================================================
//  SATURNO NFC · CRM — Leads e funil: Tabela, Kanban, Relatórios,
//  histórico e tarefas de cada lead, importação de CSV e tela de Tarefas
// =====================================================================
'use strict';
const LD = {aba: 'tabela', q: '', etapa: 'todas', mes: 'todos', origem: 'todas', kpi: null, ord: {col: 'criado_em', dir: -1}};
try { LD.aba = localStorage.getItem('saturno_aba_leads') || 'tabela'; } catch {}

// filtros da barra (busca, etapa, mês de criação, origem) + atalho dos cartões do topo
function filtrarLeads(leads) {
  const q = LD.q.trim().toLowerCase(), qd = q.replace(/\D/g, '');
  return leads.filter(l =>
    (!q || `${l.nome} ${l.empresa || ''} ${l.cidade || ''} ${l.email || ''} ${l.interesse || ''} ${ETAPA[l.etapa]}`.toLowerCase().includes(q) || (qd.length > 3 && String(l.telefone || '').includes(qd))) &&
    (LD.etapa === 'todas' || (LD.etapa === 'abertas' ? ETAPAS_ABERTAS.includes(l.etapa) : l.etapa === LD.etapa)) &&
    (LD.mes === 'todos' || mesKey(l.criado_em) === LD.mes) &&
    (LD.origem === 'todas' || l.origem === LD.origem));
}

async function viewLeads() {
  const [leads, tarefas] = await Promise.all([cache.leads(true), cache.tarefas(true)]);
  const meses = [...new Set(leads.map(l => mesKey(l.criado_em)))].sort().reverse();
  const origens = [...new Set(leads.map(l => l.origem))];
  const ganhos = leads.filter(l => l.etapa === 'ganho'), perdidos = leads.filter(l => ['perdido', 'sem_interesse'].includes(l.etapa));
  const pend = tarefas.filter(t => !t.feita).length;

  $('#view').innerHTML = header('Leads e funil', 'Cada contato interessado, do primeiro "oi" até a venda',
    `<button class="btn" id="ldImp">${IC.up}Importar CSV</button><button class="btn" id="ldCsv">${IC.csv}Exportar CSV</button><button class="btn pri" id="ldNovo">+ Novo lead</button>`) + `
    <div class="kpis">
      <button class="kpi ${LD.etapa === 'todas' ? 'on' : ''}" data-kf="todas"><span>Total de leads</span><b>${leads.length}</b><small>${leads.filter(l => ETAPAS_ABERTAS.includes(l.etapa)).length} em andamento</small></button>
      <button class="kpi ${LD.etapa === 'ganho' ? 'on' : ''}" data-kf="ganho"><span>Ganhos</span><b>${ganhos.length}</b><small>vendas fechadas</small></button>
      <button class="kpi ${LD.etapa === 'perdido' ? 'on' : ''}" data-kf="perdido"><span>Perdidos</span><b>${perdidos.length}</b><small>incl. sem interesse</small></button>
      <div class="kpi"><span>Faturamento ganho</span><b>${brl(ganhos.reduce((s, l) => s + +l.valor, 0))}</b><small>soma dos leads ganhos</small></div>
      <a class="kpi" href="#tarefas" style="color:inherit"><span>Tarefas pendentes</span><b>${pend}</b><small>${tarefas.filter(t => !t.feita && t.vence_em && t.vence_em < hojeKey()).length} atrasadas</small></a>
    </div>
    <div class="bar">
      <div class="search">${ICON_SEARCH}<input class="in" id="ldQ" placeholder="Buscar por nome, empresa, cidade, etapa…" value="${esc(LD.q)}"></div>
      <select class="in" id="ldEtapa"><option value="todas">Todas as etapas</option><option value="abertas">Em andamento</option>${ETAPAS.map(e => `<option value="${e.k}">${e.t}</option>`).join('')}</select>
      <select class="in" id="ldMes"><option value="todos">Todos os meses</option>${meses.map(m => `<option value="${m}">${mesLongo(m)}</option>`).join('')}</select>
      <select class="in" id="ldOrig"><option value="todas">Todas as origens</option>${origens.map(o => `<option value="${o}">${ORIGEM[o] || o}</option>`).join('')}</select>
    </div>
    <div class="bar"><div class="tabs" id="ldTabs">${[['tabela', 'Tabela'], ['kanban', 'Kanban'], ['relatorios', 'Relatórios']].map(([k, t]) => `<button data-aba="${k}" class="${LD.aba === k ? 'on' : ''}">${t}</button>`).join('')}</div>
      <span class="small mut" id="ldCount"></span></div>
    <div id="ldBody"></div>`;
  $('#ldEtapa').value = LD.etapa; $('#ldMes').value = meses.includes(LD.mes) ? LD.mes : (LD.mes = 'todos'); $('#ldOrig').value = origens.includes(LD.origem) ? LD.origem : (LD.origem = 'todas');

  const corpo = () => {
    const list = filtrarLeads(leads);
    $('#ldCount').textContent = `${list.length} lead${list.length === 1 ? '' : 's'}${list.length !== leads.length ? ` de ${leads.length}` : ''}`;
    if (LD.aba === 'kanban') renderKanban(list); else if (LD.aba === 'relatorios') renderRelatorios(list, leads); else renderTabelaLeads(list);
  };
  corpo();
  $('#ldQ').oninput = debounce(e => { LD.q = e.target.value; corpo(); });
  $('#ldEtapa').onchange = e => { LD.etapa = e.target.value; viewLeads(); };
  $('#ldMes').onchange = e => { LD.mes = e.target.value; corpo(); };
  $('#ldOrig').onchange = e => { LD.origem = e.target.value; corpo(); };
  document.querySelectorAll('[data-kf]').forEach(b => b.onclick = () => { LD.etapa = LD.etapa === b.dataset.kf ? 'todas' : b.dataset.kf; viewLeads(); });
  document.querySelectorAll('#ldTabs [data-aba]').forEach(b => b.onclick = () => {
    LD.aba = b.dataset.aba; try { localStorage.setItem('saturno_aba_leads', LD.aba); } catch {}
    document.querySelectorAll('#ldTabs button').forEach(x => x.classList.toggle('on', x === b)); corpo();
  });
  $('#ldNovo').onclick = () => formLead();
  $('#ldImp').onclick = importarCsv;
  $('#ldCsv').onclick = () => {
    const list = filtrarLeads(leads);
    baixarCsv('leads-saturno-nfc.csv', ['Criado', 'Nome', 'Empresa', 'Interesse', 'Telefone', 'E-mail', 'Cidade', 'Valor', 'Etapa', 'Origem', 'Motivo da perda', 'Observações'],
      list.map(l => [dOnly(l.criado_em), l.nome, l.empresa, l.interesse, fmtFone(l.telefone), l.email, l.cidade, fmtNum(l.valor), ETAPA[l.etapa], ORIGEM[l.origem] || l.origem, l.motivo_perda, l.observacoes]));
  };
}

// ------------------------------------------------------------------ TABELA
function renderTabelaLeads(list) {
  const {col, dir} = LD.ord;
  const val = l => col === 'valor' ? +l.valor : col === 'etapa' ? (ETAPAS.findIndex(e => e.k === l.etapa)) : String(l[col] || '').toLowerCase();
  list = [...list].sort((a, b) => (val(a) > val(b) ? 1 : val(a) < val(b) ? -1 : 0) * dir);
  const th = (c, t, cls = '') => `<th class="sort ${cls}" data-ord="${c}">${t}${col === c ? (dir > 0 ? ' ↑' : ' ↓') : ''}</th>`;
  $('#ldBody').innerHTML = `<div class="tbl-wrap"><table>
    <thead><tr>${th('nome', 'Nome')}${th('criado_em', 'Criado')}${th('empresa', 'Empresa')}<th>Interesse</th><th>Telefone</th>${th('cidade', 'Cidade')}${th('valor', 'Valor', 'r')}${th('etapa', 'Etapa')}<th class="r">Ações</th></tr></thead>
    <tbody>${list.map(l => `<tr class="click" data-lead="${l.id}">
      <td><div class="who"><div class="av">${esc(initials(l.nome))}</div><div><b class="trunc">${esc(l.nome)}</b><span class="small mut">${esc(ORIGEM[l.origem] || l.origem)}</span></div></div></td>
      <td class="small mut">${dOnly(l.criado_em)}</td>
      <td class="trunc">${esc(l.empresa || '—')}</td>
      <td class="small">${esc(l.interesse || '—')}</td>
      <td class="num small">${l.telefone ? esc(fmtFone(l.telefone)) : '—'}</td>
      <td class="small">${esc(l.cidade || '—')}</td>
      <td class="num r strong">${+l.valor ? brl(l.valor) : '<span class="mut">—</span>'}</td>
      <td>${etapaSelect(l)}</td>
      <td class="r"><span class="acts-cell">
        <button class="btn sm ghost ic" data-hist="${l.id}" title="Histórico e tarefas">${IC.hist}</button>
        ${l.telefone ? `<a class="btn sm ghost ic wa-btn" href="#whatsapp?tel=${esc(l.telefone)}" title="Conversar no WhatsApp">${IC.wa}</a>` : ''}
        <button class="btn sm ghost ic" data-ed="${l.id}" title="Editar">${IC.edit}</button>
        <button class="btn sm ghost ic danger" data-del="${l.id}" title="Excluir">${IC.lixo}</button></span></td></tr>`).join('')}</tbody>
  </table>${list.length ? '' : '<div class="empty">Nenhum lead encontrado</div>'}</div>`;
  const body = $('#ldBody');
  body.querySelectorAll('[data-ord]').forEach(t => t.onclick = () => { LD.ord = {col: t.dataset.ord, dir: LD.ord.col === t.dataset.ord ? -LD.ord.dir : 1}; renderTabelaLeads(list); });
  body.querySelectorAll('tr[data-lead]').forEach(tr => tr.onclick = e => { if (e.target.closest('select,button,a')) return; openLead(tr.dataset.lead); });
  body.querySelectorAll('[data-hist]').forEach(b => b.onclick = () => openLead(b.dataset.hist));
  body.querySelectorAll('[data-ed]').forEach(b => b.onclick = async () => formLead(list.find(l => l.id === b.dataset.ed)));
  body.querySelectorAll('[data-del]').forEach(b => b.onclick = () => excluirLead(list.find(l => l.id === b.dataset.del)));
  bindSelects(() => setTimeout(viewLeads, 300));
}

async function excluirLead(l) {
  if (!confirm(`Excluir o lead "${l.nome}"? O histórico e as tarefas dele também saem.`)) return;
  try { await API.excluirLead(l.id); toast('Lead excluído'); cache.clear(); fecharModais(); route(true); } catch (e) { toast(e.message, true); }
}

// ------------------------------------------------------------------ KANBAN (arrastar e soltar; no celular, menu "Mover para")
function renderKanban(list) {
  const cols = LD.etapa === 'todas' || LD.etapa === 'abertas' ? ETAPAS : ETAPAS.filter(e => e.k === LD.etapa);
  $('#ldBody').innerHTML = `<div class="kanban">${cols.map(e => {
    const it = list.filter(l => l.etapa === e.k).sort((a, b) => String(b.etapa_em).localeCompare(String(a.etapa_em)));
    const soma = it.reduce((s, l) => s + +l.valor, 0);
    return `<section class="k-col e-${e.k}" data-col="${e.k}">
      <div class="k-head">${etapaPill(e.k)}<span class="small mut">${it.length}</span><span class="k-sum">${soma ? brlCurto(soma) : ''}</span></div>
      <div class="k-list">${it.map(l => `<article class="k-card e-${l.etapa}" draggable="true" data-kc="${l.id}">
          <b>${esc(l.nome)}</b>
          <div class="k-sub">${esc([l.empresa, l.cidade].filter(Boolean).join(' · ') || '—')}</div>
          ${l.interesse ? `<div class="k-sub">“${esc(l.interesse)}”</div>` : ''}
          <div class="k-foot"><span class="small mut">${ago(l.etapa_em)}</span>${l.motivo_perda && !ETAPAS_ABERTAS.includes(l.etapa) ? `<span class="tag">${esc(l.motivo_perda)}</span>` : ''}
            <span class="k-val">${+l.valor ? brl(l.valor) : ''}</span></div>
          <div class="k-move"><select class="in" data-mv="${l.id}" aria-label="Mover ${esc(l.nome)} para">${ETAPAS.map(x => `<option value="${x.k}" ${x.k === l.etapa ? 'selected' : ''}>${x.k === l.etapa ? 'Mover para…' : x.t}</option>`).join('')}</select></div>
        </article>`).join('') || '<div class="k-empty">Arraste um lead para cá</div>'}</div></section>`;
  }).join('')}</div>`;

  const body = $('#ldBody');
  let arrastando = null;
  body.querySelectorAll('[data-kc]').forEach(c => {
    c.addEventListener('dragstart', e => { arrastando = c.dataset.kc; c.classList.add('drag'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', arrastando); });
    c.addEventListener('dragend', () => { c.classList.remove('drag'); body.querySelectorAll('.k-col').forEach(x => x.classList.remove('drop')); });
    c.addEventListener('click', e => { if (e.target.closest('select')) return; openLead(c.dataset.kc); });
  });
  body.querySelectorAll('[data-col]').forEach(col => {
    col.addEventListener('dragover', e => { if (!arrastando) return; e.preventDefault(); col.classList.add('drop'); });
    col.addEventListener('dragleave', e => { if (!col.contains(e.relatedTarget)) col.classList.remove('drop'); });
    col.addEventListener('drop', async e => {
      e.preventDefault(); col.classList.remove('drop');
      const id = arrastando; arrastando = null;
      const l = list.find(x => x.id === id); if (!l || l.etapa === col.dataset.col) return;
      // move na tela na hora; se não salvar, volta
      const card = body.querySelector(`[data-kc="${id}"]`); col.querySelector('.k-list').prepend(card); col.querySelector('.k-empty')?.remove();
      if (await mudarEtapa(id, col.dataset.col)) { l.etapa = col.dataset.col; }
      viewLeads();
    });
  });
  body.querySelectorAll('[data-mv]').forEach(s => s.onchange = async () => { if (await mudarEtapa(s.dataset.mv, s.value)) {} viewLeads(); });
}

// muda a etapa; perdido pede o motivo; ganho oferece virar cliente + pedido. Devolve true se salvou.
async function mudarEtapa(id, nova) {
  const l = (await cache.leads()).find(x => x.id === id) || await API.lead(id);
  if (!l || l.etapa === nova) return false;
  let patch = {etapa: nova};
  if (nova === 'perdido' || nova === 'sem_interesse') {
    const motivo = await perguntarMotivo(l, nova); if (motivo === null) return false;
    patch.motivo_perda = motivo || null;
  }
  try {
    await API.atualizarLead(id, patch); cache.clear();
    toast(`${l.nome}: ${ETAPA[nova]}`);
    if (nova === 'ganho' && !l.cliente_id) setTimeout(() => oferecerConversao({...l, etapa: nova}), 150);
    atualizarContadores();
    return true;
  } catch (e) { toast(e.message, true); return false; }
}

function perguntarMotivo(l, etapa) {
  return new Promise(ok => {
    let fim = false;
    const ov = modal(`<form id="fmot"><div class="dh"><h2>${etapa === 'perdido' ? 'Lead perdido' : 'Sem interesse'}: ${esc(l.nome)}</h2><button type="button" class="x" data-close>${ICON_X}</button></div>
      <div class="db"><label class="f"><span>Motivo (ajuda a entender o que melhorar)</span>
        <select class="in" name="m"><option value="">Não informar</option>${MOTIVOS_PERDA.map(m => `<option ${m === l.motivo_perda ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
        <label class="f"><span>Detalhe (opcional)</span><input class="in" name="d" maxlength="120" placeholder="Ex.: achou caro o plano Profissional"></label></div>
      <div class="df"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn pri">Confirmar</button></div></form>`, true);
    const obs = new MutationObserver(() => { if (!document.body.contains(ov)) { obs.disconnect(); if (!fim) ok(null); } });
    obs.observe(document.body, {childList: true});
    ov.querySelector('#fmot').onsubmit = e => { e.preventDefault(); fim = true; const f = e.target; ok([f.m.value, f.d.value.trim()].filter(Boolean).join(': ')); ov.fechar(); };
  });
}

// lead ganho: cria (ou liga) o cliente e abre o pedido já com o produto de interesse
function oferecerConversao(l) {
  const ov = modal(`<div class="dh"><h2>Venda fechada! 🎉</h2><button class="x" data-close>${ICON_X}</button></div>
    <div class="db"><p><b>${esc(l.nome)}</b>${l.empresa ? ` · ${esc(l.empresa)}` : ''} virou um negócio ganho${+l.valor ? ` de <b>${brl(l.valor)}</b>` : ''}.</p>
      <p class="mut small" style="margin-top:8px">Cadastre como cliente para registrar o pedido, acompanhar a produção e a assinatura mensal.</p></div>
    <div class="df"><button class="btn ghost" data-close>Agora não</button><button class="btn" id="cvSo">Só criar o cliente</button><button class="btn pri" id="cvPed">Criar cliente e pedido</button></div>`, true);
  const ir = async comPedido => {
    try { const c = await converterEmCliente(l); ov.fechar(); toast(`${c.nome} agora é cliente`); cache.clear();
      if (comPedido) formPedido(c.id, {lead: l}); else route(true); }
    catch (e) { toast(e.message, true); }
  };
  ov.querySelector('#cvSo').onclick = () => ir(false);
  ov.querySelector('#cvPed').onclick = () => ir(true);
}
async function converterEmCliente(l) {
  const clis = await API.clientes();
  let c = (l.cliente_id && clis.find(x => x.id === l.cliente_id)) || (l.telefone && clis.find(x => x.telefone === normFone(l.telefone)));
  if (!c) c = await API.salvarCliente({nome: l.nome, telefone: normFone(l.telefone) || null, email: l.email || null, empresa: l.empresa || null,
    cidade: l.cidade || null, observacoes: l.observacoes || null, origem: ['whatsapp', 'site', 'instagram', 'indicacao', 'google', 'agente'].includes(l.origem) ? l.origem : 'manual', tags: []});
  if (l.cliente_id !== c.id) await API.atualizarLead(l.id, {cliente_id: c.id});
  await API.registrarNota(l.id, `Convertido em cliente: ${c.nome}`, 'pedido').catch(() => {});
  return c;
}

// ------------------------------------------------------------------ RELATÓRIOS
function renderRelatorios(list, todos) {
  const ganhos = list.filter(l => l.etapa === 'ganho'), perdidos = list.filter(l => ['perdido', 'sem_interesse'].includes(l.etapa));
  const fechados = ganhos.length + perdidos.length;
  const fat = ganhos.reduce((s, l) => s + +l.valor, 0);
  const ciclo = ganhos.length ? ganhos.reduce((s, l) => s + Math.max(0, Date.parse(l.etapa_em) - Date.parse(l.criado_em)), 0) / ganhos.length / 864e5 : 0;
  const aberto = list.filter(l => ETAPAS_ABERTAS.includes(l.etapa)).reduce((s, l) => s + +l.valor, 0);
  // últimos 6 meses (sempre do total, não do filtro de mês)
  const base = LD.mes === 'todos' ? list : todos.filter(l => (LD.etapa === 'todas' || l.etapa === LD.etapa || (LD.etapa === 'abertas' && ETAPAS_ABERTAS.includes(l.etapa))) && (LD.origem === 'todas' || l.origem === LD.origem));
  const meses = []; for (let i = 5; i >= 0; i--) { const d = new Date(); d.setDate(15); d.setMonth(d.getMonth() - i); meses.push(mesKey(d)); }

  $('#ldBody').innerHTML = `
    <div class="kpis">
      <div class="kpi hl"><span>Taxa de conversão</span><b>${fechados ? Math.round(ganhos.length / fechados * 100) : 0}%</b><small>${ganhos.length} de ${fechados} fechados</small></div>
      <div class="kpi"><span>Faturamento (ganho)</span><b>${brl(fat)}</b><small>${ganhos.length} vendas</small></div>
      <div class="kpi"><span>Ticket médio</span><b>${brl(ganhos.length ? fat / ganhos.length : 0)}</b><small>por venda</small></div>
      <div class="kpi"><span>Em negociação</span><b>${brl(aberto)}</b><small>${list.filter(l => ETAPAS_ABERTAS.includes(l.etapa)).length} leads abertos</small></div>
      <div class="kpi"><span>Ciclo de venda</span><b>${ciclo ? Math.round(ciclo) + ' dias' : '—'}</b><small>do lead à venda (média)</small></div>
    </div>
    <div class="cols2">
      <div class="card"><h3>Leads por etapa do funil</h3><div id="grEtapa"></div></div>
      <div class="card"><h3>Funil de conversão <span class="small mut">leads que chegaram a cada etapa</span></h3><div id="grFunil"></div></div>
    </div>
    <div class="cols2">
      <div class="card"><h3>Evolução mensal <span class="small mut">últimos 6 meses</span></h3><div id="grMes"></div></div>
      <div class="card"><h3>Faturamento ganho por mês</h3><div id="grFat"></div></div>
    </div>
    <div class="cols2">
      <div class="card"><h3>Leads por origem <span class="small mut">conversão de cada canal</span></h3><div id="grOrig"></div></div>
      <div class="card"><h3>Motivos de perda</h3><div id="grMot"></div></div>
    </div>
    <div class="card"><h3>Interesse dos leads <span class="small mut">o que as pessoas mais procuram</span></h3><div id="grInt"></div></div>`;

  G.horiz($('#grEtapa'), ETAPAS.map(e => { const n = list.filter(l => l.etapa === e.k).length; return {k: e.t, v: n, sub: list.length ? Math.round(n / list.length * 100) + '%' : ''}; }), {nome: 'Leads'});
  const total = list.length;
  G.horiz($('#grFunil'), ETAPAS_FUNIL.map(e => { const n = list.filter(l => (l.etapa_max ?? 0) >= e.ordem).length; return {k: e.t, v: n, sub: total ? Math.round(n / total * 100) + '%' : ''}; }), {nome: 'Leads'});
  G.linhas($('#grMes'), meses.map(mesNome), [
    {nome: 'Criados', cor: 'var(--c1)', valores: meses.map(m => base.filter(l => mesKey(l.criado_em) === m).length)},
    {nome: 'Ganhos', cor: 'var(--c2)', valores: meses.map(m => base.filter(l => l.etapa === 'ganho' && mesKey(l.etapa_em) === m).length)}]);
  G.barras($('#grFat'), meses.map(m => ({k: mesNome(m), v: base.filter(l => l.etapa === 'ganho' && mesKey(l.etapa_em) === m).reduce((s, l) => s + +l.valor, 0)})),
    {fmt: (v, eixo) => eixo ? brlCurto(v) : brlCurto(v), nome: 'Faturamento'});
  const porOrig = Object.entries(list.reduce((a, l) => (a[l.origem] = (a[l.origem] || 0) + 1, a), {})).sort((a, b) => b[1] - a[1]);
  G.horiz($('#grOrig'), porOrig.map(([o, n]) => { const g = list.filter(l => l.origem === o && l.etapa === 'ganho').length; return {k: ORIGEM[o] || o, v: n, sub: `${g} ganho${g === 1 ? '' : 's'}`}; }), {nome: 'Leads'});
  const mot = Object.entries(perdidos.reduce((a, l) => { const k = (l.motivo_perda || 'Não informado').split(':')[0]; a[k] = (a[k] || 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]);
  G.horiz($('#grMot'), mot.map(([k, v]) => ({k, v})), {nome: 'Leads', cor: 'var(--c2)'});
  const inter = Object.entries(list.reduce((a, l) => { const k = l.interesse || 'Não informado'; a[k] = (a[k] || 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 8);
  G.horiz($('#grInt'), inter.map(([k, v]) => ({k, v, sub: `${list.filter(l => (l.interesse || 'Não informado') === k && l.etapa === 'ganho').length} ganhos`})), {nome: 'Leads'});
}

// ------------------------------------------------------------------ FICHA DO LEAD (dados + histórico + tarefas)
async function openLead(id, aba = 'hist') {
  fecharModais();
  const l = await API.lead(id); if (!l) return;
  const ov = modal(`<div class="dh"><div class="who"><div class="av" style="width:42px;height:42px;font-size:16px">${esc(initials(l.nome))}</div>
      <div><h2 class="trunc" style="max-width:360px">${esc(l.nome)}</h2><span class="small mut">${esc(l.empresa || 'Sem empresa')} · ${etapaPill(l.etapa)}</span></div></div>
      <button class="x" data-close>${ICON_X}</button></div>
    <div class="db">
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
        ${etapaSelect(l, 'id="olEtapa"')}
        ${l.telefone ? `<a class="btn sm wa-btn" href="#whatsapp?tel=${esc(l.telefone)}" data-close>${IC.wa}WhatsApp</a>` : ''}
        <button class="btn sm" id="olEd">${IC.edit}Editar</button>
        ${l.cliente_id ? `<button class="btn sm" id="olCli">Ver cliente</button>` : `<button class="btn sm" id="olConv">Converter em cliente</button>`}
        <button class="btn sm ghost danger" id="olDel">${IC.lixo}Excluir</button>
      </div>
      <div class="info">
        <div><span>Telefone</span><p>${l.telefone ? `<a href="https://wa.me/${esc(l.telefone)}" target="_blank" rel="noopener">${esc(fmtFone(l.telefone))}</a>` : '—'}</p></div>
        <div><span>E-mail</span><p>${l.email ? `<a href="mailto:${esc(l.email)}">${esc(l.email)}</a>` : '—'}</p></div>
        <div><span>Interesse</span><p>${esc(l.interesse || '—')}</p></div>
        <div><span>Valor estimado</span><p class="num strong">${+l.valor ? brl(l.valor) : '—'}</p></div>
        <div><span>Cidade</span><p>${esc(l.cidade || '—')}</p></div>
        <div><span>Origem · criado</span><p>${esc(ORIGEM[l.origem] || l.origem)} · ${dt(l.criado_em)}</p></div>
        ${l.motivo_perda ? `<div><span>Motivo da perda</span><p>${esc(l.motivo_perda)}</p></div>` : ''}
        ${l.observacoes ? `<div style="grid-column:1/-1"><span>Observações</span><p>${esc(l.observacoes)}</p></div>` : ''}
      </div>
      <div class="tabs soft ld-tabs" id="olTabs"><button data-t="hist">Histórico</button><button data-t="tar">Tarefas</button></div>
      <div id="olBody"></div>
    </div>`, true, 'lg');

  const histo = async () => {
    const at = await API.atividades(l.id);
    const icone = {etapa: IC.etapa, nota: IC.nota, agente: IC.robo, whatsapp: IC.wa, criado: IC.estrela, tarefa: IC.tarefa, pedido: IC.caixa};
    ov.querySelector('#olBody').innerHTML = `
      <form class="nota-form" id="olNota"><textarea class="in" name="t" placeholder="Adicionar nota de interação (ligação, e-mail, reunião…)" maxlength="2000"></textarea>
        <div class="r"><button class="btn sm pri">${IC.nota}Registrar</button></div></form>
      <div class="tl">${at.map(a => `<div class="tl-it ${esc(a.tipo)}"><div class="tl-ic">${icone[a.tipo] || IC.nota}</div>
        <div class="tl-box"><p>${esc(a.texto)}</p><small>${dt(a.criado_em)} · ${ago(a.criado_em)}${a.autor ? ` · ${esc(a.autor)}` : a.tipo === 'agente' ? ' · agente IA' : ''}</small></div></div>`).join('') || '<div class="empty">Sem histórico ainda</div>'}</div>`;
    const f = ov.querySelector('#olNota');
    f.t.onkeydown = e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) f.requestSubmit(); };
    f.onsubmit = async e => { e.preventDefault(); const t = f.t.value.trim(); if (!t) return;
      try { await API.registrarNota(l.id, t); toast('Nota registrada'); histo(); } catch (er) { toast(er.message, true); } };
  };
  const tars = async () => {
    const ts = (await API.tarefas()).filter(t => t.lead_id === l.id);
    ov.querySelector('#olBody').innerHTML = `
      <form class="tk-form" id="olTk"><input class="in" name="t" required maxlength="160" placeholder="Nova tarefa (ex.: Ligar para ${esc(primeiroNome(l.nome) || 'o cliente')})">
        <input class="in" name="d" type="date" value="${dayKey(Date.now() + 864e5)}"><button class="btn pri">+ Adicionar</button></form>
      <div id="olTkList">${tarefasHTML(ts, false) || '<div class="empty">Nenhuma tarefa. Crie lembretes para não esquecer nenhum follow-up.</div>'}</div>`;
    bindTarefas(ov.querySelector('#olTkList'), ts, tars);
    ov.querySelector('#olTk').onsubmit = async e => { e.preventDefault(); const f = e.target;
      try { await API.salvarTarefa({lead_id: l.id, titulo: f.t.value.trim(), vence_em: f.d.value || null}); toast('Tarefa criada'); cache.clear(); atualizarContadores(); tars(); }
      catch (er) { toast(er.message, true); } };
  };
  const abrir = t => { ov.querySelectorAll('#olTabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t)); (t === 'tar' ? tars : histo)(); };
  ov.querySelectorAll('#olTabs button').forEach(b => b.onclick = () => abrir(b.dataset.t));
  abrir(aba);
  ov.querySelector('#olEtapa').onchange = async e => { const v = e.target.value; e.target.className = `pill e-${v}`;
    if (await mudarEtapa(l.id, v)) { if (v !== 'ganho') openLead(l.id); route(true); } else e.target.value = l.etapa; };
  ov.querySelector('#olEd').onclick = () => formLead(l);
  ov.querySelector('#olDel').onclick = () => excluirLead(l);
  ov.querySelector('#olCli')?.addEventListener('click', () => openCliente(l.cliente_id));
  ov.querySelector('#olConv')?.addEventListener('click', () => oferecerConversao(l));
}

// lista de tarefas (ficha do lead e tela Tarefas)
function quando(t) {
  if (!t.vence_em) return ['', 'sem data'];
  const d = diasAte(t.vence_em);
  if (t.feita) return ['', dOnly(t.vence_em)];
  return d < 0 ? ['late', `atrasada ${-d} dia${d === -1 ? '' : 's'}`] : d === 0 ? ['today', 'hoje'] : d === 1 ? ['', 'amanhã'] : ['', dOnly(t.vence_em)];
}
function tarefasHTML(ts, comLead = true) {
  return ts.map(t => { const [c, q] = quando(t), quem = t.leads || t.clientes;
    return `<div class="tk ${t.feita ? 'done' : ''}" data-tk="${t.id}">
      <input type="checkbox" ${t.feita ? 'checked' : ''} aria-label="Concluir ${esc(t.titulo)}">
      <div class="grow"><div class="tk-t">${esc(t.titulo)}</div>${comLead && quem ? `<a class="small" href="javascript:void 0" data-tkl="${t.lead_id || ''}" data-tkc="${t.cliente_id || ''}">${esc(quem.nome)}${quem.empresa ? ` · ${esc(quem.empresa)}` : ''}</a>` : ''}</div>
      <span class="when ${c}">${q}</span>
      ${comLead && quem?.telefone ? `<a class="btn sm ghost ic wa-btn" href="#whatsapp?tel=${esc(quem.telefone)}" title="WhatsApp">${IC.wa}</a>` : ''}
      <button class="btn sm ghost ic" data-tkdel title="Excluir tarefa">${IC.lixo}</button></div>`; }).join('');
}
function bindTarefas(root, ts, depois) {
  root.querySelectorAll('[data-tk]').forEach(el => {
    const t = ts.find(x => x.id === el.dataset.tk);
    el.querySelector('input').onchange = async e => {
      try { await API.atualizarTarefa(t.id, {feita: e.target.checked, feita_em: e.target.checked ? new Date().toISOString() : null});
        if (e.target.checked && t.lead_id) API.registrarNota(t.lead_id, 'Tarefa concluída: ' + t.titulo, 'tarefa').catch(() => {});
        toast(e.target.checked ? 'Tarefa concluída ✓' : 'Tarefa reaberta'); cache.clear(); atualizarContadores(); depois(); }
      catch (er) { toast(er.message, true); e.target.checked = !e.target.checked; }
    };
    el.querySelector('[data-tkdel]').onclick = async () => { if (!confirm('Excluir esta tarefa?')) return;
      try { await API.excluirTarefa(t.id); cache.clear(); atualizarContadores(); depois(); } catch (er) { toast(er.message, true); } };
    el.querySelector('[data-tkl]')?.addEventListener('click', () => t.lead_id ? openLead(t.lead_id, 'tar') : openCliente(t.cliente_id));
  });
}

// ------------------------------------------------------------------ FORMULÁRIO
async function formLead(l = {}) {
  const prods = await API.produtos().catch(() => []);
  const ov = modal(`<form id="fl"><div class="dh"><h2>${l.id ? 'Editar lead' : 'Novo lead'}</h2><button type="button" class="x" data-close>${ICON_X}</button></div>
    <div class="db">
      <div class="grid2">
        <label class="f"><span>Nome *</span><input class="in" name="nome" required maxlength="120" value="${esc(l.nome || '')}"></label>
        <label class="f"><span>Telefone / WhatsApp</span><input class="in" name="telefone" inputmode="tel" placeholder="(31) 99999-9999" value="${esc(l.telefone ? fmtFone(l.telefone) : '')}"></label>
        <label class="f"><span>Empresa</span><input class="in" name="empresa" maxlength="120" value="${esc(l.empresa || '')}"></label>
        <label class="f"><span>E-mail</span><input class="in" name="email" type="email" value="${esc(l.email || '')}"></label>
        <label class="f"><span>Interesse (plano ou produto)</span><input class="in" name="interesse" list="dlInt" placeholder="Escolha ou escreva" value="${esc(l.interesse || '')}"></label>
        <label class="f"><span>Valor estimado (R$)</span><input class="in" name="valor" inputmode="decimal" placeholder="0,00" value="${esc(+l.valor ? fmtNum(l.valor) : '')}"></label>
        <label class="f"><span>Cidade</span><input class="in" name="cidade" value="${esc(l.cidade || '')}"></label>
        <label class="f"><span>Origem</span><select class="in" name="origem">${Object.entries(ORIGEM).map(([k, t]) => `<option value="${k}" ${k === (l.origem || 'manual') ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label class="f"><span>Etapa do funil</span><select class="in" name="etapa">${ETAPAS.map(e => `<option value="${e.k}" ${e.k === (l.etapa || 'novo') ? 'selected' : ''}>${e.t}</option>`).join('')}</select></label>
      </div>
      <datalist id="dlInt">${prods.filter(p => p.ativo).map(p => `<option value="${esc(p.nome)}">${brl(p.preco)}</option>`).join('')}</datalist>
      <label class="f"><span>Observações</span><textarea class="in" name="observacoes" maxlength="2000">${esc(l.observacoes || '')}</textarea></label>
    </div>
    <div class="df"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn pri">Salvar</button></div></form>`, true);
  const f = ov.querySelector('#fl');
  // escolheu um produto do catálogo: sugere o preço como valor
  f.interesse.oninput = () => { const p = prods.find(x => x.nome.toLowerCase() === f.interesse.value.toLowerCase()); if (p && !parseNum(f.valor.value)) f.valor.value = fmtNum(p.preco); };
  f.onsubmit = async e => {
    e.preventDefault();
    const valor = parseNum(f.valor.value);
    if (Number.isNaN(valor) || valor < 0) return toast('Valor inválido', true);
    const tel = normFone(f.telefone.value);
    if (f.telefone.value.trim() && tel.length < 12) return toast('Telefone inválido: informe com DDD', true);
    const row = {nome: f.nome.value.trim(), telefone: tel || null, empresa: f.empresa.value.trim() || null, email: f.email.value.trim().toLowerCase() || null,
      interesse: f.interesse.value.trim() || null, valor: valor || 0, cidade: f.cidade.value.trim() || null, origem: f.origem.value, observacoes: f.observacoes.value.trim() || null};
    const novaEtapa = f.etapa.value;
    try {
      let s;
      if (l.id) { s = await API.salvarLead({id: l.id, ...row}); if (novaEtapa !== l.etapa) await mudarEtapa(l.id, novaEtapa); }
      else s = await API.salvarLead({...row, etapa: novaEtapa});
      toast('Lead salvo'); cache.clear(); ov.fechar();
      if (current === 'leads') await viewLeads();
      if (!l.id || novaEtapa !== 'ganho') openLead(s.id);
    } catch (er) { toast(er.message, true); }
  };
}

// ------------------------------------------------------------------ IMPORTAR CSV (ex.: o "CSV" da CRM antiga)
const IMP_CAMPOS = [
  ['nome', 'Nome *', /^(nome|name|contato|cliente)$/i], ['empresa', 'Empresa', /empresa|company|neg[oó]cio/i], ['telefone', 'Telefone', /telefone|celular|whats|fone|phone/i],
  ['email', 'E-mail', /e-?mail/i], ['cidade', 'Cidade', /cidade|city/i], ['interesse', 'Plano / interesse', /plano|interesse|produto/i],
  ['valor', 'Valor / faturamento', /valor|faturamento|pre[cç]o|value/i], ['etapa', 'Etapa', /etapa|status|fase|stage/i], ['origem', 'Origem', /origem|source|canal/i],
  ['criado_em', 'Data de criação', /cria|data|created|date/i], ['observacoes', 'Observações', /obs|nota|coment/i]
];
const sem = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
const etapaDeTexto = v => { const s = sem(v); if (!s) return 'novo';
  return s.includes('ganh') || s.includes('fech') || s.includes('won') ? 'ganho' : s.includes('perd') || s.includes('lost') ? 'perdido' : s.includes('sem inter') ? 'sem_interesse'
    : s.includes('ia') && s.includes('atend') ? 'ia' : s.includes('humano') ? 'humano' : s.includes('reun') ? 'reuniao' : s.includes('propost') ? 'proposta' : 'novo'; };
const origemDeTexto = v => { const s = sem(v); return Object.entries(ORIGEM).find(([k, t]) => s && (sem(t) === s || k === s))?.[0] || 'importado'; };

function importarCsv() {
  const ov = modal(`<div class="dh"><h2>Importar leads de um CSV</h2><button class="x" data-close>${ICON_X}</button></div>
    <div class="db" id="impBody">
      <div class="note ac">Na CRM antiga, clique em <b>CSV</b> para baixar a planilha e envie aqui. Também serve qualquer planilha salva como CSV (Excel/Google Planilhas).</div>
      <label class="drop-zone" id="impDrop"><input type="file" accept=".csv,text/csv" hidden id="impFile"><b>Clique para escolher o arquivo</b><br><span class="small">ou arraste o CSV para cá</span></label>
    </div>`, true, 'lg');
  const ler = file => { const r = new FileReader(); r.onload = () => mapear(lerCsv(r.result)); r.readAsText(file, 'utf-8'); };
  const dz = ov.querySelector('#impDrop');
  ov.querySelector('#impFile').onchange = e => e.target.files[0] && ler(e.target.files[0]);
  dz.ondragover = e => { e.preventDefault(); dz.classList.add('on'); }; dz.ondragleave = () => dz.classList.remove('on');
  dz.ondrop = e => { e.preventDefault(); dz.classList.remove('on'); e.dataTransfer.files[0] && ler(e.dataTransfer.files[0]); };

  async function mapear(linhas) {
    if (linhas.length < 2) return toast('Arquivo vazio ou sem cabeçalho', true);
    const cab = linhas[0].map(c => c.trim()), dados = linhas.slice(1);
    const auto = {}; IMP_CAMPOS.forEach(([k, , re]) => { const i = cab.findIndex((c, j) => re.test(sem(c)) && !Object.values(auto).includes(j)); if (i >= 0) auto[k] = i; });
    const existentes = await cache.leads(true);
    const chave = l => `${sem(l.nome)}|${sem(l.empresa)}|${normFone(l.telefone)}`;
    const ja = new Set(existentes.map(chave));
    ov.querySelector('#impBody').innerHTML = `
      <p class="small mut" style="margin-bottom:10px"><b>${dados.length}</b> linhas encontradas. Confira de qual coluna vem cada informação:</p>
      <div class="imp-map">${IMP_CAMPOS.map(([k, t]) => `<label class="f" style="margin:0"><span>${t}</span><select class="in" data-map="${k}"><option value="">— não importar —</option>${cab.map((c, i) => `<option value="${i}" ${auto[k] === i ? 'selected' : ''}>${esc(c || `Coluna ${i + 1}`)}</option>`).join('')}</select></label>`).join('')}</div>
      <label class="check"><input type="checkbox" id="impDup" checked> Pular quem já está na CRM (mesmo nome, empresa e telefone)</label>
      <div class="imp-prev" id="impPrev"></div>`;
    ov.querySelector('.modal').insertAdjacentHTML('beforeend', `<div class="df"><button class="btn ghost" data-close>Cancelar</button><button class="btn pri" id="impGo">Importar</button></div>`);
    const linhaParaLead = r => {
      const m = {}; ov.querySelectorAll('[data-map]').forEach(s => { if (s.value !== '') m[s.dataset.map] = (r[+s.value] ?? '').trim(); });
      if (!m.nome) return null;
      const v = parseNum(m.valor), tel = normFone(m.telefone);
      return {nome: m.nome.slice(0, 120), empresa: m.empresa || null, telefone: tel.length >= 12 ? tel : null, email: m.email?.toLowerCase() || null, cidade: m.cidade || null,
        interesse: m.interesse || null, valor: v > 0 ? Math.round(v * 100) / 100 : 0, etapa: etapaDeTexto(m.etapa), origem: m.origem ? origemDeTexto(m.origem) : 'importado',
        criado_em: lerData(m.criado_em) || undefined, observacoes: m.observacoes || null};
    };
    const prever = () => {
      const pular = ov.querySelector('#impDup').checked;
      const ls = dados.map(linhaParaLead).filter(Boolean), novos = pular ? ls.filter(l => !ja.has(chave(l))) : ls;
      ov.querySelector('#impPrev').innerHTML = `<table><thead><tr><th>Nome</th><th>Empresa</th><th>Telefone</th><th>Interesse</th><th class="r">Valor</th><th>Etapa</th><th>Criado</th></tr></thead>
        <tbody>${novos.slice(0, 50).map(l => `<tr><td>${esc(l.nome)}</td><td>${esc(l.empresa || '')}</td><td>${esc(fmtFone(l.telefone))}</td><td>${esc(l.interesse || '')}</td><td class="r">${brl(l.valor)}</td><td>${etapaPill(l.etapa)}</td><td>${l.criado_em ? dOnly(l.criado_em) : 'hoje'}</td></tr>`).join('')}</tbody></table>`;
      const b = ov.querySelector('#impGo'); b.textContent = `Importar ${novos.length} lead${novos.length === 1 ? '' : 's'}`; b.disabled = !novos.length;
      if (ls.length - novos.length) b.textContent += ` (${ls.length - novos.length} já existem)`;
      return novos;
    };
    ov.querySelectorAll('[data-map], #impDup').forEach(s => s.onchange = prever);
    prever();
    ov.querySelector('#impGo').onclick = async e => {
      const novos = prever(); e.target.disabled = true; e.target.textContent = 'Importando…';
      try { const n = await API.importarLeads(novos.map(l => { const {criado_em, ...r} = l; return criado_em ? {...r, criado_em} : r; }));
        toast(`${n} leads importados`); cache.clear(); ov.fechar(); location.hash === '#leads' ? viewLeads() : location.hash = '#leads'; }
      catch (er) { toast(er.message, true); e.target.disabled = false; prever(); }
    };
  }
}

// ------------------------------------------------------------------ TELA TAREFAS
async function viewTarefas() {
  const [ts, leads] = await Promise.all([cache.tarefas(true), cache.leads()]);
  const hoje = hojeKey(), em7 = dayKey(Date.now() + 7 * 864e5);
  const pend = ts.filter(t => !t.feita);
  const grupos = [
    ['Atrasadas', pend.filter(t => t.vence_em && t.vence_em < hoje)],
    ['Hoje', pend.filter(t => t.vence_em === hoje)],
    ['Próximos 7 dias', pend.filter(t => t.vence_em > hoje && t.vence_em <= em7)],
    ['Mais adiante e sem data', pend.filter(t => !t.vence_em || t.vence_em > em7)],
    ['Concluídas recentemente', ts.filter(t => t.feita).sort((a, b) => String(b.feita_em).localeCompare(String(a.feita_em))).slice(0, 15)]
  ];
  $('#view').innerHTML = header('Tarefas', 'Lembretes de follow-up para nenhum lead esfriar') + `
    <div class="card" style="margin-bottom:14px"><form class="tk-form quatro" id="tkNova" style="margin:0">
      <input class="in" name="t" required maxlength="160" placeholder="Nova tarefa (ex.: Enviar proposta)">
      <select class="in" name="l"><option value="">Sem lead</option>${leads.filter(l => ETAPAS_ABERTAS.includes(l.etapa)).map(l => `<option value="${l.id}">${esc(l.nome)}${l.empresa ? ` · ${esc(l.empresa)}` : ''}</option>`).join('')}</select>
      <input class="in" name="d" type="date" value="${hoje}"><button class="btn pri">+ Adicionar</button></form></div>
    ${grupos.map(([t, g], i) => g.length ? `<div class="sec-t">${t} <span class="small mut">${g.length}</span></div><div data-g="${i}">${tarefasHTML(g)}</div>` : '').join('')
      || '<div class="card empty">Nenhuma tarefa. Crie lembretes na ficha de cada lead ou aqui em cima.</div>'}`;
  document.querySelectorAll('[data-g]').forEach(el => bindTarefas(el, ts, viewTarefas));
  $('#tkNova').onsubmit = async e => { e.preventDefault(); const f = e.target;
    try { await API.salvarTarefa({titulo: f.t.value.trim(), lead_id: f.l.value || null, vence_em: f.d.value || null}); toast('Tarefa criada'); cache.clear(); viewTarefas(); }
    catch (er) { toast(er.message, true); } };
}
