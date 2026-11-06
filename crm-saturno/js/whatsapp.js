// =====================================================================
//  SATURNO NFC · CRM — WhatsApp (caixa de entrada pela API oficial da Meta),
//  Mensagens prontas e integração com o agente (n8n)
// =====================================================================
'use strict';
const WA = {convs: [], conv: null, msgs: [], q: ''};
const JANELA = 24 * 3600e3;   // a Meta só aceita texto livre até 24 h depois da última msg do contato
const waNome = c => c.clientes?.nome || c.leads?.nome || c.nome || fmtFone(c.telefone);
// pela API oficial da Meta só dá texto livre até 24 h depois da última msg do contato; pelo Chatwoot (Canal da API) não tem esse limite
const waJanela = c => VIA_CHATWOOT || (!!c.ultima_entrada_em && Date.now() - new Date(c.ultima_entrada_em) < JANELA);
const hora = v => new Date(v).toLocaleTimeString('pt-BR', {timeZone: TZ, hour: '2-digit', minute: '2-digit'});
const previaWa = t => String(t || '').replace(/^\[mensagem de voz\]|^\[áudio\]/, '🎤 Áudio').replace(/^\[imagem\]\s*/, '📷 ').replace(/^📷 $/, '📷 Imagem').replace(/^\[vídeo\]\s*/, '🎥 ').replace(/^🎥 $/, '🎥 Vídeo');
const TICK_1 = '<svg width="13" height="11" viewBox="0 0 13 11" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1.5 6 4.8 9.2 11.5 1.8"/></svg>';
const TICK_2 = '<svg width="17" height="11" viewBox="0 0 17 11" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1.2 6 4.5 9.2 11.2 1.8M9 8l1.2 1.2 6-7.4"/></svg>';
const STATUS_WA = {
  enviando: '<svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-label="Enviando"><circle cx="6.5" cy="6.5" r="5"/><path d="M6.5 3.5v3l2 1.2"/></svg>',
  enviada: TICK_1, entregue: TICK_2, lida: TICK_2.replace('<svg ', '<svg class="lida" '),
  falhou: '<svg width="13" height="13" viewBox="0 0 13 13" fill="#ff9c9c" aria-label="Falhou"><path d="M6.5 1 12.5 12h-12z"/></svg>'};
const ICON_WA_PLAY = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l12.5-7.5z"/></svg>';
const ICON_WA_PAUSE = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6.5 4.5h4v15h-4zM13.5 4.5h4v15h-4z"/></svg>';
const ICON_WA_MIC = '<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 14.5a3.5 3.5 0 0 0 3.5-3.5V6a3.5 3.5 0 1 0-7 0v5a3.5 3.5 0 0 0 3.5 3.5zM18 11a6 6 0 0 1-12 0H4a8 8 0 0 0 7 7.9V22h2v-3.1A8 8 0 0 0 20 11z"/></svg>';
const ICON_WA_SEND = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12 2-12 2z"/></svg>';
const ICON_WA_DOWN = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
const foneVariantes = t => { const d = normFone(t); return [d, d.replace(/^(55\d\d)(\d{8})$/, '$19$2'), d.replace(/^(55\d\d)9(\d{8})$/, '$1$2')]; };

async function viewWhatsapp() {
  const tel = new URLSearchParams(location.hash.split('?')[1] || '').get('tel');
  $('#view').innerHTML = header('WhatsApp', VIA_CHATWOOT ? 'Conversas do WhatsApp da Saturno (via Chatwoot), junto com os leads e clientes' : 'Converse com leads e clientes pelo WhatsApp Business sem sair do CRM',
    `<button class="btn" id="waCfg">Conexão</button><button class="btn pri" id="waNova">+ Nova conversa</button>`) + `
    <div id="wa">
      <div class="wa-list"><div class="search">${ICON_SEARCH}<input class="in" id="waQ" placeholder="Buscar nome ou telefone" value="${esc(WA.q)}"></div><div class="wa-convs" id="waConvs"></div></div>
      <div class="wa-chat" id="waChat"><div class="empty" style="margin:auto">Selecione uma conversa</div></div>
    </div>`;
  $('#waQ').oninput = e => { WA.q = e.target.value; renderWaConvs(); };
  $('#waNova').onclick = novaConversa;
  $('#waCfg').onclick = conexaoWhatsapp;
  WA.convs = await API.waConversas();
  renderWaConvs();
  if (tel) {
    history.replaceState(null, '', '#whatsapp');
    const vs = foneVariantes(tel), c = WA.convs.find(x => vs.includes(x.telefone));
    if (c) return abrirConversa(c);
    const [clis, leads] = await Promise.all([API.clientes(), cache.leads()]);
    const cli = clis.find(x => vs.includes(x.telefone)), ld = leads.find(x => vs.includes(x.telefone));
    return abrirConversa({telefone: normFone(tel), nome: cli?.nome || ld?.nome, clientes: cli ? {id: cli.id, nome: cli.nome} : null, leads: ld ? {id: ld.id, nome: ld.nome, etapa: ld.etapa} : null, nova: true});
  }
  const atual = WA.conv && WA.convs.find(c => c.id === WA.conv.id);
  if (atual && matchMedia('(min-width:821px)').matches) abrirConversa(atual);
}

function renderWaConvs() {
  const el = $('#waConvs'); if (!el) return;
  const q = WA.q.trim().toLowerCase(), qd = q.replace(/\D/g, '');
  const list = WA.convs.filter(c => !q || waNome(c).toLowerCase().includes(q) || (qd && c.telefone.includes(qd)));
  el.innerHTML = list.map(c => `<div class="wa-conv ${WA.conv?.id === c.id ? 'on' : ''}" data-wc="${c.id}">
      <div class="av">${esc(initials(waNome(c)))}</div>
      <div class="grow">
        <div class="l1 ${c.nao_lidas ? 'wa-sem-lida' : ''}"><b>${esc(waNome(c))}</b><span class="small">${c.ultima_msg_em ? ago(c.ultima_msg_em) : ''}</span></div>
        <div class="l2"><span>${esc(previaWa(c.ultima_msg))}</span>${c.nao_lidas ? `<span class="wa-unread">${c.nao_lidas}</span>` : c.bot_pausado ? '<span class="tag bad">humano</span>' : c.leads?.etapa && !c.clientes ? etapaPill(c.leads.etapa) : ''}</div>
      </div></div>`).join('') || `<div class="empty">${WA.convs.length ? 'Nada encontrado' : 'Nenhuma conversa ainda.<br><span class="small">As mensagens recebidas no WhatsApp Business aparecem aqui.</span>'}</div>`;
  el.querySelectorAll('[data-wc]').forEach(d => d.onclick = () => abrirConversa(WA.convs.find(c => c.id === d.dataset.wc)));
}

async function abrirConversa(c) {
  WA.conv = c; WA.naoVistas = 0; WA.msgs = c.nova ? [] : await API.waMensagens(c.id);
  $('#wa')?.classList.add('chat-open');
  renderWaConvs(); renderWaChat();
  if (c.nao_lidas) { c.nao_lidas = 0; renderWaConvs(); API.waLer(c.id).then(atualizarContadores).catch(() => {}); }
}

