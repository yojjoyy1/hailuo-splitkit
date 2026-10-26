// 價格計算、優惠券驗證（商業邏輯在前端）
window.Pricing = {
  validateCoupon(code, subtotal, user) {
    if (!code) return { ok: true, coupon: null };
    const coupon = DB.find('coupons', (c) => c.code === code.trim().toUpperCase());
    if (!coupon) return { ok: false, message: '優惠碼不存在' };
    if (!coupon.active) return { ok: false, message: '優惠碼已停用' };
    if (new Date(coupon.expiresAt) < new Date()) return { ok: false, message: '優惠碼已過期' };
    if (coupon.used >= coupon.usageLimit) return { ok: false, message: '優惠碼已被領完' };
    if (subtotal < coupon.minSpend) return { ok: false, message: `需滿 $${coupon.minSpend} 才能使用` };
    if (coupon.vipOnly && !user?.vip) return { ok: false, message: '此優惠碼限 VIP 使用' };
    return { ok: true, coupon };
  },

  calculate(cartItems, user, couponCode) {
    const lines = cartItems.map((item) => {
      const p = DB.find('products', (x) => x.id === item.productId);
      return { productId: p.id, name: p.name, qty: item.qty, price: p.price, lineTotal: p.price * item.qty };
    });
    const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);

    let discount = 0;
    if (user?.vip) discount += Math.round(subtotal * (1 - APP_CONFIG.vipDiscount));

    const couponResult = this.validateCoupon(couponCode, subtotal, user);
    if (couponResult.ok && couponResult.coupon) {
      const c = couponResult.coupon;
      discount += c.type === 'percent' ? Math.round(subtotal * c.value / 100) : c.value;
    }
    discount = Math.min(discount, subtotal);

    const afterDiscount = subtotal - discount;
    const shipping = afterDiscount >= APP_CONFIG.freeShippingThreshold || afterDiscount === 0 ? 0 : APP_CONFIG.shippingFee;
    const tax = Math.round(afterDiscount * APP_CONFIG.taxRate);
    const total = afterDiscount + shipping + tax;

    return { lines, subtotal, discount, shipping, tax, total, couponError: couponResult.ok ? null : couponResult.message };
  },
};
