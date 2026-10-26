const db = require('../repositories/db');
const { fail, publicUser } = require('../utils/http');

function stats() {
  const orders = db.all('orders').filter((o) => o.status !== 'cancelled');
  const products = db.all('products');
  const revenue = orders.reduce((s, o) => s + o.total, 0);
  let cost = 0;
  const sales = {};
  for (const o of orders) {
    for (const i of o.items) {
      const p = products.find((x) => x.id === i.productId);
      cost += (p?.cost || 0) * i.qty;
      sales[i.productId] = (sales[i.productId] || 0) + i.qty;
    }
  }
  const topProducts = Object.entries(sales)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, qty]) => ({ name: products.find((p) => p.id === Number(id))?.name, qty }));
  return {
    revenue,
    profit: revenue - cost,
    orderCount: orders.length,
    avgOrder: orders.length ? Math.round(revenue / orders.length) : 0,
    lowStock: products.filter((p) => p.stock < 10),
    topProducts,
    userCount: db.all('users').filter((u) => u.role === 'customer').length,
  };
}

function listUsers() {
  return db.all('users').map(publicUser);
}

function updateUser(id, patch) {
  const u = db.find('users', (x) => String(x.id) === String(id));
  if (!u) throw fail(404, 'USER_NOT_FOUND', '查無會員');
  const next = {};
  if (patch.vip != null) next.vip = !!patch.vip;
  if (patch.status) next.status = patch.status;
  if (patch.name) next.name = patch.name;
  return publicUser(db.update('users', (x) => x.id === u.id, next));
}

function deleteUser(id) {
  const n = db.remove('users', (x) => String(x.id) === String(id));
  if (!n) throw fail(404, 'USER_NOT_FOUND', '查無會員');
  return { deleted: true };
}

function listCoupons() {
  return db.all('coupons');
}

function toggleCoupon(code) {
  const c = db.find('coupons', (x) => x.code === String(code).toUpperCase());
  if (!c) throw fail(404, 'COUPON_NOT_FOUND', '查無優惠券');
  return db.update('coupons', (x) => x.code === c.code, { active: !c.active });
}

function reset(devAllowed) {
  if (!devAllowed) throw fail(403, 'FORBIDDEN', '僅開發環境可重置');
  db.resetToSeed();
  return { reset: true };
}

module.exports = { stats, listUsers, updateUser, deleteUser, listCoupons, toggleCoupon, reset };
