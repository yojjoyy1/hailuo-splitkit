// 用 localStorage 當資料庫
(function () {
  const KEY = 'hailuo_shop_db';

  function seed() {
    return {
      products: JSON.parse(JSON.stringify(window.SEED_PRODUCTS)),
      users: JSON.parse(JSON.stringify(window.SEED_USERS)),
      orders: JSON.parse(JSON.stringify(window.SEED_ORDERS)),
      coupons: JSON.parse(JSON.stringify(window.SEED_COUPONS)),
      reviews: [],
    };
  }

  function load() {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      const data = seed();
      localStorage.setItem(KEY, JSON.stringify(data));
      return data;
    }
    return JSON.parse(raw);
  }

  function save(data) {
    localStorage.setItem(KEY, JSON.stringify(data));
  }

  window.DB = {
    all(table) {
      return load()[table];
    },
    find(table, predicate) {
      return load()[table].find(predicate);
    },
    insert(table, row) {
      const data = load();
      data[table].push(row);
      save(data);
      return row;
    },
    update(table, predicate, changes) {
      const data = load();
      const row = data[table].find(predicate);
      if (row) Object.assign(row, changes);
      save(data);
      return row;
    },
    remove(table, predicate) {
      const data = load();
      data[table] = data[table].filter((r) => !predicate(r));
      save(data);
    },
    nextId(table) {
      const rows = load()[table];
      return rows.reduce((max, r) => Math.max(max, Number(r.id) || 0), 0) + 1;
    },
    reset() {
      save(seed());
    },
  };
})();
