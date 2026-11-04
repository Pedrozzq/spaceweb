// =====================================================================
//  SATURNO NFC · CRM — Fluxo de caixa (abas "Caixa" e "Pró-labore")
//   · Entram sozinhas: pedidos, vendas ganhas sem pedido e mensalidades recebidas.
//   · Sai sozinho: o custo mensal das plataformas ativas (tela Plataformas).
//   · O resto (produção, frete, impostos, pró-labore, aportes…) é lançado à mão (supabase/caixa.sql).
// =====================================================================
'use strict';

const fxAbas = ab => `<div class="tabs fx-abas"><a href="#fluxo" class="${ab === 'caixa' ? 'on' : ''}">Caixa</a><a href="#prolabore" class="${ab === 'prolabore' ? 'on' : ''}">Pró-labore</a></div>`;
const fxMesAdd = (m, n) => { const [a, b] = m.split('-').map(Number); return new Date(Date.UTC(a, b - 1 + n, 1)).toISOString().slice(0, 7); };
const fxNomeMes = m => { const s = mesLongo(m).replace(' de ', ' '); return s[0].toUpperCase() + s.slice(1); };   // "Novembro 2026"
const FX_CAT = {
  entrada: ['Venda fora da CRM', 'Aporte de sócio', 'Empréstimo', 'Outras entradas'],
  saida: ['Produção (cartões, espelhos)', 'Fornecedores', 'Frete e envio', 'Funcionários', 'Pró-labore', 'Impostos', 'Taxas (maquininha, Stripe)',
    'Marketing e anúncios', 'Aluguel', 'Contas (luz, água, internet)', 'Outras saídas']};
const FX_FORMAS = ['Pix', 'Dinheiro', 'Cartão', 'Boleto', 'Transferência'];

// receitas automáticas (mesma conta da Visão geral) a partir de um mês
async function fxReceitas(de) {
  const [leads, peds, assin, pags, plats] = await Promise.all([cache.leads(), cache.pedidos(), API.assinaturas().catch(() => []),
    API.pagamentosTodos(de + '-01T00:00:00Z').catch(() => []), API.plataformas().catch(() => [])]);
  const ok = peds.filter(contaVenda);
  const comPedido = new Set(peds.map(p => p.lead_id).filter(Boolean));
  const ganhos = leads.filter(l => l.etapa === 'ganho' && +l.valor > 0 && !comPedido.has(l.id));
  const ativas = plats.filter(p => p.ativo);
  return {ok, ganhos, assin, pags, ativas, platMes: ativas.reduce((s, p) => s + plMes(p), 0)};
}

