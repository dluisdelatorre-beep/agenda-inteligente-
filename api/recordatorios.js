// POST /api/recordatorios { endpoint, recordatorios: [{ id, texto, cuando }] }
// Guarda qué avisar y cuándo. cuando = null borra el recordatorio (hecho, borrado o sin hora).
const s = require('../lib/servidor');

module.exports = async (req, res) => {
  if (!s.configurada()) return s.responder(res, 503, { error: 'no configurado' });
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return s.responder(res, 405, { error: 'método no permitido' });
  }
  try {
    const { endpoint, recordatorios } = await s.leerCuerpo(req);
    const r = await s.guardarRecordatorios(String(endpoint || ''), recordatorios);
    s.responder(res, r.sinSuscripcion ? 404 : 200, r);
  } catch (err) {
    s.responder(res, 400, { error: err.message });
  }
};
