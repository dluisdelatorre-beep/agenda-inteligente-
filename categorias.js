// Categorías y prioridades de los pendientes.
// - La app sugiere ambas a partir de la frase; la persona siempre las puede cambiar.
// - Nunca impiden guardar: si no se reconoce nada, queda "sin categoría" y prioridad normal.
// Funciona en la página, en el service worker y en Node (pruebas).
(function (raiz) {
  const CATEGORIAS = {
    trabajo: { etiqueta: 'Trabajo', icono: '💼' },
    personal: { etiqueta: 'Personal', icono: '🙂' },
    salud: { etiqueta: 'Salud', icono: '🩺' },
    pagos: { etiqueta: 'Pagos', icono: '💳' },
    casa: { etiqueta: 'Casa', icono: '🏠' },
    otros: { etiqueta: 'Otros', icono: '📌' },
  };
  const PRIORIDADES = {
    alta: { etiqueta: 'Alta', icono: '🔴' },
    normal: { etiqueta: 'Normal', icono: '⚪' },
    baja: { etiqueta: 'Baja', icono: '🔵' },
  };

  const sinAcentos = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  // Palabras que delatan la categoría (sin acentos). El orden importa: gana la primera que aparezca.
  const PISTAS = [
    ['pagos', /\b(pag(ar|o|a|os)|factura|recibo|renta|luz|cfe|agua|internet|telmex|izzi|totalplay|tarjeta|banco|transferi\w*|deposit\w*|predial|colegiatura|mensualidad|tenencia|cobrar|abono|credito|prestamo|hipoteca|seguro)\b/],
    ['salud', /\b(doctor\w*|medic[oa]s?|dentista|cita medica|pastillas?|medicinas?|medicamento|hospital|clinica|farmacia|vacunas?|analisis|laboratorio|terapia|psicolog\w*|gym|gimnasio|ejercicio|correr|nutriolog\w*|consulta)\b/],
    ['trabajo', /\b(junta|reunion|cliente\w*|oficina|reporte|informe|presentacion|proyecto|correo|email|mail|entregar|propuesta|cotizacion|jefe|trabajo|chamba|contrato|factura(r|cion)|llamada de trabajo|zoom|meet|teams|demo|deploy|sprint)\b/],
    ['casa', /\b(comprar|super|supermercado|despensa|mandado|limpiar|lavar|ropa|cocinar|basura|plantas|regar|mascota|perro|gato|veterinari\w*|reparar|plomero|electricista|gas|pan|leche|tortillas|casa|depa)\b/],
    ['personal', /\b(cumple\w*|mama|papa|familia|herman[oa]s?|amig[oa]s?|novi[oa]|espos[oa]|hij[oa]s?|fiesta|cine|cena|comida con|regalo|escuela|tarea|leer|estudiar|curso|viaje|vacaciones|boda)\b/],
  ];

  // Sugerir categoría por el texto (y por la acción detectada, si hay)
  function sugerirCategoria(texto, actionType) {
    if (actionType === 'pago') return 'pagos';
    const t = sinAcentos(texto);
    for (const [cat, re] of PISTAS) if (re.test(t)) return cat;
    if (actionType === 'reunion') return 'trabajo';
    return null;
  }

  // Palabras de prioridad dentro de la frase: se reconocen y se quitan del texto.
  const MARCAS = [
    ['alta', /(^|[\s,.;:!¡-])(es\s+)?(muy\s+)?(urgente|urge|importante|prioridad\s+alta|alta\s+prioridad|prioritario|sin\s+falta)(?=$|[\s,.;:!])/i],
    ['baja', /(^|[\s,.;:!¡-])(prioridad\s+baja|baja\s+prioridad|sin\s+prisa|cuando\s+(pueda|puedas)|no\s+urge)(?=$|[\s,.;:!])/i],
  ];

  function extraerPrioridad(frase) {
    let resto = String(frase || '');
    for (const [prio, re] of MARCAS) {
      if (re.test(resto)) {
        resto = resto.replace(re, ' ').replace(/\s{2,}/g, ' ').replace(/^[\s,.;:!-]+|[\s,;:-]+$/g, '').trim();
        return { resto: resto || String(frase).trim(), priority: prio };
      }
    }
    return { resto: resto.trim(), priority: 'normal' };
  }

  const limpiarCategoria = (c) => (c && CATEGORIAS[c] ? c : null);
  const limpiarPrioridad = (p) => (p && PRIORIDADES[p] ? p : 'normal');

  raiz.categorias = { CATEGORIAS, PRIORIDADES, sugerirCategoria, extraerPrioridad, limpiarCategoria, limpiarPrioridad };
  if (typeof module !== 'undefined') module.exports = raiz.categorias;
})(typeof self !== 'undefined' ? self : typeof window !== 'undefined' ? window : globalThis);
