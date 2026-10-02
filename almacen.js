// Almacén de pendientes compartido por la pantalla (app.js) y el service worker (sw.js).
// Usa IndexedDB porque el service worker no puede leer localStorage, y así los botones
// de la notificación ("Posponer 10 min", "Hecho") funcionan aunque la app esté cerrada.
(function (raiz) {
  const BD = 'agenda-inteligente';
  const TABLA = 'kv';
  const CLAVE = 'pendientes';
  const CLAVE_VIEJA = 'agenda-inteligente:v1'; // localStorage de la versión 2

  function abrir() {
    return new Promise((ok, mal) => {
      const r = indexedDB.open(BD, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(TABLA);
      r.onsuccess = () => ok(r.result);
      r.onerror = () => mal(r.error);
    });
  }

  async function operar(modo, fn) {
    const bd = await abrir();
    return new Promise((ok, mal) => {
      const tx = bd.transaction(TABLA, modo);
      const req = fn(tx.objectStore(TABLA));
      tx.oncomplete = () => { bd.close(); ok(req && req.result); };
      tx.onerror = () => { bd.close(); mal(tx.error); };
    });
  }

  async function leer() {
    let lista = await operar('readonly', (s) => s.get(CLAVE));
    if (!lista && typeof localStorage !== 'undefined') {
      // Migración única desde la versión anterior
      try { lista = JSON.parse(localStorage.getItem(CLAVE_VIEJA)) || []; } catch { lista = []; }
      await guardar(lista);
    }
    return lista || [];
  }

  function guardar(lista) {
    return operar('readwrite', (s) => s.put(lista, CLAVE));
  }

  // Cambia un pendiente por id y lo guarda. Devuelve el pendiente ya cambiado (o null).
  async function cambiar(id, fn) {
    const lista = await leer();
    const p = lista.find((x) => x.id === id);
    if (!p) return null;
    fn(p);
    await guardar(lista);
    return p;
  }

  const posponer = (id, minutos = 10) => cambiar(id, (p) => {
    p.cuando = new Date(Date.now() + minutos * 60000).toISOString();
    p.conHora = true;
    p.avisado = false;
    p.hecho = false;
  });

  const marcarHecho = (id) => cambiar(id, (p) => {
    p.hecho = true;
    p.hechoEn = new Date().toISOString();
  });

  // ---- Copia en el servidor de avisos (solo si este dispositivo activó Web Push) ----
  async function suscripcion() {
    try {
      const reg = raiz.registration || (raiz.navigator && raiz.navigator.serviceWorker && await raiz.navigator.serviceWorker.ready);
      return reg && reg.pushManager ? await reg.pushManager.getSubscription() : null;
    } catch { return null; }
  }

  // Manda al servidor uno o varios pendientes. Si no hay suscripción, no hace nada.
  async function sincronizar(pendientes) {
    const sub = await suscripcion();
    if (!sub) return false;
    const lista = (Array.isArray(pendientes) ? pendientes : [pendientes]).filter(Boolean).map((p) => ({
      id: p.id,
      texto: p.texto,
      cuando: p.conHora && !p.hecho ? p.cuando : null, // sin hora o ya hecho = no avisar
    }));
    if (!lista.length) return true;
    try {
      const r = await fetch('/api/recordatorios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: sub.endpoint, recordatorios: lista }),
      });
      return r.ok;
    } catch { return false; }
  }

  // Avisa a las pantallas abiertas que algo cambió (desde el service worker).
  async function avisarPantallas() {
    if (!raiz.clients) return;
    const abiertas = await raiz.clients.matchAll({ type: 'window', includeUncontrolled: true });
    abiertas.forEach((c) => c.postMessage({ tipo: 'recargar' }));
  }

  raiz.almacen = { leer, guardar, cambiar, posponer, marcarHecho, sincronizar, suscripcion, avisarPantallas, leerAjustes, guardarAjustes };

  // ---- Preferencias (registro aparte: nunca se mezcla con los pendientes) ----
  function leerAjustes() {
    return operar('readonly', (s) => s.get('ajustes')).then((a) => a || null);
  }
  function guardarAjustes(ajustes) {
    return operar('readwrite', (s) => s.put(ajustes, 'ajustes'));
  }
})(typeof self !== 'undefined' ? self : window);
