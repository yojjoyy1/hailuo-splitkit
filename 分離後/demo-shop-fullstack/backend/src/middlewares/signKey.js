const config = require('../config');
const sk = require('../config/signkey');

module.exports = function signKeyMiddleware() {
  const headers = config.signKey.headers;
  const whitelist = new Set(config.signKey.whitelistPaths);
  const H_TS = headers.timestamp.toLowerCase();
  const H_NONCE = headers.nonce.toLowerCase();
  const H_SIG = headers.signature.toLowerCase();
  const H_KEYID = headers.keyId.toLowerCase();

  return function (req, res, next) {
    if (req.method === 'OPTIONS' || req.path === '/healthz') return next();
    const pathOnly = (req.originalUrl || req.path || '').split('?')[0];
    if (whitelist.has(pathOnly)) return next();
    // 白名單也涵蓋 /products/:id
    if (req.method === 'GET' && /^\/api\/v1\/products(\/|$)/.test(pathOnly)) return next();

    const ts = req.headers[H_TS];
    const nonce = req.headers[H_NONCE];
    const signature = req.headers[H_SIG];
    const keyId = req.headers[H_KEYID];
    if (!ts || !nonce || !signature || !keyId) {
      return res.status(401).json({ success: false, error: { code: 'SIGNATURE_REQUIRED', message: '缺少簽章標頭' }, traceId: req.traceId });
    }

    const tsNum = parseInt(String(ts), 10);
    const now = Date.now();
    if (!Number.isFinite(tsNum) || tsNum < now - config.signKey.windowMs - config.signKey.clockSkewMs || tsNum > now + config.signKey.clockSkewMs) {
      return res.status(401).json({ success: false, error: { code: 'SIGNATURE_EXPIRED', message: '簽章已過期' }, traceId: req.traceId });
    }

    const rec = sk.getSessionKey(keyId);
    if (!rec) {
      return res.status(401).json({ success: false, error: { code: 'KEY_NOT_FOUND', message: '簽章金鑰無效或已過期' }, traceId: req.traceId });
    }

    const nonceKey = `${keyId}:${nonce}`;
    if (sk.nonceHas(nonceKey)) {
      return res.status(409).json({ success: false, error: { code: 'REPLAY_DETECTED', message: '偵測到重放請求' }, traceId: req.traceId });
    }

    const canonical = sk.canonical({
      timestamp: tsNum,
      nonce,
      method: req.method,
      path: sk.pickPath(req),
      bodySha256Hex: sk.bodySha256(req.rawBody || ''),
    });
    const expected = sk.hmacHex(rec.secret, canonical);
    if (!sk.safeEqual(expected, String(signature))) {
      return res.status(401).json({ success: false, error: { code: 'INVALID_SIGNATURE', message: '簽章不符' }, traceId: req.traceId });
    }

    sk.nonceUse(nonceKey);
    req.signKey = { keyId: rec.keyId, userId: rec.userId };
    return next();
  };
};
