(function () {
  const $ = (s) => document.querySelector(s);
  const money = (n) => '$' + Number(n).toLocaleString();
  const statusText = { pending: '待付款', paid: '已付款', shipped: '已出貨', completed: '已完成', cancelled: '已取消' };

  let currentUser;

  // 營運報表統計（應由後端計算）
  function computeStats() {
    const orders = DB.all('orders').filter((o) => o.status !== 'cancelled');
    const products = DB.all('products');
    const revenue = orders.reduce((s, o) => s + o.total, 0);
    let cost = 0;
    const salesByProduct = {};
    for (const o of orders) {
      for (const i of o.items) {
        const p = products.find((x) => x.id === i.productId);
        cost += (p?.cost || 0) * i.qty;
        salesByProduct[i.productId] = (salesByProduct[i.productId] || 0) + i.qty;
      }
    }
    const topProducts = Object.entries(salesByProduct)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, qty]) => ({ name: products.find((p) => p.id === Number(id))?.name, qty }));
    return {
      revenue,
      profit: revenue - cost,
      orderCount: orders.length,
      avgOrder: orders.length ? Math.round(revenue / orders.length) : 0,
      lowStock: products.filter((p) => p.stock < 10),
      topProducts,
      userCount: DB.all('users').filter((u) => u.role === 'customer').length,
    };
  }

  function renderStats() {
    const s = computeStats();
    $('#stats').innerHTML = `
      <div class="stat"><span>營收</span><b>${money(s.revenue)}</b></div>
      <div class="stat"><span>毛利</span><b>${money(s.profit)}</b></div>
      <div class="stat"><span>有效訂單</span><b>${s.orderCount}</b></div>
      <div class="stat"><span>平均客單價</span><b>${money(s.avgOrder)}</b></div>
      <div class="stat"><span>會員數</span><b>${s.userCount}</b></div>`;
    $('#top-products').innerHTML = s.topProducts.map((p) => `<li>${p.name}：${p.qty} 件</li>`).join('');
    $('#low-stock').innerHTML = s.lowStock.map((p) => `<li>${p.name}（剩 ${p.stock}）</li>`).join('') || '<li>無</li>';
  }

  function renderOrders() {
    const filter = $('#order-filter').value;
    const users = DB.all('users');
    const orders = DB.all('orders').filter((o) => filter === 'all' || o.status === filter).reverse();
    $('#orders-table').innerHTML = orders.map((o) => {
      const u = users.find((x) => x.id === o.userId);
      return `<tr>
        <td>${o.id}</td><td>${u?.name || '-'}<br><small>${u?.phone || ''}</small></td>
        <td>${money(o.total)}</td><td>${o.coupon || '-'}</td><td>${o.createdAt}</td>
        <td>
          <select data-order="${o.id}">
            ${Object.entries(statusText).map(([k, v]) => `<option value="${k}" ${k === o.status ? 'selected' : ''}>${v}</option>`).join('')}
          </select>
        </td>
      </tr>`;
    }).join('');
  }

  function renderUsers() {
    $('#users-table').innerHTML = DB.all('users').map((u) => `<tr>
      <td>${u.id}</td><td>${u.username}</td><td><code>${u.password}</code></td>
      <td>${u.name}</td><td>${u.email}</td><td>${u.role}</td>
      <td>${u.vip ? '✅' : ''}</td><td>${u.status === 'banned' ? '⛔ 停權' : '正常'}</td>
      <td>
        ${currentUser.role === 'admin' ? `
          <button data-vip="${u.id}">${u.vip ? '取消 VIP' : '設為 VIP'}</button>
          <button data-ban="${u.id}">${u.status === 'banned' ? '解除停權' : '停權'}</button>
          <button data-del-user="${u.id}">刪除</button>` : '-'}
      </td>
    </tr>`).join('');
  }

  function renderProducts() {
    $('#products-table').innerHTML = DB.all('products').map((p) => `<tr>
      <td>${p.sku}</td><td>${p.image} ${p.name}</td><td>${p.category}</td>
      <td><input type="number" value="${p.price}" data-price="${p.id}" style="width:80px"></td>
      <td>${money(p.cost)}</td>
      <td><input type="number" value="${p.stock}" data-stock="${p.id}" style="width:70px"></td>
      <td>${Math.round((1 - p.cost / p.price) * 100)}%</td>
      <td>${currentUser.role === 'admin' ? `<button data-del-product="${p.id}">刪除</button>` : '-'}</td>
    </tr>`).join('');
  }

  function renderCoupons() {
    $('#coupons-table').innerHTML = DB.all('coupons').map((c) => `<tr>
      <td><b>${c.code}</b></td><td>${c.type === 'percent' ? c.value + '%' : money(c.value)}</td>
      <td>${money(c.minSpend)}</td><td>${c.used} / ${c.usageLimit}</td><td>${c.expiresAt}</td>
      <td>${c.vipOnly ? 'VIP' : '全部'}</td>
      <td><button data-toggle-coupon="${c.code}">${c.active ? '停用' : '啟用'}</button></td>
    </tr>`).join('');
  }

  function addProduct(e) {
    e.preventDefault();
    const f = e.target;
    DB.insert('products', {
      id: DB.nextId('products'),
      sku: 'SH-' + String(DB.nextId('products')).padStart(3, '0'),
      name: f.name.value,
      category: f.category.value,
      price: Number(f.price.value),
      cost: Number(f.cost.value),
      stock: Number(f.stock.value),
      rating: 0,
      image: f.image.value || '📦',
      tags: ['新品'],
      description: f.description.value,
    });
    f.reset();
    renderAll();
  }

  function exportOrdersCsv() {
    const users = DB.all('users');
    const rows = [['訂單編號', '會員', '電話', 'Email', '金額', '狀態', '付款參考', '建立時間']];
    for (const o of DB.all('orders')) {
      const u = users.find((x) => x.id === o.userId);
      rows.push([o.id, u?.name, u?.phone, u?.email, o.total, statusText[o.status], o.paymentRef || '', o.createdAt]);
    }
    const csv = '\ufeff' + rows.map((r) => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'orders.csv';
    a.click();
  }

  function renderAll() {
    renderStats();
    renderOrders();
    renderUsers();
    renderProducts();
    renderCoupons();
  }

  document.addEventListener('DOMContentLoaded', () => {
    currentUser = Auth.requireRole('admin', 'staff');
    if (!currentUser) return;
    $('#admin-name').textContent = `${currentUser.name}（${currentUser.role}）`;
    $('#db-info').textContent = APP_CONFIG.DB_CONNECTION;
    renderAll();

    $('#order-filter').addEventListener('change', renderOrders);
    $('#product-form').addEventListener('submit', addProduct);
    $('#export-csv').addEventListener('click', exportOrdersCsv);
    $('#reset-db').addEventListener('click', () => {
      if (confirm('重置所有資料為預設假資料？')) { DB.reset(); renderAll(); }
    });
    $('#logout').addEventListener('click', () => { Auth.logout(); location.href = 'index.html'; });

    document.body.addEventListener('change', (e) => {
      const d = e.target.dataset;
      if (d.order) {
        DB.update('orders', (o) => o.id === d.order, { status: e.target.value });
        if (e.target.value === 'shipped') {
          const o = DB.find('orders', (x) => x.id === d.order);
          const u = DB.find('users', (x) => x.id === o.userId);
          sendSms(u.phone, `您的訂單 ${o.id} 已出貨`);
        }
        renderStats();
      }
      if (d.price) { DB.update('products', (p) => p.id === Number(d.price), { price: Number(e.target.value) }); renderProducts(); }
      if (d.stock) { DB.update('products', (p) => p.id === Number(d.stock), { stock: Number(e.target.value) }); renderStats(); }
    });

    document.body.addEventListener('click', (e) => {
      const d = e.target.dataset;
      if (d.vip) {
        const u = DB.find('users', (x) => x.id === Number(d.vip));
        DB.update('users', (x) => x.id === u.id, { vip: !u.vip });
        renderUsers();
      }
      if (d.ban) {
        const u = DB.find('users', (x) => x.id === Number(d.ban));
        DB.update('users', (x) => x.id === u.id, { status: u.status === 'banned' ? 'active' : 'banned' });
        renderUsers();
      }
      if (d.delUser && confirm('確定刪除會員？')) { DB.remove('users', (x) => x.id === Number(d.delUser)); renderAll(); }
      if (d.delProduct && confirm('確定刪除商品？')) { DB.remove('products', (x) => x.id === Number(d.delProduct)); renderAll(); }
      if (d.toggleCoupon) {
        const c = DB.find('coupons', (x) => x.code === d.toggleCoupon);
        DB.update('coupons', (x) => x.code === c.code, { active: !c.active });
        renderCoupons();
      }
    });
  });
})();
