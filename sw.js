const CACHE='probability-review-bad1ff61ba2e';
const FILES=["./", "./index.html", "./app.js?v=276bf6d3db3e", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('probability-review-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET')return;
 const url=new URL(event.request.url);
 if(url.origin!==location.origin||!url.href.startsWith(self.registration.scope))return;
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE);
  if(event.request.mode==='navigate'){
   try{const response=await fetch(event.request);if(response.ok){await cache.put('./index.html',response.clone());return response;}}catch{}
   return (await cache.match('./index.html'))||Response.error();
  }
  return (await cache.match(event.request))||fetch(event.request);
 })());
});
