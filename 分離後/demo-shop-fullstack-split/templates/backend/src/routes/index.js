/*
 * API 路由總管（/api/v1）
 * - 彙整子路由並提供公開設定端點
 * - 中介層順序：
 *   1) 全域於 app.js 已掛載：helmet/cors/body parser/audit/signKey/error
 *   2) 各路由內按需套用 requireAuth / requireRoles（RBAC）
 *
 * 白名單（免簽章，於 config.signKey.whitelistPaths 設定）：
 * - GET /api/v1/public/settings
 * - POST /api/v1/auth/login
 * - POST /api/v1/auth/register
 */

const express = require('express');
const router = express.Router();
const config = require('../config');

// 子路由
const authRoutes = require('./auth.routes');
const productRoutes = require('./product.routes');

// Public: 前端顯示所需公開設定（不含任何機敏值）
router.get('/public/settings', (req, res) => {
  res.json({
    success: true,
    data: {
      siteName: config.publicSettings.siteName,
      currency: config.publicSettings.currency,
      taxRate: config.publicSettings.taxRate,
      freeShippingThreshold: config.publicSettings.freeShippingThreshold,
      shippingFee: config.publicSettings.shippingFee,
      vipDiscount: config.publicSettings.vipDiscount,
    },
  });
});

// 掛載子路由
router.use('/auth', authRoutes);

// product.routes 同時涵蓋 /products 與 /admin/products
router.use('/', productRoutes);

module.exports = router;