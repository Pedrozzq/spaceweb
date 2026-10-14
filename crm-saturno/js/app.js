// =====================================================================
//  SATURNO NFC · CRM — inicialização: login, som de aviso, tempo real, rotas e contadores
//  Carregado por último (depende de todas as telas).
// =====================================================================
'use strict';

// ------------------------------------------------------------------ cache curto (várias telas pedem os mesmos dados)
const cache = {
  _d: {}, _t: {},
  async get(k, fn, force) { if (force || !this._d[k] || Date.now() - this._t[k] > 1500) { this._d[k] = await fn(); this._t[k] = Date.now(); } return this._d[k]; },
  leads(f) { return this.get('leads', () => API.leads(), f); },
  pedidos(f) { return this.get('pedidos', () => API.pedidos(), f); },
  tarefas(f) { return this.get('tarefas', () => API.tarefas(), f); },
  clear() { this._d = {}; }
};

const header = (title, sub, acts = '') => `
  ${DEMO ? '<div class="demo-bar">Modo demonstração: dados fictícios em memória (nada é salvo). Coloque a anon key do Supabase no <code>config.js</code> para usar de verdade.</div>' : ''}
  <div class="top"><div><h1>${title}</h1><p>${sub}</p></div><div class="acts">${acts}</div></div>`;

// ------------------------------------------------------------------ login
async function boot() {
  if (DEMO) $('#demoLogin').classList.remove('hidden');
  const s = await API.session().catch(() => null);
  s ? enter(s) : showLogin();
  if (!DEMO) sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') showLogin(); });
}
function showLogin() { $('#app').classList.add('hidden'); $('#login').classList.remove('hidden'); }
$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault(); const f = e.target, b = f.querySelector('button');
  $('#loginErr').textContent = ''; b.disabled = true; b.textContent = 'Entrando…';
  try { enter(await API.login(f.email.value.trim(), f.senha.value)); }
  catch (err) { $('#loginErr').textContent = err.message; }
  finally { b.disabled = false; b.textContent = 'Entrar'; }
});
$('#logout').onclick = async () => { await API.logout(); showLogin(); };
$('#personalizar').onclick = () => abrirPersonalizacao();
$('#menuBtn').onclick = () => document.querySelector('.side').classList.toggle('open');
// toque fora do menu lateral (celular) fecha o menu
document.addEventListener('click', e => { const sd = document.querySelector('.side');
  if (sd.classList.contains('open') && !e.target.closest('.side, .mob-top')) sd.classList.remove('open'); });

// ------------------------------------------------------------------ som de aviso (gerado pelo navegador, sem arquivo)
// Lead novo: 2 notas; pedido novo: "campainha" de 4 notas. Liga/desliga no menu (salvo neste computador).
const SOM = (() => {
  let ctx = null, ligado = true;
  try { ligado = localStorage.getItem('saturno_som') !== '0'; } catch {}
  const destravar = () => { try { ctx = ctx || new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === 'suspended') ctx.resume(); } catch {} };
  ['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, destravar, {passive: true}));
  const nota = (f, ini, dur, vol) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle'; o.frequency.value = f;
    g.gain.setValueAtTime(0, ini); g.gain.linearRampToValueAtTime(vol, ini + .01); g.gain.exponentialRampToValueAtTime(.0001, ini + dur);
    o.connect(g).connect(ctx.destination); o.start(ini); o.stop(ini + dur + .05);
  };
  return {
    get ligado() { return ligado; },
    alternar() { ligado = !ligado; try { localStorage.setItem('saturno_som', ligado ? '1' : '0'); } catch {} destravar(); if (ligado) this.tocar('lead'); },
    tocar(tipo) {
      if (!ligado || !ctx) return;
      const t = ctx.currentTime;
      if (tipo === 'pedido') [0, .7].forEach(d => [880, 1175, 1397, 1760].forEach((f, i) => nota(f, t + d + i * .09, .4, .5)));
      else [0, .16].forEach((d, i) => nota(i ? 1319 : 988, t + d, .35, .45));
      try { navigator.vibrate?.([250, 120, 250]); } catch {}
    }
  };
})();
const pintarSom = () => {
  $('#somBtn').textContent = SOM.ligado ? 'Som ligado' : 'Som desligado';
  $('#somBtn').classList.toggle('off', !SOM.ligado);
};
pintarSom();
$('#somBtn').onclick = () => { SOM.alternar(); pintarSom(); toast(SOM.ligado ? 'Som de aviso ligado' : 'Som de aviso desligado'); };
const TITULO = () => document.title.replace(/^\(\d+\) /, '');
let naoVistos = 0;
document.addEventListener('visibilitychange', () => { if (!document.hidden && naoVistos) { naoVistos = 0; document.title = TITULO(); } });
function avisar(tipo, msg) {
  SOM.tocar(tipo); toast(msg);
  if (document.hidden) { naoVistos++; document.title = `(${naoVistos}) ${TITULO()}`; }
}

