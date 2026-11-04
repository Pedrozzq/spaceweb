// =====================================================================
//  SATURNO NFC · CRM — Google Analytics (visitas do site × leads da CRM)
//  Os dados vêm de /api/ga-relatorio, no projeto saturno-nfc da Vercel (endereço em config.js → GA_API).
// =====================================================================
'use strict';
// ======================================================================
//  GOOGLE ANALYTICS (GA4) do site: a função da Vercel lê a Data API com a conta de serviço
//  (GA_PROPERTY_ID + GA_CREDENTIALS na Vercel). Cruza com os leads que chegaram pelo site.
// ======================================================================
const GA = {dias: 28, forcar: false};   // forcar: busca no Google sem o cache de 5 min (botão Atualizar)
const GA_CANAL = {'Direct': 'Direto', 'Organic Search': 'Google (orgânico)', 'Organic Social': 'Redes sociais', 'Paid Search': 'Google Ads', 'Paid Social': 'Anúncio em rede social',
  'Referral': 'Outros sites', 'Email': 'E-mail', 'Unassigned': 'Não identificado', 'Organic Shopping': 'Google Shopping', 'Cross-network': 'Várias redes', 'Display': 'Display', 'Organic Video': 'Vídeo'};
const GA_APAR = {mobile: 'Celular', desktop: 'Computador', tablet: 'Tablet', 'smart tv': 'TV'};
const GA_EVT = {page_view: 'Páginas vistas', session_start: 'Visitas iniciadas', first_visit: 'Primeira visita', user_engagement: 'Engajamento', scroll: 'Rolou a página',
  click: 'Clique em link externo', view_item: 'Viu produto', add_to_cart: 'Pôs na sacola', begin_checkout: 'Iniciou checkout', purchase: 'Compra', generate_lead: 'Virou lead', contact: 'Contato', form_start: 'Começou formulário', view_search_results: 'Pesquisou'};
const gaN = v => Math.round(+v || 0).toLocaleString('pt-BR');
const gaPct = v => (+v * 100).toLocaleString('pt-BR', {maximumFractionDigits: 1}) + '%';
const gaTempo = s => { s = Math.round(+s || 0); return s >= 60 ? `${Math.floor(s / 60)}min ${String(s % 60).padStart(2, '0')}s` : `${s}s`; };
const gaVar = (a, b, inverso) => { if (!b) return ''; const v = (a - b) / b * 100; if (!isFinite(v) || Math.abs(v) < .5) return '<span class="ga-var mut">=</span>';
  const bom = inverso ? v < 0 : v > 0; return `<span class="ga-var ${bom ? 'up' : 'down'}">${v > 0 ? '▲' : '▼'} ${Math.abs(v).toLocaleString('pt-BR', {maximumFractionDigits: 0})}%</span>`; };
const gaLista = (itens, val, nome, fmt = gaN) => { const max = Math.max(1, ...itens.map(val));
  return itens.length ? `<div class="ga-list">${itens.map(x => `<div class="ga-row"><span class="nm" title="${esc(nome(x))}">${esc(nome(x))}</span><span class="vl">${fmt(val(x))}</span>
    <span class="br"><i style="width:${Math.max(2, val(x) / max * 100)}%"></i></span></div>`).join('')}</div>` : '<div class="empty">Sem dados no período.</div>'; };

