/*
 * coupon.controller.js
 * 優惠券控制器（後台）
 * - GET  /api/v1/admin/coupons
 * - PATCH /api/v1/admin/coupons/:code/toggle
 */

'use strict';

const couponService = require('../services/coupon.service');

function makeError(status, code, message, details) {
  const err = new Error(message || code || 'Error');
  err.status = status || 500;
  err.code = code || 'ERROR';
  if (details) err.details = details;
  return err;
}

/**
 * GET /api/v1/admin/coupons
 * 可支援基本篩選與分頁
 * query: enabled?, keyword?, page=1, pageSize=50, sort=-createdAt
 */
async function listAdminCoupons(req, res, next) {
  try {
    const enabled =
      req.query.enabled === undefined
        ? undefined
        : String(req.query.enabled).toLowerCase() === 'true';
    const keyword = req.query.keyword ? String(req.query.keyword).trim() : undefined;
    const sort = req.query.sort || '-createdAt';
    const page = req.query.page ? Number(req.query.page) : 1;
    const pageSize = req.query.pageSize ? Number(req.query.pageSize) : 50;

    const result = await couponService.list({
      filters: { enabled, keyword },
      sort,
      page: Number.isNaN(page) ? 1 : page,
      pageSize: Number.isNaN(pageSize) ? 50 : pageSize,
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
 * PATCH /api/v1/admin/coupons/:code/toggle
 * 切換啟用/停用狀態（admin/staff）
 */
async function toggleCoupon(req, res, next) {
  try {
    const code = req.params && req.params.code ? String(req.params.code).trim().toUpperCase() : '';
    if (!code) {
      return next(makeError(400, 'INVALID_CODE', '優惠碼無效', { path: 'code' }));
    }

    const result = await couponService.toggle({
      code,
      actor: req.user || null,
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
  listAdminCoupons,
  toggleCoupon,
};