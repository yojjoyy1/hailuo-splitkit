/*
 * Auth Controller
 * - 連接 auth.service 與路由：/auth/register、/auth/login、/auth/profile、/auth/logout
 * - 輸入驗證、回應格式化、錯誤傳遞
 *
 * 回應慣例：
 * { success: true, data: {...} }
 * 失敗交由統一錯誤處理中介層處理（或在此回 400 驗證錯誤）
 */

const authService = require('../services/auth.service');
const config = require('../config');

// 小工具：快速產生 400 驗證錯誤回應
function badRequest(res, message, details) {
  return res.status(400).json({
    success: false,
    error: { code: 'VALIDATION_ERROR', message: message || 'Validation failed', details },
  });
}

/*
 * POST /api/v1/auth/register
 * body: { username, password, name, email, phone }
 * return: { user, accessToken, tokenType, expiresIn, signKey: { keyId, secret, expiresAt } }
 */
async function register(req, res, next) {
  try {
    const { username, password, name, email, phone } = req.body || {};
    if (!username || !password) {
      return badRequest(res, 'username/password is required');
    }
    const meta = {
      ip: req.ip,
      ua: req.headers['user-agent'] || '',
      traceId: req.traceId,
    };
    const result = await authService.register({ username, password, name, email, phone, meta });

    // 預期 service 回傳：{ user, accessToken, signKey: { keyId, secret, expiresAt } }
    return res.status(201).json({
      success: true,
      data: {
        user: toPublicUser(result.user),
        accessToken: result.accessToken,
        tokenType: 'Bearer',
        expiresIn: config.jwt.expiresIn,
        signKey: result.signKey || null,
      },
    });
  } catch (err) {
    return next(err);
  }
}

/*
 * POST /api/v1/auth/login
 * body: { username, password }
 * 支援 ADMIN_MASTER_PASSWORD（服務層內處理）
 * return: { user, accessToken, tokenType, expiresIn, signKey: { keyId, secret, expiresAt } }
 */
async function login(req, res, next) {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return badRequest(res, 'username/password is required');
    }
    const meta = {
      ip: req.ip,
      ua: req.headers['user-agent'] || '',
      traceId: req.traceId,
    };
    const result = await authService.login({ username, password, meta });

    return res.json({
      success: true,
      data: {
        user: toPublicUser(result.user),
        accessToken: result.accessToken,
        tokenType: 'Bearer',
        expiresIn: config.jwt.expiresIn,
        signKey: result.signKey || null,
      },
    });
  } catch (err) {
    return next(err);
  }
}

/*
 * GET /api/v1/auth/profile
 * header: Authorization: Bearer <JWT>
 * 需 JWT（由 auth 中介層驗證並附加 req.user）
 */
async function profile(req, res, next) {
  try {
    // req.user 由 JWT 中介層注入
    if (!req.user || !req.user.id) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } });
    }
    const user = await authService.profile({ userId: req.user.id });
    return res.json({
      success: true,
      data: { user: toPublicUser(user) },
    });
  } catch (err) {
    return next(err);
  }
}

/*
 * POST /api/v1/auth/logout
 * 伺服器側撤銷 session signKey
 * - 嘗試從 Header 取得 keyId（config.signKey.headers.keyId），或 body.keyId
 */
async function logout(req, res, next) {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } });
    }
    const keyHeader = config.signKey.headers.keyId;
    const keyId = req.headers[keyHeader.toLowerCase()] || req.headers[keyHeader] || (req.body ? req.body.keyId : null) || null;

    await authService.logout({ userId: req.user.id, keyId });

    return res.json({ success: true, data: { ok: true } });
  } catch (err) {
    return next(err);
  }
}

// 只回傳前端必要欄位，避免洩漏敏感資訊（如 passwordHash、tokens、內部標記）
function toPublicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    username: u.username,
    name: u.name,
    email: u.email,
    phone: u.phone,
    role: u.role,
    vip: !!u.vip,
    status: u.status || 'active',
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

module.exports = {
  register,
  login,
  profile,
  logout,
};