/*
 * utils/crypto.js
 * - 雜湊與 HMAC：sha256Hex / sha256Base64 / hmacHex / hmacBase64
 * - 隨機 nonce / id：randomNonce / randomId
 * - 安全比較：safeEqual（常數時間比較，避免時序攻擊）
 * - 通用遮罩：maskString（保留前/後段字元）
 */

const crypto = require('crypto');

/**
 * 計算 SHA-256（hex）
 * @param {string|Buffer} data
 * @returns {string} hex
 */
function sha256Hex(data = '') {
  const h = crypto.createHash('sha256');
  h.update(data);
  return h.digest('hex');
}

/**
 * 計算 SHA-256（base64）
 * @param {string|Buffer} data
 * @returns {string} base64
 */
function sha256Base64(data = '') {
  const h = crypto.createHash('sha256');
  h.update(data);
  return h.digest('base64');
}

/**
 * 計算 HMAC（SHA-256，hex）
 * @param {string|Buffer} secret
 * @param {string|Buffer} message
 * @returns {string} hex
 */
function hmacHex(secret, message) {
  const h = crypto.createHmac('sha256', String(secret || ''));
  h.update(message || '');
  return h.digest('hex');
}

/**
 * 計算 HMAC（SHA-256，base64）
 * @param {string|Buffer} secret
 * @param {string|Buffer} message
 * @returns {string} base64
 */
function hmacBase64(secret, message) {
  const h = crypto.createHmac('sha256', String(secret || ''));
  h.update(message || '');
  return h.digest('base64');
}

/**
 * 產生隨機 nonce（預設 16 bytes，回傳 hex）
 * @param {number} size bytes 數
 * @returns {string} hex
 */
function randomNonce(size = 16) {
  return crypto.randomBytes(size).toString('hex');
}

/**
 * 產生隨機 ID（hex，長度可調，預設 24）
 * @param {number} length 目標長度（hex 字元）
 * @returns {string} hex
 */
function randomId(length = 24) {
  const bufLen = Math.ceil(length / 2);
  return crypto.randomBytes(bufLen).toString('hex').slice(0, length);
}

/**
 * 常數時間比較（避免時序攻擊）
 * @param {string|Buffer} a
 * @param {string|Buffer} b
 * @returns {boolean}
 */
function safeEqual(a, b) {
  if (a == null || b == null) return false;
  const abuf = Buffer.isBuffer(a) ? a : Buffer.from(String(a), 'utf8');
  const bbuf = Buffer.isBuffer(b) ? b : Buffer.from(String(b), 'utf8');
  if (abuf.length !== bbuf.length) return false;
  return crypto.timingSafeEqual(abuf, bbuf);
}

/**
 * 通用遮罩：保留前後部分字元，其餘以 * 取代
 * 例：maskString('abcdefg', { keepStart: 2, keepEnd: 2 }) => 'ab***fg'
 * @param {string|number} value
 * @param {{keepStart?: number, keepEnd?: number, maskChar?: string, minMasked?: number}} options
 * @returns {string}
 */
function maskString(value, options = {}) {
  if (value == null) return String(value);
  const s = String(value);
  const keepStart = Number.isFinite(options.keepStart) ? options.keepStart : 3;
  const keepEnd = Number.isFinite(options.keepEnd) ? options.keepEnd : 2;
  const maskChar = options.maskChar || '*';
  const minMasked = Number.isFinite(options.minMasked) ? options.minMasked : 3;

  if (!s || s.length <= keepStart + keepEnd) {
    return maskChar.repeat(Math.max(minMasked, s.length));
  }
  const head = s.slice(0, Math.max(0, keepStart));
  const tail = s.slice(-Math.max(0, keepEnd));
  const maskedLen = Math.max(minMasked, s.length - head.length - tail.length);
  return `${head}${maskChar.repeat(maskedLen)}${tail}`;
}

module.exports = {
  sha256Hex,
  sha256Base64,
  hmacHex,
  hmacBase64,
  randomNonce,
  randomId,
  safeEqual,
  maskString,
};