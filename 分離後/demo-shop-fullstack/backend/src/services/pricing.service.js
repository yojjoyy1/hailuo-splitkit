const db = require('../repositories/db');
const config = require('../config');
const { fail } = require('../utils/http');

function validateCoupon(code, subtotal, user) {
  if (!code) return { ok: true, coupon: null };
  const coupon = db.find('coupons', (c) => c.code === String(code).trim().toUpperCase());
  if (!coupon) return { ok: false, message: '優惠碼不存在' };
  if (!coupon.active) return { ok: false, message: '優惠碼已停用' };
  if (new Date(coupon.expiresAt) < new Date()) return { ok: false, message: '優惠碼已過期' };
  if (coupon.used >= coupon.usageLimit) return { ok: false, message: '優惠碼已被領完' };
  if (subtotal < coupon.minSpend) return { ok: false, message: `需滿 $${coupon.minSpend} 才能使用` };
  if (coupon.vipOnly && !user?.vip) return { ok: false, message: '此優惠碼限 VIP 使用' };
  return { ok: true, coupon };
}

function quote(items, user, couponCode) {
  const lines = (items || []).map((item) => {
    const p = db.find('products', (x) => Number(x.id) === Number(item.productId));
    if (!p) throw fail(404, 'PRODUCT_NOT_FOUND', `查無商品 ${item.productId}`);
    const qty = Number(item.qty || 0);
    if (qty <= 0) throw fail(400, 'VALIDATION_FAILED', '數量需大於 0');
    return { productId: p.id, name: p.name, qty, price: p.price, lineTotal: p.price * qty };
  });
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  let discount = 0;
  if (user?.vip) discount += Math.round(subtotal * (1 - config.publicSettings.vipDiscount));
  const couponResult = validateCoupon(couponCode, subtotal, user);
  if (couponResult.ok && couponResult.coupon) {
    const c = couponResult.coupon;
    discount += c.type === 'percent' ? Math.round((subtotal * c.value) / 100) : c.value;
  }
  discount = Math.min(discount, subtotal);
  const after = subtotal - discount;
  const shipping = after >= config.publicSettings.freeShippingThreshold || after === 0 ? 0 : config.publicSettings.shippingFee;
  const tax = Math.round(after * config.publicSettings.taxRate);
  return {
    lines,
    subtotal,
    discount,
    shipping,
    tax,
    total: after + shipping + tax,
    couponError: couponResult.ok ? null : couponResult.message,
  };
}

module.exports = { validateCoupon, quote };
