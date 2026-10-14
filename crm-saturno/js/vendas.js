// =====================================================================
//  SATURNO NFC · CRM — Pedidos, Clientes, Assinaturas, Produtos e Margem de lucro
// =====================================================================
'use strict';

// ======================================================================
//  PEDIDOS
// ======================================================================
const PD = {filtro: 'abertos', q: ''};
const etqSel = new Set();
const etqImpressas = () => { try { return new Set(JSON.parse(localStorage.getItem('saturno_etq') || '[]')); } catch { return new Set(); } };
async function imprimirEtiquetas(peds, btn) {
  if (!peds.length) return false;
  const txt = btn?.innerHTML; if (btn) { btn.disabled = true; btn.textContent = 'Gerando…'; }
  try {
    await window.saturnoEtiquetas(peds, EMPRESA);
    try { const s = etqImpressas(); peds.forEach(p => s.add(p.numero)); localStorage.setItem('saturno_etq', JSON.stringify([...s].slice(-2000))); } catch {}
    toast(peds.length === 1 ? `Etiqueta do pedido #${peds[0].numero} baixada` : `${peds.length} etiquetas baixadas num PDF`);
    return true;
  } catch (e) { toast(e.message, true); return false; }
  finally { if (btn) { btn.disabled = false; btn.innerHTML = txt; } }
}

async function viewPedidos() {
  const peds = await cache.pedidos(true);
  const counts = {abertos: peds.filter(p => PED_ABERTOS.includes(p.status)).length, todos: peds.length, apagar: peds.filter(p => !p.pago && contaVenda(p)).length};
  Object.keys(STATUS).forEach(s => counts[s] = peds.filter(p => p.status === s).length);
  const q = PD.q.toLowerCase();
  const list = peds.filter(p => PD.filtro === 'todos' ? true : PD.filtro === 'abertos' ? PED_ABERTOS.includes(p.status) : PD.filtro === 'apagar' ? !p.pago && contaVenda(p) : p.status === PD.filtro)
    .filter(p => !q || `#${p.numero} ${p.clientes?.nome} ${p.clientes?.empresa || ''} ${p.clientes?.telefone} ${itensResumo(p.pedido_itens)} ${p.codigo_rastreio || ''}`.toLowerCase().includes(q));
  const tabs = [['abertos', 'Em andamento'], ['todos', 'Todos'], ['apagar', 'A receber'], ...Object.entries(STATUS)];
  [...etqSel].forEach(id => { if (!peds.some(p => p.id === id)) etqSel.delete(id); });

  $('#view').innerHTML = header('Pedidos', 'Da criação da arte à entrega do cartão ou espelho',
    `<button class="btn" id="etqBtn" disabled>${IC.etq}Etiquetas</button><button class="btn" id="pdCsv">${IC.csv}CSV</button><button class="btn pri" id="novoPed">+ Novo pedido</button>`) + `
    <div class="bar"><div class="search">${ICON_SEARCH}<input class="in" id="qPed" placeholder="Buscar nº, cliente, produto, rastreio…" value="${esc(PD.q)}"></div></div>
    <div class="bar"><div class="tabs">${tabs.map(([k, l]) => `<button data-f="${k}" class="${PD.filtro === k ? 'on' : ''}">${l}<em>${counts[k]}</em></button>`).join('')}</div></div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Nº</th><th style="width:30px"><input type="checkbox" class="check" id="etqAll" style="margin:0" title="Selecionar todos (etiquetas)"></th><th>Cliente</th><th>Itens</th><th class="r">Total</th><th>Pagamento</th><th>Status</th><th>Prazo</th><th></th></tr></thead>
      <tbody>${list.map(p => { const atras = p.prazo && PED_ABERTOS.includes(p.status) && p.status !== 'enviado' && diasAte(p.prazo) < 0;
        return `<tr class="click" data-ped="${p.id}">
        <td class="strong sora">#${p.numero}${etqImpressas().has(p.numero) ? ' <span class="tag" title="Etiqueta já impressa">✓</span>' : ''}</td>
        <td><input type="checkbox" data-etq="${p.id}" ${etqSel.has(p.id) ? 'checked' : ''} aria-label="Selecionar #${p.numero}" style="accent-color:var(--ac);width:16px;height:16px"></td>
        <td><b>${esc(p.clientes?.nome)}</b><div class="small mut">${esc(p.clientes?.empresa || fmtFone(p.clientes?.telefone))}</div></td>
        <td class="small trunc">${esc(itensResumo(p.pedido_itens))}</td>
        <td class="num r strong">${brl(p.total)}</td>
        <td class="small">${p.pago ? '<span class="tag ok">Pago</span>' : '<span class="tag warn">A receber</span>'} ${esc(PAG[p.forma_pagamento] || '')}</td>
        <td>${statusSelect(p)}</td>
        <td class="small ${atras ? 'neg-txt strong' : 'mut'}">${p.prazo ? dOnly(p.prazo) : '—'}</td>
        <td class="r"><button class="btn sm ghost ic" data-etq1="${p.id}" title="Etiqueta de envio 10×15 cm">${IC.etq}</button></td></tr>`; }).join('')}</tbody>
    </table>${list.length ? '' : '<div class="empty">Nenhum pedido encontrado</div>'}</div>`;

  $('#qPed').oninput = debounce(async e => { PD.q = e.target.value; await viewPedidos(); const i = $('#qPed'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); });
  document.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { PD.filtro = b.dataset.f; viewPedidos(); });
  bindSelects(() => setTimeout(viewPedidos, 400));
  $('#novoPed').onclick = () => formPedido();
  $('#pdCsv').onclick = () => baixarCsv('pedidos-saturno-nfc.csv', ['Nº', 'Data', 'Cliente', 'Empresa', 'Telefone', 'Itens', 'Subtotal', 'Desconto', 'Frete', 'Total', 'Pago', 'Pagamento', 'Status', 'Entrega', 'Rastreio', 'Prazo'],
    list.map(p => [p.numero, dOnly(p.criado_em), p.clientes?.nome, p.clientes?.empresa, fmtFone(p.clientes?.telefone), itensResumo(p.pedido_itens), fmtNum(p.subtotal), fmtNum(p.desconto), fmtNum(p.frete),
      fmtNum(p.total), p.pago ? 'sim' : 'não', PAG[p.forma_pagamento] || '', STATUS[p.status], ENTREGA[p.tipo_entrega] || '', p.codigo_rastreio || '', p.prazo ? dOnly(p.prazo) : '']));
  const contaEtq = () => { const n = etqSel.size, b = $('#etqBtn'); b.disabled = !n; b.innerHTML = `${IC.etq}Etiquetas${n ? ` (${n})` : ''}`;
    const all = $('#etqAll'); all.checked = list.length > 0 && list.every(p => etqSel.has(p.id)); all.indeterminate = !all.checked && list.some(p => etqSel.has(p.id)); };
  document.querySelectorAll('[data-etq]').forEach(c => c.onchange = () => { c.checked ? etqSel.add(c.dataset.etq) : etqSel.delete(c.dataset.etq); contaEtq(); });
  $('#etqAll').onchange = e => { list.forEach(p => e.target.checked ? etqSel.add(p.id) : etqSel.delete(p.id)); document.querySelectorAll('[data-etq]').forEach(c => c.checked = e.target.checked); contaEtq(); };
  $('#etqBtn').onclick = async e => { if (await imprimirEtiquetas(peds.filter(p => etqSel.has(p.id)).sort((a, b) => a.numero - b.numero), e.currentTarget)) { etqSel.clear(); viewPedidos(); } };
  document.querySelectorAll('[data-etq1]').forEach(b => b.onclick = async () => { if (await imprimirEtiquetas([peds.find(p => p.id === b.dataset.etq1)], b)) viewPedidos(); });
  document.querySelectorAll('tr[data-ped]').forEach(tr => tr.onclick = e => { if (e.target.closest('select,input,button,a')) return; openPedido(tr.dataset.ped); });
  contaEtq();
}

