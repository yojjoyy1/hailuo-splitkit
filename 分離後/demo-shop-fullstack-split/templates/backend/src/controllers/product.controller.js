/*
 * Product Controller
 * - 商品查詢、單品、後台新增/更新/刪除
 * - 參數驗證與回應格式化
 */

const productService = require('../services/product.service');

// 快速 400
function badRequest(res, message, details) {
  return res.status(400).json({
    success: false,
    error: { code: 'VALIDATION_ERROR', message: message || 'Validation failed', details },
  });
}

/*
 * GET /api/v1/products
 * query: { keyword, category, sort }
 */
async function list(req, res, next) {
  try {
    const { keyword, category, sort } = req.query || {};
    const data = await productService.search({
      keyword: keyword || '',
      category: category || '',
      sort: sort || '',
      requester: req.user || null, // 可能用於 RBAC 或差異化價格
    });
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}

/*
 * GET /api/v1/products/:id
 */
async function getOne(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!id || Number.isNaN(id)) return badRequest(res, 'Invalid product id');

    const product = await productService.getById(id);
    if (!product) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Product not found' } });

    return res.json({ success: true, data: product });
  } catch (err) {
    return next(err);
  }
}

/*
 * POST /api/v1/admin/products
 * body: { sku?, name, category, price, cost, stock, image?, tags?, description? }
 * - 需 admin/staff（service 內會再次檢查）
 */
async function create(req, res, next) {
  try {
    const { name, category, price, cost, stock } = req.body || {};
    if (!name || !category) return badRequest(res, 'name/category is required');
    if (price == null || Number.isNaN(Number(price))) return badRequest(res, 'price is required and must be number');
    if (cost == null || Number.isNaN(Number(cost))) return badRequest(res, 'cost is required and must be number');
    if (stock == null || Number.isNaN(Number(stock))) return badRequest(res, 'stock is required and must be number');

    const payload = {
      sku: req.body.sku,
      name: String(name),
      category: String(category),
      price: Number(price),
      cost: Number(cost),
      stock: Number(stock),
      image: req.body.image || '📦',
      tags: Array.isArray(req.body.tags) ? req.body.tags : undefined,
      description: req.body.description,
    };

    const product = await productService.create({ requester: req.user, data: payload });
    return res.status(201).json({ success: true, data: product });
  } catch (err) {
    return next(err);
  }
}

/*
 * PATCH /api/v1/admin/products/:id
 * body: 可更新欄位（price、stock、name、category、cost、image、tags、description）
 * - 需 admin/staff（service 內會再次檢查；刪除僅 admin）
 */
async function update(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!id || Number.isNaN(id)) return badRequest(res, 'Invalid product id');

    const allowed = ['price', 'stock', 'name', 'category', 'cost', 'image', 'tags', 'description'];
    const patch = {};
    for (const k of allowed) {
      if (req.body && Object.prototype.hasOwnProperty.call(req.body, k)) {
        patch[k] = k === 'price' || k === 'stock' || k === 'cost' ? Number(req.body[k]) : req.body[k];
      }
    }
    if (Object.keys(patch).length === 0) return badRequest(res, 'No updatable fields provided');

    const product = await productService.update({ requester: req.user, id, patch });
    return res.json({ success: true, data: product });
  } catch (err) {
    return next(err);
  }
}

/*
 * DELETE /api/v1/admin/products/:id
 * - 需 admin
 */
async function remove(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!id || Number.isNaN(id)) return badRequest(res, 'Invalid product id');

    const result = await productService.remove({ requester: req.user, id });
    return res.json({ success: true, data: result });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  list,
  getOne,
  create,
  update,
  remove,
};