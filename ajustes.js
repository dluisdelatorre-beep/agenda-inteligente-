// Preferencias de apariencia y sonido.
// - Se guardan aparte de los pendientes (IndexedDB, clave "ajustes").
// - Una copia en localStorage aplica el tema antes de pintar (sin parpadeo).
// - Los sonidos se generan al momento con Web Audio: no hay archivos que descargar.
(function () {
  const COPIA = 'agenda-inteligente:ajustes';
  const PREDETERMINADOS = Object.freeze({
    theme: 'auto',          // auto | claro | oscuro
    accentColor: 'verde',   // verde | naranja | azul | morado | rojo
    density: 'comoda',      // comoda | compacta
    textSize: 'normal',     // normal | grande
    appSoundEnabled: true,
    appSoundStyle: 'suave', // suave | digital | minimal
    vibrationEnabled: true,
  });
  const VALIDOS = {
    theme: ['auto', 'claro', 'oscuro'],
    accentColor: ['verde', 'naranja', 'azul', 'morado', 'rojo'],
    density: ['comoda', 'compacta'],
    textSize: ['normal', 'grande'],
    appSoundStyle: ['suave', 'digital', 'minimal'],
  };

  function limpiar(a) {
    const r = { ...PREDETERMINADOS };
    if (!a || typeof a !== 'object') return r;
    for (const k of Object.keys(PREDETERMINADOS)) {
      if (!(k in a)) continue;
      if (VALIDOS[k] ? VALIDOS[k].includes(a[k]) : typeof a[k] === typeof PREDETERMINADOS[k]) r[k] = a[k];
    }
    return r;
  }

  function leerCopia() {
    try { return limpiar(JSON.parse(localStorage.getItem(COPIA))); } catch { return { ...PREDETERMINADOS }; }
  }

  let actuales = leerCopia();

  // Pone los atributos en <html>; el CSS hace el resto.
  function aplicar(a = actuales) {
    const h = document.documentElement;
    h.dataset.theme = a.theme;
    h.dataset.accent = a.accentColor;
    h.dataset.density = a.density;
    h.dataset.text = a.textSize;
    const oscuro = a.theme === 'oscuro' || (a.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    meta.content = oscuro ? '#111717' : '#f6f3ec';
    document.head.appendChild(meta);
  }

  async function cargar() {
    try {
      const guardados = await almacen.leerAjustes();
      if (guardados) {
        actuales = limpiar(guardados);
        try { localStorage.setItem(COPIA, JSON.stringify(actuales)); } catch {}
        aplicar();
      } else {
        await almacen.guardarAjustes(actuales);
      }
    } catch {}
    return actuales;
  }

  async function cambiar(parcial) {
    actuales = limpiar({ ...actuales, ...parcial });
    aplicar();
    try { localStorage.setItem(COPIA, JSON.stringify(actuales)); } catch {}
    try { await almacen.guardarAjustes(actuales); } catch {}
    return actuales;
  }

  const restaurar = () => cambiar({ ...PREDETERMINADOS });

  // Si el tema es "automático" y el sistema cambia de claro a oscuro, seguirlo.
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => aplicar());

  // ---- Sonidos dentro de la app ----
  // Cada estilo es una receta corta de notas. Volumen moderado y fundido suave.
  const RECETAS = {
    suave: {
      onda: 'sine', volumen: 0.09,
      crear: [[660, 0, 0.12], [880, 0.09, 0.16]],
      hecho: [[523, 0, 0.1], [659, 0.08, 0.1], [784, 0.16, 0.2]],
      recordatorio: [[880, 0, 0.18], [660, 0.2, 0.18], [880, 0.4, 0.22]],
      posponer: [[784, 0, 0.12], [587, 0.1, 0.18]],
    },
    digital: {
      onda: 'square', volumen: 0.035,
      crear: [[1046, 0, 0.05], [1318, 0.06, 0.06]],
      hecho: [[1318, 0, 0.05], [1568, 0.06, 0.05], [2093, 0.12, 0.08]],
      recordatorio: [[1568, 0, 0.07], [1568, 0.12, 0.07], [1568, 0.24, 0.1]],
      posponer: [[1318, 0, 0.05], [988, 0.07, 0.08]],
    },
    minimal: {
      onda: 'triangle', volumen: 0.08,
      crear: [[740, 0, 0.07]],
      hecho: [[988, 0, 0.09]],
      recordatorio: [[880, 0, 0.1], [880, 0.18, 0.1]],
      posponer: [[587, 0, 0.08]],
    },
  };

  let ctx = null;
  function contexto() {
    if (!ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      ctx = new C();
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }
  // iPhone y Chrome solo permiten audio después de un toque: lo "despertamos" en el primero.
  ['pointerdown', 'keydown'].forEach((ev) =>
    window.addEventListener(ev, () => { if (actuales.appSoundEnabled) contexto(); }, { once: true, passive: true }));

  let sonando = 0; // para las pruebas: cuántos sonidos se han tocado
  function tocar(evento, estilo) {
    if (!actuales.appSoundEnabled && !estilo) return false;
    const receta = RECETAS[estilo || actuales.appSoundStyle];
    const notas = receta && receta[evento];
    const c = notas && contexto();
    if (!c) return false;
    const t0 = c.currentTime + 0.01;
    for (const [f, inicio, dur] of notas) {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = receta.onda;
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0 + inicio);
      g.gain.exponentialRampToValueAtTime(receta.volumen, t0 + inicio + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + inicio + dur);
      o.connect(g).connect(c.destination);
      o.start(t0 + inicio);
      o.stop(t0 + inicio + dur + 0.02);
    }
    sonando++;
    return true;
  }

  const puedeVibrar = typeof navigator.vibrate === 'function';
  function vibrar() {
    if (!actuales.vibrationEnabled || !puedeVibrar) return false;
    // Chrome solo deja vibrar después de que la persona tocó la pantalla al menos una vez.
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return false;
    try { return navigator.vibrate([90, 60, 90]); } catch { return false; }
  }

  aplicar();
  window.ajustes = {
    PREDETERMINADOS, cargar, cambiar, restaurar, tocar, vibrar, puedeVibrar,
    get actuales() { return { ...actuales }; },
    get sonidosTocados() { return sonando; },
  };
})();
