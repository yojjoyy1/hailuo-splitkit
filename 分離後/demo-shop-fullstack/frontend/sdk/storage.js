/*
 * ShopStorage（前端 storage 輔助）
 * - 管理購物車（localStorage）
 * - 管理頁面用的 session 狀態（sessionStorage）
 * - 變更時會觸發事件：storage:cart（detail = { cart, count }）
 *
 * 使用：
 *   const cart = ShopStorage.getCart();
 *   ShopStorage.setCart([{ productId: 1, qty: 2 }]);
 *   ShopStorage.updateItem(5, 1); // 指定商品數量 +1
 *   ShopStorage.clearCart();
 *
 *   ShopStorage.setSession('coupon', 'VIP90');
 *   const c = ShopStorage.getSession('coupon');
 */

(function (global) {
  const CART_KEY = 'demo_shop_cart_v1';
  const BASEURL_KEY = 'demo_shop_baseurl_v1'; // 選用：用於切換後端位址（若需要）
  const SESSION_PREFIX = 'demo_shop_sess_';

  // 內部工具
  function parseJSON(str, defVal) {
    try {
      const v = JSON.parse(str);
      return v == null ? defVal : v;
    } catch (_) {
      return defVal;
    }
  }

  function sanitizeCart(arr) {
    if (!Array.isArray(arr)) return [];
    return arr
      .map((it) => ({
        productId: Number(it.productId),
        qty: Math.max(0, Number(it.qty || 0)),
      }))
      .filter((it) => Number.isFinite(it.productId) && it.qty > 0);
  }

  function dispatchCartEvent(cart) {
    try {
      const ev = new CustomEvent('storage:cart', {
        detail: { cart, count: getCartCount(cart) },
      });
      global.dispatchEvent(ev);
    } catch (_) {
      // ignore
    }
  }

  function getCartCount(cart) {
    const c = cart || getCart();
    return c.reduce((n, i) => n + (Number(i.qty) || 0), 0);
  }

  // 購物車
  function getCart() {
    return sanitizeCart(parseJSON(localStorage.getItem(CART_KEY), []));
  }

  function setCart(cart) {
    const clean = sanitizeCart(cart);
    localStorage.setItem(CART_KEY, JSON.stringify(clean));
    dispatchCartEvent(clean);
    return clean;
  }

  // 調整單品數量（不存在則新增）
  function updateItem(productId, delta) {
    const pid = Number(productId);
    const d = Number(delta || 0);
    if (!Number.isFinite(pid) || !Number.isFinite(d) || d === 0) return getCart();
    const cart = getCart();
    const idx = cart.findIndex((i) => i.productId === pid);
    if (idx >= 0) {
      cart[idx].qty = Math.max(0, (cart[idx].qty || 0) + d);
      if (cart[idx].qty === 0) cart.splice(idx, 1);
    } else if (d > 0) {
      cart.push({ productId: pid, qty: d });
    }
    return setCart(cart);
  }

  function setItemQty(productId, qty) {
    const pid = Number(productId);
    const q = Math.max(0, Number(qty || 0));
    const cart = getCart();
    const idx = cart.findIndex((i) => i.productId === pid);
    if (idx >= 0) {
      if (q === 0) cart.splice(idx, 1);
      else cart[idx].qty = q;
    } else if (q > 0) {
      cart.push({ productId: pid, qty: q });
    }
    return setCart(cart);
  }

  function clearCart() {
    localStorage.removeItem(CART_KEY);
    dispatchCartEvent([]);
  }

  // Session 狀態（存在 sessionStorage）
  function setSession(key, value) {
    const k = SESSION_PREFIX + String(key || '').trim();
    if (!k) return;
    sessionStorage.setItem(k, JSON.stringify(value));
    return value;
  }

  function getSession(key, defVal = null) {
    const k = SESSION_PREFIX + String(key || '').trim();
    if (!k) return defVal;
    return parseJSON(sessionStorage.getItem(k), defVal);
  }

  function clearSession(key) {
    const k = SESSION_PREFIX + String(key || '').trim();
    sessionStorage.removeItem(k);
  }

  function clearAllSessions() {
    Object.keys(sessionStorage).forEach((k) => {
      if (k && k.startsWith(SESSION_PREFIX)) sessionStorage.removeItem(k);
    });
  }

  // BaseURL（選用）：可在前端切換 API 來源（若 ApiClient 未另行管理）
  function setBaseURL(url) {
    localStorage.setItem(BASEURL_KEY, String(url || '').trim());
  }
  function getBaseURL() {
    return localStorage.getItem(BASEURL_KEY) || '';
  }
  function removeBaseURL() {
    localStorage.removeItem(BASEURL_KEY);
  }

  const ShopStorage = {
    // Cart
    getCart,
    setCart,
    updateItem,
    setItemQty,
    clearCart,
    getCartCount,

    // Session
    setSession,
    getSession,
    clearSession,
    clearAllSessions,

    // Optional baseURL override
    setBaseURL,
    getBaseURL,
    removeBaseURL,
  };

  global.ShopStorage = ShopStorage;
})(window);