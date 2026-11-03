// Manual server backup, end-to-end encrypted. The server stores ciphertext only;
// the passphrase never leaves the device and the plaintext never reaches the server.
(() => {
  const KDF='pbkdf2-sha256-250000',ITERATIONS=250000;
  const keyCache=new Map();
  const enc=new TextEncoder(),dec=new TextDecoder();
  const toB64=b=>{let s='';for(const x of b)s+=String.fromCharCode(x);return btoa(s)};
  const fromB64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
  function invited(){return location.hostname==='defter.bilgearena.com'||window.__syncInvited===true}
  // A secret is the typed passphrase or the non-extractable PBKDF2 key remembered for it (v81).
  const secretIds=new WeakMap();let secretSeq=0;
  const secretId=pass=>typeof pass==='string'?'p:'+pass:'k:'+(secretIds.get(pass)??(secretIds.set(pass,++secretSeq),secretSeq));
  async function deriveKey(pass,salt){const km=typeof pass==='string'?await crypto.subtle.importKey('raw',enc.encode(pass),'PBKDF2',false,['deriveKey']):pass;return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:ITERATIONS,hash:'SHA-256'},km,{name:'AES-GCM',length:256},false,['encrypt','decrypt'])}
  async function keyFor(pass,salt){const cacheKey=secretId(pass)+'|'+toB64(salt);if(keyCache.has(cacheKey))return keyCache.get(cacheKey);const key=await deriveKey(pass,salt);if(keyCache.size>8)keyCache.delete(keyCache.keys().next().value);keyCache.set(cacheKey,key);return key}
  const MAX_CIPHERTEXT_BYTES=5*1024*1024;
  function tooLarge(){const error=Error('Bu defter 5 MiB sunucu yedeği sınırını aşıyor. Notlar bu cihazda korunur; Dosya ve yedek bölümünden JSON yedeği alın.');error.code='backup-too-large';return error}
  // A notebook certainly too large for the server copy is not rebuilt, hashed and encoded after every
  // edit (v69). Since v71 the record holds image keys, so the bound comes from the images (v72).
  const certainlyTooLarge=()=>typeof syncCertainlyTooLarge==='function'?syncCertainlyTooLarge(MAX_CIPHERTEXT_BYTES):typeof lastSaveBytes==='number'&&lastSaveBytes>3*MAX_CIPHERTEXT_BYTES;
  async function encryptPayload(pass,text){const plain=enc.encode(text);if(plain.byteLength+16>MAX_CIPHERTEXT_BYTES)throw tooLarge();const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));const key=await deriveKey(pass,salt);const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,plain);return {ciphertext:toB64(new Uint8Array(ct)),iv:toB64(iv),salt:toB64(salt),kdf:KDF}}
  async function decryptPayload(data,pass){if(data.kdf!==KDF)throw Error('kdf');const key=await keyFor(pass,fromB64(data.salt));const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:fromB64(data.iv)},key,fromB64(data.ciphertext));return dec.decode(plain)}
  // Remembered passphrase (v81). The passphrase itself is never stored: it is imported once as a
  // non-extractable PBKDF2 key, and that CryptoKey is kept per account in this browser profile's
  // IndexedDB. Scripts can derive backup keys from it but cannot read the passphrase or export the
  // key; the server never sees either. It is only as exposed as the notebook already stored on this
  // device. It is removed on logout, on "forget", when the current server copy no longer opens with
  // it (changed on another device), and after 180 days without use.
  const VAULT_DB='bilge-defter-device-trust',VAULT_STORE='passphrases',VAULT_IDLE_MS=180*24*60*60*1000;
  // Bound to a verified account: without one (private origin, local mode) nothing is remembered.
  const vaultId=()=>window.BilgeAccount?.required&&window.BilgeAccount.identity?.id||null;
  let rememberChoice=true,remembered=false,vaultCache=null;
  function idb(request){return new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}
  async function vault(mode,op){
    const open=indexedDB.open(VAULT_DB,1);open.onupgradeneeded=()=>open.result.createObjectStore(VAULT_STORE);
    const handle=await idb(open);
    try{const tx=handle.transaction(VAULT_STORE,mode),done=new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=tx.onabort=()=>reject(tx.error)});const result=await idb(op(tx.objectStore(VAULT_STORE)));await done;return result}
    finally{handle.close()}
  }
  // Returns the secret sync should keep using: the remembered key when it was stored, else the text.
  async function rememberPass(pass){
    const id=vaultId();if(!id)return pass;
    try{const material=await crypto.subtle.importKey('raw',enc.encode(pass),'PBKDF2',false,['deriveKey']),at=Date.now();
      await vault('readwrite',store=>store.put({material,savedAt:at,usedAt:at},id));vaultCache={id,material};remembered=true;renderSyncUi();return material}
    catch(error){remembered=false;console.error(error);renderSyncUi();return pass}
  }
  async function forgetPass(id=vaultId()){remembered=false;vaultCache=null;if(id)try{await vault('readwrite',store=>store.delete(id))}catch{}renderSyncUi()}
  async function recallPass(){
    const id=vaultId();if(!id)return null;
    if(vaultCache?.id===id)return vaultCache.material;
    let record;try{record=await vault('readonly',store=>store.get(id))}catch{return null}
    if(!record)return null;
    if(!(record.material instanceof CryptoKey)||record.material.algorithm?.name!=='PBKDF2'||!(Date.now()-record.usedAt<VAULT_IDLE_MS)){await forgetPass(id);return null}
    if(Date.now()-record.usedAt>24*60*60*1000)void vault('readwrite',store=>store.put({...record,usedAt:Date.now()},id)).catch(()=>{});
    vaultCache={id,material:record.material};remembered=true;return record.material;
  }
  // The remembered secret when there is one, otherwise the dialog. saved tells the caller that a
  // failure to open the server copy means the passphrase changed elsewhere, not a typing mistake.
  async function passFor(forPurpose){const saved=await recallPass();if(saved)return {pass:saved,saved:true};return {pass:await askPassphrase(forPurpose),saved:false}}
  async function keepTyped(entry){
    if(entry.saved||!rememberChoice)return entry.pass;
    const secret=await rememberPass(entry.pass);if(syncPass===entry.pass)syncPass=secret;return secret;
  }
  window.BilgeAccount?.onLogout?.(()=>forgetPass());
  const passDialog=document.createElement('dialog');passDialog.id='syncPassDialog';passDialog.className='tools-dialog';passDialog.setAttribute('aria-labelledby','syncPassTitle');
  passDialog.innerHTML='<div class="tools-heading"><h2 id="syncPassTitle">Parola</h2><button class="btn" id="syncPassClose" type="button">× Kapat</button></div><form id="syncPassForm" class="tools-content"><p class="recovery-note">Bu parolayla yedek uçtan uca şifrelenir; sunucu yalnız şifreli yığını saklar. Parola sunucuya gönderilmez; kaybolursa sunucudaki yedek açılamaz. Diğer cihazlarda aynı parolayı girmelisiniz.</p><label>Parola (en az 8 karakter)<input id="syncPassInput" type="password" minlength="8" autocomplete="new-password" required></label><label id="syncPassConfirmLabel" hidden>Parolayı tekrar girin<input id="syncPassConfirm" type="password" minlength="8" autocomplete="new-password"></label><label class="sync-remember"><input id="syncPassRemember" type="checkbox" checked> Bu cihazda hatırla (bir daha sorulmaz; çıkış yapınca silinir)</label><p id="syncPassError" role="status"></p><div class="tool-actions"><button class="btn primary" id="syncPassSubmit" type="submit">Devam et</button><button class="btn" id="syncPassCancel" type="button">Vazgeç</button></div></form>';
  document.body.append(passDialog);
  let passResolve=null,passReject=null,purpose='';
  function askPassphrase(forPurpose){purpose=forPurpose;return new Promise((resolve,reject)=>{passResolve=resolve;passReject=reject;document.querySelector('#syncPassInput').value='';document.querySelector('#syncPassConfirm').value='';document.querySelector('#syncPassConfirmLabel').hidden=forPurpose!=='upload';document.querySelector('.sync-remember').hidden=!vaultId();document.querySelector('#syncPassError').textContent='';document.querySelector('#syncPassTitle').textContent={upload:'Yedeği şifrele',download:'Yedeği aç',sync:'Eşitlemeyi aç'}[forPurpose]||'Parola';passDialog.showModal();document.querySelector('#syncPassInput').focus({preventScroll:true})})}
  document.querySelector('#syncPassForm').onsubmit=e=>{e.preventDefault();const v=document.querySelector('#syncPassInput').value;if(v.length<8){document.querySelector('#syncPassError').textContent='Parola en az 8 karakter olmalı.';return}if(purpose==='upload'){const c=document.querySelector('#syncPassConfirm').value;if(c!==v){document.querySelector('#syncPassError').textContent='Parolalar eşleşmiyor. Kontrol edip tekrar yazın.';return}}rememberChoice=!!vaultId()&&document.querySelector('#syncPassRemember').checked;passDialog.close();passResolve(v)};
  const cancelPass=()=>{passDialog.close();passReject?.(Error('cancelled'))};
  document.querySelector('#syncPassCancel').onclick=cancelPass;document.querySelector('#syncPassClose').onclick=cancelPass;
  passDialog.addEventListener('cancel',event=>{event.preventDefault();cancelPass()});
  passDialog.addEventListener('close',()=>{document.querySelector('#syncPassInput').value='';document.querySelector('#syncPassConfirm').value=''});
  const syncButtons=document.createElement('div');syncButtons.className='backup-actions';
  syncButtons.innerHTML='<button class="btn" id="syncUpload">Sunucuya yedekle</button><button class="btn" id="syncDownload">Sunucudan yükle</button><button class="btn" id="syncPrevious">Önceki sunucu kopyası</button><p class="recovery-note" id="syncStatus" role="status"></p><p class="recovery-note" id="syncNote">Sunucu yedeği yalnız davetli adreste ve elle çalışır; içerik uçtan uca şifrelidir, sunucu açık metin görmez. Parolanızı güvenli bir yerde saklayın; JSON yedeğinin yerini tutmaz.</p>';
  document.querySelector('#reliabilityContent').prepend(syncButtons);
  const limitNote=document.createElement('p');limitNote.className='recovery-note';limitNote.id='syncLimitNote';limitNote.textContent='Sunucu yedeği sınırı: 5 MiB şifreli veri. Resim ve PDF içeren defterler bu sınırı aşabilir. Yerel kayıt ve indirdiğiniz JSON yedeği ayrı çalışır.';syncButtons.append(limitNote);
  function renderSyncActions(){
    const show=invited();document.querySelector('#syncUpload').hidden=!show;document.querySelector('#syncDownload').hidden=!show;document.querySelector('#syncPrevious').hidden=!show;
    limitNote.hidden=!show;
    document.querySelector('#syncNote').hidden=show;
    if(!show){document.querySelector('#syncStatus').textContent='Sunucu yedeği yalnız defter.bilgearena.com adresinde kullanılabilir.';return}
    document.querySelector('#syncStatus').textContent='';
  }
  function setSyncStatus(text){document.querySelector('#syncStatus').textContent=text}
  async function syncApi(path,options={}){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    const scope=DB,writing=!['GET','HEAD'].includes(String(options.method||'GET').toUpperCase());
    const quarantined=event=>{if(event.detail?.scope===scope)controller.abort()};
    try{
      if(writing){assertImportWritable(scope);addEventListener('bilge-import-quarantined',quarantined)}
      // Account.fetch awaits whoami before native fetch. Keep this signal tied
      // to the write quarantine throughout that await, not just before it.
      const res=await (window.BilgeAccount?.fetch||fetch)(path,{...options,cache:'no-store',signal:controller.signal});
      const type=res.headers.get('content-type')||'';
      if(res.redirected||type.includes('text/html'))throw Error('Giriş oturumunu yenileyin.');
      if(!res.ok&&res.status!==304){const error=Error(res.status===404?'Sunucuda yedek yok.':`Sunucu yanıtı ${res.status}.`);error.status=res.status;error.response=res;throw error}
      return res;
    }finally{clearTimeout(timer);if(writing)removeEventListener('bilge-import-quarantined',quarantined)}
  }
  const BACKUP='./api/v1/bilge-defter/backup';
  const protocolMessage='Sunucunun sürüm koruması doğrulanamadı. Otomatik eşitleme ve sunucuya gönderme kapalı; yerel notlar ve JSON yedekleme çalışır.';
  function hasCas(res){return res?.headers.get('X-Bilge-Sync-Protocol')==='cas-v1'}
  function strongTag(res){const tag=res?.headers.get('ETag');return tag&&/^"[^"\r\n]+"$/.test(tag)?tag:null}
  let remoteCache=null;
  async function readRemote(conditional=false){
    const cached=conditional?remoteCache:null;
    let response;try{response=await syncApi(BACKUP,{headers:cached?.tag?{'If-None-Match':cached.tag}:{}})}catch(error){if(error.status!==404)throw error;remoteCache=null;return {response:error.response,data:null,tag:null}}
    if(response.status===304){if(!cached||!hasCas(response)||strongTag(response)!==cached.tag)throw Error(protocolMessage);return {...cached,response}}
    const data=await response.json();if(!data||typeof data.ciphertext!=='string'||typeof data.salt!=='string'||typeof data.iv!=='string')throw Error('Sunucu yedeği geçersiz.');
    remoteCache={response,data,tag:strongTag(response)};return remoteCache;
  }
  function requireCas(remote){if(!hasCas(remote.response)||(remote.data&&!remote.tag))throw Error(protocolMessage)}
  async function postRemote(remote,payload){
    // Encryption may have begun before an uncertain import stopped local writes.
    // Recheck at the last dispatch boundary; already-sent requests cannot be recalled.
    assertImportWritable();
    requireCas(remote);
    const response=await syncApi(BACKUP,{method:'POST',headers:{'Content-Type':'application/json',...(remote.data?{'If-Match':remote.tag}:{'If-None-Match':'*'})},body:JSON.stringify(payload)});
    const tag=strongTag(response);if(!hasCas(response)||!tag)throw Error('Gönderim yanıtı doğrulanamadı; yerel değişiklikler eşitlendi sayılmadı.');remoteCache=null;return tag;
  }
  let operationBusy=false;
  async function exclusive(fn){if(operationBusy)return;operationBusy=true;try{return await fn()}finally{operationBusy=false}}
  document.querySelector('#syncUpload').onclick=async()=>{
    if(!invited()||!state||!validState(state))return;
    let entry;try{entry=await passFor('upload')}catch{return}
    setSyncStatus('Şifreleniyor…');
    try{
      const remote=await readRemote();requireCas(remote);
        const existing=remote.data;
        if(existing?.ciphertext){
          let opens=true;try{await decryptPayload(existing,entry.pass)}catch{opens=false}
          if(!opens&&entry.saved){
            // Changed on another device: the remembered one must not silently replace that copy.
            await forgetPass();setSyncStatus('Sunucudaki yedek bu cihazda kayıtlı parolayla açılmadı; parola başka bir cihazda değişmiş olabilir.');
            try{entry={pass:await askPassphrase('upload'),saved:false}}catch{setSyncStatus('Yedekleme iptal edildi.');return}
            setSyncStatus('Şifreleniyor…');try{await decryptPayload(existing,entry.pass);opens=true}catch{}
          }
          if(!opens&&!confirm('Sunucudaki mevcut yedek bu parolayla açılamadı. Parolayı değiştirmek istediğinizden emin misiniz? Yanlış parola girdiyseniz eski yedeğin üzerine yazılacaktır.')){
            setSyncStatus('Yedekleme iptal edildi.');
            return;
          }
        }
      const pass=entry.pass;
      if(!await flushSave())throw Error('Önce yerel kaydı tamamlayın.');
      const expected=notebookJSON(state),revision=editRevision,snapshot=notebookSnapshot();
      const payload=await encryptPayload(pass,JSON.stringify(snapshot));
      const tag=await postRemote(remote,{...payload,updated_at:snapshot.exportedAt,device_id:deviceId()});
      // The server copy is now under this passphrase; automatic sync must use the same one or every
      // later check would fail to open the copy we just wrote (the student confirmed a change above
      // when an older copy did not open with it). Record the copy, or the next idle check would see
      // an unknown server tag and raise a conflict against our own upload.
      const switched=syncEnabled&&pass!==syncPass;if(switched)syncPass=pass;
      let recorded=true;try{await acknowledge(expected,revision,tag,snapshot.exportedAt)}catch(error){recorded=false;console.error(error)}
      await keepTyped(entry);
      setSyncStatus(`Sunucuda şifreli yedek var · ${new Date(snapshot.exportedAt).toLocaleString('tr-TR')}. Sunucu bunun bir önceki kopyasını da saklar.${switched?' Otomatik eşitleme de artık bu parolayı kullanıyor.':''}${recorded?'':' Eşitleme kaydı güncellenemedi; bir sonraki denetimde çakışma uyarısı görülebilir.'}`);
    }catch(error){setSyncStatus(error.message==='cancelled'?'':`Yedek alınamadı. ${error.message} Notlar değişmedi.`)}
  };
  document.querySelector('#syncDownload').onclick=async()=>{
    if(!invited())return;
    let entry;try{entry=await passFor('download')}catch{return}
    setSyncStatus('Sunucudan getiriliyor…');
    try{
      const data=await (await syncApi('./api/v1/bilge-defter/backup')).json();
      let text;try{text=await decryptPayload(data,entry.pass)}catch{
        if(!entry.saved){setSyncStatus('Parola yanlış veya yedek okunamadı. Mevcut defter değişmedi.');return}
        await forgetPass();setSyncStatus('Sunucudaki yedek bu cihazda kayıtlı parolayla açılmadı; parola başka bir cihazda değişmiş olabilir.');
        try{entry={pass:await askPassphrase('download'),saved:false}}catch{setSyncStatus('');return}
        try{text=await decryptPayload(data,entry.pass)}catch{setSyncStatus('Parola yanlış veya yedek okunamadı. Mevcut defter değişmedi.');return}
      }
      await keepTyped(entry);
      let info;try{info=parseBackup(JSON.parse(text))}catch(error){setSyncStatus(error.message);return}
      await validatePdfImages(info.book);await validateMediaImages(info.book);
      setSyncStatus('');
      previewBackup(info,`Sunucu yedeği (${data.updated_at||'tarih yok'})`);
    }catch(error){setSyncStatus(`Yedek alınamadı. ${error.message} Mevcut defter değişmedi.`)}
  };
  // The server keeps the copy the latest upload replaced (one generation). Opening it goes
  // through the same preview as any backup; nothing changes until the student confirms.
  document.querySelector('#syncPrevious').onclick=async()=>{
    if(!invited())return;
    let entry;try{entry=await passFor('download')}catch{return}
    setSyncStatus('Önceki sunucu kopyası getiriliyor…');
    try{
      let data;try{data=await (await syncApi(BACKUP+'/previous')).json()}catch(error){if(error.status===404){setSyncStatus('Sunucuda önceki kopya yok. Önceki kopya, sunucudaki yedek ilk kez değiştirildiğinde oluşur. Mevcut defter değişmedi.');return}throw error}
      // The previous copy may predate a passphrase change, so a remembered one failing here is
      // not evidence that it is stale: ask once without forgetting it.
      let text;try{text=await decryptPayload(data,entry.pass)}catch{
        if(!entry.saved){setSyncStatus('Parola yanlış veya önceki kopya okunamadı. Önceki kopya, o zamanki parolayla açılır. Mevcut defter değişmedi.');return}
        let older;try{older=await askPassphrase('download')}catch{setSyncStatus('');return}
        try{text=await decryptPayload(data,older)}catch{setSyncStatus('Parola yanlış veya önceki kopya okunamadı. Önceki kopya, o zamanki parolayla açılır. Mevcut defter değişmedi.');return}
      }
      let info;try{info=parseBackup(JSON.parse(text))}catch(error){setSyncStatus(error.message);return}
      await validatePdfImages(info.book);await validateMediaImages(info.book);
      setSyncStatus('');
      previewBackup(info,`Önceki sunucu kopyası (${data.updated_at||'tarih yok'}; yerine yenisi ${data.replaced_at||'?'} tarihinde yazıldı)`);
    }catch(error){setSyncStatus(`Önceki kopya alınamadı. ${error.message} Mevcut defter değişmedi.`)}
  };
  window.renderSyncActions=renderSyncActions;
  // Conditional polls with bounded backoff; drawing/hidden windows never poll.
  const deviceKey=()=> 'bilge-defter-device-id'+(window.BilgeAccount?.identity?.id?'-'+window.BilgeAccount.identity.id:'');
  let syncPass=null,syncEnabled=false,localDirty=true,lastSyncAt=null,conflictHold=0,conflictPayload=null,receipt=null;
  const hashText=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(text))),n=>n.toString(16).padStart(2,'0')).join('');
  // Plain JSON.stringify text: receipts, acknowledgements and uploads compare and hash exactly this.
  // The local save text escapes wide characters (v69) and is not used here. Sync carries at most
  // 5 MiB, so building it in full is cheap.
  const notebookJSON=o=>JSON.stringify(o);
  let hashMemo=null;
  async function refreshReceipt(){
    receipt=await dbGet('sync-state-v2');
    localDirty=!receipt||receipt.dirty!==false||isDirty();
    if(!localDirty){const revision=editRevision,book=state;if(!hashMemo||hashMemo.revision!==revision||hashMemo.book!==book)hashMemo={revision,book,hash:await hashText(notebookJSON(book))};localDirty=receipt.ackHash!==hashMemo.hash||editRevision!==revision}
    lastSyncAt=receipt?.lastSyncAt||null;
  }
  const when=t=>{const d=new Date(t||'');return Number.isNaN(d.getTime())?'tarih yok':d.toLocaleString('tr-TR')};
  // A notebook nobody has written in on this device (one empty page, no notebooks, trash or
  // planner) that was never acknowledged by a sync: the server copy is applied instead of asking
  // the student to choose, because "send local" would replace the only server copy with an
  // empty notebook. Every save writes a receipt row with dirty:true, so "never synced" means no
  // tag and no acknowledged hash, not the absence of the row.
  function pristineLocal(){
    const book=state;if(receipt?.tag||receipt?.ackHash||!book||!Array.isArray(book.pages)||book.pages.length!==1)return false;
    const only=book.pages[0];
    return Array.isArray(only?.strokes)&&only.strokes.length===0&&only.pdf===undefined&&!(book.notebooks?.length)&&!(book.trash?.length)&&book.planner===undefined;
  }
  async function acknowledge(expected,revision,tag,at){
    const next={ackHash:await hashText(expected),tag,lastSyncAt:at};
    const dirty=await dbAcknowledgeSync(expected,next);
    receipt=next;localDirty=dirty||editRevision!==revision||notebookJSON(state)!==expected;
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
  window.markSyncDirty=()=>{nextPollAt=Math.min(nextPollAt,Date.now()+5000);if(localDirty)return;localDirty=true;renderSyncUi()};
  const conflictBanner=document.createElement('div');conflictBanner.id='syncConflictBanner';conflictBanner.hidden=true;conflictBanner.setAttribute('role','alert');
  conflictBanner.innerHTML='<strong>Eşitleme çakışması</strong><p>Bu cihazda eşitlenmemiş değişiklikler var ve sunucuda da farklı bir kopya duruyor. Hangisini kullanacağınızı seçin; diğer kopyanın üzerine yazılır.</p><p id="syncConflictDetail"></p><div class="recovery-actions"><button class="btn primary" id="syncConflictServer">Sunucudakini yükle</button><button class="btn" id="syncConflictLocal">Yereldekini gönder</button><button class="btn" id="syncConflictHold">Şimdilik bırak</button></div>';
  document.body.append(conflictBanner);
  const syncStyle=document.createElement('style');syncStyle.textContent='#syncConflictBanner{position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:45;width:min(560px,calc(100% - 24px));padding:14px;border:1px solid #d69974;border-radius:12px;background:#fff5df;box-shadow:0 8px 32px #173b3640;color:#502e18}#syncConflictBanner[hidden]{display:none}#syncConflictBanner p{margin:0 0 10px;font-size:13px;line-height:1.4}.sync-remember{display:flex;gap:8px;align-items:center}.sync-remember[hidden]{display:none}.sync-remember input{width:auto;min-height:0;margin:0;flex:none}';document.head.append(syncStyle);
  const syncArea=document.createElement('div');syncArea.className='tool-actions';
  syncArea.innerHTML='<button class="btn" id="syncUnlock" hidden>Eşitlemeyi aç</button><button class="btn" id="syncForget" hidden>Bu cihazdaki kayıtlı parolayı sil</button><p class="recovery-note" id="syncAutoStatus" role="status"></p><p class="recovery-note" id="syncAutoNote">Otomatik eşitleme yalnız davetli adreste ve oturum kilidi açılınca çalışır. Yedekler uçtan uca şifrelidir; sunucu son kopyayı ve ondan bir önceki kopyayı tutar. İki cihaz aynı anda düzenlerse çakışmada siz seçersiniz.</p>';
  syncButtons.after(syncArea);
  let autoState='idle',autoRetryAt=0,staleNotice=false;
  const staleMessage='Sunucudaki yedek bu cihazda kayıtlı parolayla açılmadı; parola başka bir cihazda değişmiş olabilir. Eşitlemeyi açmak için parolayı yeniden girin.';
  function renderSyncUi(){
    const invitedNow=invited();
    document.querySelector('#syncUnlock').hidden=!invitedNow||syncEnabled;
    document.querySelector('#syncForget').hidden=!invitedNow||!remembered;
    document.querySelector('#syncAutoNote').hidden=invitedNow;
    if(!invitedNow){document.querySelector('#syncAutoStatus').textContent='Otomatik eşitleme yalnız defter.bilgearena.com adresinde.';return}
    document.querySelector('#syncAutoStatus').textContent=syncEnabled?(lastSyncAt?`Eşitleme açık · son: ${new Date(lastSyncAt).toLocaleString('tr-TR')}${localDirty?' · değişiklikler var':''}`:'Eşitleme açık · henüz eşitlenmedi'):staleNotice?staleMessage:autoState==='waiting'?'Eşitleme bağlantı gelince bu cihazda kayıtlı parolayla açılacak; notlar yerelde korunuyor.':'Eşitleme kapalı; açmak için parolayı girin.';
  }
  async function enableSync(pass,remote,auto){
    await refreshReceipt();syncPass=pass;syncEnabled=true;staleNotice=false;renderSyncUi();
    if(remote.data&&pristineLocal()){nextPollAt=0;document.querySelector('#syncAutoStatus').textContent=`Sunucudaki yedek (${when(remote.data.updated_at)}) bu cihaza açılacak${auto?'.':'; bu pencereyi kapatın.'}`}
    void retirePush();
  }
  document.querySelector('#syncUnlock').onclick=async()=>{
    if(!invited())return;
    let entry;try{entry=await passFor('sync')}catch{return}
    try{
      const remote=await readRemote();requireCas(remote);
      if(remote.data)try{await decryptPayload(remote.data,entry.pass)}catch{
        if(!entry.saved){document.querySelector('#syncAutoStatus').textContent='Parola yanlış; sunucudaki yedek bu parolayla açılamıyor.';return}
        staleNotice=true;await forgetPass();
        try{entry={pass:await askPassphrase('sync'),saved:false}}catch{return}
        try{await decryptPayload(remote.data,entry.pass)}catch{document.querySelector('#syncAutoStatus').textContent='Parola yanlış; sunucudaki yedek bu parolayla açılamıyor.';return}
      }
      autoState='done';await enableSync(await keepTyped(entry),remote,false);
    }catch(error){document.querySelector('#syncAutoStatus').textContent=`Eşitleme açılamadı. ${error.message}`}
  };
  // Opening the app with a remembered passphrase turns sync on without a dialog. Network trouble
  // retries later; a server copy that no longer opens with it removes it and waits for the student.
  // It changes no notebook data, so it does not take the operation lock: a backup or restore
  // pressed while it reads the server stays responsive.
  let autoRunning=false;
  async function autoUnlock(){
    if(autoRunning||syncEnabled||!invited()||autoState==='done'||Date.now()<autoRetryAt||window.BilgeAccount?.locked)return;
    autoRunning=true;try{
    const pass=await recallPass();if(!pass){autoState='done';renderSyncUi();return}
    try{
      const remote=await readRemote();requireCas(remote);
      if(syncEnabled)return;
      if(remote.data)try{await decryptPayload(remote.data,pass)}catch{autoState='done';staleNotice=true;await forgetPass();return}
      autoState='done';await enableSync(pass,remote,true);
    }catch{autoState='waiting';autoRetryAt=Date.now()+30000;renderSyncUi()}
    }finally{autoRunning=false}
  }
  document.querySelector('#syncForget').onclick=async()=>{
    if(!confirm('Bu cihazda kayıtlı eşitleme parolası silinsin mi? Açık eşitleme bu oturumda sürer; uygulama yeniden açılınca parola sorulur.'))return;
    await forgetPass();document.querySelector('#syncAutoStatus').textContent='Kayıtlı parola bu cihazdan silindi. Notlar ve sunucudaki yedek değişmedi.';
  };
  const autoKick=setInterval(()=>{if(!ready)return;clearInterval(autoKick);void autoUnlock()},250);
  addEventListener('online',()=>{if(autoState==='waiting'){autoRetryAt=0;void autoUnlock()}});
  async function syncPush(remote){
    if(!syncEnabled||!invited()||!editorIdle()||!await flushSave())return;
    requireCas(remote);if(certainlyTooLarge())throw tooLarge();
    const expected=notebookJSON(state),revision=editRevision;
    const snapshot=notebookSnapshot();
    const payload=await encryptPayload(syncPass,notebookJSON(snapshot));
    const tag=await postRemote(remote,{...payload,updated_at:snapshot.exportedAt,device_id:deviceId()});
    await acknowledge(expected,revision,tag,snapshot.exportedAt);
  }
  // fresh: a never-written device taking the server copy; the empty notebook it replaces is not
  // worth a before-import copy, and restoring it would only invite pushing an empty notebook.
  async function syncApply(remote,fresh=false){
    if(!editorIdle())return;
    const revision=editRevision,data=remote.data;
    const text=await decryptPayload(data,syncPass);
    const info=parseBackup(JSON.parse(text));
    await validatePdfImages(info.book);await validateMediaImages(info.book);
    if(!editorIdle()||editRevision!==revision){showConflict(remote);return}
    const ok=await replaceNotebook(info.book,'Sunucudan eşitlendi',{preservePrevious:!fresh});
    if(ok)await acknowledge(JSON.stringify({...info.book,active:selectionFor(info.book).active}),revision+1,remote.tag,data.updated_at);
  }
  let pollDelay=5000,nextPollAt=0,oversizeRevision=null;
  function deferPoll(failed=false){pollDelay=Math.min(60000,failed?Math.max(10000,pollDelay*2):pollDelay*1.5);nextPollAt=Date.now()+pollDelay+Math.random()*1000}
  async function syncTick(){
    if(!syncEnabled||!invited()||!editorIdle()||operationBusy||conflictBanner.dataset.open==='1')return;
    if(document.visibilityState==='hidden')return;
    if(conflictHold>Date.now())return;
    if(oversizeRevision===editRevision)return;
    if(certainlyTooLarge()){const text=`Eşitleme bekliyor; notlar yerelde korundu. ${tooLarge().message}`,el=document.querySelector('#syncAutoStatus');if(el.textContent!==text)el.textContent=text;return}
    return exclusive(async()=>{try{
      const remote=await readRemote(true);requireCas(remote);await refreshReceipt();
      if(!editorIdle())return;
      const changed=!!remote.data&&remote.tag!==receipt?.tag;
      if(changed){const fresh=localDirty&&pristineLocal();if(localDirty&&!fresh){showConflict(remote);return}await syncApply(remote,fresh);pollDelay=5000;deferPoll();return}
      if(localDirty){await syncPush(remote);pollDelay=5000}
      renderSyncUi();
      deferPoll();
    }catch(error){if(error.code==='backup-too-large')oversizeRevision=editRevision;deferPoll(true);document.querySelector('#syncAutoStatus').textContent=`Eşitleme bekliyor; notlar yerelde korundu. ${error.message}`}});
  }
  function showConflict(data){
    if(conflictBanner.dataset.open==='1')return;conflictPayload=data;conflictBanner.hidden=false;conflictBanner.dataset.open='1';
    const localAt=(state?.pages||[]).reduce((m,p)=>typeof p.updated==='string'&&p.updated>m?p.updated:m,'');
    document.querySelector('#syncConflictDetail').textContent=`Sunucudaki kopya: ${when(data.data?.updated_at)} · Bu cihazdaki son değişiklik: ${localAt?when(localAt):'bilinmiyor'}.`;
    document.querySelector('#syncConflictServer').onclick=()=>exclusive(async()=>{if(!editorIdle())return;conflictBanner.hidden=true;conflictBanner.dataset.open='';try{await syncApply(conflictPayload)}catch(error){document.querySelector('#syncAutoStatus').textContent=`Çakışma çözülemedi. ${error.message}`}});
    document.querySelector('#syncConflictLocal').onclick=()=>exclusive(async()=>{if(!editorIdle())return;if(!confirm(`Sunucudaki kopya (${when(conflictPayload?.data?.updated_at)}) bu cihazdaki defterle değiştirilecek ve geri alınamaz. Devam edilsin mi?`))return;conflictBanner.hidden=true;conflictBanner.dataset.open='';try{await syncPush(conflictPayload)}catch(error){document.querySelector('#syncAutoStatus').textContent=`Yerel gönderilemedi. ${error.message}`}});
    document.querySelector('#syncConflictHold').onclick=()=>{conflictBanner.hidden=true;conflictBanner.dataset.open='';conflictHold=Date.now()+30*60*1000;renderSyncUi()};
  }
  window.renderSyncActions=()=>{renderSyncActions();renderSyncUi()};
  for(const id of ['syncUpload','syncDownload','syncPrevious','syncUnlock','syncForget']){const button=document.querySelector('#'+id),action=button.onclick;button.onclick=()=>exclusive(action)}
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&syncEnabled&&ready)void syncTick()});
  addEventListener('bilge-account-locked',()=>{autoState='done';vaultCache=null;syncEnabled=false;syncPass=null;keyCache.clear();remoteCache=null;hashMemo=null;conflictPayload=null;conflictBanner.hidden=true;conflictBanner.dataset.open='';passReject?.(Error('cancelled'));renderSyncUi()});
  setInterval(()=>{if(autoState!=='done'&&!syncEnabled&&ready)void autoUnlock();else if(Date.now()>=nextPollAt)void syncTick()},5000);
})();
