/*
 * order.controller.js
 * 訂單與結帳控制器
 * - POST /api/v1/checkout
 * - GET  /api/v1/orders
 * - POST /api/v1/orders/:id/cancel
 * - GET  /api/v1/admin/orders
 * - PATCH /api/v1/admin/orders/:id/status
 */

'use strict';

const orderService = require('../services/order.service');

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
 * POST /api/v1/checkout
 * body: { items: [{ productId, qty }], couponCode?, payment: { method, cardNo?, exp?, cvv? }, shipping: { name, phone, address } }
 * 完成：庫存檢查與扣除、優惠券核銷遞增、建立訂單、金流代扣（mock）、簡訊通知
 */
async function checkout(req, res, next) {
  try {
    const user = req.user;
    if (!user || !user.id) {
      return next(makeError(401, 'UNAUTHORIZED', '請先登入'));
    }

    const items = normalizeItems(req.body && req.body.items);
    if (!items || items.length === 0) {
      return next(makeError(400, 'INVALID_ITEMS', '購物車品項無效或為空', { path: 'items' }));
    }

    const couponCode =
      req.body && req.body.couponCode ? String(req.body.couponCode).trim().toUpperCase() : undefined;

    const payment = req.body && req.body.payment ? req.body.payment : {};
    const shipping = req.body && req.body.shipping ? req.body.shipping : {};

    // 基本欄位檢核（詳細規則由 service 進一步驗證）
    if (!shipping || !shipping.name || !shipping.phone || !shipping.address) {
      return next(
        makeError(400, 'INVALID_SHIPPING', '缺少收件資訊 name/phone/address', { path: 'shipping' })
      );
    }
    if (!payment || !payment.method) {
      return next(makeError(400, 'INVALID_PAYMENT', '缺少付款方式 method', { path: 'payment' }));
    }

    const order = await orderService.checkout({
      user,
      items,
      couponCode,
      payment,
      shipping,
      traceId: req.traceId,
    });

    return res.status(201).json({
      success: true,
      data: order,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/v1/orders
 * 我的訂單列表（僅限目前登入者）
 * query: page=1, pageSize=50, sort=-createdAt
 */
async function getMyOrders(req, res, next) {
  try {
    const user = req.user;
    if (!user || !user.id) {
      return next(makeError(401, 'UNAUTHORIZED', '請先登入'));
    }

    const page = req.query.page ? Number(req.query.page) : 1;
    const pageSize = req.query.pageSize ? Number(req.query.pageSize) : 50;
    const sort = req.query.sort || '-createdAt';

    const result = await orderService.listByUser({
      userId: String(user.id),
      page: Number.isNaN(page) ? 1 : page,
      pageSize: Number.isNaN(pageSize) ? 50 : pageSize,
      sort,
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
 * POST /api/v1/orders/:id/cancel
 * 僅限本人、且狀態允許取消，並退回庫存
 */
async function cancelOrder(req, res, next) {
  try {
    const user = req.user;
    if (!user || !user.id) {
      return next(makeError(401, 'UNAUTHORIZED', '請先登入'));
    }

    const orderId = String(req.params.id || '').trim();
    if (!orderId) {
      return next(makeError(400, 'INVALID_ORDER_ID', '訂單編號無效', { path: 'id' }));
    }

    const result = await orderService.cancel({
      userId: String(user.id),
      orderId,
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
 * GET /api/v1/admin/orders
 * 後台訂單查詢（需 admin/staff 權限；RBAC 由中介層保護）
 * query: status?, keyword?, sort?, page?, pageSize?
 */
async function adminListOrders(req, res, next) {
  try {
    const { status, keyword, sort = '-createdAt' } = req.query;
    const page = req.query.page ? Number(req.query.page) : 1;
    const pageSize = req.query.pageSize ? Number(req.query.pageSize) : 50;

    const result = await orderService.listAdmin({
      filters: { status: status || undefined, keyword: keyword || undefined },
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
 * PATCH /api/v1/admin/orders/:id/status
 * body: { status }
 * 狀態更新（例如：paid -> shipped 觸發簡訊）；RBAC 由中介層保護
 */
async function adminUpdateStatus(req, res, next) {
  try {
    const orderId = String(req.params.id || '').trim();
    if (!orderId) {
      return next(makeError(400, 'INVALID_ORDER_ID', '訂單編號無效', { path: 'id' }));
    }
    const status = req.body && req.body.status ? String(req.body.status).trim() : '';
    if (!status) {
      return next(makeError(400, 'INVALID_STATUS', '缺少狀態參數 status', { path: 'status' }));
    }

    const result = await orderService.updateStatus({
      orderId,
      status,
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
  checkout,
  getMyOrders,
  cancelOrder,
  adminListOrders,
  adminUpdateStatus,
};