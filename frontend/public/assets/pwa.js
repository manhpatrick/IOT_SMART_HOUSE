// Retire only NODO's previous PWA; no new worker is registered.
(async()=>{try{
 if('serviceWorker' in navigator)for(const r of await navigator.serviceWorker.getRegistrations()){
  const w=r.active||r.waiting||r.installing;
  if(w&&new URL(w.scriptURL).origin===location.origin&&new URL(w.scriptURL).pathname==='/sw.js')await r.unregister();
 }
 if('caches' in window)for(const key of await caches.keys())if(key.startsWith('nodo-shell-'))await caches.delete(key);
}catch{}})();
