/*
 * pricing.routes.js
 * - /pricing 報價與 /coupons/validate 優惠碼驗證
 *
 * Endpoints 對應（見 references/api-inventory.md）：
 * - POST /api/v1/pricing/quote           -> 計算購物車金額（需 JWT + 簽章）
 * - GET  /api/v1/coupons/validate        -> 驗證優惠碼（需 JWT + 簽章）
 *
 * 注意：
 * - 白名單僅 /public/settings、/auth/login、/auth/register；其餘路由預設需 JWT + 簽章
 * - RBAC：此模組為一般會員行為（customer），故使用 requireAuth
 */

const express = require('express');
const router = express.Router();

const { requireAuth } = require('../middlewares/auth');
const pricingController = require('../controllers/pricing.controller');

// 計算報價（購物車小計/折扣/運費/稅金/總計）
router.post('/pricing/quote', requireAuth, pricingController.quote);

// 驗證優惠碼（code、subtotal、user.vip）
router.get('/coupons/validate', requireAuth, pricingController.validateCoupon);

module.exports = router;