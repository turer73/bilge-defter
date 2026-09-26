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
  const cancelPass=()=>{passDialog.close();passReject?.(Error('cancelled'))};
  document.querySelector('#syncPassCancel').onclick=cancelPass;document.querySelector('#syncPassClose').onclick=cancelPass;
  passDialog.addEventListener('cancel',event=>{event.preventDefault();cancelPass()});
  passDialog.addEventListener('close',()=>{document.querySelector('#syncPassInput').value='';document.querySelector('#syncPassConfirm').value=''});
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
  async function syncApi(path,options={}){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    try{
      const res=await (window.BilgeAccount?.fetch||fetch)(path,{...options,cache:'no-store',signal:controller.signal});
      const type=res.headers.get('content-type')||'';
      if(res.redirected||type.includes('text/html'))throw Error('Giriş oturumunu yenileyin.');
      if(!res.ok){const error=Error(res.status===404?'Sunucuda yedek yok.':`Sunucu yanıtı ${res.status}.`);error.status=res.status;error.response=res;throw error}
      return res;
    }finally{clearTimeout(timer)}
  }
  const BACKUP='./api/v1/bilge-defter/backup';
  const protocolMessage='Sunucunun sürüm koruması doğrulanamadı. Otomatik eşitleme ve sunucuya gönderme kapalı; yerel notlar ve JSON yedekleme çalışır.';
  function hasCas(res){return res?.headers.get('X-Bilge-Sync-Protocol')==='cas-v1'}
  function strongTag(res){const tag=res?.headers.get('ETag');return tag&&/^"[^"\r\n]+"$/.test(tag)?tag:null}
  async function readRemote(){
    let response;try{response=await syncApi(BACKUP)}catch(error){if(error.status!==404)throw error;return {response:error.response,data:null,tag:null}}
    const data=await response.json();if(!data||typeof data.ciphertext!=='string'||typeof data.salt!=='string'||typeof data.iv!=='string')throw Error('Sunucu yedeği geçersiz.');
    return {response,data,tag:strongTag(response)};
  }
  function requireCas(remote){if(!hasCas(remote.response)||(remote.data&&!remote.tag))throw Error(protocolMessage)}
  async function postRemote(remote,payload){
    requireCas(remote);
    const response=await syncApi(BACKUP,{method:'POST',headers:{'Content-Type':'application/json',...(remote.data?{'If-Match':remote.tag}:{'If-None-Match':'*'})},body:JSON.stringify(payload)});
    const tag=strongTag(response);if(!hasCas(response)||!tag)throw Error('Gönderim yanıtı doğrulanamadı; yerel değişiklikler eşitlendi sayılmadı.');return tag;
  }
  let operationBusy=false;
  async function exclusive(fn){if(operationBusy)return;operationBusy=true;try{return await fn()}finally{operationBusy=false}}
  document.querySelector('#syncUpload').onclick=async()=>{
    if(!invited()||!state||!validState(state))return;
    let pass;try{pass=await askPassphrase('upload')}catch{return}
    setSyncStatus('Şifreleniyor…');
    try{
      const remote=await readRemote();requireCas(remote);
        const existing=remote.data;
        if(existing?.ciphertext){
          try{await decryptPayload(existing,pass)}catch{
            if(!confirm('Sunucudaki mevcut yedek bu parolayla açılamadı. Parolayı değiştirmek istediğinizden emin misiniz? Yanlış parola girdiyseniz eski yedeğin üzerine yazılacaktır.')){
              setSyncStatus('Yedekleme iptal edildi.');
              return;
            }
          }
        }
      if(!await flushSave())throw Error('Önce yerel kaydı tamamlayın.');
      const snapshot=notebookSnapshot();
      const payload=await encryptPayload(pass,JSON.stringify(snapshot));
      await postRemote(remote,{...payload,updated_at:snapshot.exportedAt,device_id:deviceId()});
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
      await validatePdfImages(info.book);await validateMediaImages(info.book);
      setSyncStatus('');
      previewBackup(info,`Sunucu yedeği (${data.updated_at||'tarih yok'})`);
    }catch(error){setSyncStatus(`Yedek alınamadı. ${error.message} Mevcut defter değişmedi.`)}
  };
  window.renderSyncActions=renderSyncActions;
  // --- Otomatik esitleme: oturum kilidi + 5 sn denetim + cakisma secimi ---
  const deviceKey=()=> 'bilge-defter-device-id'+(window.BilgeAccount?.identity?.id?'-'+window.BilgeAccount.identity.id:'');
  let syncPass=null,syncEnabled=false,localDirty=true,lastSyncAt=null,conflictHold=0,conflictPayload=null,receipt=null;
  const hashText=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(text))),n=>n.toString(16).padStart(2,'0')).join('');
  async function refreshReceipt(){
    receipt=await dbGet('sync-state-v2');
    localDirty=!receipt||receipt.dirty!==false||receipt.ackHash!==await hashText(JSON.stringify(state))||isDirty();
    lastSyncAt=receipt?.lastSyncAt||null;
  }
  async function acknowledge(expected,revision,tag,at){
    const next={ackHash:await hashText(expected),tag,lastSyncAt:at};
    const dirty=await dbAcknowledgeSync(expected,next);
    receipt=next;localDirty=dirty||editRevision!==revision||JSON.stringify(state)!==expected;
    lastSyncAt=at;renderSyncUi();
  }
  function editorIdle(){return ready&&!saveConflict&&!saveFailed&&!importing&&!drawing&&!pan&&canEdit()&&!mediaPending&&!mediaGesture&&!plannerDirty&&!document.querySelector('dialog[open]')}
  function deviceId(){const key=deviceKey();let d=null;try{d=localStorage.getItem(key)}catch{}if(!d){d=(globalThis.crypto?.randomUUID?.()||'dev-'+Date.now()+'-'+Math.random().toString(36).slice(2));try{localStorage.setItem(key,d)}catch{}}return d}
  // Server push sending is disabled (unrestricted endpoints were contained on 26 Sep).
  // Never advertise it; drop a subscription left by an earlier version.
  async function retirePush(){
    try{const reg=await navigator.serviceWorker?.getRegistration();const sub=await reg?.pushManager?.getSubscription();if(sub)await sub.unsubscribe()}catch{}
  }
  if('serviceWorker' in navigator)navigator.serviceWorker.addEventListener('message',event=>{if(event.data&&event.data.type==='SYNC_PULL')void syncTick()});
  window.markSyncDirty=()=>{if(localDirty)return;localDirty=true;renderSyncUi()};
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
    if(!invitedNow){document.querySelector('#syncAutoStatus').textContent='Otomatik eşitleme yalnız defter.bilgearena.com adresinde.';return}
    document.querySelector('#syncAutoStatus').textContent=syncEnabled?(lastSyncAt?`Eşitleme açık · son: ${new Date(lastSyncAt).toLocaleString('tr-TR')}${localDirty?' · değişiklikler var':''}`:'Eşitleme açık · henüz eşitlenmedi'):'Eşitleme kapalı; açmak için parolayı girin.';
  }
  document.querySelector('#syncUnlock').onclick=async()=>{
    if(!invited())return;
    let pass;try{pass=await askPassphrase('sync')}catch{return}
    try{
      const remote=await readRemote();requireCas(remote);
      if(remote.data)try{await decryptPayload(remote.data,pass)}catch{document.querySelector('#syncAutoStatus').textContent='Parola yanlış; sunucudaki yedek bu parolayla açılamıyor.';return}
      await refreshReceipt();syncPass=pass;syncEnabled=true;renderSyncUi();
      void retirePush();
    }catch(error){document.querySelector('#syncAutoStatus').textContent=`Eşitleme açılamadı. ${error.message}`}
  };
  async function syncPush(remote){
    if(!syncEnabled||!invited()||!editorIdle()||!await flushSave())return;
    requireCas(remote);
    const expected=JSON.stringify(state),revision=editRevision;
    const snapshot=notebookSnapshot();
    const payload=await encryptPayload(syncPass,JSON.stringify(snapshot));
    const tag=await postRemote(remote,{...payload,updated_at:snapshot.exportedAt,device_id:deviceId()});
    await acknowledge(expected,revision,tag,snapshot.exportedAt);
  }
  async function syncApply(remote){
    if(!editorIdle())return;
    const revision=editRevision,data=remote.data;
    const text=await decryptPayload(data,syncPass);
    const info=parseBackup(JSON.parse(text));
    await validatePdfImages(info.book);await validateMediaImages(info.book);
    if(!editorIdle()||editRevision!==revision){showConflict(remote);return}
    const ok=await replaceNotebook(info.book,'Sunucudan eşitlendi');
    if(ok)await acknowledge(JSON.stringify({...info.book,active:selectionFor(info.book).active}),revision+1,remote.tag,data.updated_at);
  }
  async function syncTick(){
    if(!syncEnabled||!invited()||!editorIdle()||operationBusy||conflictBanner.dataset.open==='1')return;
    if(document.visibilityState==='hidden')return;
    if(conflictHold>Date.now())return;
    return exclusive(async()=>{try{
      const remote=await readRemote();requireCas(remote);await refreshReceipt();
      if(!editorIdle())return;
      const changed=!!remote.data&&remote.tag!==receipt?.tag;
      if(changed){if(localDirty){showConflict(remote);return}await syncApply(remote);return}
      if(localDirty)await syncPush(remote);
    }catch(error){document.querySelector('#syncAutoStatus').textContent=`Eşitleme durdu; notlar yerelde korundu. ${error.message}`}});
  }
  function showConflict(data){
    if(conflictBanner.dataset.open==='1')return;conflictPayload=data;conflictBanner.hidden=false;conflictBanner.dataset.open='1';
    document.querySelector('#syncConflictServer').onclick=()=>exclusive(async()=>{if(!editorIdle())return;conflictBanner.hidden=true;conflictBanner.dataset.open='';try{await syncApply(conflictPayload)}catch(error){document.querySelector('#syncAutoStatus').textContent=`Çakışma çözülemedi. ${error.message}`}});
    document.querySelector('#syncConflictLocal').onclick=()=>exclusive(async()=>{if(!editorIdle())return;conflictBanner.hidden=true;conflictBanner.dataset.open='';try{await syncPush(conflictPayload)}catch(error){document.querySelector('#syncAutoStatus').textContent=`Yerel gönderilemedi. ${error.message}`}});
    document.querySelector('#syncConflictHold').onclick=()=>{conflictBanner.hidden=true;conflictBanner.dataset.open='';conflictHold=Date.now()+30*60*1000;renderSyncUi()};
  }
  window.renderSyncActions=()=>{renderSyncActions();renderSyncUi()};
  for(const id of ['syncUpload','syncDownload','syncUnlock']){const button=document.querySelector('#'+id),action=button.onclick;button.onclick=()=>exclusive(action)}
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&syncEnabled&&ready)void syncTick()});
  addEventListener('bilge-account-locked',()=>{syncEnabled=false;syncPass=null;keyCache.clear();conflictPayload=null;conflictBanner.hidden=true;conflictBanner.dataset.open='';passReject?.(Error('cancelled'));renderSyncUi()});
  setInterval(syncTick,5000);
})();
