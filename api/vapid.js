// GET /api/vapid -> llave pública para que el teléfono se suscriba a los avisos.
const { configurada, responder } = require('../lib/servidor');

module.exports = (req, res) => {
  if (!configurada()) return responder(res, 503, { error: 'El servidor de avisos aún no está configurado' });
  responder(res, 200, { publicKey: process.env.VAPID_PUBLIC_KEY });
};