function renderWaChat() {
  const c = WA.conv, el = $('#waChat'); if (!c || !el) return;
  const aberta = waJanela(c), cid = c.clientes?.id || c.cliente_id, lid = c.leads?.id || c.lead_id;
  el.innerHTML = `
    <div class="wa-head">
      <button class="x wa-back" id="waBack" aria-label="Voltar"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg></button>
      <div class="av">${esc(initials(waNome(c)))}</div>
      <div class="grow"><b>${esc(waNome(c))}</b><div class="small mut">${esc(fmtFone(c.telefone))}${c.leads?.etapa && !cid ? ` · ${esc(ETAPA[c.leads.etapa])}` : ''}</div></div>
      ${lid ? '<button class="btn sm" id="waLead"><span class="wa-lbl-l">Ficha do lead</span><span class="wa-lbl-s">Lead</span></button>' : ''}
      ${cid ? '<button class="btn sm" id="waCli"><span class="wa-lbl-l">Ficha do cliente</span><span class="wa-lbl-s">Cliente</span></button>' : ''}
      ${!lid && !cid ? '<button class="btn sm" id="waNovoLead"><span class="wa-lbl-l">+ Criar lead</span><span class="wa-lbl-s">+ Lead</span></button>' : ''}
      ${linkChatwoot(c.chatwoot_conversa_id) ? `<a class="btn sm ghost" href="${esc(linkChatwoot(c.chatwoot_conversa_id))}" target="_blank" rel="noopener" title="Abrir esta conversa no Chatwoot" aria-label="Abrir no Chatwoot"><span class="wa-lbl-l">Chatwoot ↗</span><span class="wa-lbl-s">↗</span></a>` : ''}
      ${c.nova ? '' : c.bot_pausado
        ? `<button class="btn sm" id="waBotBtn" data-p="0" title="Tira a etiqueta humano${VIA_CHATWOOT ? ' no Chatwoot' : ''}: o agente IA volta a responder" aria-label="Devolver para a IA">🤖<span class="wa-lbl-l"> Devolver para a IA</span></button><span class="tag bad">humano</span>`
        : `<button class="btn sm" id="waBotBtn" data-p="1" title="Põe a etiqueta humano${VIA_CHATWOOT ? ' no Chatwoot' : ''}: o agente IA para de responder esta conversa" aria-label="Assumir (humano)">🧑<span class="wa-lbl-l"> Assumir (humano)</span></button><span class="tag ok">IA respondendo</span>`}
    </div>
    <div class="wa-corpo">
      <div class="wa-msgs" id="waMsgs"></div>
      <button type="button" class="wa-fim oculto" id="waFim" aria-label="Ir para a última mensagem">${ICON_WA_DOWN}<span class="wa-unread hidden" id="waFimN"></span></button>
    </div>
    <div class="wa-rod"><div class="wa-quick"><span class="lbl">Prontas:</span>${MSG_PRONTAS.filter(m => !m.ctx || m.ctx === 'lead' || (cid && m.ctx !== 'ass')).filter((m, i) => i < 8 || m.id === 'gestao').map(m => `<button type="button" data-mp="${m.id}">${esc(m.t)}</button>`).join('')}</div>
    ${aberta ? `
      <form class="wa-comp" id="waForm"><textarea class="in" id="waTxt" rows="1" placeholder="Digite uma mensagem" title="Enter envia, Shift+Enter quebra linha" maxlength="4096"></textarea><button class="wa-send" aria-label="Enviar">${ICON_WA_SEND}</button></form>` : `
      <div class="wa-note">${c.nova || !c.ultima_entrada_em ? 'Para iniciar a conversa' : 'Passaram 24 h desde a última mensagem do contato:'} o WhatsApp só permite enviar um <b>modelo aprovado</b> (Meta › WhatsApp Manager › Modelos de mensagem). Quando a pessoa responder, o chat livre libera.</div>
      <form class="wa-comp" id="waTplForm"><input class="in" id="waTpl" placeholder="Nome do modelo, ex.: boas_vindas" required pattern="[a-z0-9_]+" title="letras minúsculas, números e _">
        <input class="in" id="waLang" value="pt_BR" style="max-width:90px" title="Idioma do modelo"><button class="btn pri">Enviar modelo</button></form>`}</div>`;
  const lista = $('#waMsgs'), fim = $('#waFim');
  fim.onclick = () => lista.scrollTo({top: lista.scrollHeight, behavior: 'smooth'});
  lista.addEventListener('scroll', () => {
    if (lista.scrollHeight - lista.scrollTop - lista.clientHeight < 140) { WA.naoVistas = 0; $('#waFimN').classList.add('hidden'); fim.classList.add('oculto'); }
    else fim.classList.remove('oculto');
  }, {passive: true});
  iniciarPlayers(lista);
  renderWaMsgs();
  el.querySelectorAll('[data-mp]').forEach(b => b.onclick = () => abrirMsgPronta(b.dataset.mp, {telefone: c.telefone, clienteId: cid, leadId: lid, nome: waNome(c)}));
  $('#waBack').onclick = () => { $('#wa').classList.remove('chat-open'); document.querySelectorAll('#waMsgs audio').forEach(a => a.pause()); };
  $('#waLead')?.addEventListener('click', () => openLead(lid));
  $('#waCli')?.addEventListener('click', () => openCliente(cid));
  $('#waNovoLead')?.addEventListener('click', () => formLead({nome: c.nome || '', telefone: c.telefone, origem: 'whatsapp'}));
  $('#waBotBtn')?.addEventListener('click', async e => {
    const pausar = e.currentTarget.dataset.p === '1'; e.currentTarget.disabled = true;
    try { await API.waBot(c.id, pausar); c.bot_pausado = pausar; toast(pausar ? 'Etiqueta humano colocada: o agente IA parou nesta conversa' : 'Etiqueta humano retirada: o agente IA voltou a responder'); renderWaChat(); renderWaConvs(); }
    catch (er) { toast(er.message, true); e.currentTarget.disabled = false; } });
  if (aberta) {
    const ta = $('#waTxt');
    ta.oninput = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'; };
    ta.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#waForm').requestSubmit(); } };
    $('#waForm').onsubmit = e => { e.preventDefault(); const t = ta.value.trim(); if (!t) return; ta.value = ''; ta.oninput(); enviarWa({texto: t}); };
    if (matchMedia('(min-width:821px)').matches) ta.focus();
  } else $('#waTplForm').onsubmit = e => { e.preventDefault(); enviarWa({template: $('#waTpl').value.trim(), idioma: $('#waLang').value.trim() || 'pt_BR'}); };
}

// Imagem ou player de áudio da mensagem (o link temporário entra depois, em hidratarMidia)
const WA_URLS = new Map(); // caminho -> {url, ate}
const WA_ONDAS = new Map(); // caminho -> {h: alturas reais das barras, dur: duração em segundos}
const WA_BARRAS = 38;
const urlMidia = p => { const u = WA_URLS.get(p); return u && u.ate > Date.now() ? u.url : ''; };
const fmtAudio = s => !isFinite(s) || s < 0 ? '0:00' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
// Antes de ler o arquivo, a onda é um desenho que sempre sai igual para o mesmo áudio
function ondaPadrao(semente) {
  let x = 7; for (const ch of String(semente)) x = (x * 31 + ch.charCodeAt(0)) >>> 0;
  return Array.from({length: WA_BARRAS}, () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return .18 + .62 * (x >>> 24) / 255; });
}
const barrasHtml = h => h.map(v => `<i style="height:${Math.round(v * 100)}%"></i>`).join('');

function playerWa(m) {
  const url = urlMidia(m.midia_path), p = esc(m.midia_path), onda = WA_ONDAS.get(m.midia_path);
  const quem = m.direcao === 'saida' ? 'S' : initials(waNome(WA.conv || {telefone: ''}));
  return `<div class="wa-ap" data-midia="${p}"><audio preload="metadata" ${url ? `src="${esc(url)}"` : ''}></audio><button type="button" class="wa-ap-play" aria-label="Reproduzir áudio">${ICON_WA_PLAY}</button><div class="wa-ap-corpo"><div class="wa-ap-onda" role="slider" tabindex="0" aria-label="Posição do áudio" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">${barrasHtml(onda?.h || ondaPadrao(m.midia_path))}<b class="wa-ap-dot"></b></div><span class="wa-ap-t">${onda ? fmtAudio(onda.dur) : '0:00'}</span></div><div class="wa-ap-lado"><div class="wa-ap-av">${esc(quem)}${ICON_WA_MIC}</div><button type="button" class="wa-ap-vel" aria-label="Velocidade do áudio">${WA.vel || 1}×</button></div></div>`;
}
function midiaWa(m) {
  if (!m.midia_path) return '';
  if (m.midia_mime?.startsWith('audio/')) return playerWa(m);
  const url = esc(urlMidia(m.midia_path));
  return `<a class="wa-img" target="_blank" rel="noopener" data-midia="${esc(m.midia_path)}" ${url ? `href="${url}"` : ''}><img alt="Imagem da conversa" ${url ? `src="${url}"` : ''}></a>`;
}
// Com o arquivo na tela, tira o rótulo "[imagem]" ou "[áudio]" e deixa só a legenda
const textoWa = m => m.midia_path ? (m.texto || '').replace(/^(\[(imagem|áudio|mensagem de voz)\]\s*)+/, '') : (m.texto || '');

