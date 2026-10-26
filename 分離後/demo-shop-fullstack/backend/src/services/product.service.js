const db = require('../repositories/db');
const { fail } = require('../utils/http');

function list({ keyword = '', category, sort = 'default' } = {}) {
  let items = db.all('products');
  const kw = String(keyword || '').trim().toLowerCase();
  if (kw) {
    items = items.filter((p) =>
      String(p.name).toLowerCase().includes(kw) ||
      String(p.description || '').toLowerCase().includes(kw) ||
      (p.tags || []).some((t) => String(t).toLowerCase().includes(kw))
    );
  }
  if (category && category !== '全部') items = items.filter((p) => p.category === category);
  const sorters = {
    priceAsc: (a, b) => a.price - b.price,
    priceDesc: (a, b) => b.price - a.price,
    rating: (a, b) => (b.rating || 0) - (a.rating || 0),
    default: (a, b) => a.id - b.id,
  };
  return items.sort(sorters[sort] || sorters.default);
}

function getById(id) {
  const p = db.find('products', (x) => String(x.id) === String(id));
  if (!p) throw fail(404, 'PRODUCT_NOT_FOUND', '查無商品');
  return p;
}

function create(body) {
  if (!body.name || !body.price) throw fail(400, 'VALIDATION_FAILED', '商品名稱與售價必填');
  return db.insert('products', {
    sku: body.sku || `SH-${String(db.nextId('products')).padStart(3, '0')}`,
    name: body.name,
    category: body.category || '未分類',
    price: Number(body.price),
    cost: Number(body.cost || 0),
    stock: Number(body.stock || 0),
    rating: Number(body.rating || 0),
    image: body.image || '📦',
    tags: body.tags || ['新品'],
    description: body.description || '',
  });
}

function update(id, patch) {
  const p = getById(id);
  const next = {};
  for (const k of ['name', 'category', 'description', 'image', 'sku']) if (patch[k] != null) next[k] = patch[k];
  for (const k of ['price', 'cost', 'stock', 'rating']) if (patch[k] != null) next[k] = Number(patch[k]);
  if (patch.tags) next.tags = patch.tags;
  return db.update('products', (x) => x.id === p.id, next);
}

function remove(id) {
  getById(id);
  db.remove('products', (x) => String(x.id) === String(id));
  return { deleted: true };
}

module.exports = { list, getById, create, update, remove };