// ------------------------------------------------------------------ entrada no app + tempo real
let started = false;
function enter(s) {
  $('#login').classList.add('hidden'); $('#app').classList.remove('hidden');
  $('#userEmail').textContent = s.user?.email || '';
  if (!started) {
    started = true;
    let t;
    API.realtime(p => {
      const n = p.new || {};
      if (p.eventType === 'INSERT' && p.table === 'leads') avisar('lead', `Novo lead: ${n.nome}${n.origem && n.origem !== 'manual' ? ` (${ORIGEM[n.origem] || n.origem})` : ''}`);
      if (p.eventType === 'INSERT' && p.table === 'pedidos' && n.origem !== 'manual') avisar('pedido', `Novo pedido #${n.numero}`);
      if (p.eventType === 'UPDATE' && p.table === 'leads' && n.etapa === 'humano' && p.old?.etapa && p.old.etapa !== 'humano') avisar('lead', `${n.nome} pediu atendimento humano`);
      cache.clear();
      // telas com digitação em andamento não são redesenhadas
      clearTimeout(t); t = setTimeout(() => ['whatsapp', 'mensagens'].includes(current) ? atualizarContadores() : route(true), 500);
    });
    API.waRealtime(onWaRealtime);
    window.addEventListener('hashchange', () => route());
    setInterval(atualizarContadores, 60000);
  }
  route();
}

// ------------------------------------------------------------------ rotas
const VIEWS = {
  dashboard: viewDashboard, leads: viewLeads, tarefas: viewTarefas, pedidos: viewPedidos, clientes: viewClientes,
  assinaturas: viewAssinaturas, produtos: viewProdutos, margem: viewMargem, whatsapp: viewWhatsapp, mensagens: viewMensagens, integracao: viewIntegracao
};
let current = '';
async function route(silent) {
  const r = (location.hash.slice(1) || 'dashboard').split('?')[0];
  const v = VIEWS[r] ? r : 'dashboard';
  document.querySelectorAll('#nav a, #tabbar a').forEach(a => a.classList.toggle('on', a.dataset.r === v));
  document.querySelector('.side').classList.remove('open');
  // atualização silenciosa (tempo real) não redesenha quem está digitando
  if (silent && document.activeElement?.matches?.('#view input:not([type=checkbox]), #view textarea')) return atualizarContadores();
  if (silent && document.querySelector('.ov')) return atualizarContadores();
  if (!silent || current !== v) { if (!silent) $('#view').innerHTML = '<div class="empty">Carregando…</div>'; }
  current = v;
  try { await VIEWS[v](silent); }
  catch (e) { console.error(e); $('#view').innerHTML = header('Ops', '') + `<div class="card empty">Erro ao carregar: ${esc(e.message)}</div>`; }
  atualizarContadores();
}

// contadores do menu: leads novos, tarefas vencidas, pedidos novos, assinaturas vencidas, WhatsApp não lido
async function atualizarContadores() {
  const set = (id, n, tb) => { const b = $(id); if (b) { b.textContent = n > 99 ? '99+' : n; b.classList.toggle('hidden', !n); } if (tb) { const m = $(tb); m.textContent = n > 99 ? '99+' : n; m.classList.toggle('hidden', !n); } };
  try {
    const [leads, tarefas, peds] = await Promise.all([cache.leads(), cache.tarefas(), cache.pedidos()]);
    set('#bLeads', leads.filter(l => l.etapa === 'novo' || l.etapa === 'humano').length, '#tbLeads');
    set('#bTarefas', tarefas.filter(t => !t.feita && t.vence_em && t.vence_em <= hojeKey()).length);
    set('#bPedidos', peds.filter(p => p.status === 'novo').length, '#tbPedidos');
  } catch {}
  try { set('#bAssin', (await API.assinaturas()).filter(a => a.status === 'ativa' && diasAte(a.proximo_vencimento) < 0).length); } catch {}
  try { set('#bWa', (await API.waConversas()).reduce((s, c) => s + (c.nao_lidas || 0), 0), '#tbWa'); } catch {}
}

// liga os <select> de etapa de lead e de status de pedido da tela
function bindSelects(depois) {
  document.querySelectorAll('select[data-etapa]').forEach(s => s.onchange = async () => {
    const id = s.dataset.etapa, nova = s.value;
    s.className = `pill e-${nova}`;
    if (await mudarEtapa(id, nova)) depois?.(); else route(true);
  });
  document.querySelectorAll('select[data-st]').forEach(s => s.onchange = async () => {
    s.disabled = true;
    try { await API.atualizarPedido(s.dataset.st, {status: s.value}); s.className = `pill s-${s.value}`; toast(`Pedido: ${STATUS[s.value]}`); cache.clear(); atualizarContadores(); depois?.(); }
    catch (e) { toast(e.message, true); }
    s.disabled = false;
  });
}

boot();
