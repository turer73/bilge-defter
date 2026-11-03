'use strict';
// v81 recognised device, against the real account API (synthetic Access cookie, loopback only).
// A device that verified once opens its own notebook when the next launch cannot verify (session
// expired or no network) while server work still requires live verification; a new device, an
// expired record, another account and logout all fail closed. The sync passphrase typed once is
// remembered per account under a non-extractable device key: sync turns on at launch and manual
// backup/restore no longer ask, a passphrase changed on another device is dropped and asked
// again, and logout removes it.
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),{spawn}=require('node:child_process');
const playwright=require('playwright'),engine=(process.argv.find(x=>x.startsWith('--engine='))||'').slice(9)||process.env.BILGE_ENGINE||'chromium';
const root=path.resolve(__dirname,'..'),ui=path.join(__dirname,'bilge-defter-test'),out=path.join(root,'outputs/device-trust',engine);
const results=[],errors=[];let server,browser;
const pass=name=>{results.push(name);console.log('PASS '+name)};
const PASS1='sentetik-parola-123',PASS2='baska-cihaz-parola-456';
fs.mkdirSync(out,{recursive:true});
const python=process.env.BILGE_PYTHON||path.join(root,process.platform==='win32'?'server-candidate/v49/.venv/Scripts/python.exe':'server-candidate/v49/.venv/bin/python');
const ready=p=>p.waitForFunction(()=>typeof ready!=='undefined'&&ready&&window.__v2UI,null,{timeout:20000});
const vaultRecord=p=>p.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('bilge-defter-device-trust',1);r.onupgradeneeded=()=>r.result.createObjectStore('passphrases');r.onsuccess=()=>{const q=r.result.transaction('passphrases').objectStore('passphrases').get(BilgeAccount.identity.id);q.onsuccess=()=>{const v=q.result;r.result.close();resolve(v?{fields:Object.keys(v).sort(),extractable:v.material.extractable,usages:v.material.usages,algorithm:v.material.algorithm.name,serialized:JSON.stringify(v)}:null)}}}));
const trustRecord=p=>p.evaluate(()=>JSON.parse(localStorage.getItem('bilge-defter-trusted-device-v1')||'null'));
const syncStatus=p=>p.locator('#syncAutoStatus').textContent();
async function openSync(p){await p.evaluate(()=>{document.querySelector('#reliabilityDialog').showModal();renderSyncActions()})}
async function closeSync(p){await p.evaluate(()=>document.querySelector('#reliabilityDialog').close())}
async function countDialogs(p){await p.evaluate(()=>{window.__passDialogs=0;const d=document.querySelector('#syncPassDialog'),show=d.showModal.bind(d);d.showModal=()=>{window.__passDialogs++;show()}})}
(async()=>{try{
 const origin=await new Promise((resolve,reject)=>{server=spawn(python,[path.join(root,'server-candidate/v49/tests/browser_server.py')],{cwd:path.join(root,'server-candidate/v49'),env:{...process.env,BILGE_TEST_ROOT:ui},windowsHide:true,stdio:['ignore','pipe','pipe']});let text='';server.stdout.on('data',x=>{text+=x;const m=text.match(/TEST_ORIGIN=(http[^\s]+)/);if(m)resolve(m[1])});server.stderr.on('data',x=>process.stderr.write(x));server.on('error',reject);server.on('exit',code=>reject(Error('test server exit '+code)))});
 for(let i=0;i<50;i++){try{await fetch(origin+'/release.json');break}catch{await new Promise(r=>setTimeout(r,100))}}
 browser=await playwright[engine].launch({headless:true});
 async function context(user){const c=await browser.newContext({serviceWorkers:'block',viewport:{width:1280,height:900}});await c.addInitScript(()=>{window.__accountRequired=true;window.__syncInvited=true;if(location.protocol==='http:')localStorage.setItem('bilge_defter_onboarding_v1','true')});c.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));if(user)await c.request.post(origin+'/_test/login/'+user);return c}

 // --- Recognised device ---
 const device=await context('owner'),p=await device.newPage();await p.goto(origin);await ready(p);
 const id=await p.evaluate(()=>BilgeAccount.identity.id),trust=await trustRecord(p);
 assert.equal(trust.id,id);assert.equal(trust.email,'owner@example.com');assert.ok(Math.abs(Date.now()-trust.verifiedAt)<60000);
 assert.equal(await p.locator('#accountOfflineBanner').isVisible(),false);
 await p.evaluate(()=>{page().title='Tanınan cihaz notu';markChanged();return flushSave()});
 pass('A live approved verification records this device for the same account');

 await device.clearCookies();await p.reload();await ready(p);
 assert.equal(await p.evaluate(()=>page().title),'Tanınan cihaz notu');
 assert.equal(await p.evaluate(()=>BilgeAccount.offline),true);assert.equal(await p.evaluate(()=>DB),'bilge-defter-account-'+id);
 await p.locator('#accountOfflineBanner').waitFor({state:'visible'});assert.match(await p.locator('#accountOfflineText').textContent(),/girişi yenileyin/);
 assert.equal(await p.locator('#accountOfflineLogin').isVisible(),true);assert.equal(await p.locator('#accountGate').evaluate(d=>d.open),false);
 await p.screenshot({path:path.join(out,'oturum-dusmus-taninan-cihaz.png')});
 const blocked=await p.evaluate(async()=>{try{await BilgeAccount.fetch('./api/v1/bilge-defter/backup');return 'sent'}catch(error){return error.message}});
 assert.match(blocked,/doğrulaması gerekli/);
 await p.evaluate(()=>{page().title='Çevrimdışı düzenleme';markChanged();return flushSave()});
 pass('Expired session: the recognised device opens its own notebook, keeps saving, and server calls still wait for login');

 await device.request.post(origin+'/_test/login/owner');assert.equal(await p.evaluate(()=>BilgeAccount.check()),true);
 assert.equal(await p.evaluate(()=>BilgeAccount.offline),false);assert.equal(await p.locator('#accountOfflineBanner').isVisible(),false);
 assert.equal(await p.evaluate(async()=>(await BilgeAccount.fetch('./api/v1/bilge-defter/backup')).status),404);
 pass('Renewed login resumes server work in the same window without a reload');

 await device.route('**/api/v1/bilge-defter/whoami',r=>r.abort());await p.reload();await ready(p);
 assert.equal(await p.evaluate(()=>page().title),'Çevrimdışı düzenleme');await p.locator('#accountOfflineBanner').waitFor({state:'visible'});
 assert.match(await p.locator('#accountOfflineText').textContent(),/İnternete ulaşılamıyor/);assert.equal(await p.locator('#accountOfflineLogin').isVisible(),false);
 await device.unroute('**/api/v1/bilge-defter/whoami');
 pass('No network: the recognised device opens offline with a connection notice instead of a login prompt');

 await p.evaluate(()=>{const t=JSON.parse(localStorage.getItem('bilge-defter-trusted-device-v1'));t.verifiedAt=Date.now()-31*24*60*60*1000;localStorage.setItem('bilge-defter-trusted-device-v1',JSON.stringify(t))});
 await device.clearCookies();await p.reload();await p.locator('#accountGate[open]').waitFor();assert.equal(await p.evaluate(()=>ready),false);
 pass('A record older than 30 days no longer opens the notebook without verification');

 const fresh=await context(null),f=await fresh.newPage();await f.goto(origin);await f.locator('#accountGate[open]').waitFor();
 assert.equal(await f.evaluate(()=>ready),false);assert.equal(await trustRecord(f),null);await fresh.close();
 pass('A device that never verified still fails closed');

 await device.request.post(origin+'/_test/login/owner');await p.reload();await ready(p);
 await device.request.post(origin+'/_test/login/second');assert.equal(await p.evaluate(()=>BilgeAccount.check()),false);
 assert.equal(await p.evaluate(()=>BilgeAccount.locked),true);assert.equal(await trustRecord(p),null);
 await device.clearCookies();await p.reload();await p.locator('#accountGate[open]').waitFor();assert.equal(await p.evaluate(()=>ready),false);
 pass('Another account on the live session drops the recognition; the old account cannot reopen offline');

 // --- Remembered sync passphrase ---
 await device.request.post(origin+'/_test/login/owner');await p.reload();await ready(p);
 await openSync(p);assert.equal(await p.locator('#syncForget').isVisible(),false);
 await p.locator('#syncUpload').click();await p.locator('#syncPassDialog[open]').waitFor();
 assert.equal(await p.locator('#syncPassRemember').isChecked(),true);assert.equal(await p.locator('.sync-remember').isVisible(),true);
 await p.screenshot({path:path.join(out,'parola-hatirla.png')});
 await p.locator('#syncPassInput').fill(PASS1);await p.locator('#syncPassConfirm').fill(PASS1);await p.locator('#syncPassSubmit').click();
 await p.waitForFunction(()=>document.querySelector('#syncStatus').textContent.startsWith('Sunucuda şifreli yedek var'));
 const record=await vaultRecord(p);
 assert.deepEqual({fields:record.fields,extractable:record.extractable,algorithm:record.algorithm,usages:record.usages},{fields:['material','savedAt','usedAt'],extractable:false,algorithm:'PBKDF2',usages:['deriveKey']});assert.equal(record.serialized.includes(PASS1),false);
 await p.evaluate(async()=>{try{await crypto.subtle.exportKey('raw',(await new Promise(r=>{const o=indexedDB.open('bilge-defter-device-trust',1);o.onsuccess=()=>{const q=o.result.transaction('passphrases').objectStore('passphrases').get(BilgeAccount.identity.id);q.onsuccess=()=>{o.result.close();r(q.result)}}})).material);return 'exported'}catch(error){return error.name}}).then(name=>assert.ok(['InvalidAccessError','NotSupportedError'].includes(name),'export must be refused, got '+name));
 assert.equal(await p.locator('#syncForget').isVisible(),true);
 pass('The passphrase itself is never stored: only a non-extractable PBKDF2 key that cannot be exported');

 await closeSync(p);await p.reload();await ready(p);await countDialogs(p);
 await p.waitForFunction(()=>document.querySelector('#syncAutoStatus').textContent.includes('Eşitleme açık'),null,{timeout:20000});
 await openSync(p);await p.locator('#syncDownload').click();await p.locator('#backupDialog[open]').waitFor();
 assert.match(await p.locator('#backupFileName').textContent(),/Sunucu yedeği/);await p.locator('#backupCancel').click();
 await openSync(p);await p.evaluate(()=>{page().title='Parolasız yedek';markChanged();return flushSave()});
 await p.locator('#syncUpload').click();await p.waitForFunction(()=>document.querySelector('#syncStatus').textContent.startsWith('Sunucuda şifreli yedek var'));
 assert.equal(await p.evaluate(()=>window.__passDialogs),0);
 pass('After a reload sync turns on by itself; restore and backup no longer ask for the passphrase');

 // Another device changes the passphrase: the remembered one no longer opens the server copy.
 await closeSync(p);
 const other=await context('owner'),o=await other.newPage();await o.goto(origin);await ready(o);await openSync(o);
 o.on('dialog',d=>d.accept());await o.locator('#syncUpload').click();await o.locator('#syncPassDialog[open]').waitFor();
 await o.locator('#syncPassInput').fill(PASS2);await o.locator('#syncPassConfirm').fill(PASS2);await o.locator('#syncPassSubmit').click();
 await o.waitForFunction(()=>document.querySelector('#syncStatus').textContent.startsWith('Sunucuda şifreli yedek var'));await other.close();
 await p.reload();await ready(p);await openSync(p);
 await p.waitForFunction(()=>document.querySelector('#syncAutoStatus').textContent.includes('başka bir cihazda değişmiş'),null,{timeout:20000});
 assert.equal(await vaultRecord(p),null);assert.equal(await p.locator('#syncUnlock').isVisible(),true);assert.equal(await p.locator('#syncForget').isVisible(),false);
 await p.locator('#syncUnlock').click();await p.locator('#syncPassDialog[open]').waitFor();await p.locator('#syncPassInput').fill(PASS2);await p.locator('#syncPassSubmit').click();
 await p.waitForFunction(()=>document.querySelector('#syncAutoStatus').textContent.includes('Eşitleme açık'));assert.ok(await vaultRecord(p));
 pass('A passphrase changed on another device is dropped, asked once, and the new one is remembered');

 await p.evaluate(()=>{window.confirm=()=>true});await p.locator('#syncForget').click();
 await p.waitForFunction(()=>document.querySelector('#syncAutoStatus').textContent.includes('silindi'));assert.equal(await vaultRecord(p),null);
 await closeSync(p);await p.reload();await ready(p);await openSync(p);await p.waitForTimeout(1500);
 assert.match(await syncStatus(p),/Eşitleme kapalı/);await p.locator('#syncUnlock').click();await p.locator('#syncPassDialog[open]').waitFor();
 await p.locator('#syncPassInput').fill(PASS2);await p.locator('#syncPassSubmit').click();await p.waitForFunction(()=>document.querySelector('#syncAutoStatus').textContent.includes('Eşitleme açık'));
 pass('"Forget" removes the remembered passphrase; the next launch asks again');

 assert.deepEqual(await p.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('bilge-defter-device-trust',1);r.onsuccess=()=>{const q=r.result.transaction('passphrases').objectStore('passphrases').getAllKeys();q.onsuccess=()=>{r.result.close();resolve(q.result)}}})),[id]);
 pass('The remembered passphrase is stored under this account id only');

 await device.route('**/cdn-cgi/access/logout',r=>r.fulfill({contentType:'text/plain',body:'Synthetic logout landing'}));
 await closeSync(p);await Promise.all([p.waitForURL('**/cdn-cgi/access/logout'),p.evaluate(()=>{void BilgeAccount.logout()})]);
 const after=await device.newPage();await after.goto(origin+'/release.json');
 const left=await after.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('bilge-defter-device-trust',1);r.onupgradeneeded=()=>r.result.createObjectStore('passphrases');r.onsuccess=()=>{const q=r.result.transaction('passphrases').objectStore('passphrases').count();q.onsuccess=()=>{r.result.close();resolve({vault:q.result,trust:localStorage.getItem('bilge-defter-trusted-device-v1')})}}}));
 assert.deepEqual(left,{vault:0,trust:null});
 await device.clearCookies();await after.goto(origin);await after.locator('#accountGate[open]').waitFor();assert.equal(await after.evaluate(()=>ready),false);
 pass('Logout removes both the device recognition and the remembered passphrase');

 assert.deepEqual(errors,[]);
 const summary={passed:results.length,failed:0,realLocalApi:true,syntheticAccessCookie:true,physicalDevices:false,results};
 fs.writeFileSync(path.join(out,'device-trust-tests.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify({passed:results.length,failed:0}));
}catch(error){console.error(error);process.exitCode=1}finally{await browser?.close();server?.kill()}})();
