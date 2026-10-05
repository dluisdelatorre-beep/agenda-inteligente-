// Service worker: vive en el teléfono aunque la app esté cerrada.
// 1) Guarda la app para que abra sin señal.
// 2) Recibe los avisos del servidor (Web Push) y los muestra.
// 3) Atiende los botones del aviso: "Posponer 10 min" y "Hecho".
importScripts('almacen.js', 'acciones.js');

const CACHE = 'agenda-v20';
const POSPONER_MIN = 10;
const ARCHIVOS = [
  '/', '/index.html', '/styles.css', '/app.js', '/parser.js', '/almacen.js', '/ajustes.js', '/acciones.js', '/categorias.js', '/asistente.js', '/avatar.js', '/contactos.js',
  '/manifest.webmanifest', '/icon.svg', '/icons/icon-192.png', '/icons/icon-512.png',
  '/icons/icon-maskable-512.png', '/icons/badge-96.png', '/icons/apple-touch-icon.png', '/icons/favicon-48.png', '/icons/asistente.png', '/icons/asistente-parpado.png',
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
    let p = null;
    if (datos.id) {
      const lista = await almacen.leer();
      p = lista.find((x) => x.id === datos.id) || null;
      if (p && (p.hecho || (p.cuando && new Date(p.cuando) - Date.now() > 60000))) return;
      // ¿La app (abierta o en segundo plano) ya lanzó este aviso con sonido hace poco? Entonces no se repite el sonido:
      // si el aviso sigue en la barra se deja tal cual; si ya lo quitaron, no se vuelve a poner.
      // Solo cuenta si ese aviso fue para esta MISMA hora (si la editaron o pospusieron, es aviso nuevo).
      if (p && p.avisadoEn && p.avisadoPara === p.cuando && Date.now() - new Date(p.avisadoEn) < 180000) {
        const ya = await self.registration.getNotifications({ tag: datos.id }).catch(() => []);
        if (ya.length) {
          const n = ya[0];
          return self.registration.showNotification(n.title, {
            body: n.body, tag: n.tag, data: n.data, icon: n.icon, badge: n.badge, actions: n.actions,
            requireInteraction: true, renotify: false, silent: true,
          });
        }
        return;
      }
      if (p) { p.avisado = true; p.avisadoEn = new Date().toISOString(); p.avisadoPara = p.cuando; await almacen.guardar(lista); await almacen.avisarPantallas(); }
    }
    // Vibración según Ajustes (solo donde el sistema la respeta, como Android).
    let vibrar = true;
    try { const a = await almacen.leerAjustes(); if (a && a.vibrationEnabled === false) vibrar = false; } catch {}
    // La acción (teléfono, enlace, dirección) vive solo en el teléfono: el servidor nunca la ve.
    const cuerpoAccion = p && acciones.cuerpoNotificacion(p);
    const maximo = (self.Notification && Notification.maxActions) || 2;
    // Si quedó un aviso anterior del mismo pendiente en la barra, se cierra para que el nuevo
    // entre como aviso nuevo (con sonido) y no como reemplazo silencioso.
    if (datos.id) {
      try { (await self.registration.getNotifications({ tag: datos.id })).forEach((n) => n.close()); } catch {}
    }
    await self.registration.showNotification(cuerpoAccion ? p.texto : (datos.titulo || 'Agenda Inteligente'), {
      vibrate: vibrar ? [120, 80, 120] : [],
      silent: false,
      body: cuerpoAccion || datos.cuerpo || 'Tienes un pendiente',
      tag: datos.id || undefined,
      renotify: true,
      requireInteraction: true,
      icon: 'icons/icon-192.png',
      badge: 'icons/badge-96.png',
      data: { id: datos.id },
      actions: datos.id ? acciones.botonesNotificacion(p || {}, maximo, POSPONER_MIN) : [],
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
    // "Llamar ahora", "Abrir pago", "Entrar a reunión", "Cómo llegar", "Abrir enlace".
    // Abre el marcador o el enlace; la llamada siempre la confirma la persona.
    if (id && e.action === 'abrir') {
      const lista = await almacen.leer();
      const destino = acciones.destino(lista.find((x) => x.id === id));
      if (destino && destino.startsWith('tel:')) {
        // Desde un aviso, Chrome abre "tel:" como página en lugar del marcador.
        // Por eso se abre la Agenda con el botón "Llamar ahora" listo; al tocarlo se abre el marcador.
        const abiertas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        if (abiertas.length) {
          await abiertas[0].focus();
          abiertas[0].postMessage({ tipo: 'accion', id });
          return;
        }
        return self.clients.openWindow('/?accion=' + encodeURIComponent(id));
      }
      if (destino) return self.clients.openWindow(destino);
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