function gaDemo(dias) {
  const r = (a, b) => Math.round(a + Math.random() * (b - a)), hoje = Date.now();
  const serie = Array.from({length: dias}, (_, i) => { const d = new Date(hoje - (dias - 1 - i) * 864e5), u = r(60, 160) + (d.getDay() === 5 || d.getDay() === 6 ? 50 : 0);
    return {dia: d.toISOString().slice(0, 10), usuarios: u, sessoes: Math.round(u * 1.3), views: Math.round(u * 4.2)}; });
  const soma = k => serie.reduce((s, x) => s + x[k], 0);
  const atual = {activeUsers: soma('usuarios'), newUsers: Math.round(soma('usuarios') * .72), sessions: soma('sessoes'), screenPageViews: soma('views'), engagementRate: .61, averageSessionDuration: 142, bounceRate: .39};
  return {dias, demo: true, gerado_em: new Date().toISOString(), totais: {atual, anterior: Object.fromEntries(Object.entries(atual).map(([k, v]) => [k, v * (k.includes('Rate') || k.includes('Duration') ? .95 : .84)]))}, serie,
    canais: [['Organic Social', 1240], ['Direct', 980], ['Organic Search', 610], ['Paid Social', 420], ['Referral', 95]].map(([nome, s]) => ({nome, sessoes: s, usuarios: Math.round(s * .8)})),
    origens: [['instagram.com / referral', 820], ['(direct) / (none)', 980], ['google / organic', 610], ['l.instagram.com / referral', 300], ['facebook.com / referral', 120]].map(([nome, s]) => ({nome, sessoes: s, usuarios: Math.round(s * .8)})),
    aparelhos: [['mobile', 2900], ['desktop', 520], ['tablet', 60]].map(([nome, u]) => ({nome, usuarios: u, sessoes: u})),
    cidades: [['Ouro Preto', 640], ['Belo Horizonte', 420], ['Mariana', 260], ['São Paulo', 140], ['Itabirito', 90], ['(not set)', 60]].map(([nome, u]) => ({nome, usuarios: u, sessoes: u})),
    paginas: [['/nfc', 5200], ['/', 640], ['/planos.html', 210], ['/projetos.html', 90]].map(([nome, v]) => ({nome, views: v, usuarios: Math.round(v / 3)})),
    eventos: [['page_view', 6100], ['session_start', 4300], ['user_engagement', 3900], ['scroll', 2100], ['first_visit', 2400], ['click', 900], ['generate_lead', 64]].map(([nome, n]) => ({nome, total: n, usuarios: Math.round(n * .7)})),
    entradas: [['/nfc', 3900, .62], ['/', 320, .7]].map(([nome, s, e]) => ({nome, sessoes: s, engajamento: e})),
    horarios: Array.from({length: 7 * 24}, (_, i) => ({dia: Math.floor(i / 24), hora: i % 24, sessoes: Math.max(0, Math.round((Math.sin((i % 24 - 6) / 24 * Math.PI) * 30) + r(-4, 10)))})),
    agora: {usuarios: r(2, 14), cidades: [{nome: 'Ouro Preto', usuarios: 3}, {nome: 'Belo Horizonte', usuarios: 2}]}};
}

async function gaBuscar(dias, forcar) {
  if (DEMO) { await new Promise(r => setTimeout(r, 200)); return gaDemo(dias); }
  const s = await API.session();
  const url = (CFG.GA_API || 'https://saturno-nfc.vercel.app/api/ga-relatorio') + `?dias=${dias}${forcar ? '&atualizar=1' : ''}`;
  let r;
  try { r = await fetch(url, {headers: {Authorization: 'Bearer ' + (s?.access_token || '')}}); }
  catch { const e = new Error('Não foi possível falar com a Vercel (projeto saturno-nfc). Ele já foi publicado?'); e.codigo = 'nao-configurado'; throw e; }
  let d = null; try { d = await r.json(); } catch { /* resposta sem JSON */ }
  if (!r.ok) { const e = new Error(d?.mensagem || `Analytics indisponível (HTTP ${r.status})`); e.codigo = d?.erro || (r.status === 404 ? 'nao-configurado' : r.status); throw e; }
  return d;
}

