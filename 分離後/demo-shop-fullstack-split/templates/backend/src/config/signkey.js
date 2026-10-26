/*
 * 簽章設定與工具（SignKey Config & Helpers）
 * - 定義雜湊演算法、有效時間窗、時鐘偏移
 * - In-memory NonceStore（防重放）與 Session Key Registry（每次登入核發的短效 signKey）
 * - 提供簽名計算與安全比較工具
 *
 * 注意：
 * - 設計對齊 spec：signature = HMAC-SHA256(secret, `${timestamp}|${nonce}|${method}|${path}|${bodySha256}`)
 * - path 建議包含查詢字串（即 req.originalUrl，不含 domain）
 */

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const config = require('./index'); // 匯入集中設定，避免重覆讀 env

// 讀取設定（由 config/index.js 統一管理）
const SIGN = {
  algo: (config.signKey && config.signKey.algo) || 'HMAC-SHA256',
  windowMs: (config.signKey && config.signKey.windowMs) || 5 * 60 * 1000,
  clockSkewMs: (config.signKey && config.signKey.clockSkewMs) || 10 * 1000,
  nonceTtlMs: (config.signKey && config.signKey.nonceTtlMs) || 10 * 60 * 1000,
  sessionTtlMs: (config.signKey && config.signKey.sessionTtlMs) || 60 * 60 * 1000,
  headers: (config.signKey && config.signKey.headers) || {
    timestamp: 'X-Sign-Timestamp',
    nonce: 'X-Sign-Nonce',
    signature: 'X-Signature',
    keyId: 'X-Sign-KeyId',
  },
  whitelistPaths: (config.signKey && config.signKey.whitelistPaths) || [
    '/api/v1/public/settings',
    '/api/v1/auth/login',
    '/api/v1/auth/register',
  ],
};

// 產生 body 雜湊（hex）
function bodySha256(rawBody) {
  const h = crypto.createHash('sha256');
  h.update(rawBody || '');
  return h.digest('hex');
}

// 計算 HMAC（hex）
function hmacHex(secret, message) {
  // 目前固定使用 SHA-256，algo 仍保留於設定供顯示
  const h = crypto.createHmac('sha256', String(secret || ''));
  h.update(message || '');
  return h.digest('hex');
}

// 常數時間比較，避免時序攻擊
function safeEqual(a, b) {
  if (a == null || b == null) return false;
  const abuf = Buffer.from(String(a), 'utf8');
  const bbuf = Buffer.from(String(b), 'utf8');
  if (abuf.length !== bbuf.length) return false;
  return crypto.timingSafeEqual(abuf, bbuf);
}

// 以 req 取用 canonical path（含查詢字串；不含 hash）
function pickPath(req) {
  // Express 的 originalUrl 以 / 開頭且包含 query（若有）
  const url = req.originalUrl || req.url || '';
  // 去除 fragment（理論上伺服器端不會有 hash，但保險處理）
  const hashIdx = url.indexOf('#');
  return hashIdx >= 0 ? url.slice(0, hashIdx) : url;
}

// 組合簽名字串
function getCanonicalString({ timestamp, nonce, method, path, bodySha256Hex }) {
  const m = String(method || '').toUpperCase();
  const p = String(path || '');
  const ts = String(timestamp || '');
  const n = String(nonce || '');
  const b = String(bodySha256Hex || '');
  return `${ts}|${n}|${m}|${p}|${b}`;
}

/*
 * In-memory NonceStore（可替換為 Redis 等）
 * - key 建議組合為 `${keyId}:${nonce}` 以區分不同 session key 範圍
 */
class NonceStore {
  constructor({ ttlMs = SIGN.nonceTtlMs } = {}) {
    this.ttlMs = ttlMs;
    this.map = new Map(); // key => expireAt(ms)
  }
  has(key) {
    this._purge();
    const exp = this.map.get(key);
    if (!exp) return false;
    if (exp <= Date.now()) {
      this.map.delete(key);
      return false;
    }
    return true;
  }
  use(key) {
    this._purge();
    const expireAt = Date.now() + this.ttlMs;
    this.map.set(key, expireAt);
  }
  revoke(key) {
    this.map.delete(key);
  }
  _purge() {
    const now = Date.now();
    if (this.map.size === 0) return;
    for (const [k, exp] of this.map.entries()) {
      if (exp <= now) this.map.delete(k);
    }
  }
}

/*
 * Session Key Registry（每次登入核發的短效 signKey）
 * - issue：產生 keyId 與 secret，設定過期時間
 * - get：取得有效 key（自動過期清理）
 * - revoke：主動撤銷
 */
class SessionKeyRegistry {
  constructor({ defaultTtlMs = SIGN.sessionTtlMs } = {}) {
    this.defaultTtlMs = defaultTtlMs;
    this.store = new Map(); // keyId => { keyId, secret, userId, createdAt, expiresAt, meta }
  }
  issue({ userId, ttlMs, meta } = {}) {
    const keyId = uuidv4().replace(/-/g, '');
    const secret = crypto.randomBytes(32).toString('hex'); // 64 hex chars
    const now = Date.now();
    const exp = now + (ttlMs || this.defaultTtlMs);
    this.store.set(keyId, { keyId, secret, userId: userId || null, createdAt: now, expiresAt: exp, meta: meta || {} });
    return { keyId, secret, expiresAt: exp };
  }
  get(keyId) {
    if (!keyId) return null;
    const rec = this.store.get(String(keyId));
    if (!rec) return null;
    if (rec.expiresAt <= Date.now()) {
      this.store.delete(String(keyId));
      return null;
    }
    return rec;
  }
  revoke(keyId) {
    this.store.delete(String(keyId));
  }
  purgeExpired() {
    const now = Date.now();
    for (const [k, rec] of this.store.entries()) {
      if (!rec || rec.expiresAt <= now) this.store.delete(k);
    }
  }
}

// 單例實體（預設以記憶體）
const nonceStore = new NonceStore({ ttlMs: SIGN.nonceTtlMs });
const keyRegistry = new SessionKeyRegistry({ defaultTtlMs: SIGN.sessionTtlMs });

function issueSessionKey({ userId, ttlMs, meta } = {}) {
  return keyRegistry.issue({ userId, ttlMs, meta });
}
function getSessionKey(keyId) {
  return keyRegistry.get(keyId);
}
function revokeSessionKey(keyId) {
  return keyRegistry.revoke(keyId);
}

module.exports = {
  // 設定
  algo: SIGN.algo,
  windowMs: SIGN.windowMs,
  clockSkewMs: SIGN.clockSkewMs,
  nonceTtlMs: SIGN.nonceTtlMs,
  sessionTtlMs: SIGN.sessionTtlMs,
  headers: SIGN.headers,
  whitelistPaths: SIGN.whitelistPaths,

  // 工具
  bodySha256,
  hmacHex,
  safeEqual,
  pickPath,
  getCanonicalString,

  // Nonce 與 Session Key 管理
  nonceStore,
  keyRegistry,
  issueSessionKey,
  getSessionKey,
  revokeSessionKey,
};