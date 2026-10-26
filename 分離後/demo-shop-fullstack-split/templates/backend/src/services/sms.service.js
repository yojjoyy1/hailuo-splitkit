/*
 * sms.service.js
 * - 簡訊發送（mock，可關閉）
 * - 遮罩與稽核，避免在日誌中外洩手機與內容
 * - 以環境變數注入 SMS_API_KEY（僅後端使用）
 */

const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const logger = safeRequire('../utils/logger', createFallbackLogger());
const masker = safeRequire('../utils/masker', {
  maskPhone: (s) => (s ? String(s).slice(0, 3) + '****' + String(s).slice(-2) : s),
  maskEmail: (s) => {
    if (!s) return s;
    const [n, d] = String(s).split('@');
    return `${n?.slice(0, 1) || ''}***@${d || ''}`;
  },
});

function safeRequire(path, fallback) {
  try {
    // eslint-disable-next-line import/no-dynamic-require, global-require
    return require(path);
  } catch (e) {
    return fallback;
  }
}

function createFallbackLogger() {
  const base = (level) => (...args) => {
    try {
      const out = args
        .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
        .join(' ');
      // eslint-disable-next-line no-console
      console[level === 'error' ? 'error' : level === 'debug' ? 'debug' : 'log'](`[sms.${level}]`, out);
    } catch (e) {}
  };
  return { info: base('info'), error: base('error'), debug: base('debug') };
}

/**
 * 發送簡訊（mock）
 * @param {Object} params
 * @param {string} params.to 收件者手機（E.164 或本地格式）
 * @param {string} params.message 內容
 * @param {Object} [params.meta] 額外資訊（userId、ip 等）
 * @returns {Promise<{success:boolean, messageId?:string, message?:string, provider:string}>}
 */
async function send({ to, message, meta } = {}) {
  const enabled = !!config.mocks.smsEnabled;
  const provider = 'mocksms';
  const apiKey = config.secrets.smsApiKey || '';

  if (!to || !message) {
    const msg = 'SMS_INVALID_ARGUMENTS';
    logger.error(msg, { to: masker.maskPhone(to) });
    throw createError(400, msg);
  }

  const maskedPhone = masker.maskPhone(to);
  const preview = String(message).length > 16 ? String(message).slice(0, 16) + '…' : message;

  // 稽核日誌（不包含 apiKey）
  logger.info('[SMS] send.request', {
    provider,
    to: maskedPhone,
    preview,
    len: String(message).length,
    userId: meta?.userId,
    ip: meta?.ip,
  });

  if (!enabled) {
    const msg = 'SMS_PROVIDER_DISABLED';
    logger.error('[SMS] disabled', { to: maskedPhone });
    return { success: false, message: msg, provider };
  }

  // 模擬延遲
  await sleep(120 + Math.floor(Math.random() * 180));

  // 成功回傳
  const messageId = `SMS-${uuidv4().replace(/-/g, '').slice(0, 10).toUpperCase()}`;
  logger.info('[SMS] send.ok', { provider, to: maskedPhone, messageId });

  return {
    success: true,
    messageId,
    provider,
  };
}

/**
 * 常用場景：註冊歡迎
 */
async function sendWelcome({ to, name, siteName } = {}) {
  const sName = siteName || config.publicSettings.siteName || '本服務';
  const message = `歡迎加入${sName}，${name || ''}！`;
  return send({ to, message, meta: { type: 'welcome' } });
}

/**
 * 常用場景：出貨通知
 */
async function sendShipped({ to, orderId } = {}) {
  const message = `您的訂單 ${orderId} 已出貨，感謝購買！`;
  return send({ to, message, meta: { type: 'shipped', orderId } });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function createError(status, message) {
  const err = new Error(message || 'Error');
  err.status = status || 500;
  return err;
}

module.exports = {
  send,
  sendWelcome,
  sendShipped,
};