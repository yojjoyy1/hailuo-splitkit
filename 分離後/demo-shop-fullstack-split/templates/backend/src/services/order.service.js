/*
 * order.service.js
 * - 建立/查詢/取消/更新狀態（含庫存調整與優惠券使用量遞增、付款與簡訊）
 */

const dayjs = require('dayjs');
const db = require('../repositories/db');
const config = require('../config');
const logger = require('../utils/logger');
const pricingService = require('./pricing.service');
const couponService = require('./coupon.service');
const paymentService = require('./payment.service');
const smsService = require('./sms.service');

const STATUS = ['pending', 'paid', 'shipped', 'completed', 'cancelled'];

// 建立一致的錯誤
function httpError(status, code, message, extra = {}) {
  const err = new Error(message || code || 'Error');
  err.status = status || 400;
  err.code = code || 'BAD_REQUEST';
  Object.assign(err, extra);
  return err;
}

// 依日期產生訂單編號：ORD-YYYYMMDD-XXX
function generateOrderId() {
  const todayStr = dayjs().format('YYYYMMDD');
  const prefix = `ORD-${todayStr}-`;
  const todays = db.all('orders').filter((o) => String(o.id || '').startsWith(prefix));
  const seq = String(todays.length + 1).padStart(3, '0');
  return `${prefix}${seq}`;
}

// 取得使用者
function getUser(userId) {
  const u = db.find('users', (x) => x.id === Number(userId));
  if (!u) throw httpError(404, 'USER_NOT_FOUND', '找不到使用者');
  if (u.status === 'banned') throw httpError(403, 'USER_BANNED', '帳號已停權，無法下單');
  return u;
}

// 在交易中扣庫存
function deductStock(tx, items) {
  for (const item of items) {
    const pid = Number(item.productId);
    const qty = Number(item.qty || 0);
    if (!pid || qty <= 0) continue;
    const p = tx.find('products', (x) => x.id === pid);
    if (!p) throw httpError(400, 'PRODUCT_NOT_FOUND', `找不到商品（ID=${pid}）`);
    if (Number(p.stock || 0) < qty) throw httpError(400, 'OUT_OF_STOCK', `${p.name} 庫存不足`);
    tx.update('products', (x) => x.id === pid, { stock: Number(p.stock || 0) - qty });
  }
}

// 在交易中退回庫存
function restock(tx, items) {
  for (const item of items) {
    const pid = Number(item.productId);
    const qty = Number(item.qty || 0);
    if (!pid || qty <= 0) continue;
    const p = tx.find('products', (x) => x.id === pid);
    if (!p) continue;
    tx.update('products', (x) => x.id === pid, { stock: Number(p.stock || 0) + qty });
  }
}

/**
 * create
 * - 前端結帳：檢查庫存、計算金額、呼叫金流、扣庫存、優惠券遞增與建立訂單
 * - 參數：
 *   - userId
 *   - cartItems: [{ productId, qty }]
 *   - couponCode?: string
 *   - payment: { cardNumber, cardExpiry, cardCvc }
 *   - shippingAddress?: string
 */
async function create({ userId, cartItems = [], couponCode = '', payment = {}, shippingAddress = '' } = {}) {
  if (!Array.isArray(cartItems) || cartItems.length === 0) {
    throw httpError(400, 'CART_EMPTY', '購物車為空');
  }
  const user = getUser(userId);

  // 先計算報價（不扣庫存）
  const quote = await pricingService.calculate(cartItems, user, couponCode);
  if (quote.coupon && quote.couponError) {
    throw httpError(400, 'COUPON_INVALID', quote.couponError);
  }
  if (quote.total <= 0) {
    throw httpError(400, 'INVALID_TOTAL', '金額異常');
  }

  // 檢查庫存（非交易中先快檢一次）
  for (const item of cartItems) {
    const p = db.find('products', (x) => x.id === Number(item.productId));
    if (!p) throw httpError(400, 'PRODUCT_NOT_FOUND', `找不到商品（ID=${item.productId}}）`);
    if (Number(p.stock || 0) < Number(item.qty || 0)) {
      throw httpError(400, 'OUT_OF_STOCK', `${p.name} 庫存不足`);
    }
  }

  // 產生訂單編號，先行付款
  const orderId = generateOrderId();
  const payRes = await paymentService.charge({
    orderId,
    amount: quote.total,
    cardNumber: payment.cardNumber,
    cardExpiry: payment.cardExpiry,
    cardCvc: payment.cardCvc,
  });
  if (!payRes || !payRes.success) {
    throw httpError(402, 'PAYMENT_FAILED', payRes?.message || '付款失敗');
  }

  // 進入交易：扣庫存、遞增優惠券、建立訂單
  const created = await db.withTransaction(async (tx) => {
    // 二次檢查並扣庫存
    deductStock(tx, cartItems);

    // 優惠券使用量 +1（若有）
    if (couponCode) {
      couponService.incrementUsage(couponCode, tx);
    }

    // 建立訂單（以當下明細與金額為準）
    const order = {
      id: orderId,
      userId: user.id,
      items: quote.lines.map((l) => ({ productId: l.productId, qty: l.qty, price: l.price })),
      subtotal: quote.subtotal,
      discount: quote.discount,
      shipping: quote.shipping,
      tax: quote.tax,
      total: quote.total,
      coupon: quote.coupon || null,
      status: 'paid',
      paymentRef: payRes.paymentRef || null,
      shippingAddress: shippingAddress || '',
      createdAt: dayjs().format('YYYY-MM-DD HH:mm'),
    };
    tx.insert('orders', order);
    return order;
  });

  // 通知（mock SMS 可由 config 控制）
  try {
    if (config.mocks.smsEnabled) {
      smsService.send(user.phone, `訂單 ${created.id} 已付款成功，金額 ${created.total}`);
    }
  } catch (e) {
    logger?.error?.('[sms] send fail', { err: e?.message });
  }

  return created;
}

