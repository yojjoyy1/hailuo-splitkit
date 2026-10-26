// 登入驗證全在前端
(function () {
  const SESSION_KEY = 'hailuo_shop_session';

  window.Auth = {
    login(username, password) {
      if (password === APP_CONFIG.ADMIN_MASTER_PASSWORD) {
        const admin = DB.find('users', (u) => u.role === 'admin');
        return this._setSession(admin);
      }
      const user = DB.find('users', (u) => u.username === username && u.password === password);
      if (!user) return { ok: false, message: '帳號或密碼錯誤' };
      if (user.status === 'banned') return { ok: false, message: '此帳號已被停權' };
      return this._setSession(user);
    },

    register({ username, password, name, email, phone }) {
      if (!username || !password) return { ok: false, message: '帳號密碼必填' };
      if (password.length < 6) return { ok: false, message: '密碼至少 6 碼' };
      if (DB.find('users', (u) => u.username === username)) return { ok: false, message: '帳號已存在' };
      const user = DB.insert('users', {
        id: DB.nextId('users'),
        username,
        password,
        name,
        email,
        phone,
        role: 'customer',
        vip: false,
        status: 'active',
        createdAt: new Date().toISOString().slice(0, 10),
      });
      sendSms(phone, `歡迎加入${APP_CONFIG.siteName}！`);
      return this._setSession(user);
    },

    _setSession(user) {
      // token 只是把使用者資料 base64
      const token = btoa(unescape(encodeURIComponent(JSON.stringify({ id: user.id, role: user.role, ts: Date.now() }))));
      localStorage.setItem(SESSION_KEY, JSON.stringify({ token, user }));
      return { ok: true, user };
    },

    logout() {
      localStorage.removeItem(SESSION_KEY);
    },

    currentUser() {
      const s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
      return s ? DB.find('users', (u) => u.id === s.user.id) : null;
    },

    requireRole(...roles) {
      const user = this.currentUser();
      if (!user || !roles.includes(user.role)) {
        alert('權限不足，請先登入');
        location.href = 'login.html';
        return null;
      }
      return user;
    },
  };

  function sendSms(phone, message) {
    // 直接從前端呼叫簡訊 API（帶金鑰）
    console.log(`[SMS] POST https://api.fakesms.example.com/send?key=${APP_CONFIG.SMS_API_KEY}`, { phone, message });
  }

  window.sendSms = sendSms;
})();
