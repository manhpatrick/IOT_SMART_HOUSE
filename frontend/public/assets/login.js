const form = document.querySelector('#login-form');
const error = document.querySelector('#login-error');
let demo = false, registering = false;
fetch('/api/public-config').then(r => r.json()).then(config => {
  demo = config.demo;
  document.querySelector('#demo-accounts').hidden = !demo;
  if (demo) { form.elements.email.value = 'admin@nodo.local'; form.elements.password.value = 'Admin@12345'; }
}).catch(() => {});
document.querySelectorAll('[data-account]').forEach(button => button.addEventListener('click', () => {
  if (!demo) return;
  const role = button.dataset.account;
  form.elements.email.value = `${role}@nodo.local`;
  form.elements.password.value = ({ admin: 'Admin@12345', operator: 'Operator@12345', viewer: 'Viewer@12345' })[role];
  error.hidden = true;
}));
document.querySelector('#toggle-register').addEventListener('click', () => {
  registering = !registering;
  for (const id of ['register-name', 'register-role']) { const label = document.getElementById(id); label.hidden = !registering; label.querySelector('input,select').disabled = !registering; }
  form.elements.name.required = registering;
  form.elements.password.minLength = registering ? 10 : 0;
  form.elements.password.maxLength = registering ? 72 : 128;
  form.elements.password.autocomplete = registering ? 'new-password' : 'current-password';
  document.querySelector('#login-submit').textContent = registering ? 'Tạo tài khoản' : 'Đăng nhập →';
  document.querySelector('#login-submit').setAttribute('aria-label', registering ? 'Tạo tài khoản' : 'Đăng nhập');
  document.querySelector('#toggle-register').textContent = registering ? 'Đã có tài khoản? Đăng nhập' : 'Chưa có tài khoản? Đăng ký'; error.hidden = true;
});
form.addEventListener('submit', async event => {
  event.preventDefault(); const button = document.querySelector('#login-submit'); button.disabled = true; button.textContent = 'Đang đăng nhập...'; error.hidden = true;
  try {
    const values = Object.fromEntries(new FormData(form));
    if (registering) { const result = await fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(12000), body: JSON.stringify(values) }); const payload = await result.json(); if (!result.ok) throw new Error(payload.error); }
    const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(12000), body: JSON.stringify({ email: values.email, password: values.password }) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error);
    location.replace(data.user.role === 'admin' && !location.hash.startsWith('#join=') ? '/' : '/app' + location.hash);
  } catch (e) { error.textContent = e.message || 'Không kết nối được máy chủ.'; error.hidden = false; }
  finally { button.disabled = false; button.textContent = registering ? 'Tạo tài khoản' : 'Đăng nhập →'; }
});
