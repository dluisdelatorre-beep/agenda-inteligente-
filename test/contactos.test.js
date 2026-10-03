// Pruebas de la lógica de contactos: modelo, búsqueda, duplicados, importación, frases y cumpleaños.
const assert = require('assert');
const C = require('../contactos.js');
let ok = 0;
const caso = (nombre, fn) => { fn(); ok++; console.log('  ✓', nombre); };
const AHORA = new Date(2026, 9, 3, 12, 0);
const luis = C.normalizar({ nombre: 'Luis', apellidos: 'de la Torre', telefono: '998 429 2748', email: 'Luis@Ejemplo.com', empresa: 'VForge', etiquetas: 'socio, #cliente', favorito: true, cumpleanos: '12/05/1985' }, AHORA);
const luis2 = C.normalizar({ nombre: 'Luis', apellidos: 'Pérez', telefono: '+52 55 1234 5678', empresa: 'Notaría 5' }, AHORA);
const ana = C.normalizar({ nombre: 'Ana', apellidos: 'Gómez', email: 'ana@correo.mx', cumpleanos: '--10-10', etiquetas: ['familia'] }, AHORA);
const lista = [luis2, ana, luis];

caso('normaliza: teléfono, correo, etiquetas, cumpleaños, fechas y user_id', () => {
  assert.strictEqual(luis.telefono, '9984292748');
  assert.strictEqual(luis.email, 'luis@ejemplo.com');
  assert.deepStrictEqual(luis.etiquetas, ['socio', 'cliente']);
  assert.strictEqual(luis.cumpleanos, '1985-05-12');
  assert.ok(luis.id && luis.created_at && luis.updated_at && luis.user_id === 'local');
  assert.strictEqual(C.normalizar({ nombre: 'X', email: 'no-es-correo', telefono: '12' }).email, '');
  assert.strictEqual(C.valido(C.normalizar({ notas: 'sin nombre' })), false);
});
caso('ordena con favoritos primero y luego por nombre', () => {
  assert.deepStrictEqual(C.ordenar(lista).map(C.nombreCompleto), ['Luis de la Torre', 'Ana Gómez', 'Luis Pérez']);
});
caso('busca por nombre, teléfono, empresa, etiqueta y sin acentos', () => {
  assert.deepStrictEqual(C.buscar(lista, 'luis').map((c) => c.apellidos), ['de la Torre', 'Pérez']);
  assert.deepStrictEqual(C.buscar(lista, 'perez').map((c) => c.nombre), ['Luis']);
  assert.deepStrictEqual(C.buscar(lista, '4292').map((c) => c.apellidos), ['de la Torre']);
  assert.deepStrictEqual(C.buscar(lista, 'notaria').map((c) => c.apellidos), ['Pérez']);
  assert.deepStrictEqual(C.buscar(lista, 'familia').map((c) => c.nombre), ['Ana']);
});
caso('enlaces estándar: tel, WhatsApp (con 52 de México) y correo', () => {
  assert.deepStrictEqual(C.enlaces(luis), { llamar: 'tel:9984292748', whatsapp: 'https://wa.me/529984292748', correo: 'mailto:luis@ejemplo.com' });
  assert.strictEqual(C.enlaces(luis2).whatsapp, 'https://wa.me/525512345678');
  assert.deepStrictEqual(C.enlaces(ana), { correo: 'mailto:ana@correo.mx' });
});
caso('detecta duplicados por teléfono (aunque cambie el formato) o correo', () => {
  assert.deepStrictEqual(C.duplicados(C.normalizar({ nombre: 'Luis T', telefono: '+52 1 998 429 2748' }), lista).map((c) => c.id), [luis.id]);
  assert.deepStrictEqual(C.duplicados(C.normalizar({ nombre: 'Anita', email: 'ANA@correo.mx' }), lista).map((c) => c.id), [ana.id]);
  assert.strictEqual(C.duplicados(C.normalizar({ nombre: 'Nuevo', telefono: '5550001111' }), lista).length, 0);
});
caso('combinar completa lo que falta sin borrar lo que había', () => {
  const r = C.combinar(ana, C.normalizar({ nombre: 'Anita', telefono: '9981112233', etiquetas: 'amiga', notas: 'Le gusta el café' }), AHORA);
  assert.strictEqual(r.nombre, 'Ana'); assert.strictEqual(r.telefono, '9981112233');
  assert.deepStrictEqual(r.etiquetas, ['familia', 'amiga']); assert.strictEqual(r.notas, 'Le gusta el café'); assert.strictEqual(r.id, ana.id);
});
caso('importa vCard (.vcf) con líneas dobladas, varios teléfonos y cumpleaños', () => {
  const vcf = 'BEGIN:VCARD\r\nVERSION:3.0\r\nN:de la Torre;Luis;;;\r\nFN:Luis de la Torre\r\nTEL;TYPE=CELL:+52 998 429 2748\r\nEMAIL;TYPE=INTERNET:luis@ejemplo.com\r\nORG:VForge;\r\nTITLE:Director\r\nBDAY:1985-05-12\r\nNOTE:Socio de\r\n  la casa\r\nCATEGORIES:socio,cliente\r\nEND:VCARD\r\nBEGIN:VCARD\r\nVERSION:3.0\r\nFN:Germán Muñoz\r\nitem1.TEL:55 1111 2222\r\nEND:VCARD\r\n';
  const r = C.parseVCF(vcf).map((c) => C.normalizar(c));
  assert.strictEqual(r.length, 2);
  assert.strictEqual(r[0].nombre, 'Luis'); assert.strictEqual(r[0].apellidos, 'de la Torre');
  assert.strictEqual(r[0].telefono, '+529984292748'); assert.strictEqual(r[0].empresa, 'VForge'); assert.strictEqual(r[0].puesto, 'Director');
  assert.strictEqual(r[0].cumpleanos, '1985-05-12'); assert.strictEqual(r[0].notas, 'Socio de la casa'); assert.deepStrictEqual(r[0].etiquetas, ['socio', 'cliente']);
  assert.strictEqual(r[1].nombre, 'Germán'); assert.strictEqual(r[1].apellidos, 'Muñoz'); assert.strictEqual(r[1].telefono, '5511112222');
});
caso('importa CSV de Google Contacts y CSV en español (con comillas y ;)', () => {
  const g = 'First Name,Last Name,Phone 1 - Value,E-mail 1 - Value,Organization Name,Birthday,Labels\nAna,Gómez,"998 111 2233",ana@correo.mx,"Casa, S.A.",1990-10-10,familia ::: * myContacts\n';
  const r = C.parseCSV(g).map((c) => C.normalizar(c));
  assert.strictEqual(r[0].nombre, 'Ana'); assert.strictEqual(r[0].telefono, '9981112233'); assert.strictEqual(r[0].empresa, 'Casa, S.A.');
  assert.strictEqual(r[0].cumpleanos, '1990-10-10'); assert.deepStrictEqual(r[0].etiquetas, ['familia']);
  const es = 'Nombre;Apellidos;Teléfono;Correo;Empresa;Cumpleaños\nCarlos;Ruiz;9985556677;carlos@x.mx;Notaría;15/03\n';
  const s = C.parseCSV(es).map((c) => C.normalizar(c));
  assert.strictEqual(s[0].apellidos, 'Ruiz'); assert.strictEqual(s[0].email, 'carlos@x.mx'); assert.strictEqual(s[0].cumpleanos, '--03-15');
});
caso('reconoce a la persona en frases del asistente', () => {
  assert.strictEqual(C.detectarPersona('Recuérdame llamar a Luis mañana a las 10'), 'Luis');
  assert.strictEqual(C.detectarPersona('Tengo reunión con Carlos el viernes'), 'Carlos');
  assert.strictEqual(C.detectarPersona('Recuérdame felicitar a Ana en su cumpleaños'), 'Ana');
  assert.strictEqual(C.detectarPersona('Llamar a Luis de la Torre para revisar propuesta'), 'Luis');
  assert.strictEqual(C.detectarPersona('comida con Germán Muñoz hoy a las 3'), 'Germán Muñoz');
  assert.strictEqual(C.detectarPersona('llamar a mi mamá'), '');
  assert.strictEqual(C.detectarPersona('comprar pan'), '');
});
caso('si hay varios con el mismo nombre no adivina: devuelve todas las coincidencias', () => {
  assert.deepStrictEqual(C.resolver('Llamar a Luis mañana', lista).candidatos.map((c) => c.apellidos), ['de la Torre', 'Pérez']);
  assert.deepStrictEqual(C.resolver('Llamar a Luis Pérez', lista).candidatos.map((c) => c.apellidos), ['Pérez']);
  assert.deepStrictEqual(C.resolver('felicitar a Ana', lista).candidatos.map((c) => c.nombre), ['Ana']);
  assert.deepStrictEqual(C.resolver('cita con Roberto', lista), { nombre: 'Roberto', candidatos: [] });
  const largo = C.resolver('Llamar a Luis de la Torre para revisar propuesta', lista);
  assert.deepStrictEqual([largo.nombre, largo.candidatos.map((c) => c.apellidos)], ['Luis de la Torre', ['de la Torre']]);
});
caso('próximo cumpleaños: este año o el siguiente, el día o un día antes, 9:00', () => {
  const a = C.proximoCumple(ana, AHORA);
  assert.strictEqual(a.getFullYear(), 2026); assert.strictEqual(a.getMonth(), 9); assert.strictEqual(a.getDate(), 10); assert.strictEqual(a.getHours(), 9);
  assert.strictEqual(C.proximoCumple(luis, AHORA).getFullYear(), 2027);
  assert.strictEqual(C.proximoCumple({ ...ana, avisoCumple: 'antes' }, AHORA).getDate(), 9);
  assert.strictEqual(C.proximoCumple({ nombre: 'X' }, AHORA), null);
});

console.log(`\n${ok} pruebas de contactos pasaron`);
