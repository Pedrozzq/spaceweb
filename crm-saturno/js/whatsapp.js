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
const STATUS_WA = {enviando: '🕓', enviada: '✓', entregue: '✓✓', lida: '<span style="color:var(--blue)">✓✓</span>', falhou: '⚠'};
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
        <div class="l1"><b>${esc(waNome(c))}</b><span class="small mut">${c.ultima_msg_em ? ago(c.ultima_msg_em) : ''}</span></div>
        <div class="l2"><span>${esc(c.ultima_msg || '')}</span>${c.nao_lidas ? `<span class="wa-unread">${c.nao_lidas}</span>` : c.leads?.etapa && !c.clientes ? etapaPill(c.leads.etapa) : ''}</div>
      </div></div>`).join('') || `<div class="empty">${WA.convs.length ? 'Nada encontrado' : 'Nenhuma conversa ainda.<br><span class="small">As mensagens recebidas no WhatsApp Business aparecem aqui.</span>'}</div>`;
  el.querySelectorAll('[data-wc]').forEach(d => d.onclick = () => abrirConversa(WA.convs.find(c => c.id === d.dataset.wc)));
}

async function abrirConversa(c) {
  WA.conv = c; WA.msgs = c.nova ? [] : await API.waMensagens(c.id);
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
      ${lid ? '<button class="btn sm" id="waLead">Ficha do lead</button>' : ''}
      ${cid ? '<button class="btn sm" id="waCli">Ficha do cliente</button>' : ''}
      ${!lid && !cid ? '<button class="btn sm" id="waNovoLead">+ Criar lead</button>' : ''}
      ${linkChatwoot(c.chatwoot_conversa_id) ? `<a class="btn sm ghost" href="${esc(linkChatwoot(c.chatwoot_conversa_id))}" target="_blank" rel="noopener" title="Abrir esta conversa no Chatwoot">Chatwoot ↗</a>` : ''}
      ${c.nova ? '' : `<label class="check" style="margin:0" title="Desligado = o agente IA (n8n) não responde esta conversa${VIA_CHATWOOT ? ' (põe a etiqueta humano no Chatwoot)' : ''}"><input type="checkbox" id="waBot" ${c.bot_pausado ? '' : 'checked'}> Agente IA</label>`}
    </div>
    <div class="wa-msgs" id="waMsgs"></div>
    <div class="wa-quick"><span class="lbl">Prontas:</span>${MSG_PRONTAS.filter(m => !m.ctx || m.ctx === 'lead' || (cid && m.ctx !== 'ass')).slice(0, 8).map(m => `<button type="button" data-mp="${m.id}">${esc(m.t)}</button>`).join('')}</div>
    ${aberta ? `
      <form class="wa-comp" id="waForm"><textarea class="in" id="waTxt" rows="1" placeholder="Digite uma mensagem (Enter envia, Shift+Enter quebra linha)" maxlength="4096"></textarea><button class="btn pri">Enviar</button></form>` : `
      <div class="wa-note">${c.nova || !c.ultima_entrada_em ? 'Para iniciar a conversa' : 'Passaram 24 h desde a última mensagem do contato:'} o WhatsApp só permite enviar um <b>modelo aprovado</b> (Meta › WhatsApp Manager › Modelos de mensagem). Quando a pessoa responder, o chat livre libera.</div>
      <form class="wa-comp" id="waTplForm"><input class="in" id="waTpl" placeholder="Nome do modelo, ex.: boas_vindas" required pattern="[a-z0-9_]+" title="letras minúsculas, números e _">
        <input class="in" id="waLang" value="pt_BR" style="max-width:90px" title="Idioma do modelo"><button class="btn pri">Enviar modelo</button></form>`}`;
  renderWaMsgs();
  el.querySelectorAll('[data-mp]').forEach(b => b.onclick = () => abrirMsgPronta(b.dataset.mp, {telefone: c.telefone, clienteId: cid, leadId: lid, nome: waNome(c)}));
  $('#waBack').onclick = () => $('#wa').classList.remove('chat-open');
  $('#waLead')?.addEventListener('click', () => openLead(lid));
  $('#waCli')?.addEventListener('click', () => openCliente(cid));
  $('#waNovoLead')?.addEventListener('click', () => formLead({nome: c.nome || '', telefone: c.telefone, origem: 'whatsapp'}));
  $('#waBot')?.addEventListener('change', async e => {
    try { await API.waBot(c.id, !e.target.checked); c.bot_pausado = !e.target.checked; toast(e.target.checked ? 'Agente IA ligado nesta conversa' : 'Agente pausado: só a equipe responde'); }
    catch (er) { e.target.checked = !e.target.checked; toast(er.message, true); } });
  if (aberta) {
    const ta = $('#waTxt');
    ta.oninput = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'; };
    ta.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#waForm').requestSubmit(); } };
    $('#waForm').onsubmit = e => { e.preventDefault(); const t = ta.value.trim(); if (!t) return; ta.value = ''; ta.oninput(); enviarWa({texto: t}); };
    if (matchMedia('(min-width:821px)').matches) ta.focus();
  } else $('#waTplForm').onsubmit = e => { e.preventDefault(); enviarWa({template: $('#waTpl').value.trim(), idioma: $('#waLang').value.trim() || 'pt_BR'}); };
}

function renderWaMsgs() {
  const el = $('#waMsgs'); if (!el) return;
  let dia = '';
  el.innerHTML = WA.msgs.map(m => {
    const d = dOnly(m.criado_em), sep = d !== dia ? `<div class="wa-day">${d === dOnly(Date.now()) ? 'Hoje' : d}</div>` : ''; dia = d;
    const out = m.direcao === 'saida';
    return `${sep}<div class="bub ${out ? 'out' : 'in'} ${m.status === 'falhou' ? 'fail' : ''}">${esc(m.texto || '')}<small>${hora(m.criado_em)}${out ? ' ' + (STATUS_WA[m.status] || '') : ''}</small>${m.erro ? `<span class="er">${esc(m.erro)}</span>` : ''}</div>`;
  }).join('') || '<div class="empty" style="margin:auto">Nenhuma mensagem ainda</div>';
  el.scrollTop = el.scrollHeight;
}

