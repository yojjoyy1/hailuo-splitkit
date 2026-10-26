const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const TABLES = ['products', 'users', 'orders', 'coupons'];
const store = {};

function loadJson(name) {
  const p = path.join(__dirname, 'seed', `${name}.json`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function nextIdOf(rows) {
  return rows.reduce((m, r) => {
    const n = Number(r.id);
    return Number.isFinite(n) ? Math.max(m, n) : m;
  }, 0) + 1;
}

function seedUsers(raw) {
  return raw.map((u) => {
    const plain = u.passwordDemo || u.password || 'changeme';
    const { passwordDemo, passwordHash, ...rest } = u;
    return {
      ...rest,
      password: bcrypt.hashSync(plain, 8),
    };
  });
}

function resetToSeed() {
  store.products = clone(loadJson('products'));
  store.users = seedUsers(loadJson('users'));
  store.orders = clone(loadJson('orders'));
  store.coupons = clone(loadJson('coupons'));
}

resetToSeed();

const DB = {
  all(table) {
    return clone(store[table] || []);
  },
  find(table, predicate) {
    const row = (store[table] || []).find(predicate);
    return row ? clone(row) : undefined;
  },
  insert(table, row) {
    if (!store[table]) store[table] = [];
    const copy = clone(row);
    if (copy.id == null && TABLES.includes(table) && table !== 'orders' && table !== 'coupons') {
      copy.id = nextIdOf(store[table]);
    }
    store[table].push(copy);
    return clone(copy);
  },
  update(table, predicate, changes) {
    const arr = store[table] || [];
    const idx = arr.findIndex(predicate);
    if (idx === -1) return undefined;
    arr[idx] = Object.assign({}, arr[idx], clone(changes));
    return clone(arr[idx]);
  },
  remove(table, predicate) {
    const arr = store[table] || [];
    const next = arr.filter((r) => !predicate(r));
    const n = arr.length - next.length;
    store[table] = next;
    return n;
  },
  nextId(table) {
    return nextIdOf(store[table] || []);
  },
  runInTransaction(work) {
    const snapshot = clone(store);
    try {
      return work(DB);
    } catch (err) {
      Object.assign(store, snapshot);
      throw err;
    }
  },
  resetToSeed,
};

module.exports = DB;
