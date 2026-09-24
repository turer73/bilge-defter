// Approval gate. Never open a notebook based on an unverified cached identity.
(() => {
  'use strict';
  const required=location.hostname==='defter.bilgearena.com'||window.__accountRequired===true;
  const nativeFetch=window.fetch.bind(window),base='./api/v1/bilge-defter/';
  let identity=null,locked=required,started=false,checking=null,resolveReady;
  const readyPromise=new Promise(resolve=>{resolveReady=resolve});
  const gate=document.createElement('dialog');gate.id='accountGate';gate.setAttribute('aria-labelledby','accountTitle');
  gate.innerHTML='<img class="account-brand" src="icons/brand-horizontal-v51.png" alt="Bilge Defter" width="2172" height="724"><h1 id="accountTitle">Defterine devam et</h1><p id="accountMessage" role="status" aria-live="polite">Hesabınız denetleniyor…</p><p id="accountEmail" hidden></p><div class="account-actions"><a class="btn primary" href="./auth-continue.html" id="accountLogin">E-posta ile giriş yap</a><button class="btn primary" id="accountRegister" hidden>Katılım başvurusu gönder</button><button class="btn" id="accountRetry">Yeniden denetle</button><button class="btn" id="accountGateLogout" hidden>Farklı hesapla giriş</button></div><p class="account-steps">E-postanıza gelen kodu girin. Doğrulama bitince defteriniz otomatik açılır.</p><p class="account-safe">Notlarınız bu cihazda korunur. Güncelleme veya giriş için tarayıcı verilerini silmeyin.</p><details class="account-help"><summary>Giriş ve notlar hakkında</summary><p>Uygulamayı yeniden açarken internetle hesap doğrulaması gerekir. Açık defter bağlantı kesilince yerelde kaydedilir. Öğrenci erişimi yönetici onayıyla açılır. Notlar hesaba göre ayrı tutulur; önceki notlarınız için aynı e-postayı kullanın. Ortak cihazlarda ayrı tarayıcı profili kullanın. Eski hesapsız notlar otomatik aktarılmaz veya silinmez.</p></details>';
  document.body.append(gate);gate.addEventListener('cancel',e=>e.preventDefault());
  const message=gate.querySelector('#accountMessage'),email=gate.querySelector('#accountEmail'),register=gate.querySelector('#accountRegister');
  function lock(text){
    locked=true;document.body.classList.add('account-locked');
    for(const d of document.querySelectorAll('dialog[open]'))if(d!==gate)d.close();
    document.querySelector('bilge-defter-ui')?.shadowRoot?.querySelector('dialog[open]')?.close();
    message.textContent=text;register.hidden=true;
    gate.querySelector('#accountLogin').hidden=false;gate.querySelector('#accountGateLogout').hidden=true;
    if(!gate.open)gate.showModal();
    dispatchEvent(new Event('bilge-account-locked'));
  }
  function valid(body){const a=body?.identity;return body?.account_protocol==='approval-v1'&&a?.type==='access'&&typeof a.email==='string'&&['unregistered','pending','approved','rejected','suspended'].includes(a.status)&&['admin','student'].includes(a.role)&&(a.status!=='approved'||/^[a-f0-9-]{36}$/.test(a.id))}
  async function json(path,options={}){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    try{
      const res=await nativeFetch(base+path,{...options,cache:'no-store',redirect:'manual',signal:options.signal||controller.signal});
      if(res.type==='opaqueredirect'||[401,403].includes(res.status)||(res.ok&&!(res.headers.get('content-type')||'').includes('application/json'))){const error=Error('Oturumunuzu yenilemek için e-posta ile giriş yapın.');error.status=401;throw error}
      if(!res.ok){const error=Error('Sunucuya şu anda ulaşılamıyor. Biraz sonra yeniden denetleyin.');error.status=res.status;throw error}
      return await res.json();
    }finally{clearTimeout(timer)}
  }
  function friendlyError(error){
    if(!navigator.onLine)return 'İnternet bağlantısı yok. Bağlandıktan sonra yeniden denetleyin; notlarınız korunuyor.';
    if(error.name==='AbortError'||error.name==='TimeoutError')return 'Bağlantı yanıt vermedi. Yeniden denetleyin veya e-posta ile giriş yapın.';
    if(error.status===401)return 'Oturumunuzu yenilemek için e-posta ile giriş yapın.';
    if(error.status)return 'Sunucuya şu anda ulaşılamıyor. Biraz sonra yeniden denetleyin.';
    return 'Giriş oturumu doğrulanamadı. İnternetiniz varsa e-posta ile yeniden giriş yapın.';
  }
  async function check(){
    if(!required)return true;
    if(checking)return checking;
    checking=(async()=>{
      try{
        const body=await json('whoami');if(!valid(body)){const error=Error('Hesap doğrulanamadı');error.status=body?.identity?.type==='device'?401:503;throw error}
        const next=body.identity;email.textContent=next.email;email.hidden=false;
        if(started&&(next.id!==identity.id||next.status!=='approved')){lock('Hesap veya erişim durumu değişti. Kayıtlı notlar korundu. Uygulamayı kapatıp yeniden açın.');return false}
        if(next.status!=='approved'){
          lock({unregistered:'E-postanız doğrulandı. Sınıfa katılmak için başvurun.',pending:'Başvurunuz alındı. Yönetici onayı bekleniyor.',rejected:'Başvurunuz onaylanmadı. Yöneticinizle görüşün.',suspended:'Erişiminiz askıya alındı. Yöneticinizle görüşün.'}[next.status]);
          gate.querySelector('#accountLogin').hidden=true;gate.querySelector('#accountGateLogout').hidden=false;
          register.hidden=next.status!=='unregistered'||body.registration_mode==='invitation';
          if(next.status==='unregistered'&&body.registration_mode==='invitation')message.textContent='Bu e-posta öğrenci listesinde yok. Yöneticinizin sizi eklemesi gerekiyor.';
          return false;
        }
        if(started&&locked)return false; // A locked account cannot resume stale in-memory work.
        identity=Object.freeze(next);locked=false;document.body.classList.remove('account-locked');gate.close();
        if(!started){started=true;resolveReady('bilge-defter-account-'+next.id)}
        return true;
      }catch(error){
        if(!started||[401,403].includes(error.status)){email.hidden=true;lock(friendlyError(error))}
        return false; // Existing offline work stays local; network operations do not continue.
      }finally{checking=null}
    })();return checking;
  }
  async function accountFetch(input,options={}){
    if(!required)return nativeFetch(input,options);
    if(locked||!await check()||locked)throw Error('Hesap doğrulaması gerekli; notlar yerelde korundu.');
    const headers=new Headers(options.headers);headers.set('X-Bilge-Account',identity.id);headers.set('X-Bilge-Request','1');
    const response=await nativeFetch(input,{...options,headers,cache:'no-store',redirect:'error'});
    if([401,403,409].includes(response.status))lock('Oturum veya hesap izni değişti. Notlar yerelde korundu; yeniden giriş yapın.');
    return response;
  }
  async function logout(){
    if(started&&!locked){
      if(typeof mediaPending!=='undefined'&&(mediaPending||mediaGesture||plannerDirty||drawing||importing)){alert('Önce açık düzenlemeyi bitirin.');return}
      if(typeof flushSave==='function'&&!await flushSave()){alert('Kayıt tamamlanamadı. Önce JSON yedeği alın.');return}
    }
    lock('Oturum kapatılıyor. Yerel notlar silinmedi.');
    try{localStorage.setItem('bilge-defter-account-logout',String(Date.now()))}catch{}
    // Do not send an already-expired session to Cloudflare's logout error page.
    try{const body=await json('whoami');location.assign(valid(body)?'/cdn-cgi/access/logout':'./auth-continue.html')}
    catch(error){if(error.status===401)location.assign('./auth-continue.html');else lock(friendlyError(error))}
  }
  register.onclick=async()=>{
    register.disabled=true;
    try{await json('registration',{method:'POST',headers:{'X-Bilge-Request':'1','Content-Type':'application/json'},body:'{}'});await check()}catch(error){message.textContent=friendlyError(error)}finally{register.disabled=false}
  };
  gate.querySelector('#accountRetry').onclick=()=>started&&locked?location.reload():void check();
  gate.querySelector('#accountGateLogout').onclick=logout;
  const manager=document.createElement('dialog');manager.id='accountManager';manager.className='tools-dialog';manager.setAttribute('aria-labelledby','accountManagerTitle');
  manager.innerHTML='<div class="tools-heading"><h2 id="accountManagerTitle">Hesabım ve sınıf</h2><button class="btn" id="accountClose">Kapat</button></div><div class="tools-content"><p id="accountSummary"></p><button class="btn" id="accountLogout">Çıkış yap</button><p>Yönetici yalnız başvuru ve erişim durumunu yönetir; bu ekranda öğrenci notları gösterilmez.</p><p id="accountAdminStatus" role="status"></p><div id="accountMembers"></div><button class="btn" id="accountMore" hidden>Sonraki başvurular</button></div>';
  document.body.append(manager);manager.querySelector('#accountClose').onclick=()=>manager.close();manager.querySelector('#accountLogout').onclick=logout;
  const addForm=document.createElement('form');addForm.id='accountAddForm';addForm.hidden=true;
  addForm.innerHTML='<label for="accountAddEmail">Öğrenci e-postası</label><input id="accountAddEmail" name="email" type="email" maxlength="254" autocomplete="off" required placeholder="ogrenci@ornek.com" style="display:block;box-sizing:border-box;width:100%;padding:12px;margin:8px 0;border:1px solid #9bb5ad;border-radius:8px;font:inherit"><button class="btn primary" id="accountAddSubmit" type="submit">Öğrenci ekle</button><p class="recovery-note">Öğrencileri tek tek ekleyebilirsiniz. Aynı adres ikinci yer tüketmez. Kaydetmek e-posta göndermez veya Cloudflare girişini açmaz; uygulama onayından sonra giriş izni ayrıca uygulanmalıdır.</p><button class="btn" id="accountExportList" type="button">Onaylı giriş listesini indir</button>';
  manager.querySelector('#accountAdminStatus').before(addForm);
  let nextOffset=0,adminBusy=false;
  addForm.onsubmit=async event=>{
    event.preventDefault();if(adminBusy)return;adminBusy=true;const button=addForm.querySelector('#accountAddSubmit'),status=manager.querySelector('#accountAdminStatus');button.disabled=true;
    try{const response=await accountFetch(base+'admin/students',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:addForm.elements.email.value})});const result=await response.json();if(!response.ok)throw Error(typeof result.detail==='string'?result.detail:'Öğrenci eklenemedi.');await list();status.textContent=(result.created?'Öğrenci listeye eklendi.':'Bu öğrenci zaten listede; ikinci kayıt açılmadı.')+' Cloudflare giriş izni henüz doğrulanmadı.';addForm.reset()}catch(error){status.textContent=error.message}finally{button.disabled=false;adminBusy=false}
  };
  addForm.querySelector('#accountExportList').onclick=async()=>{
    const status=manager.querySelector('#accountAdminStatus');
    try{const response=await accountFetch(base+'admin/allowlist');if(!response.ok)throw Error('Liste alınamadı.');const data=await response.json();const url=URL.createObjectURL(new Blob([data.emails.join('\n')+'\n'],{type:'text/plain;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download='bilge-defter-onayli-giris-listesi.txt';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status.textContent='Onaylı adres listesi indirildi. Cloudflare giriş izni veya kotası değiştirilmedi.'}catch(error){status.textContent=error.message}
  };
  async function list(offset=0){
    const status=manager.querySelector('#accountAdminStatus'),rows=manager.querySelector('#accountMembers');
    status.textContent='Başvurular getiriliyor…';
    try{
      const res=await accountFetch(base+'admin/members?offset='+offset);if(!res.ok)throw Error('Başvurular alınamadı.');const body=await res.json();rows.replaceChildren();
      for(const item of body.members){
        const row=document.createElement('section'),label=document.createElement('p');label.textContent=item.email+' · '+({pending:'Onay bekliyor',approved:'Aktif',rejected:'Reddedildi',suspended:'Askıya alındı'}[item.status]||item.status);row.append(label);
        if(item.id!==identity.id&&item.role!=='admin')for(const [value,title] of [['approved','Onayla'],['rejected','Reddet'],['suspended','Askıya al']]){
          if(value===item.status)continue;const button=document.createElement('button');button.className='btn';button.textContent=title;
          button.onclick=async()=>{
            if(adminBusy||!confirm(item.email+' için '+title+' işlemi uygulansın mı?'))return;
            adminBusy=true;button.disabled=true;
            try{const result=await accountFetch(base+'admin/members/'+encodeURIComponent(item.id),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:value})});if(!result.ok){const error=await result.json().catch(()=>null);throw Error(typeof error?.detail==='string'?error.detail:'İşlem uygulanamadı.')}await list(offset)}catch(e){status.textContent=e.message}finally{adminBusy=false;button.disabled=false}
          };row.append(button);
        }rows.append(row);
      }
      nextOffset=body.next_offset;manager.querySelector('#accountMore').hidden=nextOffset==null;
      manager.querySelector('#accountEdgeStatus').textContent=body.edge?.detail||'Giriş izinleri henüz doğrulanmadı.';
      status.textContent=body.capacity?`${body.capacity.listed_students} / ${body.capacity.student_limit} öğrenci listede · ${body.capacity.approved_students} aktif · 2 yönetici yeri ayrıldı. Cloudflare kotası ayrıca denetlenir.`:body.members.length+' hesap gösteriliyor.';
    }catch(error){status.textContent=error.message}
  }
  manager.querySelector('#accountMore').onclick=()=>list(nextOffset);
  const edgeStatus=document.createElement('p');edgeStatus.id='accountEdgeStatus';edgeStatus.setAttribute('role','status');
  const edgeButton=document.createElement('button');edgeButton.id='accountEdgeSync';edgeButton.className='btn';edgeButton.type='button';edgeButton.textContent='Giriş izinlerini denetle / uygula';
  addForm.querySelector('.recovery-note').textContent='Öğrencileri tek tek ekleyin, ardından Onayla düğmesini kullanın. Onayda giriş izni de uygulanır; sonucu aşağıdan kontrol edin. Ekleme e-posta göndermez. Öğrenci bağlantıdan kod isteyerek giriş yapar.';
  addForm.append(edgeStatus,edgeButton);
  edgeButton.onclick=async()=>{
    if(adminBusy)return;adminBusy=true;edgeButton.disabled=true;edgeStatus.textContent='Giriş izinleri denetleniyor…';
    try{const response=await accountFetch(base+'admin/access-sync',{method:'POST'});const result=await response.json();if(!response.ok)throw Error('Giriş izni işlemi tamamlanamadı.');await list();edgeStatus.textContent=result.detail}catch(error){edgeStatus.textContent=error.message}finally{adminBusy=false;edgeButton.disabled=false}
  };
  function open(){
    if(!required||locked){if(required)void check();return}
    document.querySelector('#pwaDialog')?.close();
    manager.querySelector('#accountSummary').textContent=identity.email+' · '+(identity.role==='admin'?'Yönetici':'Öğrenci');manager.showModal();
    addForm.hidden=identity.role!=='admin';
    if(identity.role==='admin')void list();else manager.querySelector('#accountAdminStatus').textContent='Hesabınız aktif. Notlarınız diğer öğrencilerle paylaşılmaz.';
  }
  window.BilgeAccount={required,get locked(){return locked},get identity(){return identity},ready:readyPromise,check,fetch:accountFetch,open,logout};
  addEventListener('storage',event=>{if(required&&event.key==='bilge-defter-account-logout')lock('Başka bir pencerede çıkış yapıldı. Notlar korundu.')});
  document.addEventListener('visibilitychange',()=>{if(required&&document.visibilityState==='visible')void check()});
  addEventListener('online',()=>{if(required)void check()});
  document.addEventListener('DOMContentLoaded',()=>{
    if(!required)return;const target=document.querySelector('#pwaAccount');if(target){const button=document.createElement('button');button.id='accountOpen';button.className='btn primary';button.textContent='Hesabım ve sınıf';button.onclick=open;target.after(button)}
  });
  if(required){lock('Hesabınız denetleniyor…');void check();setInterval(()=>{if(!document.hidden)void check()},30000)}else{locked=false;resolveReady('bilge-defter-test-v1')}
})();
