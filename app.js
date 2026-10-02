// Agenda Inteligente — lógica de la pantalla.
// Los pendientes viven en este dispositivo (almacen.js). Si se activan los avisos,
// también se manda una copia mínima al servidor para que avise con la app cerrada.
(function () {
  const $ = (id) => document.getElementById(id);
  const POSPONER_MIN = 10;
  let pendientes = [];
  let filtro = 'pendientes';
  let borrador = null;
  let editando = null; // id del pendiente que se está editando

  async function recargar() {
    pendientes = await almacen.leer();
    pintar();
  }
  async function guardar() {
    await almacen.guardar(pendientes);
  }

  // ---- Formatos ----
  const fmtHora = (d) => d.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });
  const mismoDia = (a, b) => a.toDateString() === b.toDateString();
  function describir(cuando, conHora) {
    const d = new Date(cuando);
    const hoy = new Date();
    const manana = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 1);
    let dia;
    if (mismoDia(d, hoy)) dia = 'Hoy';
    else if (mismoDia(d, manana)) dia = 'Mañana';
    else dia = d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'short' });
    dia = dia.charAt(0).toUpperCase() + dia.slice(1);
    return conHora ? `${dia} · ${fmtHora(d)}` : dia;
  }
  // Date -> valor para <input type="datetime-local"> en hora local
  function aLocal(d) {
    const z = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;
  }

  // ---- Encabezado y resumen del día (lo primero que se ve al abrir) ----
  function pintarEncabezado() {
    const ahora = new Date();
    const f = ahora.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
    $('fechaHoy').textContent = f.charAt(0).toUpperCase() + f.slice(1);
    const h = ahora.getHours();
    $('saludo').textContent = h < 12 ? 'Buen día' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
  }

  function pintarResumen() {
    const ahora = new Date();
    const deHoy = pendientes
      .filter((p) => !p.hecho && p.cuando && mismoDia(new Date(p.cuando), ahora))
      .sort((a, b) => new Date(a.cuando) - new Date(b.cuando));
    const atrasados = pendientes.filter((p) => !p.hecho && p.cuando && new Date(p.cuando) < ahora && !mismoDia(new Date(p.cuando), ahora));

    const caja = $('resumen');
    caja.innerHTML = '';
    const h2 = document.createElement('h2');
    h2.textContent = deHoy.length
      ? `Hoy tienes ${deHoy.length} ${deHoy.length === 1 ? 'pendiente' : 'pendientes'}`
      : 'Tu día';
    caja.appendChild(h2);

    if (deHoy.length) {
      const ul = document.createElement('ul');
      deHoy.forEach((p) => {
        const li = document.createElement('li');
        const hora = document.createElement('span');
        hora.className = 'hora';
        hora.textContent = p.conHora ? fmtHora(new Date(p.cuando)) : 'Hoy';
        const t = document.createElement('span');
        t.textContent = p.texto;
        li.append(hora, t);
        ul.appendChild(li);
      });
      caja.appendChild(ul);
    } else {
      const p = document.createElement('p');
      p.className = 'vacio';
      p.textContent = 'No tienes nada agendado para hoy. Escribe abajo lo que necesites recordar.';
      caja.appendChild(p);
    }
    if (atrasados.length) {
      const p = document.createElement('p');
      p.className = 'atrasados';
      p.textContent = `Ojo: ${atrasados.length} ${atrasados.length === 1 ? 'pendiente atrasado' : 'pendientes atrasados'} de días anteriores.`;
      caja.appendChild(p);
    }
  }

  // ---- Lista ----
  function grupoDe(p, ahora) {
    if (!p.cuando) return 'Sin fecha';
    const d = new Date(p.cuando);
    if (d < ahora && !mismoDia(d, ahora)) return 'Atrasados';
    if (mismoDia(d, ahora)) return 'Hoy';
    const manana = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + 1);
    if (mismoDia(d, manana)) return 'Mañana';
    return 'Más adelante';
  }

  function pintarLista() {
    const ahora = new Date();
    const lista = $('lista');
    lista.innerHTML = '';
    const visibles = pendientes
      .filter((p) => (filtro === 'hechos' ? p.hecho : !p.hecho))
      .sort((a, b) => {
        if (!a.cuando) return 1;
        if (!b.cuando) return -1;
        return new Date(a.cuando) - new Date(b.cuando);
      });

    if (!visibles.length) {
      const p = document.createElement('p');
      p.className = 'nada';
      p.textContent = filtro === 'hechos' ? 'Aún no marcas nada como hecho.' : 'Sin pendientes. Disfruta el día.';
      lista.appendChild(p);
      return;
    }

    const orden = ['Atrasados', 'Hoy', 'Mañana', 'Más adelante', 'Sin fecha'];
    let grupoActual = null;
    visibles
      .map((p) => ({ p, g: filtro === 'hechos' ? 'Hechos' : grupoDe(p, ahora) }))
      .sort((a, b) => orden.indexOf(a.g) - orden.indexOf(b.g))
      .forEach(({ p, g }) => {
        if (g !== grupoActual && filtro !== 'hechos') {
          const h = document.createElement('h3');
          h.className = 'grupo';
          h.textContent = g;
          lista.appendChild(h);
          grupoActual = g;
        }
        lista.appendChild(p.id === editando ? editor(p) : tarjeta(p, ahora));
      });
  }

  function boton(clase, texto, etiqueta, accion) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = clase;
    b.textContent = texto;
    if (etiqueta) b.setAttribute('aria-label', etiqueta);
    b.onclick = accion;
    return b;
  }

  function tarjeta(p, ahora) {
    const div = document.createElement('div');
    const vencido = !p.hecho && p.cuando && new Date(p.cuando) < ahora;
    div.className = 'item' + (p.hecho ? ' hecho' : '') + (vencido ? ' vencido' : '');

    const check = boton('check', '', p.hecho ? 'Marcar como pendiente' : 'Marcar como hecho', async () => {
      p.hecho = !p.hecho;
      p.hechoEn = p.hecho ? new Date().toISOString() : null;
      if (!p.hecho) p.avisado = false;
      await guardar(); pintar();
      almacen.sincronizar(p);
    });

    const cuerpo = document.createElement('button');
    cuerpo.type = 'button';
    cuerpo.className = 'cuerpo';
    cuerpo.setAttribute('aria-label', 'Editar: ' + p.texto);
    cuerpo.onclick = () => { if (!p.hecho) { editando = p.id; pintarLista(); } };
    const texto = document.createElement('span');
    texto.className = 'texto';
    texto.textContent = p.texto;
    cuerpo.appendChild(texto);
    if (p.cuando) {
      const c = document.createElement('span');
      c.className = 'cuando';
      c.textContent = describir(p.cuando, p.conHora);
      cuerpo.appendChild(c);
    }

    const acciones = document.createElement('div');
    acciones.className = 'acciones';
    if (vencido || (p.avisado && !p.hecho)) {
      acciones.appendChild(boton('posponer', '+10 min', 'Posponer 10 minutos', () => posponer(p.id)));
    }
    acciones.appendChild(boton('borrar', '×', 'Borrar', async () => {
      pendientes = pendientes.filter((x) => x.id !== p.id);
      await guardar(); pintar();
      almacen.sincronizar({ ...p, hecho: true }); // en el servidor, borrar = ya no avisar
      avisar('Pendiente borrado');
    }));

    div.append(check, cuerpo, acciones);
    return div;
  }

  // ---- Editar un pendiente ----
  function editor(p) {
    const form = document.createElement('form');
    form.className = 'item editor';

    const t = document.createElement('input');
    t.type = 'text';
    t.value = p.texto;
    t.setAttribute('aria-label', 'Texto del pendiente');
    t.required = true;

    const filaFecha = document.createElement('div');
    filaFecha.className = 'fila';
    const f = document.createElement('input');
    f.type = 'datetime-local';
    f.setAttribute('aria-label', 'Fecha y hora');
    if (p.cuando) f.value = aLocal(new Date(p.cuando));
    const quitar = boton('quitar', 'Sin fecha', null, () => { f.value = ''; });
    filaFecha.append(f, quitar);

    const botones = document.createElement('div');
    botones.className = 'fila fin';
    const cancelar = boton('secundario', 'Cancelar', null, () => { editando = null; pintarLista(); });
    const ok = document.createElement('button');
    ok.type = 'submit';
    ok.className = 'primario';
    ok.textContent = 'Guardar cambios';
    botones.append(cancelar, ok);

    form.append(t, filaFecha, botones);
    form.onsubmit = async (e) => {
      e.preventDefault();
      const texto = t.value.trim();
      if (!texto) return;
      p.texto = texto;
      if (f.value) {
        p.cuando = new Date(f.value).toISOString();
        p.conHora = true;
      } else {
        p.cuando = null;
        p.conHora = false;
      }
      p.avisado = false;
      editando = null;
      await guardar(); pintar();
      almacen.sincronizar(p);
      avisar('Cambios guardados');
    };
    setTimeout(() => t.focus(), 0);
    return form;
  }

  async function posponer(id) {
    const p = await almacen.posponer(id, POSPONER_MIN);
    await recargar();
    if (p) {
      almacen.sincronizar(p);
      avisar(`Te recuerdo a las ${fmtHora(new Date(p.cuando))}`);
    }
  }

  function pintar() { pintarEncabezado(); pintarResumen(); pintarLista(); }

  // ---- Captura en lenguaje natural ----
  const entrada = $('entrada');
  entrada.addEventListener('input', () => {
    const frase = entrada.value.trim();
    const caja = $('entendido');
    $('guardar').disabled = !frase;
    if (!frase) { borrador = null; caja.hidden = true; return; }
    borrador = window.interpretar(frase);
    caja.hidden = false;
    caja.innerHTML = '';
    const que = document.createElement('strong');
    que.textContent = borrador.texto;
    caja.append('Entendí: ', que, ' — ', borrador.cuando ? describir(borrador.cuando, borrador.conHora) : 'sin fecha');
  });

  $('captura').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!borrador) return;
    const nuevo = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      texto: borrador.texto,
      cuando: borrador.cuando ? borrador.cuando.toISOString() : null,
      conHora: borrador.conHora,
      hecho: false,
      avisado: false,
      creado: new Date().toISOString(),
    };
    pendientes.push(nuevo);
    await guardar();
    entrada.value = '';
    entrada.dispatchEvent(new Event('input'));
    filtro = 'pendientes';
    marcarFiltro();
    pintar();
    almacen.sincronizar(nuevo);
    avisar('Guardado');
  });

  // ---- Filtros ----
  function marcarFiltro() {
    document.querySelectorAll('.filtro').forEach((b) => b.classList.toggle('activo', b.dataset.filtro === filtro));
  }
  document.querySelectorAll('.filtro').forEach((b) => b.addEventListener('click', () => {
    filtro = b.dataset.filtro; editando = null; marcarFiltro(); pintarLista();
  }));

  // ---- Aviso en pantalla (con botón opcional) ----
  let temporizador;
  function avisar(msg, accion) {
    const a = $('aviso');
    a.innerHTML = '';
    const t = document.createElement('span');
    t.textContent = msg;
    a.appendChild(t);
    if (accion) a.appendChild(boton('accion', accion.texto, null, () => { a.hidden = true; accion.fn(); }));
    a.hidden = false;
    clearTimeout(temporizador);
    temporizador = setTimeout(() => { a.hidden = true; }, accion ? 9000 : 2600);
  }

  // ---- Recordatorios con la app abierta ----
  async function revisarRecordatorios() {
    const ahora = new Date();
    let cambio = false;
    for (const p of pendientes) {
      if (p.hecho || p.avisado || !p.cuando || !p.conHora) continue;
      if (new Date(p.cuando) <= ahora) {
        p.avisado = true;
        cambio = true;
        avisar('⏰ ' + p.texto, { texto: `+${POSPONER_MIN} min`, fn: () => posponer(p.id) });
        mostrarNotificacion(p);
      }
    }
    if (cambio) { await guardar(); pintar(); }
  }

  // Misma etiqueta (tag) que usa el servidor: si llegan los dos, el teléfono muestra uno solo.
  async function mostrarNotificacion(p) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification('Agenda Inteligente', {
        body: p.texto,
        tag: p.id,
        icon: 'icons/icon-192.png',
        badge: 'icons/badge-96.png',
        data: { id: p.id },
        actions: [{ action: 'posponer', title: `Posponer ${POSPONER_MIN} min` }, { action: 'hecho', title: 'Hecho' }],
      });
    } catch {}
  }

  // ---- Avisos con la app cerrada (Web Push) ----
  const esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const instalada = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const hayPush = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

  function b64aBytes(b64) {
    const relleno = '='.repeat((4 - (b64.length % 4)) % 4);
    const crudo = atob((b64 + relleno).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(crudo, (c) => c.charCodeAt(0));
  }

  let servidorSinConfigurar = false;

  async function estadoAvisos() {
    const el = $('estadoAvisos');
    const btn = $('permiso');
    btn.hidden = true;
    if (!hayPush) {
      el.textContent = esIOS && !instalada
        ? 'En iPhone los avisos llegan solo si instalas la app en tu pantalla de inicio.'
        : 'Este navegador no permite avisos.';
      return;
    }
    if (Notification.permission === 'denied') {
      el.textContent = 'Bloqueaste los avisos. Actívalos en los ajustes del navegador para esta página.';
      return;
    }
    if (servidorSinConfigurar && Notification.permission === 'granted') {
      el.textContent = 'Te aviso mientras la app esté abierta. Los avisos con la app cerrada se activan cuando el servidor quede configurado.';
      return;
    }
    const sub = await almacen.suscripcion();
    if (sub && Notification.permission === 'granted') {
      el.textContent = 'Avisos activos: te llegan aunque la app esté cerrada.';
      return;
    }
    el.textContent = '';
    btn.hidden = false;
  }

  async function activarAvisos() {
    const btn = $('permiso');
    btn.disabled = true;
    try {
      const permiso = await Notification.requestPermission();
      if (permiso !== 'granted') return;
      const r = await fetch('/api/vapid');
      if (!r.ok) {
        servidorSinConfigurar = true;
        return;
      }
      const { publicKey } = await r.json();
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64aBytes(publicKey) });
      const ok = await fetch('/api/suscripcion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      if (!ok.ok) throw new Error('suscripción');
      await almacen.sincronizar(pendientes.filter((p) => !p.hecho && p.conHora));
      avisar('Listo, te aviso aunque cierres la app');
    } catch {
      avisar('No se pudieron activar los avisos. Intenta de nuevo.');
    } finally {
      btn.disabled = false;
      estadoAvisos();
    }
  }
  $('permiso').addEventListener('click', activarAvisos);

  // ---- Instalar la app ----
  let promptInstalar = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    promptInstalar = e;
    $('instalar').hidden = false;
  });
  $('instalarBtn').addEventListener('click', async () => {
    if (!promptInstalar) return;
    promptInstalar.prompt();
    const { outcome } = await promptInstalar.userChoice;
    promptInstalar = null;
    $('instalar').hidden = true;
    if (outcome === 'accepted') avisar('Instalando…');
  });
  window.addEventListener('appinstalled', () => { $('instalar').hidden = true; });
  if (esIOS && !instalada) {
    let cerrado = false;
    try { cerrado = sessionStorage.getItem('tip-ios') === '1'; } catch {}
    $('tipIOS').hidden = cerrado;
  }
  $('cerrarTip').addEventListener('click', () => {
    $('tipIOS').hidden = true;
    try { sessionStorage.setItem('tip-ios', '1'); } catch {}
  });

  // ---- Arranque ----
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
    // El service worker avisa cuando cambió algo desde una notificación
    navigator.serviceWorker.addEventListener('message', (e) => { if (e.data && e.data.tipo === 'recargar') recargar(); });
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) recargar(); });

  recargar().then(() => {
    revisarRecordatorios();
    estadoAvisos();
    // Atajo "Nuevo pendiente" del ícono: abre directo en el campo de captura
    if (new URLSearchParams(location.search).has('nuevo')) entrada.focus();
  });
  setInterval(() => { revisarRecordatorios(); pintarResumen(); }, 30000);
})();
