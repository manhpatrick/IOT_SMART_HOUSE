// Retire previous NODO PWA installations without intercepting web requests.
self.addEventListener('install',e=>e.waitUntil(self.skipWaiting()));
self.addEventListener('activate',e=>e.waitUntil((async()=>{
 for(const key of await caches.keys())if(key.startsWith('nodo-shell-'))await caches.delete(key);
 await self.registration.unregister();await self.clients.claim();
})()));
