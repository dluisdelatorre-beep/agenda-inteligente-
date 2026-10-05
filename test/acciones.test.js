// Pruebas de las acciones del recordatorio: detección, destinos y seguridad.
const assert = require('assert');
const A = require('../acciones.js');
const { interpretar } = require('../parser.js');
let ok = 0;
const caso = (nombre, fn) => { fn(); ok++; console.log('  ✓', nombre); };

// Igual que en la app: primero se sacan enlace y teléfono, luego se interpreta la fecha.
function capturar(frase) {
  const e = A.extraer(frase);
  const b = interpretar(e.resto, new Date(2026, 9, 2, 12, 0));
  return { ...b, ...A.sugerir(b.texto, e) };
}

caso('“Llamar a Luis” sugiere llamada con el nombre', () => {
  const r = capturar('Mañana a las 10 llamar a Luis');
  assert.strictEqual(r.actionType, 'llamar');
  assert.strictEqual(r.contactName, 'Luis');
  assert.strictEqual(r.texto, 'Llamar a Luis');
  assert.strictEqual(+r.cuando, +new Date(2026, 9, 3, 10, 0));
});
caso('el teléfono escrito en la frase se guarda y no se confunde con la hora', () => {
  const r = capturar('llamar a Germán Muñoz 998 123 4567 mañana a las 5');
  assert.strictEqual(r.actionType, 'llamar');
  assert.strictEqual(r.contactPhone, '9981234567');
  assert.strictEqual(r.contactName, 'Germán Muñoz');
  assert.strictEqual(+r.cuando, +new Date(2026, 9, 3, 17, 0));
});
caso('“Pagar internet mañana a las 12” sugiere pago', () => {
  const r = capturar('Pagar internet mañana a las 12');
  assert.strictEqual(r.actionType, 'pago');
  assert.strictEqual(+r.cuando, +new Date(2026, 9, 3, 12, 0));
});
caso('“Pagar tarjeta” sugiere pago', () => assert.strictEqual(capturar('pagar tarjeta el viernes').actionType, 'pago'));
caso('enlace de Meet, Zoom o Teams sugiere reunión y guarda el enlace', () => {
  for (const u of ['https://meet.google.com/abc-defg-hij', 'https://us02web.zoom.us/j/123456', 'https://teams.microsoft.com/l/meetup-join/xyz']) {
    const r = capturar(`junta de equipo hoy a las 4 ${u}`);
    assert.strictEqual(r.actionType, 'reunion', u);
    assert.strictEqual(r.url, new URL(u).toString());
    assert.ok(!r.texto.includes('http'), 'el enlace no ensucia el texto');
  }
});
caso('“Reunión por Meet” sin enlace sugiere reunión', () => assert.strictEqual(capturar('reunión por meet a las 11').actionType, 'reunion'));
caso('“Ir al dentista” / “Cita con el dentista” sugiere ubicación', () => {
  assert.strictEqual(capturar('ir al dentista el lunes').actionType, 'ubicacion');
  assert.strictEqual(capturar('Cita con el dentista mañana a las 4').actionType, 'ubicacion');
});
caso('enlace de mapas sugiere ubicación', () => {
  const r = capturar('recoger paquete https://maps.app.goo.gl/AbC123 mañana');
  assert.strictEqual(r.actionType, 'ubicacion');
  assert.ok(r.location.startsWith('https://maps.app.goo.gl/'));
});
caso('otro enlace con “pagar” sugiere pago; sin palabra clave, enlace general', () => {
  assert.strictEqual(capturar('pagar luz https://app.cfe.mx/pago mañana').actionType, 'pago');
  assert.strictEqual(capturar('revisar trámite www.gob.mx/curp el lunes').actionType, 'enlace');
});
caso('sin pistas no sugiere nada (y se puede guardar igual)', () => {
  const r = capturar('comprar pan');
  assert.strictEqual(r.actionType, null);
  assert.strictEqual(r.texto, 'Comprar pan');
});

