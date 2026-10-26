const jwt = require('jsonwebtoken');
const config = require('../config');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: '請先登入' }, traceId: req.traceId });
  }
  try {
    req.user = jwt.verify(token, config.jwt.secret);
    return next();
  } catch {
    return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: '登入已過期，請重新登入' }, traceId: req.traceId });
  }
}

function optionalAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return next();
  try {
    req.user = jwt.verify(token, config.jwt.secret);
  } catch {
    req.user = null;
  }
  return next();
}

function requireRoles(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: '請先登入' }, traceId: req.traceId });
    }
    if (roles.length && !roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: '權限不足' }, traceId: req.traceId });
    }
    return next();
  };
}

module.exports = { requireAuth, optionalAuth, requireRoles, authenticate: () => requireAuth, authorize: (roles) => requireRoles(...roles) };
