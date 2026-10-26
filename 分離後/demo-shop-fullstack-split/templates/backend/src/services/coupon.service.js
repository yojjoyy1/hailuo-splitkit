/*
 * coupon.service.js
 * - 優惠券查詢、啟用/停用、驗證與使用量管理
 */

const dayjs = require('dayjs');
const db = require('../repositories/db');

// 建立一致的錯誤（供 controller 捕捉）
function httpError(status, code, message, extra = {}) {
  const err = new Error(message || code || 'Error');
  err.status = status || 400;
  err.code = code || 'BAD_REQUEST';
  Object.assign(err, extra);
  return err;
}

// 取得資料操作物件（支援 tx 或全域 db）
function store(tx) {
  return tx && typeof tx.all === 'function' ? tx : db;
}

function normalizeCode(code) {
  return String(code || '').trim().toUpperCase();
}

function getAll() {
  return db.all('coupons');
}

function getByCode(code) {
  const c = normalizeCode(code);
  if (!c) return null;
  return db.find('coupons', (x) => String(x.code).toUpperCase() === c);
}

function toggle(code, active) {
  const c = getByCode(code);
  if (!c) throw httpError(404, 'COUPON_NOT_FOUND', '找不到優惠券');
  db.update('coupons', (x) => String(x.code).toUpperCase() === normalizeCode(code), { active: !!active });
  return getByCode(code);
}

// 內部：檢查是否可用
function canUse(coupon, { subtotal = 0, user = null } = {}) {
  if (!coupon) return { ok: false, message: '優惠碼不存在' };
  if (!coupon.active) return { ok: false, message: '優惠碼已停用' };
  if (coupon.expiresAt && dayjs(coupon.expiresAt).isBefore(dayjs())) return { ok: false, message: '優惠碼已過期' };
  const limit = Number(coupon.usageLimit ?? 0);
  const used = Number(coupon.used ?? 0);
  if (limit > 0 && used >= limit) return { ok: false, message: '優惠碼已被領完' };
  const minSpend = Number(coupon.minSpend ?? 0);
  if (subtotal < minSpend) return { ok: false, message: `需滿 $${minSpend} 才能使用` };
  if (coupon.vipOnly && !user?.vip) return { ok: false, message: '此優惠碼限 VIP 使用' };
  return { ok: true, message: null };
}

/**
 * validate
 * - 檢查優惠碼是否可用（不會遞增使用量）
 */
async function validate(code, { subtotal = 0, user = null } = {}) {
  const c = getByCode(code);
  const r = canUse(c, { subtotal, user });
  if (!r.ok) return { ok: false, message: r.message, coupon: null };
  return { ok: true, message: null, coupon: { ...c } };
}

/**
 * incrementUsage
 * - 成功使用後遞增使用量（可在 tx 中執行）
 */
function incrementUsage(code, tx = null) {
  const s = store(tx);
  const c = s.find('coupons', (x) => String(x.code).toUpperCase() === normalizeCode(code));
  if (!c) throw httpError(404, 'COUPON_NOT_FOUND', '找不到優惠券');
  const limit = Number(c.usageLimit ?? 0);
  const used = Number(c.used ?? 0);
  if (limit > 0 && used >= limit) throw httpError(400, 'COUPON_EXHAUSTED', '優惠碼已被領完');
  s.update('coupons', (x) => String(x.code).toUpperCase() === normalizeCode(code), { used: used + 1 });
  return { code: c.code, used: used + 1, usageLimit: limit || null };
}

module.exports = {
  getAll,
  getByCode,
  toggle,
  validate,
  incrementUsage,
};