/*
 * utils/masker.js
 * - 敏感資料遮罩：email/phone/card/token
 * - 深層物件遮罩（依鍵名與模式）
 * - 提供可調整的遮罩行為（keys/自訂函式）
 *
 * 使用方式：
 *   const masker = require('./masker');
 *   masker.maskEmail('user@example.com'); // u***@example.com
 *   masker.maskDeep(obj, { keys: ['password', 'token'] });
 */

const { mask } = require('../config/security'); // 使用預設遮罩邏輯（mask.maskValue 與 keys）

// 基礎遮罩：保留前後幾碼
function maskString(s, keepStart = 3, keepEnd = 2, pad = '*', minMasked = 3) {
  if (s == null) return String(s);
  const str = String(s);
  if (!str) return str;
  if (str.length <= keepStart + keepEnd) return pad.repeat(Math.max(minMasked, str.length));
  return `${str.slice(0, keepStart)}${pad.repeat(Math.max(minMasked, str.length - keepStart - keepEnd))}${str.slice(-keepEnd)}`;
}

function isEmail(s) {
  return typeof s === 'string' && /\S+@\S+\.\S+/.test(s);
}
function isPhone(s) {
  return typeof s === 'string' && /^\+?\d{7,}$/.test(s.replace(/[\s-]/g, ''));
}
function isCardLike(s) {
  return typeof s === 'string' && /^[\d\s-]{12,19}$/.test(s);
}
function isTokenish(s) {
  return typeof s === 'string' && /[A-Za-z0-9_\-]{20,}/.test(s);
}

function maskEmail(s) {
  if (!isEmail(s)) return maskString(s);
  const [name, domain] = String(s).split('@');
  return `${name.slice(0, 1)}***@${domain}`;
}

function maskPhone(s) {
  if (!isPhone(s)) return maskString(s);
  const digits = String(s).replace(/\D/g, '');
  return `${digits.slice(0, 3)}****${digits.slice(-2)}`;
}

function maskCard(s) {
  if (!isCardLike(s)) return maskString(s);
  const digits = String(s).replace(/\D/g, '');
  const last4 = digits.slice(-4);
  return `**** **** **** ${last4}`;
}

function maskToken(s) {
  if (!isTokenish(s)) return maskString(s);
  const str = String(s);
  return `${str.slice(0, 6)}***${str.slice(-4)}`;
}

/**
 * 依值自動判斷最佳遮罩（若提供 key 則優先依鍵名遮罩）
 * @param {any} value
 * @param {string} [key] 鍵名（不分大小寫）
 * @param {{ customMask?: (v:string,k?:string)=>string }} [options]
 * @returns {any}
 */
function maskValue(value, key, options = {}) {
  if (value == null) return value;

  // 非字串/數字型態：不處理（由深層遮罩遞迴）
  if (typeof value !== 'string' && typeof value !== 'number') return value;
  const str = String(value);

  // 鍵名優先（與 security.mask.keys 相符時）
  const keyLc = key ? String(key).toLowerCase() : undefined;
  if (keyLc && Array.isArray(mask.keys)) {
    const shouldMask = mask.keys.map((k) => String(k).toLowerCase()).includes(keyLc);
    if (shouldMask) return (mask.maskValue || maskString)(str, key);
  }

  // 依型態自動遮罩
  if (isEmail(str)) return maskEmail(str);
  if (isPhone(str)) return maskPhone(str);
  if (isCardLike(str)) return maskCard(str);
  if (isTokenish(str)) return maskToken(str);

  // 自訂遮罩器（若提供）
  if (typeof options.customMask === 'function') {
    return options.customMask(str, key);
  }

  // 一般字串遮罩
  return (mask.maskValue || maskString)(str, key);
}

/**
 * 深層物件遮罩（遞迴）
 * @param {any} input
 * @param {{ keys?: string[], maxDepth?: number, customMask?: (v:string,k?:string)=>string }} [options]
 * @returns {any} 新物件/值
 */
function maskDeep(input, options = {}) {
  const maxDepth = Number.isFinite(options.maxDepth) ? options.maxDepth : 10;
  const keysList = (options.keys || mask.keys || []).map((k) => String(k).toLowerCase());

  function _walk(value, depth, parentKey) {
    if (value == null) return value;
    if (depth > maxDepth) return '[Object]';

    const t = typeof value;
    if (t === 'string' || t === 'number') {
      const keyMatched = parentKey ? keysList.includes(String(parentKey).toLowerCase()) : false;
      if (keyMatched) {
        return (mask.maskValue || maskString)(String(value), parentKey);
      }
      return maskValue(value, parentKey, options);
    }

    if (Array.isArray(value)) {
      return value.map((v) => _walk(v, depth + 1, parentKey));
    }

    if (t === 'object') {
      const out = Array.isArray(value) ? [] : {};
      for (const k of Object.keys(value)) {
        const v = value[k];
        out[k] = _walk(v, depth + 1, k);
      }
      return out;
    }

    // 其餘型別（boolean/function/symbol/undefined）不處理
    return value;
  }

  return _walk(input, 0, undefined);
}

/**
 * 遮罩 HTTP Headers（鍵名不分大小寫）
 * @param {object} headers
 * @param {string[]} keys
 * @returns {object}
 */
function maskHeaders(headers = {}, keys = mask.keys || []) {
  const result = {};
  const lowerKeys = keys.map((k) => String(k).toLowerCase());
  for (const [k, v] of Object.entries(headers || {})) {
    const shouldMask = lowerKeys.includes(String(k).toLowerCase());
    result[k] = shouldMask ? (mask.maskValue || maskString)(v, k) : v;
  }
  return result;
}

module.exports = {
  // 型態偵測
  isEmail,
  isPhone,
  isCardLike,
  isTokenish,

  // 遮罩函式
  maskString,
  maskEmail,
  maskPhone,
  maskCard,
  maskToken,
  maskValue,
  maskDeep,
  maskHeaders,
};