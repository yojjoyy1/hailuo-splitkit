document.addEventListener('DOMContentLoaded', () => {
  const $ = (s) => document.querySelector(s);
  $('#site-name').textContent = APP_CONFIG.siteName;

  $('#login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const res = Auth.login($('#login-username').value.trim(), $('#login-password').value);
    if (!res.ok) return ($('#login-error').textContent = res.message);
    location.href = res.user.role === 'customer' ? 'index.html' : 'admin.html';
  });

  $('#register-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const res = Auth.register({
      username: $('#reg-username').value.trim(),
      password: $('#reg-password').value,
      name: $('#reg-name').value.trim(),
      email: $('#reg-email').value.trim(),
      phone: $('#reg-phone').value.trim(),
    });
    if (!res.ok) return ($('#register-error').textContent = res.message);
    location.href = 'index.html';
  });
});
