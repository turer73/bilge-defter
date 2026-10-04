// Each release is installed completely before it can replace the previous one.
const VERSION='v75',PREFIX='bilge-defter-test-',CACHE=PREFIX+VERSION;
const root=new URL('./',self.location.href);
const isLibrary=url=>{const relative=url.pathname.slice(root.pathname.length);return relative==='library'||relative.startsWith('library/')};
// Library pages are an online service in the same origin: they use no notebook cache
// and hold no notebook edits, so a library window never holds a notebook update.
const notebookWindow=client=>{const url=new URL(client.url);return url.origin===root.origin&&url.pathname.startsWith(root.pathname)&&!isLibrary(url)};
const libraryUnavailable=status=>{
  const auth=status===401||status===403;
  const reason=auth?'Kütüphane için oturum doğrulanamadı. Deftere dönüp yeniden giriş yaptıktan sonra tekrar deneyin.':'İnternet bağlantısını kontrol edip biraz sonra tekrar deneyin.';
  return new Response(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kütüphane açılamadı</title></head><body style="margin:0;padding:24px;font:16px/1.5 system-ui,sans-serif;color:#17312d;background:#fffef9"><main style="max-width:560px;margin:auto"><h1 style="font-size:22px">Kütüphane şu an açılamadı</h1><p>${reason}</p><p>Defterinizdeki notlar bu cihazda duruyor.</p><p><a class="notebook-return" href="${root.href}" style="display:inline-block;min-height:48px;line-height:48px;padding:0 20px;border-radius:8px;background:#20574b;color:#fff;text-decoration:none">← Deftere dön</a></p></main></body></html>`,{status:auth?status:503,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
};
self.addEventListener('install',event=>event.waitUntil((async()=>{
  try{
    const response=await fetch(new URL('offline-assets.json',root),{cache:'no-store'});
    if(!response.ok)throw Error('Offline manifest unavailable');
    const manifest=await response.json();
    if(manifest.version!==VERSION||!Array.isArray(manifest.files)||!manifest.files.length)throw Error('Release mismatch');
    const cache=await caches.open(CACHE),queue=manifest.files.slice();
    const jobs=await Promise.allSettled(Array.from({length:6},async()=>{
      while(queue.length){
        const asset=queue.shift(),url=new URL(asset.path,root);
        if(url.origin!==root.origin||!url.pathname.startsWith(root.pathname)||!/^[a-f0-9]{64}$/.test(asset.sha256))throw Error('Invalid asset');
        const res=await fetch(url,{cache:'no-store'});if(!res.ok||res.redirected)throw Error('Asset unavailable');
        const bytes=await res.clone().arrayBuffer(),digest=await crypto.subtle.digest('SHA-256',bytes);
        const hash=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
        if(hash!==asset.sha256)throw Error('Release integrity mismatch');
        await cache.put(url,res);
      }
    }));
    const failed=jobs.find(job=>job.status==='rejected');if(failed)throw failed.reason;
  }catch(error){await caches.delete(CACHE);throw error}
  // No skipWaiting: never replace the worker underneath an open notebook.
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for(const name of await caches.keys())if(name.startsWith(PREFIX)&&name!==CACHE)await caches.delete(name);
  // No clients.claim: existing pages keep their current lifecycle.
})()));
// Explicit user consent (Güncellemeyi yükle) may activate the integrity-checked
// worker immediately. Without this message the worker still waits for every old
// window to close, so an open notebook is never replaced underneath itself.
self.addEventListener('message',event=>{
  if(event.data!=='SKIP_WAITING')return;
  event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    if(windows.filter(notebookWindow).length>1){event.source?.postMessage({type:'UPDATE_DEFERRED',reason:'other-windows'});return}
    await self.skipWaiting();
  })());
});
self.addEventListener('push',event=>{
  let data={};try{data=event.data?event.data.json():{}}catch{}
  event.waitUntil(self.registration.showNotification(data.title||'Bilge Defter',{body:data.body||'Yeni yedek geldi.',tag:'bilge-defter-sync',renotify:true,data:{url:new URL('./',self.location.href).href}}));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const url=(event.notification.data&&event.notification.data.url)||new URL('./',self.location.href).href;
  event.waitUntil((async()=>{
    const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of clients){client.postMessage({type:'SYNC_PULL'});if(client.focus)await client.focus();return}
    await self.clients.openWindow(url);
  })());
});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==root.origin)return;
  const relative=url.pathname.slice(root.pathname.length);
  if(['release.json','auth-continue.html','auth-continue.js'].includes(relative)||url.pathname.startsWith('/cdn-cgi/')||relative.startsWith('api/')){event.respondWith(fetch(event.request,{cache:'no-store'}));return}
  if(event.request.mode==='navigate'&&isLibrary(url)){
    // The library opens in the notebook's own window, so a failed page must still lead back.
    event.respondWith(fetch(event.request).then(response=>response.status>=500||response.status===401||response.status===403?libraryUnavailable(response.status):response,()=>libraryUnavailable(503)));
    return;
  }
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    if(event.request.mode==='navigate'&&(url.pathname===root.pathname||url.pathname===root.pathname+'index.html')){
      const shell=await cache.match(new URL('index.html',root));if(shell)return shell;
    }
    const hit=await cache.match(event.request);return hit||fetch(event.request);
  })());
});
