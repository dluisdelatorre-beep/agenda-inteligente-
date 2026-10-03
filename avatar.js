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
      const respira = document.createElement('span');
      respira.className = 'avatar-respira';
      const img = document.createElement('img');
      img.className = 'asistente avatar-asset';
      img.src = 'icons/asistente.png';
      img.alt = '';
      img.width = 88; img.height = 88;
      img.decoding = 'async';
      respira.appendChild(img);
      reaccion.appendChild(respira);
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
    });
    boton.addEventListener('click', () => alTocar && alTocar());
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
    if (estado === 'idle') { idsVistos = ''; ultimoEstado = estado; return; }
    const nuevos = ids.split(',').some((id) => id && !idsVistos.split(',').includes(id));
    const toca = nuevos || (alVolver && Date.now() - ultimoPulso > REPETIR_MIN * 60000);
    idsVistos = ids;
    ultimoEstado = estado;
    if (toca) pulso();
  }

  function pulso() {
    if (!boton) return;
    ultimoPulso = Date.now();
    boton.classList.remove('pulsando');
    void boton.offsetWidth;
    boton.classList.add('pulsando'); // 2 pulsos (CSS) y vuelve a idle
  }

  // Microreacción: "te estoy escuchando" al abrir el panel
  function reaccionar(nombre) {
    if (!boton) return;
    if (nombre === 'assistant-open') {
      boton.classList.remove('escucha');
      void boton.offsetWidth;
      boton.classList.add('escucha');
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
    ESTADOS, crear, atencion, reaccionar, usarDibujante,
    get estado() { return boton ? boton.dataset.estado : 'idle'; },
    get movimientoReducido() { return quieto.matches; },
  };
})(window);
