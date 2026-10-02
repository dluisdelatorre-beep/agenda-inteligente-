// Service worker: vive en el teléfono aunque la app esté cerrada.
// 1) Guarda la app para que abra sin señal.
// 2) Recibe los avisos del servidor (Web Push) y los muestra.
// 3) Atiende los botones del aviso: "Posponer 10 min" y "Hecho".
importScripts('almacen.js');

const CACHE = 'agenda-v3';
const POSPONER_MIN = 10;
const ARCHIVOS = [
  '/', '/index.html', '/styles.css', '/app.js', '/parser.js', '/almacen.js',
  '/manifest.webmanifest', '/icon.svg', '/icons/icon-192.png', '/icons/icon-512.png',
  '/icons/icon-maskable-512.png', '/icons/badge-96.png', '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Primero la red (para ver cambios nuevos); si no hay red, lo guardado. La API nunca se guarda.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  e.respondWith(
    fetch(e.request)
      .then((r) => { const copia = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copia)); return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});

// ---- Llega un aviso del servidor ----
self.addEventListener('push', (e) => {
  let datos = {};
  try { datos = e.data ? e.data.json() : {}; } catch { datos = { cuerpo: e.data && e.data.text() }; }
  e.waitUntil((async () => {
    // Si en el teléfono ya se marcó como hecho o se movió de hora, no molestamos.
    if (datos.id) {
      const lista = await almacen.leer();
      const p = lista.find((x) => x.id === datos.id);
      if (p && (p.hecho || (p.cuando && new Date(p.cuando) - Date.now() > 60000))) return;
      if (p) { p.avisado = true; await almacen.guardar(lista); await almacen.avisarPantallas(); }
    }
    await self.registration.showNotification(datos.titulo || 'Agenda Inteligente', {
      body: datos.cuerpo || 'Tienes un pendiente',
      tag: datos.id || undefined,
      renotify: true,
      requireInteraction: true,
      icon: 'icons/icon-192.png',
      badge: 'icons/badge-96.png',
      data: { id: datos.id },
      actions: datos.id
        ? [{ action: 'posponer', title: `Posponer ${POSPONER_MIN} min` }, { action: 'hecho', title: 'Hecho' }]
        : [],
    });
  })());
});

// ---- Tocan el aviso o uno de sus botones ----
self.addEventListener('notificationclick', (e) => {
  const id = e.notification.data && e.notification.data.id;
  e.notification.close();
  e.waitUntil((async () => {
    if (id && e.action === 'posponer') {
      const p = await almacen.posponer(id, POSPONER_MIN);
      if (p) await almacen.sincronizar(p);
      return almacen.avisarPantallas();
    }
    if (id && e.action === 'hecho') {
      const p = await almacen.marcarHecho(id);
      if (p) await almacen.sincronizar(p);
      return almacen.avisarPantallas();
    }
    // Toque normal: abrir la app (o traerla al frente si ya estaba abierta)
    const abiertas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (abiertas.length) return abiertas[0].focus();
    return self.clients.openWindow('/');
  })());
});

// Si el navegador renueva la suscripción, la volvemos a registrar en el servidor.
self.addEventListener('pushsubscriptionchange', (e) => {
  e.waitUntil((async () => {
    const opciones = e.oldSubscription && e.oldSubscription.options;
    if (!opciones) return;
    const nueva = await self.registration.pushManager.subscribe(opciones);
    await fetch('/api/suscripcion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: nueva.toJSON(), anterior: e.oldSubscription.endpoint }),
    });
    const lista = await almacen.leer();
    await almacen.sincronizar(lista.filter((p) => !p.hecho && p.conHora));
  })());
});
