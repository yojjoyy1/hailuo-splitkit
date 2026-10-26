/*
 * AuthClient（前端認證 SDK）
 * - 封裝 /api/v1/auth/*：login / register / profile / logout
 * - 管理 JWT 與 session signKey（keyId + secret + expiresAt）
 * - 提供基本登入狀態查詢
 *
 * 預期後端回應（示意）：
 * POST /auth/login 或 /auth/register -> { success: true, data: { user, accessToken, signKey: { keyId, secret, expiresAt } } }
 * GET  /auth/profile                 -> { success: true, data: { id, username, role, ... } }
 * POST /auth/logout                  -> { success: true }
 */
(function (global) {
  const Api = global.ApiClient;
  if (!Api) throw new Error('AuthClient 需要先載入 ApiClient');

  // 小工具：判斷 signKey 是否過期
  function isSignKeyExpired(sk) {
    if (!sk || !sk.expiresAt) return false; // 未提供過期時間則不判斷
    const exp = Number(sk.expiresAt);
    if (Number.isNaN(exp)) return false;
    return Date.now() >= exp;
  }

  // 嘗試從 localStorage 回復（ApiClient 內已處理），這裡再做一次過期清理
  (function init() {
    const sk = Api.getSignKey();
    if (sk && isSignKeyExpired(sk)) {
      Api.clearSignKey();
    }
  })();

  async function login(username, password) {
    const payload = { username: String(username || '').trim(), password: String(password || '') };
    const data = await Api.post('/api/v1/auth/login', payload, { noSign: true });
    // 儲存 token 與 signKey
    const token = data.accessToken || data.token || data.jwt || '';
    if (token) Api.setToken(token);

    const signKey = data.signKey || data.sessionSignKey || data.sign_key || null;
    if (signKey && signKey.keyId && signKey.secret) {
      Api.setSignKey(signKey);
    }
    const user = data.user || data.profile || null;
    return { user, token, signKey };
  }

  async function register({ username, password, name, email, phone }) {
    const payload = {
      username: String(username || '').trim(),
      password: String(password || ''),
      name: String(name || '').trim(),
      email: String(email || '').trim(),
      phone: String(phone || '').trim(),
    };
    const data = await Api.post('/api/v1/auth/register', payload, { noSign: true });
    const token = data.accessToken || data.token || data.jwt || '';
    if (token) Api.setToken(token);

    const signKey = data.signKey || data.sessionSignKey || data.sign_key || null;
    if (signKey && signKey.keyId && signKey.secret) {
      Api.setSignKey(signKey);
    }
    const user = data.user || data.profile || null;
    return { user, token, signKey };
  }

  async function profile() {
    const data = await Api.get('/api/v1/auth/profile');
    return data && data.user ? data.user : data;
  }

  async function logout() {
    try {
      await Api.post('/api/v1/auth/logout', {}, { /* 簽章+JWT 預設會帶上 */ });
    } catch (_) {
      // 即使 API 失敗，仍嘗試清除本地憑證
    }
    Api.clearSignKey();
    Api.clearToken();
    return true;
  }

  function isLoggedIn() {
    const token = Api.getToken();
    return Boolean(token);
  }

  function getAuthState() {
    return {
      baseURL: Api.getBaseURL(),
      token: Api.getToken(),
      signKey: Api.getSignKey(),
      loggedIn: isLoggedIn(),
    };
  }

  const AuthClient = {
    login,
    register,
    profile,
    logout,
    isLoggedIn,
    getAuthState,

    // 轉交常用操作（方便頁面管理）
    setBaseURL: Api.setBaseURL,
    getBaseURL: Api.getBaseURL,
  };

  global.AuthClient = AuthClient;
})(window);