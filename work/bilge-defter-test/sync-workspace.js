// Manual server backup, end-to-end encrypted. The server stores ciphertext only;
// the passphrase never leaves the device and the plaintext never reaches the server.
(() => {
  const KDF='pbkdf2-sha256-250000',ITERATIONS=250000;
  const keyCache=new Map();
  const enc=new TextEncoder(),dec=new TextDecoder();
  const toB64=b=>{let s='';for(const x of b)s+=String.fromCharCode(x);return btoa(s)};
  const fromB64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
  function invited(){return location.hostname==='defter.bilgearena.com'||window.__syncInvited===true}
  async function deriveKey(pass,salt){const km=await crypto.subtle.importKey('raw',enc.encode(pass),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:ITERATIONS,hash:'SHA-256'},km,{name:'AES-GCM',length:256},false,['encrypt','decrypt'])}
  async function keyFor(pass,salt){const cacheKey=pass+'|'+toB64(salt);if(keyCache.has(cacheKey))return keyCache.get(cacheKey);const key=await deriveKey(pass,salt);if(keyCache.size>8)keyCache.delete(keyCache.keys().next().value);keyCache.set(cacheKey,key);return key}
  async function encryptPayload(pass,text){const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));const key=await deriveKey(pass,salt);const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,enc.encode(text));return {ciphertext:toB64(new Uint8Array(ct)),iv:toB64(iv),salt:toB64(salt),kdf:KDF}}
  async function decryptPayload(data,pass){if(data.kdf!==KDF)throw Error('kdf');const key=await keyFor(pass,fromB64(data.salt));const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:fromB64(data.iv)},key,fromB64(data.ciphertext));return dec.decode(plain)}
  const passDialog=document.createElement('dialog');passDialog.id='syncPassDialog';passDialog.className='tools-dialog';passDialog.setAttribute('aria-labelledby','syncPassTitle');
  passDialog.innerHTML='<div class="tools-heading"><h2 id="syncPassTitle">Parola</h2><button class="btn" id="syncPassClose" type="button">× Kapat</button></div><form id="syncPassForm" class="tools-content"><p class="recovery-note">Bu parolayla yedek uçtan uca şifrelenir; sunucu yalnız şifreli yığını saklar. Parola hiçbir yerde saklanmaz; kaybolursa sunucudaki yedek açılamaz. Yüklerken aynı parolayı girmelisiniz.</p><label>Parola (en az 8 karakter)<input id="syncPassInput" type="password" minlength="8" autocomplete="new-password" required></label><label id="syncPassConfirmLabel" hidden>Parolayı tekrar girin<input id="syncPassConfirm" type="password" minlength="8" autocomplete="new-password"></label><p id="syncPassError" role="status"></p><div class="tool-actions"><button class="btn primary" id="syncPassSubmit" type="submit">Devam et</button><button class="btn" id="syncPassCancel" type="button">Vazgeç</button></div></form>';
  document.body.append(passDialog);
  let passResolve=null,passReject=null,purpose='';
  function askPassphrase(forPurpose){purpose=forPurpose;return new Promise((resolve,reject)=>{passResolve=resolve;passReject=reject;document.querySelector('#syncPassInput').value='';document.querySelector('#syncPassConfirm').value='';document.querySelector('#syncPassConfirmLabel').hidden=forPurpose!=='upload';document.querySelector('#syncPassError').textContent='';document.querySelector('#syncPassTitle').textContent={upload:'Yedeği şifrele',download:'Yedeği aç',sync:'Eşitlemeyi aç'}[forPurpose]||'Parola';passDialog.showModal();document.querySelector('#syncPassInput').focus({preventScroll:true})})}
  document.querySelector('#syncPassForm').onsubmit=e=>{e.preventDefault();const v=document.querySelector('#syncPassInput').value;if(v.length<8){document.querySelector('#syncPassError').textContent='Parola en az 8 karakter olmalı.';return}if(purpose==='upload'){const c=document.querySelector('#syncPassConfirm').value;if(c!==v){document.querySelector('#syncPassError').textContent='Parolalar eşleşmiyor. Kontrol edip tekrar yazın.';return}}passDialog.close();passResolve(v)};
  document.querySelector('#syncPassCancel').onclick=()=>{passDialog.close();passReject(Error('cancelled'))};document.querySelector('#syncPassClose').onclick=()=>{passDialog.close();passReject(Error('cancelled'))};
  const syncButtons=document.createElement('div');syncButtons.className='backup-actions';
  syncButtons.innerHTML='<button class="btn" id="syncUpload">Sunucuya yedekle</button><button class="btn" id="syncDownload">Sunucudan yükle</button><p class="recovery-note" id="syncStatus" role="status"></p><p class="recovery-note" id="syncNote">Sunucu yedeği yalnız davetli adreste ve elle çalışır; içerik uçtan uca şifrelidir, sunucu açık metin görmez. Parolanızı güvenli bir yerde saklayın; JSON yedeğinin yerini tutmaz.</p>';
  document.querySelector('#backupDialog .backup-actions').before(syncButtons);
  function renderSyncActions(){
    const show=invited();document.querySelector('#syncUpload').hidden=!show;document.querySelector('#syncDownload').hidden=!show;
    document.querySelector('#syncNote').hidden=show;
    if(!show){document.querySelector('#syncStatus').textContent='Sunucu yedeği yalnız defter.bilgearena.com adresinde kullanılabilir.';return}
    document.querySelector('#syncStatus').textContent='';
  }
  function setSyncStatus(text){document.querySelector('#syncStatus').textContent=text}
  async function syncApi(path,options){const res=await fetch(path,options);if(!res.ok){let detail='';try{detail=(await res.json()).detail||''}catch{}throw Error(detail||(res.status===404?'Sunucuda yedek yok.':`Sunucu yanıtı ${res.status}.`))}return res}
  document.querySelector('#syncUpload').onclick=async()=>{
    if(!invited()||!state||!validState(state))return;
    let pass;try{pass=await askPassphrase('upload')}catch{return}
    setSyncStatus('Şifreleniyor…');
    try{
      try{
        const existing=await (await syncApi('./api/v1/bilge-defter/backup')).json();
        if(existing?.ciphertext){
          try{await decryptPayload(existing,pass)}catch{
            if(!confirm('Sunucudaki mevcut yedek bu parolayla açılamadı. Parolayı değiştirmek istediğinizden emin misiniz? Yanlış parola girdiyseniz eski yedeğin üzerine yazılacaktır.')){
              setSyncStatus('Yedekleme iptal edildi.');
              return;
            }
          }
        }
      }catch(e){if(e?.message&&!e.message.includes('404')&&!e.message.includes('Sunucuda yedek yok'))throw e}
      const snapshot=notebookSnapshot();
      const payload=await encryptPayload(pass,JSON.stringify(snapshot));
      await syncApi('./api/v1/bilge-defter/backup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,updated_at:snapshot.exportedAt,device_id:deviceId()})});
      setSyncStatus(`Sunucuda şifreli yedek var · ${new Date(snapshot.exportedAt).toLocaleString('tr-TR')}. Yalnız en son kopya saklanır.`);
    }catch(error){setSyncStatus(error.message==='cancelled'?'':`Yedek alınamadı. ${error.message} Notlar değişmedi.`)}
  };
  document.querySelector('#syncDownload').onclick=async()=>{
    if(!invited())return;
    let pass;try{pass=await askPassphrase('download')}catch{return}
    setSyncStatus('Sunucudan getiriliyor…');
    try{
      const data=await (await syncApi('./api/v1/bilge-defter/backup')).json();
      let text;try{text=await decryptPayload(data,pass)}catch{setSyncStatus('Parola yanlış veya yedek okunamadı. Mevcut defter değişmedi.');return}
      let info;try{info=parseBackup(JSON.parse(text))}catch(error){setSyncStatus(error.message);return}
      setSyncStatus('');
      previewBackup(info,`Sunucu yedeği (${data.updated_at||'tarih yok'})`);
    }catch(error){setSyncStatus(`Yedek alınamadı. ${error.message} Mevcut defter değişmedi.`)}
  };
  window.renderSyncActions=renderSyncActions;
  // --- Otomatik esitleme: oturum kilidi + 5 sn denetim + cakisma secimi ---
  const SYNC_META_KEY='bilge-defter-sync-meta-v1';
  const DEVICE_KEY='bilge-defter-device-id';
  let syncPass=null,syncEnabled=false,localDirty=false,pushState='',lastSyncAt=(()=>{try{return JSON.parse(localStorage.getItem(SYNC_META_KEY)||'null')?.lastSyncAt||null}catch{return null}})(),conflictHold=0,conflictPayload=null;
  function deviceId(){let d=null;try{d=localStorage.getItem(DEVICE_KEY)}catch{}if(!d){d=(globalThis.crypto?.randomUUID?.()||'dev-'+Date.now()+'-'+Math.random().toString(36).slice(2));try{localStorage.setItem(DEVICE_KEY,d)}catch{}}return d}
  function b64UrlToBytes(s){const pad=s.length%4?s+'='.repeat(4-s.length%4):s;const bin=atob(pad.replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(bin,c=>c.charCodeAt(0))}
  async function subscribePush(){
    if(typeof Notification==='undefined'||!('serviceWorker' in navigator)||!('PushManager' in window))return 'desteklenmiyor';
    let perm=Notification.permission;
    if(perm==='default'){try{perm=await Notification.requestPermission()}catch{return 'izin-yok'}}
    if(perm!=='granted')return 'izin-yok';
    try{
      const reg=await navigator.serviceWorker.ready;
      const pub=(await (await syncApi('./api/v1/bilge-defter/vapid-key')).json()).public_key;
      let sub=await reg.pushManager.getSubscription();
      if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64UrlToBytes(pub)});
      const json=sub.toJSON?sub.toJSON():sub;
      await syncApi('./api/v1/bilge-defter/push-subscription',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({device_id:deviceId(),subscription:{endpoint:json.endpoint,keys:json.keys}})});
      return 'acik';
    }catch{return 'kurulamadi'}
  }
  if('serviceWorker' in navigator)navigator.serviceWorker.addEventListener('message',event=>{if(event.data&&event.data.type==='SYNC_PULL')void syncTick()});
  function writeSyncMeta(){try{localStorage.setItem(SYNC_META_KEY,JSON.stringify({lastSyncAt}))}catch{}}
  window.markSyncDirty=()=>{localDirty=true;renderSyncUi()};
  const conflictBanner=document.createElement('div');conflictBanner.id='syncConflictBanner';conflictBanner.hidden=true;conflictBanner.setAttribute('role','alert');
  conflictBanner.innerHTML='<strong>Eşitleme çakışması</strong><p>Bu cihazda kaydedilmemiş değişiklikler var ve sunucuda da daha yeni bir kopya duruyor. Hangisini kullanacağınızı seçin; diğer kopyanın üzerine yazılır.</p><div class="recovery-actions"><button class="btn primary" id="syncConflictServer">Sunucudakini yükle</button><button class="btn" id="syncConflictLocal">Yereldekini gönder</button><button class="btn" id="syncConflictHold">Şimdilik bırak</button></div>';
  document.body.append(conflictBanner);
  const syncStyle=document.createElement('style');syncStyle.textContent='#syncConflictBanner{position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:45;width:min(560px,calc(100% - 24px));padding:14px;border:1px solid #d69974;border-radius:12px;background:#fff5df;box-shadow:0 8px 32px #173b3640;color:#502e18}#syncConflictBanner[hidden]{display:none}#syncConflictBanner p{margin:0 0 10px;font-size:13px;line-height:1.4}';document.head.append(syncStyle);
  const syncArea=document.createElement('div');syncArea.className='tool-actions';
  syncArea.innerHTML='<button class="btn" id="syncUnlock" hidden>Eşitlemeyi aç</button><p class="recovery-note" id="syncAutoStatus" role="status"></p><p class="recovery-note" id="syncAutoNote">Otomatik eşitleme yalnız davetli adreste ve oturum kilidi açılınca çalışır. Yedekler uçtan uca şifrelidir; sunucu tek son kopya tutar. İki cihaz aynı anda düzenlerse çakışmada siz seçersiniz.</p>';
  document.querySelector('#backupDialog .backup-actions').after(syncArea);
  function renderSyncUi(){
    const invitedNow=invited();
    document.querySelector('#syncUnlock').hidden=!invitedNow||syncEnabled;
    document.querySelector('#syncAutoNote').hidden=invitedNow;
    const pushNote=pushState==='acik'?' · bildirimler açık':pushState==='izin-yok'?' · bildirim izni yok':pushState==='desteklenmiyor'?' · bildirim desteklenmiyor':'';
    if(!invitedNow){document.querySelector('#syncAutoStatus').textContent='Otomatik eşitleme yalnız defter.bilgearena.com adresinde.';return}
    document.querySelector('#syncAutoStatus').textContent=syncEnabled?(lastSyncAt?`Eşitleme açık · son: ${new Date(lastSyncAt).toLocaleString('tr-TR')}${localDirty?' · değişiklikler var':''}${pushNote}`:`Eşitleme açık · henüz eşitlenmedi${pushNote}`):'Eşitleme kapalı; açmak için parolayı girin.';
  }
  document.querySelector('#syncUnlock').onclick=async()=>{
    if(!invited())return;
    let pass;try{pass=await askPassphrase('sync')}catch{return}
    try{
      try{const data=await (await syncApi('./api/v1/bilge-defter/backup')).json();try{await decryptPayload(data,pass)}catch{document.querySelector('#syncAutoStatus').textContent='Parola yanlış; sunucudaki yedek bu parolayla açılamıyor.';return}}catch(error){if(error?.message&&error.message.includes('404')){}else if(error?.message&&error.message.includes('Sunucuda yedek yok')){}else{throw error}}
      syncPass=pass;syncEnabled=true;renderSyncUi();pushState=await subscribePush();renderSyncUi();void syncTick();
    }catch(error){document.querySelector('#syncAutoStatus').textContent=`Eşitleme açılamadı. ${error.message}`}
  };
  async function syncPush(){
    if(!syncEnabled||!invited()||!ready)return;
    const snapshot=notebookSnapshot();
    const payload=await encryptPayload(syncPass,JSON.stringify(snapshot));
    await syncApi('./api/v1/bilge-defter/backup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,updated_at:snapshot.exportedAt,device_id:deviceId()})});
    localDirty=false;lastSyncAt=snapshot.exportedAt;writeSyncMeta();renderSyncUi();
  }
  async function syncApply(data){
    const text=await decryptPayload(data,syncPass);
    const info=parseBackup(JSON.parse(text));
    const ok=await replaceNotebook(info.book,'Sunucudan eşitlendi');
    if(ok){localDirty=false;lastSyncAt=data.updated_at;writeSyncMeta();renderSyncUi()}
  }
  async function syncTick(){
    if(!syncEnabled||!invited()||!ready||saveConflict||importing)return;
    if(document.visibilityState==='hidden')return;
    if(conflictHold>Date.now())return;
    let data=null;
    try{data=await (await syncApi('./api/v1/bilge-defter/backup')).json()}catch{/* 404 veya cevrim disi */}
    const serverNewer=!!data&&(!lastSyncAt||data.updated_at>lastSyncAt);
    if(serverNewer){
      if(localDirty){showConflict(data);return}
      if(!isDirty()){try{await syncApply(data)}catch{}}
      return;
    }
    if(!isDirty()&&localDirty){try{await syncPush()}catch{}}
  }
  function showConflict(data){
    if(conflictBanner.dataset.open==='1')return;conflictPayload=data;conflictBanner.hidden=false;conflictBanner.dataset.open='1';
    document.querySelector('#syncConflictServer').onclick=async()=>{conflictBanner.hidden=true;conflictBanner.dataset.open='';try{await syncApply(conflictPayload)}catch(error){document.querySelector('#syncAutoStatus').textContent=`Çakışma çözülemedi. ${error.message}`}};
    document.querySelector('#syncConflictLocal').onclick=async()=>{conflictBanner.hidden=true;conflictBanner.dataset.open='';try{await syncPush()}catch(error){document.querySelector('#syncAutoStatus').textContent=`Yerel gönderilemedi. ${error.message}`}};
    document.querySelector('#syncConflictHold').onclick=()=>{conflictBanner.hidden=true;conflictBanner.dataset.open='';conflictHold=Date.now()+30*60*1000;renderSyncUi()};
  }
  window.renderSyncActions=()=>{renderSyncActions();renderSyncUi()};
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&syncEnabled&&ready)void syncTick()});
  setInterval(syncTick,5000);
})();
