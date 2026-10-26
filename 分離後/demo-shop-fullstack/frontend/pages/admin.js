/*
 * 後台頁面（Admin）
 * - 需具備 admin 或 staff 角色
 * - 呼叫 /admin/* 系列 API 進行管理與匯出
 *
 * 依賴：
 * - window.ApiClient
 * - window.AuthClient
 * - window.ShopStorage（選用：無直接依賴）
 */

(function (global) {
  const Api = global.ApiClient;
  const Auth = global.AuthClient;
  if (!Api || !Auth) throw new Error('admin.js 需要先載入 ApiClient / AuthClient');

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  let currentUser = null;
  let settings = null;
  let productsCache = [];

  const statusText = { pending: '待付款', paid: '已付款', shipped: '已出貨', completed: '已完成', cancelled: '已取消' };

  function money(n) {
    const cur = settings?.currency || 'TWD';
    return `${cur} ${Number(n || 0).toLocaleString()}`;
  }

  async function loadSettings() {
    try {
      settings = await Api.get('/api/v1/public/settings', { noSign: true });
    } catch (_) {
      settings = { currency: 'TWD' };
    }
  }

  async function ensureAdmin() {
    try {
      const u = await Auth.profile();
      if (!u || !['admin', 'staff'].includes(u.role)) throw new Error('FORBIDDEN');
      currentUser = u;
      $('#admin-name') && ($('#admin-name').textContent = `${u.name || u.username}（${u.role}）`);
    } catch (err) {
      alert('權限不足或尚未登入，請先登入');
      location.href = 'login.html';
      throw err;
    }
  }

  // Stats
  async function renderStats() {
    try {
      const s = await Api.get('/api/v1/admin/stats');
      $('#stats').innerHTML = `
        <div class="stat"><span>營收</span><b>${money(s.revenue)}</b></div>
        <div class="stat"><span>毛利</span><b>${money(s.profit)}</b></div>
        <div class="stat"><span>有效訂單</span><b>${s.orderCount}</b></div>
        <div class="stat"><span>平均客單價</span><b>${money(s.avgOrder)}</b></div>
        <div class="stat"><span>會員數</span><b>${s.userCount}</b></div>`;
      $('#top-products').innerHTML = (s.topProducts || [])
        .map((p) => `<li>${escapeHtml(p.name)}：${p.qty} 件</li>`)
        .join('');
      $('#low-stock').innerHTML =
        (s.lowStock || []).map((p) => `<li>${escapeHtml(p.name)}（剩 ${p.stock}）</li>`).join('') || '<li>無</li>';
    } catch (err) {
      console.error('載入統計失敗', err);
      $('#stats').innerHTML = '<p class="muted">載入統計失敗</p>';
      $('#top-products').innerHTML = '';
      $('#low-stock').innerHTML = '';
    }
  }

  // Orders
  async function renderOrders() {
    try {
      const filter = $('#order-filter')?.value || 'all';
      const query = {};
      if (filter !== 'all') query.status = filter;
      const orders = await Api.get('/api/v1/admin/orders', { query });
      $('#orders-table').innerHTML = (orders || [])
        .map(
          (o) => `
        <tr>
          <td>${escapeHtml(o.id)}</td>
          <td>${escapeHtml(o.user?.name || '-')}${o.user?.phone ? `<br><small>${escapeHtml(o.user.phone)}</small>` : ''}</td>
          <td>${money(o.total)}</td>
          <td>${o.coupon ? escapeHtml(o.coupon) : '-'}</td>
          <td>${escapeHtml(o.createdAt || '')}</td>
          <td>
            <select data-order="${escapeAttr(o.id)}">
              ${Object.entries(statusText)
                .map(([k, v]) => `<option value="${k}" ${k === o.status ? 'selected' : ''}>${v}</option>`)
                .join('')}
            </select>
          </td>
        </tr>`
        )
        .join('');
    } catch (err) {
      console.error('載入訂單失敗', err);
      $('#orders-table').innerHTML = '<tr><td colspan="6" class="muted">載入失敗</td></tr>';
    }
  }

  async function updateOrderStatus(orderId, status) {
    try {
      await Api.patch(`/api/v1/admin/orders/${encodeURIComponent(orderId)}/status`, { status });
      await renderStats(); // 狀態變動可能影響統計
    } catch (err) {
      console.error('更新狀態失敗', err);
      alert(err?.error?.message || '更新訂單狀態失敗');
    }
  }

  // Users
  async function renderUsers() {
    try {
      const users = await Api.get('/api/v1/admin/users');
      $('#users-table').innerHTML = (users || [])
        .map(
          (u) => `
        <tr>
          <td>${u.id}</td><td>${escapeHtml(u.username || '')}</td><td>${u.password ? `<code>${escapeHtml(u.password)}</code>` : '-'}</td>
          <td>${escapeHtml(u.name || '')}</td><td>${escapeHtml(u.email || '')}</td><td>${escapeHtml(u.role || '')}</td>
          <td>${u.vip ? '✅' : ''}</td><td>${u.status === 'banned' ? '⛔ 停權' : '正常'}</td>
          <td>
            ${
              currentUser.role === 'admin'
                ? `
              <button data-vip="${u.id}">${u.vip ? '取消 VIP' : '設為 VIP'}</button>
              <button data-ban="${u.id}">${u.status === 'banned' ? '解除停權' : '停權'}</button>
              <button data-del-user="${u.id}">刪除</button>`
                : '-'
            }
          </td>
        </tr>`
        )
        .join('');
    } catch (err) {
      console.error('載入會員失敗', err);
      $('#users-table').innerHTML = '<tr><td colspan="9" class="muted">載入失敗</td></tr>';
    }
  }

  async function toggleVip(userId, nextVip) {
    try {
      await Api.patch(`/api/v1/admin/users/${userId}`, { vip: !!nextVip });
      await renderUsers();
    } catch (err) {
      console.error('切換 VIP 失敗', err);
      alert(err?.error?.message || '切換 VIP 失敗');
    }
  }

  async function toggleBan(userId, banned) {
    try {
      await Api.patch(`/api/v1/admin/users/${userId}`, { status: banned ? 'banned' : 'active' });
      await renderUsers();
    } catch (err) {
      console.error('切換停權失敗', err);
      alert(err?.error?.message || '切換停權失敗');
    }
  }

  async function deleteUser(userId) {
    try {
      await Api.delete(`/api/v1/admin/users/${userId}`);
      await renderUsers();
    } catch (err) {
      console.error('刪除會員失敗', err);
      alert(err?.error?.message || '刪除會員失敗');
    }
  }

  // Products
  async function loadProducts() {
    try {
      productsCache = await Api.get('/api/v1/products', { query: {} });
    } catch (_) {
      productsCache = [];
    }
  }

  async function renderProducts() {
    await loadProducts();
    $('#products-table').innerHTML = (productsCache || [])
      .map(
        (p) => `
      <tr>
        <td>${escapeHtml(p.sku || '')}</td><td>${escapeHtml(p.image || '📦')} ${escapeHtml(p.name || '')}</td><td>${escapeHtml(p.category || '')}</td>
        <td><input type="number" value="${Number(p.price || 0)}" data-price="${p.id}" style="width:80px"></td>
        <td>${money(p.cost || 0)}</td>
        <td><input type="number" value="${Number(p.stock || 0)}" data-stock="${p.id}" style="width:70px"></td>
        <td>${p.price ? Math.round((1 - (p.cost || 0) / p.price) * 100) : 0}%</td>
        <td>${currentUser.role === 'admin' ? `<button data-del-product="${p.id}">刪除</button>` : '-'}</td>
      </tr>`
      )
      .join('');
  }

  async function addProduct(e) {
    e.preventDefault();
    const f = e.target;
    const payload = {
      sku: f.sku?.value || undefined,
      name: f.name?.value || '',
      category: f.category?.value || '',
      price: Number(f.price?.value || 0),
      cost: Number(f.cost?.value || 0),
      stock: Number(f.stock?.value || 0),
      rating: Number(f.rating?.value || 0),
      image: f.image?.value || '📦',
      tags: (f.tags?.value || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      description: f.description?.value || '',
    };
    try {
      await Api.post('/api/v1/admin/products', payload);
      f.reset();
      await renderProducts();
      await renderStats(); // 可能影響庫存統計
    } catch (err) {
      console.error('新增商品失敗', err);
      alert(err?.error?.message || '新增商品失敗');
    }
  }

  async function updateProductField(id, patch) {
    try {
      await Api.patch(`/api/v1/admin/products/${id}`, patch);
      await renderStats(); // 低庫存/毛利等可能受影響
    } catch (err) {
      console.error('更新商品失敗', err);
      alert(err?.error?.message || '更新商品失敗');
    }
  }

  async function deleteProduct(id) {
    try {
      await Api.delete(`/api/v1/admin/products/${id}`);
      await renderProducts();
      await renderStats();
    } catch (err) {
      console.error('刪除商品失敗', err);
      alert(err?.error?.message || '刪除商品失敗');
    }
  }

  // Coupons
  async function renderCoupons() {
    try {
      const list = await Api.get('/api/v1/admin/coupons');
      $('#coupons-table').innerHTML = (list || [])
        .map(
          (c) => `
        <tr>
          <td><b>${escapeHtml(c.code)}</b></td>
          <td>${c.type === 'percent' ? `${c.value}%` : money(c.value)}</td>
          <td>${money(c.minSpend || 0)}</td><td>${c.used || 0} / ${c.usageLimit || 0}</td><td>${escapeHtml(c.expiresAt || '')}</td>
          <td>${c.vipOnly ? 'VIP' : '全部'}</td>
          <td><button data-toggle-coupon="${escapeAttr(c.code)}">${c.active ? '停用' : '啟用'}</button></td>
        </tr>`
        )
        .join('');
    } catch (err) {
      console.error('載入優惠券失敗', err);
      $('#coupons-table').innerHTML = '<tr><td colspan="7" class="muted">載入失敗</td></tr>';
    }
  }

  async function toggleCoupon(code) {
    try {
      await Api.patch(`/api/v1/admin/coupons/${encodeURIComponent(code)}/toggle`, {});
      await renderCoupons();
    } catch (err) {
      console.error('切換優惠券失敗', err);
      alert(err?.error?.message || '切換優惠券失敗');
    }
  }

  // 匯出 CSV（需要帶 JWT + 簽章）
  async function exportOrdersCsv() {
    try {
      const path = '/api/v1/admin/export/orders.csv';
      const resp = await signedFetch('GET', path);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const blob = await resp.blob();
      const a = document.createElement('a');
      const url = URL.createObjectURL(blob);
      a.href = url;
      a.download = 'orders.csv';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        a.remove();
      }, 0);
    } catch (err) {
      console.error('匯出失敗', err);
      alert('匯出 CSV 失敗，請稍後再試');
    }
  }

  // 開發環境：重置資料
  async function resetSeed() {
    if (!confirm('重置所有資料為預設假資料？（僅開發環境可用）')) return;
    try {
      await Api.post('/api/v1/admin/reset', {});
      await Promise.all([renderStats(), renderOrders(), renderUsers(), renderProducts(), renderCoupons()]);
      alert('已重置假資料');
    } catch (err) {
      console.error('重置失敗', err);
      alert(err?.error?.message || '重置失敗（可能未在 development 環境或未啟用）');
    }
  }

  // 事件綁定
  function bindEvents() {
    $('#order-filter')?.addEventListener('change', renderOrders);
    $('#product-form')?.addEventListener('submit', addProduct);
    $('#export-csv')?.addEventListener('click', exportOrdersCsv);
    $('#reset-db')?.addEventListener('click', resetSeed);
    $('#logout')?.addEventListener('click', async () => {
      await Auth.logout();
      location.href = 'index.html';
    });

    document.body.addEventListener('change', (e) => {
      const t = e.target;
      const d = t?.dataset || {};
      if (d.order) {
        updateOrderStatus(d.order, t.value);
      }
      if (d.price) {
        updateProductField(Number(d.price), { price: Number(t.value || 0) });
      }
      if (d.stock) {
        updateProductField(Number(d.stock), { stock: Number(t.value || 0) });
      }
    });

    document.body.addEventListener('click', (e) => {
      const d = e.target?.dataset || {};
      if (d.vip) {
        const row = e.target.closest('tr');
        const isVip = row?.querySelector('td:nth-child(7)')?.textContent?.includes('✅');
        toggleVip(Number(d.vip), !isVip);
      }
      if (d.ban) {
        const row = e.target.closest('tr');
        const banned = row?.querySelector('td:nth-child(8)')?.textContent?.includes('停權');
        toggleBan(Number(d.ban), !banned);
      }
      if (d.delUser && confirm('確定刪除會員？')) {
        deleteUser(Number(d.delUser));
      }
      if (d.delProduct && confirm('確定刪除商品？')) {
        deleteProduct(Number(d.delProduct));
      }
      if (d.toggleCoupon) {
        toggleCoupon(String(d.toggleCoupon));
      }
    });
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

  // 以下為匯出下載的簡易簽章 fetch（使用 Web Crypto）
  async function signedFetch(method, path, { bodyObj, headers } = {}) {
    const baseURL = (Api.getBaseURL && Api.getBaseURL()) || '';
    const url = baseURL.replace(/\/+$/, '') + path;
    const token = (Api.getToken && Api.getToken()) || '';
    const signKey = (Api.getSignKey && Api.getSignKey()) || null;

    if (!token || !signKey) {
      throw new Error('缺少授權或簽章資訊');
    }

    const rawBody = bodyObj ? JSON.stringify(bodyObj) : '';
    const ts = String(Date.now());
    const nonce = randomId();
    const bodySha = await sha256Hex(rawBody);
    const canonical = `${ts}|${nonce}|${String(method || 'GET').toUpperCase()}|${path}|${bodySha}`;
    const signature = await hmacSha256Hex(String(signKey.secret || ''), canonical);

    const h = new Headers(headers || {});
    h.set('Authorization', `Bearer ${token}`);
    h.set('Content-Type', 'application/json');
    h.set('X-Sign-Timestamp', ts);
    h.set('X-Sign-Nonce', nonce);
    h.set('X-Signature', signature);
    h.set('X-Sign-KeyId', signKey.keyId);

    const resp = await fetch(url, {
      method: method || 'GET',
      headers: h,
      body: rawBody || undefined,
      credentials: 'omit',
    });
    return resp;
  }

  function randomId(len = 16) {
    const bytes = new Uint8Array(len);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  async function sha256Hex(str) {
    const enc = new TextEncoder();
    const buf = enc.encode(str || '');
    const dig = await crypto.subtle.digest('SHA-256', buf);
    return hexFromBuffer(dig);
  }

  async function hmacSha256Hex(secretStr, message) {
    const enc = new TextEncoder();
    const keyData = enc.encode(secretStr || '');
    const cryptoKey = await crypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(message || ''));
    return hexFromBuffer(sig);
  }

  function hexFromBuffer(buf) {
    const arr = new Uint8Array(buf);
    return Array.from(arr)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  // 啟動
  document.addEventListener('DOMContentLoaded', async () => {
    await loadSettings();
    await ensureAdmin();
    bindEvents();
    await Promise.all([renderStats(), renderOrders(), renderUsers(), renderProducts(), renderCoupons()]);
  });
})(window);