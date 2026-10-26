const MASK = new Set(['password', 'cardnumber', 'cardcvc', 'cvc', 'authorization', 'signkey', 'secret', 'apikey', 'smsapikey']);

function mask(obj, seen = new WeakSet()) {
  if (!obj || typeof obj !== 'object') return obj;
  if (seen.has(obj)) return '[Circular]';
  seen.add(obj);
  const out = Array.isArray(obj) ? [] : {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = MASK.has(k.toLowerCase()) ? '***' : (v && typeof v === 'object' ? mask(v, seen) : v);
  }
  return out;
}

module.exports = function auditMw(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    console.log(JSON.stringify({
      audit: true,
      traceId: req.traceId,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      ms: Date.now() - start,
      body: mask(req.body || {}),
    }));
  });
  next();
};
