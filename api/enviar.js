// GET|POST /api/enviar  (Authorization: Bearer CRON_SECRET)
// Despacha los avisos que ya tocan. Lo llama un reloj cada minuto (cron del servidor de la casa).
const s = require('../lib/servidor');

module.exports = async (req, res) => {
  if (!s.configurada()) return s.responder(res, 503, { error: 'no configurado' });
  const clave = process.env.CRON_SECRET;
  if (!clave || req.headers.authorization !== `Bearer ${clave}`) {
    return s.responder(res, 401, { error: 'no autorizado' });
  }
  try {
    s.responder(res, 200, await s.enviarVencidos());
  } catch (err) {
    s.responder(res, 500, { error: err.message });
  }
};
