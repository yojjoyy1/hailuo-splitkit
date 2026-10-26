/*
 * JWT 驗證與角色授權中介層
 * - authenticate(required=true)：驗證 Authorization: Bearer <JWT>，將 payload 掛載至 req.user
 * - authorize(roles=[])：檢查 req.user.role 是否屬於允許清單
 * - 便捷方法：requireAdmin、requireStaffOrAdmin、requireCustomer
 *
 * 錯誤回應：統一以 JSON 格式，不外洩 stack
 */

const jwt = require('jsonwebtoken');
const cfg = require('../config');

function authenticate(required = true) {
  return (req, res, next) => {
    const authz = req.headers['authorization'] || req.headers['Authorization'];
    if (!authz || !/^Bearer\s+/.test(authz)) {
      if (required) {
        return res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          traceId: req.traceId,
        });
      }
      return next();
    }

    const token = authz.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      if (required) {
        return res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Invalid Authorization header' },
          traceId: req.traceId,
        });
      }
      return next();
    }

    try {
      const payload = jwt.verify(token, cfg.jwt.secret);
      // 期望 payload 至少包含 { id, role }
      req.user = payload;
      req.authToken = token;
      return next();
    } catch (err) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' },
        traceId: req.traceId,
      });
    }
  };
}

function authorize(roles = []) {
  // roles 範例：['admin']、['staff','admin']、['customer']
  const allowSet = new Set((roles || []).map(String));
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        traceId: req.traceId,
      });
    }
    if (allowSet.size === 0) return next();

    const role = String(req.user.role || '');
    let allowed = allowSet.has(role);

    // 允許 admin 覆蓋 staff 權限（常見 RBAC 做法）
    if (!allowed && allowSet.has('staff') && role === 'admin') {
      allowed = true;
    }

    if (!allowed) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Insufficient permissions' },
        traceId: req.traceId,
      });
    }
    return next();
  };
}

// 便捷方法
const requireAdmin = () => authorize(['admin']);
const requireStaffOrAdmin = () => authorize(['staff', 'admin']);
const requireCustomer = () => authorize(['customer']);

module.exports = {
  authenticate,
  authorize,
  requireAdmin,
  requireStaffOrAdmin,
  requireCustomer,
};