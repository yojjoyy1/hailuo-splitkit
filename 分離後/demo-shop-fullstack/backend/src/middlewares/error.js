const config = require('../config');

module.exports = function errorMw(err, req, res, next) {
  const status = err.status || 500;
  const code = err.code || (status === 500 ? 'INTERNAL_ERROR' : 'ERROR');
  if (status >= 500) console.error('[error]', req.traceId, err);
  res.status(status).json({
    success: false,
    error: {
      code,
      message: err.message || '伺服器錯誤',
      ...(config.error.exposeStack && status >= 500 ? { stack: err.stack } : {}),
    },
    traceId: req.traceId,
  });
};