// ======================================================================
//  CAIXA
// ======================================================================
var fxMes = null, fxFiltro = 'tudo';
async function viewFluxo() {
  const mesAtual = mesKey(Date.now()), mes = fxMes || mesAtual;
  const ini = fxMesAdd(mesAtual, -11);   // 12 meses para o histórico
  const de = mes < ini ? mes : ini;
  const [r, lancs] = await Promise.all([fxReceitas(de), API.caixa(de + '-01')]);
  const sub = 'Tudo o que entrou e saiu do caixa da Saturno no mês.';
  if (lancs === null) {
    $('#view').innerHTML = header('Fluxo de caixa', sub) + fxAbas('caixa') + `<div class="card"><h3>Falta um passo no Supabase</h3>
      <p class="mut">Para lançar despesas e outras entradas, rode o arquivo <code>supabase/caixa.sql</code> uma vez no Supabase (SQL Editor → New query → cole → Run) e recarregue a CRM.</p></div>`;
    return;
  }
  // movimentos automáticos (pedidos, vendas ganhas, mensalidades, plataformas) + lançamentos à mão
  const movs = [];
  const porDia = (lista, dataDe, valorDe) => { const m = new Map();
    lista.forEach(x => { const d = dayKey(dataDe(x)); if (d.slice(0, 7) < de) return; const v = m.get(d) || {n: 0, t: 0}; v.n++; v.t += +valorDe(x) || 0; m.set(d, v); }); return m; };
  porDia(r.ok, p => p.criado_em, p => p.total).forEach((v, d) => movs.push({auto: 'Pedidos', data: d, tipo: 'entrada', categoria: 'Vendas', descricao: `${v.n} ${v.n === 1 ? 'pedido' : 'pedidos'}`, valor: v.t}));
  r.ganhos.forEach(l => { const d = dayKey(l.etapa_em); if (d.slice(0, 7) >= de)
    movs.push({auto: 'Leads', data: d, tipo: 'entrada', categoria: 'Venda ganha', descricao: `${l.nome}${l.interesse ? ' · ' + l.interesse : ''}`, valor: +l.valor}); });
  porDia(r.pags, p => p.pago_em, p => p.valor).forEach((v, d) => movs.push({auto: 'Assinaturas', data: d, tipo: 'entrada', categoria: 'Mensalidades', descricao: `${v.n} ${v.n === 1 ? 'mensalidade recebida' : 'mensalidades recebidas'}`, valor: v.t}));
  // plataformas: custo mensal das ativas, lançado no dia 1 de cada mês desde o início da Saturno
  if (r.platMes > 0) for (let m = de < INICIO_SATURNO ? INICIO_SATURNO : de; m <= mesAtual; m = fxMesAdd(m, 1))
    movs.push({auto: 'Plataformas', data: m + '-01', tipo: 'saida', categoria: 'Plataformas', descricao: `${r.ativas.length} ${r.ativas.length === 1 ? 'plataforma ativa' : 'plataformas ativas'}`, valor: r.platMes});
  lancs.forEach(l => movs.push({...l, valor: +l.valor || 0}));

  const doMes = m => movs.filter(x => x.data.slice(0, 7) === m);
  const soma = (lista, t) => lista.filter(x => x.tipo === t).reduce((a, x) => a + x.valor, 0);
  const lista = doMes(mes).sort((a, b) => b.data.localeCompare(a.data) || (a.auto ? 1 : 0) - (b.auto ? 1 : 0));
  const ent = soma(lista, 'entrada'), sai = soma(lista, 'saida'), res = ent - sai;
  const meses = Array.from({length: 12}, (_, k) => fxMesAdd(mesAtual, k - 11));
  let acum = 0;
  const hist = meses.map(m => { const l = doMes(m), e = soma(l, 'entrada'), s = soma(l, 'saida'); acum += e - s; return {m, e, s, r: e - s, acum}; });
  const maxH = Math.max(1, ...hist.map(h => Math.max(h.e, h.s)));
  const porCat = {}; lista.filter(x => x.tipo === 'saida').forEach(x => porCat[x.categoria] = (porCat[x.categoria] || 0) + x.valor);
  const cats = Object.entries(porCat).sort((a, b) => b[1] - a[1]);
  const vis = fxFiltro === 'tudo' ? lista : lista.filter(x => x.tipo === fxFiltro);
  const dataBR = d => d.slice(8, 10) + '/' + d.slice(5, 7);
  const vermelho = v => v < 0 ? 'style="color:var(--red)"' : '';
  const nomeCurto = m => fxNomeMes(m).split(' ')[0].toLowerCase();

  $('#view').innerHTML = header('Fluxo de caixa', sub, '<button class="btn" id="fxSaida">− Saída</button><button class="btn pri" id="fxEntrada">+ Entrada</button>') + fxAbas('caixa') + `
    <div class="fx-top">
      <span class="fx-nav"><button id="fxAnt" aria-label="Mês anterior">‹</button><b>${fxNomeMes(mes)}</b><button id="fxProx" aria-label="Próximo mês">›</button></span>
      ${mes !== mesAtual ? '<button class="btn sm ghost" id="fxHoje">Voltar para o mês atual</button>' : ''}
    </div>
    <div class="kpis">
      <div class="kpi"><span>Entradas</span><b style="color:var(--green)">${brl(ent)}</b><small>${lista.filter(x => x.tipo === 'entrada').length} lançamentos</small></div>
      <div class="kpi"><span>Saídas</span><b style="color:var(--red)">${brl(sai)}</b><small>${lista.filter(x => x.tipo === 'saida').length} lançamentos</small></div>
      <div class="kpi hl"><span>Resultado do mês</span><b ${vermelho(res)}>${brl(res)}</b><small>entradas − saídas</small></div>
      <div class="kpi"><span>Acumulado 12 meses</span><b ${vermelho(acum)}>${brl(acum)}</b><small>de ${nomeCurto(meses[0])} até agora</small></div>
    </div>
    <div class="fx-cols">
      <div class="card"><h3><span>Lançamentos de ${nomeCurto(mes)}</span>
        <span class="tabs soft">${[['tudo', 'Tudo'], ['entrada', 'Entradas'], ['saida', 'Saídas']].map(([k, l]) => `<button data-fxf="${k}" class="${fxFiltro === k ? 'on' : ''}">${l}</button>`).join('')}</span></h3>
        ${vis.length ? `<div class="fx-lista">${vis.map(x => `<div class="fx-li${x.auto ? '' : ' ed'}" ${x.auto ? '' : `data-fxed="${x.id}"`}>
            <span class="fx-dt">${dataBR(x.data)}</span>
            <span class="fx-tx"><b>${esc(x.categoria)}</b><small>${esc(x.descricao || '')}${x.forma ? ' · ' + esc(x.forma) : ''}${x.auto ? ` · <span class="tag">automático: ${esc(x.auto)}</span>` : ''}</small></span>
            <b class="num fx-v" style="color:var(${x.tipo === 'saida' ? '--red' : '--green'})">${x.tipo === 'saida' ? '−' : '+'} ${brl(x.valor)}</b></div>`).join('')}</div>`
          : `<div class="empty">Nenhum lançamento ${fxFiltro === 'tudo' ? '' : fxFiltro === 'entrada' ? 'de entrada ' : 'de saída '}neste mês.</div>`}
        <p class="small mut" style="margin-top:10px">Pedidos, vendas ganhas, mensalidades e plataformas entram sozinhos. Toque num lançamento feito à mão para editar ou excluir.</p></div>
      <div>
        <div class="card" style="margin-bottom:14px"><h3>Para onde foi o dinheiro</h3>
          ${cats.length ? cats.map(([c, v]) => `<div class="fx-cat"><div class="fx-cat-l"><span>${esc(c)}</span><b class="num">${brl(v)}</b></div><div class="fx-cat-b"><i style="width:${(v / cats[0][1] * 100).toFixed(1)}%"></i></div></div>`).join('')
            : '<div class="empty">Sem saídas neste mês.</div>'}</div>
        <div class="card"><h3>Últimos 12 meses</h3>
          <div class="fx-hist">${hist.map(h => `<button class="fx-hm${h.m === mes ? ' on' : ''}" data-fxm="${h.m}" title="${fxNomeMes(h.m)} · entradas ${brl(h.e)} · saídas ${brl(h.s)} · resultado ${brl(h.r)}">
            <span class="fx-bars"><i class="e" style="height:${(h.e / maxH * 100).toFixed(1)}%"></i><i class="s" style="height:${(h.s / maxH * 100).toFixed(1)}%"></i></span><small>${MESES[+h.m.slice(5) - 1]}</small></button>`).join('')}</div>
          <div class="ga-leg" style="margin-top:8px"><span><i style="background:var(--green)"></i>Entradas</span><span><i style="background:var(--red)"></i>Saídas</span></div>
          <div style="overflow:auto;margin-top:10px"><table class="pl-tab"><thead><tr><th>Mês</th><th class="r">Entradas</th><th class="r">Saídas</th><th class="r">Resultado</th><th class="r">Acumulado</th></tr></thead>
            <tbody>${[...hist].reverse().map(h => `<tr><td>${esc(fxNomeMes(h.m))}</td><td class="num r">${brl(h.e)}</td><td class="num r">${brl(h.s)}</td><td class="num r strong ${h.r < 0 ? 'neg-txt' : ''}">${brl(h.r)}</td><td class="num r ${h.acum < 0 ? 'neg-txt' : ''}">${brl(h.acum)}</td></tr>`).join('')}</tbody></table></div>
        </div>
      </div>
    </div>`;
  $('#fxAnt').onclick = () => { fxMes = fxMesAdd(mes, -1); viewFluxo(); };
  $('#fxProx').onclick = () => { fxMes = fxMesAdd(mes, 1); viewFluxo(); };
  if ($('#fxHoje')) $('#fxHoje').onclick = () => { fxMes = null; viewFluxo(); };
  document.querySelectorAll('[data-fxm]').forEach(b => b.onclick = () => { fxMes = b.dataset.fxm === mesAtual ? null : b.dataset.fxm; viewFluxo(); });
  document.querySelectorAll('[data-fxf]').forEach(b => b.onclick = () => { fxFiltro = b.dataset.fxf; viewFluxo(); });
  $('#fxEntrada').onclick = () => fxForm({tipo: 'entrada'}, mes);
  $('#fxSaida').onclick = () => fxForm({tipo: 'saida'}, mes);
  document.querySelectorAll('[data-fxed]').forEach(el => el.onclick = () => fxForm(lancs.find(l => l.id === el.dataset.fxed), mes));
}

