(function () {
  const CART_KEY = 'hailuo_shop_cart';
  const $ = (s) => document.querySelector(s);
  const money = (n) => '$' + Number(n).toLocaleString();

  let state = { keyword: '', category: '全部', sort: 'default', coupon: '' };

  function getCart() {
    return JSON.parse(localStorage.getItem(CART_KEY) || '[]');
  }
  function setCart(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    renderCart();
  }

  // 商品搜尋/篩選/排序（應由後端處理）
  function queryProducts() {
    let list = DB.all('products');
    if (state.keyword) {
      const kw = state.keyword.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(kw) || p.description.includes(kw) || p.tags.some((t) => t.includes(kw)));
    }
    if (state.category !== '全部') list = list.filter((p) => p.category === state.category);
    const sorters = {
      priceAsc: (a, b) => a.price - b.price,
      priceDesc: (a, b) => b.price - a.price,
      rating: (a, b) => b.rating - a.rating,
      default: (a, b) => a.id - b.id,
    };
    return list.sort(sorters[state.sort]);
  }

  function renderHeader() {
    const user = Auth.currentUser();
    $('#user-area').innerHTML = user
      ? `<span>👋 ${user.name}${user.vip ? ' <b class="vip">VIP</b>' : ''}</span>
         <button id="my-orders-btn">我的訂單</button>
         ${user.role !== 'customer' ? '<a href="admin.html">後台</a>' : ''}
         <button id="logout-btn">登出</button>`
      : '<a href="login.html">登入 / 註冊</a>';
    $('#logout-btn')?.addEventListener('click', () => { Auth.logout(); location.reload(); });
    $('#my-orders-btn')?.addEventListener('click', showMyOrders);
  }

  function renderCategories() {
    const cats = ['全部', ...new Set(DB.all('products').map((p) => p.category))];
    $('#categories').innerHTML = cats
      .map((c) => `<button class="chip ${c === state.category ? 'active' : ''}" data-cat="${c}">${c}</button>`)
      .join('');
  }

  function renderProducts() {
    const list = queryProducts();
    $('#products').innerHTML = list.length
      ? list.map((p) => `
        <div class="product">
          <div class="emoji">${p.image}</div>
          <h3>${p.name}</h3>
          <p class="desc">${p.description}</p>
          <div class="tags">${p.tags.map((t) => `<span>${t}</span>`).join('')}</div>
          <div class="meta"><b>${money(p.price)}</b><span>⭐ ${p.rating}</span></div>
          <div class="stock">${p.stock > 0 ? `庫存 ${p.stock}` : '<span class="out">已售完</span>'}</div>
          <button data-add="${p.id}" ${p.stock === 0 ? 'disabled' : ''}>加入購物車</button>
        </div>`).join('')
      : '<p>找不到符合的商品</p>';
  }

  function renderCart() {
    const cart = getCart();
    $('#cart-count').textContent = cart.reduce((n, i) => n + i.qty, 0);
    if (!cart.length) {
      $('#cart-body').innerHTML = '<p class="muted">購物車是空的</p>';
      return;
    }
    const user = Auth.currentUser();
    const calc = Pricing.calculate(cart, user, state.coupon);
    $('#cart-body').innerHTML = `
      ${calc.lines.map((l) => `
        <div class="cart-line">
          <span>${l.name}</span>
          <span><button data-dec="${l.productId}">−</button> ${l.qty} <button data-inc="${l.productId}">＋</button></span>
          <span>${money(l.lineTotal)}</span>
        </div>`).join('')}
      <div class="coupon">
        <input id="coupon-input" placeholder="優惠碼" value="${state.coupon}" />
        <button id="coupon-apply">套用</button>
      </div>
      ${calc.couponError ? `<p class="error">${calc.couponError}</p>` : ''}
      <div class="sum"><span>小計</span><span>${money(calc.subtotal)}</span></div>
      <div class="sum"><span>折扣${user?.vip ? '（含 VIP 9 折）' : ''}</span><span>-${money(calc.discount)}</span></div>
      <div class="sum"><span>運費</span><span>${money(calc.shipping)}</span></div>
      <div class="sum"><span>稅金 ${APP_CONFIG.taxRate * 100}%</span><span>${money(calc.tax)}</span></div>
      <div class="sum total"><span>總計</span><span>${money(calc.total)}</span></div>
      <button class="primary" id="checkout-btn">前往結帳</button>`;
    $('#coupon-apply').addEventListener('click', () => {
      state.coupon = $('#coupon-input').value.trim().toUpperCase();
      renderCart();
    });
    $('#checkout-btn').addEventListener('click', openCheckout);
  }

  function addToCart(productId, delta) {
    const product = DB.find('products', (p) => p.id === productId);
    const cart = getCart();
    const item = cart.find((i) => i.productId === productId);
    const nextQty = (item?.qty || 0) + delta;
    if (nextQty > product.stock) return alert('庫存不足');
    if (item) item.qty = nextQty;
    else cart.push({ productId, qty: nextQty });
    setCart(cart.filter((i) => i.qty > 0));
  }

  function openCheckout() {
    const user = Auth.currentUser();
    if (!user) {
      alert('請先登入');
      location.href = 'login.html';
      return;
    }
    $('#checkout-modal').classList.remove('hidden');
    $('#co-name').value = user.name;
    $('#co-phone').value = user.phone;
  }

  // 結帳：檢查庫存、扣庫存、建立訂單、呼叫金流（全部在前端）
  async function submitCheckout(e) {
    e.preventDefault();
    const user = Auth.currentUser();
    const cart = getCart();
    const calc = Pricing.calculate(cart, user, state.coupon);
    if (calc.couponError) return alert(calc.couponError);

    for (const item of cart) {
      const p = DB.find('products', (x) => x.id === item.productId);
      if (p.stock < item.qty) return alert(`${p.name} 庫存不足`);
    }

    const orderId = `ORD-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(DB.all('orders').length + 1).padStart(3, '0')}`;
    $('#co-submit').disabled = true;
    $('#co-submit').textContent = '付款中…';

    const pay = await Payment.charge({
      orderId,
      amount: calc.total,
      cardNumber: $('#co-card').value,
      cardExpiry: $('#co-expiry').value,
      cardCvc: $('#co-cvc').value,
    });

    $('#co-submit').disabled = false;
    $('#co-submit').textContent = '確認付款';
    if (!pay.success) return alert(pay.message);

    for (const item of cart) {
      const p = DB.find('products', (x) => x.id === item.productId);
      DB.update('products', (x) => x.id === p.id, { stock: p.stock - item.qty });
    }
    if (state.coupon) {
      const c = DB.find('coupons', (x) => x.code === state.coupon);
      DB.update('coupons', (x) => x.code === state.coupon, { used: c.used + 1 });
    }

    DB.insert('orders', {
      id: orderId,
      userId: user.id,
      items: calc.lines.map((l) => ({ productId: l.productId, qty: l.qty, price: l.price })),
      subtotal: calc.subtotal,
      discount: calc.discount,
      shipping: calc.shipping,
      tax: calc.tax,
      total: calc.total,
      coupon: state.coupon || null,
      status: 'paid',
      paymentRef: pay.paymentRef,
      shippingAddress: $('#co-address').value,
      createdAt: new Date().toLocaleString('sv').slice(0, 16),
    });

    sendSms(user.phone, `訂單 ${orderId} 已付款成功，金額 ${calc.total}`);
    state.coupon = '';
    setCart([]);
    $('#checkout-modal').classList.add('hidden');
    renderProducts();
    alert(`付款成功！訂單編號：${orderId}`);
  }

  function showMyOrders() {
    const user = Auth.currentUser();
    const orders = DB.all('orders').filter((o) => o.userId === user.id).reverse();
    const statusText = { pending: '待付款', paid: '已付款', shipped: '已出貨', completed: '已完成', cancelled: '已取消' };
    $('#orders-body').innerHTML = orders.length
      ? orders.map((o) => `
        <div class="order">
          <div><b>${o.id}</b> <span class="status ${o.status}">${statusText[o.status]}</span></div>
          <div class="muted">${o.createdAt}</div>
          <div>${o.items.map((i) => `${DB.find('products', (p) => p.id === i.productId)?.name} × ${i.qty}`).join('、')}</div>
          <div>總計 <b>${money(o.total)}</b></div>
          ${o.status === 'paid' ? `<button data-cancel="${o.id}">取消訂單</button>` : ''}
        </div>`).join('')
      : '<p class="muted">尚無訂單</p>';
    $('#orders-modal').classList.remove('hidden');
  }

  function cancelOrder(orderId) {
    if (!confirm('確定取消此訂單？')) return;
    const order = DB.find('orders', (o) => o.id === orderId);
    // 退回庫存
    for (const item of order.items) {
      const p = DB.find('products', (x) => x.id === item.productId);
      DB.update('products', (x) => x.id === p.id, { stock: p.stock + item.qty });
    }
    DB.update('orders', (o) => o.id === orderId, { status: 'cancelled' });
    showMyOrders();
    renderProducts();
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.title = APP_CONFIG.siteName;
    $('#site-name').textContent = APP_CONFIG.siteName;
    renderHeader();
    renderCategories();
    renderProducts();
    renderCart();

    $('#search').addEventListener('input', (e) => { state.keyword = e.target.value; renderProducts(); });
    $('#sort').addEventListener('change', (e) => { state.sort = e.target.value; renderProducts(); });
    $('#categories').addEventListener('click', (e) => {
      const cat = e.target.dataset.cat;
      if (!cat) return;
      state.category = cat;
      renderCategories();
      renderProducts();
    });
    $('#products').addEventListener('click', (e) => {
      if (e.target.dataset.add) addToCart(Number(e.target.dataset.add), 1);
    });
    $('#cart-body').addEventListener('click', (e) => {
      if (e.target.dataset.inc) addToCart(Number(e.target.dataset.inc), 1);
      if (e.target.dataset.dec) addToCart(Number(e.target.dataset.dec), -1);
    });
    $('#orders-body').addEventListener('click', (e) => {
      if (e.target.dataset.cancel) cancelOrder(e.target.dataset.cancel);
    });
    $('#checkout-form').addEventListener('submit', submitCheckout);
    document.querySelectorAll('[data-close]').forEach((b) =>
      b.addEventListener('click', () => b.closest('.modal').classList.add('hidden'))
    );
  });
})();