/**
 * listMy
 * - 取得我的訂單（依使用者）
 */
function listMy(userId) {
  const uid = Number(userId);
  const list = db.all('orders').filter((o) => Number(o.userId) === uid);
  // 依建立時間倒序
  return list.sort((a, b) => {
    const ta = +dayjs(a.createdAt);
    const tb = +dayjs(b.createdAt);
    return tb - ta;
  });
}

/**
 * cancelMy
 * - 取消我的訂單（限制狀態：僅已付款 paid 可取消），並退回庫存
 */
async function cancelMy(userId, orderId) {
  const uid = Number(userId);
  const o = db.find('orders', (x) => String(x.id) === String(orderId));
  if (!o || Number(o.userId) !== uid) throw httpError(404, 'ORDER_NOT_FOUND', '找不到訂單');
  if (o.status !== 'paid') throw httpError(400, 'INVALID_STATUS', '此訂單狀態不可取消');

  const updated = await db.withTransaction(async (tx) => {
    // 退回庫存
    restock(tx, o.items);
    // 設為 cancelled
    tx.update('orders', (x) => String(x.id) === String(orderId), { status: 'cancelled' });
    const nu = tx.find('orders', (x) => String(x.id) === String(orderId));
    return nu;
  });

  return updated;
}

/**
 * adminList
 * - 後台訂單查詢（可依狀態過濾、簡易排序）
 */
function adminList({ status = 'all', sort = 'createdAt:desc' } = {}) {
  let rows = db.all('orders');
  if (status && status !== 'all') {
    rows = rows.filter((o) => o.status === status);
  }
  const [field, dir] = String(sort).split(':');
  const m = dir === 'asc' ? 1 : -1;
  rows.sort((a, b) => {
    if (field === 'createdAt') {
      return (dayjs(a.createdAt).valueOf() - dayjs(b.createdAt).valueOf()) * m;
    }
    if (field === 'total') {
      return (Number(a.total) - Number(b.total)) * m;
    }
    return String(a.id).localeCompare(String(b.id)) * m;
  });
  return rows;
}

/**
 * updateStatus
 * - 更新訂單狀態（staff/admin）
 * - 若更新為 shipped，發送簡訊
 */
function updateStatus(orderId, nextStatus) {
  if (!STATUS.includes(nextStatus)) throw httpError(400, 'INVALID_STATUS', '不支援的狀態');
  const o = db.find('orders', (x) => String(x.id) === String(orderId));
  if (!o) throw httpError(404, 'ORDER_NOT_FOUND', '找不到訂單');
  if (o.status === 'cancelled') throw httpError(400, 'INVALID_STATUS', '已取消的訂單不可變更狀態');

  db.update('orders', (x) => String(x.id) === String(orderId), { status: nextStatus });
  const nu = db.find('orders', (x) => String(x.id) === String(orderId));

  if (nextStatus === 'shipped') {
    const u = db.find('users', (x) => Number(x.id) === Number(nu.userId));
    if (u && config.mocks.smsEnabled) {
      try {
        smsService.send(u.phone, `您的訂單 ${nu.id} 已出貨`);
      } catch (e) {
        logger?.error?.('[sms] send fail', { err: e?.message });
      }
    }
  }

  return nu;
}

module.exports = {
  create,
  listMy,
  cancelMy,
  adminList,
  updateStatus,
};