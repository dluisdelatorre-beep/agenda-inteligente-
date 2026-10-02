// Pruebas de categorías y prioridades: sugerencias y limpieza del texto.
const assert = require('assert');
const C = require('../categorias.js');
const A = require('../acciones.js');
const { interpretar } = require('../parser.js');
let ok = 0;
const caso = (nombre, fn) => { fn(); ok++; console.log('  ✓', nombre); };

// Igual que en la app: prioridad → enlace/teléfono → fecha → acción → categoría
function capturar(frase) {
  const pr = C.extraerPrioridad(frase);
  const e = A.extraer(pr.resto);
  const b = interpretar(e.resto, new Date(2026, 9, 2, 12, 0));
  const acc = A.sugerir(b.texto, e);
  return { ...b, ...acc, priority: pr.priority, category: C.sugerirCategoria(b.texto, acc.actionType) };
}

caso('“pagar internet” → Pagos', () => assert.strictEqual(capturar('En 2 minutos pagar internet').category, 'pagos'));
caso('“Cita con el dentista” → Salud', () => assert.strictEqual(capturar('Cita con el dentista mañana a las 4').category, 'salud'));
caso('“Junta con cliente” → Trabajo', () => assert.strictEqual(capturar('junta con el cliente el lunes a las 10').category, 'trabajo'));
caso('“comprar pan” → Casa', () => assert.strictEqual(capturar('comprar pan').category, 'casa'));
caso('“cumpleaños de mi mamá” → Personal', () => assert.strictEqual(capturar('cumpleaños de mi mamá el 20').category, 'personal'));
caso('enlace de Meet → Trabajo', () => assert.strictEqual(capturar('platica hoy a las 5 https://meet.google.com/abc-defg-hij').category, 'trabajo'));
caso('sin pistas → sin categoría (no estorba)', () => assert.strictEqual(capturar('Llamar a Luis').category, null));

caso('“urgente” → prioridad Alta y se quita del texto', () => {
  const r = capturar('Llamar a Luis urgente mañana a las 9');
  assert.strictEqual(r.priority, 'alta');
  assert.strictEqual(r.texto, 'Llamar a Luis');
  assert.strictEqual(r.actionType, 'llamar');
  assert.strictEqual(new Date(r.cuando).getHours(), 9);
});
caso('“Es importante: pagar la luz” → Alta, Pagos', () => {
  const r = capturar('Es importante pagar la luz el 15 de octubre');
  assert.strictEqual(r.priority, 'alta');
  assert.strictEqual(r.category, 'pagos');
  assert.ok(!/importante/i.test(r.texto), r.texto);
});
caso('“sin prisa” → Baja', () => {
  const r = capturar('lavar el coche sin prisa');
  assert.strictEqual(r.priority, 'baja');
  assert.strictEqual(r.texto, 'Lavar el coche');
});
caso('frase normal → prioridad Normal y texto intacto', () => {
  const r = capturar('En 2 minutos llamar a Luis');
  assert.strictEqual(r.priority, 'normal');
  assert.strictEqual(r.texto, 'Llamar a Luis');
});
caso('valores raros se limpian', () => {
  assert.strictEqual(C.limpiarCategoria('hackeo'), null);
  assert.strictEqual(C.limpiarPrioridad('maxima'), 'normal');
  assert.strictEqual(C.limpiarCategoria('salud'), 'salud');
});

console.log(`\n${ok} pruebas de categorías y prioridades pasaron`);
