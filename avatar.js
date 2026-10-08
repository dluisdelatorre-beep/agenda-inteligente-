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
  const ESTADOS = ['idle', 'attention', 'alert', 'greeting', 'assistant-open', 'success', 'return'];
  // Prioridad de las reacciones: una de menor prioridad no interrumpe a otra que sigue en curso
  const PRIORIDAD = { 'assistant-open': 3, success: 2, greeting: 2, 'return': 1 };
  const DURA_REACCION = 900;          // ms que se considera "en curso" una reacción
  const REGRESO_MIN_FUERA = 60000;    // reacciona al volver solo si estuvo fuera al menos 1 min
  const REGRESO_ENFRIA = 5 * 60000;   // y como máximo una vez cada 5 min
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
  let miradaActual = 'frente';
  let ultimoEstado = 'idle';
  let idsVistos = '';
  let ultimoPulso = 0;
  let quieto = matchMedia('(prefers-reduced-motion: reduce)');
  // El halo solo sirve si la persona ve el avatar: si está fuera de pantalla (por ejemplo con el teclado
  // abierto al capturar) o la app está en segundo plano, el pulso espera a que vuelva a verse.
  let visible = false;
  let pulsoPendiente = false;
  let saludoPendiente = false;
  let observador = null;

  function crear(alTocar) {
    if (boton) return boton;
    boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'asistente-btn';
    boton.id = 'abrirAsistente';
    boton.dataset.estado = 'idle';
    boton.dataset.mirada = miradaActual;
    boton.setAttribute('aria-label', 'Abrir tu asistente');
    const escena = document.createElement('span');
    escena.className = 'avatar-escena';
    const saludo = document.createElement('span');
    saludo.className = 'avatar-saludo';
    saludo.textContent = 'Hola 👋 Estoy contigo.';
    saludo.setAttribute('aria-hidden', 'true');
    boton.append(escena, saludo);
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
      if (e.animationName === 'avatar-saluda') boton.classList.remove('saluda');
    });
    boton.addEventListener('click', () => alTocar && alTocar());
    if ('IntersectionObserver' in window) {
      observador = new IntersectionObserver((entradas) => {
        visible = entradas.some((e) => e.isIntersecting && e.intersectionRatio >= 0.6);
        if (visible && pulsoPendiente) setTimeout(pulso, 250);
        if (visible && saludoPendiente) {
          saludoPendiente = false;
          setTimeout(() => reaccionar('greeting'), 140);
        }
      }, { threshold: [0, 0.6, 1] });
      observador.observe(boton);
    } else visible = true;
    document.addEventListener('visibilitychange', () => { if (!document.hidden && pulsoPendiente) setTimeout(pulso, 400); });
    // Reacciones con significado (no a cada botón, para no cansar): abrir el asistente, crear/completar,
    // atención real y volver a la app tras un rato fuera.
    let salioEn = 0;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { salioEn = Date.now(); return; }
      if (salioEn && Date.now() - salioEn >= REGRESO_MIN_FUERA) setTimeout(() => reaccionar('return'), 500);
      salioEn = 0;
    });
    programarParpadeo();
    // El Avatar permanece anclado a Hoy. Trasladarlo a un diálogo lo ocultaba
    // y al devolverlo parecía parpadear dos veces. La hoja conserva su imagen propia.
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
        // Un solo parpadeo natural; sin segundos disparos programados.
      }
      programarParpadeo();
    }, 3500 + Math.random() * 3500);
  }

  // Reacciones:
  //  'assistant-open' → te escucho: inclina la cabeza, parpadea y se acerca un poco
  //  'success'        → tarea creada o terminada: asiente y parpadea
  //  'boton'          → tocaron un botón: parpadea y una leve inclinación
  let ultimoBoton = 0;
  let enCursoHasta = 0, enCursoPrio = 0, ultimoRegreso = 0, saludado = false;
  function reaccionar(nombre) {
    if (!boton) return false;
    const sinMovimiento = quieto.matches;
    const ahora = Date.now();
    const prio = PRIORIDAD[nombre] || 0;
    if (prio && ahora < enCursoHasta && prio < enCursoPrio) return false; // no pisar una reacción más importante
    if (nombre === 'greeting') {
      // Saludo: una sola vez por entrada a la app (no al cambiar de pestaña)
      if (saludado || document.hidden) return false;
      if (!visible) { saludoPendiente = true; return false; }
      saludado = true;
      if (!sinMovimiento) {
        gesto('saluda');
        setTimeout(() => cabeza('asiente'), 180);
        setTimeout(parpadear, 420);
      }
    } else if (nombre === 'return') {
      if (sinMovimiento || !visible || ahora - ultimoRegreso < REGRESO_ENFRIA) return false;
      ultimoRegreso = ahora;
      cabeza('inclina'); setTimeout(parpadear, 140);
    } else if (nombre === 'assistant-open') {
      gesto('escucha');
      if (!sinMovimiento) { cabeza('inclina'); setTimeout(parpadear, 120); }
    } else if (nombre === 'success') {
      if (!sinMovimiento && visible) { cabeza('asiente'); setTimeout(parpadear, 160); }
    } else if (nombre === 'boton') {
      // Ya no se usa por defecto (reaccionar a cada botón cansa); se deja para quien lo pida explícitamente
      if (sinMovimiento || !visible || ahora - ultimoBoton < 1500) return false;
      ultimoBoton = ahora;
      parpadear();
      if (!boton.classList.contains('asiente')) cabeza('inclina');
    }
    if (prio) { enCursoHasta = ahora + DURA_REACCION; enCursoPrio = prio; }
    boton.dataset.reaccion = nombre;
    dibujante.estado(nombre, boton);
    return true;
  }

  function instalarAcompanamientoDialogos() {
    if (!boton || boton.dataset.dialogosListos === '1') return;
    boton.dataset.dialogosListos = '1';
    const origenPadre = boton.parentNode;
    const origenSiguiente = boton.nextSibling;

    // Al cerrar la ventana la asistente SIEMPRE regresa a su lugar en Hoy (la tarjeta #resumen).
    // Antes se tomaba el lugar de origen al crear el botón, cuando aún no estaba en la página (null),
    // y la asistente se quedaba oculta dentro de la ventana cerrada hasta recargar la app.
    const devolver = () => {
      boton.classList.remove('avatar-en-dialogo', 'mira-tarea');
      const casa = document.getElementById('resumen') || origenPadre;
      if (!casa || boton.parentNode === casa) return;
      if (origenSiguiente && origenSiguiente.parentNode === casa) casa.insertBefore(boton, origenSiguiente);
      else casa.appendChild(boton);
    };

    const acompanar = (dlg) => {
      const host = dlg.querySelector('.hoja-cuerpo, form') || dlg;
      if (boton.parentNode !== host) host.appendChild(boton);
      boton.classList.add('avatar-en-dialogo', 'mira-tarea');
      boton.classList.remove('saluda', 'inclina', 'asiente');
      void boton.offsetWidth;
      setTimeout(parpadear, 320);
    };

    const revisar = () => {
      const abiertos = [...document.querySelectorAll('dialog[open]')];
      const dlg = abiertos[abiertos.length - 1];
      if (dlg) acompanar(dlg); else devolver();
    };

    const mo = new MutationObserver(revisar);
    document.querySelectorAll('dialog').forEach((dlg) => mo.observe(dlg, { attributes:true, attributeFilter:['open'] }));
    revisar();
  }

  // Dirección corporal contextual. No es un saludo: expresa qué está observando.
  function mirar(destino = 'frente') {
    const permitidas = ['frente', 'contenido', 'pendientes', 'panel'];
    miradaActual = permitidas.includes(destino) ? destino : 'frente';
    if (boton) {
      boton.dataset.mirada = miradaActual;
      dibujante.estado('mirada:' + miradaActual, boton);
    }
    return miradaActual;
  }

  // Fase 2: cambiar la imagen por un avatar animado sin tocar la app.
  function usarDibujante(nuevo) {
    if (!nuevo || typeof nuevo.montar !== 'function') return;
    dibujante = { estado() {}, ...nuevo };
    if (boton) { dibujante.montar(boton.querySelector('.avatar-escena')); dibujante.estado(boton.dataset.estado, boton); }
  }

  raiz.avatarAsistente = {
    ESTADOS, crear, atencion, reaccionar, mirar, usarDibujante, parpadear,
    get estado() { return boton ? boton.dataset.estado : 'idle'; },
    get mirada() { return miradaActual; },
    get movimientoReducido() { return quieto.matches; },
    get visible() { return visible; },
  };
})(window);
