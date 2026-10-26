/*
 * Products 路由
 * - 前台商品：
 *   - GET  /products            商品查詢（需 JWT + 簽章；keyword/category/sort）
 *   - GET  /products/:id        單一商品（需 JWT + 簽章）
 *
 * - 後台商品（/admin/products）：
 *   - POST   /admin/products           新增商品（需 admin）
 *   - PATCH  /admin/products/:id       更新商品欄位（售價/庫存等）（需 admin 或 staff）
 *   - DELETE /admin/products/:id       刪除商品（需 admin）
 */

const express = require('express');
const router = express.Router();

const productCtrl = require('../controllers/product.controller');
const { requireAuth, requireRoles } = require('../middlewares/auth');

// 前台商品（需登入，避免未授權濫用；簽章由全域中介層驗證）
router.get('/products', requireAuth, productCtrl.listProducts);
router.get('/products/:id', requireAuth, productCtrl.getProduct);

// 後台商品（RBAC）
router.post('/admin/products', requireAuth, requireRoles('admin'), productCtrl.createProduct);
router.patch('/admin/products/:id', requireAuth, requireRoles('admin', 'staff'), productCtrl.updateProduct);
router.delete('/admin/products/:id', requireAuth, requireRoles('admin'), productCtrl.deleteProduct);

module.exports = router;