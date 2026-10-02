// Intérprete de frases en español: "mañana a las 5 llamar a Germán" -> { texto, fecha }
// Funciona en navegador (window.interpretar) y en Node (module.exports) para las pruebas.
(function (raiz) {
  const DIAS = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 };
  const MESES = { enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5, julio: 6, agosto: 7,
    septiembre: 8, setiembre: 8, octubre: 9, noviembre: 10, diciembre: 11 };
  const NUMEROS = { una: 1, un: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7,
    ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, media: 0.5 };

  const sinAcentos = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const num = (s) => (s in NUMEROS ? NUMEROS[s] : parseFloat(s));

  function interpretar(frase, ahora = new Date()) {
    const original = frase.trim();
    let t = ' ' + sinAcentos(original.toLowerCase()) + ' ';
    let fecha = null;      // día detectado (Date a medianoche)
    let hora = null;       // { h, m }
    let relativo = null;   // minutos desde ahora
    const quitar = (re) => { t = t.replace(re, ' '); };

    // 1) Relativo: "en 2 horas", "en 30 minutos", "en media hora"
    let m = t.match(/\ben (\d+|una|un|media|dos|tres|cuatro|cinco|diez) (horas?|hrs?|minutos?|mins?)\b/);
    if (m) {
      const n = num(m[1]);
      relativo = /^h/.test(m[2]) ? n * 60 : n;
      quitar(m[0]);
    }

    // 2) Franja del día primero, para no confundir "de la mañana" con el día "mañana"
    let franja = null;
    if ((m = t.match(/\b(?:de|en|por) la (manana|tarde|noche)\b/))) { franja = m[1]; quitar(m[0]); }

    // 3) Día
    const base = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
    const masDias = (d) => new Date(base.getFullYear(), base.getMonth(), base.getDate() + d);
    if ((m = t.match(/\bpasado manana\b/))) { fecha = masDias(2); quitar(m[0]); }
    else if ((m = t.match(/\bmanana\b/))) { fecha = masDias(1); quitar(m[0]); }
    else if ((m = t.match(/\bhoy\b/))) { fecha = masDias(0); quitar(m[0]); }

    if (!fecha && (m = t.match(/\b(?:el )?(\d{1,2}) de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/))) {
      let f = new Date(base.getFullYear(), MESES[m[2]], parseInt(m[1]));
      if (f < base) f = new Date(base.getFullYear() + 1, MESES[m[2]], parseInt(m[1]));
      fecha = f; quitar(m[0]);
    }
    if (!fecha && (m = t.match(/\b(?:el )?(?:proximo |este )?(domingo|lunes|martes|miercoles|jueves|viernes|sabado)\b/))) {
      let d = (DIAS[m[1]] - base.getDay() + 7) % 7;
      if (d === 0) d = 7; // "el lunes" dicho en lunes = el siguiente
      fecha = masDias(d); quitar(m[0]);
    }
    if (!fecha && (m = t.match(/\bel (\d{1,2})\b(?! ?(?:am|pm|:|hrs|horas))/))) {
      let f = new Date(base.getFullYear(), base.getMonth(), parseInt(m[1]));
      if (f < base) f = new Date(base.getFullYear(), base.getMonth() + 1, parseInt(m[1]));
      fecha = f; quitar(m[0]);
    }

    // 4) Hora: "a las 5", "a las 5:30 pm", "17:30", "5pm", "al mediodia"
    if ((m = t.match(/\b(?:al )?mediodia\b/))) { hora = { h: 12, m: 0 }; quitar(m[0]); }
    if (!hora && (m = t.match(/\b(?:a las?|a la|para las?) (\d{1,2})(?::(\d{2}))?(?: ?(am|pm|hrs|horas|h))?(?: y media)?\b/))) {
      hora = { h: parseInt(m[1]), m: m[2] ? parseInt(m[2]) : (/ y media/.test(m[0]) ? 30 : 0), sufijo: m[3] };
      quitar(m[0]);
    }
    if (!hora && (m = t.match(/\b(\d{1,2}):(\d{2})(?: ?(am|pm|hrs))?\b/))) { hora = { h: +m[1], m: +m[2], sufijo: m[3] }; quitar(m[0]); }
    if (!hora && (m = t.match(/\b(\d{1,2}) ?(am|pm)\b/))) { hora = { h: +m[1], m: 0, sufijo: m[2] }; quitar(m[0]); }

    if (hora) {
      if (hora.sufijo === 'pm' && hora.h < 12) hora.h += 12;
      else if (hora.sufijo === 'am' && hora.h === 12) hora.h = 0;
      else if (!hora.sufijo || /^h/.test(hora.sufijo)) {
        if ((franja === 'tarde' || franja === 'noche') && hora.h < 12) hora.h += 12;
        // Sin franja: de 1 a 7 casi siempre es tarde ("a las 5" = 17:00)
        else if (!franja && hora.h >= 1 && hora.h <= 7) hora.h += 12;
      }
    } else if (franja) {
      hora = { h: franja === 'manana' ? 9 : franja === 'tarde' ? 16 : 20, m: 0 };
    }

    // 4) Armar la fecha final
    let cuando = null;
    if (relativo !== null) cuando = new Date(ahora.getTime() + relativo * 60000);
    else if (fecha || hora) {
      const d = fecha || masDias(0);
      cuando = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hora ? hora.h : 9, hora ? hora.m : 0);
      // Si sólo dijo la hora y ya pasó hoy, es mañana
      if (!fecha && cuando <= ahora) cuando = new Date(cuando.getTime() + 864e5);
    }

    // 5) Limpiar el texto de la tarea
    let texto = t.replace(/\b(recuerdame|recordarme|recordar|que tengo que|tengo que|hay que|acuerdate de)\b/g, ' ')
      .replace(/\s+/g, ' ').trim().replace(/^(a |de |que |para )/, '');
    texto = recuperarAcentos(texto, original) || original;
    texto = texto.charAt(0).toUpperCase() + texto.slice(1);

    return { texto, cuando, conHora: !!(hora || relativo !== null) };
  }

  // Devuelve las palabras con sus acentos originales cuando se pueden encontrar en la frase.
  function recuperarAcentos(limpio, original) {
    const palabras = original.split(/\s+/);
    return limpio.split(' ').map((p) => {
      const hallada = palabras.find((o) => sinAcentos(o.toLowerCase()).replace(/[^\w]/g, '') === p.replace(/[^\w]/g, ''));
      return hallada ? hallada.replace(/[.,;]+$/, '') : p;
    }).join(' ');
  }

  if (typeof module !== 'undefined') module.exports = { interpretar };
  else raiz.interpretar = interpretar;
})(typeof window !== 'undefined' ? window : globalThis);
