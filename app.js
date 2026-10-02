// Agenda Inteligente — lógica de la pantalla.
// Los pendientes viven en localStorage de este dispositivo.
(function () {
  const CLAVE = 'agenda-inteligente:v1';
  const $ = (id) => document.getElementById(id);
  let pendientes = cargar();
  let filtro = 'pendientes';
  let borrador = null;

  function cargar() {
    try { return JSON.parse(localStorage.getItem(CLAVE)) || []; } catch { return []; }
  }
  function guardar() {
    try { localStorage.setItem(CLAVE, JSON.stringify(pendientes)); } catch {}
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

  // ---- Encabezado y resumen del día (lo primero que se ve al abrir) ----
  function pintarEncabezado() {
    const ahora = new Date();
    $('fechaHoy').textContent = ahora.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
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
        lista.appendChild(tarjeta(p, ahora));
      });
  }

  function tarjeta(p, ahora) {
    const div = document.createElement('div');
    div.className = 'item' + (p.hecho ? ' hecho' : '') + (!p.hecho && p.cuando && new Date(p.cuando) < ahora ? ' vencido' : '');

    const check = document.createElement('button');
    check.className = 'check';
    check.setAttribute('aria-label', p.hecho ? 'Marcar como pendiente' : 'Marcar como hecho');
    check.onclick = () => { p.hecho = !p.hecho; p.hechoEn = p.hecho ? new Date().toISOString() : null; guardar(); pintar(); };

    const cuerpo = document.createElement('div');
    cuerpo.className = 'cuerpo';
    const texto = document.createElement('p');
    texto.className = 'texto';
    texto.textContent = p.texto;
    cuerpo.appendChild(texto);
    if (p.cuando) {
      const c = document.createElement('p');
      c.className = 'cuando';
      c.textContent = describir(p.cuando, p.conHora);
      cuerpo.appendChild(c);
    }

    const borrar = document.createElement('button');
    borrar.className = 'borrar';
    borrar.setAttribute('aria-label', 'Borrar');
    borrar.textContent = '×';
    borrar.onclick = () => {
      pendientes = pendientes.filter((x) => x.id !== p.id);
      guardar(); pintar();
      avisar('Pendiente borrado');
    };

    div.append(check, cuerpo, borrar);
    return div;
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

  $('captura').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!borrador) return;
    pendientes.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      texto: borrador.texto,
      cuando: borrador.cuando ? borrador.cuando.toISOString() : null,
      conHora: borrador.conHora,
      hecho: false,
      avisado: false,
      creado: new Date().toISOString(),
    });
    guardar();
    entrada.value = '';
    entrada.dispatchEvent(new Event('input'));
    filtro = 'pendientes';
    marcarFiltro();
    pintar();
    avisar('Guardado');
  });

  // ---- Filtros ----
  function marcarFiltro() {
    document.querySelectorAll('.filtro').forEach((b) => b.classList.toggle('activo', b.dataset.filtro === filtro));
  }
  document.querySelectorAll('.filtro').forEach((b) => b.addEventListener('click', () => {
    filtro = b.dataset.filtro; marcarFiltro(); pintarLista();
  }));

  // ---- Avisos en pantalla y notificaciones (mientras la app esté abierta) ----
  let temporizador;
  function avisar(msg) {
    const a = $('aviso');
    a.textContent = msg;
    a.hidden = false;
    clearTimeout(temporizador);
    temporizador = setTimeout(() => { a.hidden = true; }, 2600);
  }

  const puedeNotificar = 'Notification' in window;
  function revisarPermiso() {
    $('permiso').hidden = !puedeNotificar || Notification.permission !== 'default';
  }
  $('permiso').addEventListener('click', async () => {
    await Notification.requestPermission();
    revisarPermiso();
  });

  function revisarRecordatorios() {
    const ahora = new Date();
    let cambio = false;
    pendientes.forEach((p) => {
      if (p.hecho || p.avisado || !p.cuando || !p.conHora) return;
      if (new Date(p.cuando) <= ahora) {
        p.avisado = true;
        cambio = true;
        avisar('⏰ ' + p.texto);
        if (puedeNotificar && Notification.permission === 'granted') {
          try { new Notification('Agenda Inteligente', { body: p.texto, icon: 'icon.svg' }); } catch {}
        }
      }
    });
    if (cambio) { guardar(); pintar(); }
  }

  // ---- Arranque ----
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  revisarPermiso();
  pintar();
  revisarRecordatorios();
  setInterval(() => { revisarRecordatorios(); pintarResumen(); }, 30000);
})();
