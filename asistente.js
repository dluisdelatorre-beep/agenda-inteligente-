// "Tu asistente": lee los pendientes reales y arma el resumen, la recomendación y la propuesta del día.
// - Sin IA ni servicios externos: reglas claras sobre fecha, hora, estado, prioridad y acción.
// - Nunca cambia nada por su cuenta: solo propone; la persona decide.
// - Si un pendiente no tiene categoría o prioridad (versiones anteriores), cuenta como prioridad normal.
// Funciona en la página y en Node (pruebas).
(function (raiz) {
  const A = raiz.acciones || (typeof require !== 'undefined' ? require('./acciones.js') : null);

  const dia0 = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const mismoDia = (a, b) => dia0(a).getTime() === dia0(b).getTime();
  const prio = (p) => (p.priority === 'alta' || p.priority === 'baja' ? p.priority : 'normal');
  const hora = (d) => d.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });
  const minuscula = (s) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);
  const punto = (t) => (t.endsWith('.') ? t : t + '.'); // evita "p.m.."
  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

  // Vencido: con hora, ya pasó la hora; sin hora, ya pasó el día.
  function vencido(p, ahora) {
    if (p.hecho || !p.cuando) return false;
    const c = new Date(p.cuando);
    return p.conHora ? c < ahora : dia0(c) < dia0(ahora);
  }

  // "a las 6:30 p.m." / "ayer a las 6:30 p.m." / "el lunes 5" …
  function cuandoTexto(p, ahora) {
    if (!p.cuando) return '';
    const c = new Date(p.cuando);
    const ayer = new Date(dia0(ahora)); ayer.setDate(ayer.getDate() - 1);
    const manana = new Date(dia0(ahora)); manana.setDate(manana.getDate() + 1);
    const h = p.conHora ? ` a las ${hora(c)}` : '';
    if (mismoDia(c, ahora)) return p.conHora ? `a las ${hora(c)}` : 'hoy';
    if (mismoDia(c, ayer)) return 'ayer' + h;
    if (mismoDia(c, manana)) return 'mañana' + h;
    return 'el ' + c.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }) + h;
  }

  const porHora = (a, b) => {
    if (!a.cuando && !b.cuando) return 0;
    if (!a.cuando) return 1;
    if (!b.cuando) return -1;
    return new Date(a.cuando) - new Date(b.cuando);
  };

  function analizar(lista, ahora = new Date()) {
    const todos = Array.isArray(lista) ? lista : [];
    const abiertos = todos.filter((p) => !p.hecho);
    const deHoy = todos.filter((p) => p.cuando && mismoDia(new Date(p.cuando), ahora));
    const vencidos = abiertos.filter((p) => vencido(p, ahora))
      .sort((a, b) => (prio(a) === 'alta' ? 0 : 1) - (prio(b) === 'alta' ? 0 : 1) || porHora(a, b));
    const esVencido = new Set(vencidos.map((p) => p.id));

    const hoy = {
      total: deHoy.length,
      hechos: deHoy.filter((p) => p.hecho).length,
      pendientes: deHoy.filter((p) => !p.hecho).length,
      vencidos: vencidos.length,
    };
    const proximo = abiertos.filter((p) => p.cuando && p.conHora && new Date(p.cuando) >= ahora).sort(porHora)[0] || null;

    // Lo que toca atender hoy: vencidos, lo de hoy y lo que no tiene fecha
    const delDia = abiertos.filter((p) => esVencido.has(p.id) || !p.cuando || mismoDia(new Date(p.cuando), ahora));
    const nivel = (p) => {
      if (esVencido.has(p.id)) return 0;                                   // 1) vencidos
      if (prio(p) === 'alta') return 1;                                    // 2) prioridad alta
      if (p.cuando && p.conHora && prio(p) !== 'baja') return 2;           // 3) hora más próxima
      if (prio(p) === 'normal') return 3;                                  // 4) prioridad media
      return 4;                                                            // 5) resto del día
    };
    const ordenados = delDia.slice().sort((a, b) => nivel(a) - nivel(b) || (nivel(a) === 0 ? 0 : porHora(a, b)));
    // Dentro de los vencidos se respeta el orden de "vencidos" (alta primero, luego el más antiguo)
    const enOrden = [...vencidos, ...ordenados.filter((p) => !esVencido.has(p.id))];

    let primero = null;
    if (enOrden.length) {
      const p = enOrden[0];
      const n = nivel(p);
      const cuando = cuandoTexto(p, ahora);
      const motivo = n === 0 ? punto(`Era para ${cuando === 'hoy' ? 'hoy' : cuando.replace(/^a las/, 'las')}`)
        : n === 1 ? punto(`Es prioridad alta${cuando ? ', ' + cuando : ''}`)
        : n === 2 ? punto(`Es lo más próximo: ${cuando}`)
        : p.cuando ? 'Lo tienes para hoy.' : 'No tiene fecha, pero sigue pendiente.';
      primero = { p, nivel: n, motivo, texto: `Primero: ${minuscula(p.texto)}. ${motivo}` };
    }

    // Próxima acción ejecutable (llamar, pago, reunión, ubicación, enlace)
    const conAccion = abiertos.filter((p) => A && A.destino(p));
    const proximaAccion = conAccion.sort((a, b) =>
      (esVencido.has(b.id) - esVencido.has(a.id)) || porHora(a, b))[0] || null;

    // Propuesta para reorganizar (no cambia ninguna hora)
    const plan = { vencidos: [], urgente: [], proximos: [], despues: [] };
    for (const p of enOrden) {
      const n = nivel(p);
      if (n === 0) plan.vencidos.push(p);
      else if (n === 1) plan.urgente.push(p);
      else if (n === 2) plan.proximos.push(p);
      else plan.despues.push(p);
    }

    return { hoy, vencidos, proximo, primero, proximaAccion, plan, abiertos: abiertos.length, frase: frase(hoy, vencidos, proximo, abiertos, ahora) };
  }

  function frase(hoy, vencidos, proximo, abiertos, ahora) {
    const sigHoy = proximo && mismoDia(new Date(proximo.cuando), ahora) ? proximo : null;
    const siguiente = sigHoy ? ' ' + punto(`El siguiente es ${minuscula(sigHoy.texto)} a las ${hora(new Date(sigHoy.cuando))}`) : '';
    if (vencidos.length) {
      const t = hoy.pendientes
        ? `Te ${hoy.pendientes === 1 ? 'queda' : 'quedan'} ${plural(hoy.pendientes, 'pendiente', 'pendientes')} y ${vencidos.length === 1 ? 'uno ya pasó' : vencidos.length + ' ya pasaron'} de su hora.`
        : `Tienes ${plural(vencidos.length, 'pendiente atrasado', 'pendientes atrasados')}.`;
      return t + siguiente;
    }
    if (hoy.pendientes >= 2) return `Tienes ${hoy.pendientes} pendientes hoy.` + siguiente;
    if (hoy.pendientes === 1) {
      const p = abiertos.find((x) => x.cuando && mismoDia(new Date(x.cuando), ahora));
      const h = new Date(p.cuando).getHours();
      const momento = !p.conHora ? 'hoy' : h < 12 ? 'esta mañana' : h < 19 ? 'esta tarde' : 'esta noche';
      const que = A && A.destino(p) && { llamar: 'una llamada', pago: 'un pago', reunion: 'una reunión', ubicacion: 'una cita', enlace: 'un pendiente' }[p.actionType];
      return que
        ? `Tu día está tranquilo. Tienes ${que} pendiente ${momento}.`
        : punto(`Tu día está tranquilo. Solo te queda ${minuscula(p.texto)} ${cuandoTexto(p, ahora)}`);
    }
    if (hoy.total) return `¡Bien! Ya completaste ${plural(hoy.hechos, 'pendiente', 'pendientes')} de hoy.`;
    if (proximo) return punto(`Tu día está tranquilo. Lo siguiente es ${minuscula(proximo.texto)} ${cuandoTexto(proximo, ahora)}`);
    return abiertos.length ? `Tu día está tranquilo. Tienes ${plural(abiertos.length, 'pendiente', 'pendientes')} sin fecha.` : 'Tu día está tranquilo. No tienes pendientes.';
  }

  // "Mañana": misma hora del pendiente (o 9:00 a.m. si no tenía hora)
  function mananaDe(p, ahora = new Date()) {
    const d = new Date(dia0(ahora)); d.setDate(d.getDate() + 1);
    if (p && p.cuando && p.conHora) { const c = new Date(p.cuando); d.setHours(c.getHours(), c.getMinutes(), 0, 0); }
    else d.setHours(9, 0, 0, 0);
    return d;
  }

  // ¿La asistente tiene algo útil que decir? (para el halo del avatar)
  // alert: hay algo vencido. attention: prioridad Alta de hoy/sin fecha, un recordatorio en los próximos
  // 15 min o una llamada/pago/reunión/cita en la próxima hora. Devuelve también los ids, para avisar
  // solo cuando aparece algo nuevo.
  function atencion(lista, ahora = new Date()) {
    const abiertos = (Array.isArray(lista) ? lista : []).filter((p) => !p.hecho);
    const ids = new Set();
    let alerta = false;
    for (const p of abiertos) {
      const c = p.cuando ? new Date(p.cuando) : null;
      const falta = c ? c - ahora : null;
      if (vencido(p, ahora)) { ids.add(p.id); alerta = true; continue; }
      if (prio(p) === 'alta' && (!c || mismoDia(c, ahora))) { ids.add(p.id); continue; }
      if (c && p.conHora && falta >= 0 && falta <= 15 * 60000) { ids.add(p.id); continue; }
      if (c && p.conHora && falta >= 0 && falta <= 60 * 60000 && A && A.destino(p)) ids.add(p.id);
    }
    return { estado: alerta ? 'alert' : ids.size ? 'attention' : 'idle', ids: [...ids].sort() };
  }

  const api = { analizar, vencido, cuandoTexto, mananaDe, atencion };
  raiz.asistente = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : globalThis);
