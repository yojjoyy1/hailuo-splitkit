/*
 * ApiClient（前端通用 API 客戶端）
 * - 維護 baseURL 與 JWT（Authorization: Bearer）
 * - 依 session signKey（keyId + secret）對非白名單路由進行 HMAC-SHA256 簽章
 *   canonical string = `${timestamp}|${nonce}|${method}|${path}|${bodySha256}`
 *   其中 path 必須包含查詢字串（例如：/api/v1/products?keyword=abc&page=1）
 * - 內建一次性重試機制：若簽章請求 401/403，會重新產生簽章重試一次
 * - 回傳：預設回傳 response.data（若不存在則回傳整個 JSON）
 *
 * 預設白名單（免簽章）：
 * - GET  /api/v1/public/settings
 * - POST /api/v1/auth/login
 * - POST /api/v1/auth/register
 *
 * 注意：
 * - 瀏覽器需支援 Web Crypto API（window.crypto.subtle）
 * - 請搭配 AuthClient 於登入/註冊後儲存 JWT 與 signKey
 */
(function (global) {
  const DEFAULT_BASE_URL =
    global.DS_API_BASE ||
    localStorage.getItem('ds_base_url') ||
    'http://localhost:3000';

  const STORAGE_KEYS = {
    baseURL: 'ds_base_url',
    token: 'ds_token',
    signKey: 'ds_sign_key', // { keyId, secret, expiresAt }
  };

  // 與後端約定之 Sign Header 名稱（可依實際需要調整）
  const SIGN_HEADERS = {
    timestamp: 'X-Sign-Timestamp',
    nonce: 'X-Sign-Nonce',
    signature: 'X-Signature',
    keyId: 'X-Sign-KeyId',
  };

  // 後端白名單路由（與 backend config.signKey.whitelistPaths 保持一致）
  const SIGN_WHITELIST = [
    '/api/v1/public/settings',
    '/api/v1/auth/login',
    '/api/v1/auth/register',
  ];

  // 內部狀態
  let state = {
    baseURL: DEFAULT_BASE_URL,
    token: loadToken(),
    signKey: loadSignKey(), // { keyId, secret, expiresAt }
  };

  // 工具：載入/儲存
  function loadToken() {
    try {
      return localStorage.getItem(STORAGE_KEYS.token) || '';
    } catch (_) {
      return '';
    }
  }
  function saveToken(token) {
    state.token = token || '';
    try {
      if (state.token) localStorage.setItem(STORAGE_KEYS.token, state.token);
      else localStorage.removeItem(STORAGE_KEYS.token);
    } catch (_) {}
  }

  function loadSignKey() {
    try {
      const s = localStorage.getItem(STORAGE_KEYS.signKey);
      return s ? JSON.parse(s) : null;
    } catch (_) {
      return null;
    }
  }
  function saveSignKey(sk) {
    const clean = sk && sk.keyId && sk.secret ? { keyId: String(sk.keyId), secret: String(sk.secret), expiresAt: sk.expiresAt || null } : null;
    state.signKey = clean;
    try {
      if (clean) localStorage.setItem(STORAGE_KEYS.signKey, JSON.stringify(clean));
      else localStorage.removeItem(STORAGE_KEYS.signKey);
    } catch (_) {}
  }

  function setBaseURL(url) {
    if (!url) return;
    state.baseURL = String(url).replace(/\/+$/, ''); // 去尾端 /
    try {
      localStorage.setItem(STORAGE_KEYS.baseURL, state.baseURL);
    } catch (_) {}
  }
  function getBaseURL() {
    return state.baseURL;
  }

  function getToken() {
    return state.token || '';
  }
  function setToken(token) {
    saveToken(token);
  }
  function clearToken() {
    saveToken('');
  }

  function getSignKey() {
    return state.signKey || null;
  }
  function setSignKey(sk) {
    saveSignKey(sk);
  }
  function clearSignKey() {
    saveSignKey(null);
  }

  // 工具：路由是否白名單
  function isWhitelisted(path) {
    const purePath = String(path || '').split('?')[0];
    return SIGN_WHITELIST.includes(purePath);
  }

  // 工具：隨機 nonce（16 bytes hex）
  function randomNonceHex(len = 16) {
    if (global.crypto && global.crypto.getRandomValues) {
      const bytes = new Uint8Array(len);
      global.crypto.getRandomValues(bytes);
      return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    }
    // Fallback（非密碼學用途）
    let s = '';
    for (let i = 0; i < len; i++) s += Math.floor(Math.random() * 256).toString(16).padStart(2, '0');
    return s;
  }

  // Web Crypto：字串轉 Uint8Array
  const enc = new TextEncoder();
  function toUint8(str) {
    return enc.encode(str == null ? '' : String(str));
  }
  // Web Crypto：ArrayBuffer -> hex
  function bufToHex(buf) {
    const v = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < v.length; i++) s += v[i].toString(16).padStart(2, '0');
    return s;
  }
  // 計算 SHA-256（hex）
  async function sha256Hex(message) {
    if (!global.crypto || !global.crypto.subtle) {
      throw new Error('此瀏覽器不支援 Web Crypto（SHA-256），請改用較新版本的瀏覽器。');
    }
    const digest = await global.crypto.subtle.digest('SHA-256', toUint8(message || ''));
    return bufToHex(digest);
  }
  // 計算 HMAC-SHA256（hex）
  async function hmacSHA256Hex(secret, message) {
    if (!global.crypto || !global.crypto.subtle) {
      throw new Error('此瀏覽器不支援 Web Crypto（HMAC-SHA256），請改用較新版本的瀏覽器。');
    }
    const key = await global.crypto.subtle.importKey(
      'raw',
      toUint8(secret || ''),
      { name: 'HMAC', hash: { name: 'SHA-256' } },
      false,
      ['sign']
    );
    const sig = await global.crypto.subtle.sign('HMAC', key, toUint8(message || ''));
    return bufToHex(sig);
  }

  // 組合查詢字串
  function buildQuery(params) {
    if (!params) return '';
    const usp = new URLSearchParams();
    Object.keys(params).forEach((k) => {
      const v = params[k];
      if (v === undefined || v === null) return;
      if (Array.isArray(v)) v.forEach((x) => usp.append(k, x));
      else usp.append(k, String(v));
    });
    const s = usp.toString();
    return s ? `?${s}` : '';
  }

  // 正規化 path，確保以 / 開頭；並附上查詢字串
  function canonicalPath(path, query) {
    const p = String(path || '');
    const withSlash = p.startsWith('/') ? p : `/${p}`;
    const qs = buildQuery(query);
    return `${withSlash}${qs}`;
  }

  // 產生簽章標頭（若 signKey 不存在或在白名單則回傳空物件）
  async function buildSignHeaders({ method, path, bodyString }) {
    const signKey = getSignKey();
    if (!signKey || !signKey.keyId || !signKey.secret) return {};
    if (isWhitelisted(path)) return {};

    const timestamp = String(Date.now());
    const nonce = randomNonceHex(16);
    const bodySha = await sha256Hex(bodyString || '');
    const canonical = `${timestamp}|${nonce}|${String(method || '').toUpperCase()}|${path}|${bodySha}`;
    const signature = await hmacSHA256Hex(signKey.secret, canonical);

    return {
      [SIGN_HEADERS.timestamp]: timestamp,
      [SIGN_HEADERS.nonce]: nonce,
      [SIGN_HEADERS.signature]: signature,
      [SIGN_HEADERS.keyId]: signKey.keyId,
    };
    // 注意：伺服器端會以 req.originalUrl（含 query）驗證 path
  }

  // 送出請求（支援一次性重簽重試）
  async function request(method, path, { query, data, headers, noAuth = false, noSign = false, retryOnAuthFail = true } = {}) {
    const p = canonicalPath(path, query);
    const url = `${getBaseURL()}${p}`;
    const reqHeaders = Object.assign({ Accept: 'application/json' }, headers || {});
    let bodyString = '';

    // JSON body
    if (data !== undefined && data !== null && method !== 'GET' && method !== 'HEAD') {
      bodyString = JSON.stringify(data);
      reqHeaders['Content-Type'] = 'application/json';
    }

    // Authorization
    const token = getToken();
    if (token && !noAuth) {
      reqHeaders['Authorization'] = `Bearer ${token}`;
    }

    // 簽章
    let signed = false;
    if (!noSign) {
      const signHeaders = await buildSignHeaders({ method, path: p, bodyString });
      if (Object.keys(signHeaders).length > 0) {
        Object.assign(reqHeaders, signHeaders);
        signed = true;
      }
    }

    const opts = { method, headers: reqHeaders };
    if (bodyString && method !== 'GET' && method !== 'HEAD') {
      opts.body = bodyString;
    }

    // 執行 fetch
    let res = await fetch(url, opts);
    let json = await safeParseJSON(res);

    // 非 2xx：若已簽章且允許重試，嘗試重新簽章一次
    if (!res.ok && signed && retryOnAuthFail && (res.status === 401 || res.status === 403)) {
      // 重新產生簽章（timestamp/nonce）並重送一次
      const retryHeaders = Object.assign({ Accept: 'application/json' }, headers || {});
      if (token && !noAuth) retryHeaders['Authorization'] = `Bearer ${token}`;
      const reSignHeaders = await buildSignHeaders({ method, path: p, bodyString });
      Object.assign(retryHeaders, reSignHeaders);
      const retryOpts = { method, headers: retryHeaders };
      if (bodyString && method !== 'GET' && method !== 'HEAD') retryOpts.body = bodyString;

      res = await fetch(url, retryOpts);
      json = await safeParseJSON(res);
    }

    if (!res.ok) {
      const err = buildHttpError(res, json);
      throw err;
    }

    return json && typeof json === 'object' && 'data' in json ? json.data : json;
  }

  async function safeParseJSON(res) {
    const text = await res.text().catch(() => '');
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      return { raw: text };
    }
  }

  function buildHttpError(res, json) {
    const code = (json && json.error && json.error.code) || (json && json.code) || `HTTP_${res.status}`;
    const message =
      (json && json.error && json.error.message) ||
      (json && json.message) ||
      res.statusText ||
      'Request failed';
    const traceId = (json && (json.traceId || (json.error && json.error.traceId))) || undefined;
    const err = new Error(message);
    err.status = res.status;
    err.code = code;
    err.payload = json;
    if (traceId) err.traceId = traceId;
    return err;
  }

  // 快捷方法
  async function get(path, opts) {
    return request('GET', path, opts);
  }
  async function post(path, data, opts) {
    return request('POST', path, Object.assign({}, opts, { data }));
  }
  async function patch(path, data, opts) {
    return request('PATCH', path, Object.assign({}, opts, { data }));
  }
  async function del(path, opts) {
    return request('DELETE', path, opts);
  }

  // 公開 API
  const ApiClient = {
    // 基本組態
    setBaseURL,
    getBaseURL,

    // 認證
    getToken,
    setToken,
    clearToken,

    // 簽章 session key
    getSignKey,
    setSignKey,
    clearSignKey,

    // 白名單檢查
    isWhitelisted,

    // 低階方法（需自行傳入 path）
    request,
    get,
    post,
    patch,
    delete: del,

    // 工具（如需自定簽章可用）
    _buildSignHeaders: buildSignHeaders,
    _sha256Hex: sha256Hex,
    _hmacSHA256Hex: hmacSHA256Hex,
    _canonicalPath: canonicalPath,
    _buildQuery: buildQuery,
  };

  // 暴露至全域
  global.ApiClient = ApiClient;
})(window);