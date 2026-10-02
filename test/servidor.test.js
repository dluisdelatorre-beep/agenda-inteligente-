// Pruebas del servidor de avisos con un Postgres real en memoria (PGlite)
// y llaves VAPID reales. Comprueba guardar, cambiar de hora, enviar y limpiar.
const assert = require('assert');
const crypto = require('crypto');
const webpush = require('web-push');
const { PGlite } = require('@electric-sql/pglite');
const s = require('../lib/servidor');

// Teléfono de mentira con llaves válidas para cifrar el aviso de verdad
function telefono(n) {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  return {
    endpoint: `https://push.ejemplo.com/tel-${n}`,
    keys: { p256dh: ecdh.getPublicKey('base64url'), auth: crypto.randomBytes(16).toString('base64url') },
  };
}

(async () => {
  const vapid = webpush.generateVAPIDKeys();
  Object.assign(process.env, {
    DATABASE_URL: 'pglite://memoria',
    VAPID_PUBLIC_KEY: vapid.publicKey,
    VAPID_PRIVATE_KEY: vapid.privateKey,
    VAPID_SUBJECT: 'mailto:prueba@vforge.site',
  });
  webpush.setVapidDetails(process.env.VAPID_SUBJECT, vapid.publicKey, vapid.privateKey);

  const pg = new PGlite();
  const enviados = [];
  let respuesta = () => ({ statusCode: 201 });
  s._inyectar({
    query: async (t, p) => (await pg.query(t, p)).rows,
    // Cifra el aviso de verdad (como lo haría con Google/Apple) pero no sale a internet
    enviar: async (sub, payload, opciones) => {
      const det = webpush.generateRequestDetails(sub, payload, opciones);
      assert.ok(det.headers.Authorization.startsWith('vapid t='), 'firma VAPID');
      assert.strictEqual(det.headers['Content-Encoding'], 'aes128gcm');
      const r = respuesta(sub);
      if (r.statusCode >= 400) throw Object.assign(new Error('falló'), { statusCode: r.statusCode });
      enviados.push({ sub: sub.endpoint, payload: JSON.parse(payload) });
    },
  });

  let ok = 0;
  const paso = (nombre) => { ok++; console.log('  ✓', nombre); };
  const ahora = new Date('2026-10-02T18:00:00Z');
  const min = (m) => new Date(ahora.getTime() + m * 60000).toISOString();

  const a = telefono(1), b = telefono(2);
  await s.guardarSuscripcion(a);
  await s.guardarSuscripcion(b);
  paso('registra dos teléfonos');

  await assert.rejects(() => s.guardarSuscripcion({ endpoint: 'http://inseguro' }), /inválida/);
  paso('rechaza una suscripción inválida');

  await s.guardarRecordatorios(a.endpoint, [
    { id: 'r1', texto: 'Llamar a Germán', cuando: min(-1) },     // ya toca
    { id: 'r2', texto: 'Junta con Luis', cuando: min(30) },      // todavía no
    { id: 'r3', texto: 'Viejo', cuando: min(-60 * 13) },         // se pasó por más de 12 h
  ]);
  await s.guardarRecordatorios(b.endpoint, [{ id: 'r9', texto: 'Pagar la luz', cuando: min(-2) }]);
  const nada = await s.guardarRecordatorios('https://push.ejemplo.com/desconocido', [{ id: 'x', texto: 'x', cuando: min(0) }]);
  assert.ok(nada.sinSuscripcion);
  paso('guarda recordatorios y no acepta teléfonos desconocidos');

  let r = await s.enviarVencidos(ahora);
  assert.deepStrictEqual(r, { enviados: 2, fallidos: 0, suscripcionesBorradas: 0 });
  assert.deepStrictEqual(enviados.map((e) => e.payload.id).sort(), ['r1', 'r9']);
  assert.strictEqual(enviados.find((e) => e.payload.id === 'r1').payload.cuerpo, 'Llamar a Germán');
  paso('envía solo lo que ya toca, cifrado y firmado');

  r = await s.enviarVencidos(ahora);
  assert.strictEqual(r.enviados, 0);
  paso('no repite un aviso ya enviado');

  // Posponer 10 min: cambia la hora -> se vuelve a avisar
  await s.guardarRecordatorios(a.endpoint, [{ id: 'r1', texto: 'Llamar a Germán', cuando: min(10) }]);
  assert.strictEqual((await s.enviarVencidos(ahora)).enviados, 0);
  enviados.length = 0;
  r = await s.enviarVencidos(new Date(ahora.getTime() + 11 * 60000));
  assert.deepStrictEqual(enviados.map((e) => e.payload.id), ['r1']);
  paso('posponer 10 min vuelve a avisar a la nueva hora');

  // Editar solo el texto (misma hora) no vuelve a mandar
  await s.guardarRecordatorios(a.endpoint, [{ id: 'r1', texto: 'Llamar a Germán (urgente)', cuando: min(10) }]);
  assert.strictEqual((await s.enviarVencidos(new Date(ahora.getTime() + 12 * 60000))).enviados, 0);
  paso('editar el texto sin cambiar la hora no duplica');

  // Marcar como hecho = cuando null -> se borra
  await s.guardarRecordatorios(a.endpoint, [{ id: 'r2', texto: 'Junta con Luis', cuando: null }]);
  enviados.length = 0;
  await s.enviarVencidos(new Date(ahora.getTime() + 60 * 60000));
  assert.ok(!enviados.some((e) => e.payload.id === 'r2'));
  paso('lo que se marca hecho ya no se avisa');

  // Teléfono que ya no existe (410) -> se borra con sus recordatorios
  await s.guardarRecordatorios(b.endpoint, [{ id: 'r10', texto: 'Otro', cuando: min(100) }]);
  respuesta = (sub) => ({ statusCode: sub.endpoint === b.endpoint ? 410 : 201 });
  r = await s.enviarVencidos(new Date(ahora.getTime() + 101 * 60000));
  assert.strictEqual(r.suscripcionesBorradas, 1);
  const quedan = (await pg.query('SELECT count(*)::int AS n FROM recordatorios WHERE endpoint = $1', [b.endpoint])).rows[0].n;
  assert.strictEqual(quedan, 0);
  paso('borra teléfonos dados de baja (410) y sus recordatorios');

  // Cambio de suscripción: los recordatorios se mudan al nuevo endpoint
  const a2 = telefono(3);
  await s.guardarRecordatorios(a.endpoint, [{ id: 'r20', texto: 'Mudarse', cuando: min(200) }]);
  await s.guardarSuscripcion(a2, a.endpoint);
  const mudados = (await pg.query('SELECT endpoint FROM recordatorios WHERE id = $1', ['r20'])).rows;
  assert.deepStrictEqual(mudados.map((x) => x.endpoint), [a2.endpoint]);
  paso('si el navegador renueva la suscripción, los recordatorios se conservan');

  // Las funciones HTTP: /api/enviar exige la clave
  const enviar = require('../api/enviar');
  const res = () => { const o = { headers: {}, setHeader(k, v) { o.headers[k] = v; }, end(b) { o.body = JSON.parse(b); } }; return o; };
  process.env.CRON_SECRET = 'secreto-de-prueba';
  let rr = res(); await enviar({ headers: {} }, rr);
  assert.strictEqual(rr.statusCode, 401);
  rr = res(); await enviar({ headers: { authorization: 'Bearer secreto-de-prueba' } }, rr);
  assert.strictEqual(rr.statusCode, 200);
  paso('/api/enviar rechaza sin clave y responde con clave');

  const vapidFn = require('../api/vapid');
  rr = res(); vapidFn({}, rr);
  assert.strictEqual(rr.body.publicKey, vapid.publicKey);
  delete process.env.VAPID_PRIVATE_KEY;
  rr = res(); vapidFn({}, rr);
  assert.strictEqual(rr.statusCode, 503);
  paso('/api/vapid da la llave pública, o 503 si falta configurar');

  console.log(`${ok}/${ok} pruebas del servidor pasaron`);
})().catch((e) => { console.error('✗', e); process.exit(1); });
