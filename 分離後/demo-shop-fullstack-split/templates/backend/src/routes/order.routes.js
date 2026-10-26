/*
 * order.routes.js
 * - /orders 我的訂單與取消
 * - /checkout 結帳流程
 * - /admin/orders 後台訂單管理
 *
 * Endpoints 對應（見 references/api-inventory.md）：
 * - POST /api/v1/checkout                      -> 建立訂單並付款（需 JWT + 簽章）
 * - GET  /api/v1/orders                        -> 我的訂單列表（需 JWT + 簽章）
 * - POST /api/v1/orders/:id/cancel             -> 取消我的訂單（需 JWT + 簽章）
 * - GET  /api/v1/admin/orders                  -> 後台訂單查詢（staff/admin；需 JWT + 簽章）
 * - PATCH /api/v1/admin/orders/:id/status      -> 更新訂單狀態（staff/admin；需 JWT + 簽章）
 */

const express = require('express');
const router = express.Router();

const { requireAuth, requireRoles } = require('../middlewares/auth');
const orderController = require('../controllers/order.controller');

// 結帳（庫存檢查/扣庫存、核銷優惠、建立訂單、金流代扣（server-side mock）、簡訊通知）
router.post('/checkout', requireAuth, orderController.checkout);

// 我的訂單列表
router.get('/orders', requireAuth, orderController.myOrders);

// 取消訂單（限定本人、狀態限制於 service/controller 檢查）
router.post('/orders/:id/cancel', requireAuth, orderController.cancel);

// 後台：訂單查詢（狀態過濾、排序、匯出用途由 export.routes 處理）
router.get('/admin/orders', requireRoles('admin', 'staff'), orderController.adminList);

// 後台：更新訂單狀態（shipped 觸發簡訊）
router.patch('/admin/orders/:id/status', requireRoles('admin', 'staff'), orderController.updateStatus);

module.exports = router;