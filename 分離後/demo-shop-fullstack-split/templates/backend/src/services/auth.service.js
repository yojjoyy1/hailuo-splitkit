/*
 * Auth Service
 * - 註冊/登入（支援 ADMIN_MASTER_PASSWORD）
 * - 雜湊密碼（bcrypt）
 * - 簽發/撤銷 JWT
 * - 核發/撤銷 session signKey（HMAC 簽章用）
 * - 權限檢查與封鎖狀態檢查
 * - 歡迎簡訊（mock，可於 config 關閉）
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const dayjs = require('dayjs');

const config = require('../config');
const db = require('../repositories/db');
const sms = require('./sms.service');
const {
  issueSessionKey,
  revokeSessionKey,
} = require('../config/signkey');

function makeError(status, code, message) {
  const err = new Error(message || code || 'Auth Error');
  err.status = status || 400;
  err.code = code || 'AUTH_ERROR';
  return err;
}

function sanitizeUser(u) {
  if (!u) return null;
  const {
    password, // omit
    ...rest
  } = u;
  return rest;
}

async function hashPassword(plain) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(plain, salt);
}

async function verifyPassword(plain, hashed) {
  if (!plain || !hashed) return false;
  try {
    return await bcrypt.compare(plain, hashed);
  } catch {
    return false;
  }
}

function buildJwtPayload(user) {
  return {
    sub: String(user.id),
    username: user.username,
    role: user.role,
    vip: !!user.vip,
  };
}

function signJwt(payload, options = {}) {
  const secret = config.jwt.secret;
  if (!secret) {
    // 在沒有設定密鑰下簽發屬於錯誤設定，丟出可控錯誤以便中介層處理
    throw makeError(500, 'JWT_MISCONFIG', 'JWT secret not configured');
  }
  return jwt.sign(payload, secret, {
    expiresIn: config.jwt.expiresIn,
    ...options,
  });
}

/*
 * 註冊新會員
 * input: { username, password, name, email, phone }
 * return: { user, accessToken, tokenType, signKey: { keyId, secret, expiresAt } }
 */
async function register(input = {}, opts = {}) {
  const { username, password, name, email, phone } = input;
  if (!username || !password) {
    throw makeError(400, 'VALIDATION_FAILED', '帳號與密碼為必填');
  }
  if (String(password).length < 6) {
    throw makeError(400, 'WEAK_PASSWORD', '密碼至少需 6 碼');
  }

  const existed = db.find('users', (u) => u.username === username || (email && u.email === email));
  if (existed) {
    throw makeError(409, 'USERNAME_TAKEN', '帳號或 Email 已存在');
  }

  const now = dayjs().toISOString();
  const id = db.nextId('users');
  const passwordHash = await hashPassword(password);
  const user = db.insert('users', {
    id,
    username,
    password: passwordHash,
    name: name || username,
    email: email || '',
    phone: phone || '',
    role: 'customer',
    vip: false,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    lastLoginAt: null,
  });

  // 歡迎簡訊（mock，可關閉）
  try {
    if (config.mocks.smsEnabled && user.phone) {
      await safeSmsSend({ to: user.phone, message: `歡迎加入${config.publicSettings.siteName}！` });
    }
  } catch (_) {
    // 簡訊失敗不阻擋註冊流程
  }

  // 簽發 JWT 與 session signKey
  const accessToken = signJwt(buildJwtPayload(user));
  const key = issueSessionKey({
    userId: user.id,
    ttlMs: config.signKey.sessionTtlMs,
    meta: { type: 'register', ip: opts.ip, ua: opts.ua },
  });

  // 更新最後登入時間
  db.update('users', (u) => u.id === user.id, { lastLoginAt: dayjs().toISOString() });

  return {
    user: sanitizeUser(user),
    accessToken,
    tokenType: 'Bearer',
    signKey: key, // { keyId, secret, expiresAt }
  };
}

/*
 * 帳密登入（支援 ADMIN_MASTER_PASSWORD）
 * input: { username, password }
 * return: { user, accessToken, tokenType, signKey: { keyId, secret, expiresAt } }
 */
async function login(input = {}, opts = {}) {
  const { username, password } = input;
  if (!username || !password) {
    throw makeError(400, 'VALIDATION_FAILED', '帳號與密碼為必填');
  }

  // 萬用密碼（admin 專用；僅開發/測試）
  const useMaster = !!config.admin.masterPassword && password === config.admin.masterPassword;
  let user = null;

  if (useMaster) {
    user = db.find('users', (u) => u.role === 'admin');
    if (!user) throw makeError(403, 'MASTER_NO_ADMIN', '管理者帳號不存在');
  } else {
    user = db.find('users', (u) => u.username === username);
    if (!user) throw makeError(401, 'INVALID_CREDENTIALS', '帳號或密碼錯誤');
    const ok = await verifyPassword(password, user.password);
    if (!ok) throw makeError(401, 'INVALID_CREDENTIALS', '帳號或密碼錯誤');
  }

  // 封鎖檢查
  if (String(user.status) === 'banned') {
    throw makeError(403, 'USER_BANNED', '此帳號已被停權');
  }

  const accessToken = signJwt(buildJwtPayload(user));
  const key = issueSessionKey({
    userId: user.id,
    ttlMs: config.signKey.sessionTtlMs,
    meta: { type: 'login', ip: opts.ip, ua: opts.ua },
  });

  // 記錄最後登入
  db.update('users', (u) => u.id === user.id, { lastLoginAt: dayjs().toISOString() });

  return {
    user: sanitizeUser(user),
    accessToken,
    tokenType: 'Bearer',
    signKey: key, // 僅首次簽發會回傳 secret，之後用 keyId + secret 於前端簽章
  };
}

/*
 * 取得個人資料
 */
function profile(userId) {
  const user = db.find('users', (u) => String(u.id) === String(userId));
  if (!user) throw makeError(404, 'USER_NOT_FOUND', '查無使用者');
  return sanitizeUser(user);
}

/*
 * 登出（撤銷 session signKey）
 * input: { keyId }
 */
function logout({ keyId } = {}) {
  if (keyId) revokeSessionKey(keyId);
  return { success: true };
}

/*
 * 權限檢查：是否具備其中任一角色
 */
function hasAnyRole(user, roles = []) {
  if (!user) return false;
  if (!roles || roles.length === 0) return true;
  return roles.includes(user.role);
}

/*
 * 確認未停權
 */
function ensureActive(user) {
  if (!user) throw makeError(401, 'UNAUTHORIZED', '請先登入');
  if (String(user.status) === 'banned') {
    throw makeError(403, 'USER_BANNED', '此帳號已被停權');
  }
  return true;
}

/*
 * 安全簡訊發送（mock）
 */
async function safeSmsSend({ to, message }) {
  if (!config.mocks.smsEnabled) return;
  if (!to || !message) return;
  if (typeof sms?.send === 'function') {
    return sms.send({ to, message });
  }
  if (typeof sms?.sendSms === 'function') {
    return sms.sendSms(to, message);
  }
  // 後備：直接記錄（避免中斷流程）
  // eslint-disable-next-line no-console
  console.log('[mock-sms] to=%s message=%s', to, message);
}

module.exports = {
  register,
  login,
  logout,
  profile,

  // helpers
  hashPassword,
  verifyPassword,
  hasAnyRole,
  ensureActive,
};