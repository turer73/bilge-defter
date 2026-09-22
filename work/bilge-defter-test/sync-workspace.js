// Manual server backup, end-to-end encrypted. The server stores ciphertext only;
// the passphrase never leaves the device and the plaintext never reaches the server.
(() => {
  const KDF='pbkdf2-sha256-250000',ITERATIONS=250000;
  let cachedKey=null,cachedPass=null;
  const enc=new TextEncoder(),dec=new TextDecoder();
  const toB64=b=>{let s='';for(const x of b)s+=String.fromCharCode(x);return btoa(s)};
  const fromB64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
  function invited(){return location.hostname==='defter.bilgearena.com'||window.__syncInvited===true}
  async function deriveKey(pass,salt){const km=await crypto.subtle.importKey('raw',enc.encode(pass),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:ITERATIONS,hash:'SHA-256'},km,{name:'AES-GCM',length:256},false,['encrypt','decrypt'])}
  async function keyFor(pass,salt){if(cachedPass===pass&&cachedKey)return cachedKey;const key=await deriveKey(pass,salt);cachedPass=pass;cachedKey=key;return key}
  async function encryptPayload(pass,text){const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));const key=await deriveKey(pass,salt);const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,enc.encode(text));return {ciphertext:toB64(new Uint8Array(ct)),iv:toB64(iv),salt:toB64(salt),kdf:KDF}}
  async function decryptPayload(data,pass){if(data.kdf!==KDF)throw Error('kdf');const key=await keyFor(pass,fromB64(data.salt));const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:fromB64(data.iv)},key,fromB64(data.ciphertext));return dec.decode(plain)}
  const passDialog=document.createElement('dialog');passDialog.id='syncPassDialog';passDialog.className='tools-dialog';passDialog.setAttribute('aria-labelledby','syncPassTitle');
  passDialog.innerHTML='<div class="tools-heading"><h2 id="syncPassTitle">Parola</h2><button class="btn" id="syncPassClose" type="button">× Kapat</button></div><form id="syncPassForm" class="tools-content"><p class="recovery-note">Bu parolayla yedek uçtan uca şifrelenir; sunucu yalnız şifreli yığını saklar. Parola hiçbir yerde saklanmaz; kaybolursa sunucudaki yedek açılamaz. Yüklerken aynı parolayı girmelisiniz.</p><label>Parola (en az 8 karakter)<input id="syncPassInput" type="password" minlength="8" autocomplete="new-password" required></label><p id="syncPassError" role="status"></p><div class="tool-actions"><button class="btn primary" id="syncPassSubmit" type="submit">Devam et</button><button class="btn" id="syncPassCancel" type="button">Vazgeç</button></div></form>';
  document.body.append(passDialog);
  let passResolve=null,passReject=null,purpose='';
  function askPassphrase(forPurpose){purpose=forPurpose;return new Promise((resolve,reject)=>{passResolve=resolve;passReject=reject;document.querySelector('#syncPassInput').value='';document.querySelector('#syncPassError').textContent='';document.querySelector('#syncPassTitle').textContent=forPurpose==='upload'?'Yedeği şifrele':'Yedeği aç';passDialog.showModal();document.querySelector('#syncPassInput').focus({preventScroll:true})})}
  document.querySelector('#syncPassForm').onsubmit=e=>{e.preventDefault();const v=document.querySelector('#syncPassInput').value;if(v.length<8){document.querySelector('#syncPassError').textContent='Parola en az 8 karakter olmalı.';return}passDialog.close();passResolve(v)};
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
      const snapshot=notebookSnapshot();
      const payload=await encryptPayload(pass,JSON.stringify(snapshot));
      await syncApi('./api/v1/bilge-defter/backup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,updated_at:snapshot.exportedAt})});
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
})();
