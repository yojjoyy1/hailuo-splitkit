/*
 * 簡易資料存取層（JSON 檔案或記憶體 mock）
 * - 支援 CRUD 與 nextId
 * - 提供 runInTransaction() 以利結帳等需要原子性的流程
 *
 * 設計原則
 * - 預設以檔案 JSON 儲存（config.data.store=file，目錄 config.data.dir）
 * - 記憶體模式（config.data.store=memory）僅在程序存活期間有效
 * - 啟動時若資料目錄不存在，會自動建立；可於 .env 開啟 SEED_ON_START 以在空資料夾初始化種子
 *
 * 重要說明
 * - 此為教學/模板用簡化實作，非高併發/多程序安全；實務上建議改為真正的資料庫或加鎖處理
 */

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const config = require('../config');

// 預設支援的資料表
const DEFAULT_TABLES = ['products', 'users', 'orders', 'coupons'];

// 讀取種子資料
function loadSeed(table) {
  const p = path.resolve(__dirname, 'seed', `${table}.json`);
  try {
    const raw = fs.readFileSync(p, 'utf8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

// 確保目錄存在
async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
}

// 安全寫檔（先寫 tmp 再 rename 以降低損壞風險）
async function writeJsonSafe(filePath, data) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const tmp = path.join(dir, `.${base}.${Date.now()}.tmp`);
  await fsp.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await fsp.rename(tmp, filePath);
}

// 讀檔（不存在回空陣列）
async function readJsonArray(filePath) {
  try {
    const raw = await fsp.readFile(filePath, 'utf8');
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (err) {
    if (err && err.code === 'ENOENT') return [];
    throw err;
  }
}

// 同步版本（初始化用）
function readJsonArraySync(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (err) {
    if (err && err.code === 'ENOENT') return [];
    throw err;
  }
}

// 建立初始資料
async function initFileStoreIfNeeded(dir) {
  await ensureDir(dir);
  // 若目錄內沒有任何 .json 檔案，且允許 seedOnStart，則建立預設表並寫入種子
  const files = await fsp.readdir(dir);
  const hasAnyJson = files.some((f) => f.endsWith('.json'));
  if (!hasAnyJson && config.data.seedOnStart) {
    const initial = {};
    for (const t of DEFAULT_TABLES) {
      initial[t] = loadSeed(t);
    }
    // 額外的擴充表（若有）：以空陣列起始
    await Promise.all(
      Object.keys(initial).map((t) => writeJsonSafe(path.join(dir, `${t}.json`), initial[t]))
    );
  }
}

// 載入整庫（全部表格）- 僅用於交易或初始化
async function loadAllFromFile(dir) {
  const db = {};
  for (const t of DEFAULT_TABLES) {
    const p = path.join(dir, `${t}.json`);
    db[t] = await readJsonArray(p);
  }
  // 允許擴充：掃描資料夾中其他 .json 表，若不在 DEFAULT_TABLES 也載入
  const files = await fsp.readdir(dir);
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    const t = f.replace(/\.json$/i, '');
    if (db[t]) continue;
    db[t] = await readJsonArray(path.join(dir, f));
  }
  return db;
}

// 寫回整庫
async function saveAllToFile(dir, db) {
  const keys = Object.keys(db || {});
  await ensureDir(dir);
  for (const t of keys) {
    const p = path.join(dir, `${t}.json`);
    await writeJsonSafe(p, db[t] || []);
  }
}

// 深拷貝（陣列/物件）
function deepClone(v) {
  return JSON.parse(JSON.stringify(v));
}

// 以主鍵欄位 id 產生下一個遞增數字 ID
function nextIdOfRows(rows) {
  const max = (rows || []).reduce((m, r) => {
    const id = Number(r && r.id);
    return Number.isFinite(id) ? Math.max(m, id) : m;
  }, 0);
  return max + 1;
}

class InMemoryStore {
  constructor(initial = {}) {
    this.db = Object.assign(
      Object.create(null),
      deepClone(initial)
    );
  }

  all(table) {
    return deepClone(this.db[table] || []);
  }

  find(table, predicate) {
    const arr = this.db[table] || [];
    const row = arr.find(predicate);
    return row ? deepClone(row) : undefined;
  }

  insert(table, row) {
    if (!this.db[table]) this.db[table] = [];
    const copy = deepClone(row);
    this.db[table].push(copy);
    return deepClone(copy);
  }

  update(table, predicate, changes) {
    const arr = this.db[table] || [];
    const idx = arr.findIndex(predicate);
    if (idx === -1) return undefined;
    const updated = Object.assign({}, arr[idx], deepClone(changes));
    this.db[table][idx] = updated;
    return deepClone(updated);
  }

  remove(table, predicate) {
    const arr = this.db[table] || [];
    const remained = arr.filter((r) => !predicate(r));
    this.db[table] = remained;
    return arr.length - remained.length; // removed count
  }

  nextId(table) {
    if (!this.db[table]) this.db[table] = [];
    return nextIdOfRows(this.db[table]);
  }

  dump() {
    return deepClone(this.db);
  }

  load(data) {
    this.db = deepClone(data || {});
  }
}

class FileStore {
  constructor(dir) {
    this.dir = dir;
  }

  async all(table) {
    const p = path.join(this.dir, `${table}.json`);
    const rows = await readJsonArray(p);
    return deepClone(rows);
  }

  async find(table, predicate) {
    const rows = await this.all(table);
    const row = rows.find(predicate);
    return row ? deepClone(row) : undefined;
  }

  async insert(table, row) {
    const p = path.join(this.dir, `${table}.json`);
    const rows = await readJsonArray(p);
    const copy = deepClone(row);
    rows.push(copy);
    await writeJsonSafe(p, rows);
    return deepClone(copy);
  }

  async update(table, predicate, changes) {
    const p = path.join(this.dir, `${table}.json`);
    const rows = await readJsonArray(p);
    const idx = rows.findIndex(predicate);
    if (idx === -1) return undefined;
    const updated = Object.assign({}, rows[idx], deepClone(changes));
    rows[idx] = updated;
    await writeJsonSafe(p, rows);
    return deepClone(updated);
  }

  async remove(table, predicate) {
    const p = path.join(this.dir, `${table}.json`);
    const rows = await readJsonArray(p);
    const remained = rows.filter((r) => !predicate(r));
    await writeJsonSafe(p, remained);
    return rows.length - remained.length; // removed count
  }

  async nextId(table) {
    const rows = await this.all(table);
    return nextIdOfRows(rows);
  }

  // 交易：載入整庫 -> 於記憶體操作 -> 成功後一次性覆蓋寫回
  async runInTransaction(work) {
    const snapshot = await loadAllFromFile(this.dir);
    const mem = new InMemoryStore(snapshot);

    const tx = buildTxFacade(mem);

    let result;
    try {
      result = await work(tx);
    } catch (err) {
      // 丟回錯誤不做任何寫回（回復至 snapshot）
      throw err;
    }

    await saveAllToFile(this.dir, mem.dump());
    return result;
  }

  async resetToSeed() {
    const seed = {};
    for (const t of DEFAULT_TABLES) seed[t] = loadSeed(t);
    await saveAllToFile(this.dir, seed);
  }
}

// 將 store 實例包成統一交易接口
function buildTxFacade(store) {
  return {
    all: (table) => store.all(table),
    find: (table, predicate) => store.find(table, predicate),
    insert: (table, row) => {
      const r = Object.assign({ id: store.nextId(table) }, row);
      return store.insert(table, r);
    },
    update: (table, predicate, changes) => store.update(table, predicate, changes),
    remove: (table, predicate) => store.remove(table, predicate),
    nextId: (table) => store.nextId(table),
    dump: () => store.dump(),
  };
}

// 建立單例資料層，依設定選擇後端
let backend = null;
let readyPromise = null;

function initDataLayer() {
  if (readyPromise) return readyPromise;

  readyPromise = (async () => {
    const storeType = (config && config.data && config.data.store) || 'file';
    if (storeType === 'memory') {
      // 記憶體模式：以種子初始化（若有）
      const initial = {};
      for (const t of DEFAULT_TABLES) initial[t] = loadSeed(t);
      backend = new InMemoryStore(initial);
      return;
    }

    // 檔案模式
    const dir = (config && config.data && config.data.dir) || path.resolve(process.cwd(), 'data');
    await initFileStoreIfNeeded(dir);
    backend = new FileStore(dir);
  })();

  return readyPromise;
}

// 公開 API（統一非同步介面）
const DB = {
  // 初始化（server 啟動時自動觸發，或於首次呼叫時延遲觸發）
  async ready() {
    await initDataLayer();
    return true;
  },

  // 讀取所有列
  async all(table) {
    await DB.ready();
    if (backend instanceof InMemoryStore) return backend.all(table);
    return backend.all(table);
  },

  // 單筆查找
  async find(table, predicate) {
    await DB.ready();
    return backend.find(table, predicate);
  },

  // 新增資料（自動補 id）
  async insert(table, row) {
    await DB.ready();
    if (backend instanceof InMemoryStore) {
      const r = Object.assign({ id: backend.nextId(table) }, row);
      return backend.insert(table, r);
    }
    const id = await backend.nextId(table);
    return backend.insert(table, Object.assign({ id }, row));
  },

  // 更新資料（傳回更新後物件或 undefined）
  async update(table, predicate, changes) {
    await DB.ready();
    return backend.update(table, predicate, changes);
  },

  // 刪除資料（傳回刪除數量）
  async remove(table, predicate) {
    await DB.ready();
    return backend.remove(table, predicate);
  },

  // 取得下一個 id（僅供特殊需求；一般 insert 會自動補）
  async nextId(table) {
    await DB.ready();
    if (backend instanceof InMemoryStore) return backend.nextId(table);
    return backend.nextId(table);
  },

  // 交易操作（於同一快照中執行一系列讀寫；成功後一次性提交）
  async runInTransaction(work) {
    await DB.ready();
    if (backend instanceof InMemoryStore) {
      // 記憶體交易：複製快照，操作後整包取代
      const snapshot = backend.dump();
      const mem = new InMemoryStore(snapshot);
      const tx = buildTxFacade(mem);
      let result;
      try {
        result = await work(tx);
      } catch (err) {
        // 丟回錯誤，不提交任何變更
        throw err;
      }
      backend.load(mem.dump()); // 提交
      return result;
    } else if (backend instanceof FileStore) {
      return backend.runInTransaction(work);
    }
    throw new Error('Unknown backend store');
  },

  // 重置至種子資料（僅 development 使用；請於路由層加權限保護）
  async resetToSeed() {
    await DB.ready();
    if (backend instanceof InMemoryStore) {
      const seed = {};
      for (const t of DEFAULT_TABLES) seed[t] = loadSeed(t);
      backend.load(seed);
      return;
    }
    if (backend instanceof FileStore) {
      await backend.resetToSeed();
      return;
    }
    throw new Error('Unknown backend store');
  },
};

module.exports = DB;