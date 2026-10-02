// Piezas compartidas por las funciones de /api (servidor de avisos).
// Variables de entorno que hay que poner en Vercel:
//   DATABASE_URL       conexión a Neon (Postgres)
//   VAPID_PUBLIC_KEY   llave pública de Web Push
//   VAPID_PRIVATE_KEY  llave privada de Web Push (secreta)
//   VAPID_SUBJECT      correo de contacto, ej. mailto:luis@vforge.site
//   CRON_SECRET        clave que debe mandar quien llame a /api/enviar
const webpush = require('web-push');

let baseDatos = null; // { query(texto, params) -> filas }
let enviarPush = null; // (suscripcion, payload, opciones) -> Promise
let esquemaListo = false;

function configurada() {
  return Boolean(process.env.DATABASE_URL && process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

function bd() {
  if (!baseDatos) {
    const { neon } = require('@neondatabase/serverless');
    const sql = neon(process.env.DATABASE_URL);
    baseDatos = { query: (texto, params = []) => sql.query(texto, params) };
  }
  return baseDatos;
}

function push() {
  if (!enviarPush) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:soporte@vforge.site',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
    enviarPush = (sub, payload, opciones) => webpush.sendNotification(sub, payload, opciones);
  }
  return enviarPush;
}

// Crea las tablas la primera vez (no hace falta correr migraciones a mano).
async function asegurarEsquema() {
  if (esquemaListo) return;
  const q = bd().query;
  await q(`CREATE TABLE IF NOT EXISTS suscripciones (
    endpoint   TEXT PRIMARY KEY,
    p256dh     TEXT NOT NULL,
    auth       TEXT NOT NULL,
    creado     TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await q(`CREATE TABLE IF NOT EXISTS recordatorios (
    endpoint   TEXT NOT NULL REFERENCES suscripciones(endpoint) ON DELETE CASCADE,
    id         TEXT NOT NULL,
    texto      TEXT NOT NULL,
    cuando     TIMESTAMPTZ NOT NULL,
    enviado_en TIMESTAMPTZ,
    PRIMARY KEY (endpoint, id)
  )`);
  await q(`CREATE INDEX IF NOT EXISTS recordatorios_por_enviar ON recordatorios (cuando) WHERE enviado_en IS NULL`);
  esquemaListo = true;
}

// ---- Lógica (separada de HTTP para poder probarla) ----

async function guardarSuscripcion(sub, anterior) {
  if (!sub || typeof sub.endpoint !== 'string' || !/^https:\/\//.test(sub.endpoint) || sub.endpoint.length > 1000) {
    throw new Error('suscripción inválida');
  }
  const k = sub.keys || {};
  if (!k.p256dh || !k.auth) throw new Error('suscripción sin llaves');
  await asegurarEsquema();
  const q = bd().query;
  await q(
    `INSERT INTO suscripciones (endpoint, p256dh, auth) VALUES ($1, $2, $3)
     ON CONFLICT (endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
    [sub.endpoint, k.p256dh, k.auth]
  );
  if (anterior && anterior !== sub.endpoint) {
    await q(`UPDATE recordatorios SET endpoint = $1 WHERE endpoint = $2`, [sub.endpoint, anterior]);
    await q(`DELETE FROM suscripciones WHERE endpoint = $1`, [anterior]);
  }
}

async function borrarSuscripcion(endpoint) {
  await asegurarEsquema();
  await bd().query(`DELETE FROM suscripciones WHERE endpoint = $1`, [endpoint]);
}

// Cada recordatorio: { id, texto, cuando } — cuando = null significa "ya no avisar".
async function guardarRecordatorios(endpoint, lista) {
  if (!Array.isArray(lista) || lista.length > 500) throw new Error('lista inválida');
  await asegurarEsquema();
  const q = bd().query;
  const existe = await q(`SELECT 1 FROM suscripciones WHERE endpoint = $1`, [endpoint]);
  if (!existe.length) return { guardados: 0, sinSuscripcion: true };
  let guardados = 0;
  for (const r of lista) {
    const id = String(r.id || '').slice(0, 64);
    if (!id) continue;
    const cuando = r.cuando ? new Date(r.cuando) : null;
    if (!cuando || isNaN(cuando)) {
      await q(`DELETE FROM recordatorios WHERE endpoint = $1 AND id = $2`, [endpoint, id]);
      continue;
    }
    // Si cambió la hora, se vuelve a avisar (enviado_en regresa a vacío).
    await q(
      `INSERT INTO recordatorios (endpoint, id, texto, cuando) VALUES ($1, $2, $3, $4)
       ON CONFLICT (endpoint, id) DO UPDATE SET
         texto = EXCLUDED.texto,
         cuando = EXCLUDED.cuando,
         enviado_en = CASE WHEN recordatorios.cuando IS DISTINCT FROM EXCLUDED.cuando THEN NULL ELSE recordatorios.enviado_en END`,
      [endpoint, id, String(r.texto || 'Pendiente').slice(0, 300), cuando.toISOString()]
    );
    guardados++;
  }
  return { guardados };
}

// Manda los avisos que ya tocan. Ignora los que se pasaron por más de 12 horas.
async function enviarVencidos(ahora = new Date()) {
  await asegurarEsquema();
  const q = bd().query;
  const filas = await q(
    `SELECT r.endpoint, r.id, r.texto, s.p256dh, s.auth
       FROM recordatorios r JOIN suscripciones s USING (endpoint)
      WHERE r.enviado_en IS NULL AND r.cuando <= $1 AND r.cuando > $2
      ORDER BY r.cuando LIMIT 200`,
    [ahora.toISOString(), new Date(ahora - 12 * 3600e3).toISOString()]
  );
  const resultado = { enviados: 0, fallidos: 0, suscripcionesBorradas: 0 };
  const mandar = push();
  for (const f of filas) {
    const sub = { endpoint: f.endpoint, keys: { p256dh: f.p256dh, auth: f.auth } };
    const payload = JSON.stringify({ id: f.id, titulo: 'Agenda Inteligente', cuerpo: f.texto });
    try {
      await mandar(sub, payload, { TTL: 3600, urgency: 'high', topic: f.id.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || undefined });
      await q(`UPDATE recordatorios SET enviado_en = $3 WHERE endpoint = $1 AND id = $2`, [f.endpoint, f.id, ahora.toISOString()]);
      resultado.enviados++;
    } catch (err) {
      // 404/410 = el teléfono ya no existe o quitó el permiso: se borra para no insistir.
      if (err && (err.statusCode === 404 || err.statusCode === 410)) {
        await q(`DELETE FROM suscripciones WHERE endpoint = $1`, [f.endpoint]);
        resultado.suscripcionesBorradas++;
      } else {
        resultado.fallidos++;
      }
    }
  }
  return resultado;
}

// ---- Ayudas HTTP ----
function responder(res, codigo, cuerpo) {
  res.statusCode = codigo;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(cuerpo));
}

async function leerCuerpo(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  let datos = '';
  for await (const trozo of req) {
    datos += trozo;
    if (datos.length > 200000) throw new Error('cuerpo muy grande');
  }
  return JSON.parse(datos || '{}');
}

// Solo para pruebas
function _inyectar({ query, enviar }) {
  if (query) baseDatos = { query };
  if (enviar) enviarPush = enviar;
  esquemaListo = false;
}

module.exports = {
  configurada, guardarSuscripcion, borrarSuscripcion, guardarRecordatorios, enviarVencidos,
  responder, leerCuerpo, _inyectar,
};