caso('destinos: tel:, enlace y mapas', () => {
  assert.strictEqual(A.destino({ actionType: 'llamar', contactPhone: '+52 (998) 123-4567' }), 'tel:+529981234567');
  assert.strictEqual(A.destino({ actionType: 'llamar', contactName: 'Luis' }), null, 'sin teléfono no hay botón');
  assert.strictEqual(A.destino({ actionType: 'pago', url: 'https://pago.ejemplo.com/factura?id=7' }), 'https://pago.ejemplo.com/factura?id=7');
  assert.strictEqual(A.destino({ actionType: 'ubicacion', location: 'Av. Tulum 123, Cancún' }),
    'https://www.google.com/maps/search/?api=1&query=Av.%20Tulum%20123%2C%20Canc%C3%BAn');
  assert.strictEqual(A.destino({}), null, 'pendientes viejos sin campos siguen funcionando');
});
caso('seguridad: no acepta javascript:/data: y quita usuario:contraseña de los enlaces', () => {
  assert.strictEqual(A.limpiarUrl('javascript:alert(1)'), null);
  assert.strictEqual(A.limpiarUrl('data:text/html,hola'), null);
  assert.strictEqual(A.limpiarUrl('https://yo:secreta@banco.com/pagar'), 'https://banco.com/pagar');
  const n = A.normalizar({ actionType: 'pago', url: 'https://yo:NIP1234@banco.com/pago', contactPhone: '999', password: 'x', cvv: '123' });
  assert.deepStrictEqual(Object.keys(n).sort(), ['actionType', 'actionValue', 'contactName', 'contactPhone', 'location', 'url']);
  assert.ok(!JSON.stringify(n).includes('NIP1234'));
  assert.strictEqual(n.contactPhone, null, 'un pago no guarda teléfono');
});
caso('botones del aviso: acción principal + posponer (Android muestra 2); sin acción, posponer + hecho', () => {
  const llamar = { actionType: 'llamar', contactName: 'Luis', contactPhone: '9981234567' };
  assert.deepStrictEqual(A.botonesNotificacion(llamar, 2).map((b) => b.title), ['Llamar ahora', 'Posponer 10 min']);
  assert.deepStrictEqual(A.botonesNotificacion(llamar, 3).map((b) => b.title), ['Llamar ahora', 'Posponer 10 min', 'Hecho']);
  assert.deepStrictEqual(A.botonesNotificacion({ actionType: 'pago', url: 'https://x.com' }, 2).map((b) => b.title), ['Abrir pago', 'Posponer 10 min']);
  assert.deepStrictEqual(A.botonesNotificacion({}, 2).map((b) => b.title), ['Posponer 10 min', 'Hecho']);
  assert.strictEqual(A.cuerpoNotificacion(llamar), 'Es hora de llamar a Luis.');
});

caso('dirección dicha en la frase → "Cómo llegar" listo sin capturarla otra vez', () => {
  const s = (t) => { const x = A.extraer(t); return A.normalizar(A.sugerir(x.resto, x)); };
  assert.strictEqual(s('Cita con el dentista en Av Tulum 230').actionValue, 'https://www.google.com/maps/search/?api=1&query=Av%20Tulum%20230');
  assert.strictEqual(s('Recoger paquete en Calle 10 #45').location, 'Calle 10 #45');
  assert.strictEqual(s('Cita con el doctor en el Hospital Galenia').location, 'Hospital Galenia');
  assert.strictEqual(s('Comer con Ana en Sanborns').actionType, null, 'sin pista de dirección no adivina');
  assert.strictEqual(s('Revisar pendientes en casa').actionType, null);
  assert.strictEqual(s('Pagar luz en Oxxo').actionType, 'pago', 'un pago sigue siendo pago');
});

caso('al quitar el teléfono no queda colgado el conector ("Llamar a Germán al")', () => {
  assert.strictEqual(A.extraer('llamar a Germán al 9981234567 hoy a las 5 pm').resto, 'llamar a Germán hoy a las 5 pm');
  assert.strictEqual(A.extraer('llamar a mamá al cel 9981234567 mañana').resto, 'llamar a mamá mañana');
  assert.strictEqual(A.extraer('manda whatsapp a Ana en el 9981234567').resto, 'manda whatsapp a Ana');
  const r = capturar('llamar a Germán al 9981234567 hoy a las 5 pm');
  assert.strictEqual(r.texto, 'Llamar a Germán'); assert.strictEqual(r.contactPhone, '9981234567');
});

console.log(`${ok}/${ok} pruebas de acciones pasaron`);
