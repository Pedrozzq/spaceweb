// =====================================================================
//  SATURNO NFC · CRM — base: utilidades, constantes, tema, modal e CSV
// =====================================================================
'use strict';
const CFG = window.SATURNO_CONFIG || {SUPABASE_URL: '', SUPABASE_ANON_KEY: ''};
const DEMO = !CFG.SUPABASE_URL || CFG.SUPABASE_URL.includes('SEU-PROJETO') || String(CFG.SUPABASE_ANON_KEY).includes('SUA-');
const EMPRESA = window.SATURNO_EMPRESA || {};

// ------------------------------------------------------------------ utilidades
const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const brl = v => Number(v || 0).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
// valor curto para eixos de gráfico: R$ 1,2 mil
const brlCurto = v => Math.abs(v) >= 1000 ? `R$ ${(v / 1000).toLocaleString('pt-BR', {maximumFractionDigits: 1})} mil` : brl(v).replace(',00', '');
const TZ = 'America/Sao_Paulo';
const dt = v => v ? new Date(v).toLocaleString('pt-BR', {timeZone: TZ, day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit'}) : '—';
const dOnly = v => v ? new Date(String(v).length === 10 ? v + 'T12:00:00' : v).toLocaleDateString('pt-BR', {timeZone: TZ}) : '—';
const dayKey = v => new Date(v).toLocaleDateString('en-CA', {timeZone: TZ});     // "2026-10-14"
const hojeKey = () => dayKey(Date.now());
const mesKey = v => dayKey(v).slice(0, 7);                                          // "2026-10"
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const mesNome = k => { const [a, m] = k.split('-'); return `${MESES[+m - 1]}/${a.slice(2)}`; };
const mesLongo = k => { const [a, m] = k.split('-'); return new Date(+a, +m - 1, 15).toLocaleDateString('pt-BR', {month: 'long', year: 'numeric'}); };
// soma meses a "2026-10-10" mantendo o dia (até 28)
const somaMes = (iso, n = 1) => { const [a, m, d] = iso.split('-').map(Number); const x = new Date(Date.UTC(a, m - 1 + n, Math.min(d, 28))); return x.toISOString().slice(0, 10); };
const diasAte = iso => Math.round((Date.parse(iso + 'T12:00:00') - Date.parse(hojeKey() + 'T12:00:00')) / 864e5);
const ago = v => {
  if (!v) return '—';
  const m = Math.round((Date.now() - new Date(v)) / 60000);
  if (m < 1) return 'agora'; if (m < 60) return `há ${m} min`;
  const h = Math.round(m / 60); if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24); return d < 30 ? `há ${d} dia${d > 1 ? 's' : ''}` : dOnly(v);
};
const normFone = p => { const d = String(p || '').replace(/\D/g, ''); return !d ? '' : (d.length === 10 || d.length === 11) ? '55' + d : d; };
const fmtFone = p => {
  const d = String(p || '').replace(/\D/g, '');
  const m = d.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : (d || '—');
};
const initials = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const primeiroNome = n => { const w = String(n || '').trim().split(/\s+/)[0] || ''; return w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : ''; };
const toast = (msg, err) => {
  const el = document.createElement('div'); el.className = 't-msg' + (err ? ' e' : ''); el.textContent = msg;
  $('#toast').appendChild(el); setTimeout(() => el.remove(), 3800);
};
// números no padrão brasileiro: "1.234,56", "0,9", "R$ 8,90", "12%"
const parseNum = v => {
  let s = String(v ?? '').trim().replace(/R\$|%|\s/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s); return Number.isFinite(n) ? n : NaN;
};
const fmtNum = (v, d = 2) => v == null || v === '' ? '' : Number(v).toLocaleString('pt-BR', {minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: false});
const isUrl = v => /^https?:\/\//i.test(String(v || ''));
const debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const uid = () => crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now();

// ------------------------------------------------------------------ funil de vendas (leads)
// mesma ordem da CRM anterior. "ordem" = degrau do funil (perdido/sem interesse ficam fora)
const ETAPAS = [
  {k: 'novo', t: 'Novo lead', ordem: 0},
  {k: 'ia', t: 'Em atendimento IA', ordem: 1},
  {k: 'humano', t: 'Atendimento humano', ordem: 2},
  {k: 'reuniao', t: 'Reunião agendada', ordem: 3},
  {k: 'proposta', t: 'Proposta enviada', ordem: 4},
  {k: 'ganho', t: 'Ganho', ordem: 5},
  {k: 'perdido', t: 'Perdido'},
  {k: 'sem_interesse', t: 'Sem interesse'}
];
const ETAPA = Object.fromEntries(ETAPAS.map(e => [e.k, e.t]));
const ETAPAS_ABERTAS = ['novo', 'ia', 'humano', 'reuniao', 'proposta'];
const ETAPAS_FUNIL = ETAPAS.filter(e => e.ordem != null);
const etapaPill = k => `<span class="pill e-${esc(k)}">${esc(ETAPA[k] || k)}</span>`;
const etapaSelect = (l, attr = '') => `<select class="pill e-${esc(l.etapa)}" data-etapa="${l.id}" ${attr} title="Mudar a etapa">${
  ETAPAS.map(e => `<option value="${e.k}" ${e.k === l.etapa ? 'selected' : ''}>${e.t}</option>`).join('')}</select>`;
const MOTIVOS_PERDA = ['Preço', 'Sem resposta', 'Comprou de outro', 'Sem orçamento agora', 'Não era o perfil', 'Outro'];

const ORIGEM = {manual: 'Manual', whatsapp: 'WhatsApp', site: 'Site', instagram: 'Instagram', indicacao: 'Indicação', google: 'Google', agente: 'Agente IA', importado: 'Importado'};

// ------------------------------------------------------------------ pedidos
const STATUS = {novo: 'Novo', arte: 'Criação da arte', aprovacao: 'Aguardando aprovação', producao: 'Em produção', enviado: 'Enviado', entregue: 'Entregue', cancelado: 'Cancelado'};
const PED_ABERTOS = ['novo', 'arte', 'aprovacao', 'producao', 'enviado'];
const statusPill = s => `<span class="pill s-${esc(s)}">${esc(STATUS[s] || s)}</span>`;
const statusSelect = p => `<select class="pill s-${esc(p.status)}" data-st="${p.id}" title="Mudar a etapa do pedido">${
  Object.entries(STATUS).map(([k, l]) => `<option value="${k}" ${k === p.status ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
const contaVenda = p => p.status !== 'cancelado';
const PAG = {pix: 'Pix', cartao_credito: 'Cartão de crédito', cartao_debito: 'Cartão de débito', boleto: 'Boleto', link: 'Link de pagamento', dinheiro: 'Dinheiro'};
const ENTREGA = {correios: 'Correios', motoboy: 'Motoboy', retirada: 'Retirada', instalacao: 'Instalação no local', digital: 'Digital (só página)'};
const CATS = ['Planos', 'Cartões NFC', 'Google Avaliação', 'Espelhos', 'Serviços', 'Outros'];
const itensResumo = it => (it || []).map(i => `${i.quantidade}× ${i.produto}`).join(', ');
const calcTotal = p => Math.max(0, (+p.subtotal || 0) - (+p.desconto || 0) + (+p.frete || 0));

// ------------------------------------------------------------------ ícones
const svg = (d, w = 16) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const IC = {
  busca: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  x: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  edit: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>', 15),
  lixo: svg('<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6"/>', 15),
  hist: svg('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>', 15),
  wa: svg('<path d="M3.5 20.5 5 16a8.5 8.5 0 1 1 3.2 3.1z"/><path d="M9 8.6c0 3.3 2.9 6.4 6.3 6.6l1.2-1.4-1.9-1-1 .9a5 5 0 0 1-2.8-2.8l.9-1-1-1.9z"/>', 14),
  nota: svg('<path d="M4 4h16v12H8l-4 4z"/>', 14),
  etapa: svg('<path d="M7 7h11l-3-3M17 17H6l3 3"/>', 14),
  estrela: svg('<path d="M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 17l-5.4 2.8 1.1-6.1-4.5-4.3 6.1-.8z"/>', 14),
  robo: svg('<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 8V4M9 13h.01M15 13h.01"/>', 14),
  caixa: svg('<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>', 14),
  tarefa: svg('<path d="m9 11 3 3L21 5"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>', 14),
  etq: svg('<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/>', 14),
  csv: svg('<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/>', 14),
  up: svg('<path d="M12 21V9M7 14l5-5 5 5"/><path d="M5 3h14"/>', 14),
  sol: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>', 15),
  lua: svg('<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>', 15),
  link: svg('<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>', 14)
};
const ICON_SEARCH = IC.busca, ICON_X = IC.x;

// ------------------------------------------------------------------ tema e personalização (salvo neste navegador)
// cor: [tema escuro, tema claro, tinta sobre a cor no escuro]
const CORES = {
  dourado: {t: 'Dourado', d: '#f2c14e', l: '#a87a10'},
  turquesa: {t: 'Turquesa', d: '#2dd4bf', l: '#0f8a7e'},
  azul: {t: 'Azul', d: '#60a5fa', l: '#2563eb'},
  roxo: {t: 'Roxo', d: '#a78bfa', l: '#7c3aed'},
  rosa: {t: 'Rosa', d: '#f472b6', l: '#db2777'},
  verde: {t: 'Verde', d: '#4ade80', l: '#16a34a'},
  laranja: {t: 'Laranja', d: '#fb923c', l: '#ea580c'},
  prata: {t: 'Prata', d: '#cbd5e1', l: '#475569'}
};
const TEMA = (() => {
  let s = {tema: 'dark', cor: 'dourado', marca: EMPRESA.nome || 'Saturno NFC'};
  try { Object.assign(s, JSON.parse(localStorage.getItem('saturno_crm_tema') || '{}')); } catch {}
  const hex2rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const aplicar = () => {
    const root = document.documentElement, claro = s.tema === 'light';
    root.dataset.theme = claro ? 'light' : 'dark';
    const c = CORES[s.cor] || CORES.dourado, hex = claro ? c.l : c.d, [r, g, b] = hex2rgb(hex);
    root.style.setProperty('--ac', hex);
    root.style.setProperty('--ac2', `rgba(${r},${g},${b},.85)`);
    root.style.setProperty('--acbg', `rgba(${r},${g},${b},${claro ? .1 : .12})`);
    root.style.setProperty('--acln', `rgba(${r},${g},${b},.38)`);
    // texto sobre a cor principal: escuro nas cores claras, branco nas escuras
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    root.style.setProperty('--acink', lum > .6 ? '#17140a' : '#ffffff');
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', claro ? '#f5f4ef' : '#0b0b10');
    document.querySelectorAll('[data-marca]').forEach(el => el.textContent = s.marca || 'Saturno NFC');
    document.title = `${s.marca || 'Saturno NFC'} · CRM`;
  };
  return {
    get: () => ({...s}),
    set(p) { Object.assign(s, p); try { localStorage.setItem('saturno_crm_tema', JSON.stringify(s)); } catch {} aplicar(); },
    aplicar
  };
})();
TEMA.aplicar();

function abrirPersonalizacao() {
  const s = TEMA.get();
  const ov = modal(`<div class="dh"><h2>Personalização</h2><button class="x" data-close>${ICON_X}</button></div>
    <div class="db">
      <label class="f"><span>Tema</span></label>
      <div class="temas"><button type="button" data-tema="light" class="${s.tema === 'light' ? 'on' : ''}">${IC.sol}Claro</button>
        <button type="button" data-tema="dark" class="${s.tema !== 'light' ? 'on' : ''}">${IC.lua}Escuro</button></div>
      <label class="f"><span>Nome da marca (menu e aba do navegador)</span><input class="in" id="psMarca" maxlength="30" value="${esc(s.marca)}"></label>
      <label class="f"><span>Cor principal</span></label>
      <div class="cores">${Object.entries(CORES).map(([k, c]) => `<button type="button" class="cor ${k === s.cor ? 'on' : ''}" data-cor="${k}"><i style="background:${s.tema === 'light' ? c.l : c.d}"></i>${c.t}</button>`).join('')}</div>
      <p class="small mut" style="margin-top:12px">Fica salvo neste navegador. Cada pessoa da equipe pode usar o seu.</p>
    </div>
    <div class="df"><button class="btn pri" data-close>Concluído</button></div>`, true);
  ov.querySelectorAll('[data-tema]').forEach(b => b.onclick = () => { TEMA.set({tema: b.dataset.tema}); ov.remove(); abrirPersonalizacao(); route?.(true); });
  ov.querySelectorAll('[data-cor]').forEach(b => b.onclick = () => { TEMA.set({cor: b.dataset.cor}); ov.querySelectorAll('[data-cor]').forEach(x => x.classList.toggle('on', x === b)); });
  ov.querySelector('#psMarca').oninput = debounce(e => TEMA.set({marca: e.target.value.trim() || 'Saturno NFC'}), 250);
}

// ------------------------------------------------------------------ modal / drawer
function modal(html, center, cls = '') {
  const ov = document.createElement('div'); ov.className = 'ov' + (center ? ' center' : '');
  ov.innerHTML = `<div class="${center ? 'modal' : 'drawer'} ${cls}">${html}</div>`;
  ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('[data-close]')) fechar(); });
  document.body.appendChild(ov);
  const onKey = e => { if (e.key === 'Escape' && ov === [...document.querySelectorAll('.ov')].pop()) fechar(); };
  function fechar() { ov.remove(); document.removeEventListener('keydown', onKey); }
  document.addEventListener('keydown', onKey);
  ov.fechar = fechar;
  return ov;
}
const fecharModais = () => document.querySelectorAll('.ov').forEach(o => o.fechar ? o.fechar() : o.remove());

