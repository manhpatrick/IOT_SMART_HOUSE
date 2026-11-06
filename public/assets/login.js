const form = document.querySelector('#login-form');
const error = document.querySelector('#login-error');
let demo = false;
fetch('/api/public-config').then(r => r.json()).then(config => {
  demo = config.demo;
  document.querySelector('#demo-accounts').hidden = !demo;
  if (demo) { form.elements.email.value = 'admin@nodo.local'; form.elements.password.value = 'Admin@12345'; }
});
document.querySelectorAll('[data-account]').forEach(button => button.addEventListener('click', () => {
  if (!demo) return;
  const role = button.dataset.account;
  form.elements.email.value = `${role}@nodo.local`;
  form.elements.password.value = ({ admin: 'Admin@12345', operator: 'Operator@12345', viewer: 'Viewer@12345' })[role];
  error.hidden = true;
}));
form.addEventListener('submit', async event => {
  event.preventDefault(); const button = document.querySelector('#login-submit'); button.disabled = true; button.textContent = 'Đang đăng nhập...'; error.hidden = true;
  try {
    const response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(form))) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error);
    location.replace('/');
  } catch (e) { error.textContent = e.message || 'Không kết nối được máy chủ.'; error.hidden = false; }
  finally { button.disabled = false; button.textContent = 'Đăng nhập →'; }
});
