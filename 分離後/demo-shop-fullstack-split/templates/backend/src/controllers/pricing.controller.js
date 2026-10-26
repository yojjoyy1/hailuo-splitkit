/*
 * pricing.controller.js
 * 報價與優惠驗證控制器
 * - POST /api/v1/pricing/quote
 * - GET  /api/v1/coupons/validate
 */

'use strict';

const pricingService = require('../services/pricing.service');
const config = require('../config');

function makeError(status, code, message, details) {
  const err = new Error(message || code || 'Error');
  err.status = status || 500;
  err.code = code || 'ERROR';
  if (details) err.details = details;
  return err;
}

function isPositiveInteger(n) {
  return Number.isInteger(n) && n > 0;
}

function normalizeItems(items) {
  if (!Array.isArray(items)) return null;
  const normalized = [];
  for (const it of items) {
    const pid = it && (it.productId || it.id);
    const qty = it && Number(it.qty);
    if (!pid || !isPositiveInteger(qty)) return null;
    normalized.push({ productId: String(pid), qty });
  }
  return normalized;
}

/**
 * POST /api/v1/pricing/quote
 * body: { items: [{ productId, qty }], couponCode? }
 * 依使用者身分（vip）與站台設定（稅率、運費、免運、VIP 折扣），以及優惠券，計算金額
 */
async function quote(req, res, next) {
  try {
    const items = normalizeItems(req.body && req.body.items);
    if (!items || items.length === 0) {
      return next(makeError(400, 'INVALID_ITEMS', '購物車品項無效或為空', { path: 'items' }));
    }
    const couponCode =
      req.body && req.body.couponCode ? String(req.body.couponCode).trim().toUpperCase() : undefined;

    const result = await pricingService.quote({
      user: req.user || null,
      items,
      couponCode,
      settings: {
        currency: config.publicSettings.currency,
        taxRate: config.publicSettings.taxRate,
        shippingFee: config.publicSettings.shippingFee,
        freeShippingThreshold: config.publicSettings.freeShippingThreshold,
        vipDiscount: config.publicSettings.vipDiscount,
      },
      traceId: req.traceId,
    });

    return res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/v1/coupons/validate
 * query: code, subtotal
 * 回傳優惠券是否有效與預估折抵金額（不改動庫存與使用量）
 */
async function validateCoupon(req, res, next) {
  try {
    const code = req.query && req.query.code ? String(req.query.code).trim().toUpperCase() : '';
    if (!code) {
      return next(makeError(400, 'MISSING_CODE', '缺少優惠碼參數 code', { path: 'code' }));
    }
    const subtotal = req.query && req.query.subtotal !== undefined ? Number(req.query.subtotal) : undefined;
    if (subtotal !== undefined && (Number.isNaN(subtotal) || subtotal < 0)) {
      return next(makeError(400, 'INVALID_SUBTOTAL', 'subtotal 需為非負數字', { path: 'subtotal' }));
    }

    const result = await pricingService.validateCoupon({
      code,
      subtotal,
      user: req.user || null, // 可用於判斷 VIP 專屬券等規則
      traceId: req.traceId,
    });

    return res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  quote,
  validateCoupon,
};