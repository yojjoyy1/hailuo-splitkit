const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const config = require('./index');

const nonceStore = new Map();
const keyRegistry = new Map();

function purge() {
  const now = Date.now();
  for (const [k, exp] of nonceStore) if (exp <= now) nonceStore.delete(k);
  for (const [k, rec] of keyRegistry) if (rec.expiresAt <= now) keyRegistry.delete(k);
}

function bodySha256(raw) {
  return crypto.createHash('sha256').update(raw || '').digest('hex');
}
function hmacHex(secret, message) {
  return crypto.createHmac('sha256', String(secret || '')).update(message || '').digest('hex');
}
function safeEqual(a, b) {
  const ab = Buffer.from(String(a || ''), 'utf8');
  const bb = Buffer.from(String(b || ''), 'utf8');
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}
function pickPath(req) {
  return (req.originalUrl || req.url || '').split('#')[0];
}
function canonical({ timestamp, nonce, method, path, bodySha256Hex }) {
  return `${timestamp}|${nonce}|${String(method || '').toUpperCase()}|${path}|${bodySha256Hex}`;
}

function issueSessionKey({ userId } = {}) {
  purge();
  const keyId = uuidv4().replace(/-/g, '');
  const secret = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + config.signKey.sessionTtlMs;
  keyRegistry.set(keyId, { keyId, secret, userId: userId || null, expiresAt });
  return { keyId, secret, expiresAt };
}
function getSessionKey(keyId) {
  purge();
  return keyRegistry.get(String(keyId || '')) || null;
}
function revokeSessionKey(keyId) {
  keyRegistry.delete(String(keyId || ''));
}

module.exports = {
  bodySha256,
  hmacHex,
  safeEqual,
  pickPath,
  canonical,
  issueSessionKey,
  getSessionKey,
  revokeSessionKey,
  nonceHas(key) {
    purge();
    return nonceStore.has(key);
  },
  nonceUse(key) {
    nonceStore.set(key, Date.now() + config.signKey.nonceTtlMs);
  },
};
