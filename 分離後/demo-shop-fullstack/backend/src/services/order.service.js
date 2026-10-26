const db = require('../repositories/db');
const config = require('../config');
const { quote } = require('./pricing.service');
const { fail } = require('../utils/http');

function nextOrderId() {
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const seq = String(db.all('orders').length + 1).padStart(3, '0');
  return `ORD-${d}-${seq}`;
}

function charge({ orderId, amount, cardNumber }) {
  if (!config.mocks.paymentEnabled) throw fail(503, 'PAYMENT_DISABLED', '金流未啟用');
  const digits = String(cardNumber || '').replace(/\s/g, '');
  if (digits.endsWith('0000')) throw fail(402, 'PAYMENT_FAILED', '卡片授權失敗');
  return { paymentRef: 'PAY-' + Math.floor(1000 + Math.random() * 9000), orderId, amount };
}

function attachNames(order) {
  const products = db.all('products');
  const items = (order.items || []).map((i) => ({
    ...i,
    name: products.find((p) => p.id === i.productId)?.name,
  }));
  const user = db.find('users', (u) => u.id === order.userId);
  return { ...order, items, user: user ? { name: user.name, phone: user.phone, email: user.email } : null };
}

function checkout({ userId, items, couponCode, shippingAddress, contact, payment }) {
  const user = db.find('users', (u) => String(u.id) === String(userId));
  if (!user) throw fail(401, 'UNAUTHORIZED', '請先登入');
  const calc = quote(items, user, couponCode);
  if (calc.couponError) throw fail(400, 'COUPON_INVALID', calc.couponError);

  return db.runInTransaction(() => {
    for (const line of calc.lines) {
      const p = db.find('products', (x) => x.id === line.productId);
      if (p.stock < line.qty) throw fail(409, 'OUT_OF_STOCK', `${p.name} 庫存不足`);
      db.update('products', (x) => x.id === p.id, { stock: p.stock - line.qty });
    }
    if (couponCode && !calc.couponError) {
      const c = db.find('coupons', (x) => x.code === String(couponCode).toUpperCase());
      if (c) db.update('coupons', (x) => x.code === c.code, { used: c.used + 1 });
    }
    const pay = charge({ orderId: 'tmp', amount: calc.total, cardNumber: payment?.cardNumber });
    const order = db.insert('orders', {
      id: nextOrderId(),
      userId: user.id,
      items: calc.lines.map((l) => ({ productId: l.productId, qty: l.qty, price: l.price })),
      subtotal: calc.subtotal,
      discount: calc.discount,
      shipping: calc.shipping,
      tax: calc.tax,
      total: calc.total,
      coupon: couponCode ? String(couponCode).toUpperCase() : null,
      status: 'paid',
      paymentRef: pay.paymentRef,
      shippingAddress: shippingAddress || '',
      contact: contact || {},
      createdAt: new Date().toLocaleString('sv').slice(0, 16),
    });
    if (config.mocks.smsEnabled && (contact?.phone || user.phone)) {
      console.log(`[SMS] ${contact?.phone || user.phone} 訂單 ${order.id} 已付款成功`);
    }
    return attachNames(order);
  });
}

function myOrders(userId) {
  return db.all('orders').filter((o) => String(o.userId) === String(userId)).reverse().map(attachNames);
}

function cancel(orderId, userId, role) {
  const order = db.find('orders', (o) => o.id === orderId);
  if (!order) throw fail(404, 'ORDER_NOT_FOUND', '查無訂單');
  if (role === 'customer' && String(order.userId) !== String(userId)) throw fail(403, 'FORBIDDEN', '只能取消自己的訂單');
  if (order.status !== 'paid') throw fail(409, 'INVALID_STATUS', '僅已付款訂單可取消');
  return db.runInTransaction(() => {
    for (const item of order.items) {
      const p = db.find('products', (x) => x.id === item.productId);
      if (p) db.update('products', (x) => x.id === p.id, { stock: p.stock + item.qty });
    }
    return attachNames(db.update('orders', (o) => o.id === orderId, { status: 'cancelled' }));
  });
}

function adminList(status) {
  let list = db.all('orders');
  if (status && status !== 'all') list = list.filter((o) => o.status === status);
  return list.reverse().map(attachNames);
}

function updateStatus(orderId, status) {
  const order = db.find('orders', (o) => o.id === orderId);
  if (!order) throw fail(404, 'ORDER_NOT_FOUND', '查無訂單');
  const updated = db.update('orders', (o) => o.id === orderId, { status });
  if (status === 'shipped') {
    const user = db.find('users', (u) => u.id === order.userId);
    if (user && config.mocks.smsEnabled) console.log(`[SMS] ${user.phone} 訂單 ${order.id} 已出貨`);
  }
  return attachNames(updated);
}

function exportCsv() {
  const users = db.all('users');
  const rows = [['訂單編號', '會員', '電話', 'Email', '金額', '狀態', '付款參考', '建立時間']];
  for (const o of db.all('orders')) {
    const u = users.find((x) => x.id === o.userId);
    rows.push([o.id, u?.name || '', u?.phone || '', u?.email || '', o.total, o.status, o.paymentRef || '', o.createdAt]);
  }
  return '\ufeff' + rows.map((r) => r.join(',')).join('\n');
}

module.exports = { checkout, myOrders, cancel, adminList, updateStatus, exportCsv };