function gaGrafico(el, serie) {
  if (!el) return;
  const render = () => {
    const W = el.clientWidth || 600, H = el.clientHeight || 240, L = 40, R = 10, T = 10, B = 24;
    const max = Math.max(4, ...serie.map(x => Math.max(x.usuarios, x.sessoes)));
    const passo = (() => { const raw = max / 4, e = 10 ** Math.floor(Math.log10(raw)); return [1, 2, 2.5, 5, 10].map(f => f * e).find(s => s >= raw); })(), hi = Math.ceil(max / passo) * passo;
    const n = serie.length, X = i => L + (W - L - R) * (n < 2 ? .5 : i / (n - 1)), Y = v => T + (H - T - B) * (1 - v / hi);
    const lin = k => serie.map((x, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(x[k]).toFixed(1)}`).join('');
    const ticks = []; for (let v = 0; v <= hi + 1e-9; v += passo) ticks.push(v);
    const cada = Math.ceil(n / Math.max(2, Math.floor((W - L - R) / 52)));
    const ddmm = d => d.slice(8, 10) + '/' + d.slice(5, 7);
    el.innerHTML = `<svg><defs><linearGradient id="gaGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--ac)" stop-opacity=".35"/><stop offset="1" style="stop-color:var(--ac)" stop-opacity="0"/></linearGradient></defs>
      ${ticks.map(v => `<line class="g" x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}"/><text class="ax" x="${L - 6}" y="${Y(v) + 4}" text-anchor="end">${gaN(v)}</text>`).join('')}
      ${n ? `<path class="a1" d="${lin('usuarios')}L${X(n - 1)},${Y(0)}L${X(0)},${Y(0)}Z"/><path class="l2" d="${lin('sessoes')}"/><path class="l1" d="${lin('usuarios')}"/>` : ''}
      ${serie.map((x, i) => i % cada === (n - 1) % cada ? `<text class="ax" x="${X(i)}" y="${H - 6}" text-anchor="middle">${ddmm(x.dia)}</text>` : '').join('')}
      <line class="xh" id="gaXh" y1="${T}" y2="${H - B}" style="display:none"/>
      ${serie.map((x, i) => `<rect class="hit" data-i="${i}" x="${X(i) - (W - L - R) / Math.max(1, n - 1) / 2}" y="${T}" width="${(W - L - R) / Math.max(1, n - 1)}" height="${H - T - B}"/>`).join('')}
    </svg><div class="lc-tip"></div>`;
    const tip = el.querySelector('.lc-tip'), xh = el.querySelector('#gaXh');
    // dia mais perto do mouse/dedo (qualquer movimento sobre o gráfico atualiza a dica)
    let atual = -1;
    const mostra = i => { if (i === atual || !serie[i]) return; atual = i; const x = serie[i];
      xh.setAttribute('x1', X(i)); xh.setAttribute('x2', X(i)); xh.style.display = '';
      tip.innerHTML = `<b>${gaN(x.usuarios)} visitantes</b><span>${new Date(x.dia + 'T12:00').toLocaleDateString('pt-BR', {weekday: 'short', day: '2-digit', month: '2-digit'})} · ${gaN(x.sessoes)} visitas · ${gaN(x.views)} páginas</span>`;
      tip.style.left = Math.min(W - tip.offsetWidth / 2, Math.max(tip.offsetWidth / 2, X(i))) + 'px'; tip.style.top = Math.max(0, Y(x.usuarios) - 64) + 'px'; tip.style.opacity = 1; };
    el.onpointermove = el.onpointerdown = ev => { const bx = el.getBoundingClientRect();
      mostra(Math.round(Math.min(1, Math.max(0, (ev.clientX - bx.left - L) / Math.max(1, W - L - R))) * Math.max(0, n - 1))); };
    el.onmousemove = el.onpointermove;
    el.onpointerleave = el.onmouseleave = () => { atual = -1; tip.style.opacity = 0; xh.style.display = 'none'; };
  };
  render(); new ResizeObserver(() => el.isConnected && render()).observe(el);
}

async function viewAnalytics() {
  const forcar = GA.forcar; GA.forcar = false;
  const sub = 'Visitas do site (Google Analytics 4) cruzadas com os leads da CRM.';
  $('#view').innerHTML = header('Google Analytics', sub) + '<div class="card"><div class="empty">Carregando dados do Google Analytics…</div></div>';
  let d, peds;
  try { [d, peds] = await Promise.all([gaBuscar(GA.dias, forcar), cache.leads()]); }
  catch (e) {
    const semConfig = e.codigo === 'nao-configurado';
    $('#view').innerHTML = header('Google Analytics', sub) + `<div class="card"><h3>${semConfig ? 'Falta ligar o Google Analytics à CRM' : 'Não foi possível ler o Google Analytics'}</h3>
      ${semConfig ? `<ol class="small" style="line-height:1.8;padding-left:18px;margin-top:8px">
        <li>No <b>Google Analytics</b>: Administrador → Gerenciamento de acesso à propriedade → <b>+</b> → e-mail da conta de serviço (…@…iam.gserviceaccount.com) como <b>Leitor</b>.</li>
        <li>Na <b>Vercel</b> (projeto <code>saturno-nfc</code>) → Settings → Environment Variables: <code>GA_PROPERTY_ID</code> = número da propriedade e <code>GA_CREDENTIALS</code> = o JSON inteiro da chave. Depois, um novo deploy (push no GitHub).</li>
        <li>Se o endereço do projeto na Vercel não for <code>saturno-nfc.vercel.app</code>, coloque o certo em <code>config.js</code> → <code>GA_API</code>.</li></ol>`
        : `<p class="small mut">${esc(e.message)}</p>`}
      <button class="btn pri" id="gaRetry" style="margin-top:12px">Tentar de novo</button></div>`;
    $('#gaRetry').onclick = () => { GA.forcar = true; viewAnalytics(); }; return;
  }
  const a = d.totais.atual || {}, b = d.totais.anterior || {};
  // leads que chegaram pelo site no mesmo período (CRM)
  const desde = Date.now() - GA.dias * 864e5;
  const leadsSite = peds.filter(l => l.origem === 'site' && Date.parse(l.criado_em) >= desde);
  const ganhosSite = leadsSite.filter(l => l.etapa === 'ganho'), fatSite = ganhosSite.reduce((s, l) => s + +l.valor, 0);
  const conv = a.sessions ? leadsSite.length / a.sessions : 0;
  const ev = n => (d.eventos.find(x => x.nome === n) || {}).total || 0;
  const funil = [['Visitas', a.sessions || 0], ['Cliques', ev('click')], ['Viraram lead', leadsSite.length], ['Vendas ganhas', ganhosSite.length]];
  const temFunil = funil.slice(1).some(x => x[1]);
  // mapa de calor: dia da semana × hora
  const heat = Array.from({length: 7}, () => Array(24).fill(0)); (d.horarios || []).forEach(x => { if (heat[x.dia]) heat[x.dia][x.hora] += x.sessoes; });
  const hMax = Math.max(1, ...heat.flat()), DS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const pico = heat.flatMap((r, di) => r.map((v, h) => ({v, di, h}))).sort((x, y) => y.v - x.v)[0];

  $('#view').innerHTML = header('Google Analytics', sub, `<button class="btn ghost" id="gaAtual" title="Buscar de novo no Google">Atualizar</button>`) + `
    <div class="ga-top"><div class="tabs">${[[7, '7 dias'], [28, '28 dias'], [90, '90 dias']].map(([k, l]) => `<button class="${GA.dias === k ? 'on' : ''}" data-gad="${k}">${l}</button>`).join('')}</div>
      <span class="small mut">Comparado com os ${GA.dias} dias anteriores · atualizado ${esc(ago(d.gerado_em))}${d.demo ? ' · dados de exemplo' : ''}</span></div>
    ${d.agora ? `<div class="ga-agora"><span class="dot"></span><div><b class="num">${gaN(d.agora.usuarios)}</b> <span class="mut">${d.agora.usuarios === 1 ? 'pessoa' : 'pessoas'} no site agora</span><div class="small mut">últimos 30 minutos</div></div>
      <div class="cid">${(d.agora.cidades || []).map(c => `<span class="tag">${esc(c.nome === '(not set)' ? 'Não identificada' : c.nome)} · ${c.usuarios}</span>`).join('')}</div></div>` : ''}
    <div class="kpis">
      <div class="kpi hl"><span>Visitantes</span><b class="num">${gaN(a.activeUsers)}${gaVar(a.activeUsers, b.activeUsers)}</b><small>${gaN(a.newUsers)} novos</small></div>
      <div class="kpi"><span>Visitas (sessões)</span><b class="num">${gaN(a.sessions)}${gaVar(a.sessions, b.sessions)}</b><small>${gaN(a.screenPageViews)} páginas vistas</small></div>
      <div class="kpi"><span>Engajamento</span><b class="num">${gaPct(a.engagementRate || 0)}${gaVar(a.engagementRate, b.engagementRate)}</b><small>tempo médio ${gaTempo(a.averageSessionDuration)}</small></div>
      <div class="kpi"><span>Visita → lead</span><b class="num">${gaPct(conv)}</b><small>${leadsSite.length} ${leadsSite.length === 1 ? 'lead' : 'leads'} pelo site · ${ganhosSite.length} ${ganhosSite.length === 1 ? 'ganho' : 'ganhos'}</small></div>
    </div>
    <div class="card" style="margin-bottom:14px"><h3><span>Visitantes por dia</span><span class="ga-leg"><span><i style="background:var(--ac)"></i>Visitantes</span><span><i style="background:var(--blue)"></i>Visitas</span></span></h3>
      <div class="ga-chart" id="gaChart"></div></div>
    <div class="ga-cols3">
      <div class="card"><h3>De onde vêm</h3>${gaLista(d.canais, x => x.sessoes, x => GA_CANAL[x.nome] || x.nome)}</div>
      <div class="card"><h3>Origem / mídia</h3>${gaLista(d.origens, x => x.sessoes, x => x.nome.replace('(direct) / (none)', 'Direto (digitou ou favorito)'))}</div>
      <div class="card"><h3>Aparelhos</h3>${gaLista(d.aparelhos, x => x.usuarios, x => GA_APAR[x.nome] || x.nome)}
        <h3 style="margin-top:16px">Cidades</h3>${gaLista(d.cidades.slice(0, 6), x => x.usuarios, x => x.nome === '(not set)' ? 'Não identificada' : x.nome)}</div>
    </div>
    <div class="ga-cols">
      <div class="card"><h3>Páginas mais vistas</h3>${gaLista(d.paginas, x => x.views, x => x.nome === '/' ? 'Página inicial' : x.nome)}</div>
      <div class="card"><h3>O que fizeram no site</h3>${gaLista(d.eventos, x => x.total, x => GA_EVT[x.nome] || x.nome)}</div>
    </div>
    <div class="ga-cols">
      <div class="card"><h3>Funil do site</h3>${temFunil ? `<div class="ga-funil">${funil.map(([l, v], i) => `<div><b class="num">${gaN(v)}</b><small>${l}${i ? ` · ${funil[0][1] ? gaPct(v / funil[0][1]) : '—'}` : ''}</small></div>`).join('')}</div>`
        : '<p class="small mut">Ainda não há cliques nem leads do site no período.</p>'}
        <p class="small mut" style="margin-top:10px">Leads que chegaram pelo site no período: <b>${leadsSite.length}</b> · ${ganhosSite.length} ${ganhosSite.length === 1 ? 'venda ganha' : 'vendas ganhas'}${fatSite ? ` · ${brl(fatSite)}` : ''}</p></div>
      <div class="card"><h3>Horários com mais visitas</h3>${pico && pico.v ? `<p class="small mut">Pico: <b>${DS[pico.di]} às ${pico.h}h</b>. Bom horário para postar e responder rápido.</p>` : ''}
        <div class="ga-heat"><em></em>${Array.from({length: 24}, (_, h) => `<em style="text-align:center">${h % 3 ? '' : h}</em>`).join('')}
        ${heat.map((r, di) => `<em>${DS[di]}</em>${r.map((v, h) => `<span title="${DS[di]} ${h}h · ${v} visitas" style="opacity:${v ? (.12 + v / hMax * .88).toFixed(2) : .05}"></span>`).join('')}`).join('')}</div></div>
    </div>`;
  gaGrafico($('#gaChart'), d.serie || []);
  document.querySelectorAll('[data-gad]').forEach(x => x.onclick = () => { GA.dias = +x.dataset.gad; viewAnalytics(); });
  $('#gaAtual').onclick = () => { GA.forcar = true; viewAnalytics(); };
}
