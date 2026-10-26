/*
 * stats.service.js
 * - 營運報表計算：營收、毛利、訂單數、平均客單、低庫存、熱銷商品、會員數
 * - 來源資料：repositories/db.js（orders/products/users）
 * - 注意：
 *   - 只計入非取消訂單（status !== 'cancelled'）
 *   - revenue 以訂單 total 為主，若缺少則以 items 累加 price*qty
 *   - cost 以商品成本 cost*qty 累計
 */

const config = require('../config');
const logger = safeRequire('../utils/logger', {
  info: () => {},
  error: () => {},
  debug: () => {},
});
const db = require('../repositories/db'); // 預期提供基本 CRUD；此服務僅呼叫「取全部」的能力

function safeRequire(path, fallback) {
  try {
    // eslint-disable-next-line import/no-dynamic-require, global-require
    return require(path);
  } catch (e) {
    return fallback;
  }
}

// 嘗試從 repositories/db.js 讀取全部資料的通用方法
function getAll(collection) {
  if (!db) return [];
  if (typeof db.all === 'function') return db.all(collection);
  if (typeof db.getAll === 'function') return db.getAll(collection);
  if (typeof db.list === 'function') return db.list(collection);
  if (typeof db.read === 'function') return db.read(collection);
  if (db.tables && db.tables[collection]) return Array.isArray(db.tables[collection]) ? db.tables[collection] : [];
  logger.debug && logger.debug(`[stats] getAll fallback for ${collection}`);
  return [];
}

/**
 * 計算營運統計
 * @param {Object} [opts]
 * @param {number} [opts.lowStockThreshold=10] 低庫存門檻
 * @param {number} [opts.topN=5] 熱銷商品取前 N 名
 * @returns {Promise<Object>}
 */
async function getOverview(opts = {}) {
  const lowStockThreshold = Number.isFinite(opts.lowStockThreshold) ? Number(opts.lowStockThreshold) : 10;
  const topN = Number.isFinite(opts.topN) ? Number(opts.topN) : 5;

  const products = [...getAll('products')];
  const users = [...getAll('users')];
  const ordersRaw = [...getAll('orders')];

  // 過濾不計入的訂單狀態
  const orders = ordersRaw.filter((o) => (o && o.status ? o.status !== 'cancelled' : true));

  // 建立產品索引（成本與名稱）
  const pIndex = new Map();
  for (const p of products) {
    if (!p || p.id == null) continue;
    pIndex.set(Number(p.id), {
      id: Number(p.id),
      name: p.name || `#${p.id}`,
      cost: Number.isFinite(Number(p.cost)) ? Number(p.cost) : 0,
      price: Number.isFinite(Number(p.price)) ? Number(p.price) : 0,
      stock: Number.isFinite(Number(p.stock)) ? Number(p.stock) : 0,
      sku: p.sku,
      category: p.category,
    });
  }

  let revenue = 0;
  let cost = 0;
  const salesByProductId = new Map(); // productId => { qty, revenue }

  for (const o of orders) {
    if (!o) continue;
    // 訂單金額（優先 total）
    let orderTotal = Number(o.total);
    if (!Number.isFinite(orderTotal)) {
      // 嘗試用 items 計算
      const items = Array.isArray(o.items) ? o.items : [];
      orderTotal = items.reduce((s, it) => {
        const qty = Number(it.qty) || 0;
        const unit = Number(it.price ?? it.unitPrice ?? (pIndex.get(Number(it.productId))?.price || 0));
        return s + unit * qty;
      }, 0);
    }
    revenue += orderTotal;

    // 成本：以 items * product.cost
    const items = Array.isArray(o.items) ? o.items : [];
    for (const it of items) {
      const pid = Number(it.productId);
      const qty = Number(it.qty) || 0;
      const prod = pIndex.get(pid);
      const unitRevenue = Number(it.price ?? it.unitPrice ?? prod?.price ?? 0);
      const unitCost = Number(prod?.cost ?? 0);

      // 銷售量與營收累計
      if (!salesByProductId.has(pid)) salesByProductId.set(pid, { qty: 0, revenue: 0 });
      const agg = salesByProductId.get(pid);
      agg.qty += qty;
      agg.revenue += unitRevenue * qty;

      // 成本累加
      cost += unitCost * qty;
    }
  }

  const orderCount = orders.length;
  const avgOrder = orderCount ? Math.round(revenue / orderCount) : 0;

  // 熱銷商品（依銷售量 desc，其次營收 desc）
  const topProducts = Array.from(salesByProductId.entries())
    .sort((a, b) => {
      const qa = a[1].qty;
      const qb = b[1].qty;
      if (qb !== qa) return qb - qa;
      const ra = a[1].revenue;
      const rb = b[1].revenue;
      return rb - ra;
    })
    .slice(0, topN)
    .map(([pid, agg]) => {
      const p = pIndex.get(pid) || {};
      return {
        id: pid,
        sku: p.sku,
        name: p.name,
        qty: agg.qty,
        revenue: Math.round(agg.revenue),
      };
    });

  // 低庫存
  const lowStock = products
    .filter((p) => Number(p.stock) < lowStockThreshold)
    .map((p) => ({
      id: Number(p.id),
      sku: p.sku,
      name: p.name,
      stock: Number(p.stock),
    }))
    .sort((a, b) => a.stock - b.stock);

  // 會員數（僅 customer）
  const userCount = users.filter((u) => (u && u.role ? String(u.role).toLowerCase() === 'customer' : false)).length;

  const result = {
    currency: config.publicSettings.currency || 'TWD',
    revenue: Math.round(revenue),
    profit: Math.round(revenue - cost),
    orderCount,
    avgOrder,
    userCount,
    topProducts,
    lowStock,
    lowStockThreshold,
  };

  logger.info && logger.info('[STATS] overview', {
    revenue: result.revenue,
    profit: result.profit,
    orderCount,
    userCount,
    topN: topN,
    lowStockThreshold,
  });

  return result;
}

module.exports = {
  getOverview,
};