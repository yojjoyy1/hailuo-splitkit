/*
 * Nonce Store（防重放）- 記憶體版本，可替換 Redis/外部儲存
 *
 * 設計目標
 * - 以最小介面支援簽章防重放：has(key)、use(key)、revoke(key)、purge()
 * - 預設採用 in-memory Map，TTL 到期自動清理
 * - 可擴充為 Redis（或其他 KV）實作：以 SET NX PX 實現一次性 nonce 與過期機制
 *
 * 介面說明
 * - constructor(options):
 *    - ttlMs: Nonce 存活時間（毫秒）
 *    - autoPurgeMs: 自動清理週期（毫秒），預設 60s；設定 0 表示不啟用自動清理
 * - has(key): 檢查 key 是否已使用（且未過期）
 * - use(key): 標記 key 為已使用，設定過期時間
 * - revoke(key): 提前撤銷 key
 * - purge(): 立即執行過期清理
 * - stats(): 回傳 { size } 以利偵錯
 */

class MemoryNonceStore {
  constructor({ ttlMs = 10 * 60 * 1000, autoPurgeMs = 60 * 1000 } = {}) {
    this.ttlMs = ttlMs;
    this.map = new Map(); // key => expireAt(ms)
    this._timer = null;
    if (autoPurgeMs && autoPurgeMs > 0) {
      this._timer = setInterval(() => this.purge(), autoPurgeMs);
      // 避免阻止 Node.js 自然退出
      if (this._timer.unref) this._timer.unref();
    }
  }

  has(key) {
    if (!key) return false;
    const k = String(key);
    const exp = this.map.get(k);
    if (!exp) return false;
    if (exp <= Date.now()) {
      this.map.delete(k);
      return false;
    }
    return true;
  }

  use(key) {
    if (!key) return;
    const k = String(key);
    const expireAt = Date.now() + this.ttlMs;
    this.map.set(k, expireAt);
  }

  revoke(key) {
    if (!key) return;
    this.map.delete(String(key));
  }

  purge() {
    const now = Date.now();
    if (this.map.size === 0) return 0;
    let removed = 0;
    for (const [k, exp] of this.map.entries()) {
      if (exp <= now) {
        this.map.delete(k);
        removed++;
      }
    }
    return removed;
  }

  stats() {
    return { size: this.map.size };
  }

  dispose() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  }
}

/*
 * RedisNonceStore（參考實作介面）
 * - 預期以 Redis 的 SET <key> "1" NX PX <ttl> 來達成 once-only 與過期
 * - 由於本模板未納入 Redis 依賴，以下僅保留骨架，實務上請傳入 ioredis/redis client
 */
// class RedisNonceStore {
//   constructor({ ttlMs, redis }) {
//     this.ttlMs = ttlMs;
//     this.redis = redis; // 需支援 set/get/del
//   }
//   async has(key) {
//     // 若可接受讀一次，則 has() 可透過 EXISTS；或改以 use() 原子化檢查
//     const v = await this.redis.get(key);
//     return !!v;
//   }
//   async use(key) {
//     // 原子檢查與設定（一次性）
//     const ok = await this.redis.set(key, '1', 'PX', this.ttlMs, 'NX');
//     return ok === 'OK'; // 若非 OK，代表已存在（重放攻擊）
//   }
//   async revoke(key) {
//     await this.redis.del(key);
//   }
//   async purge() { /* 由 Redis 內部處理 TTL 到期；無需手動清理 */ }
//   stats() { return { backend: 'redis' }; }
// }

/*
 * 工廠方法：createNonceStore
 * - 預設回傳 MemoryNonceStore
 * - 如需 Redis 請自行切換 adapter 並傳入 redis client
 */
function createNonceStore(options = {}) {
  const { adapter = 'memory' } = options;
  if (adapter === 'memory') {
    return new MemoryNonceStore(options);
  }
  // 若要擴充 Redis，請解除註解並帶入 client
  // if (adapter === 'redis') {
  //   return new RedisNonceStore(options);
  // }
  // 預設回退至記憶體版本
  return new MemoryNonceStore(options);
}

module.exports = {
  MemoryNonceStore,
  createNonceStore,
};