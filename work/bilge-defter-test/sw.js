// Each release is installed completely before it can replace the previous one.
const VERSION='v30',PREFIX='bilge-defter-test-',CACHE=PREFIX+VERSION;
const root=new URL('./',self.location.href);
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
self.addEventListener('message',event=>{if(event.data==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==root.origin)return;
  if(url.pathname===new URL('release.json',root).pathname){event.respondWith(fetch(event.request,{cache:'no-store'}));return}
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    if(event.request.mode==='navigate'&&(url.pathname===root.pathname||url.pathname===root.pathname+'index.html')){
      const shell=await cache.match(new URL('index.html',root));if(shell)return shell;
    }
    const hit=await cache.match(event.request);return hit||fetch(event.request);
  })());
});
