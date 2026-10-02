// Off-thread notebook save. Same record and the same JSON normalization as the page's original
// path; the page validates before posting.
// v69: the compare-and-swap token is the small 'app-writer' marker (writer id, save number, text
// length) that every writer stores in the same transaction as the notebook. While the marker on
// disk is the one this worker last wrote or adopted, nobody else has written, and the notebook is
// not read back. Reading and re-serializing the whole record on every save cost about three
// notebook copies in this process; with PDF pages that was hundreds of MB per pen stroke on iPad.
// Without a trusted marker (a notebook last written by v65 or older) the whole record is still
// compared, exactly as before, once; the first write then establishes the marker.
// WebKit can drop an IndexedDB connection (app in the background, storage process evicted
// under memory pressure). The connection is reopened and the step retried once. A full device or
// an uncloneable value is not retried. Every failure is answered with its real name and nothing is
// thrown, so a storage problem never looks like a dead worker.
let db=null,name=null,store=null,stored=null,expect=null,queue=Promise.resolve();
const FINAL=new Set(['NotebookConflict','QuotaExceededError','DataCloneError','DataError','ConstraintError','MissingAsset']);
// v71: image keys a save names; each must exist in the same transaction that writes the record.
const IMAGE_KEY=/"image":"asset:[0-9a-f]{64}"/g;
// The page sends save text with wide characters escaped (one-byte string); records read back are
// compared in that same form.
const latin1JSON=s=>typeof s==='string'&&/[^\x00-\xff]/.test(s)?s.replace(/[^\x00-\xff]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0')):s;
const same=(a,b)=>!!a&&!!b&&a.writer===b.writer&&a.seq===b.seq&&a.length===b.length;
function open(){return new Promise((ok,no)=>{
  const r=indexedDB.open(name,1);r.onupgradeneeded=()=>r.result.createObjectStore(store);
  r.onsuccess=()=>{const c=r.result;c.onclose=()=>{if(db===c)db=null};c.onversionchange=()=>{c.close();if(db===c)db=null};db=c;ok()};r.onerror=()=>no(r.error);
})}
async function attempt(run){
  try{if(!db)await open();return await run()}
  catch(e){if(FINAL.has(e?.name))throw e;try{db?.close()}catch{}db=null;await open();return run()}
}
function write(data,payload){return new Promise((ok,no)=>{
  let conflict,tx;try{tx=db.transaction(store,'readwrite')}catch(e){no(e);return}
  const os=tx.objectStore(store),fail=e=>{conflict=e;try{tx.abort()}catch{}};
  tx.oncomplete=()=>ok();tx.onabort=()=>no(conflict||tx.error||new Error('Kayıt işlemi iptal edildi'));tx.onerror=()=>{};
  const refs=[...new Set(data.json.match(IMAGE_KEY)||[])].map(k=>k.slice(9,-1));
  const commit=previous=>{let pending=refs.length;const missing=[];if(!pending)put(previous);else for(const r of refs){const c=os.count(r);c.onsuccess=()=>{if(!c.result)missing.push(r);if(!--pending){if(missing.length)fail({name:'MissingAsset',message:missing.join(',')});else put(previous)}}}};
  const put=previous=>{const meta=os.get('sync-state-v2');meta.onsuccess=()=>{try{if(data.preservePrevious&&previous!==undefined)os.put(previous,'before-import');os.put(payload,'app');os.put({...meta.result,dirty:true},'sync-state-v2');os.put(data.marker,'app-writer')}catch(e){fail(e)}}};
  const mark=os.get('app-writer');
  mark.onsuccess=()=>{try{
    const onDisk=mark.result;
    // Already on disk: an earlier attempt committed but its answer was lost.
    if(same(onDisk,data.marker))return;
    const ours=expect!==null&&same(onDisk,expect);
    // Only an import keeps the previous notebook, and only then is the large record read.
    if(ours&&!data.preservePrevious){commit();return}
    if(expect!==null&&!ours){fail({name:'NotebookConflict',message:'Başka bir sekme kayıtlı defteri değiştirdi'});return}
    const read=os.get('app');
    read.onsuccess=()=>{try{
      if(ours){commit(read.result);return}
      // No trusted marker yet: compare the whole stored notebook, as v68 did on every save.
      const actual=read.result===undefined?null:latin1JSON(JSON.stringify(read.result));
      if(actual!==stored){fail({name:'NotebookConflict',message:'Başka bir sekme kayıtlı defteri değiştirdi'});return}
      commit(read.result);
    }catch(e){fail(e)}};
  }catch(e){fail(e)}};
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
      if(data.type==='baseline'){if(data.marker){expect=data.marker;stored=null}else{expect=null;stored=data.json}reply({ok:true});return}
      // A new worker after the previous one stopped continues only from the notebook this page
      // last wrote or was writing (writer id, save number, text length). Anything else is a conflict.
      // This rare path still reads the whole record and checks its length too, as v66-v68 did, so a
      // write that did not move the marker is caught here.
      const {app,marker:onDisk}=await attempt(readRecord),plain=app===undefined?null:JSON.stringify(app),json=latin1JSON(plain);
      const lengths=[plain===null?0:plain.length,json===null?0:json.length];
      if(!data.accept.some(a=>a.writer===(onDisk?.writer??null)&&a.seq===(onDisk?.seq??null)&&lengths.includes(a.length)))throw {name:'NotebookConflict',message:'Kayıtlı defter bu sekmenin son kaydı değil'};
      if(onDisk?.writer){expect=onDisk;stored=null;reply({ok:true,found:onDisk});return}
      expect=null;stored=json;reply({ok:true});return;
    }
    if(!name||data.db!==name)throw {name:'NotebookConflict',message:'Kayıt bağlamı değişti; sayfayı yeniden açın.'};
    // The page sends one JSON text: a string copy is far cheaper than cloning the object graph in WebKit.
    const payload=JSON.parse(data.json);
    await attempt(()=>write(data,payload));expect=data.marker;stored=null;reply({ok:true});
  }catch(e){reply({ok:false,name:e?.name||'Error',message:e?.message||String(e)})}
}
// One message at a time, in order, even while a lost connection is being reopened.
self.onmessage=({data})=>{queue=queue.then(()=>handle(data))};
