// =====================================================================
//  SATURNO NFC · CRM — notificações no celular (Web Push)
//  Chegam mesmo com a CRM fechada. No iPhone (iOS 16.4+) a CRM precisa estar
//  instalada pelo Safari: Compartilhar > Adicionar à Tela de Início.
//  Atalho criado pelo app "Atalhos" NÃO recebe notificação.
//  Servidor: supabase/notificacoes.sql + Edge Function "push".
// =====================================================================
const PUSH = (() => {
  const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const instalado = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const suporta = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const TIPOS = [
    {k: 'leads', t: 'Leads', d: 'Lead novo e quando o agente pede atendimento humano'},
    {k: 'pedidos', t: 'Pedidos novos', d: 'Pedido criado pelo agente, site ou equipe'},
    {k: 'whatsapp', t: 'Conversas do WhatsApp', d: 'Cada mensagem que um contato manda'},
    {k: 'atualizacoes', t: 'Atualizações', d: 'Venda ganha, status e pagamento de pedido, assinaturas, mensalidade paga e estoque'}
  ];
  const dispositivo = ios ? (/iPad/.test(navigator.userAgent) ? 'iPad' : 'iPhone') : /Android/.test(navigator.userAgent) ? 'Android' : 'Computador';
  let reg = null;
  const registrar = async () => reg || (reg = await navigator.serviceWorker.register('sw.js'));
  const chaveBytes = s => { const b = atob((s + '='.repeat((4 - s.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, c => c.charCodeAt(0)); };
  const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));

  // demo | instalar (iPhone fora do app da Tela de Início) | sem_suporte | bloqueado | inativo | ativo
  async function estado() {
    if (DEMO) return 'demo';
    if (!suporta) return ios && !instalado ? 'instalar' : 'sem_suporte';
    if (Notification.permission === 'denied') return 'bloqueado';
    const s = await (await registrar()).pushManager.getSubscription();
    return s && Notification.permission === 'granted' ? 'ativo' : 'inativo';
  }

  async function ativar(tipos) {
    // pedir a permissão é a 1ª coisa do clique (o iPhone exige que venha direto do toque)
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new Error(perm === 'denied' ? 'Notificações bloqueadas neste aparelho' : 'Permissão não concedida');
    const r = await registrar();
    const {chave} = await API.pushFn({acao: 'chave'});
    let s = await r.pushManager.getSubscription();
    // inscrição antiga com outra chave (chaves VAPID trocadas): refaz
    if (s && s.options?.applicationServerKey && b64(s.options.applicationServerKey) !== b64(chaveBytes(chave))) { await s.unsubscribe(); s = null; }
    if (!s) s = await r.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: chaveBytes(chave)});
    await API.pushRegistrar(s.toJSON(), dispositivo, tipos);
  }

  async function desativar() {
    const s = await (await registrar()).pushManager.getSubscription();
    if (s) { await API.pushRemover(s.endpoint).catch(() => {}); await s.unsubscribe(); }
  }

  async function tiposAtuais() {
    const s = await (await registrar()).pushManager.getSubscription();
    return (s && (await API.pushInscricao(s.endpoint).catch(() => null))?.tipos) || TIPOS.map(x => x.k);
  }

  return {ios, instalado, TIPOS, estado, ativar, desativar, tiposAtuais, registrar, ativo: false};
})();

async function pintarNotif() {
  const st = await PUSH.estado().catch(() => 'inativo');
  PUSH.ativo = st === 'ativo';
  $('#notifBtn').textContent = PUSH.ativo ? '📲 Notificações ligadas' : '📲 Ativar notificações';
  $('#notifBtn').classList.toggle('off', !PUSH.ativo);
  return st;
}

