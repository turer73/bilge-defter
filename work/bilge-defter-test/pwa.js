// Installation and updates must never force-reload an open notebook.
(() => {
  const currentVersion=document.querySelector('.badge').textContent.match(/v\d+/)?.[0]||'bilinmiyor';
  const button=document.createElement('button');button.id='pwaOpen';button.className='btn';button.textContent='Kurulum ve çevrim dışı';button.style.gridColumn='1/-1';document.querySelector('.tool-actions').append(button);
  const dialog=document.createElement('dialog');dialog.id='pwaDialog';dialog.className='tools-dialog';dialog.setAttribute('aria-labelledby','pwaTitle');
  dialog.innerHTML='<div class="tools-heading"><h2 id="pwaTitle">Uygulama kurulumu</h2><button class="btn" id="pwaClose">× Kapat</button></div><div class="tools-content"><p id="pwaStatus" role="status" class="recovery-note"></p><p id="pwaMode" class="recovery-note"></p><p id="pwaVersion" class="backup-warning"></p><p id="pwaAccount" class="recovery-note" role="status"></p><button class="btn primary" id="pwaInstall" hidden>Uygulamayı yükle</button><button class="btn primary" id="pwaLogin" hidden>Giriş sayfasını aç</button><p class="recovery-note">iPad / iPhone: Safari → Paylaş → Ana Ekrana Ekle. Android ve bilgisayar: tarayıcının Uygulamayı yükle / Ana ekrana ekle menüsünü kullanın. Menü cihaz ve tarayıcıya göre değişebilir.</p><p class="backup-warning">Farklı adresler ayrı depolama kullanır. Eski adreste Yedek al, yeni adreste Yedek yükle ile kontrollü aktarın. Notlar kendiliğinden taşınmaz; yükleme mevcut defterlerin yerine geçer. Güncelleme için tarayıcı verilerini silmeyin.</p><p class="recovery-note">Çevrim dışı paket hazır olduktan sonra notlar ve cihazdan PDF açma internetsiz kullanılabilir. İlk kurulum ve güncelleme bu adrese erişim gerektirir: özel adreste Tailscale, davetli adreste internet ve e-posta girişi. Davet iptali indirilmiş çevrim dışı kopyayı veya yerel notları uzaktan silmez. Ortak cihazda ayrı tarayıcı profili kullanın; bağımsız JSON yedeğini koruyun. Uygulama eski sürümde kaldıysa önce giriş sayfasını açıp e-posta girişini yenileyin.</p><button class="btn" id="pwaCheck">Güncellemeyi denetle</button><p id="pwaUpdate" class="recovery-note" role="status"></p></div>';
  document.body.append(dialog);let registration=null,prompt=null,checking=false,serverVersion=null;
  const status=document.querySelector('#pwaStatus'),update=document.querySelector('#pwaUpdate');
  // Oturum kapandiginda gorunen kalici uyari: notlar yerinde kalir, giris yenilenir.
  const sessionBanner=document.createElement('div');sessionBanner.id='accessSession';sessionBanner.hidden=true;sessionBanner.setAttribute('role','alert');
  sessionBanner.innerHTML='<strong>Oturum kapandı.</strong><span>Notlarınız bu cihazda kaldı. Giriş sayfasını açıp e-posta ile yeniden giriş yapın.</span><button type="button" class="btn primary" id="accessLoginBtn">Giriş yap</button>';
  document.body.append(sessionBanner);
  const sessionStyle=document.createElement('style');
  sessionStyle.textContent='#accessSession{position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:80;display:flex;align-items:center;gap:10px;max-width:min(92vw,560px);background:#fff4de;border:1px solid #bc965c;color:#653e06;border-radius:12px;padding:10px 14px;font-size:13px;line-height:1.45;box-shadow:0 8px 24px #173b3625}#accessSession[hidden]{display:none}#accessSession span{flex:1;min-width:0}#accessSession .btn{flex:none;padding:8px 12px;min-height:0}';
  document.head.append(sessionStyle);
  function sessionInvalid(){return location.hostname==='defter.bilgearena.com'&&navigator.onLine}
  function setSessionBanner(show){sessionBanner.hidden=!show}
  sessionBanner.querySelector('#accessLoginBtn').onclick=()=>{
    const url=new URL('access-login',location.origin).href;
    const win=window.open(url,'_blank');
    if(!win)sessionBanner.querySelector('span').textContent=`Yeni sekme açılamadı. Safari’de şu adresi ziyaret edip girişi tamamlayın: ${url}`;
  };
  let sessionTimer=null;
  async function checkSession(){
    if(!sessionInvalid()){setSessionBanner(false);return}
    try{
      const response=await fetch('./api/v1/bilge-defter/whoami',{cache:'no-store'});
      const type=(response.headers.get('content-type')||'').toLowerCase();
      if(response.ok&&!response.redirected&&!type.includes('text/html')){setSessionBanner(false);return}
      setSessionBanner(true);
    }catch{setSessionBanner(true)}
  }
  function scheduleSessionCheck(){clearInterval(sessionTimer);sessionTimer=setInterval(checkSession,300000)}
  window.__checkSession=checkSession;
  async function refreshAccount(){
    const el=document.querySelector('#pwaAccount');
    if(location.hostname!=='defter.bilgearena.com'){el.textContent='Özel adres: cihaz kimliği kullanılıyor. Hesap ve eşitleme yalnız davetli adreste sunulacak.';return}
    try{
      const response=await fetch('./api/v1/bilge-defter/whoami',{cache:'no-store'});
      if(!response.ok)throw Error();
      const body=await response.json();
      el.textContent=body.identity?.type==='access'?`Kimlik: ${body.identity.email} (Cloudflare Access ile doğrulandı) · ${body.sync?.detail||'Eşitleme sonraki dilimde.'}`:'Kimlik alınamadı; erişim kapısını kontrol edin.';
    }catch{el.textContent='Kimlik denetlenemedi. Notlar bu cihazda kaldı; hiçbir veri sunucuya gönderilmedi.'}
  }
  function refresh(){
    document.querySelector('#pwaMode').textContent=(matchMedia('(display-mode: standalone)').matches||navigator.standalone?'Uygulama penceresi':'Tarayıcı penceresi')+' · '+(navigator.onLine?'Bağlantı var görünüyor':'Çevrim dışı');
    void refreshAccount();
    document.querySelector('#pwaVersion').textContent=`Bu pencere: ${currentVersion} · Sunucu: ${serverVersion||'henüz denetlenmedi'} · ${location.hostname.endsWith('.ts.net')?'Özel Tailscale adresi':location.hostname==='defter.bilgearena.com'?'Davetli bağlantı':'Test adresi'}`;
    if(!isSecureContext){status.textContent='Bu HTTP adresinde çevrim dışı paket çalışmaz. Güvenli HTTPS adresini kullanın.';return}
    if(!('serviceWorker' in navigator)){status.textContent='Bu tarayıcı çevrim dışı kurulumu desteklemiyor. Normal kullanım ve JSON yedekleme kullanılabilir.';return}
    if(registration?.active)status.textContent='Çevrim dışı paket hazır. '+(navigator.serviceWorker.controller?'Bu pencere paketi kullanıyor.':'Devreye girmesi için uygulamayı kapatıp yeniden açın.');
    if(registration?.waiting)update.textContent='Yeni sürüm hazır. Önce kayıt tamamlandı bilgisini bekleyin ve JSON yedeği alın. Tüm Bilge Defter sekme ve uygulama pencerelerini kapatıp yeniden açın. Açık defter zorla yenilenmez.';
    document.querySelector('#pwaCheck').textContent=registration?.waiting?'Güncellemeyi yükle':'Güncellemeyi denetle';
  }
  button.onclick=()=>{closeTools();refresh();dialog.showModal()};document.querySelector('#pwaClose').onclick=()=>dialog.close();dialog.addEventListener('close',()=>document.querySelector('#toolsToggle').focus({preventScroll:true}));
  addEventListener('online',refresh);addEventListener('offline',refresh);addEventListener('online',checkSession);
  void checkSession();scheduleSessionCheck();
  addEventListener('beforeinstallprompt',event=>{event.preventDefault();prompt=event;document.querySelector('#pwaInstall').hidden=false});
  document.querySelector('#pwaInstall').onclick=async()=>{if(!prompt)return;const event=prompt;prompt=null;document.querySelector('#pwaInstall').hidden=true;await event.prompt();await event.userChoice;refresh()};
  addEventListener('appinstalled',()=>{prompt=null;document.querySelector('#pwaInstall').hidden=true;refresh()});
  document.querySelector('#pwaCheck').onclick=async()=>{
    if(registration?.waiting){
      // Explicit user action: the integrity-checked worker may activate now.
      // It never takes over an open notebook on its own; this click is the consent.
      const worker=registration.waiting;
      worker.addEventListener('statechange',()=>{if(worker.state==='activated')location.reload()});
      worker.postMessage('SKIP_WAITING');
      return;
    }
    if(!registration||checking)return;checking=true;document.querySelector('#pwaCheck').disabled=true;document.querySelector('#pwaLogin').hidden=true;update.textContent='Denetleniyor…';let timer;const controller=new AbortController();
    try{
      await Promise.race([(async()=>{
        await registration.update();
        let response;try{response=await fetch('./release.json',{cache:'no-store',signal:controller.signal})}catch{throw Error('network')}
        const contentType=(response.headers.get('content-type')||'').toLowerCase();
        if(!response.ok||response.redirected||contentType.includes('text/html')){loginFlow();throw Error('login')}
        const release=await response.json();if(!/^v\d+$/.test(release.version))throw Error('Invalid release');serverVersion=release.version;
        if(!registration.installing&&!registration.waiting)update.textContent=serverVersion===currentVersion?`Bu adres güncel: ${currentVersion}. Yeni paket yok.`:`Sunucuda ${serverVersion} var; bu pencere ${currentVersion}. Paket durumunu kontrol edin, tüm pencereleri kapatıp yeniden açın.`;
      })(),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('timeout'))},15000)})]);refresh();
    }catch(error){serverVersion=null;if(error.message!=='login'){update.textContent='Güncelleme denetlenemedi. Bu adrese erişimi ve giriş oturumunu kontrol edin; mevcut notlar değişmedi.'}refresh()}
    finally{clearTimeout(timer);controller.abort();checking=false;document.querySelector('#pwaCheck').disabled=false}
  };
  function loginFlow(){
    update.textContent='Güncelleme sunucusu giriş sayfası döndürdü: oturum kapalı ya da bağlantı giriş istiyor. Notlarınız etkilenmez; önce girişi yenileyin.';
    document.querySelector('#pwaLogin').hidden=false;
  }
  document.querySelector('#pwaLogin').onclick=()=>{
    const url=new URL('access-login',location.origin).href;
    const win=window.open(url,'_blank');
    update.textContent=win
      ?'Giriş sayfası açıldı. E-posta girişini tamamlayın, sonra uygulamayı kapatıp yeniden açın ve tekrar denetleyin.'
      :`Yeni sekme açılamadı. Safari’de şu adresi ziyaret edip girişi tamamlayın: ${url}`;
  };
  document.querySelector('#pwaCheck').disabled=true;status.textContent='Çevrim dışı paket hazırlanıyor…';refresh();
  if(!isSecureContext||!('serviceWorker' in navigator))return;
  navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(reg=>{
    registration=reg;document.querySelector('#pwaCheck').disabled=false;
    const watch=()=>{const worker=reg.installing;if(!worker)return;update.textContent='Çevrim dışı dosyalar doğrulanıyor…';worker.addEventListener('statechange',()=>{if(worker.state==='redundant'){update.textContent='Yeni paket hazırlanamadı. Mevcut notlar korunuyor; bağlantıyla tekrar denetleyin.';if(!reg.active)status.textContent='Çevrim dışı paket hazır değil.'}else if(worker.state==='activated'){update.textContent='';refresh()}else refresh()})};reg.addEventListener('updatefound',watch);watch();refresh();navigator.serviceWorker.ready.then(()=>refresh());
    }).catch(()=>{status.textContent='Çevrim dışı paket hazırlanamadı. Bağlantıyı kontrol edip yeniden açın; mevcut notlar değişmedi.'});
  // Silent daily update check on production hosts: installs the next release as
  // `waiting` only; an open notebook is never replaced without explicit consent.
  if(/\.ts\.net$/.test(location.hostname)||location.hostname==='defter.bilgearena.com'){
    navigator.serviceWorker.ready.then(()=>{
      if(!navigator.onLine||!registration)return;
      const last=Number(localStorage.getItem('bdef-last-autocheck')||0);
      if(Date.now()-last<86400000)return;
      localStorage.setItem('bdef-last-autocheck',String(Date.now()));
      registration.update().catch(()=>{});
    });
  }
})();
