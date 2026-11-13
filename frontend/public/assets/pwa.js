let installPrompt;
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; });
window.nodoInstall = async () => {
  if (installPrompt) { await installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; return; }
  const text = !window.isSecureContext ? 'Để cài app trên điện thoại, mở NODO bằng địa chỉ HTTPS. HTTP trong mạng LAN vẫn dùng được giao diện web.' : 'Android: mở menu trình duyệt → Cài ứng dụng / Thêm vào màn hình chính. iPhone: mở Safari → Chia sẻ → Thêm vào Màn hình chính.';
  const container = document.querySelector('#home-toasts');
  if (container) { const el = document.createElement('div'); el.className = 'home-toast'; el.textContent = text; container.append(el); setTimeout(() => el.remove(),12000); }
};
if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('/sw.js').catch(() => {});
