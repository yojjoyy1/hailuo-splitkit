/*
 * 改寫登入/註冊頁（前端僅呼叫後端 API）
 * - 使用 AuthClient 進行 /auth/login 與 /auth/register
 * - 登入成功：顯示使用者並儲存 JWT 與 session signKey（由 AuthClient 代管）
 * - 依角色導頁：customer -> index.html；admin/staff -> admin.html
 * - 初始化：呼叫 /public/settings 設定站名
 *
 * 需先載入：
 *   - sdk/apiClient.js
 *   - sdk/authClient.js
 */

(function () {
  const Api = window.ApiClient;
  const Auth = window.AuthClient;

  if (!Api) throw new Error('login.js 需要先載入 sdk/apiClient.js');
  if (!Auth) throw new Error('login.js 需要先載入 sdk/authClient.js');

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    // 初始化站名（/public/settings）
    try {
      const settings = await Api.get('/api/v1/public/settings', { noSign: true });
      if (settings && settings.siteName && $('#site-name')) {
        $('#site-name').textContent = settings.siteName;
      }
    } catch (_) {
      // 忽略設定載入錯誤，不影響登入流程
    }

    bindLogin();
    bindRegister();
  }

  function bindLogin() {
    const form = $('#login-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearError('#login-error');

      const username = (form.querySelector('#login-username') || {}).value || '';
      const password = (form.querySelector('#login-password') || {}).value || '';

      const submitBtn = form.querySelector('button[type="submit"]') || form.querySelector('[type="submit"]');
      setLoading(submitBtn, true, '登入中…');

      try {
        const { user } = await Auth.login(username, password);
        redirectAfterLogin(user);
      } catch (err) {
        setError('#login-error', extractMessage(err, '登入失敗，請確認帳號密碼。'));
      } finally {
        setLoading(submitBtn, false, '登入');
      }
    });
  }

  function bindRegister() {
    const form = $('#register-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearError('#register-error');

      const payload = {
        username: getVal('#reg-username'),
        password: getVal('#reg-password'),
        name: getVal('#reg-name'),
        email: getVal('#reg-email'),
        phone: getVal('#reg-phone'),
      };

      const submitBtn = form.querySelector('button[type="submit"]') || form.querySelector('[type="submit"]');
      setLoading(submitBtn, true, '註冊中…');

      try {
        await Auth.register(payload);
        // 註冊成功後導回前台（或依 querystring redirect）
        const redirect = getQuery('redirect') || 'index.html';
        location.href = redirect;
      } catch (err) {
        setError('#register-error', extractMessage(err, '註冊失敗，請稍後再試。'));
      } finally {
        setLoading(submitBtn, false, '註冊');
      }
    });
  }

  function redirectAfterLogin(user) {
    // 若 URL 帶有 redirect，優先使用
    const forced = getQuery('redirect');
    if (forced) {
      location.href = forced;
      return;
    }
    const role = (user && user.role) || 'customer';
    if (role === 'admin' || role === 'staff') {
      location.href = 'admin.html';
    } else {
      location.href = 'index.html';
    }
  }

  // 小工具
  function setLoading(btn, loading, textWhenLoading) {
    if (!btn) return;
    if (loading) {
      btn.dataset._origText = btn.textContent;
      btn.textContent = textWhenLoading || '處理中…';
      btn.disabled = true;
    } else {
      btn.textContent = btn.dataset._origText || '送出';
      btn.disabled = false;
    }
  }

  function extractMessage(err, fallback) {
    if (!err) return fallback;
    if (typeof err === 'string') return err;
    if (err.message) return err.message;
    if (err.error && err.error.message) return err.error.message;
    if (err.response && err.response.message) return err.response.message;
    return fallback;
  }

  function setError(sel, msg) {
    const el = $(sel);
    if (el) el.textContent = msg || '';
  }

  function clearError(sel) {
    const el = $(sel);
    if (el) el.textContent = '';
  }

  function getVal(sel) {
    const el = $(sel);
    return (el && el.value) || '';
  }

  function getQuery(key) {
    const u = new URL(location.href);
    return u.searchParams.get(key);
  }
})();