async function abrirNotificacoes() {
  const st = await PUSH.estado().catch(() => 'inativo');
  const cab = t => `<div class="dh"><h2>${t}</h2><button type="button" class="x" data-close>${ICON_X}</button></div>`;
  const fecha = '<div class="df"><button type="button" class="btn pri" data-close>Entendi</button></div>';

  if (st === 'demo') return toast('Notificações funcionam só com o Supabase configurado', true);
  if (st === 'instalar') return modal(`${cab('Receber notificações no iPhone')}<div class="db">
    <p class="mut" style="margin-bottom:14px">O iPhone só manda notificações para a CRM instalada pelo Safari. Atalho feito pelo app <b>Atalhos</b> não recebe.</p>
    <ol class="nt-passos">
      <li><span>Se já tem um ícone da CRM criado pelo app Atalhos, apague (segure o ícone &gt; Remover).</span></li>
      <li><span>Abra <b>${esc(location.origin + location.pathname)}</b> no <b>Safari</b>.</span></li>
      <li><span>Toque em <b>Compartilhar</b> (quadrado com seta para cima) e depois em <b>Adicionar à Tela de Início</b>.</span></li>
      <li><span>Abra a CRM pelo novo ícone, faça login e toque em <b>Ativar notificações</b>.</span></li>
    </ol>
    <p class="small mut">Precisa do iOS 16.4 ou mais novo (Ajustes &gt; Geral &gt; Sobre).</p></div>${fecha}`, true);
  if (st === 'sem_suporte') return modal(`${cab('Notificações')}<div class="db"><p>Este navegador não aceita notificações. No iPhone, atualize para o iOS 16.4 ou mais novo; no computador, use Chrome, Edge ou Safari.</p></div>${fecha}`, true);
  if (st === 'bloqueado') return modal(`${cab('Notificações bloqueadas')}<div class="db">
    <p style="margin-bottom:10px">As notificações da CRM foram recusadas neste aparelho. Para liberar:</p>
    <ol class="nt-passos">${PUSH.ios
      ? '<li><span>Abra <b>Ajustes &gt; Notificações &gt; Saturno CRM</b>.</span></li><li><span>Ligue <b>Permitir Notificações</b> e volte à CRM.</span></li>'
      : '<li><span>Clique no cadeado ao lado do endereço do site.</span></li><li><span>Em <b>Notificações</b>, escolha <b>Permitir</b> e recarregue a página.</span></li>'}</ol></div>${fecha}`, true);

  const tipos = st === 'ativo' ? await PUSH.tiposAtuais() : PUSH.TIPOS.map(x => x.k);
  const ov = modal(`${cab('Notificações no celular')}<div class="db">
    <span class="nt-st ${st === 'ativo' ? 'on' : 'off'}">${st === 'ativo' ? '● Ligadas neste aparelho' : '● Desligadas neste aparelho'}</span>
    <p class="mut" style="margin-bottom:14px">Avisos que chegam mesmo com a CRM fechada. Escolha o que quer receber:</p>
    ${PUSH.TIPOS.map(x => `<label class="nt-tipo"><input type="checkbox" data-tipo="${x.k}" ${tipos.includes(x.k) ? 'checked' : ''}><span><b>${x.t}</b><small>${x.d}</small></span></label>`).join('')}
    <p class="small mut" style="margin-top:10px">Cada pessoa da equipe ativa no próprio celular. Você não recebe aviso das mudanças que você mesmo faz.</p>
  </div>
  <div class="df">
    ${st === 'ativo' ? '<button type="button" class="btn ghost danger" id="ntOff">Desligar</button><button type="button" class="btn" id="ntTeste">Enviar teste</button>' : ''}
    <button type="button" class="btn pri" id="ntOn">${st === 'ativo' ? 'Salvar' : 'Ativar notificações'}</button>
  </div>`, true);

  const escolhidos = () => [...ov.querySelectorAll('[data-tipo]:checked')].map(i => i.dataset.tipo);
  ov.querySelector('#ntOn').onclick = async e => {
    const tp = escolhidos(); if (!tp.length) return toast('Marque pelo menos um tipo de aviso', true);
    e.target.disabled = true;
    try {
      await PUSH.ativar(tp);
      if (st !== 'ativo') await API.pushFn({acao: 'teste'}).catch(() => {});
      toast(st === 'ativo' ? 'Preferências salvas' : 'Notificações ligadas: mandamos um teste');
      try { localStorage.setItem('saturno_push_card', 'ok'); } catch {}
      document.querySelector('.nt-card')?.remove();
      ov.fechar(); pintarNotif();
    } catch (er) { toast(er.message, true); e.target.disabled = false; }
  };
  ov.querySelector('#ntOff')?.addEventListener('click', async () => {
    try { await PUSH.desativar(); toast('Notificações desligadas neste aparelho'); ov.fechar(); pintarNotif(); } catch (er) { toast(er.message, true); }
  });
  ov.querySelector('#ntTeste')?.addEventListener('click', async e => {
    e.target.disabled = true;
    try { const r = await API.pushFn({acao: 'teste'}); toast(r.enviados ? 'Teste enviado: confira a notificação' : 'Nenhum aparelho inscrito: toque em Salvar'); }
    catch (er) { toast(er.message, true); }
    e.target.disabled = false;
  });
}
$('#notifBtn').onclick = () => { document.querySelector('.side')?.classList.remove('open'); abrirNotificacoes(); };
pintarNotif();

// Liga o service worker, zera o número do ícone ao abrir e oferece ativar (uma vez por aparelho)
async function iniciarNotificacoes() {
  if (DEMO || !('serviceWorker' in navigator)) return;
  PUSH.registrar().catch(e => console.warn('Service worker:', e.message));
  navigator.serviceWorker.addEventListener('message', e => { if (e.data?.ir) location.hash = e.data.ir; });
  const zerar = () => { if (!document.hidden) navigator.clearAppBadge?.().catch(() => {}); };
  zerar(); document.addEventListener('visibilitychange', zerar);

  const st = await pintarNotif();
  const celular = matchMedia('(max-width:820px)').matches;
  let visto = null; try { visto = localStorage.getItem('saturno_push_card'); } catch {}
  if (visto || !(st === 'inativo' || (st === 'instalar' && celular))) return;
  const card = document.createElement('div'); card.className = 'nt-card';
  card.innerHTML = `<div class="nt-ico">📲</div><div>
    <b>Receba leads e pedidos no celular</b>
    <p>${st === 'instalar' ? 'Instale a CRM na Tela de Início para ser avisado de leads, pedidos, conversas e atualizações.' : 'Avisos de leads, pedidos, conversas e atualizações mesmo com a CRM fechada.'}</p>
    <div class="nt-bt"><button class="btn sm pri" id="ntCardSim">${st === 'instalar' ? 'Como instalar' : 'Ativar'}</button><button class="btn sm ghost" id="ntCardNao">Agora não</button></div></div>`;
  document.body.appendChild(card);
  card.querySelector('#ntCardSim').onclick = () => { card.remove(); abrirNotificacoes(); };
  card.querySelector('#ntCardNao').onclick = () => { card.remove(); try { localStorage.setItem('saturno_push_card', 'depois'); } catch {} };
}
