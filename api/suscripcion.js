// POST   /api/suscripcion { subscription, anterior? } -> registra este teléfono para recibir avisos
// DELETE /api/suscripcion { endpoint }                -> lo da de baja
const s = require('../lib/servidor');

module.exports = async (req, res) => {
  if (!s.configurada()) return s.responder(res, 503, { error: 'no configurado' });
  try {
    const cuerpo = await s.leerCuerpo(req);
    if (req.method === 'POST') {
      await s.guardarSuscripcion(cuerpo.subscription, cuerpo.anterior);
      return s.responder(res, 200, { ok: true });
    }
    if (req.method === 'DELETE') {
      await s.borrarSuscripcion(String(cuerpo.endpoint || ''));
      return s.responder(res, 200, { ok: true });
    }
    res.setHeader('Allow', 'POST, DELETE');
    s.responder(res, 405, { error: 'método no permitido' });
  } catch (err) {
    s.responder(res, 400, { error: err.message });
  }
};
