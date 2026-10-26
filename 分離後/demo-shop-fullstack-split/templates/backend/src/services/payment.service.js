/*
 * payment.service.js
 * - 後端代扣（mock）
 * - 根據卡號模擬成功/失敗：卡號去除空白後末四碼為 0000 視為失敗
 * - 以環境變數帶入金流 key（僅後端使用，絕不外洩到前端）
 * - 可於 .env 設定 MOCK_PAYMENT_ENABLED 開關
 */

const crypto = require('crypto');
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
  maskCard: (n) => {
    const s = String(n || '').replace(/\s|-/g, '');
    if (!s) return s;
    return s.slice(0, 4) + ' **** **** ' + s.slice(-4);
  },
});

function createFallbackLogger() {
  const base = (level) => (...args) => {
    try {
      // 簡易序列化避免拋錯
      const out = args
        .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
        .join(' ');
      // eslint-disable-next-line no-console
      console[level === 'error' ? 'error' : level === 'debug' ? 'debug' : 'log'](`[payment.${level}]`, out);
    } catch (e) {
      // 沒事
    }
  };
  return { info: base('info'), error: base('error'), debug: base('debug') };
}

function safeRequire(path, fallback) {
  try {
    // 動態載入，若不存在則回傳 fallback
    // eslint-disable-next-line import/no-dynamic-require, global-require
    return require(path);
  } catch (e) {
    return fallback;
  }
}

/**
 * 模擬對金流代扣
 * @param {Object} payload
 * @param {string|number} payload.orderId 訂單編號
 * @param {number} payload.amount 代扣金額
 * @param {string} [payload.currency] 幣別（預設取站台設定）
 * @param {Object} payload.card 卡片資料
 * @param {string} payload.card.number 卡號
 * @param {string} [payload.card.expiry] 到期
 * @param {string} [payload.card.cvc] CVC
 * @param {Object} [payload.meta] 額外資訊（userId、ip 等）
 * @returns {Promise<{success:boolean, paymentRef?:string, message?:string, provider:string}>}
 */
async function charge({ orderId, amount, currency, card, meta } = {}) {
  const enabled = !!config.mocks.paymentEnabled;
  const provider = 'mockpay';
  const curr = currency || config.publicSettings.currency || 'TWD';
  const key = config.secrets.paymentKey || '';

  // 基本參數檢查
  if (!orderId || !Number.isFinite(Number(amount)) || !card || !card.number) {
    const message = 'PAYMENT_INVALID_ARGUMENTS';
    logger.error(message, { orderId, amount: Number(amount) || 0 });
    throw createError(400, message);
  }

  // 稽核（遮罩卡號）
  const maskedCard = {
    number: masker.maskCard(card.number),
    expiry: card.expiry ? String(card.expiry).replace(/\d/g, '*') : undefined,
    cvc: card.cvc ? '***' : undefined,
  };
  logger.info('[PAYMENT] charge.request', {
    provider,
    orderId,
    amount: Number(amount),
    currency: curr,
    card: maskedCard,
    userId: meta?.userId,
    ip: meta?.ip,
    // 絕不紀錄/輸出真正的金流 key
  });

  // 若關閉 mock 金流，直接回覆不可用（正式環境可接真實 provider 實作）
  if (!enabled) {
    const message = 'PAYMENT_PROVIDER_DISABLED';
    logger.error('[PAYMENT] disabled', { orderId });
    return { success: false, message, provider };
  }

  // 模擬網路延遲
  await sleep(randInt(220, 680));

  // 模擬簽章（內部用，不對外）
  const internalSignature = hmacSha256Hex(key, `${orderId}|${amount}|${curr}`);

  // 規則：卡號末四碼 0000 視為授權失敗
  const cardNo = String(card.number).replace(/\s|-/g, '');
  if (cardNo.endsWith('0000')) {
    const message = '卡片授權失敗（模擬）';
    logger.info('[PAYMENT] charge.declined', { provider, orderId, reason: 'ENDSWITH_0000' });
    return {
      success: false,
      message,
      provider,
    };
  }

  // 成功
  const paymentRef = `PAY-${uuidv4().replace(/-/g, '').slice(0, 10).toUpperCase()}`;
  logger.info('[PAYMENT] charge.approved', {
    provider,
    orderId,
    paymentRef,
    signature: internalSignature.slice(0, 8) + '***', // 簽章只保留片段於內部日誌
  });
  return {
    success: true,
    paymentRef,
    provider,
  };
}

function hmacSha256Hex(secret, payload) {
  const h = crypto.createHmac('sha256', String(secret || ''));
  h.update(String(payload || ''));
  return h.digest('hex');
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function randInt(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function createError(status, message) {
  const err = new Error(message || 'Error');
  err.status = status || 500;
  return err;
}

module.exports = {
  charge,
};