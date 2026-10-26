/*
 * pricing.service.js
 * - 價格計算（VIP 折扣、優惠券、運費、稅金）
 * - 優惠碼驗證（delegation 至 coupon.service）
 */

const dayjs = require('dayjs');
const config = require('../config');
const db = require('../repositories/db');
const couponService = require('./coupon.service');

// 建立一致的錯誤物件（供控制器/中介層處理）
function httpError(status, code, message, extra = {}) {
  const err = new Error(message || code || 'Error');
  err.status = status || 400;
  err.code = code || 'BAD_REQUEST';
  Object.assign(err, extra);
  return err;
}

// 從購物車項目組出明細（查價用，非庫存扣減）
function buildLines(cartItems) {
  if (!Array.isArray(cartItems) || cartItems.length === 0) {
    return [];
  }
  const lines = [];
  for (const item of cartItems) {
    const pid = Number(item.productId);
    const qty = Number(item.qty || 0);
    if (!pid || qty <= 0) continue;
    const p = db.find('products', (x) => x.id === pid);
    if (!p) throw httpError(400, 'PRODUCT_NOT_FOUND', `找不到商品（ID=${pid}）`);
    const price = Number(p.price || 0);
    lines.push({
      productId: p.id,
      name: p.name,
      qty,
      price,
      lineTotal: price * qty,
    });
  }
  return lines;
}

/**
 * validateCoupon
 * - Proxy 到 couponService.validate，回傳統一結構
 */
async function validateCoupon(code, subtotal, user) {
  return couponService.validate(code, { subtotal, user });
}

/**
 * calculate
 * - 計算：小計、VIP 折扣、優惠折抵、運費、稅金、總計
 * - 參數：
 *   - cartItems: [{ productId, qty }]
 *   - user: { vip?: boolean }
 *   - couponCode?: string
 */
async function calculate(cartItems, user = null, couponCode = '') {
  const lines = buildLines(cartItems);
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);

  // VIP 折扣
  let discount = 0;
  if (user?.vip) {
    const vipRate = Number(config.publicSettings.vipDiscount || 1); // 0.9 = 9折
    if (vipRate > 0 && vipRate < 1) {
      discount += Math.round(subtotal * (1 - vipRate));
    }
  }

  // 優惠券
  let couponError = null;
  let appliedCoupon = null;
  if (couponCode) {
    const v = await validateCoupon(couponCode, subtotal, user);
    if (v.ok && v.coupon) {
      appliedCoupon = v.coupon;
      if (v.coupon.type === 'percent') {
        discount += Math.round((subtotal * Number(v.coupon.value || 0)) / 100);
      } else {
        discount += Number(v.coupon.value || 0);
      }
    } else {
      couponError = v.message || '優惠碼不可用';
    }
  }

  // 折抵不可超過小計
  discount = Math.min(discount, subtotal);

  const afterDiscount = subtotal - discount;

  // 運費
  const shipping =
    afterDiscount >= Number(config.publicSettings.freeShippingThreshold || Infinity) || afterDiscount === 0
      ? 0
      : Number(config.publicSettings.shippingFee || 0);

  // 稅金（四捨五入）
  const tax = Math.round(afterDiscount * Number(config.publicSettings.taxRate || 0));

  const total = afterDiscount + shipping + tax;

  return {
    lines,
    subtotal,
    discount,
    shipping,
    tax,
    total,
    coupon: appliedCoupon ? appliedCoupon.code : couponCode || null,
    couponError,
  };
}

/**
 * quote
 * - 給 controller 使用的便捷封裝
 */
async function quote({ cartItems = [], user = null, couponCode = '' } = {}) {
  return calculate(cartItems, user, couponCode);
}

module.exports = {
  validateCoupon,
  calculate,
  quote,
};