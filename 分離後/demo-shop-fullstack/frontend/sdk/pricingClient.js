/*
 * PricingClient（前端報價與優惠 SDK）
 * - /api/v1/pricing/quote：以後端計價（取代前端商業邏輯）
 * - /api/v1/coupons/validate：檢查優惠碼有效性
 *
 * 使用方式：
 *   const quote = await PricingClient.quote([
 *     { productId: 1, qty: 2 },
 *     { productId: 5, qty: 1 },
 *   ], { couponCode: 'VIP90' });
 *
 *   const v = await PricingClient.validateCoupon({ code: 'VIP90', subtotal: 1200, vip: true });
 */
(function (global) {
  const Api = global.ApiClient;
  if (!Api) throw new Error('PricingClient 需要先載入 ApiClient');

  // 報價（後端計算小計/折扣/運費/稅金/總計）
  async function quote(items, { couponCode } = {}) {
    const payload = {
      items: (Array.isArray(items) ? items : []).map((it) => ({
        productId: Number(it.productId),
        qty: Number(it.qty || 0),
      })),
      couponCode: couponCode ? String(couponCode).trim() : undefined,
    };
    return Api.post('/api/v1/pricing/quote', payload);
  }

  // 優惠碼驗證（GET /coupons/validate?code=...&subtotal=...&vip=...）
  async function validateCoupon({ code, subtotal, vip }) {
    const query = {
      code: String(code || '').trim(),
      subtotal: subtotal != null ? Number(subtotal) : undefined,
      vip: vip ? 1 : 0,
    };
    return Api.get('/api/v1/coupons/validate', { query });
  }

  const PricingClient = {
    quote,
    validateCoupon,
  };

  global.PricingClient = PricingClient;
})(window);