/*
 * 前台頁面（Shop）
 * - 透過 API 取得商品與站台設定
 * - 使用 PricingClient.quote 計算金額
 * - 使用 /checkout 完成下單
 * - 使用 /orders 查詢與 /orders/:id/cancel 取消訂單
 *
 * 依賴：
 * - window.ApiClient
 * - window.AuthClient
 * - window.PricingClient
 * - window.ShopStorage
 */

(function (global) {
  const Api = global.ApiClient;
  const Auth = global.AuthClient;
  const Pricing = global.PricingClient;
  const Store = global.ShopStorage;

  if (!Api || !Auth || !Pricing || !Store) {
    throw new Error('shop.js 需要先載入 ApiClient / AuthClient / PricingClient / storage.js');
  }

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  const state = {
    settings: null,
    products: [],
    keyword: '',
    category: '全部',
    sort: 'default', // default | priceAsc | priceDesc | rating
    coupon: Store.getSession('coupon', ''),
    profile: null,
  };

  // 金額格式
  function money(n) {
    const val = Number(n || 0);
    const cur = state.settings?.currency || 'TWD';
    // 以簡單字首顯示，避免各瀏覽器地區化差異
    return `${cur} ${val.toLocaleString()}`;
  }

  // 初始化站台設定
  async function loadSettings() {
    try {
      const res = await Api.get('/api/v1/public/settings', { noSign: true });
      state.settings = res;
      document.title = state.settings.siteName || 'Shop';
      $('#site-name') && ($('#site-name').textContent = state.settings.siteName || 'Shop');
      const tax = (Number(state.settings.taxRate || 0) * 100).toFixed(0);
      $$('.tax-rate-text').forEach((el) => (el.textContent = `${tax}%`));
    } catch (err) {
      console.warn('載入設定失敗', err);
    }
  }

  // 登入狀態與頁首
  async function renderHeader() {
    let user = null;
    try {
      user = await Auth.profile(); // 需攜帶 JWT + 簽章
      state.profile = user || null;
    } catch (_) {
      state.profile = null;
    }

    const area = $('#user-area');
    if (!area) return;

    if (state.profile) {
      const vip = state.profile.vip ? ' <b class="vip">VIP</b>' : '';
      const adminLink = state.profile.role !== 'customer' ? '<a href="admin.html">後台</a>' : '';
      area.innerHTML = `<span>👋 ${state.profile.name || state.profile.username}${vip}</span>
        <button id="my-orders-btn">我的訂單</button>
        ${adminLink}
        <button id="logout-btn">登出</button>`;
      $('#logout-btn')?.addEventListener('click', async () => {
        await Auth.logout();
        location.reload();
      });
      $('#my-orders-btn')?.addEventListener('click', showMyOrders);
    } else {
      area.innerHTML = '<a href="login.html">登入 / 註冊</a>';
    }
  }

  // 載入與渲染分類
  async function renderCategories() {
    // 以全量或目前篩選取得清單以蒐集分類
    try {
      const list = await Api.get('/api/v1/products', { query: {} });
      // 後端排序/篩選，這裡只做分類列出
      state.products = Array.isArray(list) ? list : [];
      const cats = ['全部', ...Array.from(new Set(state.products.map((p) => p.category).filter(Boolean)))];
      const html = cats
        .map((c) => `<button class="chip ${c === state.category ? 'active' : ''}" data-cat="${encodeURIComponent(c)}">${c}</button>`)
        .join('');
      $('#categories') && ($('#categories').innerHTML = html);
    } catch (err) {
      console.error('載入分類失敗', err);
      $('#categories') && ($('#categories').innerHTML = '<p class="muted">載入分類失敗</p>');
    }
  }

  // 依狀態查詢商品（後端負責搜尋/篩選/排序）
  async function renderProducts() {
    const query = {};
    if (state.keyword) query.keyword = state.keyword;
    if (state.category && state.category !== '全部') query.category = state.category;
    if (state.sort && state.sort !== 'default') query.sort = state.sort;

    const container = $('#products');
    if (!container) return;

    try {
      const list = await Api.get('/api/v1/products', { query });
      state.products = Array.isArray(list) ? list : [];

      container.innerHTML = state.products.length
        ? state.products
            .map(
              (p) => `
        <div class="product">
          <div class="emoji">${p.image || '📦'}</div>
          <h3>${escapeHtml(p.name)}</h3>
          <p class="desc">${escapeHtml(p.description || '')}</p>
          <div class="tags">${(p.tags || []).map((t) => `<span>${escapeHtml(t)}</span>`).join('')}</div>
          <div class="meta"><b>${money(p.price)}</b><span>⭐ ${p.rating || 0}</span></div>
          <div class="stock">${p.stock > 0 ? `庫存 ${p.stock}` : '<span class="out">已售完</span>'}</div>
          <button data-add="${p.id}" ${p.stock === 0 ? 'disabled' : ''}>加入購物車</button>
        </div>`
            )
            .join('')
        : '<p>找不到符合的商品</p>';
    } catch (err) {
      const code = err?.error?.code || err?.status || '';
      if (code === 401 || code === 403) {
        container.innerHTML =
          '<p class="muted">需要登入後才能瀏覽商品，請先 <a href="login.html">登入</a>。</p>';
      } else {
        container.innerHTML = '<p class="muted">載入商品失敗，請稍後再試。</p>';
      }
      console.error('載入商品失敗', err);
    }
  }

  // 渲染購物車（透過後端報價）
  async function renderCart() {
    const cart = Store.getCart();
    const cartCountEl = $('#cart-count');
    if (cartCountEl) cartCountEl.textContent = String(Store.getCartCount(cart));

    const body = $('#cart-body');
    if (!body) return;

    if (!cart.length) {
      body.innerHTML = '<p class="muted">購物車是空的</p>';
      return;
    }

    // 從 session 還原 coupon
    state.coupon = (Store.getSession('coupon', '') || '').toString();

    let quote;
    try {
      quote = await Pricing.quote(cart, { couponCode: state.coupon || undefined });
    } catch (err) {
      console.error('報價失敗', err);
      body.innerHTML = '<p class="error">計價失敗，請稍後重試</p>';
      return;
    }

    const couponErr = quote?.couponError || quote?.coupon_error || '';
    const lines = Array.isArray(quote?.lines) ? quote.lines : [];

    body.innerHTML = `
      ${lines
        .map(
          (l) => `
        <div class="cart-line">
          <span>${escapeHtml(l.name || '')}</span>
          <span><button data-dec="${l.productId}">−</button> ${l.qty} <button data-inc="${l.productId}">＋</button></span>
          <span>${money(l.lineTotal)}</span>
        </div>`
        )
        .join('')}
      <div class="coupon">
        <input id="coupon-input" placeholder="優惠碼" value="${escapeAttr(state.coupon)}" />
        <button id="coupon-apply">套用</button>
      </div>
      ${couponErr ? `<p class="error">${escapeHtml(couponErr)}</p>` : ''}
      <div class="sum"><span>小計</span><span>${money(quote.subtotal)}</span></div>
      <div class="sum"><span>折扣${state.profile?.vip ? '（含 VIP）' : ''}</span><span>-${money(quote.discount)}</span></div>
      <div class="sum"><span>運費</span><span>${money(quote.shipping)}</span></div>
      <div class="sum"><span>稅金 ${((state.settings?.taxRate || 0) * 100).toFixed(0)}%</span><span>${money(quote.tax)}</span></div>
      <div class="sum total"><span>總計</span><span>${money(quote.total)}</span></div>
      <button class="primary" id="checkout-btn">前往結帳</button>`;

    $('#coupon-apply')?.addEventListener('click', () => {
      state.coupon = ($('#coupon-input')?.value || '').trim().toUpperCase();
      Store.setSession('coupon', state.coupon);
      renderCart();
    });
    $('#checkout-btn')?.addEventListener('click', openCheckout);
  }

  // 加入/調整購物車
  function addToCart(productId, delta) {
    Store.updateItem(Number(productId), Number(delta || 1));
  }

  // 結帳流程（顯示 modal，送出 /checkout）
  async function openCheckout() {
    if (!Auth.isLoggedIn()) {
      alert('請先登入');
      location.href = 'login.html';
      return;
    }
    // 確保 profile 可用
    if (!state.profile) {
      try {
        state.profile = await Auth.profile();
      } catch (_) {}
    }
    $('#checkout-modal')?.classList.remove('hidden');
    $('#co-name') && ($('#co-name').value = state.profile?.name || '');
    $('#co-phone') && ($('#co-phone').value = state.profile?.phone || '');
  }

  async function submitCheckout(e) {
    e.preventDefault();
    const btn = $('#co-submit');
    if (btn) {
      btn.disabled = true;
      btn.textContent = '付款中…';
    }
    try {
      const cart = Store.getCart();
      const payload = {
        items: cart.map((i) => ({ productId: Number(i.productId), qty: Number(i.qty) })),
        couponCode: (Store.getSession('coupon', '') || '').trim() || undefined,
        shippingAddress: $('#co-address')?.value || '',
        contact: {
          name: $('#co-name')?.value || '',
          phone: $('#co-phone')?.value || '',
        },
        payment: {
          cardNumber: $('#co-card')?.value || '',
          cardExpiry: $('#co-expiry')?.value || '',
          cardCvc: $('#co-cvc')?.value || '',
        },
      };
      const res = await Api.post('/api/v1/checkout', payload);
      // 成功：清空購物車、關閉 modal、刷新頁面區塊
      Store.clearCart();
      $('#checkout-modal')?.classList.add('hidden');
      await renderProducts();
      alert(`付款成功！訂單編號：${res?.id || res?.orderId || 'N/A'}`);
    } catch (err) {
      console.error('結帳失敗', err);
      const msg = err?.error?.message || err?.message || '結帳失敗，請確認資料或稍後重試';
      alert(msg);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '確認付款';
      }
    }
  }

  // 我的訂單（載入 /orders）
  async function showMyOrders() {
    const body = $('#orders-body');
    if (!body) return;
    body.innerHTML = '<p class="muted">載入中…</p>';
    try {
      const orders = await Api.get('/api/v1/orders');
      const statusText = { pending: '待付款', paid: '已付款', shipped: '已出貨', completed: '已完成', cancelled: '已取消' };
      if (!Array.isArray(orders) || orders.length === 0) {
        body.innerHTML = '<p class="muted">尚無訂單</p>';
      } else {
        body.innerHTML = orders
          .map(
            (o) => `
          <div class="order">
            <div><b>${escapeHtml(o.id)}</b> <span class="status ${escapeHtml(o.status)}">${statusText[o.status] || o.status}</span></div>
            <div class="muted">${escapeHtml(o.createdAt || '')}</div>
            <div>${(o.items || []).map((i) => `${escapeHtml(i.name || `#${i.productId}`)} × ${i.qty}`).join('、')}</div>
            <div>總計 <b>${money(o.total)}</b></div>
            ${o.status === 'paid' ? `<button data-cancel="${escapeAttr(o.id)}">取消訂單</button>` : ''}
          </div>`
          )
          .join('');
      }
      $('#orders-modal')?.classList.remove('hidden');
    } catch (err) {
      console.error('載入訂單失敗', err);
      body.innerHTML = '<p class="muted">載入失敗，請稍後再試</p>';
    }
  }

  async function cancelOrder(orderId) {
    if (!confirm('確定取消此訂單？')) return;
    try {
      await Api.post(`/api/v1/orders/${encodeURIComponent(orderId)}/cancel`, {});
      await showMyOrders();
      await renderProducts();
    } catch (err) {
      console.error('取消訂單失敗', err);
      alert(err?.error?.message || '取消失敗，請稍後重試');
    }
  }

  // HTML 安全轉譯
  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, '&quot;');
  }

  // 綁定事件
  function bindEvents() {
    $('#search')?.addEventListener('input', (e) => {
      state.keyword = e.target.value || '';
      renderProducts();
    });
    $('#sort')?.addEventListener('change', (e) => {
      state.sort = e.target.value || 'default';
      renderProducts();
    });
    $('#categories')?.addEventListener('click', (e) => {
      const el = e.target.closest('[data-cat]');
      if (!el) return;
      state.category = decodeURIComponent(el.dataset.cat || '全部');
      renderCategories(); // 重新標示 active
      renderProducts();
    });
    $('#products')?.addEventListener('click', (e) => {
      const inc = e.target.closest('[data-add]');
      if (inc) addToCart(Number(inc.dataset.add), 1);
    });
    $('#cart-body')?.addEventListener('click', (e) => {
      const inc = e.target.closest('[data-inc]');
      const dec = e.target.closest('[data-dec]');
      if (inc) addToCart(Number(inc.dataset.inc), 1);
      if (dec) addToCart(Number(dec.dataset.dec), -1);
    });
    $('#orders-body')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-cancel]');
      if (btn) cancelOrder(btn.dataset.cancel);
    });
    $('#checkout-form')?.addEventListener('submit', submitCheckout);
    $('#show-orders')?.addEventListener('click', showMyOrders);
    $('#open-checkout')?.addEventListener('click', openCheckout);

    // 關閉 modal
    document.querySelectorAll('[data-close]')?.forEach((b) =>
      b.addEventListener('click', () => b.closest('.modal')?.classList.add('hidden'))
    );

    // 監聽購物車變更
    global.addEventListener('storage:cart', () => renderCart());
  }

  // 啟動
  document.addEventListener('DOMContentLoaded', async () => {
    // 若前端提供 baseURL 覆蓋，可在此套用
    const savedBase = Store.getBaseURL();
    if (savedBase && Api.setBaseURL) Api.setBaseURL(savedBase);

    await loadSettings();
    await renderHeader();
    await renderCategories();
    await renderProducts();
    await renderCart();
    bindEvents();
  });
})(window);