// Acciones del recordatorio: llamar, abrir pago, entrar a reunión, cómo llegar, abrir enlace.
// Lo usan la pantalla (app.js), el service worker (sw.js) y las pruebas en Node.
// Nunca guarda contraseñas, NIP, CVV, tokens ni credenciales: solo nombre, teléfono,
// un enlace (sin usuario ni contraseña) o una dirección.
(function (raiz) {
  const TIPOS = {
    llamar:    { etiqueta: 'Llamar',          boton: 'Llamar ahora',      icono: '📞' },
    pago:      { etiqueta: 'Abrir pago',      boton: 'Abrir pago',        icono: '💳' },
    reunion:   { etiqueta: 'Abrir reunión',   boton: 'Entrar a reunión',  icono: '🎥' },
    ubicacion: { etiqueta: 'Abrir ubicación', boton: 'Cómo llegar',       icono: '📍' },
    enlace:    { etiqueta: 'Abrir enlace',    boton: 'Abrir enlace',      icono: '🔗' },
  };

  const sinAcentos = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  const RE_URL = /\b((?:https?:\/\/|www\.)[^\s<>"']+)/i;
  // Teléfono: 8 a 15 dígitos, con +, espacios, guiones o paréntesis
  const RE_TEL = /(?:\+\d{1,3}[\s-]?)?(?:\(?\d{2,4}\)?[\s-]?)?\d{3,4}[\s-]?\d{4}\b/;

  const DOMINIOS_REUNION = /(^|\.)(meet\.google\.com|zoom\.us|zoom\.com|teams\.microsoft\.com|teams\.live\.com|webex\.com|whereby\.com|meet\.jit\.si|gotomeeting\.com)$/i;
  const DOMINIOS_MAPAS = /(^|\.)(maps\.google\.[a-z.]+|google\.[a-z.]+\/maps|goo\.gl\/maps|maps\.app\.goo\.gl|maps\.apple\.com|waze\.com|osm\.org|openstreetmap\.org)/i;

  // Deja un enlace limpio y seguro: solo http/https y sin usuario:contraseña.
  function limpiarUrl(texto) {
    if (!texto) return null;
    let t = String(texto).trim().replace(/[).,;]+$/, '');
    if (/^www\./i.test(t)) t = 'https://' + t;
    if (!/^https?:\/\//i.test(t)) {
      if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(t)) t = 'https://' + t; else return null;
    }
    try {
      const u = new URL(t);
      if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
      u.username = ''; u.password = '';
      return u.toString();
    } catch { return null; }
  }

  // Deja solo dígitos y un + inicial. Devuelve null si no parece teléfono.
  function limpiarTelefono(texto) {
    if (!texto) return null;
    const t = String(texto).trim();
    const mas = t.startsWith('+') ? '+' : '';
    const digitos = t.replace(/\D/g, '');
    if (digitos.length < 7 || digitos.length > 15) return null;
    return mas + digitos;
  }

  // Saca de la frase el enlace y el teléfono antes de interpretar fecha y hora,
  // para que los números de un teléfono no se confundan con horas o días.
  function extraer(frase) {
    let resto = String(frase || '');
    let url = null, telefono = null;
    const mu = resto.match(RE_URL);
    if (mu) { url = limpiarUrl(mu[1]); if (url) resto = resto.replace(mu[0], ' '); }
    const mt = resto.match(RE_TEL);
    if (mt && mt[0].replace(/\D/g, '').length >= 8) {
      telefono = limpiarTelefono(mt[0]);
      if (telefono) resto = resto.replace(mt[0], ' ');
    }
    return { resto: resto.replace(/\s+/g, ' ').trim(), url, telefono };
  }

  function tipoDeUrl(url) {
    try {
      const u = new URL(url);
      const hostRuta = u.hostname + u.pathname;
      if (DOMINIOS_REUNION.test(u.hostname)) return 'reunion';
      if (DOMINIOS_MAPAS.test(u.hostname) || DOMINIOS_MAPAS.test(hostRuta)) return 'ubicacion';
    } catch {}
    return null;
  }

  // "… en Av. Tulum 230", "… en la Calle 10 #45", "… en Plaza Las Américas".
  // Si ya sabemos que es una cita (dentista, banco…), cualquier lugar después de "en" sirve;
  // si no, solo cuando parece dirección (avenida, calle, plaza, número…), para no adivinar de más.
  const RE_DIRECCION = /\b(av|avenida|calle|c|blvd|bulevar|boulevard|plaza|col|colonia|fracc|fraccionamiento|carretera|km|sm|supermanzana|mz|manzana|lote|local|piso|edificio|torre|centro comercial|hospital|clinica|consultorio|notaria|oficina)\b|#\s*\d|\d{2,}/;
  function extraerLugar(texto, esCita) {
    const m = String(texto || '').match(/\s(?:en|al|a la)\s+(?:el\s+|la\s+|los\s+|las\s+)?(.{3,120})$/i);
    if (!m) return null;
    const lugar = m[1].replace(/[.,;]+$/, '').trim();
    if (!lugar) return null;
    if (esCita || RE_DIRECCION.test(sinAcentos(lugar))) return lugar;
    return null;
  }

  // Sugiere una acción según el texto. Siempre se puede cambiar; nunca impide guardar.
  function sugerir(texto, extra = {}) {
    const t = ' ' + sinAcentos(texto) + ' ';
    const url = extra.url || null;
    const telefono = extra.telefono || null;
    const r = { actionType: null };

    if (url) {
      const porDominio = tipoDeUrl(url);
      if (porDominio) r.actionType = porDominio;
      else if (/\b(pag(ar|o)|factura|recibo|tarjeta|abon(ar|o)|liquidar|mensualidad|predial|tenencia|colegiatura|renta)\b/.test(t)) r.actionType = 'pago';
      else if (/\b(reunion|junta|videollamada|llamada de equipo|meet|zoom|teams)\b/.test(t)) r.actionType = 'reunion';
      else r.actionType = 'enlace';
      if (r.actionType === 'ubicacion') r.location = url; else r.url = url;
    } else if (telefono || /\b(llamar|llama|llamada|marcar|telefonear|hablarle|hablar por telefono)\b/.test(t)) {
      r.actionType = 'llamar';
    } else if (/\b(pag(ar|o)|factura|recibo|tarjeta de credito|abon(ar|o)|liquidar|mensualidad|predial|tenencia|colegiatura|renta)\b/.test(t)) {
      r.actionType = 'pago';
    } else if (/\b(meet|zoom|teams|videollamada|webex)\b/.test(t)) {
      r.actionType = 'reunion';
    } else if (/\b(dentista|doctor|doctora|medico|hospital|clinica|consultorio|cita con|cita en|ir a|ir al|visitar|recoger en|oficina de|notaria|banco)\b/.test(t)) {
      r.actionType = 'ubicacion';
    }

    // Dirección dicha en la frase ("… en Av. Tulum 230"): se guarda para que "Cómo llegar" funcione de una vez
    if (!r.actionType || r.actionType === 'ubicacion') {
      const lugar = extraerLugar(texto, r.actionType === 'ubicacion');
      if (lugar) { r.actionType = 'ubicacion'; if (!r.location) r.location = lugar; }
    }

    if (r.actionType === 'llamar') {
      if (telefono) r.contactPhone = telefono;
      // "llamar a Luis", "llamada con Germán Muñoz", "marcarle a Ana"
      const m = String(texto).match(/(?:llamar(?:le)?|llamada|marcar(?:le)?|telefonear(?:le)?|hablarle)\s+(?:a|con|al)\s+(.+)$/i);
      if (m) {
        const nombre = m[1].replace(/\b(por|para|sobre|de|del|que)\b.*$/i, '').trim();
        if (nombre && nombre.length <= 40) r.contactName = nombre.replace(/[.,;]+$/, '');
      }
    }
    return r;
  }

  // A dónde lleva la acción. null si falta el dato (por ejemplo, llamar sin teléfono).
  function destino(p) {
    if (!p || !p.actionType) return null;
    switch (p.actionType) {
      case 'llamar': {
        const tel = limpiarTelefono(p.contactPhone);
        return tel ? 'tel:' + tel : null;
      }
      case 'pago': case 'reunion': case 'enlace':
        return limpiarUrl(p.url);
      case 'ubicacion': {
        const l = String(p.location || '').trim();
        if (!l) return null;
        const u = limpiarUrl(l);
        if (u) return u;
        return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(l);
      }
      default: return null;
    }
  }

  // Normaliza los campos de acción antes de guardar (y quita lo que no corresponde).
  function normalizar(p) {
    const tipo = TIPOS[p.actionType] ? p.actionType : null;
    const r = { actionType: tipo, actionValue: null, contactName: null, contactPhone: null, url: null, location: null };
    if (tipo === 'llamar') {
      r.contactName = (p.contactName || '').trim().slice(0, 60) || null;
      r.contactPhone = limpiarTelefono(p.contactPhone);
    } else if (tipo === 'ubicacion') {
      r.location = (p.location || '').trim().slice(0, 300) || null;
    } else if (tipo) {
      r.url = limpiarUrl(p.url);
    }
    r.actionValue = destino({ ...r });
    return r;
  }

  // Botones de la notificación. Android muestra máximo 2: la acción principal y posponer.
  function botonesNotificacion(p, maximo = 2, posponerMin = 10) {
    const lista = [];
    if (destino(p)) lista.push({ action: 'abrir', title: TIPOS[p.actionType].boton });
    lista.push({ action: 'posponer', title: `Posponer ${posponerMin} min` });
    lista.push({ action: 'hecho', title: 'Hecho' });
    return lista.slice(0, Math.max(1, maximo || 2));
  }

  function cuerpoNotificacion(p) {
    if (destino(p) && p.actionType === 'llamar') return p.contactName ? `Es hora de llamar a ${p.contactName}.` : 'Es hora de tu llamada.';
    if (destino(p) && p.actionType === 'pago') return 'Toca "Abrir pago" para ir directo.';
    if (destino(p) && p.actionType === 'reunion') return 'Tu reunión está por empezar.';
    if (destino(p) && p.actionType === 'ubicacion') return 'Toca "Cómo llegar" para ver la ruta.';
    return null;
  }

  const api = { extraerLugar, TIPOS, extraer, sugerir, destino, normalizar, limpiarUrl, limpiarTelefono, botonesNotificacion, cuerpoNotificacion };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.acciones = api;
})(typeof self !== 'undefined' ? self : this);
