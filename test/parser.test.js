// Pruebas del intérprete. Fecha fija: viernes 2 oct 2026, 12:00.
const assert = require('assert');
const { interpretar } = require('../parser.js');
const ahora = new Date(2026, 9, 2, 12, 0);
const casos = [
  ['Mañana a las 5 llamar a Germán', 'Llamar a Germán', [2026, 9, 3, 17, 0]],
  ['recuérdame pagar la luz el viernes', 'Pagar la luz', [2026, 9, 9, 9, 0]],
  ['junta con Luis el lunes a las 10 de la mañana', 'Junta con Luis', [2026, 9, 5, 10, 0]],
  ['en 2 horas mandar cotización', 'Mandar cotización', [2026, 9, 2, 14, 0]],
  ['cita dentista 15 de octubre a las 4:30 pm', 'Cita dentista', [2026, 9, 15, 16, 30]],
  ['hoy a las 9 de la noche revisar correos', 'Revisar correos', [2026, 9, 2, 21, 0]],
  ['pasado mañana al mediodía comida con Eduardo', 'Comida con Eduardo', [2026, 9, 4, 12, 0]],
  ['a las 11 llamada con Vedika', 'Llamada con Vedika', [2026, 9, 3, 11, 0]],
  ['revisar contrato el 20', 'Revisar contrato', [2026, 9, 20, 9, 0]],
  ['comprar pan', 'Comprar pan', null],
];
let ok = 0;
for (const [frase, texto, f] of casos) {
  const r = interpretar(frase, ahora);
  assert.strictEqual(r.texto, texto, frase);
  if (f) assert.strictEqual(+r.cuando, +new Date(...f), frase);
  else assert.strictEqual(r.cuando, null, frase);
  ok++;
}
console.log(`${ok}/${casos.length} pruebas pasaron`);