// criar / editar um lançamento manual do caixa
function fxForm(l, mes) {
  const nova = !l.id, hoje = hojeKey();
  l = {data: mes === hoje.slice(0, 7) ? hoje : mes + '-01', categoria: '', descricao: '', valor: '', forma: 'Pix', ...l};
  const ov = modal(`<form id="ffx"><div class="dh"><div><h2>${nova ? (l.tipo === 'entrada' ? 'Nova entrada' : 'Nova saída') : 'Editar lançamento'}</h2>
      <div class="small mut">${nova ? 'Lançamento do caixa' : `Lançado ${ago(l.criado_em)}${l.criado_por ? ' por ' + esc(l.criado_por) : ''}`}</div></div><button type="button" class="x" data-close>${ICON_X}</button></div>
    <div class="db">
      <label class="f"><span>Tipo</span><select class="in" name="tipo"><option value="entrada" ${l.tipo === 'entrada' ? 'selected' : ''}>Entrada (dinheiro que entrou)</option><option value="saida" ${l.tipo === 'saida' ? 'selected' : ''}>Saída (dinheiro que saiu)</option></select></label>
      <div class="grid2">
        <label class="f"><span>Valor (R$)</span><input class="in num" name="valor" inputmode="decimal" required value="${l.valor ? fmtNum(l.valor) : ''}" placeholder="0,00"></label>
        <label class="f"><span>Data</span><input class="in" type="date" name="data" required value="${esc(l.data)}"></label>
        <label class="f"><span>Categoria</span><select class="in" name="categoria"></select></label>
        <label class="f"><span>Forma</span><select class="in" name="forma"><option value="">—</option>${FX_FORMAS.map(x => `<option ${x === l.forma ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
      </div>
      <label class="f"><span>Descrição (opcional)</span><input class="in" name="descricao" maxlength="160" value="${esc(l.descricao || '')}" placeholder="Ex.: lote de cartões NFC, DAS do mês"></label>
    </div>
    <div class="df">${nova ? '' : '<button type="button" class="btn ghost danger" id="fxDel">Excluir</button>'}<span style="flex:1"></span>
      <button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn pri">${nova ? 'Lançar' : 'Salvar'}</button></div></form>`, true);
  const f = ov.querySelector('#ffx');
  const cats = () => { const lst = FX_CAT[f.tipo.value], atual = l.categoria;
    f.categoria.innerHTML = [...lst, ...(atual && !lst.includes(atual) && l.tipo === f.tipo.value ? [atual] : [])].map(c => `<option ${c === atual ? 'selected' : ''}>${esc(c)}</option>`).join(''); };
  f.tipo.onchange = cats; cats();
  setTimeout(() => f.valor.focus(), 50);
  f.onsubmit = async e => {
    e.preventDefault();
    const v = parseNum(f.valor.value);
    if (!(v > 0)) return toast('Digite um valor maior que zero', true);
    if (!f.data.value) return toast('Escolha a data', true);
    const reg = {tipo: f.tipo.value, valor: Math.round(v * 100) / 100, data: f.data.value, categoria: f.categoria.value,
      forma: f.forma.value || null, descricao: f.descricao.value.trim() || null};
    if (nova) reg.criado_por = USER_EMAIL || null; else reg.id = l.id;
    try { await API.salvarLancamento(reg); toast(nova ? 'Lançamento feito' : 'Lançamento salvo'); ov.fechar();
      fxMes = reg.data.slice(0, 7) === mesKey(Date.now()) ? null : reg.data.slice(0, 7); viewFluxo(); }
    catch (er) { toast(er.message, true); }
  };
  if (!nova) ov.querySelector('#fxDel').onclick = async () => {
    if (!confirm('Excluir este lançamento do caixa?')) return;
    try { await API.excluirLancamento(l.id); toast('Lançamento excluído'); ov.fechar(); viewFluxo(); } catch (er) { toast(er.message, true); }
  };
}

// ======================================================================
//  PRÓ-LABORE: divide o lucro estimado entre o que fica na empresa e o que vai para os sócios.
//  O lucro é o mesmo do gráfico "Lucro estimado" da Visão geral:
//  faturamento − custo de produção (tela Margem de lucro) − plataformas ativas.
//  Os percentuais ficam salvos neste aparelho.
// ======================================================================
async function calcLucroMeses() {
  const mes0 = mesKey(Date.now());
  const meses = Array.from({length: 12}, (_, k) => fxMesAdd(mes0, k - 11));
  const [r, prods, custos] = await Promise.all([fxReceitas(meses[0]), API.produtos().catch(() => []), API.custos().catch(() => [])]);
  const prodCusto = new Map(prods.map(p => { const c = custos.find(x => x.produto_id === p.id); if (!c || c.custo == null) return [p.id, null]; const m = calcMg({...c, preco: p.preco}); return [p.id, m.base + m.taxas]; }));
  const porNome = new Map(prods.map(p => [p.nome.toLowerCase(), p.id]));
  const custoDe = (id, nome) => prodCusto.get(id || porNome.get(String(nome || '').toLowerCase())) ?? null;
  const assinProd = new Map(r.assin.map(a => [a.id, a.produto_id]));
  const pts = meses.map((m, k) => {
    const ped = r.ok.filter(p => mesKey(p.criado_em) === m), gan = r.ganhos.filter(l => mesKey(l.etapa_em) === m), pag = r.pags.filter(p => mesKey(p.pago_em) === m);
    const receita = ped.reduce((s, p) => s + +p.total, 0) + gan.reduce((s, l) => s + +l.valor, 0) + pag.reduce((s, p) => s + +p.valor, 0);
    let producao = 0, semCusto = 0;
    const soma = (u, q) => { if (u == null) semCusto += q; else producao += u * q; };
    ped.forEach(p => (p.pedido_itens || []).forEach(i => soma(custoDe(i.produto_id, i.produto), i.quantidade)));
    gan.forEach(l => soma(custoDe(null, l.interesse), 1));
    pag.forEach(p => { const u = custoDe(assinProd.get(p.assinatura_id)); if (u != null) producao += u; });   // mensalidade sem custo cadastrado = serviço
    const plataformas = m >= INICIO_SATURNO ? r.platMes : 0, custo = producao + plataformas, nome = fxNomeMes(m);
    return {m, v: receita - custo, receita, custo, semCusto, conta: m >= INICIO_SATURNO, tip: `${nome}${k === 11 ? ' · em andamento' : ''}`};
  });
  return {pts};
}

const PL_KEY = 'saturno_prolabore';
const PL_PADRAO = {empresa: 50, base: 'passado', socios: [{nome: 'Pedro', pct: 50}, {nome: 'Sócio 2', pct: 50}]};
const PL_BASES = [['mes', 'Este mês'], ['passado', 'Mês passado'], ['media3', 'Média 3 meses'], ['media12', 'Média 12 meses']];
function plLer() {
  try { const o = JSON.parse(localStorage.getItem(PL_KEY) || 'null'); if (o && Array.isArray(o.socios) && o.socios.length) return {...PL_PADRAO, ...o}; } catch {}
  return JSON.parse(JSON.stringify(PL_PADRAO));
}
const plSalvar = st => { try { localStorage.setItem(PL_KEY, JSON.stringify({empresa: st.empresa, base: st.base, socios: st.socios})); } catch {} };
const plClamp = v => Math.min(100, Math.max(0, Math.round((+v || 0) * 10) / 10));
const plPct = v => fmtNum(v, v % 1 ? 1 : 0);

async function viewProlabore() {
  let pts = null, erro = null;
  try { ({pts} = await calcLucroMeses()); } catch (e) { erro = e; }
  const st = plLer();
  let manual = null;   // valor digitado à mão (null = usa o estimado)

  const estimado = () => {
    if (!pts) return {v: manual ?? 0, txt: ''};
    const ult = pts[11], ant = pts[10];
    // médias só com os meses desde o início da Saturno (julho/2026)
    const media = n => { const l = pts.slice(12 - n).filter(p => p.conta); return l.length ? l.reduce((a, p) => a + p.v, 0) / l.length : 0; };
    if (st.base === 'mes') return {v: ult.v, txt: `${ult.tip} · faturamento ${brl(ult.receita)} − custos ${brl(ult.custo)}`};
    if (st.base === 'passado') return {v: ant.v, txt: `${ant.tip} · faturamento ${brl(ant.receita)} − custos ${brl(ant.custo)}`};
    if (st.base === 'media3') return {v: media(3), txt: 'média dos últimos 3 meses (inclui o mês em andamento)'};
    return {v: media(12), txt: 'média dos meses desde o início da Saturno (inclui o mês em andamento)'};
  };
  const divide = lucro => { const base = Math.max(0, lucro), emp = base * st.empresa / 100, soc = base - emp;
    return {emp, soc, socios: st.socios.map(x => soc * (+x.pct || 0) / 100)}; };

  $('#view').innerHTML = header('Pró-labore', 'Quanto do lucro fica na empresa e quanto cada sócio recebe') + fxAbas('prolabore') + `
    ${erro ? `<div class="card" style="margin-bottom:14px"><div class="empty">Não foi possível calcular o lucro agora (${esc(erro.message)})</div><p class="small mut" style="text-align:center">Você ainda pode digitar o lucro à mão abaixo.</p></div>` : ''}
    <div class="pl">
      <div class="card">
        ${pts ? `<div class="bar" style="margin-bottom:14px"><div class="tabs">${PL_BASES.map(([k, l]) => `<button data-plb="${k}" class="${st.base === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>` : ''}
        <div class="pl-lbl">Lucro líquido mensal</div>
        <b class="pl-big num" id="plBig"></b>
        <div class="pl-src" id="plSrc"></div>
        <input class="in num" id="plLucro" inputmode="decimal" placeholder="Digite o lucro do mês" aria-label="Lucro líquido mensal">
        <div class="pl-row t"><span>Lucro reservado para a empresa</span><span class="pl-row"><input class="in num" id="plPctIn" inputmode="decimal" aria-label="Percentual da empresa">%</span></div>
        <input type="range" class="pl-range" id="plRange" min="0" max="100" step="1" aria-label="Percentual reservado para a empresa">
        <div class="pl-row pl-ends"><span>Distribuir tudo</span><span>Reservar tudo</span></div>
        <div class="pl-bar"><i class="e" id="plBarE"></i><i class="s" id="plBarS"></i></div>
        <div class="pl-2">
          <div><span>Fica na empresa</span><b class="num" id="plEmp"></b></div>
          <div><span>Distribuído aos sócios</span><b class="num" id="plSoc"></b></div>
        </div>
        <hr class="pl-hr">
        <div class="pl-h">Quanto cada sócio recebe de lucro</div>
        <div class="pl-socs">${st.socios.map((x, k) => `
          <div class="pl-soc"><input class="in" data-pln="${k}" value="${esc(x.nome)}" aria-label="Nome do sócio ${k + 1}">
            <div class="pl-pct"><span>Sócio ${k + 1} ·</span><input class="in num" data-plp="${k}" inputmode="decimal" value="${plPct(+x.pct || 0)}" aria-label="Percentual do sócio ${k + 1}"><span>%</span></div>
            <b class="num" data-plv="${k}"></b></div>`).join('')}
        </div>
        <div class="pl-warn" id="plWarn" hidden></div>
        <div class="pl-warn" id="plNeg" hidden>Lucro negativo ou zero: não há o que distribuir.</div>
      </div>
      <div class="card"><h3>Últimos 12 meses <span class="small mut">com a divisão atual</span></h3>
        <div style="overflow:auto"><table class="pl-tab"><thead><tr><th>Mês</th><th class="r">Lucro estimado</th><th class="r">Empresa</th>${st.socios.map((x, k) => `<th class="r" data-plth="${k}">${esc(x.nome)}</th>`).join('')}</tr></thead>
        <tbody id="plHist"></tbody></table></div>
        ${pts && pts.some(p => p.semCusto) ? '<p class="lucro-nota"><b>Há itens vendidos sem custo cadastrado</b>: o lucro real é menor. Preencha na aba <a href="#margem">Margem de lucro</a>.</p>' : ''}
      </div>
    </div>`;

  const inp = $('#plLucro'), rng = $('#plRange'), pctIn = $('#plPctIn');
  const lucroAtual = () => manual != null ? manual : estimado().v;
  const render = () => {
    const lucro = lucroAtual(), d = divide(lucro), e = estimado();
    $('#plBig').textContent = brl(lucro); $('#plBig').classList.toggle('neg', lucro < 0);
    $('#plSrc').innerHTML = manual != null
      ? `Valor digitado à mão${pts ? ` · <a id="plReset">usar o estimado (${brl(e.v)})</a>` : ''}`
      : (pts ? `Estimado: ${esc(e.txt)}` : '');
    const rs = $('#plReset'); if (rs) rs.onclick = () => { manual = null; inp.value = fmtNum(lucroAtual()); render(); };
    rng.value = st.empresa; if (document.activeElement !== pctIn) pctIn.value = plPct(st.empresa);
    $('#plBarE').style.flex = `${st.empresa} 1 0`; $('#plBarS').style.flex = `${100 - st.empresa} 1 0`;
    $('#plBarE').style.display = st.empresa > 0 ? '' : 'none'; $('#plBarS').style.display = st.empresa < 100 ? '' : 'none';
    $('#plEmp').textContent = brl(d.emp); $('#plSoc').textContent = brl(d.soc);
    st.socios.forEach((x, k) => { $(`[data-plv="${k}"]`).textContent = brl(d.socios[k]); $(`[data-plth="${k}"]`).textContent = x.nome || `Sócio ${k + 1}`; });
    const soma = st.socios.reduce((a, x) => a + (+x.pct || 0), 0);
    const w = $('#plWarn'); w.hidden = Math.abs(soma - 100) < 0.01; w.textContent = `Os percentuais dos sócios somam ${plPct(soma)}%; o certo é 100%.`;
    $('#plNeg').hidden = lucro > 0;
    $('#plHist').innerHTML = pts ? [...pts].filter(p => p.conta).reverse().map(p => { const dd = divide(p.v);
      return `<tr><td>${esc(p.tip)}</td><td class="num r strong ${p.v < 0 ? 'neg-txt' : ''}">${brl(p.v)}</td><td class="num r">${brl(dd.emp)}</td>${dd.socios.map(v => `<td class="num r">${brl(v)}</td>`).join('')}</tr>`; }).join('')
      : `<tr><td colspan="${3 + st.socios.length}" class="mut">Sem dados para estimar.</td></tr>`;
    plSalvar(st);
  };
  inp.value = fmtNum(lucroAtual());
  inp.oninput = () => { const n = parseNum(inp.value); manual = n == null || Number.isNaN(n) ? (pts ? null : 0) : n; render(); };
  inp.onblur = () => { inp.value = fmtNum(lucroAtual()); };
  rng.oninput = () => { st.empresa = plClamp(rng.value); render(); };
  pctIn.oninput = () => { const n = parseNum(pctIn.value); if (n != null && !Number.isNaN(n)) { st.empresa = plClamp(n); render(); } };
  pctIn.onblur = () => { pctIn.value = plPct(st.empresa); };
  document.querySelectorAll('[data-plb]').forEach(b => b.onclick = () => {
    st.base = b.dataset.plb; manual = null; inp.value = fmtNum(lucroAtual());
    document.querySelectorAll('[data-plb]').forEach(x => x.classList.toggle('on', x === b)); render(); });
  document.querySelectorAll('[data-plp]').forEach(el => el.oninput = () => { const n = parseNum(el.value); st.socios[+el.dataset.plp].pct = n == null || Number.isNaN(n) ? 0 : plClamp(n); render(); });
  document.querySelectorAll('[data-pln]').forEach(el => el.oninput = () => { st.socios[+el.dataset.pln].nome = el.value.trim(); render(); });
  render();
}
