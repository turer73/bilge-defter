// Installation and updates must never force-reload an open notebook.
(() => {
  const currentVersion=document.querySelector('.badge').textContent.match(/v\d+/)?.[0]||'bilinmiyor';
  const button=document.createElement('button');button.id='pwaOpen';button.className='btn';button.textContent='Kurulum ve çevrim dışı';button.style.gridColumn='1/-1';document.querySelector('.tool-actions').append(button);
  const dialog=document.createElement('dialog');dialog.id='pwaDialog';dialog.className='tools-dialog';dialog.setAttribute('aria-labelledby','pwaTitle');
  dialog.innerHTML='<div class="tools-heading"><h2 id="pwaTitle">Uygulama kurulumu</h2><button class="btn" id="pwaClose">× Kapat</button></div><div class="tools-content"><p id="pwaStatus" role="status" class="recovery-note"></p><p id="pwaMode" class="recovery-note"></p><p id="pwaVersion" class="backup-warning"></p><button class="btn primary" id="pwaInstall" hidden>Uygulamayı yükle</button><p class="recovery-note">iPad / iPhone: Safari → Paylaş → Ana Ekrana Ekle. Android ve bilgisayar: tarayıcının Uygulamayı yükle / Ana ekrana ekle menüsünü kullanın. Menü cihaz ve tarayıcıya göre değişebilir.</p><p class="backup-warning">Farklı adresler ayrı depolama kullanır. Eski adreste Yedek al, yeni adreste Yedek yükle ile kontrollü aktarın. Notlar kendiliğinden taşınmaz; yükleme mevcut defterlerin yerine geçer. Güncelleme için tarayıcı verilerini silmeyin.</p><p class="recovery-note">Çevrim dışı paket hazır olduktan sonra notlar ve cihazdan PDF açma internetsiz kullanılabilir. İlk kurulum ve güncelleme bu adrese erişim gerektirir: özel adreste Tailscale, davetli adreste internet ve e-posta girişi. Davet iptali indirilmiş çevrim dışı kopyayı veya yerel notları uzaktan silmez. Ortak cihazda ayrı tarayıcı profili kullanın; bağımsız JSON yedeğini koruyun.</p><button class="btn" id="pwaCheck">Güncellemeyi denetle</button><p id="pwaUpdate" class="recovery-note" role="status"></p></div>';
  document.body.append(dialog);let registration=null,prompt=null,checking=false,serverVersion=null;
  const status=document.querySelector('#pwaStatus'),update=document.querySelector('#pwaUpdate');
  function refresh(){
    document.querySelector('#pwaMode').textContent=(matchMedia('(display-mode: standalone)').matches||navigator.standalone?'Uygulama penceresi':'Tarayıcı penceresi')+' · '+(navigator.onLine?'Bağlantı var görünüyor':'Çevrim dışı');
    document.querySelector('#pwaVersion').textContent=`Bu pencere: ${currentVersion} · Sunucu: ${serverVersion||'henüz denetlenmedi'} · ${location.hostname.endsWith('.ts.net')?'Özel Tailscale adresi':location.hostname==='defter.bilgearena.com'?'Davetli bağlantı':'Test adresi'}`;
    if(!isSecureContext){status.textContent='Bu HTTP adresinde çevrim dışı paket çalışmaz. Güvenli HTTPS adresini kullanın.';return}
    if(!('serviceWorker' in navigator)){status.textContent='Bu tarayıcı çevrim dışı kurulumu desteklemiyor. Normal kullanım ve JSON yedekleme kullanılabilir.';return}
    if(registration?.active)status.textContent='Çevrim dışı paket hazır. '+(navigator.serviceWorker.controller?'Bu pencere paketi kullanıyor.':'Devreye girmesi için uygulamayı kapatıp yeniden açın.');
    if(registration?.waiting)update.textContent='Yeni sürüm hazır. Önce kayıt tamamlandı bilgisini bekleyin ve JSON yedeği alın. Tüm Bilge Defter sekme ve uygulama pencerelerini kapatıp yeniden açın. Açık defter zorla yenilenmez.';
    document.querySelector('#pwaCheck').textContent=registration?.waiting?'Güncellemeyi yükle':'Güncellemeyi denetle';
  }
  button.onclick=()=>{closeTools();refresh();dialog.showModal()};document.querySelector('#pwaClose').onclick=()=>dialog.close();dialog.addEventListener('close',()=>document.querySelector('#toolsToggle').focus({preventScroll:true}));
  addEventListener('online',refresh);addEventListener('offline',refresh);
  addEventListener('beforeinstallprompt',event=>{event.preventDefault();prompt=event;document.querySelector('#pwaInstall').hidden=false});
  document.querySelector('#pwaInstall').onclick=async()=>{if(!prompt)return;const event=prompt;prompt=null;document.querySelector('#pwaInstall').hidden=true;await event.prompt();await event.userChoice;refresh()};
  addEventListener('appinstalled',()=>{prompt=null;document.querySelector('#pwaInstall').hidden=true;refresh()});
  document.querySelector('#pwaCheck').onclick=async()=>{
    if(registration?.waiting){location.reload();return;}
    if(!registration||checking)return;checking=true;document.querySelector('#pwaCheck').disabled=true;update.textContent='Denetleniyor…';let timer;const controller=new AbortController();
    try{
      await Promise.race([(async()=>{
        await registration.update();
        const response=await fetch('./release.json',{cache:'no-store',signal:controller.signal});
        if(!response.ok||response.redirected)throw Error('Release unavailable');const release=await response.json();if(!/^v\d+$/.test(release.version))throw Error('Invalid release');serverVersion=release.version;
        if(!registration.installing&&!registration.waiting)update.textContent=serverVersion===currentVersion?`Bu adres güncel: ${currentVersion}. Yeni paket yok.`:`Sunucuda ${serverVersion} var; bu pencere ${currentVersion}. Paket durumunu kontrol edin, tüm pencereleri kapatıp yeniden açın.`;
      })(),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('timeout'))},15000)})]);refresh();
    }catch{serverVersion=null;update.textContent='Güncelleme denetlenemedi. Bu adrese erişimi ve giriş oturumunu kontrol edin; mevcut notlar değişmedi.';refresh()}
    finally{clearTimeout(timer);controller.abort();checking=false;document.querySelector('#pwaCheck').disabled=false}
  };
  document.querySelector('#pwaCheck').disabled=true;status.textContent='Çevrim dışı paket hazırlanıyor…';refresh();
  if(!isSecureContext||!('serviceWorker' in navigator))return;
  navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(reg=>{
    registration=reg;document.querySelector('#pwaCheck').disabled=false;
    const watch=()=>{const worker=reg.installing;if(!worker)return;update.textContent='Çevrim dışı dosyalar doğrulanıyor…';worker.addEventListener('statechange',()=>{if(worker.state==='redundant'){update.textContent='Yeni paket hazırlanamadı. Mevcut notlar korunuyor; bağlantıyla tekrar denetleyin.';if(!reg.active)status.textContent='Çevrim dışı paket hazır değil.'}else if(worker.state==='activated'){update.textContent='';refresh()}else refresh()})};reg.addEventListener('updatefound',watch);watch();refresh();navigator.serviceWorker.ready.then(()=>refresh());
  }).catch(()=>{status.textContent='Çevrim dışı paket hazırlanamadı. Bağlantıyı kontrol edip yeniden açın; mevcut notlar değişmedi.'});
})();
