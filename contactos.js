// Contactos de la Agenda: libreta privada que vive solo en este teléfono (IndexedDB, misma base que los pendientes).
// Nunca se manda al servidor. Este archivo es pura lógica (sin pantalla) y funciona en la página y en Node (pruebas).
//
// Modelo (preparado para crecer; user_id queda listo por si algún día hay cuentas):
//   { id, user_id, nombre, apellidos, telefono, whatsapp, email, empresa, puesto, cumpleanos ('AAAA-MM-DD' o '--MM-DD'),
//     notas, etiquetas: [], favorito, recordarCumple, avisoCumple ('dia' | 'antes'), created_at, updated_at }
(function (raiz) {
  const sinAcentos = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const nuevoId = () => 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const texto = (v, max = 200) => (v == null ? '' : String(v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max));

  function limpiarTel(t) {
    if (!t) return '';
    const s = String(t).trim();
    const mas = s.startsWith('+') ? '+' : '';
    const d = s.replace(/\D/g, '');
    if (d.length < 7 || d.length > 15) return '';
    return mas + d;
  }
  const ultimos10 = (t) => String(t || '').replace(/\D/g, '').slice(-10);

  function limpiarEmail(e) {
    const s = texto(e, 120).toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : '';
  }

  // Cumpleaños: acepta AAAA-MM-DD, DD/MM/AAAA, DD/MM, --MMDD, AAAAMMDD (vCard), MM-DD
  function limpiarCumple(v) {
    if (!v) return '';
    const s = String(v).trim();
    let a = null, m, d, r;
    if ((r = s.match(/^(\d{4})-?(\d{2})-?(\d{2})/))) [, a, m, d] = r;
    else if ((r = s.match(/^--(\d{2})-?(\d{2})$/))) [, m, d] = r;
    else if ((r = s.match(/^(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?$/))) { [, d, m, a] = r; if (a && a.length === 2) a = (+a > 30 ? '19' : '20') + a; }
    else return '';
    m = +m; d = +d;
    if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return '';
    const mm = String(m).padStart(2, '0'), dd = String(d).padStart(2, '0');
    return a ? `${a}-${mm}-${dd}` : `--${mm}-${dd}`;
  }

  function etiquetasDe(v) {
    const lista = Array.isArray(v) ? v : String(v || '').split(/[,;|]/);
    const vistos = new Set();
    return lista.map((e) => texto(e, 30).replace(/^#/, '')).filter((e) => e && !vistos.has(e.toLowerCase()) && vistos.add(e.toLowerCase())).slice(0, 12);
  }

  function normalizar(c, ahora = new Date()) {
    const x = c || {};
    const r = {
      id: x.id || nuevoId(),
      user_id: x.user_id || 'local',
      nombre: texto(x.nombre, 60),
      apellidos: texto(x.apellidos, 80),
      telefono: limpiarTel(x.telefono),
      whatsapp: limpiarTel(x.whatsapp),
      email: limpiarEmail(x.email),
      empresa: texto(x.empresa, 80),
      puesto: texto(x.puesto, 80),
      cumpleanos: limpiarCumple(x.cumpleanos),
      notas: texto(x.notas, 2000),
      etiquetas: etiquetasDe(x.etiquetas),
      favorito: !!x.favorito,
      recordarCumple: !!x.recordarCumple,
      avisoCumple: x.avisoCumple === 'antes' ? 'antes' : 'dia',
      created_at: x.created_at || ahora.toISOString(),
      updated_at: ahora.toISOString(),
    };
    if (!r.nombre && r.apellidos) { r.nombre = r.apellidos; r.apellidos = ''; }
    if (!r.cumpleanos) r.recordarCumple = false;
    return r;
  }
  const valido = (c) => !!(c && (c.nombre || c.apellidos));
  const nombreCompleto = (c) => [c.nombre, c.apellidos].filter(Boolean).join(' ');
  const iniciales = (c) => (nombreCompleto(c).split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('') || '?').toUpperCase();

  function ordenar(lista) {
    return lista.slice().sort((a, b) => (b.favorito - a.favorito) || sinAcentos(nombreCompleto(a)).localeCompare(sinAcentos(nombreCompleto(b))));
  }

  // Buscar por nombre, apellidos, teléfono, WhatsApp, correo, empresa, puesto o etiqueta (sin acentos ni mayúsculas)
  function buscar(lista, consulta) {
    const palabras = sinAcentos(consulta).split(/\s+/).filter(Boolean);
    if (!palabras.length) return ordenar(lista);
    return ordenar(lista.filter((c) => {
      const pajar = sinAcentos([c.nombre, c.apellidos, c.email, c.empresa, c.puesto, ...(c.etiquetas || [])].join(' '));
      const nums = [c.telefono, c.whatsapp].join(' ').replace(/\D/g, ' ');
      return palabras.every((w) => pajar.includes(w) || (/\d{3,}/.test(w) && nums.replace(/\s/g, '').includes(w.replace(/\D/g, ''))) || nums.includes(w));
    }));
  }

  // Enlaces estándar del teléfono (la persona confirma: nada se manda ni se llama solo)
  function enlaces(c) {
    if (!c) return {};
    const r = {};
    if (c.telefono) r.llamar = 'tel:' + c.telefono;
    const w = c.whatsapp || c.telefono;
    if (w) {
      let d = w.replace(/\D/g, '');
      if (!w.startsWith('+') && d.length === 10) d = '52' + d; // número de México sin lada de país
      r.whatsapp = 'https://wa.me/' + d;
    }
    if (c.email) r.correo = 'mailto:' + c.email;
    return r;
  }

  // ---- Duplicados: mismo teléfono (últimos 10 dígitos) o mismo correo ----
  function duplicados(nuevo, lista) {
    const tels = [nuevo.telefono, nuevo.whatsapp].map(ultimos10).filter((t) => t.length >= 7);
    const mail = nuevo.email;
    return lista.filter((c) => c.id !== nuevo.id && (
      (mail && c.email === mail) ||
      [c.telefono, c.whatsapp].map(ultimos10).some((t) => t.length >= 7 && tels.includes(t))));
  }

  // Combinar: conserva lo que ya hay y completa lo que falte con el nuevo
  function combinar(base, nuevo, ahora = new Date()) {
    const r = { ...base };
    for (const k of ['nombre', 'apellidos', 'telefono', 'whatsapp', 'email', 'empresa', 'puesto', 'cumpleanos']) if (!r[k] && nuevo[k]) r[k] = nuevo[k];
    if (nuevo.notas && !String(r.notas || '').includes(nuevo.notas)) r.notas = [r.notas, nuevo.notas].filter(Boolean).join('\n');
    r.etiquetas = etiquetasDe([...(r.etiquetas || []), ...(nuevo.etiquetas || [])]);
    r.favorito = !!(r.favorito || nuevo.favorito);
    return normalizar(r, ahora);
  }

  // ---- Importar: vCard (.vcf) ----
  function parseVCF(txt) {
    const lineas = String(txt || '').replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n'); // une líneas dobladas
    const salida = [];
    let actual = null;
    for (const linea of lineas) {
      if (/^BEGIN:VCARD/i.test(linea)) { actual = { etiquetas: [] }; continue; }
      if (/^END:VCARD/i.test(linea)) { if (actual) salida.push(actual); actual = null; continue; }
      if (!actual) continue;
      const i = linea.indexOf(':');
      if (i < 0) continue;
      const clave = linea.slice(0, i).replace(/^item\d+\./i, '').split(';')[0].toUpperCase();
      const valor = linea.slice(i + 1).replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\n/gi, '\n').trim();
      if (clave === 'N') {
        const [ap, nom] = valor.split(';');
        if (nom && !actual._nombre) actual._nombre = nom.trim();
        if (ap && !actual._apellidos) actual._apellidos = ap.trim();
      } else if (clave === 'FN') actual._fn = valor;
      else if (clave === 'TEL') { if (!actual.telefono) actual.telefono = valor; else if (!actual.whatsapp && /cell|mobile|celular|whatsapp/i.test(linea)) actual.whatsapp = valor; }
      else if (clave === 'EMAIL' && !actual.email) actual.email = valor;
      else if (clave === 'ORG' && !actual.empresa) actual.empresa = valor.split(';')[0];
      else if (clave === 'TITLE' && !actual.puesto) actual.puesto = valor;
      else if (clave === 'BDAY') actual.cumpleanos = valor;
      else if (clave === 'NOTE') actual.notas = valor;
      else if (clave === 'CATEGORIES') actual.etiquetas = valor.split(',');
    }
    return salida.map((c) => {
      let nombre = c._nombre, apellidos = c._apellidos;
      if (!nombre && c._fn) { const p = c._fn.split(/\s+/); nombre = p.shift(); apellidos = p.join(' '); }
      return { nombre: nombre || '', apellidos: apellidos || '', telefono: c.telefono, whatsapp: c.whatsapp, email: c.email,
        empresa: c.empresa, puesto: c.puesto, cumpleanos: c.cumpleanos, notas: c.notas, etiquetas: c.etiquetas };
    }).filter((c) => c.nombre || c.apellidos);
  }

  // ---- Importar: CSV (Google, Outlook o columnas en español) ----
  function filasCSV(txt) {
    const s = String(txt || '').replace(/^﻿/, '');
    const sep = (s.split('\n')[0].match(/;/g) || []).length > (s.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
    const filas = []; let fila = [], campo = '', comillas = false;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (comillas) {
        if (ch === '"' && s[i + 1] === '"') { campo += '"'; i++; } else if (ch === '"') comillas = false; else campo += ch;
      } else if (ch === '"') comillas = true;
      else if (ch === sep) { fila.push(campo); campo = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && s[i + 1] === '\n') i++; fila.push(campo); filas.push(fila); fila = []; campo = ''; }
      else campo += ch;
    }
    if (campo || fila.length) { fila.push(campo); filas.push(fila); }
    return filas.filter((f) => f.some((c) => c.trim()));
  }
  const COLUMNAS = [
    ['nombre', /^(first name|given name|nombre|nombres|name)$/],
    ['apellidos', /^(last name|family name|apellidos?|surname)$/],
    ['completo', /^(display name|full name|nombre completo|contacto)$/],
    ['telefono', /(phone 1 - value|mobile phone|telefono|tel|celular|phone|movil)/],
    ['whatsapp', /whatsapp/],
    ['email', /(e-mail 1 - value|e-mail address|email|correo)/],
    ['empresa', /(organization name|organization 1 - name|company|empresa|organizacion)/],
    ['puesto', /(organization title|organization 1 - title|job title|puesto|cargo)/],
    ['cumpleanos', /(birthday|cumpleanos|nacimiento)/],
    ['notas', /^(notes|notas|nota)$/],
    ['etiquetas', /(labels|group membership|categories|etiquetas|grupos)/],
  ];
  function parseCSV(txt) {
    const filas = filasCSV(txt);
    if (filas.length < 2) return [];
    const cab = filas[0].map((h) => sinAcentos(h).replace(/\s+/g, ' '));
    const mapa = {};
    cab.forEach((h, i) => { for (const [k, re] of COLUMNAS) if (re.test(h) && mapa[k] === undefined) { mapa[k] = i; break; } });
    return filas.slice(1).map((f) => {
      const v = (k) => (mapa[k] === undefined ? '' : (f[mapa[k]] || '').trim());
      let nombre = v('nombre'), apellidos = v('apellidos');
      if (!nombre && v('completo')) { const p = v('completo').split(/\s+/); nombre = p.shift(); apellidos = apellidos || p.join(' '); }
      return { nombre, apellidos, telefono: v('telefono'), whatsapp: v('whatsapp'), email: v('email'), empresa: v('empresa'),
        puesto: v('puesto'), cumpleanos: v('cumpleanos'), notas: v('notas'), etiquetas: v('etiquetas').replace(/\*\s*myContacts/gi, '').split(/:::|[,;]/) };
    }).filter((c) => c.nombre || c.apellidos);
  }

  // ---- Reconocer a la persona dentro de una frase ----
  // "Recuérdame llamar a Luis mañana a las 10" → "Luis"; "Tengo reunión con Carlos el viernes" → "Carlos";
  // "felicitar a Ana en su cumpleaños" → "Ana"
  const CORTE = /\s+(?:mañana|manana|hoy|pasado|el|la|los|las|este|esta|en|a las|al|para|por|sobre|que|y|de|del|desde|hasta|lunes|martes|miercoles|miércoles|jueves|viernes|sabado|sábado|domingo|\d).*$/i;
  function detectarPersona(frase) {
    const t = ' ' + String(frase || '') + ' ';
    const m = t.match(/\b(?:llamar(?:le)?|marcar(?:le)?|hablar(?:le)?|escribir(?:le)?|mandar(?:le)?(?: un)? (?:mensaje|whatsapp|correo)|whatsapp|felicitar|visitar|ver|saludar|avisar(?:le)?|recoger|cobrar(?:le)?|pagar(?:le)?|enviar(?:le)?|reuni[oó]n|junta|cita|comer|comida|cenar|cena|desayunar|desayuno|almuerzo|caf[eé]|platicar|pl[aá]tica|llamada|videollamada|entrevista)\s+(?:a|con|al)\s+([A-Za-zÁÉÍÓÚÑáéíóúñü][\wÁÉÍÓÚÑáéíóúñü.'-]*(?:\s+[A-Za-zÁÉÍÓÚÑáéíóúñü][\wÁÉÍÓÚÑáéíóúñü.'-]*){0,3})/i);
    if (!m) return '';
    let nombre = m[1].replace(CORTE, '').replace(/[.,;:!?]+$/, '').trim();
    if (/^(mi|su|tu|el|la|los|las|un|una)$/i.test(nombre.split(/\s+/)[0])) return ''; // "llamar a mi mamá": no es un nombre propio
    detectarPersona.crudo = m[1].replace(/[.,;:!?]+$/, '').trim(); // por si el nombre completo incluye "de la"
    return nombre.split(/\s+/).slice(0, 3).join(' ');
  }

  // Coincidencias para un nombre: todas las palabras deben aparecer al inicio de alguna palabra del nombre completo
  function coincidencias(nombre, lista) {
    const pals = sinAcentos(nombre).split(/\s+/).filter(Boolean);
    if (!pals.length) return [];
    return ordenar(lista.filter((c) => {
      const pal = sinAcentos(nombreCompleto(c)).split(/\s+/);
      return pals.every((p) => pal.some((x) => x === p || (p.length >= 3 && x.startsWith(p))));
    }));
  }
  function resolver(frase, lista) {
    const nombre = detectarPersona(frase);
    if (!nombre) return { nombre, candidatos: [] };
    // Primero el nombre más largo posible ("Luis de la Torre"); si no hay, el corto ("Luis")
    const crudo = (detectarPersona.crudo || '').split(/\s+/);
    for (let n = Math.min(crudo.length, 4); n > nombre.split(/\s+/).length; n--) {
      const largo = crudo.slice(0, n).join(' ');
      const r = coincidencias(largo, lista).filter((c) => sinAcentos(nombreCompleto(c)).startsWith(sinAcentos(largo)));
      if (r.length) return { nombre: largo, candidatos: r };
    }
    return { nombre, candidatos: coincidencias(nombre, lista) };
  }

  // Próximo cumpleaños (fecha del aviso: el día, o un día antes) a las 9:00
  function proximoCumple(c, ahora = new Date()) {
    if (!c || !c.cumpleanos) return null;
    const [mm, dd] = c.cumpleanos.slice(-5).split('-').map(Number);
    for (const anio of [ahora.getFullYear(), ahora.getFullYear() + 1]) {
      const d = new Date(anio, mm - 1, dd, 9, 0, 0, 0);
      if (d.getMonth() !== mm - 1) continue; // 29 de febrero en año no bisiesto
      if (c.avisoCumple === 'antes') d.setDate(d.getDate() - 1);
      if (d > ahora) return d;
    }
    return null;
  }

  const api = { normalizar, valido, nombreCompleto, iniciales, ordenar, buscar, enlaces, duplicados, combinar,
    parseVCF, parseCSV, detectarPersona, coincidencias, resolver, proximoCumple, limpiarCumple, limpiarTel };
  raiz.contactos = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : globalThis);
