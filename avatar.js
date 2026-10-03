// Avatar vivo de la asistente.
// - Hoy: la misma imagen PNG aprobada, con microanimaciones CSS (solo transform y opacity).
// - Mañana (fase 2): se puede cambiar por un avatar animado (por ejemplo Rive) sin tocar el resto de la app:
//   basta con registrar otro "dibujante" con avatarAsistente.usarDibujante({ montar, estado }).
//
// Estados: idle · attention · alert · greeting · assistant-open · success
// El resto de la app solo habla con esta interfaz:
//   avatarAsistente.crear(alTocar)  → devuelve el botón (se crea una sola vez)
//   avatarAsistente.atencion({estado, ids}) → decide si hace 1–2 pulsos de halo
//   avatarAsistente.reaccionar('assistant-open' | 'success' | 'greeting')
(function (raiz) {
  const ESTADOS = ['idle', 'attention', 'alert', 'greeting', 'assistant-open', 'success'];
  const REPETIR_MIN = 10; // si sigue habiendo pendientes que atender, recordarlo como máximo cada 10 min

  // Dibujante por defecto: la imagen PNG con capas para respirar, reaccionar y el halo.
  const dibujantePng = {
    montar(contenedor) {
      contenedor.innerHTML = '';
      const halo = document.createElement('span');
      halo.className = 'avatar-halo';
      halo.setAttribute('aria-hidden', 'true');
      const reaccion = document.createElement('span');
      reaccion.className = 'avatar-reaccion';
      const cabeza = document.createElement('span');
      cabeza.className = 'avatar-cabeza';
      const respira = document.createElement('span');
      respira.className = 'avatar-respira';
      const img = document.createElement('img');
      img.className = 'asistente avatar-asset';
      img.src = 'icons/asistente.png';
      img.alt = '';
      img.width = 88; img.height = 88;
      img.decoding = 'async';
      // Cuadro de parpadeo: la misma imagen con los ojos cerrados, encima y transparente
      const parpado = document.createElement('img');
      parpado.className = 'asistente avatar-parpado';
      parpado.src = 'icons/asistente-parpado.png';
      parpado.alt = '';
      parpado.width = 88; parpado.height = 88;
      parpado.setAttribute('aria-hidden', 'true');
      respira.append(img, parpado);
      cabeza.appendChild(respira);
      reaccion.appendChild(cabeza);
      contenedor.append(halo, reaccion);
    },
    estado() {}, // la imagen no cambia; el CSS lee data-estado del botón
  };

  let dibujante = dibujantePng;
  let boton = null;
  let ultimoEstado = 'idle';
  let idsVistos = '';
  let ultimoPulso = 0;
  let quieto = matchMedia('(prefers-reduced-motion: reduce)');
  // El halo solo sirve si la persona ve el avatar: si está fuera de pantalla (por ejemplo con el teclado
  // abierto al capturar) o la app está en segundo plano, el pulso espera a que vuelva a verse.
  let visible = false;
  let pulsoPendiente = false;
  let observador = null;

  function crear(alTocar) {
    if (boton) return boton;
    boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'asistente-btn';
    boton.id = 'abrirAsistente';
    boton.dataset.estado = 'idle';
    boton.setAttribute('aria-label', 'Abrir tu asistente');
    const escena = document.createElement('span');
    escena.className = 'avatar-escena';
    boton.appendChild(escena);
    dibujante.montar(escena);
    // Respuesta táctil inmediata (también en toques muy rápidos, donde :active casi no se ve)
    boton.addEventListener('pointerdown', () => {
      boton.classList.remove('tocado');
      void boton.offsetWidth; // reinicia la animación si tocan seguido
      boton.classList.add('tocado');
    });
    boton.addEventListener('animationend', (e) => {
      if (e.animationName === 'avatar-toque') boton.classList.remove('tocado');
      if (e.animationName === 'avatar-escucha') boton.classList.remove('escucha');
      if (e.animationName === 'avatar-pulso') boton.classList.remove('pulsando');
      if (e.animationName === 'avatar-parpadeo') boton.classList.remove('parpadea');
      if (e.animationName === 'avatar-inclina' || e.animationName === 'avatar-asiente') boton.classList.remove('inclina', 'asiente');
    });
    boton.addEventListener('click', () => alTocar && alTocar());
    if ('IntersectionObserver' in window) {
      observador = new IntersectionObserver((entradas) => {
        visible = entradas.some((e) => e.isIntersecting && e.intersectionRatio >= 0.6);
        if (visible && pulsoPendiente) setTimeout(pulso, 250);
      }, { threshold: [0, 0.6, 1] });
      observador.observe(boton);
    } else visible = true;
    document.addEventListener('visibilitychange', () => { if (!document.hidden && pulsoPendiente) setTimeout(pulso, 400); });
    // Reacciona cuando la persona toca cualquier botón de la app (sin exagerar: máximo uno cada 1.5 s)
    document.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('button, a');
      if (!b || b.closest('#abrirAsistente') || b.disabled) return;
      reaccionar('boton');
    }, true);
    programarParpadeo();
    return boton;
  }

  function ponerEstado(nombre) {
    if (!boton || !ESTADOS.includes(nombre)) return;
    boton.dataset.estado = nombre;
    boton.classList.toggle('con-algo', nombre === 'attention' || nombre === 'alert');
    dibujante.estado(nombre, boton);
  }

  // Llamar la atención solo cuando aparece algo nuevo (o, si sigue igual, cada REPETIR_MIN al volver a la app).
  function atencion(info, { alVolver = false } = {}) {
    if (!boton) return;
    const estado = info && info.estado ? info.estado : 'idle';
    const ids = (info && info.ids ? info.ids : []).join(',');
    ponerEstado(estado);
    if (estado === 'idle') { idsVistos = ''; ultimoEstado = estado; pulsoPendiente = false; return; }
    const nuevos = ids.split(',').some((id) => id && !idsVistos.split(',').includes(id));
    const toca = nuevos || (alVolver && Date.now() - ultimoPulso > REPETIR_MIN * 60000);
    idsVistos = ids;
    ultimoEstado = estado;
    if (toca) pulso();
  }

  function pulso() {
    if (!boton) return;
    if (!visible || document.hidden || !boton.isConnected) { pulsoPendiente = true; return; }
    pulsoPendiente = false;
    ultimoPulso = Date.now();
    boton.classList.remove('pulsando');
    void boton.offsetWidth;
    boton.classList.add('pulsando'); // 2 pulsos (CSS) y vuelve a idle
  }

  // ---- Gestos: parpadear e inclinar o asentir con la cabeza ----
  function gesto(clase) {
    if (!boton) return;
    boton.classList.remove(clase);
    void boton.offsetWidth; // reinicia la animación si se repite
    boton.classList.add(clase);
  }
  const parpadear = () => gesto('parpadea');
  function cabeza(tipo) { // 'inclina' | 'asiente'
    boton.classList.remove('inclina', 'asiente');
    gesto(tipo);
  }

  // Parpadeo natural cada 3.5–7 s, solo si se ve y sin "reducir movimiento"
  let relojParpadeo = null;
  function programarParpadeo() {
    clearTimeout(relojParpadeo);
    relojParpadeo = setTimeout(() => {
      if (boton && visible && !document.hidden && !quieto.matches) {
        parpadear();
        if (Math.random() < 0.2) setTimeout(parpadear, 260); // a veces doble, como las personas
      }
      programarParpadeo();
    }, 3500 + Math.random() * 3500);
  }

  // Reacciones:
  //  'assistant-open' → te escucho: inclina la cabeza, parpadea y se acerca un poco
  //  'success'        → tarea creada o terminada: asiente y parpadea
  //  'boton'          → tocaron un botón: parpadea y una leve inclinación
  let ultimoBoton = 0;
  function reaccionar(nombre) {
    if (!boton) return;
    const sinMovimiento = quieto.matches;
    if (nombre === 'assistant-open') {
      gesto('escucha');
      if (!sinMovimiento) { cabeza('inclina'); setTimeout(parpadear, 120); }
    } else if (nombre === 'success') {
      if (!sinMovimiento && visible) { cabeza('asiente'); setTimeout(parpadear, 160); }
    } else if (nombre === 'boton') {
      if (sinMovimiento || !visible || Date.now() - ultimoBoton < 1500) return;
      ultimoBoton = Date.now();
      parpadear();
      if (!boton.classList.contains('asiente')) cabeza('inclina');
    }
    dibujante.estado(nombre, boton);
  }

  // Fase 2: cambiar la imagen por un avatar animado sin tocar la app.
  function usarDibujante(nuevo) {
    if (!nuevo || typeof nuevo.montar !== 'function') return;
    dibujante = { estado() {}, ...nuevo };
    if (boton) { dibujante.montar(boton.querySelector('.avatar-escena')); dibujante.estado(boton.dataset.estado, boton); }
  }

  raiz.avatarAsistente = {
    ESTADOS, crear, atencion, reaccionar, usarDibujante, parpadear,
    get estado() { return boton ? boton.dataset.estado : 'idle'; },
    get movimientoReducido() { return quieto.matches; },
  };
})(window);