// Celular: tabelas viram cartões; cada célula ganha o nome da coluna (data-label) como rótulo
function rotularTabelas(root) {
  root.querySelectorAll('.tbl-wrap table').forEach(t => {
    const ths = [...t.querySelectorAll('thead th')]; if (!ths.length) return;
    const nomes = ths.map(th => th.textContent.trim());
    t.querySelectorAll('tbody tr').forEach(tr => {
      if (tr.dataset.rt) return; tr.dataset.rt = 1;
      [...tr.children].forEach((td, i) => {
        if (i === 0) return td.classList.add('rt-h');
        td.dataset.label = nomes[i] || '';
        if (td.childNodes.length > 1) { const v = document.createElement('span'); v.className = 'rt-v'; v.append(...td.childNodes); td.append(v); }
      });
    });
  });
}
new MutationObserver(() => rotularTabelas(document.body)).observe(document.body, {childList: true, subtree: true});

// ------------------------------------------------------------------ CSV
function baixarCsv(nome, cols, linhas) {
  const csv = [cols, ...linhas].map(l => l.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + csv], {type: 'text/csv;charset=utf-8'}));
  a.download = nome; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
// lê CSV com ; ou , (o separador mais frequente na 1ª linha), aspas e quebras de linha dentro de aspas
function lerCsv(txt) {
  txt = String(txt).replace(/^﻿/, '');
  const prim = txt.split(/\r?\n/)[0] || '';
  const sep = [';', ',', '\t'].sort((a, b) => prim.split(b).length - prim.split(a).length)[0];
  const linhas = []; let row = [], cell = '', q = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (q) { if (c === '"') { if (txt[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && txt[i + 1] === '\n') i++; row.push(cell); linhas.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); linhas.push(row); }
  return linhas.filter(l => l.some(v => String(v).trim()));
}
// "05/10/2026", "2026-10-05", "05/10/2026 14:30" → ISO
function lerData(v) {
  const s = String(v || '').trim(); if (!s) return null;
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (m) { const a = m[3].length === 2 ? '20' + m[3] : m[3]; return new Date(`${a}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}T${(m[4] || '12').padStart(2, '0')}:${m[5] || '00'}:00-03:00`).toISOString(); }
  const d = Date.parse(s); return Number.isNaN(d) ? null : new Date(d).toISOString();
}

// cópia para a área de transferência (com plano B)
async function copiar(texto, msg = 'Copiado') {
  try { await navigator.clipboard.writeText(texto); }
  catch { const t = document.createElement('textarea'); t.value = texto; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
  toast(msg);
}
