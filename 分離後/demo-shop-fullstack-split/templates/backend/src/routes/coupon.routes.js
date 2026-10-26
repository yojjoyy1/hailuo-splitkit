/*
 * coupon.routes.js
 * - /admin/coupons 後台優惠券管理
 *
 * Endpoints 對應（見 references/api-inventory.md）：
 * - GET   /api/v1/admin/coupons               -> 優惠券列表（staff/admin；需 JWT + 簽章）
 * - PATCH /api/v1/admin/coupons/:code/toggle  -> 啟用/停用優惠券（staff/admin；需 JWT + 簽章）
 *
 * 說明：
 * - 前台「驗證優惠碼」請見 pricing.routes.js（GET /coupons/validate）
 */

const express = require('express');
const router = express.Router();

const { requireRoles } = require('../middlewares/auth');
const couponController = require('../controllers/coupon.controller');

// 後台：優惠券列表
router.get('/admin/coupons', requireRoles('admin', 'staff'), couponController.list);

// 後台：啟用/停用優惠券
router.patch('/admin/coupons/:code/toggle', requireRoles('admin', 'staff'), couponController.toggle);

module.exports = router;