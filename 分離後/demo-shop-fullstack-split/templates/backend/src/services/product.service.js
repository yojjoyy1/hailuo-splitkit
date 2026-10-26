/*
 * Product Service
 * - 商品搜尋/篩選/排序（後端負責）
 * - 商品 CRUD（後台）
 * - 存量檢查與調整
 */

const dayjs = require('dayjs');
const db = require('../repositories/db');

function makeError(status, code, message) {
  const err = new Error(message || code || 'Product Error');
  err.status = status || 400;
  err.code = code || 'PRODUCT_ERROR';
  return err;
}

/*
 * 搜尋/篩選/排序
 * query: { keyword, category, sort, page, pageSize }
 * sort: priceAsc | priceDesc | rating | default
 */
function list(query = {}) {
  const {
    keyword = '',
    category,
    sort = 'default',
    page,
    pageSize,
  } = query;

  let items = db.all('products') || [];

  const kw = String(keyword || '').trim().toLowerCase();
  if (kw) {
    items = items.filter((p) => {
      const inName = String(p.name || '').toLowerCase().includes(kw);
      const inDesc = String(p.description || '').toLowerCase().includes(kw);
      const inTags = Array.isArray(p.tags) && p.tags.some((t) => String(t || '').toLowerCase().includes(kw));
      return inName || inDesc || inTags;
    });
  }

  if (category && category !== '全部') {
    items = items.filter((p) => String(p.category || '') === String(category));
  }

  const sorters = {
    priceAsc: (a, b) => Number(a.price) - Number(b.price),
    priceDesc: (a, b) => Number(b.price) - Number(a.price),
    rating: (a, b) => Number(b.rating || 0) - Number(a.rating || 0),
    default: (a, b) => Number(a.id) - Number(b.id),
  };
  items = items.sort(sorters[sort] || sorters.default);

  const total = items.length;
  if (page && pageSize) {
    const p = Math.max(1, Number(page));
    const ps = Math.max(1, Number(pageSize));
    const start = (p - 1) * ps;
    items = items.slice(start, start + ps);
  }

  return { items, total };
}

function getById(id) {
  const product = db.find('products', (p) => String(p.id) === String(id));
  if (!product) throw makeError(404, 'PRODUCT_NOT_FOUND', '查無商品');
  return product;
}

function ensureUniqueSku(sku, exceptId = null) {
  if (!sku) return true;
  const existed = db.find('products', (p) => p.sku === sku && String(p.id) !== String(exceptId ?? ''));
  if (existed) throw makeError(409, 'SKU_TAKEN', 'SKU 已存在');
  return true;
}

/*
 * 建立商品
 * data: { name, category, price, cost, stock, rating?, image?, tags?, description?, sku? }
 */
function create(data = {}) {
  const required = ['name', 'category', 'price', 'cost', 'stock'];
  for (const k of required) {
    if (data[k] === undefined || data[k] === null || data[k] === '') {
      throw makeError(400, 'VALIDATION_FAILED', `欄位 ${k} 為必填`);
    }
  }
  const now = dayjs().toISOString();
  const id = db.nextId('products');
  let sku = data.sku;
  if (!sku) {
    sku = 'SH-' + String(id).padStart(3, '0');
  }
  ensureUniqueSku(sku);

  const product = db.insert('products', {
    id,
    sku,
    name: String(data.name),
    category: String(data.category),
    price: Number(data.price),
    cost: Number(data.cost),
    stock: Number(data.stock),
    rating: Number(data.rating || 0),
    image: data.image || '📦',
    tags: Array.isArray(data.tags) ? data.tags : ['新品'],
    description: data.description || '',
    createdAt: now,
    updatedAt: now,
  });

  return product;
}

/*
 * 更新商品（僅允許部分欄位）
 */
function update(id, patch = {}) {
  const product = getById(id);
  if (!product) throw makeError(404, 'PRODUCT_NOT_FOUND', '查無商品');

  const allowed = ['name', 'category', 'price', 'cost', 'stock', 'rating', 'image', 'tags', 'description', 'sku'];
  const data = {};
  for (const k of allowed) {
    if (patch[k] !== undefined) data[k] = k === 'tags' ? (Array.isArray(patch[k]) ? patch[k] : product.tags) : patch[k];
  }

  if (data.sku) ensureUniqueSku(data.sku, id);
  if (data.price != null) data.price = Number(data.price);
  if (data.cost != null) data.cost = Number(data.cost);
  if (data.stock != null) data.stock = Number(data.stock);
  if (data.rating != null) data.rating = Number(data.rating);
  data.updatedAt = dayjs().toISOString();

  db.update('products', (p) => String(p.id) === String(id), data);
  return getById(id);
}

/*
 * 刪除商品
 */
function remove(id) {
  const p = getById(id);
  if (!p) throw makeError(404, 'PRODUCT_NOT_FOUND', '查無商品');
  db.remove('products', (x) => String(x.id) === String(id));
  return { success: true };
}

/*
 * 存量檢查：不足則丟錯
 */
function ensureStock(productId, qty) {
  const p = getById(productId);
  const need = Number(qty || 0);
  if (Number(p.stock) < need) {
    throw makeError(400, 'INSUFFICIENT_STOCK', `${p.name} 庫存不足（需求 ${need}，現有 ${p.stock}）`);
  }
  return true;
}

/*
 * 調整庫存（可正可負；會檢查不可小於 0）
 */
function adjustStock(productId, delta) {
  const p = getById(productId);
  const next = Number(p.stock) + Number(delta || 0);
  if (next < 0) {
    throw makeError(400, 'INSUFFICIENT_STOCK', `${p.name} 庫存不足`);
  }
  db.update('products', (x) => String(x.id) === String(productId), { stock: next, updatedAt: dayjs().toISOString() });
  return getById(productId);
}

/*
 * 批次檢查與調整（常見於結帳流程）
 * items: [{ productId, qty }]
 * options: { commit: boolean } 若 commit=true，直接扣庫存；否則僅檢查
 */
function batchEnsureAndAdjust(items = [], { commit = false } = {}) {
  if (!Array.isArray(items) || items.length === 0) return { ok: true, adjusted: [] };
  // 檢查
  for (const it of items) {
    ensureStock(it.productId, it.qty);
  }
  // 調整
  const adjusted = [];
  if (commit) {
    for (const it of items) {
      const after = adjustStock(it.productId, -Number(it.qty || 0));
      adjusted.push({ productId: it.productId, qty: Number(it.qty || 0), stockAfter: after.stock });
    }
  }
  return { ok: true, adjusted };
}

module.exports = {
  // 查詢
  list,
  getById,

  // CRUD
  create,
  update,
  remove,

  // 存量
  ensureStock,
  adjustStock,
  batchEnsureAndAdjust,
};