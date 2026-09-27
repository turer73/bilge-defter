// Off-thread notebook save. Same record, same full-JSON compare-and-swap and the same
// JSON normalization as the page's original path; the page validates before posting.
// WebKit can drop an IndexedDB connection (app in the background, storage process evicted
// under memory pressure). The connection is reopened and the step retried once; the baseline
// stays in this worker, so the compare is as strict as before. Every failure is answered with
// its real name and nothing is thrown, so a storage problem never looks like a dead worker.
let db=null,name=null,store=null,stored=null,queue=Promise.resolve();
function open(){return new Promise((ok,no)=>{
  const r=indexedDB.open(name,1);r.onupgradeneeded=()=>r.result.createObjectStore(store);
  r.onsuccess=()=>{const c=r.result;c.onclose=()=>{if(db===c)db=null};c.onversionchange=()=>{c.close();if(db===c)db=null};db=c;ok()};r.onerror=()=>no(r.error);
})}
async function attempt(run){
  try{if(!db)await open();return await run()}
  catch(e){if(e?.name==='NotebookConflict')throw e;try{db?.close()}catch{}db=null;await open();return run()}
}
function write(data,payload){return new Promise((ok,no)=>{
  let conflict,tx;try{tx=db.transaction(store,'readwrite')}catch(e){no(e);return}
  const os=tx.objectStore(store),read=os.get('app');
  tx.oncomplete=()=>ok();tx.onabort=()=>no(conflict||tx.error||new Error('Kayıt işlemi iptal edildi'));tx.onerror=()=>{};
  read.onsuccess=()=>{try{
    const actual=read.result===undefined?null:JSON.stringify(read.result);
    // Already on disk: an earlier attempt committed but its answer was lost.
    if(actual===data.json){if(data.marker)os.put(data.marker,'app-writer');return}
    if(actual!==stored){conflict={name:'NotebookConflict',message:'Başka bir sekme kayıtlı defteri değiştirdi'};tx.abort();return}
    const meta=os.get('sync-state-v2');
    meta.onsuccess=()=>{try{if(data.preservePrevious&&read.result!==undefined)os.put(read.result,'before-import');os.put(payload,'app');os.put({...meta.result,dirty:true},'sync-state-v2');if(data.marker)os.put(data.marker,'app-writer')}catch(e){conflict=e;try{tx.abort()}catch{}}};
  }catch(e){conflict=e;try{tx.abort()}catch{}}};
})}
function readRecord(){return new Promise((ok,no)=>{
  let tx;try{tx=db.transaction(store,'readonly')}catch(e){no(e);return}
  const os=tx.objectStore(store),app=os.get('app'),marker=os.get('app-writer');
  tx.oncomplete=()=>ok({app:app.result,marker:marker.result});tx.onabort=()=>no(tx.error||new Error('Kayıt okunamadı'));tx.onerror=()=>{};
})}
async function handle(data){
  const reply=m=>self.postMessage({id:data.id,...m});
  try{
    if(data.type==='baseline'||data.type==='adopt'){
      name=data.db;store=data.store;await open();
      if(data.type==='baseline'){stored=data.json;reply({ok:true});return}
      // A new worker after the previous one stopped continues only from the notebook this page
      // last wrote or was writing (writer id, save number, text length). Anything else is a conflict.
      const {app,marker}=await attempt(readRecord),json=app===undefined?null:JSON.stringify(app),length=json===null?0:json.length;
      if(!data.accept.some(a=>a.writer===(marker?.writer??null)&&a.seq===(marker?.seq??null)&&a.length===length))throw {name:'NotebookConflict',message:'Kayıtlı defter bu sekmenin son kaydı değil'};
      stored=json;reply({ok:true});return;
    }
    if(!name||data.db!==name)throw {name:'NotebookConflict',message:'Kayıt bağlamı değişti; sayfayı yeniden açın.'};
    // The page sends one JSON text: a string copy is far cheaper than cloning the object graph in WebKit.
    const payload=JSON.parse(data.json);
    await attempt(()=>write(data,payload));stored=data.json;reply({ok:true});
  }catch(e){reply({ok:false,name:e?.name||'Error',message:e?.message||String(e)})}
}
// One message at a time, in order, even while a lost connection is being reopened.
self.onmessage=({data})=>{queue=queue.then(()=>handle(data))};
