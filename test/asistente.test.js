// Pruebas de "Tu asistente": resumen, qué hago primero, próxima acción, propuesta y frase.
const assert = require('assert');
const S = require('../asistente.js');
let ok = 0;
const caso = (nombre, fn) => { fn(); ok++; console.log('  ✓', nombre); };

const AHORA = new Date(2026, 9, 2, 17, 0); // viernes 2 oct, 5:00 p.m.
const a = (h, m = 0, dias = 0) => new Date(2026, 9, 2 + dias, h, m).toISOString();
let n = 0;
const P = (texto, extra = {}) => ({ id: 'p' + (++n), texto, cuando: null, conHora: false, hecho: false, ...extra });

const lista = [
  P('Llamar a Luis', { cuando: a(16, 30), conHora: true, actionType: 'llamar', contactPhone: '9981234567', actionValue: 'tel:9981234567' }),
  P('Pagar internet', { cuando: a(18, 0), conHora: true, actionType: 'pago', url: 'https://pagos.ejemplo.com/f/1', actionValue: 'https://pagos.ejemplo.com/f/1', priority: 'alta' }),
  P('Junta semanal', { cuando: a(19, 30), conHora: true }),
  P('Comprar pan', { cuando: a(9, 0), conHora: false }),
  P('Revisar ideas', { priority: 'baja' }),
  P('Desayuno', { cuando: a(8, 0), conHora: true, hecho: true }),
  P('Dentista', { cuando: a(10, 0, 1), conHora: true }),
];

caso('resumen de hoy cuadra con los pendientes reales', () => {
  const r = S.analizar(lista, AHORA);
  assert.deepStrictEqual(r.hoy, { total: 5, hechos: 1, pendientes: 4, vencidos: 1 });
  assert.strictEqual(r.proximo.texto, 'Pagar internet');
});
caso('frase contextual con pendientes y uno vencido', () => {
  const r = S.analizar(lista, AHORA);
  assert.strictEqual(r.frase, 'Te quedan 4 pendientes y uno ya pasó de su hora. El siguiente es pagar internet a las 6:00 p.m.');
});
caso('qué hago primero: el vencido va primero', () => {
  const r = S.analizar(lista, AHORA);
  assert.strictEqual(r.primero.p.texto, 'Llamar a Luis');
  assert.strictEqual(r.primero.texto, 'Primero: llamar a Luis. Era para las 4:30 p.m.');
});
caso('sin vencidos: prioridad alta antes que la hora más próxima', () => {
  const l = lista.filter((p) => p.texto !== 'Llamar a Luis');
  l.push(P('Correo al contador', { cuando: a(17, 20), conHora: true }));
  const r = S.analizar(l, AHORA);
  assert.strictEqual(r.primero.p.texto, 'Pagar internet');
  assert.match(r.primero.motivo, /prioridad alta/);
});
caso('sin vencidos ni alta: la hora más próxima, luego prioridad media, luego el resto', () => {
  const l = [P('Comprar pan', { cuando: a(9), conHora: false }), P('Junta', { cuando: a(19, 30), conHora: true }), P('Revisar ideas', { priority: 'baja' })];
  const r = S.analizar(l, AHORA);
  assert.deepStrictEqual([...r.plan.proximos, ...r.plan.despues].map((p) => p.texto), ['Junta', 'Comprar pan', 'Revisar ideas']);
  assert.strictEqual(r.primero.p.texto, 'Junta');
});
caso('próxima acción: el siguiente con acción ejecutable', () => {
  const r = S.analizar(lista, AHORA);
  assert.strictEqual(r.proximaAccion.texto, 'Llamar a Luis');
  const sinLlamada = S.analizar(lista.filter((p) => p.texto !== 'Llamar a Luis'), AHORA);
  assert.strictEqual(sinLlamada.proximaAccion.texto, 'Pagar internet');
});
caso('propuesta del día: vencidos, urgente, próximos, después (sin cambiar horas)', () => {
  const copia = JSON.stringify(lista);
  const r = S.analizar(lista, AHORA);
  assert.deepStrictEqual(Object.fromEntries(Object.entries(r.plan).map(([k, v]) => [k, v.map((p) => p.texto)])), {
    vencidos: ['Llamar a Luis'], urgente: ['Pagar internet'], proximos: ['Junta semanal'], despues: ['Comprar pan', 'Revisar ideas'],
  });
  assert.strictEqual(JSON.stringify(lista), copia);
});
caso('“Mañana” conserva la hora; sin hora, 9:00 a.m.', () => {
  const m = S.mananaDe(lista[0], AHORA);
  assert.strictEqual(m.getDate(), 3); assert.strictEqual(m.getHours(), 16); assert.strictEqual(m.getMinutes(), 30);
  assert.strictEqual(S.mananaDe(lista[4], AHORA).getHours(), 9);
});
caso('día tranquilo con una llamada en la tarde', () => {
  const l = [P('Llamar a Germán', { cuando: a(18), conHora: true, actionType: 'llamar', contactPhone: '9981112233', actionValue: 'tel:9981112233' })];
  const r = S.analizar(l, new Date(2026, 9, 2, 12, 0));
  assert.strictEqual(r.frase, 'Tu día está tranquilo. Tienes una llamada pendiente esta tarde.');
  const cuatro = S.analizar([1, 2, 3].map((i) => P('Tarea ' + i, { cuando: a(19 + i), conHora: true })).concat(l), new Date(2026, 9, 2, 12, 0));
  assert.strictEqual(cuatro.frase, 'Tienes 4 pendientes hoy. El siguiente es llamar a Germán a las 6:00 p.m.');
  const hechoHoy = S.analizar([{ ...l[0], hecho: true }], AHORA);
  assert.strictEqual(hechoHoy.frase, '¡Bien! Ya completaste 1 pendiente de hoy.');
  assert.strictEqual(S.analizar([], AHORA).frase, 'Tu día está tranquilo. No tienes pendientes.');
});
caso('pendientes viejos sin prioridad ni categoría funcionan igual', () => {
  const r = S.analizar([{ id: 'v', texto: 'Algo de antes', cuando: a(10), conHora: true, hecho: false }], AHORA);
  assert.strictEqual(r.vencidos.length, 1);
  assert.strictEqual(r.primero.texto, 'Primero: algo de antes. Era para las 10:00 a.m.');
});

caso('atención del avatar: vencido = alert; alta / próximo / acción cercana = attention; nada = idle', () => {
  assert.strictEqual(S.atencion(lista, AHORA).estado, 'alert');
  assert.strictEqual(S.atencion([], AHORA).estado, 'idle');
  const tranquilo = [P('Junta', { cuando: a(19, 30), conHora: true }), P('Ideas', { priority: 'baja' })];
  assert.strictEqual(S.atencion(tranquilo, AHORA).estado, 'idle');
  assert.strictEqual(S.atencion([P('Urgente', { priority: 'alta' })], AHORA).estado, 'attention');
  assert.strictEqual(S.atencion([P('Pronto', { cuando: a(17, 10), conHora: true })], AHORA).estado, 'attention');
  const llamada = P('Llamar', { cuando: a(17, 50), conHora: true, actionType: 'llamar', contactPhone: '9981234567', actionValue: 'tel:9981234567' });
  assert.strictEqual(S.atencion([llamada], AHORA).estado, 'attention');
  assert.strictEqual(S.atencion([{ ...llamada, cuando: a(19, 0) }], AHORA).estado, 'idle');
});

console.log(`\n${ok} pruebas del asistente pasaron`);