// A onda real e a duração vêm do próprio arquivo, um áudio por vez e só quando ele aparece na tela
let WA_FILA = Promise.resolve();
function pedirOnda(ap) {
  const p = ap.dataset.midia, url = urlMidia(p);
  if (!url || ap.dataset.onda) return;
  ap.dataset.onda = 1;
  if (WA_ONDAS.has(p)) return aplicarOnda(ap, WA_ONDAS.get(p));
  WA_FILA = WA_FILA.then(async () => {
    if (!ap.isConnected) { delete ap.dataset.onda; return; }
    if (WA_ONDAS.has(p)) return aplicarOnda(ap, WA_ONDAS.get(p));
    try {
      const bruto = await (await fetch(url)).arrayBuffer();
      const som = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(bruto);
      const d = som.getChannelData(0), passo = Math.max(1, Math.floor(d.length / WA_BARRAS)), salto = Math.max(1, Math.floor(passo / 200));
      const brutas = Array.from({length: WA_BARRAS}, (_, i) => { let s = 0, n = 0; for (let j = i * passo; j < Math.min((i + 1) * passo, d.length); j += salto) { s += d[j] * d[j]; n++; } return Math.sqrt(s / (n || 1)); });
      const max = Math.max(...brutas) || 1, onda = {h: brutas.map(v => Math.max(.12, Math.pow(v / max, .75))), dur: som.duration};
      WA_ONDAS.set(p, onda);
      aplicarOnda(ap, onda);
    } catch (e) { console.warn('onda do áudio:', e.message); }
  });
}
function aplicarOnda(ap, onda) {
  const barras = ap.querySelectorAll('.wa-ap-onda i');
  onda.h.forEach((v, i) => { if (barras[i]) barras[i].style.height = Math.round(v * 100) + '%'; });
  ap._n = -1; pintarAudio(ap);
}
const duracaoAudio = ap => { const a = ap.querySelector('audio'); return isFinite(a.duration) && a.duration > 0 ? a.duration : WA_ONDAS.get(ap.dataset.midia)?.dur || 0; };
function pintarAudio(ap) {
  const a = ap.querySelector('audio'), dur = duracaoAudio(ap), t = a.currentTime || 0, frac = dur ? Math.min(1, t / dur) : 0, n = Math.round(frac * WA_BARRAS);
  ap.querySelector('.wa-ap-dot').style.left = (frac * 100) + '%';
  ap.querySelector('.wa-ap-onda').setAttribute('aria-valuenow', Math.round(frac * 100));
  ap.querySelector('.wa-ap-t').textContent = fmtAudio(ap.classList.contains('ativo') || t > 0 ? t : dur);
  if (ap._n !== n) { ap.querySelectorAll('.wa-ap-onda i').forEach((b, i) => b.classList.toggle('on', i < n)); ap._n = n; }
}
function iniciarPlayers(el) {
  const apDe = e => e.target.closest?.('.wa-ap');
  // saiu da tela (trocou de conversa ou de seção): o áudio para junto
  const anima = ap => { const a = ap.querySelector('audio'); if (!ap.isConnected) { a.pause(); return; } if (a.paused) return; pintarAudio(ap); requestAnimationFrame(() => anima(ap)); };
  const buscar = (ap, e) => {
    const a = ap.querySelector('audio'), dur = duracaoAudio(ap), r = ap.querySelector('.wa-ap-onda').getBoundingClientRect();
    if (!dur) return;
    a.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * dur; pintarAudio(ap);
  };
  el.addEventListener('click', e => {
    const img = e.target.closest('.wa-img');
    if (img) {
      e.preventDefault(); if (!img.href) return;
      const lb = document.createElement('div'); lb.className = 'wa-lb'; lb.innerHTML = `<img alt="Imagem da conversa" src="${esc(img.href)}">`;
      const fecha = () => { lb.remove(); document.removeEventListener('keydown', tecla); };
      const tecla = k => { if (k.key === 'Escape') fecha(); };
      lb.onclick = fecha; document.addEventListener('keydown', tecla); document.body.appendChild(lb);
      return;
    }
    const ap = apDe(e); if (!ap) return;
    const a = ap.querySelector('audio');
    if (e.target.closest('.wa-ap-play')) {
      if (!a.getAttribute('src')) return toast('O áudio ainda está carregando', true);
      if (a.paused) a.play().catch(er => { if (er.name !== 'AbortError') toast(er.name === 'NotSupportedError' ? 'Este aparelho não toca esse formato de áudio' : 'Não foi possível tocar o áudio', true); }); else a.pause();
    } else if (e.target.closest('.wa-ap-vel')) {
      WA.vel = {1: 1.5, 1.5: 2, 2: 1}[WA.vel || 1];
      el.querySelectorAll('.wa-ap-vel').forEach(b => { b.textContent = WA.vel + '×'; });
      el.querySelectorAll('audio').forEach(x => { x.playbackRate = WA.vel; });
    }
  });
  // arrastar na onda muda o ponto do áudio
  el.addEventListener('pointerdown', e => { const o = e.target.closest('.wa-ap-onda'); if (!o) return; o.setPointerCapture(e.pointerId); o._arrasta = true; buscar(o.closest('.wa-ap'), e); });
  el.addEventListener('pointermove', e => { const o = e.target.closest('.wa-ap-onda'); if (o?._arrasta) buscar(o.closest('.wa-ap'), e); });
  el.addEventListener('pointerup', e => { const o = e.target.closest('.wa-ap-onda'); if (o) o._arrasta = false; });
  el.addEventListener('pointercancel', e => { const o = e.target.closest('.wa-ap-onda'); if (o) o._arrasta = false; });
  el.addEventListener('keydown', e => {
    const o = e.target.closest('.wa-ap-onda'); if (!o || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault(); const a = o.closest('.wa-ap').querySelector('audio'); a.currentTime = Math.max(0, a.currentTime + (e.key === 'ArrowLeft' ? -5 : 5)); pintarAudio(o.closest('.wa-ap'));
  });
  // eventos de áudio não sobem até a lista: escuta na fase de captura
  const noAudio = (nome, fn) => el.addEventListener(nome, e => { const ap = apDe(e); if (ap) fn(ap, e.target); }, true);
  noAudio('play', (ap, a) => {
    el.querySelectorAll('audio').forEach(x => { if (x !== a) x.pause(); });
    a.playbackRate = WA.vel || 1; ap.classList.add('ativo');
    ap.querySelector('.wa-ap-play').innerHTML = ICON_WA_PAUSE; ap.querySelector('.wa-ap-play').setAttribute('aria-label', 'Pausar áudio');
    anima(ap);
  });
  noAudio('pause', ap => { ap.querySelector('.wa-ap-play').innerHTML = ICON_WA_PLAY; ap.querySelector('.wa-ap-play').setAttribute('aria-label', 'Reproduzir áudio'); pintarAudio(ap); });
  noAudio('ended', (ap, a) => { a.currentTime = 0; ap.classList.remove('ativo'); pintarAudio(ap); });
  noAudio('loadedmetadata', pintarAudio);
  noAudio('durationchange', pintarAudio);
  noAudio('seeked', pintarAudio);
  // link temporário vencido: pede outro uma vez antes de avisar
  noAudio('error', (ap, a) => {
    if (ap._refez || !a.getAttribute('src')) { ap.classList.add('erro'); ap.title = 'Não foi possível carregar o áudio'; return; }
    ap._refez = true; WA_URLS.delete(ap.dataset.midia); a.removeAttribute('src'); hidratarMidia(el);
  });
  // as ondas reais só são lidas para os áudios que aparecem na tela
  el._visao = new IntersectionObserver(es => es.forEach(x => {
    if (!x.isIntersecting) return;
    x.target.dataset.vis = 1; pedirOnda(x.target); el._visao.unobserve(x.target);
  }), {root: el, rootMargin: '200px'});
}

async function hidratarMidia(el) {
  const faltam = [...new Set([...el.querySelectorAll('[data-midia]')].map(x => x.dataset.midia))].filter(p => !urlMidia(p));
  if (faltam.length) {
    try {
      (await API.waMidiaUrls(faltam)).forEach(r => { if (r.signedUrl) WA_URLS.set(r.path, {url: r.signedUrl, ate: Date.now() + 50 * 60e3}); });
    } catch (e) { console.warn('mídia do WhatsApp:', e.message); return; }
  }
  el.querySelectorAll('[data-midia]').forEach(x => {
    const url = urlMidia(x.dataset.midia); if (!url) return;
    if (x.classList.contains('wa-ap')) {
      const a = x.querySelector('audio'); if (!a.getAttribute('src')) a.src = url;
      if (x.dataset.vis) pedirOnda(x);
      return;
    }
    x.href = url;
    const img = x.querySelector('img');
    const carregou = () => { img.classList.add('pronta'); if (el.scrollHeight - el.scrollTop - el.clientHeight < 500) el.scrollTop = el.scrollHeight; };
    if (img.complete && img.getAttribute('src')) img.classList.add('pronta');
    else { img.onload = carregou; if (!img.getAttribute('src')) img.src = url; }
  });
}

// Cria o balão de uma mensagem. O rodapé (hora e tiques) fica à parte para atualizar sem mexer no áudio.
const metaWa = m => `<span class="bub-meta">${hora(m.criado_em)}${m.direcao === 'saida' ? ' ' + (STATUS_WA[m.status] || '') : ''}</span>${m.erro ? `<span class="er">${esc(m.erro)}</span>` : ''}`;
const conteudoWa = m => (m.midia_path || '') + '|' + (m.texto || '');
function classesWa(m, cab) {
  const eAudio = m.midia_path && m.midia_mime?.startsWith('audio/'), eImg = m.midia_path && !eAudio;
  return ['bub', m.direcao === 'saida' ? 'out' : 'in', cab && 'cab', m.status === 'falhou' && 'fail', eAudio && 'tem-audio', eImg && 'tem-img', eImg && !textoWa(m) && 'so-img'].filter(Boolean).join(' ');
}
function criarBalao(m, cab) {
  const n = document.createElement('div'), t = textoWa(m), meta = metaWa(m);
  n.className = classesWa(m, cab); n.dataset.k = m.id; n.dataset.conteudo = conteudoWa(m); n._meta = meta;
  n.innerHTML = `${midiaWa(m)}${t ? `<span class="bub-txt">${esc(t)}</span><span class="bub-esp"></span>` : ''}${meta}`;
  return n;
}
const pintarDepois = ap => requestAnimationFrame(() => { if (ap.isConnected) { ap._n = -1; pintarAudio(ap); } });

// Só o que mudou é mexido na tela: nada pisca, o áudio não para e a rolagem fica onde está
function renderWaMsgs() {
  const el = $('#waMsgs'); if (!el) return;
  const primeira = !el.querySelector('[data-k]');
  const perto = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
  const itens = []; let dia = '', ant = null;
  const ontem = dOnly(Date.now() - 864e5);
  WA.msgs.forEach(m => {
    const d = dOnly(m.criado_em);
    if (d !== dia) { itens.push({k: 'dia' + d, dia: d === dOnly(Date.now()) ? 'Hoje' : d === ontem ? 'Ontem' : d}); dia = d; ant = null; }
    itens.push({k: String(m.id), m, cab: ant !== m.direcao}); ant = m.direcao;
  });
  if (!itens.length) { el.innerHTML = '<div class="wa-vazio">Nenhuma mensagem ainda</div>'; return; }

  const atuais = new Map([...el.children].map(n => [n.dataset.k, n])), chaves = new Set(itens.map(i => i.k));
  atuais.forEach((n, k) => { if (!chaves.has(k)) n.remove(); });
  const observar = n => { const ap = n.querySelector('.wa-ap'); if (ap) { pintarDepois(ap); el._visao?.observe(ap); } };
  let cursor = el.firstElementChild, novasEntrada = 0, novas = 0;
  itens.forEach(it => {
    let n = atuais.get(it.k);
    if (it.dia) {
      if (!n) { n = document.createElement('div'); n.className = 'wa-day'; n.dataset.k = it.k; }
      if (n.textContent !== it.dia) n.textContent = it.dia;
    } else if (!n) {
      n = criarBalao(it.m, it.cab);
      if (!primeira) { n.classList.add('novo'); novas++; if (it.m.direcao === 'entrada') novasEntrada++; }
      observar(n);
    } else if (n.dataset.conteudo !== conteudoWa(it.m)) {
      const novo = criarBalao(it.m, it.cab); n.replaceWith(novo); if (cursor === n) cursor = novo; n = novo;
      observar(n);
    } else {
      const classes = classesWa(it.m, it.cab) + (n.classList.contains('novo') ? ' novo' : '');
      if (n.className !== classes) n.className = classes;
      const meta = metaWa(it.m);
      if (n._meta !== meta) { n.querySelectorAll('.bub-meta,.er').forEach(x => x.remove()); n.insertAdjacentHTML('beforeend', meta); n._meta = meta; }
    }
    if (n === cursor) cursor = cursor.nextElementSibling; else el.insertBefore(n, cursor);
  });

  if (primeira) el.scrollTop = el.scrollHeight;
  else if (WA.irAoFim || (perto && novas)) el.scrollTo({top: el.scrollHeight, behavior: 'smooth'});
  else if (novasEntrada) {
    WA.naoVistas = (WA.naoVistas || 0) + novasEntrada;
    const b = $('#waFimN'); if (b) { b.textContent = WA.naoVistas; b.classList.remove('hidden'); }
    $('#waFim')?.classList.remove('oculto');
  }
  WA.irAoFim = false;
  hidratarMidia(el);
}

async function enviarWa(msg) {
  const c = WA.conv;
  const temp = {id: 'tmp' + Date.now(), direcao: 'saida', texto: msg.texto || `[modelo] ${msg.template}`, status: 'enviando', criado_em: new Date().toISOString()};
  WA.msgs.push(temp); WA.irAoFim = true; renderWaMsgs();
  try {
    const r = await API.waEnviar({telefone: c.telefone, nome: waNome(c), ...msg});
    WA.convs = await API.waConversas();
    const nova = WA.convs.find(x => x.id === r.conversa_id);
    if (nova && c.nova) { WA.conv = nova; WA.msgs = await API.waMensagens(nova.id); renderWaChat(); }
    else if (nova && WA.conv === c) {
      // troca o balão provisório pelo real sem refazer a tela: o áudio que estiver tocando continua
      WA.conv = nova;
      const msgs = await API.waMensagens(nova.id);
      const real = [...msgs].reverse().find(m => m.direcao === 'saida' && m.texto === temp.texto);
      const balao = document.querySelector(`[data-k="${temp.id}"]`);
      if (real && balao) { balao.dataset.k = real.id; balao.dataset.conteudo = conteudoWa(real); }
      WA.msgs = msgs; renderWaMsgs();
    }
    else { temp.status = 'enviada'; renderWaMsgs(); }
    renderWaConvs();
  } catch (e) {
    temp.status = 'falhou'; temp.erro = e.message; renderWaMsgs();
    if (msg.texto && $('#waTxt') && !$('#waTxt').value) $('#waTxt').value = msg.texto;
    toast(e.message, true);
  }
}

let waT;
// avisa mensagem recebida: som + cartão na tela (+ aviso do sistema com a CRM em segundo plano).
// Não avisa se a conversa já está aberta e visível na tela.
const waAvisadas = new Set();
async function avisarMsgWa(row) {
  if (waAvisadas.has(row.id)) return; waAvisadas.add(row.id);
  const aberta = current === 'whatsapp' && WA.conv?.id === row.conversa_id && !document.hidden;
  if (aberta) return;
  let c = WA.convs.find(x => x.id === row.conversa_id);
  if (!c) { WA.convs = await API.waConversas().catch(() => WA.convs); c = WA.convs.find(x => x.id === row.conversa_id); }
  const nome = c ? waNome(c) : 'WhatsApp';
  SOM.tocar('wa');
  if (document.hidden) { naoVistos++; document.title = `(${naoVistos}) ${TITULO()}`; }
  notificar({titulo: nome, texto: previaWa(row.texto).slice(0, 140), icone: '🟢', rotulo: 'Abrir conversa',
    acao: () => { if (c) { location.hash = '#whatsapp?tel=' + c.telefone; } else location.hash = '#whatsapp'; }});
}

function onWaRealtime(p) {
  const row = p.new || {};
  if (p.table === 'wa_mensagens' && p.eventType === 'INSERT' && row.direcao === 'entrada') avisarMsgWa(row);
  if (current !== 'whatsapp') { clearTimeout(waT); waT = setTimeout(atualizarContadores, 500); return; }
  if (p.table === 'wa_mensagens' && WA.conv && row.conversa_id === WA.conv.id) {
    const i = WA.msgs.findIndex(m => m.id === row.id);
    if (i >= 0) WA.msgs[i] = row; else if (!WA.msgs.some(m => String(m.id).startsWith('tmp') && m.status === 'enviando')) WA.msgs.push(row);
    renderWaMsgs();
  }
  clearTimeout(waT);
  waT = setTimeout(async () => {
    WA.convs = await API.waConversas().catch(() => WA.convs);
    if (WA.conv && !WA.conv.nova) {
      const atual = WA.convs.find(c => c.id === WA.conv.id);
      if (atual) { const mudou = waJanela(atual) !== waJanela(WA.conv) || atual.cliente_id !== WA.conv.cliente_id || atual.lead_id !== WA.conv.lead_id;
        WA.conv = atual; if (atual.nao_lidas) { atual.nao_lidas = 0; API.waLer(atual.id).catch(() => {}); } if (mudou) renderWaChat(); }
    }
    renderWaConvs(); atualizarContadores();
  }, 400);
}

function novaConversa() {
  const ov = modal(`<form id="fnc"><div class="dh"><h2>Nova conversa</h2><button type="button" class="x" data-close>${ICON_X}</button></div>
    <div class="db"><label class="f"><span>Telefone / WhatsApp com DDD</span><input class="in" name="tel" required placeholder="(31) 99999-8888" inputmode="tel"></label>
      <p class="small mut">Se a pessoa não falou com a Saturno nas últimas 24 h, a primeira mensagem precisa ser um modelo aprovado pela Meta.</p></div>
    <div class="df"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn pri">Abrir</button></div></form>`, true);
  ov.querySelector('#fnc').onsubmit = e => { e.preventDefault(); const tel = normFone(e.target.tel.value);
    if (tel.length < 12) return toast('Telefone inválido: informe com DDD', true); ov.fechar(); location.hash = '#whatsapp?tel=' + tel; };
}

async function conexaoWhatsapp() {
  if (VIA_CHATWOOT) return conexaoChatwoot();
  const st = await API.waStatus().catch(e => ({erro: e.message}));
  const hook = `${DEMO ? 'https://SEU-PROJETO.supabase.co' : CFG.SUPABASE_URL}/functions/v1/whatsapp`;
  const item = (ok, t) => `<div style="margin-bottom:6px"><span class="ok-dot ${ok ? 'on' : ''}"></span>${t}</div>`;
  const ov = modal(`<div class="dh"><h2>Conectar WhatsApp Business</h2><button class="x" data-close>${ICON_X}</button></div>
    <div class="db">
      ${st.erro ? `<div class="note">${esc(st.erro)}</div>` : `<div class="card" style="margin-bottom:18px">
        ${item(st.token, 'WHATSAPP_TOKEN (token de acesso permanente)')}${item(st.phone_id, 'WHATSAPP_PHONE_NUMBER_ID (ID do número)')}
        ${item(st.verify_token, 'WHATSAPP_VERIFY_TOKEN (senha do webhook, você inventa)')}${item(st.app_secret, 'WHATSAPP_APP_SECRET (chave secreta do app)')}
        ${item(st.encaminhar, 'FORWARD_WEBHOOK_URL (opcional: repassa ao agente n8n)')}</div>`}
      <div class="step"><i>1</i><div>Em <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener">developers.facebook.com</a> crie um app do tipo <b>Empresa</b> e adicione o produto <b>WhatsApp</b>. Cadastre e verifique o número da Saturno.</div></div>
      <div class="step"><i>2</i><div>Em <b>Configurações do negócio › Usuários do sistema</b>, gere um token permanente com <code>whatsapp_business_messaging</code> e <code>whatsapp_business_management</code>.</div></div>
      <div class="step"><i>3</i><div>No terminal, dentro da pasta <b>crm-saturno</b>:<div class="code" style="margin-top:8px">supabase functions deploy whatsapp --no-verify-jwt
supabase secrets set WHATSAPP_TOKEN=... WHATSAPP_PHONE_NUMBER_ID=... \\
  WHATSAPP_VERIFY_TOKEN=uma-senha-qualquer WHATSAPP_APP_SECRET=...</div></div></div>
      <div class="step"><i>4</i><div>No app da Meta: <b>WhatsApp › Configuração › Webhook</b>. URL de retorno:
        <div class="keybox" style="margin:8px 0"><code>${esc(hook)}</code><button class="btn sm" id="cpHook">Copiar</button></div>
        Token de verificação = o mesmo <code>WHATSAPP_VERIFY_TOKEN</code>. Depois assine o campo <b>messages</b>.</div></div>
      <div class="step"><i>5</i><div>Mande uma mensagem para o número da Saturno: ela aparece aqui na hora e o contato novo vira lead no funil.</div></div>
    </div>`, true);
  ov.querySelector('#cpHook').onclick = () => copiar(hook, 'URL copiada');
}

// Passo a passo para ligar o WhatsApp do Chatwoot à CRM
async function conexaoChatwoot() {
  const st = await API.waStatus().catch(e => ({erro: e.message}));
  const base = DEMO ? 'https://SEU-PROJETO.supabase.co' : CFG.SUPABASE_URL;
  const hook = `${base}/functions/v1/chatwoot?token=SUA-SENHA-DO-WEBHOOK`;
  const item = (ok, t) => `<div style="margin-bottom:6px"><span class="ok-dot ${ok ? 'on' : ''}"></span>${t}</div>`;
  const cwBase = (CFG.CHATWOOT_URL || '').replace(/\/+$/, ''), acc = CFG.CHATWOOT_ACCOUNT_ID || 1;
  const ov = modal(`<div class="dh"><h2>WhatsApp pelo Chatwoot</h2><button class="x" data-close>${ICON_X}</button></div>
    <div class="db">
      ${st.erro && !st.chatwoot ? `<div class="note">${esc(st.erro)}</div>` : `<div class="card" style="margin-bottom:18px">
        ${item(st.url && st.conta, 'CHATWOOT_URL e CHATWOOT_ACCOUNT_ID')}${item(st.caixa, 'CHATWOOT_INBOX_ID (caixa do WhatsApp)')}
        ${item(st.token, 'CHATWOOT_TOKEN (token de acesso do Chatwoot)')}${item(st.webhook_token, 'CHATWOOT_WEBHOOK_TOKEN (senha do webhook)')}
        ${item(st.conectado, st.conectado ? 'Conectado ao Chatwoot' : `Ainda não conecta ao Chatwoot${st.erro ? `: ${esc(st.erro)}` : ''}`)}</div>`}
      <div class="step"><i>1</i><div><b>Publicar a função</b> no Supabase: <b>Edge Functions › Deploy a new function › Via editor</b>, nome <code>chatwoot</code>, cole o arquivo <code>supabase/functions/chatwoot/index.ts</code> e publique. Em <b>Details</b>, desligue <b>Verify JWT</b>.</div></div>
      <div class="step"><i>2</i><div><b>Secrets</b> (Edge Functions › Secrets): <code>CHATWOOT_URL</code> = <code>${esc(cwBase || 'https://seu-chatwoot')}</code>, <code>CHATWOOT_ACCOUNT_ID</code> = <code>${esc(acc)}</code>,
        <code>CHATWOOT_INBOX_ID</code> (número da caixa "Whatsapp"), <code>CHATWOOT_TOKEN</code> (Chatwoot › seu perfil › Token de acesso) e <code>CHATWOOT_WEBHOOK_TOKEN</code> (uma senha que você inventa).</div></div>
      <div class="step"><i>3</i><div><b>Webhook</b> no Chatwoot: <a href="${esc(cwBase)}/app/accounts/${esc(acc)}/settings/integrations/webhook" target="_blank" rel="noopener">Integrações › Webhooks</a> › Adicionar. URL (troque o final pela sua senha):
        <div class="keybox" style="margin:8px 0"><code>${esc(hook)}</code><button class="btn sm" id="cpHook">Copiar</button></div>
        Marque <b>Mensagem criada</b> e <b>Conversa atualizada</b>.</div></div>
      <div class="step"><i>4</i><div>Mande uma mensagem para o WhatsApp da Saturno: ela aparece aqui e o contato novo vira lead em "Em atendimento IA".</div></div>
      <p class="small mut">O agente IA do n8n continua respondendo pelo Chatwoot normalmente. Quando alguém da equipe responde por aqui, a conversa ganha a etiqueta <b>${esc(st.etiqueta || 'humano')}</b> e o agente para.</p>
    </div>`, true);
  ov.querySelector('#cpHook').onclick = () => copiar(hook, 'URL copiada: troque o final pela sua senha');
}


// ======================================================================
//  MENSAGENS PRONTAS — para leads (vendas), pedidos (produção/entrega) e mensalidades
//  "Abrir no WhatsApp" usa o link wa.me (não depende da integração com a Meta)
// ======================================================================
const LINK_AVALIACAO = String(EMPRESA.avaliacao_google || '').trim();
const LINK_GESTAO = String(EMPRESA.link_gestao || '').trim();
const oi = d => d.nome ? `, ${d.nome}` : '';
// ctx: lead | ped | ass (vazio = geral). status: etapa do pedido que combina com a mensagem
const MSG_PRONTAS = [
  {id: 'ola', t: 'Saudação', txt: d => `Olá${oi(d)}! Aqui é da ${d.loja} 🪐\nComo posso te ajudar?`},
  {id: 'planos', t: 'Apresentar planos', ctx: 'lead', txt: d => `Oi${oi(d)}! Que bom que você se interessou pela ${d.loja} ✨

Com o cartão NFC, seu cliente aproxima o celular e já abre a página da ${d.empresa || 'sua empresa'}: WhatsApp, Instagram, localização, cardápio/catálogo e avaliação no Google, tudo num toque.

${d.planos}

Qual combina mais com você? Posso te mostrar exemplos de clientes do seu ramo.`},
  {id: 'reuniao', t: 'Agendar conversa', ctx: 'lead', txt: d => `${d.nome || 'Oi'}, que tal uma conversa rápida de 15 minutos para eu entender o que a ${d.empresa || 'sua empresa'} precisa e te mostrar exemplos? Qual dia e horário ficam melhores para você?`},
  {id: 'proposta', t: 'Enviar proposta', ctx: 'lead', txt: d => `${d.nome || 'Olá'}, conforme conversamos, segue a proposta${d.interesse ? ` do *${d.interesse}*` : ''}${d.valor ? `: *${d.valor}*` : ''}.

Inclui a criação da arte do cartão, a página personalizada e a configuração do NFC. Pagamento no Pix ou em até 2x no cartão.

Posso seguir com o seu pedido? 🚀`},
  {id: 'follow', t: 'Follow-up', ctx: 'lead', txt: d => `Oi${oi(d)}! Passando para saber se ficou alguma dúvida sobre a proposta${d.interesse ? ` do ${d.interesse}` : ''} 😊\nSe quiser, ajusto algo para caber melhor no que você precisa.`},
  {id: 'ultimo', t: 'Último contato (sem resposta)', ctx: 'lead', txt: d => `Oi${oi(d)}! Como não tive retorno, imagino que agora não seja o melhor momento, então não vou mais te incomodar 🙂\n\nSe mais pra frente fizer sentido para a ${d.empresa || 'sua empresa'}, é só me chamar aqui que retomamos de onde paramos.`},
  {id: 'fechar', t: 'Dados para fechar o pedido', ctx: 'lead', txt: d => `Perfeito${oi(d)}! Para eu registrar o seu pedido${d.interesse ? ` do *${d.interesse}*` : ''}, me envia por favor:
• Nome completo ou razão social
• CPF ou CNPJ
• Endereço de entrega com CEP
• E-mail

Assim que receber, te mando o pagamento e já começamos a criação da arte 🚀`},
  {id: 'material', t: 'Pedir material para a arte', ctx: 'ped', status: 'arte', txt: d => `Oi${oi(d)}! Vamos começar a arte do seu pedido${d.ped} 🎨 Me envia por aqui:
• Logo em boa qualidade (PNG ou PDF, de preferência sem fundo)
• Cores da marca, se tiver
• Links que vão na página: WhatsApp, Instagram, site, cardápio/catálogo, localização no Google Maps
• Algum modelo ou referência que você goste

Com isso em mãos, te mando a primeira versão para aprovação.`},
  {id: 'arte', t: 'Arte para aprovação', ctx: 'ped', status: 'aprovacao', txt: d => `${d.nome || 'Olá'}, a arte do seu pedido${d.ped} ficou pronta! 🎨
Dá uma olhada e me diga se está tudo certo ou se quer ajustar algo. Assim que você aprovar, já mandamos para produção.`},
  {id: 'producao', t: 'Em produção', ctx: 'ped', status: 'producao', txt: d => `Oi${oi(d)}! Arte aprovada ✅\nSeu pedido${d.ped} entrou em produção${d.prazo ? ` e a previsão de entrega é *${d.prazo}*` : ''}.`},
  {id: 'enviado', t: 'Pedido enviado', ctx: 'ped', status: 'enviado', txt: d => `${d.nome || 'Oi'}, seu pedido${d.ped} foi enviado! 📦${d.rastreio ? `\n\nCódigo de rastreio: *${d.rastreio}*\nAcompanhe em: https://rastreamento.correios.com.br/app/index.php` : ''}`},
  {id: 'entregue', t: 'Entregue + avaliação', ctx: 'ped', status: 'entregue', txt: d => `${d.nome ? `${d.nome}, seu` : 'Seu'} pedido${d.ped} foi entregue! 🪐
${d.pagina ? `\nSua página: ${d.pagina}\n` : ''}
Obrigado por escolher a ${d.loja}! Se puder, avalie a gente no Google, leva menos de 1 minuto ⭐
${d.link}`},
  {id: 'pago', t: 'Pagamento recebido', ctx: 'ped', txt: d => `Pagamento recebido, ${d.nome || 'obrigado'}! ✅\nPedido${d.ped}${d.total ? ` · ${d.total}` : ''}. Já estamos cuidando de tudo por aqui.`},
  {id: 'posvenda', t: 'Pós-venda (dicas de uso)', ctx: 'ped', txt: d => `Oi${oi(d)}! Tudo certo com o seu cartão${d.ped ? ` (pedido${d.ped})` : ''}? 🪐
${d.pagina ? `\nSua página: ${d.pagina}\n` : ''}
Algumas dicas para aproveitar mais:
• Deixe o cartão em um lugar visível, como no caixa ou no balcão
• Convide o cliente a aproximar o celular na hora de pagar ou ao final do atendimento
• Se algum link ou informação mudar, me avise que atualizamos a página

Qualquer dúvida, é só chamar!`},
  {id: 'gestao', t: 'Assinar Gestão Saturno', txt: d => `Oi${oi(d)}! Para a sua página continuar sempre atualizada, temos a *Gestão Saturno*${d.gestaoValor ? `, por *${d.gestaoValor}/mês*` : ''} 🪐

Nossa equipe cuida da página para você, com suporte direto aqui pelo WhatsApp.

A assinatura é feita pelo link abaixo, com cobrança mensal automática no cartão:
${d.gestao}`},
  {id: 'gestao_ok', t: 'Boas-vindas à Gestão Saturno', ctx: 'ass', txt: d => `${d.nome ? `${d.nome}, sua` : 'Sua'} assinatura da *${d.assinatura || 'Gestão Saturno'}* está ativa! ✅

${d.stripe ? `A cobrança de *${d.valorMensal}* é feita automaticamente no cartão todo mês; a próxima é em *${d.venc}*.` : `O valor é *${d.valorMensal}* por mês; o próximo vencimento é em *${d.venc}*.`}
Sempre que precisar mudar algo na sua página, é só mandar por aqui. Obrigado pela confiança! 🪐`},
  {id: 'mensal', t: 'Lembrete de mensalidade', ctx: 'ass', txt: d => d.stripe
    ? `Oi${oi(d)}! Só um aviso: a mensalidade da ${d.loja} (${d.assinatura}) de *${d.valorMensal}* será cobrada automaticamente no seu cartão em *${d.venc}*.\n\nNão precisa fazer nada. Qualquer dúvida, é só chamar 😊`
    : `Oi${oi(d)}! Passando para lembrar da mensalidade da ${d.loja} (${d.assinatura}) de *${d.valorMensal}*, com vencimento em *${d.venc}*.\n\nPode pagar no Pix. Qualquer dúvida, é só chamar 😊`},
  {id: 'atraso', t: 'Mensalidade em atraso', ctx: 'ass', txt: d => `Oi${oi(d)}, tudo bem? Não identificamos o pagamento da mensalidade da ${d.loja} (${d.assinatura}) de *${d.valorMensal}*, que venceu em *${d.venc}*.

${d.stripe ? 'Pode ser que o cartão tenha sido recusado ou esteja vencido. Me chama aqui que te ajudo a regularizar.' : 'Pode pagar no Pix e me mandar o comprovante por aqui.'}
Se já pagou, desconsidere esta mensagem 😊`},
  {id: 'indicacao', t: 'Pedir indicação', txt: d => `Oi${oi(d)}! Que bom ter você como cliente da ${d.loja} 🪐\n\nConhece alguém que também ganharia com um cartão NFC ou com mais avaliações no Google? Se puder, me passa o contato ou encaminha esta mensagem. Vamos cuidar dessa pessoa com o mesmo carinho!`},
  {id: 'avaliar', t: 'Avaliar no Google', txt: d => `Oi${oi(d)}! Sua opinião é muito importante pra gente ⭐\nPode avaliar a ${d.loja} no Google? Leva menos de 1 minuto:\n${d.link}\n\nMuito obrigado! 🪐`}
];

async function dadosMsg({lead, cliente, pedido, assinatura, nome}) {
  const prods = await API.produtos().catch(() => []);
  const planos = prods.filter(p => p.ativo && p.categoria === 'Planos').map(p => `• *${p.nome}*: ${brl(p.preco)}${p.descricao ? ` (${p.descricao})` : ''}`).join('\n');
  const gestao = prods.find(p => p.nome === 'Gestão Saturno');
  const pessoa = cliente || lead || pedido?.clientes || assinatura?.clientes || {};
  return {
    loja: TEMA.get().marca || EMPRESA.nome || 'Saturno NFC', nome: primeiroNome(pessoa.nome || nome), empresa: pessoa.empresa || lead?.empresa || '',
    interesse: lead?.interesse || '', valor: +lead?.valor ? brl(lead.valor) : '', planos: planos || '[liste aqui os planos]',
    ped: pedido ? ` *#${pedido.numero}*` : '', total: pedido ? brl(pedido.total) : '', prazo: pedido?.prazo ? dOnly(pedido.prazo) : '', rastreio: pedido?.codigo_rastreio || '',
    pagina: cliente?.link_pagina || '', assinatura: assinatura?.descricao || '', valorMensal: assinatura ? brl(assinatura.valor) : '', venc: assinatura ? dOnly(assinatura.proximo_vencimento) : '',
    stripe: !!assinatura?.stripe_assinatura_id,
    gestao: LINK_GESTAO || '[cole aqui o link de assinatura da Gestão Saturno]', gestaoValor: +gestao?.preco ? brl(gestao.preco) : '',
    link: LINK_AVALIACAO || '[cole aqui o link de avaliação do Google]'
  };
}

// modal com o texto pronto (usado no chat do WhatsApp)
async function abrirMsgPronta(id, ctx) {
  const m = MSG_PRONTAS.find(x => x.id === id);
  const [peds, leads] = await Promise.all([cache.pedidos(), cache.leads()]);
  const cliente = ctx.clienteId ? await API.cliente(ctx.clienteId).catch(() => null) : null;
  const lead = leads.find(l => l.id === ctx.leadId) || null;
  const pedsCli = ctx.clienteId ? peds.filter(p => p.cliente_id === ctx.clienteId) : [];
  const ass = cliente?.assinaturas?.find(a => a.status === 'ativa') || null;
  const ov = modal(`<form id="fmp"><div class="dh"><div><h2>${esc(m.t)}</h2><div class="small mut">Para ${esc(ctx.nome)} · confira e edite antes de enviar</div></div><button type="button" class="x" data-close>${ICON_X}</button></div>
    <div class="db">
      ${m.ctx === 'ped' ? (pedsCli.length ? `<label class="f"><span>Pedido</span><select class="in" id="mpPed">${pedsCli.map(p => `<option value="${p.id}">#${p.numero} · ${brl(p.total)} · ${esc(STATUS[p.status])}</option>`).join('')}</select></label>` : '<div class="note">Este contato não tem pedido no CRM: o texto vai sem os dados do pedido.</div>') : ''}
      ${(m.id === 'avaliar' || m.id === 'entregue') && !LINK_AVALIACAO ? '<div class="note">Link de avaliação não configurado: coloque em <code>config.js</code> → <code>avaliacao_google</code>, ou troque o trecho entre colchetes.</div>' : ''}
      <label class="f"><span>Mensagem</span><textarea class="in" id="mpTxt"></textarea></label>
      ${m.status ? '<label class="check" id="mpStL"><input type="checkbox" id="mpSt"> Também mudar o pedido para "' + esc(STATUS[m.status]) + '"</label>' : ''}
    </div>
    <div class="df"><button type="button" class="btn ghost" data-close>Fechar</button>${$('#waTxt') ? '<button type="button" class="btn" id="mpUsar">Colocar no chat</button>' : ''}<button class="btn pri">Copiar texto</button></div></form>`, true);
  const ta = ov.querySelector('#mpTxt'), sel = ov.querySelector('#mpPed'), st = ov.querySelector('#mpSt');
  const preencher = async () => { const p = pedsCli.find(x => x.id === sel?.value) || null;
    ta.value = m.txt(await dadosMsg({lead, cliente, pedido: p, assinatura: ass, nome: ctx.nome})).replace(/\n{3,}/g, '\n\n').trim();
    if (st) st.checked = !!p && PED_ABERTOS.includes(p.status) && p.status !== m.status; };
  if (sel) sel.onchange = preencher;
  await preencher();
  const mudar = async () => { if (!st?.checked || !sel) return; try { await API.atualizarPedido(sel.value, {status: m.status}); cache.clear(); toast(`Pedido: ${STATUS[m.status]}`); } catch (er) { toast(er.message, true); } };
  ov.querySelector('#fmp').onsubmit = async e => { e.preventDefault(); await copiar(ta.value, 'Texto copiado: é só colar na conversa'); ov.fechar(); await mudar(); };
  ov.querySelector('#mpUsar')?.addEventListener('click', async () => { const w = $('#waTxt'); w.value = ta.value; w.oninput(); ov.fechar(); w.focus(); await mudar(); });
}

// tela Mensagens prontas: escolha o lead, o pedido ou a mensalidade, confira e copie
const MP = {aba: 'lead', sel: null, q: ''};
async function viewMensagens(silent) {
  if (silent && document.activeElement?.closest?.('#mpCards')) return;
  const qs = new URLSearchParams(location.hash.split('?')[1] || '');
  if (qs.get('ped')) { MP.aba = 'ped'; MP.sel = qs.get('ped'); } else if (qs.get('ass')) { MP.aba = 'ass'; MP.sel = qs.get('ass'); } else if (qs.get('lead')) { MP.aba = 'lead'; MP.sel = qs.get('lead'); }
  if ([...qs.keys()].length) history.replaceState(null, '', '#mensagens');
  const [leads, peds, ass] = await Promise.all([cache.leads(true), cache.pedidos(true), API.assinaturas()]);
  const fontes = {
    lead: leads.filter(l => ETAPAS_ABERTAS.includes(l.etapa)).map(l => ({id: l.id, nome: l.nome, sub: `${l.empresa || ''} · ${ETAPA[l.etapa]}`, tel: l.telefone, pill: etapaPill(l.etapa), obj: l})),
    ped: peds.slice(0, 80).map(p => ({id: p.id, nome: `#${p.numero} · ${p.clientes?.nome || '—'}`, sub: `${brl(p.total)} · ${itensResumo(p.pedido_itens)}`, tel: p.clientes?.telefone, pill: statusPill(p.status), obj: p})),
    ass: ass.filter(a => a.status === 'ativa').map(a => ({id: a.id, nome: a.clientes?.nome || '—', sub: `${brl(a.valor)} · vence ${dOnly(a.proximo_vencimento)}`, tel: a.clientes?.telefone, pill: diasAte(a.proximo_vencimento) < 0 ? '<span class="tag bad">atrasada</span>' : '', obj: a}))
  };
  $('#view').innerHTML = header('Mensagens prontas', 'Escolha para quem, confira o texto e copie ou abra direto no WhatsApp') + `
    <div class="mp">
      <div class="mp-list">
        <div class="tabs soft" style="margin:12px 12px 0" id="mpAbas">${[['lead', 'Leads'], ['ped', 'Pedidos'], ['ass', 'Mensalidades']].map(([k, t]) => `<button data-a="${k}" class="${MP.aba === k ? 'on' : ''}">${t}</button>`).join('')}</div>
        <div class="search">${ICON_SEARCH}<input class="in" id="mpQ" placeholder="Buscar" value="${esc(MP.q)}"></div>
        <div class="mp-peds" id="mpLista"></div>
      </div>
      <div><div id="mpSel"></div><div class="mp-cards" id="mpCards"></div></div>
    </div>`;
  const lista = () => {
    const q = MP.q.trim().toLowerCase(), it = fontes[MP.aba].filter(x => !q || `${x.nome} ${x.sub}`.toLowerCase().includes(q));
    if (MP.sel && !fontes[MP.aba].some(x => x.id === MP.sel)) MP.sel = null;
    $('#mpLista').innerHTML = `<div class="wa-conv ${!MP.sel ? 'on' : ''}" data-ms=""><div class="av">✉</div><div class="grow"><div class="l1"><b>Mensagem geral</b></div><div class="l2"><span>Saudação, Gestão Saturno, indicação, avaliação</span></div></div></div>`
      + it.map(x => `<div class="wa-conv ${MP.sel === x.id ? 'on' : ''}" data-ms="${x.id}"><div class="av">${esc(initials(x.nome.replace(/^#\d+ · /, '')))}</div>
        <div class="grow"><div class="l1"><b>${esc(x.nome)}</b></div><div class="l2"><span>${esc(x.sub)}</span>${x.pill}</div></div></div>`).join('');
    $('#mpLista').querySelectorAll('[data-ms]').forEach(d => d.onclick = () => { MP.sel = d.dataset.ms || null; lista(); cartoes(); });
  };
  const cartoes = async () => {
    const x = fontes[MP.aba].find(i => i.id === MP.sel) || null;
    const ctx = {lead: MP.aba === 'lead' ? x?.obj : null, pedido: MP.aba === 'ped' ? x?.obj : null, assinatura: MP.aba === 'ass' ? x?.obj : null};
    if (ctx.pedido?.cliente_id) ctx.cliente = await API.cliente(ctx.pedido.cliente_id).catch(() => null);
    const msgs = MSG_PRONTAS.filter(m => !x ? !m.ctx : !m.ctx || m.ctx === MP.aba);
    const d = await dadosMsg(ctx), tel = normFone(x?.tel);
    $('#mpSel').innerHTML = x ? `<div class="mp-sel"><div class="av">${esc(initials(x.nome.replace(/^#\d+ · /, '')))}</div><div style="flex:1;min-width:180px"><b>${esc(x.nome)}</b><div class="small mut">${esc(fmtFone(x.tel))} · ${esc(x.sub)}</div></div>${x.pill}</div>`
      : '<div class="mp-sel small mut">Mensagem geral: "Abrir no WhatsApp" deixa você escolher o contato.</div>';
    $('#mpCards').innerHTML = msgs.map(m => `<div class="mp-card" data-m="${m.id}"><h3>${esc(m.t)}</h3>
        ${(m.id === 'avaliar' || m.id === 'entregue') && !LINK_AVALIACAO ? '<div class="note" style="margin:0">Link de avaliação não configurado em <code>config.js</code>: troque o trecho entre colchetes.</div>' : ''}
        <textarea class="in">${esc(m.txt(d).replace(/\n{3,}/g, '\n\n').trim())}</textarea>
        ${m.status && ctx.pedido && PED_ABERTOS.includes(ctx.pedido.status) && ctx.pedido.status !== m.status ? `<label class="check" style="margin:0"><input type="checkbox" data-mst checked> Também mudar o pedido para "${esc(STATUS[m.status])}"</label>` : ''}
        <div class="acts"><button class="btn pri sm" data-cp>Copiar texto</button><button class="btn sm wa-btn" data-wa>${IC.wa}Abrir no WhatsApp</button></div></div>`).join('');
    const mudar = async (card, m) => { if (!card.querySelector('[data-mst]')?.checked) return;
      try { await API.atualizarPedido(ctx.pedido.id, {status: m.status}); toast(`Pedido #${ctx.pedido.numero}: ${STATUS[m.status]}`); cache.clear(); viewMensagens(); } catch (er) { toast(er.message, true); } };
    $('#mpCards').querySelectorAll('[data-m]').forEach(card => {
      const m = MSG_PRONTAS.find(y => y.id === card.dataset.m), ta = card.querySelector('textarea');
      card.querySelector('[data-cp]').onclick = async () => { await copiar(ta.value, 'Texto copiado: é só colar na conversa'); await mudar(card, m); };
      card.querySelector('[data-wa]').onclick = async () => { window.open(`https://wa.me/${tel}?text=${encodeURIComponent(ta.value)}`, '_blank', 'noopener');
        if (ctx.lead) API.registrarNota(ctx.lead.id, `Mensagem enviada pelo WhatsApp: ${m.t}`, 'whatsapp').catch(() => {}); await mudar(card, m); };
    });
  };
  document.querySelectorAll('#mpAbas [data-a]').forEach(b => b.onclick = () => { MP.aba = b.dataset.a; MP.sel = null; document.querySelectorAll('#mpAbas button').forEach(x => x.classList.toggle('on', x === b)); lista(); cartoes(); });
  $('#mpQ').oninput = e => { MP.q = e.target.value; lista(); };
  lista(); cartoes();
}

// ======================================================================
//  AGENTE WHATSAPP (n8n): chave e chamadas que gravam leads direto no CRM
// ======================================================================
async function viewIntegracao() {
  const chave = await API.chave().catch(() => null);
  const base = DEMO ? 'https://SEU-PROJETO.supabase.co' : CFG.SUPABASE_URL, anon = DEMO ? 'SUA-ANON-KEY' : CFG.SUPABASE_ANON_KEY;
  const curl = (fn, body) => `curl -X POST '${base}/rest/v1/rpc/${fn}' \\\n  -H 'apikey: ${anon.slice(0, 18)}…' \\\n  -H 'Content-Type: application/json' \\\n  -d '${JSON.stringify(body, null, 2).replace(/'/g, "'\\''")}'`;
  const K = 'SUA_CHAVE_DO_AGENTE';
  const fns = [
    ['agente_buscar_contato', 'Início da conversa: quem é esse número (lead, cliente, últimos pedidos)'],
    ['agente_salvar_lead', 'Cria ou atualiza o lead (nome, empresa, interesse, valor, etapa). Lead novo entra em "Em atendimento IA"'],
    ['agente_registrar_nota', 'Grava no histórico do lead um resumo da conversa'],
    ['agente_chamar_humano', 'Move o lead para "Atendimento humano" e avisa a equipe com som'],
    ['agente_listar_produtos', 'Preços e descrições para responder "quanto custa?"'],
    ['agente_status_pedido', '"Como está meu pedido?": status, prazo e rastreio']];
  $('#view').innerHTML = header('Agente WhatsApp', 'Como o agente de IA (n8n) grava e move leads direto neste CRM') + `
    <div class="card" style="margin-bottom:14px"><h3>Chave secreta do agente</h3>
      <p class="mut small" style="margin-bottom:10px">O agente envia essa chave em toda chamada (campo <code>p_chave</code>). Se vazar, gere outra e atualize no n8n.</p>
      <div class="keybox"><code id="kval">${esc(chave || 'Rode o supabase/schema.sql no Supabase primeiro')}</code><button class="btn sm" id="kcopy">Copiar</button><button class="btn sm danger" id="knew">Gerar nova</button></div>
    </div>
    <div class="cols2">
      <div class="card"><h3>Fluxo recomendado</h3>
        <div class="step"><i>1</i><div><b>Mensagem chegou</b><div class="small mut"><code>agente_buscar_contato</code> com o telefone. Se já for cliente, o agente cumprimenta pelo nome.</div></div></div>
        <div class="step"><i>2</i><div><b>Qualificação</b><div class="small mut">Pergunte nome, empresa e o que procura (cartão NFC, avaliação Google, espelho). Salve com <code>agente_salvar_lead</code> a cada dado novo.</div></div></div>
        <div class="step"><i>3</i><div><b>Preços</b><div class="small mut"><code>agente_listar_produtos</code>. Nunca invente valores.</div></div></div>
        <div class="step"><i>4</i><div><b>Pronto para fechar ou dúvida difícil</b><div class="small mut"><code>agente_chamar_humano</code>: o lead vai para "Atendimento humano" e toca o aviso no CRM.</div></div></div>
      </div>
      <div class="card"><h3>Funções (POST /rest/v1/rpc/…)</h3>
        ${fns.map(([f, d]) => `<div style="margin-bottom:10px"><code>${f}</code><div class="small mut">${d}</div></div>`).join('')}
        <p class="small mut">Headers: <code>apikey: ANON_KEY</code> e <code>Content-Type: application/json</code>. Passo a passo no README.</p>
      </div>
    </div>
    <div class="card" style="margin-bottom:14px"><h3>Exemplo · salvar lead</h3><div class="code">${esc(curl('agente_salvar_lead', {p_chave: K, p_dados: {telefone: '31999998888', nome: 'Ana Souza', empresa: 'Café Central', cidade: 'Ouro Preto', interesse: 'Plano Essencial', valor: 600}}))}</div></div>
    <div class="card"><h3>Exemplo · chamar atendente</h3><div class="code">${esc(curl('agente_chamar_humano', {p_chave: K, p_telefone: '31999998888', p_motivo: 'Quer fechar o plano Profissional'}))}</div></div>`;
  $('#kcopy').onclick = () => copiar($('#kval').textContent, 'Chave copiada');
  $('#knew').onclick = async () => { if (!confirm('Gerar nova chave? A antiga para de funcionar na hora.')) return;
    try { $('#kval').textContent = await API.novaChave(); toast('Nova chave gerada: atualize no n8n'); } catch (e) { toast(e.message, true); } };
}
