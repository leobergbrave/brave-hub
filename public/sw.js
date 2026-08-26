/* Service worker mínimo — existe porque o navegador só oferece "instalar app"
   quando há um.
   Deliberadamente SEM cache de páginas: um cache aqui faria o app continuar
   abrindo a versão antiga depois de cada deploy, e este sistema muda todo dia.
   A rede é sempre a fonte da verdade; offline só devolve um aviso honesto. */
self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (evento) => {
  if (evento.request.method !== 'GET') return;
  evento.respondWith(
    fetch(evento.request).catch(() =>
      new Response(
        '<meta charset="utf-8"><body style="font:16px system-ui;background:#0a0a0b;color:#fff;padding:32px">Sem conexão. Reconecte e tente de novo.</body>',
        { headers: { 'Content-Type': 'text/html; charset=utf-8' }, status: 503 }
      )
    )
  );
});
