// Only the public UI is cached. Never cache API responses, credentials or telemetry.
const CACHE = 'nodo-shell-v5';
const SHELL = ['/app','/login','/assets/home.css','/assets/app.css','/assets/ai.css','/assets/gas.css','/assets/gas.js','/assets/home.js','/assets/ai-panel.js','/assets/login.js','/assets/pwa.js','/assets/chart.umd.js','/assets/favicon.svg','/assets/icon-192.png','/assets/icon-512.png','/manifest.webmanifest','/offline.html'];
self.addEventListener('install',event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(()=>self.skipWaiting())); });
self.addEventListener('activate',event => { event.waitUntil(Promise.all([caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('nodo-shell-') && key !== CACHE).map(key => caches.delete(key)))),self.clients.claim()])); });
self.addEventListener('fetch',event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== 'GET' || url.pathname.startsWith('/api/') || url.pathname === '/ws') return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(async () => (await caches.match(url.pathname === '/app' ? '/app' : url.pathname === '/login' ? '/login' : '/offline.html'))));
  } else if (SHELL.includes(url.pathname)) event.respondWith(fetch(event.request).then(response=>{
    if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy)));}
    return response;
  }).catch(()=>caches.match(event.request)));
});