async function openPedido(id) {
  fecharModais();
  const p = (await cache.pedidos()).find(x => x.id === id); if (!p) return;
  const ov = modal(`<div class="dh"><div><h2>Pedido #${p.numero}</h2><div class="small mut">${dt(p.criado_em)} · via ${esc(ORIGEM[p.origem] || p.origem)}</div></div><button class="x" data-close>${ICON_X}</button></div>
    <div class="db">
      <div class="who" style="margin-bottom:16px;cursor:pointer" id="opCli"><div class="av">${esc(initials(p.clientes?.nome))}</div>
        <div><b>${esc(p.clientes?.nome)}</b><span class="small mut">${esc([p.clientes?.empresa, fmtFone(p.clientes?.telefone)].filter(Boolean).join(' · '))} · ver ficha →</span></div></div>
      <div class="grid2">
        <label class="f"><span>Status</span><select class="in" id="opSt">${Object.entries(STATUS).map(([k, l]) => `<option value="${k}" ${k === p.status ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="f"><span>Pagamento</span><select class="in" id="opPago"><option value="0" ${p.pago ? '' : 'selected'}>A receber</option><option value="1" ${p.pago ? 'selected' : ''}>Pago</option></select></label>
        <label class="f"><span>Código de rastreio</span><input class="in" id="opRast" placeholder="Ex.: QB123456789BR" value="${esc(p.codigo_rastreio || '')}"></label>
        <label class="f"><span>Prazo de entrega</span><input class="in" type="date" id="opPrazo" value="${esc(p.prazo || '')}"></label>
      </div>
      <div class="info">
        <div><span>Forma de pagamento</span><p>${esc(PAG[p.forma_pagamento] || '—')}${p.parcelas > 1 ? ` · ${p.parcelas}x` : ''}</p></div>
        <div><span>Entrega</span><p>${esc(ENTREGA[p.tipo_entrega] || p.tipo_entrega)}${p.tipo_entrega !== 'retirada' && p.tipo_entrega !== 'digital' ? ` · ${esc(p.endereco_entrega || [p.clientes?.endereco, p.clientes?.bairro, p.clientes?.cidade].filter(Boolean).join(' · ') || 'endereço não informado')}` : ''}</p></div>
        ${p.observacoes ? `<div style="grid-column:1/-1"><span>Observações</span><p>${esc(p.observacoes)}</p></div>` : ''}
      </div>
      <div class="sumbox">${(p.pedido_itens || []).map(i => `<div class="li"><span>${i.quantidade}× ${esc(i.produto)}${i.personalizacao ? `<br><span class="small mut">${esc(i.personalizacao)}</span>` : ''}</span><span class="num">${brl(i.quantidade * i.preco_unitario)}</span></div>`).join('')}
        <div class="li mut small" style="border-top:1px dashed var(--line2);margin-top:6px;padding-top:8px"><span>Subtotal</span><span class="num">${brl(p.subtotal)}</span></div>
        ${+p.desconto ? `<div class="li mut small"><span>Desconto</span><span class="num">− ${brl(p.desconto)}</span></div>` : ''}
        ${+p.frete ? `<div class="li mut small"><span>Frete</span><span class="num">${brl(p.frete)}</span></div>` : ''}
        <div class="li tot"><span>Total</span><span class="num" style="color:var(--ac)">${brl(p.total)}</span></div></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn pri" id="opSalvar">Salvar alterações</button>
        <button class="btn" id="opEtq">${IC.etq}Etiqueta</button>
        ${p.clientes?.telefone ? `<a class="btn wa-btn" href="#whatsapp?tel=${esc(p.clientes.telefone)}" data-close>${IC.wa}WhatsApp</a>` : ''}
        <a class="btn" href="#mensagens?ped=${p.id}" data-close>Mensagens prontas</a>
        ${p.lead_id ? `<button class="btn ghost" id="opLead">Ver lead</button>` : ''}
      </div>
    </div>`, true);
  ov.querySelector('#opEtq').onclick = e => imprimirEtiquetas([p], e.currentTarget);
  ov.querySelector('#opCli').onclick = () => openCliente(p.cliente_id);
  ov.querySelector('#opLead')?.addEventListener('click', () => openLead(p.lead_id));
  ov.querySelector('#opSalvar').onclick = async () => {
    const patch = {status: ov.querySelector('#opSt').value, pago: ov.querySelector('#opPago').value === '1',
      codigo_rastreio: ov.querySelector('#opRast').value.trim().toUpperCase() || null, prazo: ov.querySelector('#opPrazo').value || null};
    if (patch.codigo_rastreio && patch.status !== 'entregue' && patch.status !== 'cancelado' && !p.codigo_rastreio) patch.status = 'enviado';
    try { await API.atualizarPedido(p.id, patch); toast(patch.status === 'enviado' && p.status !== 'enviado' ? 'Pedido marcado como enviado' : 'Pedido atualizado'); cache.clear(); ov.fechar(); route(true); }
    catch (er) { toast(er.message, true); }
  };
}

// novo pedido; opts.lead: veio de um lead ganho (já traz o produto de interesse)
async function formPedido(clienteId, opts = {}) {
  fecharModais();
  const [clis, prods] = await Promise.all([API.clientes(), API.produtos()]);
  const ativos = prods.filter(p => p.ativo);
  const cli0 = clis.find(c => c.id === clienteId);
  const ov = modal(`<form id="fp"><div class="dh"><h2>Novo pedido</h2><button type="button" class="x" data-close>${ICON_X}</button></div>
    <div class="db">
      <label class="f"><span>Cliente</span><select class="in" name="cliente_id" required><option value="">Selecione…</option>
        ${clis.map(c => `<option value="${c.id}" ${c.id === clienteId ? 'selected' : ''}>${esc(c.nome)}${c.empresa ? ` · ${esc(c.empresa)}` : ''}${c.telefone ? ` · ${esc(fmtFone(c.telefone))}` : ''}</option>`).join('')}</select></label>
      <div class="sec-t" style="margin-top:4px">Itens <button type="button" class="btn sm" id="addIt">+ Item</button></div>
      <datalist id="dlProd">${ativos.map(p => `<option value="${esc(p.nome)}">${brl(p.preco)}</option>`).join('')}</datalist>
      <div class="items-ed" id="its"></div>
      <div class="grid2">
        <label class="f"><span>Pagamento</span><select class="in" name="forma_pagamento">${Object.entries(PAG).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
        <label class="f"><span>Parcelas</span><input class="in" name="parcelas" type="number" min="1" max="24" value="1"></label>
        <label class="f"><span>Entrega</span><select class="in" name="tipo_entrega">${Object.entries(ENTREGA).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
        <label class="f"><span>Prazo de entrega</span><input class="in" name="prazo" type="date" value="${dayKey(Date.now() + 10 * 864e5)}"></label>
        <label class="f"><span>Frete (R$)</span><input class="in" name="frete" inputmode="decimal" value="0,00"></label>
        <label class="f"><span>Desconto (R$)</span><input class="in" name="desconto" inputmode="decimal" value="0,00"></label>
      </div>
      <label class="f"><span>Endereço de entrega (vazio = endereço do cadastro)</span><input class="in" name="endereco_entrega"></label>
      <label class="f"><span>Observações</span><textarea class="in" name="observacoes"></textarea></label>
      <label class="check"><input type="checkbox" name="pago"> Já está pago</label>
      <div class="sumbox"><div class="li tot" style="border:0;margin:0;padding:0"><span>Total</span><span class="num" id="ptot">R$ 0,00</span></div></div>
    </div>
    <div class="df"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn pri">Salvar pedido</button></div></form>`, true);
  const its = ov.querySelector('#its'), f = ov.querySelector('#fp');
  const addRow = (nome = '', preco = '') => {
    const r = document.createElement('div');
    r.innerHTML = `<div class="row"><input class="in" list="dlProd" placeholder="Produto" required value="${esc(nome)}"><input class="in" type="number" min="1" value="1" title="Quantidade"><input class="in" inputmode="decimal" placeholder="Preço" required value="${esc(preco !== '' ? fmtNum(preco) : '')}"><button type="button" class="x" title="Remover">${ICON_X}</button></div>
      <input class="in pers" placeholder="Personalização (nome no cartão, link, cor do espelho…)">`;
    const [nm, , pr] = r.querySelectorAll('.row input');
    nm.oninput = () => { const m = ativos.find(p => p.nome.toLowerCase() === nm.value.toLowerCase()); if (m) pr.value = fmtNum(m.preco); sum(); };
    r.querySelectorAll('input').forEach(i => i.addEventListener('input', sum));
    r.querySelector('button').onclick = () => { r.remove(); sum(); };
    its.appendChild(r);
  };
  const rows = () => [...its.children].map(r => { const [n, q, p] = r.querySelectorAll('.row input'); return {produto: n.value.trim(), quantidade: +q.value || 1, preco_unitario: parseNum(p.value) || 0, personalizacao: r.querySelector('.pers').value.trim() || null}; });
  const sum = () => { const s = rows().reduce((a, i) => a + i.quantidade * i.preco_unitario, 0);
    ov.querySelector('#ptot').textContent = brl(calcTotal({subtotal: s, desconto: parseNum(f.desconto.value), frete: parseNum(f.frete.value)})); };
  f.desconto.oninput = f.frete.oninput = sum;
  ov.querySelector('#addIt').onclick = () => addRow();
  const pInt = opts.lead && ativos.find(p => p.nome.toLowerCase() === String(opts.lead.interesse || '').toLowerCase());
  addRow(pInt?.nome || opts.lead?.interesse || '', pInt ? pInt.preco : +opts.lead?.valor || '');
  sum();
  if (cli0?.endereco) f.endereco_entrega.placeholder = [cli0.endereco, cli0.bairro, cli0.cidade].filter(Boolean).join(' · ');
  f.onsubmit = async e => {
    e.preventDefault();
    const items = rows().filter(i => i.produto); if (!items.length) return toast('Adicione ao menos um item', true);
    const ped = {cliente_id: f.cliente_id.value, lead_id: opts.lead?.id || null, status: 'novo', forma_pagamento: f.forma_pagamento.value, parcelas: Math.max(1, +f.parcelas.value || 1),
      tipo_entrega: f.tipo_entrega.value, prazo: f.prazo.value || null, frete: parseNum(f.frete.value) || 0, desconto: parseNum(f.desconto.value) || 0,
      endereco_entrega: f.endereco_entrega.value.trim() || null, observacoes: f.observacoes.value.trim() || null, pago: f.pago.checked, origem: opts.lead ? (opts.lead.origem === 'agente' ? 'agente' : 'whatsapp') : 'manual'};
    if (!['whatsapp', 'agente', 'manual'].includes(ped.origem)) ped.origem = 'manual';
    const comCat = items.map(i => { const m = ativos.find(p => p.nome.toLowerCase() === i.produto.toLowerCase()); return {...i, produto_id: m?.id || null, categoria: m?.categoria || null}; });
    try {
      const n = await API.criarPedido(ped, comCat); toast(`Pedido #${n.numero} criado`);
      if (opts.lead) API.registrarNota(opts.lead.id, `Pedido #${n.numero} criado: ${itensResumo(comCat)}`, 'pedido').catch(() => {});
      ov.fechar(); cache.clear();
      // plano vendido com manutenção mensal: oferece criar a assinatura
      const mensal = ativos.find(p => p.recorrente);
      if (mensal && comCat.some(i => ativos.find(p => p.id === i.produto_id)?.categoria === 'Planos')) {
        if (confirm(`Criar também a assinatura "${mensal.nome}" (${brl(mensal.preco)}/mês) para este cliente?`)) return formAssinatura({cliente_id: ped.cliente_id, produto_id: mensal.id, descricao: mensal.nome, valor: mensal.preco});
      }
      route(true);
    } catch (er) { toast(er.message, true); }
  };
}

// ======================================================================
//  CLIENTES
// ======================================================================
const CL = {q: '', ord: 'nome'};
const waLink = c => { const tel = normFone(c.telefone); return tel ? `<a class="btn sm wa-btn" href="#whatsapp?tel=${tel}" title="Conversar no WhatsApp">${IC.wa}WhatsApp</a>` : ''; };
async function viewClientes() {
  const clis = await API.clientes();
  const q = CL.q.toLowerCase(), qd = CL.q.replace(/\D/g, '');
  const ord = {nome: (a, b) => a.nome.localeCompare(b.nome), gasto: (a, b) => b.total_gasto - a.total_gasto, mensal: (a, b) => b.mensalidade - a.mensalidade,
    recente: (a, b) => String(b.ultimo_pedido_em || '').localeCompare(String(a.ultimo_pedido_em || ''))};
  const list = clis.filter(c => !q || `${c.nome} ${c.empresa || ''} ${c.email || ''} ${c.cidade || ''} ${(c.tags || []).join(' ')}`.toLowerCase().includes(q) || (qd.length > 3 && String(c.telefone || '').includes(qd))).sort(ord[CL.ord]);
  $('#view').innerHTML = header('Clientes', `${clis.length} clientes · ${brl(clis.reduce((s, c) => s + +c.mensalidade, 0))}/mês em assinaturas`,
    `<button class="btn" id="expCsv">${IC.csv}Exportar CSV</button><button class="btn pri" id="novoCli">+ Novo cliente</button>`) + `
    <div class="bar">
      <div class="search">${ICON_SEARCH}<input class="in" id="qCli" placeholder="Buscar nome, empresa, telefone, cidade…" value="${esc(CL.q)}"></div>
      <select class="in" id="ordCli"><option value="nome">Ordenar: Nome</option><option value="gasto">Maior valor comprado</option><option value="mensal">Maior mensalidade</option><option value="recente">Pedido mais recente</option></select>
    </div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Cliente</th><th>Telefone</th><th class="r">Pedidos</th><th class="r">Total comprado</th><th class="r">Mensalidade</th><th>Página NFC</th><th></th></tr></thead>
      <tbody>${list.map(c => `<tr class="click" data-cli="${c.id}">
        <td><div class="who"><div class="av">${esc(initials(c.nome))}</div><div><b>${esc(c.nome)}</b><span class="small mut">${esc(c.empresa || c.cidade || '')}</span></div></div></td>
        <td class="num small">${esc(fmtFone(c.telefone))}</td>
        <td class="num r strong">${c.total_pedidos}</td>
        <td class="num r">${brl(c.total_gasto)}</td>
        <td class="num r">${+c.mensalidade ? brl(c.mensalidade) : '<span class="mut">—</span>'}</td>
        <td class="small">${isUrl(c.link_pagina) ? `<a href="${esc(c.link_pagina)}" target="_blank" rel="noopener">${IC.link} abrir</a>` : '<span class="mut">—</span>'}</td>
        <td class="r">${waLink(c)}</td></tr>`).join('')}</tbody>
    </table>${list.length ? '' : '<div class="empty">Nenhum cliente encontrado</div>'}</div>`;
  $('#ordCli').value = CL.ord;
  $('#ordCli').onchange = e => { CL.ord = e.target.value; viewClientes(); };
  $('#qCli').oninput = debounce(async e => { CL.q = e.target.value; await viewClientes(); const i = $('#qCli'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); });
  $('#novoCli').onclick = () => formCliente();
  $('#expCsv').onclick = () => baixarCsv('clientes-saturno-nfc.csv', ['Nome', 'Empresa', 'Telefone', 'E-mail', 'CPF/CNPJ', 'Endereço', 'Bairro', 'Cidade', 'UF', 'CEP', 'Página NFC', 'Pedidos', 'Total comprado', 'Mensalidade', 'Cliente desde'],
    list.map(c => [c.nome, c.empresa, fmtFone(c.telefone), c.email, c.documento, c.endereco, c.bairro, c.cidade, c.uf, c.cep, c.link_pagina, c.total_pedidos, fmtNum(c.total_gasto), fmtNum(c.mensalidade), dOnly(c.criado_em)]));
  document.querySelectorAll('tr[data-cli]').forEach(tr => tr.onclick = e => { if (e.target.closest('a,button')) return; openCliente(tr.dataset.cli); });
}

async function openCliente(id) {
  fecharModais();
  const c = await API.cliente(id);
  const ticket = c.total_pedidos ? c.total_gasto / c.total_pedidos : 0;
  const ov = modal(`<div class="dh"><div class="who"><div class="av" style="width:44px;height:44px;font-size:16px">${esc(initials(c.nome))}</div>
      <div><h2>${esc(c.nome)}</h2><span class="small mut">${esc(c.empresa ? c.empresa + ' · ' : '')}Cliente desde ${dOnly(c.criado_em)} · via ${esc(ORIGEM[c.origem] || c.origem)}</span></div></div>
      <div style="display:flex;gap:8px">${c.telefone ? `<a class="btn sm wa-btn" href="#whatsapp?tel=${esc(c.telefone)}" data-close>${IC.wa}Conversar</a>` : ''}<button class="btn sm" id="edCli">${IC.edit}Editar</button><button class="x" data-close>${ICON_X}</button></div></div>
    <div class="db">
      <div class="minis">
        <div class="mini"><span>Pedidos</span><b>${c.total_pedidos}</b></div>
        <div class="mini"><span>Total comprado</span><b style="color:var(--ac)">${brl(c.total_gasto)}</b></div>
        <div class="mini"><span>Mensalidade</span><b>${+c.mensalidade ? brl(c.mensalidade) : '—'}</b></div>
      </div>
      <div class="info">
        <div><span>Telefone / WhatsApp</span><p>${c.telefone ? `<a href="https://wa.me/${esc(c.telefone)}" target="_blank" rel="noopener">${esc(fmtFone(c.telefone))}</a>` : '—'}</p></div>
        <div><span>E-mail</span><p>${c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : '—'}</p></div>
        <div><span>CPF / CNPJ</span><p>${esc(c.documento || '—')}</p></div>
        <div><span>Endereço</span><p>${esc([c.endereco, c.bairro, c.cidade && (c.cidade + (c.uf ? ' - ' + c.uf : '')), c.cep].filter(Boolean).join(' · ') || '—')}</p></div>
        <div><span>Página NFC</span><p>${isUrl(c.link_pagina) ? `<a href="${esc(c.link_pagina)}" target="_blank" rel="noopener">${esc(c.link_pagina.replace(/^https?:\/\//, ''))}</a>` : '—'}</p></div>
        <div><span>Link de avaliação (cartão Google)</span><p>${isUrl(c.link_avaliacao) ? `<a href="${esc(c.link_avaliacao)}" target="_blank" rel="noopener">abrir</a>` : '—'}</p></div>
        <div><span>Ticket médio</span><p>${brl(ticket)}</p></div>
        <div><span>Tags</span><p>${(c.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join(' ') || '—'}</p></div>
        ${c.observacoes ? `<div style="grid-column:1/-1"><span>Observações</span><p>${esc(c.observacoes)}</p></div>` : ''}
      </div>
      ${c.assinaturas.length ? `<div class="sec-t">Assinaturas</div>${c.assinaturas.map(a => `<div class="li"><span>${esc(a.descricao)} · <span class="pill a-${a.status}">${a.status}</span></span><span class="num">${brl(a.valor)}/mês · próx. ${dOnly(a.proximo_vencimento)}</span></div>`).join('')}` : ''}
      ${c.leads.length ? `<div class="sec-t">Negócios (leads)</div>${c.leads.map(l => `<div class="li" style="cursor:pointer" data-ol="${l.id}"><span>${esc(l.interesse || l.nome)} · ${etapaPill(l.etapa)}</span><span class="num">${+l.valor ? brl(l.valor) : ''} <span class="small mut">${dOnly(l.criado_em)}</span></span></div>`).join('')}` : ''}
      <div class="sec-t">Pedidos (${c.pedidos.length}) <span style="display:flex;gap:6px"><button class="btn sm" id="assCli">+ Assinatura</button><button class="btn sm pri" id="pedCli">+ Pedido</button></span></div>
      ${c.pedidos.map(p => `<div class="order"><div class="oh"><b>#${p.numero}</b>${statusPill(p.status)}${p.pago ? '<span class="tag ok">Pago</span>' : '<span class="tag warn">A receber</span>'}<span class="small mut">${dt(p.criado_em)}</span>
          <span class="num strong" style="margin-left:auto">${brl(p.total)}</span></div>
        <div class="ob">${(p.pedido_itens || []).map(i => `<div class="li"><span>${i.quantidade}× ${esc(i.produto)}${i.personalizacao ? ` <span class="small mut">(${esc(i.personalizacao)})</span>` : ''}</span><span class="num mut">${brl(i.quantidade * i.preco_unitario)}</span></div>`).join('')}
          <div class="li small mut"><span>${esc(PAG[p.forma_pagamento] || '—')} · ${esc(ENTREGA[p.tipo_entrega] || '')}${p.codigo_rastreio ? ` · rastreio ${esc(p.codigo_rastreio)}` : ''}</span><button class="btn sm" data-op="${p.id}">Abrir</button></div></div></div>`).join('') || '<div class="empty">Ainda sem pedidos</div>'}
    </div>`);
  ov.querySelectorAll('.order .oh').forEach(h => h.onclick = () => h.parentElement.classList.toggle('open'));
  ov.querySelector('.order')?.classList.add('open');
  ov.querySelectorAll('[data-op]').forEach(b => b.onclick = () => openPedido(b.dataset.op));
  ov.querySelectorAll('[data-ol]').forEach(b => b.onclick = () => openLead(b.dataset.ol));
  ov.querySelector('#edCli').onclick = () => formCliente(c);
  ov.querySelector('#pedCli').onclick = () => formPedido(c.id);
  ov.querySelector('#assCli').onclick = () => formAssinatura({cliente_id: c.id});
}

function formCliente(c = {}) {
  fecharModais();
  const ov = modal(`<form id="fc"><div class="dh"><h2>${c.id ? 'Editar cliente' : 'Novo cliente'}</h2><button type="button" class="x" data-close>${ICON_X}</button></div>
    <div class="db">
      <div class="grid2">
        <label class="f"><span>Nome *</span><input class="in" name="nome" required value="${esc(c.nome || '')}"></label>
        <label class="f"><span>Empresa</span><input class="in" name="empresa" value="${esc(c.empresa || '')}"></label>
        <label class="f"><span>Telefone / WhatsApp</span><input class="in" name="telefone" inputmode="tel" placeholder="(31) 99999-9999" value="${esc(c.telefone ? fmtFone(c.telefone) : '')}"></label>
        <label class="f"><span>E-mail</span><input class="in" name="email" type="email" value="${esc(c.email || '')}"></label>
        <label class="f"><span>CPF / CNPJ</span><input class="in" name="documento" value="${esc(c.documento || '')}"></label>
        <label class="f"><span>CEP</span><input class="in" name="cep" inputmode="numeric" placeholder="00000-000" value="${esc(c.cep || '')}"></label>
      </div>
      <label class="f"><span>Endereço (rua, número, complemento)</span><input class="in" name="endereco" value="${esc(c.endereco || '')}"></label>
      <div class="grid3">
        <label class="f"><span>Bairro</span><input class="in" name="bairro" value="${esc(c.bairro || '')}"></label>
        <label class="f"><span>Cidade</span><input class="in" name="cidade" value="${esc(c.cidade || '')}"></label>
        <label class="f"><span>UF</span><input class="in" name="uf" maxlength="2" value="${esc(c.uf || 'MG')}"></label>
      </div>
      <div class="grid2">
        <label class="f"><span>Link da página NFC</span><input class="in" name="link_pagina" type="url" placeholder="https://…" value="${esc(c.link_pagina || '')}"></label>
        <label class="f"><span>Link de avaliação Google do cliente</span><input class="in" name="link_avaliacao" type="url" placeholder="https://g.page/r/…" value="${esc(c.link_avaliacao || '')}"></label>
      </div>
      <label class="f"><span>Tags (separadas por vírgula)</span><input class="in" name="tags" placeholder="Indicou clientes, Restaurante…" value="${esc((c.tags || []).join(', '))}"></label>
      <label class="f"><span>Observações</span><textarea class="in" name="observacoes">${esc(c.observacoes || '')}</textarea></label>
    </div>
    <div class="df"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn pri">Salvar</button></div></form>`, true);
  const f = ov.querySelector('#fc');
  // CEP: completa endereço pelo ViaCEP
  f.cep.onchange = async () => {
    const cep = f.cep.value.replace(/\D/g, ''); if (cep.length !== 8) return;
    try { const r = await (await fetch(`https://viacep.com.br/ws/${cep}/json/`)).json(); if (r.erro) return;
      if (!f.endereco.value) f.endereco.value = r.logradouro || ''; if (!f.bairro.value) f.bairro.value = r.bairro || ''; f.cidade.value = r.localidade || f.cidade.value; f.uf.value = r.uf || f.uf.value; } catch {}
  };
  f.onsubmit = async e => {
    e.preventDefault();
    const tel = normFone(f.telefone.value);
    if (f.telefone.value.trim() && tel.length < 12) return toast('Telefone inválido: informe com DDD', true);
    const row = {nome: f.nome.value.trim(), empresa: f.empresa.value.trim() || null, telefone: tel || null, email: f.email.value.trim().toLowerCase() || null,
      documento: f.documento.value.trim() || null, cep: f.cep.value.trim() || null, endereco: f.endereco.value.trim() || null, bairro: f.bairro.value.trim() || null,
      cidade: f.cidade.value.trim() || null, uf: f.uf.value.trim().toUpperCase() || null, link_pagina: f.link_pagina.value.trim() || null, link_avaliacao: f.link_avaliacao.value.trim() || null,
      tags: f.tags.value.split(',').map(t => t.trim()).filter(Boolean), observacoes: f.observacoes.value.trim() || null};
    if (c.id) row.id = c.id; else row.origem = 'manual';
    try { const s = await API.salvarCliente(row); toast('Cliente salvo'); ov.fechar(); cache.clear(); if (current === 'clientes') await viewClientes(); openCliente(s.id || c.id); }
    catch (er) { toast(er.message, true); }
  };
}

// ======================================================================
//  ASSINATURAS (mensalidades: manutenção da página NFC etc.)
// ======================================================================
const AS = {filtro: 'ativa'};
async function viewAssinaturas() {
  const as = await API.assinaturas();
  const ativas = as.filter(a => a.status === 'ativa'), mrr = ativas.reduce((s, a) => s + +a.valor, 0);
  const vencidas = ativas.filter(a => diasAte(a.proximo_vencimento) < 0), semana = ativas.filter(a => { const d = diasAte(a.proximo_vencimento); return d >= 0 && d <= 7; });
  const list = as.filter(a => AS.filtro === 'todas' || (AS.filtro === 'vencidas' ? a.status === 'ativa' && diasAte(a.proximo_vencimento) < 0 : a.status === AS.filtro));
  $('#view').innerHTML = header('Assinaturas', 'Mensalidades dos clientes (ex.: manutenção da página NFC)', `<button class="btn pri" id="novaAss">+ Nova assinatura</button>`) + `
    <div class="kpis">
      <div class="kpi hl"><span>Receita recorrente (mês)</span><b>${brl(mrr)}</b><small>${ativas.length} ativa${ativas.length === 1 ? '' : 's'}</small></div>
      <div class="kpi"><span>Receita anual prevista</span><b>${brl(mrr * 12)}</b><small>se todas continuarem</small></div>
      <div class="kpi"><span>Vencem em 7 dias</span><b>${semana.length}</b><small>${brl(semana.reduce((s, a) => s + +a.valor, 0))}</small></div>
      <div class="kpi"><span>Em atraso</span><b style="${vencidas.length ? 'color:var(--red)' : ''}">${vencidas.length}</b><small>${brl(vencidas.reduce((s, a) => s + +a.valor, 0))}</small></div>
    </div>
    <div class="bar"><div class="tabs">${[['ativa', 'Ativas'], ['vencidas', 'Em atraso'], ['pausada', 'Pausadas'], ['cancelada', 'Canceladas'], ['todas', 'Todas']].map(([k, t]) =>
      `<button data-af="${k}" class="${AS.filtro === k ? 'on' : ''}">${t}<em>${k === 'todas' ? as.length : k === 'vencidas' ? vencidas.length : as.filter(a => a.status === k).length}</em></button>`).join('')}</div></div>
    <div class="tbl-wrap"><table>
      <thead><tr><th>Cliente</th><th>Assinatura</th><th class="r">Valor</th><th>Próximo vencimento</th><th>Status</th><th class="r"></th></tr></thead>
      <tbody>${list.map(a => { const d = diasAte(a.proximo_vencimento);
        return `<tr data-as="${a.id}">
        <td><div class="who"><div class="av">${esc(initials(a.clientes?.nome))}</div><div><b>${esc(a.clientes?.nome || '—')}</b><span class="small mut">${esc(a.clientes?.empresa || '')}</span></div></div></td>
        <td class="small">${esc(a.descricao)}</td>
        <td class="num r strong">${brl(a.valor)}</td>
        <td class="small ${a.status === 'ativa' && d < 0 ? 'neg-txt strong' : a.status === 'ativa' && d <= 3 ? 'strong' : 'mut'}">${dOnly(a.proximo_vencimento)}${a.status === 'ativa' ? ` · ${d < 0 ? `atrasada ${-d} d` : d === 0 ? 'hoje' : `em ${d} d`}` : ''}</td>
        <td><span class="pill a-${a.status}">${{ativa: 'Ativa', pausada: 'Pausada', cancelada: 'Cancelada'}[a.status]}</span></td>
        <td class="r"><span class="acts-cell">
          ${a.status === 'ativa' ? `<button class="btn sm pri" data-pg="${a.id}" title="Registrar pagamento e passar para o próximo mês">Recebido</button>` : ''}
          ${a.clientes?.telefone && a.status === 'ativa' ? `<a class="btn sm ghost ic wa-btn" href="#mensagens?ass=${a.id}" title="Mensagem de cobrança">${IC.wa}</a>` : ''}
          <button class="btn sm ghost ic" data-ea="${a.id}" title="Editar">${IC.edit}</button></span></td></tr>`; }).join('')}</tbody>
    </table>${list.length ? '' : '<div class="empty">Nenhuma assinatura aqui</div>'}</div>`;
  document.querySelectorAll('[data-af]').forEach(b => b.onclick = () => { AS.filtro = b.dataset.af; viewAssinaturas(); });
  $('#novaAss').onclick = () => formAssinatura();
  document.querySelectorAll('[data-ea]').forEach(b => b.onclick = () => formAssinatura(as.find(a => a.id === b.dataset.ea)));
  document.querySelectorAll('[data-pg]').forEach(b => b.onclick = async () => {
    const a = as.find(x => x.id === b.dataset.pg);
    if (!confirm(`Registrar o pagamento de ${brl(a.valor)} (${a.clientes?.nome}, vencimento ${dOnly(a.proximo_vencimento)})?`)) return;
    b.disabled = true;
    try { await API.registrarPagamento(a); toast(`Pagamento registrado · próximo vencimento ${dOnly(somaMes(a.proximo_vencimento))}`); viewAssinaturas(); atualizarContadores(); }
    catch (e) { toast(e.message, true); b.disabled = false; }
  });
}

async function formAssinatura(a = {}) {
  fecharModais();
  const [clis, prods] = await Promise.all([API.clientes(), API.produtos()]);
  const rec = prods.filter(p => p.recorrente && p.ativo);
  const venc0 = a.proximo_vencimento || dayKey(Date.now() + 30 * 864e5);
  const pags = a.id ? await API.pagamentos(a.id).catch(() => []) : [];
  const ov = modal(`<form id="fa"><div class="dh"><h2>${a.id ? 'Editar assinatura' : 'Nova assinatura'}</h2><button type="button" class="x" data-close>${ICON_X}</button></div>
    <div class="db">
      <label class="f"><span>Cliente</span><select class="in" name="cliente_id" required><option value="">Selecione…</option>${clis.map(c => `<option value="${c.id}" ${c.id === a.cliente_id ? 'selected' : ''}>${esc(c.nome)}${c.empresa ? ` · ${esc(c.empresa)}` : ''}</option>`).join('')}</select></label>
      <div class="grid2">
        <label class="f"><span>Plano mensal</span><select class="in" name="produto_id"><option value="">Personalizado</option>${rec.map(p => `<option value="${p.id}" ${p.id === a.produto_id ? 'selected' : ''}>${esc(p.nome)} · ${brl(p.preco)}</option>`).join('')}</select></label>
        <label class="f"><span>Descrição</span><input class="in" name="descricao" required value="${esc(a.descricao || rec[0]?.nome || 'Manutenção mensal')}"></label>
        <label class="f"><span>Valor mensal (R$)</span><input class="in" name="valor" inputmode="decimal" required value="${esc(fmtNum(a.valor ?? rec[0]?.preco ?? 0))}"></label>
        <label class="f"><span>Próximo vencimento</span><input class="in" type="date" name="venc" required value="${esc(venc0)}"></label>
        <label class="f"><span>Forma de pagamento</span><select class="in" name="forma_pagamento">${Object.entries(PAG).map(([k, l]) => `<option value="${k}" ${k === (a.forma_pagamento || 'pix') ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="f"><span>Status</span><select class="in" name="status">${['ativa', 'pausada', 'cancelada'].map(s => `<option value="${s}" ${s === (a.status || 'ativa') ? 'selected' : ''}>${s[0].toUpperCase() + s.slice(1)}</option>`).join('')}</select></label>
      </div>
      <label class="f"><span>Observações</span><textarea class="in" name="observacoes">${esc(a.observacoes || '')}</textarea></label>
      ${pags.length ? `<div class="sec-t">Pagamentos recebidos</div><div class="sumbox">${pags.slice(0, 12).map(p => `<div class="li small"><span>Vencimento ${dOnly(p.referencia)} · pago em ${dOnly(p.pago_em)}</span><span class="num">${brl(p.valor)}</span></div>`).join('')}</div>` : ''}
    </div>
    <div class="df"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn pri">Salvar</button></div></form>`, true);
  const f = ov.querySelector('#fa');
  f.produto_id.onchange = () => { const p = rec.find(x => x.id === f.produto_id.value); if (p) { f.descricao.value = p.nome; f.valor.value = fmtNum(p.preco); } };
  f.onsubmit = async e => {
    e.preventDefault();
    const valor = parseNum(f.valor.value); if (!(valor >= 0)) return toast('Valor inválido', true);
    const row = {cliente_id: f.cliente_id.value, produto_id: f.produto_id.value || null, descricao: f.descricao.value.trim(), valor: Math.round(valor * 100) / 100,
      proximo_vencimento: f.venc.value, dia_vencimento: Math.min(28, +f.venc.value.slice(8) || 10), forma_pagamento: f.forma_pagamento.value, status: f.status.value,
      observacoes: f.observacoes.value.trim() || null, cancelada_em: f.status.value === 'cancelada' && a.status !== 'cancelada' ? new Date().toISOString() : a.cancelada_em || null};
    if (a.id) row.id = a.id;
    try { await API.salvarAssinatura(row); toast('Assinatura salva'); ov.fechar(); location.hash === '#assinaturas' ? viewAssinaturas() : (location.hash = '#assinaturas'); atualizarContadores(); }
    catch (er) { toast(er.message, true); }
  };
}

// ======================================================================
//  PRODUTOS
// ======================================================================
const PR = {cat: 'todas', q: ''};
const BAIXO = 3;
async function viewProdutos(silent) {
  if (silent && document.activeElement?.closest?.('#prodTbl')) return;
  const prods = await API.produtos();
  const cats = [...new Set([...CATS, ...prods.map(p => p.categoria)])].filter(c => prods.some(p => p.categoria === c));
  if (PR.cat !== 'todas' && !cats.includes(PR.cat)) PR.cat = 'todas';
  const alerta = prods.filter(p => p.ativo && p.estoque != null && p.estoque <= BAIXO);
  const semPreco = prods.filter(p => p.ativo && !(+p.preco > 0));
  $('#view').innerHTML = header('Produtos', 'Cartões NFC, cartões Google Avaliação, espelhos, planos e serviços. O agente de WhatsApp consulta os preços daqui.',
    `<button class="btn pri" id="novoProd">+ Produto</button>`) + `
    ${alerta.length ? `<div class="note"><b>Repor estoque:</b> ${alerta.map(p => `${esc(p.nome)} (${p.estoque})`).join(' · ')}</div>` : ''}
    ${semPreco.length ? `<div class="note">Sem preço definido: ${semPreco.map(p => esc(p.nome)).join(' · ')}. Clique no preço para preencher.</div>` : ''}
    <div class="bar">
      <div class="tabs" id="catTabs">${['todas', ...cats].map(c => `<button class="${PR.cat === c ? 'on' : ''}" data-cat="${esc(c)}">${c === 'todas' ? 'Todas' : esc(c)}<em>${c === 'todas' ? prods.length : prods.filter(p => p.categoria === c).length}</em></button>`).join('')}</div>
      <div class="search">${ICON_SEARCH}<input class="in" id="prodQ" placeholder="Buscar produto" value="${esc(PR.q)}"></div>
    </div>
    <div class="tbl-wrap" id="prodTbl"></div>`;
  const render = () => {
    const q = PR.q.trim().toLowerCase();
    const list = prods.filter(p => (PR.cat === 'todas' || p.categoria === PR.cat) && (!q || p.nome.toLowerCase().includes(q)));
    $('#prodTbl').innerHTML = `<table>
      <thead><tr><th>Produto</th><th>Categoria</th><th class="r">Preço (R$)</th><th class="r">Estoque</th><th>Ativo</th><th></th></tr></thead>
      <tbody>${list.map(p => `<tr data-id="${p.id}" class="${p.ativo ? '' : 'dim'}">
        <td><b>${esc(p.nome)}</b>${p.recorrente ? ' <span class="tag ac">mensal</span>' : ''}<div class="small mut">${esc(p.descricao || '')}</div></td>
        <td><span class="tag">${esc(p.categoria)}</span></td>
        <td class="r"><input class="in cell num" data-f="preco" inputmode="decimal" value="${esc(fmtNum(p.preco))}"></td>
        <td class="r"><div class="stock"><button class="btn sm" data-stp="-1" title="Tirar 1">−</button>
          <input class="in cell num" data-f="estoque" inputmode="numeric" placeholder="∞" title="Vazio = sem controle de estoque" value="${p.estoque ?? ''}">
          <button class="btn sm" data-stp="1" title="Somar 1">+</button></div></td>
        <td><label class="sw" title="Ativo (aparece nos pedidos e para o agente)"><input type="checkbox" data-f="ativo" ${p.ativo ? 'checked' : ''}><i></i></label></td>
        <td class="r"><span class="acts-cell"><button class="btn sm ghost ic" data-ep title="Editar">${IC.edit}</button><button class="btn sm ghost ic danger" data-dp title="Excluir">${IC.lixo}</button></span></td></tr>`).join('')}</tbody>
    </table>${list.length ? '' : '<div class="empty">Nenhum produto</div>'}`;
    let fila = Promise.resolve();
    const salvar = (p, patch, msg) => { Object.assign(p, patch); fila = fila.then(() => API.atualizarProduto(p.id, patch)).then(() => toast(msg)).catch(er => toast(er.message, true)); };
    $('#prodTbl').querySelectorAll('tr[data-id]').forEach(tr => {
      const p = prods.find(x => x.id === tr.dataset.id), preco = tr.querySelector('[data-f="preco"]'), est = tr.querySelector('[data-f="estoque"]');
      preco.onchange = () => { const v = parseNum(preco.value); if (!(v >= 0)) { preco.value = fmtNum(p.preco); return toast('Preço inválido', true); }
        const r = Math.round(v * 100) / 100; preco.value = fmtNum(r); if (r !== +p.preco) salvar(p, {preco: r}, `${p.nome}: ${brl(r)}`); };
      est.onchange = () => { const v = est.value.trim() === '' ? null : Math.max(0, Math.floor(parseNum(est.value) || 0)); est.value = v ?? '';
        if (v !== p.estoque) salvar(p, {estoque: v}, v == null ? `${p.nome}: sem controle de estoque` : `${p.nome}: estoque ${v}`); };
      tr.querySelectorAll('[data-stp]').forEach(b => b.onclick = () => { const v = Math.max(0, (p.estoque ?? 0) + +b.dataset.stp); est.value = v; if (v !== p.estoque) salvar(p, {estoque: v}, `${p.nome}: estoque ${v}`); });
      [preco, est].forEach(i => i.onkeydown = e => { if (e.key === 'Enter') i.blur(); });
      tr.querySelector('[data-f="ativo"]').onchange = e => { salvar(p, {ativo: e.target.checked}, e.target.checked ? `${p.nome} ativado` : `${p.nome} desativado`); tr.classList.toggle('dim', !e.target.checked); };
      tr.querySelector('[data-ep]').onclick = () => formProduto(p);
      tr.querySelector('[data-dp]').onclick = async () => { if (!confirm(`Excluir "${p.nome}"? Os pedidos antigos continuam com o nome dele.`)) return;
        try { await API.excluirProduto(p.id); toast(`${p.nome} excluído`); viewProdutos(); } catch (er) { toast(er.message, true); } };
    });
  };
  render();
  $('#prodQ').oninput = e => { PR.q = e.target.value; render(); };
  document.querySelectorAll('#catTabs [data-cat]').forEach(b => b.onclick = () => { PR.cat = b.dataset.cat; document.querySelectorAll('#catTabs button').forEach(x => x.classList.toggle('on', x === b)); render(); });
  $('#novoProd').onclick = () => formProduto({ativo: true, categoria: PR.cat !== 'todas' ? PR.cat : 'Cartões NFC'});
}

function formProduto(p = {ativo: true}) {
  const ov = modal(`<form id="fpr"><div class="dh"><h2>${p.id ? 'Editar produto' : 'Novo produto'}</h2><button type="button" class="x" data-close>${ICON_X}</button></div>
    <div class="db">
      <label class="f"><span>Nome</span><input class="in" name="nome" required maxlength="120" value="${esc(p.nome || '')}"></label>
      <div class="grid2">
        <label class="f"><span>Categoria</span><input class="in" name="categoria" list="dlCat" required value="${esc(p.categoria || '')}"></label>
        <label class="f"><span>Preço (R$)</span><input class="in" name="preco" inputmode="decimal" required value="${esc(p.preco != null ? fmtNum(p.preco) : '')}"></label>
        <label class="f"><span>Estoque (vazio = sem controle)</span><input class="in" name="estoque" inputmode="numeric" placeholder="∞" value="${p.estoque ?? ''}"></label>
      </div>
      <datalist id="dlCat">${CATS.map(c => `<option value="${c}">`).join('')}</datalist>
      <label class="f"><span>Descrição (o agente usa para explicar o produto)</span><input class="in" name="descricao" maxlength="200" value="${esc(p.descricao || '')}"></label>
      <label class="check"><input type="checkbox" name="recorrente" ${p.recorrente ? 'checked' : ''}> Cobrança mensal (vira assinatura)</label>
      <label class="check"><input type="checkbox" name="ativo" ${p.ativo ? 'checked' : ''}> Ativo (aparece nos pedidos e para o agente)</label>
    </div>
    <div class="df"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn pri">Salvar</button></div></form>`, true);
  const f = ov.querySelector('#fpr');
  f.onsubmit = async e => { e.preventDefault();
    const preco = parseNum(f.preco.value); if (!(preco >= 0)) return toast('Preço inválido', true);
    const row = {id: p.id, nome: f.nome.value.trim(), categoria: f.categoria.value.trim() || 'Outros', preco: Math.round(preco * 100) / 100, descricao: f.descricao.value.trim() || null,
      estoque: f.estoque.value.trim() === '' ? null : Math.max(0, Math.floor(parseNum(f.estoque.value) || 0)), recorrente: f.recorrente.checked, ativo: f.ativo.checked};
    if (!row.id) delete row.id;
    try { await API.salvarProduto(row); toast('Produto salvo'); ov.fechar(); (current === 'margem' ? viewMargem : viewProdutos)(); } catch (er) { toast(er.message, true); } };
}

// ======================================================================
//  MARGEM DE LUCRO — custo, frete, impostos e lucro de cada produto (só a equipe vê)
// ======================================================================
const MG = {cat: 'todas', q: ''};
const juntarCustos = (prods, custos) => { const cm = new Map(custos.map(c => [c.produto_id, c]));
  return prods.map(p => { const c = cm.get(p.id) || {}; return {...p, custo: c.custo ?? null, frete: c.frete ?? 0, taxa_pct: c.taxa_pct ?? 0, fornecedor: c.fornecedor ?? null}; }); };
// taxas = (custo + frete) × %; lucro = preço − (custo + frete + taxas); margem = lucro ÷ preço
const calcMg = r => { const base = (+r.custo || 0) + (+r.frete || 0), taxas = base * (+r.taxa_pct || 0) / 100, preco = +r.preco || 0, lucro = preco - base - taxas;
  return {base, taxas, lucro, pct: preco ? lucro / preco * 100 : 0, ok: r.custo != null && preco > 0}; };
const mgPill = m => !m.ok ? '<span class="mgp" title="Falta o custo ou o preço">—</span>' : `<span class="mgp ${m.pct < 0 ? 'neg' : m.pct < 30 ? 'low' : m.pct < 50 ? 'mid' : 'hi'}">${fmtNum(m.pct, 1)}%</span>`;
const fmtCampo = (k, v) => (k === 'frete' || k === 'taxa_pct') && !+v ? '' : fmtNum(v);

async function viewMargem(silent) {
  if (silent && document.activeElement?.closest?.('#mgTbl')) return;
  const [prods, custos] = await Promise.all([API.produtos(), API.custos()]);
  const rows = juntarCustos(prods, custos);
  const cats = [...new Set([...CATS, ...rows.map(p => p.categoria)])].filter(c => rows.some(p => p.categoria === c));
  const kpis = () => { const ms = rows.filter(r => r.ativo).map(calcMg).filter(m => m.ok), avg = f => ms.length ? ms.reduce((s, m) => s + f(m), 0) / ms.length : 0;
    return `<div class="kpi hl"><span>Margem média</span><b>${fmtNum(avg(m => m.pct), 1)}%</b><small>${ms.length} produtos com custo</small></div>
      <div class="kpi"><span>Lucro médio por venda</span><b>${brl(avg(m => m.lucro))}</b><small>produtos ativos</small></div>
      <div class="kpi"><span>Margem abaixo de 30%</span><b style="${ms.filter(m => m.pct < 30).length ? 'color:var(--amber)' : ''}">${ms.filter(m => m.pct < 30).length}</b><small>revise o preço</small></div>
      <div class="kpi"><span>Sem custo informado</span><b>${rows.filter(r => r.ativo && r.custo == null).length}</b><small>preencha para calcular</small></div>`; };
  $('#view').innerHTML = header('Margem de lucro', 'Custo, frete, impostos e lucro de cada produto. O preço é o mesmo da tela Produtos. Custos só a equipe vê.',
    `<button class="btn" id="mgCsv">${IC.csv}Exportar CSV</button><button class="btn pri" id="mgNovo">+ Produto</button>`) + `
    <div class="kpis" id="mgKpis">${kpis()}</div>
    <div class="bar"><div class="tabs" id="mgTabs">${['todas', ...cats].map(c => `<button class="${MG.cat === c ? 'on' : ''}" data-cat="${esc(c)}">${c === 'todas' ? 'Todas' : esc(c)}</button>`).join('')}</div>
      <div class="search">${ICON_SEARCH}<input class="in" id="mgQ" placeholder="Buscar produto ou fornecedor" value="${esc(MG.q)}"></div></div>
    <div class="tbl-wrap" id="mgTbl"></div>`;
  const cel = (r, k) => `<input class="in cell num" data-f="${k}" inputmode="decimal" placeholder="${k === 'custo' ? '—' : '0'}" value="${esc(fmtCampo(k, r[k]))}">`;
  const pinta = (tr, r) => { const m = calcMg(r);
    tr.querySelector('[data-c="taxas"]').textContent = brl(m.taxas);
    const l = tr.querySelector('[data-c="lucro"]'); l.textContent = m.ok ? brl(m.lucro) : '—'; l.classList.toggle('neg-txt', m.ok && m.lucro < 0);
    tr.querySelector('[data-c="pct"]').innerHTML = mgPill(m); };
  const render = () => {
    const q = MG.q.trim().toLowerCase();
    const list = rows.filter(r => (MG.cat === 'todas' || r.categoria === MG.cat) && (!q || `${r.nome} ${r.fornecedor || ''}`.toLowerCase().includes(q)));
    $('#mgTbl').innerHTML = `<table>
      <thead><tr><th>Produto</th><th class="r">Custo (R$)</th><th class="r">Frete (R$)</th><th class="r">Imp. (%)</th><th class="r">Preço (R$)</th><th class="r">Taxas</th><th class="r">Lucro líq.</th><th class="r">Margem</th><th>Fornecedor</th><th></th></tr></thead>
      <tbody>${list.map(r => `<tr data-id="${r.id}" class="${r.ativo ? '' : 'dim'}">
        <td><input class="in cell nome" data-f="nome" maxlength="120" value="${esc(r.nome)}" title="Clique para alterar o nome"></td>
        <td class="r">${cel(r, 'custo')}</td><td class="r">${cel(r, 'frete')}</td><td class="r">${cel(r, 'taxa_pct')}</td>
        <td class="r"><input class="in cell num" data-f="preco" inputmode="decimal" value="${esc(fmtNum(r.preco))}"></td>
        <td class="r num mut small" data-c="taxas"></td><td class="r num strong" data-c="lucro"></td><td class="r" data-c="pct"></td>
        <td><input class="in cell forn" data-f="fornecedor" placeholder="—" value="${esc(r.fornecedor || '')}">${isUrl(r.fornecedor) ? `<a class="lk" href="${esc(r.fornecedor)}" target="_blank" rel="noopener">↗</a>` : ''}</td>
        <td class="r"><span class="acts-cell"><button class="btn sm ghost" data-ec="${r.id}">Calcular</button><button class="btn sm ghost ic danger" data-dp="${r.id}" title="Excluir">${IC.lixo}</button></span></td></tr>`).join('')}</tbody>
    </table>${list.length ? '' : '<div class="empty">Nenhum produto</div>'}`;
    const tbl = $('#mgTbl');
    tbl.querySelectorAll('tr[data-id]').forEach(tr => pinta(tr, rows.find(x => x.id === tr.dataset.id)));
    tbl.oninput = e => { const tr = e.target.closest('tr[data-id]'); if (!tr) return; const d = {...rows.find(x => x.id === tr.dataset.id)};
      tr.querySelectorAll('.num[data-f]').forEach(c => { const v = parseNum(c.value); if (!Number.isNaN(v)) d[c.dataset.f] = v ?? (c.dataset.f === 'custo' ? null : 0); }); pinta(tr, d); };
    tbl.onchange = async e => {
      const i = e.target.closest('[data-f]'); if (!i) return;
      const tr = i.closest('tr'), r = rows.find(x => x.id === tr.dataset.id), k = i.dataset.f;
      const volta = () => { i.value = k === 'fornecedor' ? (r.fornecedor || '') : k === 'nome' ? r.nome : k === 'preco' ? fmtNum(r.preco) : fmtCampo(k, r[k]); pinta(tr, r); };
      let v;
      if (k === 'nome') { v = i.value.trim().replace(/\s+/g, ' '); if (!v) { toast('O nome não pode ficar vazio', true); return volta(); } }
      else if (k === 'fornecedor') v = i.value.trim() || null;
      else { v = parseNum(i.value); if (v == null) v = k === 'custo' ? null : 0;
        if (Number.isNaN(v) || v < 0) { i.classList.add('bad'); return toast('Valor inválido: use números positivos, ex. 8,90', true); }
        if (v != null) v = Math.round(v * 100) / 100; }
      i.classList.remove('bad');
      if (v === r[k] || (typeof v === 'number' && r[k] != null && +v === +r[k])) return volta();
      const antes = r[k]; r[k] = v; volta();
      try {
        if (k === 'preco' || k === 'nome') await API.atualizarProduto(r.id, {[k]: v}); else await API.salvarCusto(r.id, {[k]: v});
        toast(`${r.nome}: salvo`); $('#mgKpis').innerHTML = kpis();
      } catch (er) { r[k] = antes; volta(); toast(er.message, true); }
    };
    tbl.onkeydown = e => { const i = e.target.closest('[data-f]'); if (!i || e.key !== 'Enter') return; e.preventDefault();
      const trs = [...tbl.querySelectorAll('tr[data-id]')], prox = trs[trs.indexOf(i.closest('tr')) + (e.shiftKey ? -1 : 1)];
      const alvo = prox?.querySelector(`[data-f="${i.dataset.f}"]`); alvo ? (alvo.focus(), alvo.select()) : i.blur(); };
    tbl.querySelectorAll('[data-ec]').forEach(b => b.onclick = () => formCusto(rows.find(x => x.id === b.dataset.ec)));
    tbl.querySelectorAll('[data-dp]').forEach(b => b.onclick = async () => { const r = rows.find(x => x.id === b.dataset.dp);
      if (!confirm(`Excluir "${r.nome}"? Os pedidos antigos continuam com o nome dele.`)) return;
      try { await API.excluirProduto(r.id); rows.splice(rows.indexOf(r), 1); toast(`${r.nome} excluído`); render(); $('#mgKpis').innerHTML = kpis(); } catch (er) { toast(er.message, true); } });
  };
  render();
  $('#mgTbl').addEventListener('focusin', e => { if (e.target.matches('[data-f]')) e.target.select(); });
  $('#mgQ').oninput = e => { MG.q = e.target.value; render(); };
  document.querySelectorAll('#mgTabs [data-cat]').forEach(b => b.onclick = () => { MG.cat = b.dataset.cat; document.querySelectorAll('#mgTabs button').forEach(x => x.classList.toggle('on', x === b)); render(); });
  $('#mgNovo').onclick = () => formProduto({ativo: true, categoria: MG.cat !== 'todas' ? MG.cat : 'Cartões NFC'});
  $('#mgCsv').onclick = () => baixarCsv('margem-de-lucro-saturno-nfc.csv', ['Categoria', 'Produto', 'Custo', 'Frete', 'Impostos (%)', 'Preço', 'Taxas', 'Lucro líquido', 'Margem (%)', 'Fornecedor'],
    rows.map(r => { const m = calcMg(r); return [r.categoria, r.nome, fmtNum(r.custo), fmtNum(r.frete), fmtNum(r.taxa_pct), fmtNum(r.preco), fmtNum(m.taxas), m.ok ? fmtNum(m.lucro) : '', m.ok ? fmtNum(m.pct) : '', r.fornecedor || '']; }));
}

// calculadoras: custo pela quantidade comprada e preço pela margem desejada
function formCusto(r) {
  const campo = (n, l, ph) => `<label class="f"><span>${l}</span><input class="in" name="${n}" inputmode="decimal" placeholder="${ph}" value="${esc(n === 'preco' ? fmtNum(r.preco) : fmtCampo(n, r[n]))}"></label>`;
  const ov = modal(`<form id="fcu"><div class="dh"><div><h2>Custos · ${esc(r.nome)}</h2><div class="small mut">${esc(r.categoria)}</div></div><button type="button" class="x" data-close>${ICON_X}</button></div>
    <div class="db">
      <div class="grid2">${campo('custo', 'Custo do produto (R$)', '0,00')}${campo('frete', 'Frete (R$)', '0,00')}${campo('taxa_pct', 'Impostos/taxas (%)', '0')}${campo('preco', 'Preço de venda (R$)', '0,00')}</div>
      <details class="box"><summary>Calcular custo unitário pelo lote comprado</summary>
        <div class="calc-row"><label class="f"><span>Valor do lote (R$)</span><input class="in" id="cxPreco" inputmode="decimal" placeholder="250,00"></label>
          <label class="f"><span>Unidades no lote</span><input class="in" id="cxQtd" inputmode="numeric" placeholder="50"></label>
          <button type="button" class="btn" id="cxApl">Usar como custo</button></div></details>
      <div class="sumbox" id="mgPrev"></div>
      <div class="calc-row"><label class="f"><span>Margem desejada (%)</span><input class="in" id="alvo" inputmode="decimal" placeholder="ex: 60"></label><button type="button" class="btn" id="alvoApl">Calcular preço de venda</button></div>
      <label class="f"><span>Fornecedor (nome ou link)</span><input class="in" name="fornecedor" value="${esc(r.fornecedor || '')}"></label>
    </div>
    <div class="df"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn pri">Salvar</button></div></form>`, true);
  const f = ov.querySelector('#fcu');
  const ler = () => ({custo: parseNum(f.custo.value), frete: parseNum(f.frete.value) ?? 0, taxa_pct: parseNum(f.taxa_pct.value) ?? 0, preco: parseNum(f.preco.value) ?? 0});
  const prev = () => { const v = ler(); if (Object.values(v).some(Number.isNaN)) return ov.querySelector('#mgPrev').innerHTML = '<div class="small neg-txt">Confira os números digitados</div>';
    const m = calcMg(v); ov.querySelector('#mgPrev').innerHTML = `<div class="li mut small"><span>Custo + frete</span><span class="num">${brl(m.base)}</span></div>
      <div class="li mut small"><span>Impostos/taxas</span><span class="num">${brl(m.taxas)}</span></div>
      <div class="li"><span>Lucro líquido por unidade</span><span class="num strong ${m.ok && m.lucro < 0 ? 'neg-txt' : ''}">${m.ok ? brl(m.lucro) : '—'}</span></div>
      <div class="li tot"><span>Margem de lucro</span>${mgPill(m)}</div>`; };
  f.addEventListener('input', prev); prev();
  ov.querySelector('#cxApl').onclick = () => { const cx = parseNum(ov.querySelector('#cxPreco').value), q = parseNum(ov.querySelector('#cxQtd').value);
    if (!(cx >= 0) || !(q > 0)) return toast('Informe o valor do lote e a quantidade', true); f.custo.value = fmtNum(Math.round(cx / q * 100) / 100); prev(); };
  ov.querySelector('#alvoApl').onclick = () => { const a = parseNum(ov.querySelector('#alvo').value), v = ler();
    if (!(a >= 0 && a < 100)) return toast('Margem desejada deve ficar entre 0 e 99%', true);
    if (v.custo == null || Number.isNaN(v.custo)) return toast('Preencha o custo primeiro', true);
    const m = calcMg({...v, preco: 1}); f.preco.value = fmtNum((m.base + m.taxas) / (1 - a / 100)); prev(); };
  f.onsubmit = async e => { e.preventDefault();
    const v = ler(), r2 = x => x == null ? null : Math.round(x * 100) / 100;
    if (Object.values(v).some(x => Number.isNaN(x) || x < 0)) return toast('Confira os números: use só valores positivos', true);
    try { await API.salvarCusto(r.id, {custo: r2(v.custo), frete: r2(v.frete), taxa_pct: r2(v.taxa_pct), fornecedor: f.fornecedor.value.trim() || null});
      if (r2(v.preco) !== +r.preco) await API.atualizarProduto(r.id, {preco: r2(v.preco)});
      toast('Custos salvos'); ov.fechar(); viewMargem(); } catch (er) { toast(er.message, true); } };
}
