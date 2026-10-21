// =====================================================================
//  SATURNO NFC · CRM — Service Worker
//  Recebe as notificações push (lead novo, pedido, mensagem no WhatsApp,
//  atualizações) mesmo com a CRM fechada, e abre a tela certa ao tocar.
//  No iPhone só funciona com a CRM instalada pela opção
//  "Adicionar à Tela de Início" do Safari (iOS 16.4 ou mais novo).
// =====================================================================
const ICONE = 'img/apple-touch.png';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = {corpo: e.data && e.data.text()}; }
  const avisos = [
    // O iOS cancela a permissão se um push chegar sem notificação visível: sempre mostra uma.
    self.registration.showNotification(d.titulo || 'Saturno CRM', {
      body: d.corpo || '',
      tag: d.tag,                    // mesma tag = substitui a anterior (ex.: várias mensagens da mesma conversa)
      renotify: !!d.tag,
      icon: ICONE,
      badge: ICONE,
      timestamp: Date.now(),
      data: {url: d.url || './'}
    })
  ];
  // número no ícone da Tela de Início (leads esperando + pedidos novos + mensagens não lidas)
  if (d.contador != null && self.navigator.setAppBadge) {
    avisos.push(d.contador > 0 ? self.navigator.setAppBadge(d.contador) : self.navigator.clearAppBadge());
  }
  e.waitUntil(Promise.all(avisos).catch(() => {}));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const alvo = new URL(e.notification.data && e.notification.data.url || './', self.registration.scope);
  e.waitUntil((async () => {
    const abertos = await self.clients.matchAll({type: 'window', includeUncontrolled: true});
    const crm = abertos.find(c => c.url.startsWith(self.registration.scope));
    if (crm) {
      // CRM já aberta: só troca de tela (sem recarregar)
      crm.postMessage({ir: alvo.hash});
      return crm.focus();
    }
    return self.clients.openWindow(alvo.href);
  })());
});
