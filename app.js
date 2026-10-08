// Agenda Inteligente — lógica de la pantalla.
// Los pendientes viven en este dispositivo (almacen.js). Si se activan los avisos,
// también se manda una copia mínima al servidor para que avise con la app cerrada.
(function () {
  const $ = (id) => document.getElementById(id);
  const POSPONER_MIN = 10;

  // ---- Ventanas: salida animada (distinta de la entrada) para TODAS las hojas y diálogos ----
  // Antes la mayoría se cerraba de golpe. Aquí se centraliza: close() y Esc primero animan la salida
  // (.cerrando) y luego cierran de verdad. Si se vuelve a abrir mientras sale, se cancela la salida.
  (function salidaDeVentanas() {
    if (typeof HTMLDialogElement === 'undefined') return;
    const proto = HTMLDialogElement.prototype;
    const cerrarReal = proto.close, abrirModal = proto.showModal;
    const SALIDA = 240;
    const animable = (d) => d.matches('.hoja, .hoja-abajo') && !matchMedia('(prefers-reduced-motion: reduce)').matches;
    proto.close = function (valor) {
      if (!this.open) return cerrarReal.call(this, valor);
      if (!animable(this)) { clearTimeout(this._salida); this.classList.remove('cerrando'); return cerrarReal.call(this, valor); }
      if (this._salida) return; // ya va saliendo
      this.classList.add('cerrando');
      this._salida = setTimeout(() => {
        this._salida = null;
        this.classList.remove('cerrando');
        const cuerpo = this.querySelector('.hoja-cuerpo'); if (cuerpo) cuerpo.style.transform = '';
        cerrarReal.call(this, valor);
      }, SALIDA);
    };
    if (abrirModal) proto.showModal = function () {
      if (this._salida) { clearTimeout(this._salida); this._salida = null; this.classList.remove('cerrando'); if (this.open) return; }
      return abrirModal.call(this);
    };
    // Esc: el navegador cerraría de golpe; se cambia por la misma salida animada
    document.addEventListener('cancel', (e) => {
      const d = e.target;
      if (d instanceof HTMLDialogElement && animable(d)) { e.preventDefault(); d.close(); }
    }, true);
  })();
  let pendientes = [];
  let filtro = 'pendientes';
  let borrador = null;
  let editando = null; // id del pendiente que se está editando
  let vistaActual = 'hoy';
  let contactosLista = []; // libreta privada, solo en este teléfono
  const contactoDe = (id) => (id ? contactosLista.find((c) => c.id === id) || null : null);

  async function recargar() {
    pendientes = await almacen.leer();
    try { contactosLista = await almacen.leerContactos(); } catch { contactosLista = []; }
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

  }

  function pintarResumen() {
    const ahora = new Date();
    const deHoy = pendientes
      .filter((p) => !p.hecho && p.cuando && mismoDia(new Date(p.cuando), ahora))
      .sort((a, b) => new Date(a.cuando) - new Date(b.cuando));
    const atrasados = pendientes.filter((p) => !p.hecho && p.cuando && new Date(p.cuando) < ahora && !mismoDia(new Date(p.cuando), ahora));

    const caja = $('resumen');
    // El avatar se crea una sola vez y no se borra al repintar (así no se reinician sus animaciones)
    const btnAsis = avatarAsistente.crear(() => abrirAsistente());
    [...caja.childNodes].forEach((n) => { if (n !== btnAsis) n.remove(); });
    if (btnAsis.parentNode !== caja) caja.appendChild(btnAsis);
    avatarAsistente.atencion(asistente.atencion(pendientes, ahora));
    const hora = ahora.getHours();
    const hola = document.createElement('p');
    hola.className = 'hola';
    hola.textContent = (hora < 12 ? 'Buen día' : hora < 19 ? 'Buenas tardes' : 'Buenas noches') + '. Estoy contigo.';
    caja.appendChild(hola);
    const h2 = document.createElement('h2');
    h2.textContent = deHoy.length
      ? `Yo estoy pendiente de ${deHoy.length} ${deHoy.length === 1 ? 'cosa importante' : 'cosas importantes'} hoy`
      : 'Sigue con tu día';
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
      p.textContent = 'Yo estoy pendiente contigo. Cuando necesites recordar algo, dímelo como lo dirías normalmente.';
      caja.appendChild(p);
    }
    if (atrasados.length) {
      const p = document.createElement('p');
      p.className = 'atrasados';
      p.textContent = `Hay ${atrasados.length} ${atrasados.length === 1 ? 'pendiente de días anteriores' : 'pendientes de días anteriores'}. No se te van a perder: aquí siguen contigo.`;
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
        if (!a.cuando && !b.cuando) return pesoPrio(a) - pesoPrio(b);
        if (!a.cuando) return 1;
        if (!b.cuando) return -1;
        return new Date(a.cuando) - new Date(b.cuando) || pesoPrio(a) - pesoPrio(b);
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
        lista.appendChild(item(p, ahora, 'hoy'));
      });
  }

  const pesoPrio = (p) => ({ alta: 0, normal: 1, baja: 2 }[p.priority] ?? 1);

  function boton(clase, texto, etiqueta, accion) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = clase;
    b.textContent = texto;
    if (etiqueta) b.setAttribute('aria-label', etiqueta);
    b.onclick = accion;
    return b;
  }

  // El editor se abre solo en la pantalla que está a la vista (no en las ocultas).
  // La tarjeta se desliza y se desvanece antes de reacomodar la lista (sin saltos bruscos)
  let recienCreado = null;
  function despedirTarjeta(el) {
    if (!el || !el.isConnected || matchMedia('(prefers-reduced-motion: reduce)').matches) return Promise.resolve();
    el.classList.add('saliendo');
    return new Promise((ok) => setTimeout(ok, 200));
  }

  function item(p, ahora, vista) {
    return p.id === editando && vista === vistaActual ? editor(p) : tarjeta(p, ahora);
  }

  function tarjeta(p, ahora) {
    const div = document.createElement('div');
    const vencido = !p.hecho && p.cuando && new Date(p.cuando) < ahora;
    div.className = 'item' + (p.hecho ? ' hecho' : '') + (vencido ? ' vencido' : '') + (p.priority === 'alta' ? ' prio-alta' : '') + (p.id === recienCreado ? ' recien' : '');
    if (p.id === recienCreado) div.addEventListener('animationend', () => { div.classList.remove('recien'); recienCreado = null; }, { once: true });
    div.dataset.id = p.id;

    const check = boton('check', '', p.hecho ? 'Marcar como pendiente' : 'Marcar como hecho', async () => {
      if (check.disabled) return;
      check.disabled = true; // evita doble toque mientras se reacomoda
      p.hecho = !p.hecho;
      p.hechoEn = p.hecho ? new Date().toISOString() : null;
      if (!p.hecho) { p.avisado = false; delete p.avisadoEn; delete p.avisadoPara; }
      if (p.hecho) { ajustes.tocar('hecho'); avatarAsistente.reaccionar('success'); }
      await guardar(); // primero se guarda: la animación nunca retrasa ni arriesga el dato
      almacen.sincronizar(p);
      if (p.hecho && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        check.classList.add('confirmando'); // la palomita se dibuja antes de que la tarjeta se despida
        await new Promise((ok) => setTimeout(ok, 170));
      }
      await despedirTarjeta(div);
      pintarReacomodando();
    });

    const cuerpo = document.createElement('button');
    cuerpo.type = 'button';
    cuerpo.className = 'cuerpo';
    cuerpo.setAttribute('aria-label', 'Editar: ' + p.texto);
    cuerpo.onclick = () => { if (!p.hecho) { editando = p.id; pintar(); } };
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
    const cat = categorias.CATEGORIAS[p.category];
    if (cat || p.priority === 'alta' || p.priority === 'baja') {
      const et = document.createElement('span');
      et.className = 'etiquetas';
      if (p.priority === 'alta' || p.priority === 'baja') {
        et.appendChild(chipDe('chip-prio ' + p.priority, categorias.PRIORIDADES[p.priority], 'Prioridad '));
      }
      if (cat) et.appendChild(chipDe('chip-cat', cat));
      cuerpo.appendChild(et);
    }

    // Botón de la acción (llamar, pagar, reunión, cómo llegar, enlace)
    const centro = document.createElement('div');
    centro.className = 'centro';
    centro.appendChild(cuerpo);
    const dest = !p.hecho && acciones.destino(p);
    if (dest) {
      const tipo = acciones.TIPOS[p.actionType];
      const etiqueta = p.actionType === 'llamar' && p.contactName ? `${tipo.boton}` : tipo.boton;
      centro.appendChild(enlaceAccion(dest, `${tipo.icono} ${etiqueta}`, 'accion-item'));
    } else if (!p.hecho && p.actionType && acciones.TIPOS[p.actionType]) {
      const falta = { llamar: 'Agregar teléfono', pago: 'Agregar enlace de pago', reunion: 'Agregar enlace', ubicacion: 'Agregar dirección', enlace: 'Agregar enlace' };
      centro.appendChild(boton('accion-item incompleta', `${acciones.TIPOS[p.actionType].icono} ${falta[p.actionType]}`, null,
        () => { editando = p.id; pintar(); }));
    }

    const contacto = contactoDe(p.contact_id);
    if (contacto) centro.appendChild(filaContacto(contacto, dest));

    const zona = document.createElement('div');
    zona.className = 'acciones';
    if (vencido || (p.avisado && !p.hecho)) {
      zona.appendChild(boton('posponer', '+10 min', 'Posponer 10 minutos', () => posponer(p.id)));
    }
    zona.appendChild(boton('borrar', '×', 'Borrar', async () => {
      pendientes = pendientes.filter((x) => x.id !== p.id);
      await guardar(); // primero se guarda
      await despedirTarjeta(div);
      pintarReacomodando();
      almacen.sincronizar({ ...p, hecho: true }); // en el servidor, borrar = ya no avisar
      avisar('Pendiente borrado');
    }));

    div.append(check, centro, zona);
    return div;
  }

  // Persona del pendiente: su nombre (abre la ficha) y Llamar · WhatsApp · Correo según sus datos
  function filaContacto(c, destAccion) {
    const fila = document.createElement('div');
    fila.className = 'contacto-pend';
    fila.appendChild(boton('persona', '👤 ' + contactos.nombreCompleto(c), 'Ver contacto ' + contactos.nombreCompleto(c), () => abrirFicha(c.id)));
    const e = contactos.enlaces(c);
    if (e.llamar && e.llamar !== destAccion) fila.appendChild(enlaceAccion(e.llamar, '📞', 'canal', null, 'Llamar'));
    if (e.whatsapp) fila.appendChild(enlaceAccion(e.whatsapp, '💬', 'canal', null, 'WhatsApp'));
    if (e.correo) fila.appendChild(enlaceAccion(e.correo, '✉️', 'canal', null, 'Correo'));
    return fila;
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

    // ---- Acción (opcional) ----
    const sec = document.createElement('fieldset');
    sec.className = 'accion-editor';
    const leyenda = document.createElement('legend');
    leyenda.textContent = 'Acción';
    const tipoSel = document.createElement('select');
    tipoSel.setAttribute('aria-label', 'Tipo de acción');
    [['', 'Sin acción'], ...Object.entries(acciones.TIPOS).map(([k, v]) => [k, `${v.icono} ${v.etiqueta}`])]
      .forEach(([v, txt]) => { const o = document.createElement('option'); o.value = v; o.textContent = txt; tipoSel.appendChild(o); });
    // Si el pendiente aún no tiene acción, se sugiere una según el texto (se puede cambiar)
    const sugerida = p.actionType === undefined ? acciones.sugerir(p.texto) : null;
    tipoSel.value = p.actionType || (sugerida && sugerida.actionType) || '';

    const campo = (tipo, placeholder, valor, extra = {}) => {
      const i = document.createElement('input');
      i.type = tipo; i.placeholder = placeholder; i.value = valor || '';
      Object.assign(i, extra);
      i.setAttribute('aria-label', placeholder);
      return i;
    };
    const nombre = campo('text', 'Nombre del contacto', p.contactName || (sugerida && sugerida.contactName), { autocomplete: 'off' });
    const tel = campo('tel', 'Teléfono', p.contactPhone, { inputMode: 'tel', autocomplete: 'off' });
    const url = campo('url', 'Enlace (https://…)', p.url, { inputMode: 'url', autocomplete: 'off' });
    const lugar = campo('text', 'Dirección o enlace de mapas', p.location, { autocomplete: 'off' });
    const filaTel = document.createElement('div');
    filaTel.className = 'fila';
    filaTel.appendChild(tel);
    // Selector de contactos: solo existe en algunos teléfonos (Chrome en Android)
    if ('contacts' in navigator && 'ContactsManager' in window) {
      filaTel.appendChild(boton('quitar', 'Contactos', 'Elegir de mis contactos', async () => {
        try {
          const [c] = await navigator.contacts.select(['name', 'tel'], { multiple: false });
          if (!c) return;
          if (c.name && c.name[0]) nombre.value = c.name[0];
          if (c.tel && c.tel[0]) tel.value = c.tel[0];
        } catch {}
      }));
    }
    const nota = document.createElement('p');
    nota.className = 'nota-accion';
    nota.textContent = 'Solo guarda el enlace. Nunca escribas contraseñas, NIP, CVV ni tokens.';

    function mostrarCampos() {
      const v = tipoSel.value;
      nombre.hidden = filaTel.hidden = v !== 'llamar';
      url.hidden = !['pago', 'reunion', 'enlace'].includes(v);
      lugar.hidden = v !== 'ubicacion';
      nota.hidden = !['pago', 'enlace'].includes(v);
      url.placeholder = v === 'pago' ? 'Enlace de pago o factura (https://…)' : v === 'reunion' ? 'Enlace de Meet, Zoom o Teams' : 'Enlace (https://…)';
    }
    tipoSel.addEventListener('change', mostrarCampos);
    sec.append(leyenda, tipoSel, nombre, filaTel, url, lugar, nota);
    mostrarCampos();

    // ---- Categoría y prioridad ----
    const filaOrden = document.createElement('div');
    filaOrden.className = 'fila orden-editor';
    const selDe = (etiqueta, opciones, valor) => {
      const lab = document.createElement('label');
      const sp = document.createElement('span');
      sp.textContent = etiqueta;
      const sel = document.createElement('select');
      sel.setAttribute('aria-label', etiqueta);
      opciones.forEach(([v, txt]) => { const o = document.createElement('option'); o.value = v; o.textContent = txt; sel.appendChild(o); });
      sel.value = valor;
      lab.append(sp, sel);
      filaOrden.appendChild(lab);
      return sel;
    };
    const catSugerida = p.category === undefined ? categorias.sugerirCategoria(p.texto, p.actionType) : p.category;
    const catSel = selDe('Categoría', [['', 'Sin categoría'], ...Object.entries(categorias.CATEGORIAS).map(([k, v]) => [k, `${v.icono} ${v.etiqueta}`])], catSugerida || '');
    const prioSel = selDe('Prioridad', Object.entries(categorias.PRIORIDADES).map(([k, v]) => [k, `${v.icono} ${v.etiqueta}`]), categorias.limpiarPrioridad(p.priority));

    // ---- Persona / contacto (opcional) ----
    let contactoSel = p.contact_id || null;
    const secP = document.createElement('div');
    secP.className = 'persona-editor';
    const lblP = document.createElement('label');
    const spP = document.createElement('span'); spP.textContent = 'Persona / contacto';
    const inP = document.createElement('input');
    inP.type = 'text'; inP.placeholder = 'Busca o escribe un nombre (opcional)'; inP.autocomplete = 'off';
    inP.setAttribute('aria-label', 'Persona o contacto');
    inP.value = contactoDe(contactoSel) ? contactos.nombreCompleto(contactoDe(contactoSel)) : '';
    lblP.append(spP, inP);
    const sug = document.createElement('div');
    sug.className = 'sugerencias-persona';
    function pintarSug() {
      sug.textContent = '';
      const q = inP.value.trim();
      const actual = contactoDe(contactoSel);
      if (actual && q === contactos.nombreCompleto(actual)) {
        sug.appendChild(boton('quitar', 'Quitar persona', null, () => { contactoSel = null; inP.value = ''; pintarSug(); }));
        return;
      }
      if (!q) return;
      contactos.buscar(contactosLista, q).slice(0, 5).forEach((c) => {
        sug.appendChild(boton('sug', '👤 ' + contactos.nombreCompleto(c) + (c.empresa ? ' · ' + c.empresa : ''), null, () => {
          contactoSel = c.id; inP.value = contactos.nombreCompleto(c); pintarSug();
        }));
      });
      sug.appendChild(boton('sug crear', `+ Crear nuevo contacto «${q}»`, null, () => {
        const partes = q.split(/\s+/);
        abrirEditorContacto({ nombre: partes.shift(), apellidos: partes.join(' ') }, (c) => { contactoSel = c.id; inP.value = contactos.nombreCompleto(c); pintarSug(); });
      }));
    }
    inP.addEventListener('input', () => { contactoSel = null; pintarSug(); });
    secP.append(lblP, sug);
    pintarSug();

    const botones = document.createElement('div');
    botones.className = 'fila fin';
    const cancelar = boton('secundario', 'Cancelar', null, () => { editando = null; pintar(); });
    const ok = document.createElement('button');
    ok.type = 'submit';
    ok.className = 'primario';
    ok.textContent = 'Guardar cambios';
    botones.append(cancelar, ok);

    form.append(t, filaFecha, filaOrden, secP, sec, botones);
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
      delete p.avisadoEn; delete p.avisadoPara; // hora nueva = aviso nuevo, con sonido
      p.contact_id = contactoSel;
      p.category = categorias.limpiarCategoria(catSel.value);
      p.priority = categorias.limpiarPrioridad(prioSel.value);
      // La acción nunca impide guardar: si un dato no es válido, se guarda sin él.
      Object.assign(p, acciones.normalizar({
        actionType: tipoSel.value || null,
        contactName: nombre.value, contactPhone: tel.value, url: url.value, location: lugar.value,
      }));
      aplicarContacto(p);
      editando = null;
      await guardar(); pintar();
      almacen.sincronizar(p);
      const incompleta = p.actionType && !p.actionValue;
      avisar(incompleta ? 'Guardado. Falta el dato de la acción (teléfono, enlace o dirección).' : 'Cambios guardados');
    };
    setTimeout(() => t.focus(), 0);
    return form;
  }

  async function posponer(id) {
    const p = await almacen.posponer(id, POSPONER_MIN);
    await recargar();
    if (p) {
      almacen.sincronizar(p);
      ajustes.tocar('posponer');
      avisar(`Te recuerdo a las ${fmtHora(new Date(p.cuando))}`);
    }
  }

  // Pinta Hoy siempre (es la base) y además la pantalla que esté a la vista.
  // Repinta y desliza suavemente las tarjetas que cambiaron de lugar (técnica FLIP: solo transform, sin saltos).
  function pintarReacomodando() {
    const quieto = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const sel = '.vista:not([hidden]) .item[data-id]';
    const antes = quieto ? null : new Map([...document.querySelectorAll(sel)].map((el) => [el.dataset.id, el.getBoundingClientRect().top]));
    pintar();
    if (!antes || typeof Element.prototype.animate !== 'function') return;
    document.querySelectorAll(sel).forEach((el) => {
      const y0 = antes.get(el.dataset.id);
      if (y0 === undefined) return;
      const dy = y0 - el.getBoundingClientRect().top;
      if (Math.abs(dy) < 1) return;
      el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 280, easing: 'cubic-bezier(.2,.8,.2,1)' });
    });
  }

  function pintar() {
    pintarEncabezado(); pintarResumen(); pintarLista();
    if (vistaActual === 'calendario') pintarCalendario();
    if (vistaActual === 'buscar') pintarBusqueda();
    if (vistaActual === 'estadisticas') pintarEstadisticas();
    if ($('hojaAsistente').open) pintarAsistente();
    if (vistaActual === 'contactos') pintarContactos();
    if ($('fichaContacto').open && fichaId) pintarFicha();
  }

  // ---- Captura en lenguaje natural ----
  const entrada = $('entrada');
  entrada.addEventListener('input', () => {
    const frase = entrada.value.trim();
    const caja = $('entendido');
    $('guardar').disabled = !frase;
    if (!frase) { borrador = null; caja.hidden = true; return; }
    const pr = categorias.extraerPrioridad(frase);
    const extra = acciones.extraer(pr.resto);
    borrador = window.interpretar(extra.resto || pr.resto);
    borrador.accion = acciones.sugerir(borrador.texto, extra);
    borrador.priority = pr.priority;
    borrador.category = categorias.sugerirCategoria(borrador.texto, borrador.accion.actionType);
    caja.hidden = false;
    caja.innerHTML = '';
    const que = document.createElement('strong');
    que.textContent = borrador.texto;
    caja.append('Entendí: ', que, ' — ', borrador.cuando ? describir(borrador.cuando, borrador.conHora) : 'sin fecha');
    if (borrador.accion.actionType) {
      const chip = document.createElement('span');
      chip.className = 'chip-accion';
      chip.textContent = acciones.TIPOS[borrador.accion.actionType].icono + ' ' + acciones.TIPOS[borrador.accion.actionType].etiqueta;
      caja.append(' ', chip);
    }
    if (borrador.category) caja.append(' ', chipDe('chip-cat', categorias.CATEGORIAS[borrador.category]));
    if (borrador.priority !== 'normal') caja.append(' ', chipDe('chip-prio ' + borrador.priority, categorias.PRIORIDADES[borrador.priority], 'Prioridad '));
    // ¿Menciona a alguien de tus contactos?
    borrador.persona = contactos.resolver(extra.resto || pr.resto, contactosLista);
    borrador.contact_id = borrador.persona.candidatos.length === 1 ? borrador.persona.candidatos[0].id : null;
    if (borrador.persona.nombre) {
      const chip = document.createElement('span');
      chip.className = 'chip-persona';
      const n = borrador.persona.candidatos.length;
      chip.textContent = n === 1 ? '👤 ' + contactos.nombreCompleto(borrador.persona.candidatos[0])
        : n > 1 ? `👤 ¿Cuál ${borrador.persona.nombre}? (${n})` : `👤 ${borrador.persona.nombre} (nuevo)`;
      caja.append(' ', chip);
    }
  });
  function chipDe(clase, d, antes = '') {
    const c = document.createElement('span');
    c.className = clase;
    c.textContent = `${d.icono} ${antes}${d.etiqueta}`;
    return c;
  }

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
      ...acciones.normalizar(borrador.accion || {}),
      category: categorias.limpiarCategoria(borrador.category),
      priority: categorias.limpiarPrioridad(borrador.priority),
      contact_id: borrador.contact_id || null,
    };
    aplicarContacto(nuevo);
    const persona = borrador.persona || { nombre: '', candidatos: [] };
    pendientes.push(nuevo);
    recienCreado = nuevo.id;
    await guardar();
    entrada.value = '';
    entrada.dispatchEvent(new Event('input'));
    filtro = 'pendientes';
    marcarFiltro();
    pintar();
    almacen.sincronizar(nuevo);
    ajustes.tocar('crear');
    avatarAsistente.reaccionar('success');
    // Varias personas con el mismo nombre: no adivinamos, preguntamos
    if (!nuevo.contact_id && persona.candidatos.length > 1) {
      const elegido = await elegirPersona(persona.nombre, persona.candidatos, nuevo.texto);
      if (elegido) await asociarContacto(nuevo.id, elegido.id);
    }
    const falta = nuevo.actionType && !acciones.destino(nuevo);
    const ofrecer = { llamar: 'Asociar contacto', pago: 'Agregar enlace de pago', reunion: 'Agregar enlace', ubicacion: 'Agregar dirección', enlace: 'Agregar enlace' };
    if (!nuevo.contact_id && persona.nombre && !persona.candidatos.length) {
      // No existe: se ofrece crearlo sin salir de lo que estabas haciendo
      const crear = { texto: `+ Crear contacto «${persona.nombre}»`, fn: () => abrirEditorContacto({ nombre: persona.nombre }, (c) => asociarContacto(nuevo.id, c.id)) };
      avisar('Guardado', falta ? [{ texto: ofrecer[nuevo.actionType], fn: () => { editando = nuevo.id; pintar(); } }, crear] : crear);
    } else if (falta) avisar('Guardado', { texto: ofrecer[nuevo.actionType], fn: () => { editando = nuevo.id; pintar(); } });
    else avisar('Guardado');
  });

  // Copia al pendiente los datos útiles del contacto (por ejemplo, el teléfono para "Llamar ahora")
  function aplicarContacto(p) {
    const c = contactoDe(p.contact_id);
    if (!c) return p;
    if (p.actionType === 'llamar') {
      Object.assign(p, acciones.normalizar({ ...p, contactName: contactos.nombreCompleto(c), contactPhone: p.contactPhone || c.telefono || c.whatsapp }));
    }
    return p;
  }
  async function asociarContacto(idPend, idContacto) {
    const p = pendientes.find((x) => x.id === idPend);
    if (!p) return;
    p.contact_id = idContacto;
    aplicarContacto(p);
    await guardar(); pintar();
    const c = contactoDe(idContacto);
    if (c) avisar(`Asociado a ${contactos.nombreCompleto(c)}`);
  }
  // Pregunta "¿Cuál de ellos?" y devuelve el contacto elegido (o null)
  function elegirPersona(nombre, candidatos, texto) {
    const dlg = $('elegirPersona');
    if (typeof dlg.showModal !== 'function') return Promise.resolve(null);
    $('elegirPersonaTitulo').textContent = `¿Cuál ${nombre}?`;
    $('elegirPersonaTexto').textContent = `Tienes ${candidatos.length} contactos con ese nombre. ¿A quién se refiere «${texto}»?`;
    const lista = $('elegirPersonaLista');
    lista.textContent = '';
    candidatos.forEach((c) => {
      const b = document.createElement('button');
      b.value = c.id; b.className = 'elegir-opcion';
      const n = document.createElement('strong'); n.textContent = contactos.nombreCompleto(c);
      const d = document.createElement('small'); d.textContent = [c.empresa, c.telefono].filter(Boolean).join(' · ') || 'Sin más datos';
      b.append(n, d);
      lista.appendChild(b);
    });
    return new Promise((ok) => {
      dlg.returnValue = '';
      dlg.addEventListener('close', () => ok(candidatos.find((c) => c.id === dlg.returnValue) || null), { once: true });
      dlg.showModal();
    });
  }

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
    const lista = accion ? (Array.isArray(accion) ? accion : [accion]) : [];
    a.innerHTML = '';
    const t = document.createElement('span');
    t.textContent = msg;
    a.appendChild(t);
    for (const ac of lista) {
      if (ac.href) a.appendChild(enlaceAccion(ac.href, ac.texto, 'accion', () => { a.hidden = true; }));
      else a.appendChild(boton('accion', ac.texto, null, () => { a.hidden = true; ac.fn(); }));
    }
    a.hidden = false;
    clearTimeout(temporizador);
    temporizador = setTimeout(() => { a.hidden = true; }, lista.length ? 9000 : 2600);
  }

  // Enlace que abre la acción (marcador, pago, reunión, mapa). Nada se abre solo: la persona toca.
  function enlaceAccion(href, texto, clase, alTocar, etiqueta) {
    const a = document.createElement('a');
    a.className = clase;
    a.href = href;
    a.textContent = texto;
    if (etiqueta) { a.setAttribute('aria-label', etiqueta); a.title = etiqueta; }
    if (!href.startsWith('tel:') && !href.startsWith('mailto:')) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
    if (alTocar) a.addEventListener('click', alTocar);
    return a;
  }

  // ---- Recordatorios con la app abierta ----
  async function revisarRecordatorios() {
    const ahora = new Date();
    let cambio = false;
    for (const p of pendientes) {
      if (p.hecho || p.avisado || !p.cuando || !p.conHora) continue;
      if (new Date(p.cuando) <= ahora) {
        p.avisado = true;
        p.avisadoEn = ahora.toISOString();
        p.avisadoPara = p.cuando; // el "ya avisé" vale solo para esta hora exacta
        cambio = true;
        const dest = acciones.destino(p);
        const botonesAviso = [{ texto: `+${POSPONER_MIN} min`, fn: () => posponer(p.id) }];
        if (dest) botonesAviso.unshift({ texto: acciones.TIPOS[p.actionType].boton, href: dest });
        avisar('⏰ ' + p.texto, botonesAviso);
        ajustes.tocar('recordatorio');
        ajustes.vibrar();
        mostrarNotificacion(p);
      }
    }
    if (cambio) { await guardar(); pintar(); }
  }

  // Misma etiqueta (tag) que usa el servidor: si llegan los dos, el teléfono muestra uno solo.
  // Con la app abierta (o en segundo plano) la propia app lanza el aviso del sistema a la hora exacta,
  // con sonido y vibración. Se anota "avisadoEn" para que el aviso del servidor (Web Push) que llegue
  // después no suene dos veces.
  async function mostrarNotificacion(p) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
      const reg = await navigator.serviceWorker.ready;
      const cuerpo = acciones.cuerpoNotificacion(p);
      try { (await reg.getNotifications({ tag: p.id })).forEach((n) => n.close()); } catch {}
      await reg.showNotification(cuerpo ? p.texto : 'Agenda Inteligente', {
        body: cuerpo || p.texto,
        tag: p.id,
        renotify: true,
        silent: false,
        requireInteraction: true,
        vibrate: ajustes.actuales.vibrationEnabled ? [200, 100, 200, 100, 200] : [],
        icon: 'icons/icon-192.png',
        badge: 'icons/badge-96.png',
        data: { id: p.id },
        actions: acciones.botonesNotificacion(p, Notification.maxActions || 2, POSPONER_MIN),
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

  // =====================================================================
  // NAVEGACIÓN: Hoy · Calendario · Buscar · Ajustes
  // Hoy es la base. Salir de Hoy agrega un paso al historial, así el botón
  // "atrás" del teléfono regresa a Hoy como en una app nativa.
  // =====================================================================
  const VISTAS = ['hoy', 'calendario', 'buscar', 'ajustes', 'estadisticas', 'contactos'];

  function mostrarVista(vista) {
    if (!VISTAS.includes(vista)) vista = 'hoy';
    if (vista !== vistaActual) editando = null;
    // Continuidad espacial: hacia la derecha al avanzar en las pestañas, hacia la izquierda al regresar
    const ORDEN = { hoy: 0, estadisticas: 0.5, contactos: 0.6, calendario: 1, buscar: 2, ajustes: 3 };
    const direccion = vistaActual && vista !== vistaActual ? (ORDEN[vista] > ORDEN[vistaActual] ? 'entra-adelante' : 'entra-atras') : null;
    vistaActual = vista;
    if (window.avatarAsistente && avatarAsistente.mirar) avatarAsistente.mirar(vista === 'hoy' ? 'frente' : 'contenido');
    // Cambiar de sección no obliga al Avatar a parpadear; conserva su respiración natural.
    // Cambio continuo: no clonar vistas ni ocultar la nueva con opacidad cero.
    // La copia-fantasma de v29 quedaba detrás de la app y producía un destello.
    document.querySelectorAll('.vista-fantasma').forEach((f) => f.remove());
    document.querySelectorAll('.vista').forEach((v) => {
      v.hidden = v.dataset.vista !== vista; // la anterior se oculta al instante: nunca hay dos encimadas
      v.classList.remove('entra-adelante', 'entra-atras');
    });
    if (direccion) {
      const nueva = document.querySelector(`.vista[data-vista="${vista}"]`);
      void nueva.offsetWidth;
      nueva.classList.add(direccion);
      // Ignorar animaciones de hijos: antes podían cancelar la entrada y causar un segundo destello.
      const finEntrada = (e) => {
        if (e.target !== nueva) return;
        nueva.classList.remove('entra-adelante', 'entra-atras');
        nueva.removeEventListener('animationend', finEntrada);
      };
      nueva.addEventListener('animationend', finEntrada);
    }
    document.querySelectorAll('.tab').forEach((t) => {
      const activo = t.dataset.ir === vista;
      t.classList.toggle('activo', activo);
      if (activo) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
    });
    window.scrollTo(0, 0);
    if (vista === 'ajustes') pintarAjustes(); else pintar();
    if (vista === 'estadisticas') { pintarEstadisticas(); animarSemana(); }
    if (vista === 'contactos') pintarContactos();
  }

  // Tu semana: al entrar, las tarjetas llegan escalonadas, los contadores suben hasta su valor y las barras se revelan.
  // Solo al entrar a la sección (al actualizar datos estando dentro no se repite: sin parpadeos). No cambia ningún cálculo.
  function animarSemana() {
    const v = $('vista-estadisticas');
    if (!v || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    v.classList.remove('semana-entra'); void v.offsetWidth; v.classList.add('semana-entra');
    setTimeout(() => v.classList.remove('semana-entra'), 1400);
    v.querySelectorAll('.col-dia').forEach((c, i) => c.style.setProperty('--i', i));
    v.querySelectorAll('.fila-cat').forEach((c, i) => c.style.setProperty('--i', i));
    v.querySelectorAll('.tile strong, .prio-tile strong').forEach((n) => {
      const final = n.textContent;
      const m = final.match(/^(\d+)(.*)$/s);
      if (!m || +m[1] === 0) return;
      const meta = +m[1], resto = m[2], t0 = performance.now(), dur = 650;
      const paso = (t) => {
        if (!n.isConnected) return;
        const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
        n.textContent = k < 1 ? Math.round(meta * e) + resto : final;
        if (k < 1) requestAnimationFrame(paso);
      };
      n.textContent = '0' + resto; requestAnimationFrame(paso);
    });
  }

  function navegar(vista) {
    if (vista === vistaActual) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    if (vista === 'hoy') {
      if (history.state && history.state.vista) history.back(); // regresa al paso de Hoy
      else { history.replaceState(null, '', location.pathname); mostrarVista('hoy'); }
      return;
    }
    if (vistaActual === 'hoy') history.pushState({ vista }, '', '#' + vista);
    else history.replaceState({ vista }, '', '#' + vista);
    mostrarVista(vista);
  }

  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => navegar(t.dataset.ir)));
  $('tabNuevo').addEventListener('click', () => {
    if (vistaActual !== 'hoy') navegar('hoy');
    setTimeout(() => {
      $('captura').scrollIntoView({ behavior: 'smooth', block: 'center' });
      entrada.focus({ preventScroll: true });
    }, vistaActual === 'hoy' ? 0 : 150);
  });
  window.addEventListener('popstate', () => mostrarVista((history.state && history.state.vista) || 'hoy'));

  // El Avatar acompaña la acción: al abrir una hoja deja de mirar al frente y atiende el contenido.
  const observadorDialogos = new MutationObserver(() => {
    if (!window.avatarAsistente || !avatarAsistente.mirar) return;
    const hayDialogo = !!document.querySelector('dialog[open]');
    avatarAsistente.mirar(hayDialogo ? 'panel' : (vistaActual === 'hoy' ? 'frente' : 'contenido'));
  });
  document.querySelectorAll('dialog').forEach((dlg) => observadorDialogos.observe(dlg, { attributes: true, attributeFilter: ['open'] }));

  // =====================================================================
  // CALENDARIO — vista mensual; misma información de IndexedDB
  // =====================================================================
  const hoy0 = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
  let mesVisto = (() => { const d = hoy0(); return new Date(d.getFullYear(), d.getMonth(), 1); })();
  let diaSel = hoy0();
  const claveDia = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const mayus = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  function pintarCalendario() {
    const ahora = new Date();
    const porDia = new Map();
    for (const p of pendientes) {
      if (!p.cuando) continue;
      const k = claveDia(new Date(p.cuando));
      const e = porDia.get(k) || { activos: 0, hechos: 0 };
      if (p.hecho) e.hechos++; else e.activos++;
      porDia.set(k, e);
    }

    $('mesTitulo').textContent = mayus(mesVisto.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }));
    const cuad = $('cuadricula');
    cuad.innerHTML = '';
    const desfase = (mesVisto.getDay() + 6) % 7; // semana empieza en lunes
    const diasMes = new Date(mesVisto.getFullYear(), mesVisto.getMonth() + 1, 0).getDate();
    for (let i = 0; i < desfase; i++) cuad.appendChild(document.createElement('span'));
    const hoy = hoy0();
    for (let n = 1; n <= diasMes; n++) {
      const d = new Date(mesVisto.getFullYear(), mesVisto.getMonth(), n);
      const e = porDia.get(claveDia(d));
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'dia' + (mismoDia(d, hoy) ? ' es-hoy' : '') + (mismoDia(d, diaSel) ? ' sel' : '');
      b.textContent = n;
      let etiqueta = d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
      if (e) {
        const punto = document.createElement('span');
        punto.className = 'punto' + (e.activos ? '' : ' tenue');
        b.appendChild(punto);
        b.dataset.pendientes = e.activos;
        etiqueta += e.activos ? `, ${e.activos} ${e.activos === 1 ? 'pendiente' : 'pendientes'}` : ', todo hecho';
      }
      b.setAttribute('aria-label', etiqueta);
      if (mismoDia(d, diaSel)) b.setAttribute('aria-pressed', 'true');
      b.onclick = () => { diaSel = d; editando = null; pintarCalendario(); };
      cuad.appendChild(b);
    }

    // Pendientes del día elegido, ordenados por hora
    const delDia = pendientes
      .filter((p) => p.cuando && mismoDia(new Date(p.cuando), diaSel))
      .sort((a, b) => (a.hecho - b.hecho) || (new Date(a.cuando) - new Date(b.cuando)));
    let titulo = mayus(diaSel.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }));
    if (mismoDia(diaSel, hoy)) titulo = 'Hoy · ' + titulo;
    $('diaTitulo').textContent = titulo;
    const lista = $('listaDia');
    lista.innerHTML = '';
    if (!delDia.length) {
      const p = document.createElement('p');
      p.className = 'nada';
      p.textContent = 'Sin pendientes este día.';
      lista.appendChild(p);
    }
    delDia.forEach((p) => lista.appendChild(item(p, ahora, 'calendario')));
  }

  function moverMes(delta) {
    mesVisto = new Date(mesVisto.getFullYear(), mesVisto.getMonth() + delta, 1);
    editando = null;
    pintarCalendario();
  }
  $('mesAnterior').addEventListener('click', () => moverMes(-1));
  $('mesSiguiente').addEventListener('click', () => moverMes(1));
  $('irHoy').addEventListener('click', () => {
    diaSel = hoy0();
    mesVisto = new Date(diaSel.getFullYear(), diaSel.getMonth(), 1);
    editando = null;
    pintarCalendario();
  });
  // Deslizar a los lados cambia de mes
  (() => {
    let x0 = null, y0 = null;
    const c = $('cuadricula');
    c.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    c.addEventListener('touchend', (e) => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) moverMes(dx < 0 ? 1 : -1);
      x0 = null;
    }, { passive: true });
  })();

  // =====================================================================
  // BUSCAR — ignora mayúsculas y acentos; los hechos siguen apareciendo
  // =====================================================================
  const normalizar = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  let filtroBusca = 'todos';
  let filtroCat = 'todas';
  function pintarChipsCat() {
    const nav = $('chipsCat');
    nav.textContent = '';
    [['todas', 'Todas'], ...Object.entries(categorias.CATEGORIAS).map(([k, v]) => [k, `${v.icono} ${v.etiqueta}`])].forEach(([k, txt]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip' + (filtroCat === k ? ' activo' : '');
      b.dataset.cat = k;
      b.textContent = txt;
      b.addEventListener('click', () => { filtroCat = k; editando = null; pintarChipsCat(); pintarBusqueda(); });
      nav.appendChild(b);
    });
  }
  pintarChipsCat();

  function pintarBusqueda() {
    const ahora = new Date();
    const consulta = normalizar($('busca').value).trim();
    const palabras = consulta.split(/\s+/).filter(Boolean);
    const lista = $('resultados');
    lista.innerHTML = '';
    if (!palabras.length && filtroCat === 'todas') {
      $('conteo').textContent = '';
      const p = document.createElement('p');
      p.className = 'nada';
      p.textContent = 'Escribe una palabra o toca una categoría para ver tus pendientes, también los ya hechos.';
      lista.appendChild(p);
      return;
    }
    const encontrados = pendientes
      .filter((p) => (filtroBusca === 'todos' ? true : filtroBusca === 'hechos' ? p.hecho : !p.hecho))
      .filter((p) => filtroCat === 'todas' || p.category === filtroCat)
      .filter((p) => {
        const cat = categorias.CATEGORIAS[p.category];
        const per = contactoDe(p.contact_id);
        const t = normalizar(p.texto + ' ' + (cat ? cat.etiqueta : '') + ' ' + (per ? contactos.nombreCompleto(per) : ''));
        return palabras.every((w) => t.includes(w));
      })
      .sort((a, b) => {
        if (a.hecho !== b.hecho) return a.hecho ? 1 : -1;
        if (a.hecho) return new Date(b.hechoEn || 0) - new Date(a.hechoEn || 0);
        if (!a.cuando) return 1;
        if (!b.cuando) return -1;
        return new Date(a.cuando) - new Date(b.cuando);
      });
    $('conteo').textContent = encontrados.length === 1 ? '1 resultado' : `${encontrados.length} resultados`;
    if (!encontrados.length) {
      const p = document.createElement('p');
      p.className = 'nada';
      p.textContent = palabras.length ? 'No encontré nada con esa palabra.' : 'No hay pendientes en esa categoría.';
      lista.appendChild(p);
      return;
    }
    encontrados.forEach((p) => lista.appendChild(item(p, ahora, 'buscar')));
  }

  $('busca').addEventListener('input', () => { editando = null; pintarBusqueda(); });
  document.querySelectorAll('.chip[data-busca]').forEach((c) => c.addEventListener('click', () => {
    filtroBusca = c.dataset.busca;
    document.querySelectorAll('.chip[data-busca]').forEach((x) => x.classList.toggle('activo', x === c));
    editando = null;
    pintarBusqueda();
  }));

  // =====================================================================
  // ESTADÍSTICAS — se calculan con los mismos pendientes de IndexedDB
  // =====================================================================
  function calcularEstadisticas(lista, ahora = new Date()) {
    const dia0 = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const hoy = dia0(ahora);
    const hace7 = new Date(hoy); hace7.setDate(hoy.getDate() - 6);
    const hechoEnDia = (p) => p.hecho && p.hechoEn ? dia0(new Date(p.hechoEn)) : null;

    const dias = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(hace7); d.setDate(hace7.getDate() + i);
      dias.push({ dia: d, hechos: lista.filter((p) => { const h = hechoEnDia(p); return h && h.getTime() === d.getTime(); }).length });
    }
    const hechosSemana = dias.reduce((a, d) => a + d.hechos, 0);
    const activos = lista.filter((p) => !p.hecho);
    const atrasados = activos.filter((p) => p.cuando && new Date(p.cuando) < ahora).length;
    // Cumplimiento: de lo que tocaba en los últimos 7 días (hasta ahora), cuánto quedó hecho
    const tocaban = lista.filter((p) => p.cuando && new Date(p.cuando) >= hace7 && new Date(p.cuando) <= ahora);
    const cumplimiento = tocaban.length ? Math.round(100 * tocaban.filter((p) => p.hecho).length / tocaban.length) : null;
    // Racha: días seguidos con al menos un pendiente hecho (si hoy aún no, cuenta desde ayer)
    const conHecho = new Set(lista.map(hechoEnDia).filter(Boolean).map((d) => d.getTime()));
    let racha = 0;
    const d = new Date(hoy);
    if (!conHecho.has(d.getTime())) d.setDate(d.getDate() - 1);
    while (conHecho.has(d.getTime())) { racha++; d.setDate(d.getDate() - 1); }

    const porCategoria = [...Object.keys(categorias.CATEGORIAS), null].map((c) => {
      const de = lista.filter((p) => (p.category || null) === c);
      return { categoria: c, total: de.length, hechos: de.filter((p) => p.hecho).length };
    }).filter((x) => x.total);
    const porPrioridad = Object.keys(categorias.PRIORIDADES).map((k) => ({
      prioridad: k, total: activos.filter((p) => categorias.limpiarPrioridad(p.priority) === k).length,
    }));
    return { dias, hechosSemana, activos: activos.length, atrasados, cumplimiento, racha, porCategoria, porPrioridad, total: lista.length };
  }

  function pintarEstadisticas() {
    const e = calcularEstadisticas(pendientes);
    const tiles = $('statsTiles');
    tiles.textContent = '';
    [
      ['Completados (7 días)', e.hechosSemana, ''],
      ['Cumplimiento', e.cumplimiento === null ? '—' : e.cumplimiento + '%', 'de lo que tocaba esta semana'],
      ['Pendientes', e.activos, e.atrasados ? `${e.atrasados} atrasado${e.atrasados === 1 ? '' : 's'}` : 'ninguno atrasado'],
      ['Racha', e.racha + (e.racha === 1 ? ' día' : ' días'), 'seguidos completando algo'],
    ].forEach(([t, v, sub]) => {
      const div = document.createElement('div');
      div.className = 'tile';
      const n = document.createElement('strong'); n.textContent = v;
      const l = document.createElement('span'); l.textContent = t;
      div.append(l, n);
      if (sub) { const s2 = document.createElement('small'); s2.textContent = sub; div.append(s2); }
      tiles.appendChild(div);
    });

    // Barras por día (una sola serie: color del acento, número encima)
    const caja = $('statsDias');
    caja.textContent = '';
    const max = Math.max(1, ...e.dias.map((d) => d.hechos));
    caja.setAttribute('aria-label', 'Completados por día: ' + e.dias.map((d) =>
      `${d.dia.toLocaleDateString('es-MX', { weekday: 'long' })} ${d.hechos}`).join(', '));
    e.dias.forEach((d, i) => {
      const col = document.createElement('div');
      col.className = 'col-dia' + (i === 6 ? ' hoy' : '');
      col.title = `${mayus(d.dia.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric' }))}: ${d.hechos} completado${d.hechos === 1 ? '' : 's'}`;
      const num = document.createElement('span'); num.className = 'num'; num.textContent = d.hechos;
      const pista = document.createElement('div'); pista.className = 'pista';
      const barra = document.createElement('div'); barra.className = 'barra';
      barra.style.height = (d.hechos ? Math.max(6, 100 * d.hechos / max) : 0) + '%';
      pista.appendChild(barra);
      const et = document.createElement('span'); et.className = 'dia';
      et.textContent = i === 6 ? 'Hoy' : mayus(d.dia.toLocaleDateString('es-MX', { weekday: 'short' }).replace('.', ''));
      col.append(num, pista, et);
      caja.appendChild(col);
    });

    // Por categoría: barra horizontal del total con la parte ya hecha
    const cat = $('statsCat');
    cat.textContent = '';
    if (!e.porCategoria.length) {
      const p = document.createElement('p'); p.className = 'nada'; p.textContent = 'Aún no hay pendientes.'; cat.appendChild(p);
    }
    const maxCat = Math.max(1, ...e.porCategoria.map((x) => x.total));
    e.porCategoria.forEach((x) => {
      const info = categorias.CATEGORIAS[x.categoria] || { icono: '·', etiqueta: 'Sin categoría' };
      const fila = document.createElement('div'); fila.className = 'fila-cat';
      fila.title = `${info.etiqueta}: ${x.hechos} de ${x.total} hechos`;
      const nom = document.createElement('span'); nom.className = 'nom'; nom.textContent = `${info.icono} ${info.etiqueta}`;
      const pista = document.createElement('div'); pista.className = 'pista-h';
      const total = document.createElement('div'); total.className = 'total'; total.style.width = (100 * x.total / maxCat) + '%';
      const hecho = document.createElement('div'); hecho.className = 'hecho'; hecho.style.width = (x.total ? 100 * x.hechos / x.total : 0) + '%';
      total.appendChild(hecho); pista.appendChild(total);
      const val = document.createElement('span'); val.className = 'val'; val.textContent = `${x.hechos}/${x.total}`;
      fila.append(nom, pista, val);
      cat.appendChild(fila);
    });

    const prio = $('statsPrio');
    prio.textContent = '';
    e.porPrioridad.forEach((x) => {
      const d = categorias.PRIORIDADES[x.prioridad];
      const div = document.createElement('div'); div.className = 'prio-tile ' + x.prioridad;
      const n = document.createElement('strong'); n.textContent = x.total;
      const l = document.createElement('span'); l.textContent = `${d.icono} ${d.etiqueta}`;
      div.append(n, l);
      prio.appendChild(div);
    });
    $('statsNota').textContent = 'La barra llena de cada categoría es lo que ya está hecho; el resto, lo que falta. ' +
      'Se cuenta con lo guardado en este teléfono.';
  }
  window.__estadisticas = calcularEstadisticas; // para las pruebas

  $('verEstadisticas').addEventListener('click', () => navegar('estadisticas'));
  $('volverHoy').addEventListener('click', () => navegar('hoy'));

  // =====================================================================
  // AJUSTES — apariencia, sonidos, vibración y estado de avisos
  // =====================================================================
  async function estadoNotificaciones() {
    if (!hayPush) return { texto: 'No disponibles', clase: 'gris' };
    if (Notification.permission === 'denied') return { texto: 'Bloqueadas', clase: 'mal' };
    const sub = await almacen.suscripcion();
    if (Notification.permission === 'granted' && sub) return { texto: 'Activadas', clase: 'bien' };
    return { texto: 'Sin activar', clase: 'gris' };
  }

  async function pintarAjustes() {
    const a = ajustes.actuales;
    document.querySelectorAll('[data-ajuste]').forEach((g) => {
      g.querySelectorAll('input[type=radio]').forEach((r) => { r.checked = r.value === String(a[g.dataset.ajuste]); });
    });
    $('ajSonido').checked = a.appSoundEnabled;
    $('estiloSonido').disabled = !a.appSoundEnabled;
    $('tonoRecordatorio').disabled = !a.appSoundEnabled;
    pintarTonos(a);
    $('ajVibrar').checked = a.vibrationEnabled && ajustes.puedeVibrar;
    $('ajVibrar').disabled = !ajustes.puedeVibrar;
    $('notaVibrar').textContent = ajustes.puedeVibrar
      ? 'Vibración corta y discreta.'
      : 'Este teléfono o navegador no permite vibrar desde la app.';

    const e = await estadoNotificaciones();
    const el = $('estadoNotif');
    el.textContent = e.texto;
    el.className = 'estado ' + e.clase;
    $('notaAvisos').textContent =
      e.texto === 'Activadas' ? 'Te llegan aunque la app esté cerrada.'
      : e.texto === 'Bloqueadas' ? 'Actívalas en los ajustes del navegador para esta página.'
      : e.texto === 'No disponibles' ? (esIOS && !instalada ? 'En iPhone, instala la app en tu pantalla de inicio.' : 'Este navegador no permite avisos.')
      : 'Toca "Configurar avisos" para encenderlas.';
    $('configurarAvisos').hidden = e.texto === 'No disponibles';
  }

  document.querySelectorAll('[data-ajuste]').forEach((g) => {
    g.addEventListener('change', async (ev) => {
      const clave = g.dataset.ajuste;
      await ajustes.cambiar({ [clave]: ev.target.value });
      if (clave === 'appSoundStyle') ajustes.tocar('crear'); // muestra cómo suena (lo pidió el usuario con un toque)
      pintarAjustes();
    });
  });
  $('ajSonido').addEventListener('change', async (ev) => {
    await ajustes.cambiar({ appSoundEnabled: ev.target.checked });
    if (ev.target.checked) ajustes.tocar('crear');
    pintarAjustes();
  });
  $('ajVibrar').addEventListener('change', async (ev) => {
    await ajustes.cambiar({ vibrationEnabled: ev.target.checked });
    if (ev.target.checked) ajustes.vibrar();
  });

  // ---- Tono del recordatorio: lista, canción propia y guía para la app cerrada ----
  function pintarTonos(a = ajustes.actuales) {
    const lista = $('listaTonos');
    lista.textContent = '';
    const opciones = ajustes.TONOS.map((t) => ({ id: t.id, nombre: t.nombre }));
    if (ajustes.tonoPropio) opciones.push({ id: 'propio', nombre: '🎵 ' + ajustes.tonoPropio, propio: true });
    for (const t of opciones) {
      const fila = document.createElement('div');
      fila.className = 'tono';
      const lab = document.createElement('label');
      const r = document.createElement('input');
      r.type = 'radio'; r.name = 'reminderTone'; r.value = t.id;
      r.checked = a.reminderTone === t.id || (a.reminderTone === 'propio' && !ajustes.tonoPropio && t.id === 'suave');
      const nom = document.createElement('span');
      nom.textContent = t.nombre;
      lab.append(r, nom);
      const probar = document.createElement('button');
      probar.type = 'button'; probar.className = 'probar';
      probar.textContent = '▶'; probar.setAttribute('aria-label', 'Escuchar ' + t.nombre);
      probar.addEventListener('click', () => ajustes.tocarTono(t.id));
      fila.append(lab, probar);
      if (t.propio) {
        const quitar = document.createElement('button');
        quitar.type = 'button'; quitar.className = 'quitar';
        quitar.textContent = 'Quitar'; quitar.setAttribute('aria-label', 'Quitar mi canción');
        quitar.addEventListener('click', quitarCancion);
        fila.append(quitar);
      }
      lista.append(fila);
    }
    $('elegirCancion').textContent = ajustes.tonoPropio ? '🎵 Cambiar mi canción' : '🎵 Elegir de mi música';
  }

  $('listaTonos').addEventListener('change', async (ev) => {
    if (ev.target.name !== 'reminderTone') return;
    await ajustes.cambiar({ reminderTone: ev.target.value });
    ajustes.tocarTono(ev.target.value); // así escucha el que eligió
    pintarTonos();
  });

  $('elegirCancion').addEventListener('click', () => $('archivoTono').click());
  $('archivoTono').addEventListener('change', async (ev) => {
    const f = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (!f) return;
    const MAX_MB = 8;
    if (f.type && !f.type.startsWith('audio/')) { avisar('Ese archivo no es de audio. Elige una canción o un tono.'); return; }
    if (f.size > MAX_MB * 1024 * 1024) { avisar(`La canción pesa más de ${MAX_MB} MB. Elige una más ligera.`); return; }
    // Revisamos que el teléfono la pueda reproducir antes de guardarla
    const url = URL.createObjectURL(f);
    const sirve = await new Promise((ok) => {
      const prueba = new Audio();
      const t = setTimeout(() => ok(false), 8000);
      prueba.onloadedmetadata = () => { clearTimeout(t); ok(true); };
      prueba.onerror = () => { clearTimeout(t); ok(false); };
      prueba.src = url;
    });
    URL.revokeObjectURL(url);
    if (!sirve) { avisar('Este teléfono no puede reproducir ese archivo. Prueba con un MP3.'); return; }
    try {
      await almacen.guardarTono({ nombre: f.name.replace(/\.[^.]+$/, ''), tipo: f.type, datos: f });
    } catch {
      avisar('No se pudo guardar la canción. Revisa que haya espacio en el teléfono.'); return;
    }
    await ajustes.cargarTonoPropio();
    await ajustes.cambiar({ reminderTone: 'propio', appSoundEnabled: true });
    pintarAjustes();
    ajustes.tocarTono('propio');
    avisar('Listo: tu canción suena cuando llegue un recordatorio con la app abierta');
  });

  async function quitarCancion() {
    ajustes.detener();
    try { await almacen.borrarTono(); } catch {}
    await ajustes.cargarTonoPropio();
    if (ajustes.actuales.reminderTone === 'propio') await ajustes.cambiar({ reminderTone: 'suave' });
    pintarAjustes();
    avisar('Canción quitada. Se usa el tono Suave.');
  }

  $('sonidoCerrada').addEventListener('click', () => {
    const pasos = esIOS
      ? ['En iPhone, los avisos de apps web suenan con el tono de notificaciones del sistema.',
         'Ajustes → Sonidos y vibraciones → Tono de aviso (cambia el tono general).']
      : instalada
        ? ['Abre los Ajustes de tu teléfono.', 'Entra a Apps y busca "Agenda".', 'Toca Notificaciones.',
           'Toca la categoría de avisos y luego Sonido.', 'Elige un tono o una canción de tu teléfono.']
        : ['Abre los Ajustes de tu teléfono.', 'Entra a Apps → Chrome → Notificaciones.',
           'Busca agendainteligente.site y toca Sonido.', 'Elige un tono o una canción de tu teléfono.'];
    const ol = $('pasosGuia');
    ol.textContent = '';
    for (const t of pasos) { const li = document.createElement('li'); li.textContent = t; ol.append(li); }
    $('notaGuia').textContent = esIOS
      ? 'Apple no deja elegir un tono distinto para cada app web.'
      : 'Los nombres pueden cambiar un poco según la marca del teléfono. Por seguridad, una página web no puede abrir esos ajustes por ti.';
    const dlg = $('guiaSonido');
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else avisar(pasos.join(' '));
  });

  $('configurarAvisos').addEventListener('click', async () => {
    if (Notification.permission === 'denied') {
      avisar('Los avisos están bloqueados. Actívalos en los ajustes del navegador para esta página.');
      return;
    }
    await activarAvisos();
    pintarAjustes();
  });

  $('restaurar').addEventListener('click', async () => {
    const dlg = $('confirmar');
    const confirmar = () => new Promise((ok) => {
      if (typeof dlg.showModal !== 'function') return ok(window.confirm('¿Restaurar la apariencia predeterminada? Tus pendientes no se tocan.'));
      dlg.returnValue = '';
      dlg.addEventListener('close', () => ok(dlg.returnValue === 'si'), { once: true });
      dlg.showModal();
    });
    if (!(await confirmar())) return;
    await ajustes.restaurar(); // solo apariencia y sonido; pendientes y avisos intactos
    pintarAjustes();
    avisar('Apariencia restaurada');
  });

  // =====================================================================
  // TU ASISTENTE — hoja inferior con resumen, recomendación y atajos.
  // Usa los mismos pendientes; nunca cambia horas por su cuenta.
  // =====================================================================
  let asisSec = 'resumen';
  let asisSel = null; // id del pendiente elegido para "Recordarme después"

  function abrirAsistente(sec) {
    const dlg = $('hojaAsistente');
    const r = asistente.analizar(pendientes);
    asisSec = sec || (r.vencidos.length ? 'primero' : 'resumen');
    asisSel = null;
    pintarAsistente();
    if (!dlg.open) {
      dlg.classList.remove('cerrando');
      dlg.querySelector('.hoja-cuerpo').style.transform = '';
      if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
      avatarAsistente.reaccionar('assistant-open'); // "te estoy escuchando"
    }
  }
  function cerrarAsistente() {
    const dlg = $('hojaAsistente');
    if (!dlg.open || dlg.classList.contains('cerrando')) return;
    dlg.close(); // la salida animada la hace el cierre central de ventanas
  }

  const filaAsis = (p, ahora, extra = {}) => {
    const fila = document.createElement('div');
    fila.className = 'asis-fila' + (asistente.vencido(p, ahora) ? ' vencida' : '');
    const info = document.createElement('div');
    info.className = 'asis-info';
    const t = document.createElement('strong');
    t.textContent = (p.priority === 'alta' ? '🔴 ' : '') + p.texto;
    info.appendChild(t);
    const c = document.createElement('small');
    c.textContent = p.cuando ? describir(p.cuando, p.conHora) : 'Sin fecha';
    info.appendChild(c);
    fila.appendChild(info);
    const zona = document.createElement('div');
    zona.className = 'asis-botones-fila';
    const dest = extra.accion !== false && acciones.destino(p);
    if (dest) zona.appendChild(enlaceAccion(dest, `${acciones.TIPOS[p.actionType].icono} ${acciones.TIPOS[p.actionType].boton}`, 'accion-item'));
    if (extra.despues !== false) {
      zona.appendChild(boton('secundario', '⏰ Después', 'Recordarme después: ' + p.texto, () => { asisSel = p.id; asisSec = 'despues'; pintarAsistente(); }));
    }
    if (zona.childNodes.length) fila.appendChild(zona);
    return fila;
  };
  const parrafo = (txt, clase = 'asis-nota') => { const p = document.createElement('p'); p.className = clase; p.textContent = txt; return p; };

  function pintarAsistente() {
    const ahora = new Date();
    const r = asistente.analizar(pendientes, ahora);
    $('asisFrase').textContent = r.frase;
    document.querySelectorAll('#asisBotones button').forEach((b) => {
      const activo = b.dataset.sec === asisSec;
      b.classList.toggle('activo', activo);
      b.setAttribute('aria-pressed', activo ? 'true' : 'false');
    });
    const c = $('asisContenido');
    c.textContent = '';
    const titulo = document.createElement('h3');
    c.appendChild(titulo);

    if (asisSec === 'resumen') {
      titulo.textContent = 'Resumen de hoy';
      const g = document.createElement('div');
      g.className = 'asis-cifras';
      [['Total hoy', r.hoy.total], ['Completados', r.hoy.hechos], ['Pendientes', r.hoy.pendientes], ['Vencidos', r.hoy.vencidos]].forEach(([t, v], i) => {
        const d = document.createElement('div');
        d.className = 'cifra' + (i === 3 && v ? ' mal' : '');
        const n = document.createElement('strong'); n.textContent = v;
        const l = document.createElement('span'); l.textContent = t;
        d.append(n, l); g.appendChild(d);
      });
      c.appendChild(g);
      const sub = document.createElement('h4'); sub.textContent = 'Próximo pendiente'; c.appendChild(sub);
      c.appendChild(r.proximo ? filaAsis(r.proximo, ahora) : parrafo('No tienes pendientes con hora por delante.'));
    } else if (asisSec === 'primero') {
      titulo.textContent = '¿Qué hago primero?';
      if (!r.primero) c.appendChild(parrafo('No tienes nada pendiente para hoy. ¡Disfruta!'));
      else {
        c.appendChild(parrafo(r.primero.texto, 'asis-recomendacion'));
        c.appendChild(filaAsis(r.primero.p, ahora));
      }
    } else if (asisSec === 'accion') {
      titulo.textContent = 'Próxima acción';
      c.appendChild(r.proximaAccion ? filaAsis(r.proximaAccion, ahora)
        : parrafo('Ningún pendiente tiene una acción lista (llamada, pago, reunión, ubicación o enlace).'));
    } else if (asisSec === 'plan') {
      titulo.textContent = 'Reorganizar mi día';
      c.appendChild(parrafo('Así te conviene atenderlos. No cambié ninguna fecha ni hora: tú decides si mueves algo.'));
      const nombres = { vencidos: '⏳ Vencidos', urgente: '🔴 Urgente', proximos: '🕒 Próximos', despues: '📌 Después' };
      let alguno = false;
      for (const [k, v] of Object.entries(r.plan)) {
        if (!v.length) continue;
        alguno = true;
        const h = document.createElement('h4'); h.textContent = nombres[k]; c.appendChild(h);
        v.forEach((p) => c.appendChild(filaAsis(p, ahora, { accion: false })));
      }
      if (!alguno) c.appendChild(parrafo('No hay nada que reorganizar hoy.'));
    } else if (asisSec === 'atrasados') {
      titulo.textContent = 'Pendientes atrasados';
      if (!r.vencidos.length) c.appendChild(parrafo('No tienes pendientes atrasados.'));
      r.vencidos.forEach((p) => c.appendChild(filaAsis(p, ahora)));
    } else if (asisSec === 'despues') {
      titulo.textContent = 'Recordarme después';
      const abiertos = [...r.plan.vencidos, ...r.plan.urgente, ...r.plan.proximos, ...r.plan.despues];
      pendientes.filter((p) => !p.hecho && !abiertos.includes(p)).sort((a, b) => new Date(a.cuando || 8.64e15) - new Date(b.cuando || 8.64e15))
        .forEach((p) => abiertos.push(p));
      if (!abiertos.length) { c.appendChild(parrafo('No tienes pendientes abiertos.')); return; }
      if (!asisSel || !abiertos.some((p) => p.id === asisSel)) asisSel = (r.primero ? r.primero.p : abiertos[0]).id;
      const sel = document.createElement('select');
      sel.id = 'asisElegido';
      sel.setAttribute('aria-label', 'Pendiente a recordar después');
      abiertos.forEach((p) => {
        const o = document.createElement('option');
        o.value = p.id;
        o.textContent = p.texto + (p.cuando ? ' · ' + describir(p.cuando, p.conHora) : '');
        sel.appendChild(o);
      });
      sel.value = asisSel;
      sel.addEventListener('change', () => { asisSel = sel.value; });
      c.appendChild(sel);
      const fila = document.createElement('div');
      fila.className = 'asis-tiempos';
      [['+10 min', 10], ['+30 min', 30], ['+1 hora', 60], ['Mañana', 'manana']].forEach(([t, v]) =>
        fila.appendChild(boton('primario', t, null, () => recordarDespues(asisSel, v))));
      c.appendChild(fila);
      c.appendChild(parrafo('Se mueve el aviso del teléfono y del servidor. No se borra nada.'));
    }
  }

  async function recordarDespues(id, valor) {
    let p;
    if (valor === 'manana') {
      p = await almacen.cambiar(id, (x) => {
        x.cuando = asistente.mananaDe(x).toISOString();
        x.conHora = true; x.avisado = false; x.hecho = false;
        delete x.avisadoEn; delete x.avisadoPara;
      });
    } else p = await almacen.posponer(id, valor);
    if (!p) return;
    await recargar();
    almacen.sincronizar(p);
    ajustes.tocar('posponer');
    const d = new Date(p.cuando);
    avisar(valor === 'manana' ? `Te recuerdo mañana a las ${fmtHora(d)}` : `Te recuerdo a las ${fmtHora(d)}`);
  }

  document.querySelectorAll('#asisBotones button').forEach((b) => b.addEventListener('click', () => {
    asisSec = b.dataset.sec;
    pintarAsistente();
    $('asisContenido').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }));
  $('asisCerrar').addEventListener('click', cerrarAsistente);
  $('hojaAsistente').addEventListener('click', (e) => { if (e.target === $('hojaAsistente')) cerrarAsistente(); }); // tocar fuera
  $('hojaAsistente').addEventListener('cancel', (e) => { e.preventDefault(); cerrarAsistente(); });     // botón atrás / Esc
  // Deslizar hacia abajo desde la parte de arriba para cerrar
  (() => {
    const cuerpo = $('hojaAsistente').querySelector('.hoja-cuerpo');
    let y0 = null, dy = 0;
    const inicio = (e) => { y0 = e.clientY; dy = 0; cuerpo.style.transition = 'none'; };
    const mover = (e) => {
      if (y0 === null) return;
      dy = Math.max(0, e.clientY - y0);
      cuerpo.style.transform = `translateY(${dy}px)`;
    };
    const fin = () => {
      if (y0 === null) return;
      y0 = null;
      cuerpo.style.transition = '';
      if (dy > 80) cerrarAsistente(); else cuerpo.style.transform = '';
    };
    [$('asisAgarre'), $('asisCabeza')].forEach((el) => {
      el.addEventListener('pointerdown', (e) => { if (e.target.closest('button')) return; el.setPointerCapture(e.pointerId); inicio(e); });
      el.addEventListener('pointermove', mover);
      el.addEventListener('pointerup', fin);
      el.addEventListener('pointercancel', fin);
    });
  })();

  // =====================================================================
  // CONTACTOS — libreta privada en este teléfono, ligada a los pendientes
  // =====================================================================
  async function guardarContactos() {
    contactosLista = contactosLista.map((c) => c); // misma lista; solo se guarda
    await almacen.guardarContactos(contactosLista);
  }
  const pendientesDe = (id) => pendientes.filter((p) => p.contact_id === id)
    .sort((a, b) => (a.hecho - b.hecho) || (new Date(a.cuando || 8.64e15) - new Date(b.cuando || 8.64e15)));

  function pintarContactos() {
    const lista = $('listaContactos');
    lista.textContent = '';
    const encontrados = contactos.buscar(contactosLista, $('buscaContacto').value);
    const q = $('buscaContacto').value.trim();
    $('conteoContactos').textContent = contactosLista.length
      ? (q ? `${encontrados.length} de ${contactosLista.length}` : `${contactosLista.length} ${contactosLista.length === 1 ? 'contacto' : 'contactos'}`) : '';
    if (!contactosLista.length) {
      const p = document.createElement('p'); p.className = 'nada';
      p.textContent = 'Aún no tienes contactos. Crea uno o importa los de tu teléfono.';
      lista.appendChild(p); return;
    }
    if (!encontrados.length) {
      const p = document.createElement('p'); p.className = 'nada'; p.textContent = 'No encontré a nadie con eso.';
      lista.appendChild(p); return;
    }
    for (const c of encontrados) {
      const fila = document.createElement('div');
      fila.className = 'contacto';
      const abrir = document.createElement('button');
      abrir.type = 'button'; abrir.className = 'contacto-abrir';
      abrir.setAttribute('aria-label', 'Ver ' + contactos.nombreCompleto(c));
      const ini = document.createElement('span'); ini.className = 'inicial'; ini.textContent = contactos.iniciales(c);
      const txt = document.createElement('span'); txt.className = 'contacto-txt';
      const n = document.createElement('strong'); n.textContent = (c.favorito ? '⭐ ' : '') + contactos.nombreCompleto(c);
      const d = document.createElement('small');
      const np = pendientesDe(c.id).filter((p) => !p.hecho).length;
      d.textContent = [c.empresa, c.telefono || c.email, np ? `📌 ${np} pendiente${np === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ');
      txt.append(n, d);
      abrir.append(ini, txt);
      abrir.addEventListener('click', () => abrirFicha(c.id));
      fila.appendChild(abrir);
      const e = contactos.enlaces(c);
      const can = document.createElement('div'); can.className = 'canales';
      if (e.llamar) can.appendChild(enlaceAccion(e.llamar, '📞', 'canal', null, 'Llamar a ' + c.nombre));
      if (e.whatsapp) can.appendChild(enlaceAccion(e.whatsapp, '💬', 'canal', null, 'WhatsApp a ' + c.nombre));
      if (e.correo) can.appendChild(enlaceAccion(e.correo, '✉️', 'canal', null, 'Correo a ' + c.nombre));
      fila.appendChild(can);
      lista.appendChild(fila);
    }
  }
  $('buscaContacto').addEventListener('input', pintarContactos);
  $('verContactos').addEventListener('click', () => navegar('contactos'));
  $('volverHoyContactos').addEventListener('click', () => navegar('hoy'));
  $('nuevoContacto').addEventListener('click', () => abrirEditorContacto({}, (c) => abrirFicha(c.id)));

  // Cerrar hojas: botón ×/Cancelar o tocando fuera
  ['fichaContacto', 'editorContacto', 'importarHoja'].forEach((id) => {
    const dlg = $(id);
    dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target.closest('[data-cerrar]')) dlg.close(); });
  });

  // ---- Ficha ----
  let fichaId = null;
  function abrirFicha(id) {
    fichaId = id;
    if (!contactoDe(id)) return;
    pintarFicha();
    const dlg = $('fichaContacto');
    if (!dlg.open) dlg.showModal();
  }
  function pintarFicha() {
    const c = contactoDe(fichaId);
    if (!c) { $('fichaContacto').close(); return; }
    $('fichaInicial').textContent = contactos.iniciales(c);
    $('fichaNombre').textContent = contactos.nombreCompleto(c);
    $('fichaEmpresa').textContent = [c.puesto, c.empresa].filter(Boolean).join(' · ');
    const fav = $('fichaFavorito');
    fav.textContent = c.favorito ? '★' : '☆';
    fav.setAttribute('aria-pressed', c.favorito ? 'true' : 'false');
    fav.classList.toggle('activa', c.favorito);
    // Llamar · WhatsApp · Correo (abren la app del teléfono; nada se manda solo)
    const acc = $('fichaAcciones');
    acc.textContent = '';
    const e = contactos.enlaces(c);
    if (e.llamar) acc.appendChild(enlaceAccion(e.llamar, '📞 Llamar', 'accion-item'));
    if (e.whatsapp) acc.appendChild(enlaceAccion(e.whatsapp, '💬 WhatsApp', 'accion-item'));
    if (e.correo) acc.appendChild(enlaceAccion(e.correo, '✉️ Correo', 'accion-item'));
    if (!acc.childNodes.length) acc.appendChild(Object.assign(document.createElement('p'), { className: 'asis-nota', textContent: 'Sin teléfono ni correo. Toca Editar para agregarlos.' }));
    const dl = $('fichaDatos');
    dl.textContent = '';
    const dato = (t, v) => { if (!v) return; const a = document.createElement('dt'); a.textContent = t; const b = document.createElement('dd'); b.textContent = v; dl.append(a, b); };
    dato('Teléfono', c.telefono);
    dato('WhatsApp', c.whatsapp);
    dato('Correo', c.email);
    if (c.cumpleanos) {
      const [y, m, d] = c.cumpleanos.startsWith('--') ? [null, ...c.cumpleanos.slice(2).split('-')] : c.cumpleanos.split('-');
      dato('Cumpleaños', new Date(2000, +m - 1, +d).toLocaleDateString('es-MX', { day: 'numeric', month: 'long' }) + (y ? ` (${y})` : ''));
    }
    dato('Etiquetas', (c.etiquetas || []).map((t) => '#' + t).join('  '));
    dato('Notas', c.notas);
    // Cumpleaños (opcional)
    $('fichaCumple').hidden = !c.cumpleanos;
    if (c.cumpleanos) {
      $('fichaRecordarCumple').checked = !!c.recordarCumple;
      $('fichaAvisoCumple').hidden = !c.recordarCumple;
      document.querySelectorAll('#fichaAvisoCumple input').forEach((r) => { r.checked = r.value === (c.avisoCumple || 'dia'); });
      const prox = contactos.proximoCumple(c);
      $('fichaCumpleNota').textContent = c.recordarCumple && prox
        ? `Te aviso el ${prox.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })} a las 9:00 a.m.`
        : 'Desactivado. Actívalo si quieres un aviso.';
    }
    // Pendientes relacionados
    const rel = pendientesDe(c.id);
    const abiertos = rel.filter((p) => !p.hecho).length;
    $('fichaPendTitulo').textContent = `📌 ${abiertos} ${abiertos === 1 ? 'pendiente relacionado' : 'pendientes relacionados'}`;
    const cont = $('fichaPendientes');
    cont.textContent = '';
    if (!rel.length) cont.appendChild(Object.assign(document.createElement('p'), { className: 'asis-nota', textContent: 'Todavía no hay pendientes con esta persona.' }));
    const ahora = new Date();
    rel.slice(0, 20).forEach((p) => {
      const f = document.createElement('div');
      f.className = 'asis-fila' + (p.hecho ? ' hecha' : asistente.vencido(p, ahora) ? ' vencida' : '');
      const info = document.createElement('div'); info.className = 'asis-info';
      const t = document.createElement('strong'); t.textContent = (p.hecho ? '✓ ' : '') + p.texto;
      const w = document.createElement('small'); w.textContent = p.cuando ? describir(p.cuando, p.conHora) : 'Sin fecha';
      info.append(t, w);
      f.appendChild(info);
      if (!p.hecho) {
        const z = document.createElement('div'); z.className = 'asis-botones-fila';
        const dest = acciones.destino(p);
        if (dest) z.appendChild(enlaceAccion(dest, `${acciones.TIPOS[p.actionType].icono} ${acciones.TIPOS[p.actionType].boton}`, 'accion-item'));
        z.appendChild(boton('secundario', '✓ Completar', 'Completar ' + p.texto, async () => {
          p.hecho = true; p.hechoEn = new Date().toISOString();
          ajustes.tocar('hecho'); avatarAsistente.reaccionar('success');
          await guardar(); pintar(); almacen.sincronizar(p);
        }));
        f.appendChild(z);
      }
      cont.appendChild(f);
    });
  }
  $('fichaFavorito').addEventListener('click', async () => {
    const c = contactoDe(fichaId); if (!c) return;
    c.favorito = !c.favorito; c.updated_at = new Date().toISOString();
    await guardarContactos(); pintarFicha(); if (vistaActual === 'contactos') pintarContactos();
  });
  $('fichaRecordarCumple').addEventListener('change', async (ev) => {
    const c = contactoDe(fichaId); if (!c) return;
    c.recordarCumple = ev.target.checked; c.updated_at = new Date().toISOString();
    await guardarContactos(); await asegurarCumples(); pintarFicha();
    if (c.recordarCumple) avisar(`Listo: te recuerdo el cumpleaños de ${c.nombre}`);
  });
  $('fichaAvisoCumple').addEventListener('change', async (ev) => {
    const c = contactoDe(fichaId); if (!c) return;
    c.avisoCumple = ev.target.value; c.updated_at = new Date().toISOString();
    await guardarContactos(); await asegurarCumples(); pintarFicha();
  });
  $('fichaEditar').addEventListener('click', () => { const c = contactoDe(fichaId); if (c) abrirEditorContacto(c, () => pintarFicha()); });
  $('fichaNuevoPend').addEventListener('click', () => {
    const c = contactoDe(fichaId); if (!c) return;
    $('fichaContacto').close();
    if (vistaActual !== 'hoy') navegar('hoy');
    setTimeout(() => {
      entrada.value = (c.telefono ? 'Llamar a ' : 'Ver a ') + contactos.nombreCompleto(c) + ' ';
      entrada.dispatchEvent(new Event('input'));
      $('captura').scrollIntoView({ behavior: 'smooth', block: 'center' });
      entrada.focus({ preventScroll: true });
      entrada.setSelectionRange(entrada.value.length, entrada.value.length);
    }, 150);
  });
  $('fichaBorrar').addEventListener('click', async () => {
    const c = contactoDe(fichaId); if (!c) return;
    const dlg = $('confirmarBorrarContacto');
    const n = pendientesDe(c.id).length;
    $('confirmarBorrarTexto').textContent = `Se eliminará a ${contactos.nombreCompleto(c)} de tus contactos.` +
      (n ? ` Sus ${n} pendiente${n === 1 ? '' : 's'} se quedan, solo sin persona asociada.` : '');
    dlg.returnValue = '';
    const si = await new Promise((ok) => { dlg.addEventListener('close', () => ok(dlg.returnValue === 'si'), { once: true }); dlg.showModal(); });
    if (!si) return;
    contactosLista = contactosLista.filter((x) => x.id !== c.id);
    // Sus pendientes se conservan; se quitan solo los avisos de cumpleaños aún no hechos
    pendientes = pendientes.filter((p) => !(p.cumpleDe === c.id && !p.hecho));
    pendientes.forEach((p) => { if (p.contact_id === c.id) p.contact_id = null; });
    await guardarContactos(); await guardar();
    $('fichaContacto').close();
    pintar(); if (vistaActual === 'contactos') pintarContactos();
    avisar('Contacto eliminado');
  });

  // ---- Crear / editar ----
  let alGuardarContacto = null;
  let editandoContacto = null;
  function abrirEditorContacto(datos, alGuardar) {
    const dlg = $('editorContacto');
    const f = $('formContacto');
    editandoContacto = datos && datos.id ? datos.id : null;
    alGuardarContacto = alGuardar || null;
    $('editorContactoTitulo').textContent = editandoContacto ? 'Editar contacto' : 'Nuevo contacto';
    for (const k of ['nombre', 'apellidos', 'telefono', 'whatsapp', 'email', 'empresa', 'puesto', 'notas']) f.elements[k].value = (datos && datos[k]) || '';
    const cu = datos && datos.cumpleanos ? datos.cumpleanos : '';
    f.elements.cumpleanos.value = /^\d{4}-/.test(cu) ? cu : cu.startsWith('--') ? '2000' + cu.slice(1) : '';
    f.elements.etiquetas.value = ((datos && datos.etiquetas) || []).join(', ');
    f.elements.favorito.checked = !!(datos && datos.favorito);
    $('errorContacto').hidden = true;
    dlg.showModal();
    f.elements[datos && datos.nombre ? 'telefono' : 'nombre'].focus(); // en el momento (un foco tardío puede robar lo que escribes)
  }
  $('formContacto').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const v = Object.fromEntries(['nombre', 'apellidos', 'telefono', 'whatsapp', 'email', 'empresa', 'puesto', 'cumpleanos', 'notas', 'etiquetas'].map((k) => [k, f.elements[k].value]));
    v.favorito = f.elements.favorito.checked;
    const previo = contactoDe(editandoContacto);
    const c = contactos.normalizar({ ...(previo || {}), ...v, id: previo ? previo.id : undefined });
    const err = $('errorContacto');
    if (!contactos.valido(c)) { err.textContent = 'Escribe al menos el nombre.'; err.hidden = false; return; }
    if (f.elements.telefono.value.trim() && !c.telefono) { err.textContent = 'Revisa el teléfono: debe tener entre 7 y 15 dígitos.'; err.hidden = false; return; }
    if (f.elements.email.value.trim() && !c.email) { err.textContent = 'Revisa el correo.'; err.hidden = false; return; }
    if (!previo) {
      const dup = contactos.duplicados(c, contactosLista);
      if (dup.length) {
        err.textContent = `Ya tienes a ${contactos.nombreCompleto(dup[0])} con ese teléfono o correo. Se guardará aparte; si es la misma persona, mejor edítala.`;
        if (err.hidden) { err.hidden = false; return; } // primer intento: avisar; segundo: guardar igual
      }
    }
    if (previo) contactosLista = contactosLista.map((x) => (x.id === c.id ? c : x)); else contactosLista.push(c);
    await guardarContactos();
    // Si cambió el teléfono, los pendientes de llamada con esta persona lo usan
    pendientes.filter((p) => p.contact_id === c.id && !p.hecho).forEach(aplicarContacto);
    await guardar();
    await asegurarCumples();
    $('editorContacto').close();
    const cb = alGuardarContacto; alGuardarContacto = null;
    // Si estás editando un pendiente, no se repinta la lista (así no pierdes lo que llevas escrito)
    if (!editando) pintar();
    if (vistaActual === 'contactos') pintarContactos();
    if ($('fichaContacto').open) pintarFicha();
    avisar(previo ? 'Contacto actualizado' : 'Contacto guardado');
    if (cb) cb(c);
  });

  // ---- Importar (con permiso y eligiendo cuáles) ----
  const hayAgenda = 'contacts' in navigator && 'ContactsManager' in window && typeof navigator.contacts.select === 'function';
  let porImportar = [];
  $('importarContactos').addEventListener('click', () => {
    $('importarPaso1').hidden = false; $('importarPaso2').hidden = true;
    $('importarAgenda').hidden = !hayAgenda;
    $('importarNota').textContent = hayAgenda
      ? 'Al elegir de la agenda, tu teléfono te pide permiso y tú marcas a quién compartir.'
      : 'Este navegador no deja leer la agenda del teléfono. Exporta tus contactos como archivo .vcf o .csv (desde la app Contactos o Google Contacts) y elígelo aquí.';
    $('importarHoja').showModal();
  });
  $('importarAgenda').addEventListener('click', async () => {
    try {
      const props = await navigator.contacts.getProperties().catch(() => ['name', 'tel', 'email']);
      const quiero = ['name', 'tel', 'email'].filter((p) => props.includes(p));
      const elegidos = await navigator.contacts.select(quiero, { multiple: true });
      if (!elegidos || !elegidos.length) return;
      prepararImportacion(elegidos.map((x) => {
        const partes = String((x.name && x.name[0]) || '').trim().split(/\s+/);
        return { nombre: partes.shift() || '', apellidos: partes.join(' '), telefono: x.tel && x.tel[0], email: x.email && x.email[0] };
      }));
    } catch { avisar('No se pudo abrir la agenda del teléfono. Prueba con un archivo .vcf o .csv.'); }
  });
  $('importarArchivo').addEventListener('click', () => $('archivoContactos').click());
  $('archivoContactos').addEventListener('change', async (ev) => {
    const f = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { avisar('El archivo es muy grande (más de 5 MB).'); return; }
    const txt = await f.text();
    const esVcf = /\.(vcf|vcard)$/i.test(f.name) || /BEGIN:VCARD/i.test(txt);
    const crudos = esVcf ? contactos.parseVCF(txt) : contactos.parseCSV(txt);
    if (!crudos.length) { avisar('No encontré contactos en ese archivo. Revisa que sea .vcf o .csv.'); return; }
    prepararImportacion(crudos);
  });
  function prepararImportacion(crudos) {
    porImportar = crudos.map((x) => contactos.normalizar(x)).filter(contactos.valido).slice(0, 2000).map((c) => {
      const dup = contactos.duplicados(c, contactosLista)[0] || null;
      return { c, dup, incluir: true, modo: dup ? 'combinar' : 'nuevo' };
    });
    $('importarPaso1').hidden = true; $('importarPaso2').hidden = false;
    pintarImportacion();
  }
  function pintarImportacion() {
    const dups = porImportar.filter((x) => x.dup).length;
    $('importarResumen').textContent = `Encontré ${porImportar.length} ${porImportar.length === 1 ? 'contacto' : 'contactos'}` +
      (dups ? `. ${dups} ya ${dups === 1 ? 'existe' : 'existen'} en tu agenda: elige qué hacer con ${dups === 1 ? 'él' : 'ellos'}.` : '. Desmarca los que no quieras.');
    const cont = $('importarLista');
    cont.textContent = '';
    porImportar.forEach((x, i) => {
      const fila = document.createElement('div');
      fila.className = 'imp-fila' + (x.dup ? ' dup' : '');
      const lab = document.createElement('label');
      const chk = document.createElement('input'); chk.type = 'checkbox'; chk.checked = x.incluir;
      chk.addEventListener('change', () => { x.incluir = chk.checked; actualizarBotonImportar(); });
      const t = document.createElement('span');
      const n = document.createElement('strong'); n.textContent = contactos.nombreCompleto(x.c);
      const d = document.createElement('small'); d.textContent = [x.c.telefono, x.c.email].filter(Boolean).join(' · ') || 'Sin teléfono ni correo';
      t.append(n, d); lab.append(chk, t); fila.appendChild(lab);
      if (x.dup) {
        const aviso = document.createElement('small'); aviso.className = 'imp-dup';
        aviso.textContent = `Parece ser ${contactos.nombreCompleto(x.dup)}, que ya tienes.`;
        const sel = document.createElement('select');
        sel.setAttribute('aria-label', 'Qué hacer con ' + contactos.nombreCompleto(x.c));
        [['combinar', 'Combinar (completar datos)'], ['sustituir', 'Sustituir por el nuevo'], ['ambos', 'Conservar ambos']].forEach(([v, txt]) => {
          const o = document.createElement('option'); o.value = v; o.textContent = txt; sel.appendChild(o);
        });
        sel.value = x.modo;
        sel.addEventListener('change', () => { x.modo = sel.value; });
        fila.append(aviso, sel);
      }
      cont.appendChild(fila);
    });
    actualizarBotonImportar();
  }
  function actualizarBotonImportar() {
    const n = porImportar.filter((x) => x.incluir).length;
    $('importarConfirmar').textContent = n ? `Importar ${n}` : 'Importar';
    $('importarConfirmar').disabled = !n;
  }
  $('importarAtras').addEventListener('click', () => { $('importarPaso1').hidden = false; $('importarPaso2').hidden = true; });
  $('importarConfirmar').addEventListener('click', async () => {
    let nuevos = 0, combinados = 0, sustituidos = 0;
    for (const x of porImportar.filter((y) => y.incluir)) {
      const existente = x.dup && contactoDe(x.dup.id);
      if (existente && x.modo === 'combinar') {
        const r = contactos.combinar(existente, x.c);
        contactosLista = contactosLista.map((c) => (c.id === r.id ? r : c)); combinados++;
      } else if (existente && x.modo === 'sustituir') {
        const r = contactos.normalizar({ ...x.c, id: existente.id, created_at: existente.created_at, favorito: existente.favorito || x.c.favorito });
        contactosLista = contactosLista.map((c) => (c.id === r.id ? r : c)); sustituidos++;
      } else {
        contactosLista.push(x.c); nuevos++;
      }
    }
    await guardarContactos();
    porImportar = [];
    $('importarHoja').close();
    if (vistaActual !== 'contactos') navegar('contactos'); else pintarContactos();
    avisar(`Importados: ${nuevos} ${nuevos === 1 ? "nuevo" : "nuevos"}` + (combinados ? `, ${combinados} combinados` : '') + (sustituidos ? `, ${sustituidos} sustituidos` : ''));
  });

  // ---- Cumpleaños (solo de quien tú actives) ----
  async function asegurarCumples() {
    const ahora = new Date();
    let cambio = false;
    for (const c of contactosLista) {
      const abiertos = pendientes.filter((p) => p.cumpleDe === c.id && !p.hecho);
      if (!c.recordarCumple || !c.cumpleanos) {
        if (abiertos.length) { pendientes = pendientes.filter((p) => !abiertos.includes(p)); abiertos.forEach((p) => almacen.sincronizar({ ...p, hecho: true })); cambio = true; }
        continue;
      }
      const cuando = contactos.proximoCumple(c, ahora);
      if (!cuando) continue;
      const texto = (c.avisoCumple === 'antes' ? 'Mañana cumple años ' : 'Cumpleaños de ') + contactos.nombreCompleto(c) + ' 🎂';
      const datos = { texto, cuando: cuando.toISOString(), conHora: true, contact_id: c.id, category: 'personal' };
      if (c.telefono) Object.assign(datos, acciones.normalizar({ actionType: 'llamar', contactName: contactos.nombreCompleto(c), contactPhone: c.telefono }));
      const ya = abiertos[0];
      if (ya) {
        if (ya.cuando !== datos.cuando || ya.texto !== datos.texto) { Object.assign(ya, datos, { avisado: false }); delete ya.avisadoEn; delete ya.avisadoPara; almacen.sincronizar(ya); cambio = true; }
      } else {
        const nuevo = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), hecho: false, avisado: false,
          creado: ahora.toISOString(), priority: 'normal', cumpleDe: c.id, ...datos };
        pendientes.push(nuevo); almacen.sincronizar(nuevo); cambio = true;
      }
    }
    if (cambio) { await guardar(); pintar(); }
  }

  // Ventanita con el botón de la acción (la persona confirma: el marcador nunca se abre solo)
  function mostrarHojaAccion(id) {
    const p = pendientes.find((x) => x.id === id);
    const dest = p && acciones.destino(p);
    const dlg = $('hojaAccion');
    if (!dest || typeof dlg.showModal !== 'function') return;
    const tipo = acciones.TIPOS[p.actionType];
    $('hojaAccionTitulo').textContent = p.texto;
    $('hojaAccionDetalle').textContent = p.actionType === 'llamar'
      ? `${p.contactName ? p.contactName + ' · ' : ''}${p.contactPhone}` : dest;
    const ir = $('hojaAccionIr');
    ir.textContent = tipo.boton;
    ir.href = dest;
    if (dest.startsWith('tel:')) { ir.removeAttribute('target'); ir.removeAttribute('rel'); }
    else { ir.target = '_blank'; ir.rel = 'noopener noreferrer'; }
    ir.onclick = () => dlg.close();
    if (dlg.open) dlg.close();
    dlg.showModal();
  }

  // ---- Arranque ----
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
    // El service worker avisa cuando cambió algo desde una notificación
    navigator.serviceWorker.addEventListener('message', async (e) => {
      if (!e.data) return;
      if (e.data.tipo === 'recargar') recargar();
      if (e.data.tipo === 'accion') { await recargar(); mostrarHojaAccion(e.data.id); }
    });
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) avatarAsistente.atencion(asistente.atencion(pendientes), { alVolver: true });
    if (document.hidden) return;
    recargar();
    if (vistaActual === 'ajustes') pintarAjustes();
  });

  // Al abrir siempre empieza en Hoy (aunque la dirección traiga #calendario, etc.)
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);

  // ---- Splash de apertura (firma JS) ----
  // Ritual de apertura de marca: debe sentirse, no parpadear.
  // Visible al menos 1.5 s desde que corre el script; se desvanece en 0.62 s mientras Hoy emerge (total < 3 s).
  const splash = $('splash');
  const inicioSplash = performance.now();
  let inicioSplashSaltado = false;
  const movimientoReducido = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const minimoSplash = 1500;
  const salidaSplash = movimientoReducido ? 0 : 620; // el splash se desvanece mientras Hoy ya viene emergiendo
  function quitarSplash() {
    if (!splash || splash.hidden || splash.classList.contains('saliendo')) return;
    const espera = inicioSplashSaltado ? 0 : Math.max(0, minimoSplash - (performance.now() - inicioSplash));
    setTimeout(() => {
      if (!splash || splash.hidden || splash.classList.contains('saliendo')) return;
      // Transición coordinada: Hoy empieza a acercarse EN EL MISMO instante en que el splash empieza a desvanecerse
      // (sin hueco vacío entre los dos).
      const appRaiz = document.querySelector('.app');
      if (appRaiz) {
        appRaiz.classList.remove('app-preentrada');
        appRaiz.classList.add('entrada-inicial');
        setTimeout(() => appRaiz.classList.remove('entrada-inicial'), 1300);
      }
      splash.classList.add('saliendo');
      if (window.avatarAsistente && avatarAsistente.mirar) avatarAsistente.mirar('frente');
      setTimeout(() => avatarAsistente.reaccionar('greeting'), movimientoReducido ? 0 : 700);
      setTimeout(() => {
        splash.hidden = true;
        const barra = document.querySelector('meta[name="theme-color"]'); if (barra) barra.content = '#075b45'; // barra del sistema vuelve al esmeralda de la app
      }, salidaSplash);
    }, espera);
  }
  // Tocar el splash lo salta (sin esperar el mínimo)
  if (splash) splash.addEventListener('click', () => { inicioSplashSaltado = true; quitarSplash(); });
  // Respaldo: si algo tarda en inicializar, el splash comienza a salir a los 2.1 s.
  setTimeout(quitarSplash, 2100);

  Promise.all([ajustes.cargar(), recargar()]).then(async () => {
    quitarSplash();
    await asegurarCumples(); // si ya pasó un cumpleaños, prepara el del próximo año
    revisarRecordatorios();
    estadoAvisos();
    // Atajo "Nuevo pendiente" del ícono: abre directo en el campo de captura
    if (new URLSearchParams(location.search).has('nuevo')) entrada.focus();
    // Abierta desde el botón de acción de un aviso
    const idAccion = new URLSearchParams(location.search).get('accion');
    if (idAccion) {
      history.replaceState(null, '', location.pathname);
      mostrarHojaAccion(idAccion);
    }
  });
  // Revisión frecuente para avisar a la hora exacta con la app abierta
  setInterval(() => { revisarRecordatorios(); }, 5000);
  setInterval(() => { pintarResumen(); }, 30000);
})();