async function enviarWa(msg) {
  const c = WA.conv;
  const temp = {id: 'tmp' + Date.now(), direcao: 'saida', texto: msg.texto || `[modelo] ${msg.template}`, status: 'enviando', criado_em: new Date().toISOString()};
  WA.msgs.push(temp); renderWaMsgs();
  try {
    const r = await API.waEnviar({telefone: c.telefone, nome: waNome(c), ...msg});
    WA.convs = await API.waConversas();
    const nova = WA.convs.find(x => x.id === r.conversa_id);
    if (nova && (c.nova || WA.conv === c)) { WA.conv = nova; WA.msgs = await API.waMensagens(nova.id); renderWaChat(); }
    else { temp.status = 'enviada'; renderWaMsgs(); }
    renderWaConvs();
  } catch (e) {
    temp.status = 'falhou'; temp.erro = e.message; renderWaMsgs();
    if (msg.texto && $('#waTxt') && !$('#waTxt').value) $('#waTxt').value = msg.texto;
    toast(e.message, true);
  }
}

let waT;
function onWaRealtime(p) {
  const row = p.new || {};
  if (p.table === 'wa_mensagens' && p.eventType === 'INSERT' && row.direcao === 'entrada' && current !== 'whatsapp') toast('Nova mensagem no WhatsApp');
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
  {id: 'arte', t: 'Arte para aprovação', ctx: 'ped', status: 'aprovacao', txt: d => `${d.nome || 'Olá'}, a arte do seu pedido${d.ped} ficou pronta! 🎨
Dá uma olhada e me diga se está tudo certo ou se quer ajustar algo. Assim que você aprovar, já mandamos para produção.`},
  {id: 'producao', t: 'Em produção', ctx: 'ped', status: 'producao', txt: d => `Oi${oi(d)}! Arte aprovada ✅\nSeu pedido${d.ped} entrou em produção${d.prazo ? ` e a previsão de entrega é *${d.prazo}*` : ''}.`},
  {id: 'enviado', t: 'Pedido enviado', ctx: 'ped', status: 'enviado', txt: d => `${d.nome || 'Oi'}, seu pedido${d.ped} foi enviado! 📦${d.rastreio ? `\n\nCódigo de rastreio: *${d.rastreio}*\nAcompanhe em: https://rastreamento.correios.com.br/app/index.php` : ''}`},
  {id: 'entregue', t: 'Entregue + avaliação', ctx: 'ped', status: 'entregue', txt: d => `${d.nome ? `${d.nome}, seu` : 'Seu'} pedido${d.ped} foi entregue! 🪐
${d.pagina ? `\nSua página: ${d.pagina}\n` : ''}
Obrigado por escolher a ${d.loja}! Se puder, avalie a gente no Google, leva menos de 1 minuto ⭐
${d.link}`},
  {id: 'pago', t: 'Pagamento recebido', ctx: 'ped', txt: d => `Pagamento recebido, ${d.nome || 'obrigado'}! ✅\nPedido${d.ped}${d.total ? ` · ${d.total}` : ''}. Já estamos cuidando de tudo por aqui.`},
  {id: 'mensal', t: 'Lembrete de mensalidade', ctx: 'ass', txt: d => `Oi${oi(d)}! Passando para lembrar da mensalidade da ${d.loja} (${d.assinatura}) de *${d.valorMensal}*, com vencimento em *${d.venc}*.\n\nPode pagar no Pix. Qualquer dúvida, é só chamar 😊`},
  {id: 'avaliar', t: 'Avaliar no Google', txt: d => `Oi${oi(d)}! Sua opinião é muito importante pra gente ⭐\nPode avaliar a ${d.loja} no Google? Leva menos de 1 minuto:\n${d.link}\n\nMuito obrigado! 🪐`}
];

async function dadosMsg({lead, cliente, pedido, assinatura, nome}) {
  const prods = await API.produtos().catch(() => []);
  const planos = prods.filter(p => p.ativo && p.categoria === 'Planos').map(p => `• *${p.nome}*: ${brl(p.preco)}${p.descricao ? ` (${p.descricao})` : ''}`).join('\n');
  const pessoa = cliente || lead || pedido?.clientes || assinatura?.clientes || {};
  return {
    loja: TEMA.get().marca || EMPRESA.nome || 'Saturno NFC', nome: primeiroNome(pessoa.nome || nome), empresa: pessoa.empresa || lead?.empresa || '',
    interesse: lead?.interesse || '', valor: +lead?.valor ? brl(lead.valor) : '', planos: planos || '[liste aqui os planos]',
    ped: pedido ? ` *#${pedido.numero}*` : '', total: pedido ? brl(pedido.total) : '', prazo: pedido?.prazo ? dOnly(pedido.prazo) : '', rastreio: pedido?.codigo_rastreio || '',
    pagina: cliente?.link_pagina || '', assinatura: assinatura?.descricao || '', valorMensal: assinatura ? brl(assinatura.valor) : '', venc: assinatura ? dOnly(assinatura.proximo_vencimento) : '',
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
    $('#mpLista').innerHTML = `<div class="wa-conv ${!MP.sel ? 'on' : ''}" data-ms=""><div class="av">✉</div><div class="grow"><div class="l1"><b>Mensagem geral</b></div><div class="l2"><span>Saudação, avaliação no Google</span></div></div></div>`
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
