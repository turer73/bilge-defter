// Off-thread notebook save. Same record, same full-JSON compare-and-swap and the same
// JSON normalization as the page's original path; the page validates before posting.
let db=null,name=null,store=null,stored=null;
self.onmessage=({data})=>{
  const reply=m=>self.postMessage({id:data.id,...m}),fail=e=>reply({ok:false,name:e?.name||'Error',message:e?.message||String(e)});
  if(data.type==='baseline'){
    const r=indexedDB.open(data.db,1);r.onupgradeneeded=()=>r.result.createObjectStore(data.store);
    r.onsuccess=()=>{db=r.result;name=data.db;store=data.store;stored=data.json;reply({ok:true})};r.onerror=()=>fail(r.error);return;
  }
  if(!db||data.db!==name){fail({name:'NotebookConflict',message:'Kayıt bağlamı değişti; sayfayı yeniden açın.'});return}
  // The page sends one JSON text: a string copy is far cheaper than cloning the object graph in WebKit.
  let next=data.json,payload;try{payload=JSON.parse(next)}catch(e){fail(e);return}
  let conflict;const tx=db.transaction(store,'readwrite'),os=tx.objectStore(store),read=os.get('app');
  tx.oncomplete=()=>{stored=next;reply({ok:true})};tx.onabort=()=>fail(conflict||tx.error||new Error('Kayıt işlemi iptal edildi'));tx.onerror=()=>{};
  read.onsuccess=()=>{
    const actual=read.result===undefined?null:JSON.stringify(read.result);
    if(actual!==stored){conflict={name:'NotebookConflict',message:'Başka bir sekme kayıtlı defteri değiştirdi'};tx.abort();return}
    const meta=os.get('sync-state-v2');
    meta.onsuccess=()=>{try{if(data.preservePrevious&&read.result!==undefined)os.put(read.result,'before-import');os.put(payload,'app');os.put({...meta.result,dirty:true},'sync-state-v2')}catch(e){conflict=e;try{tx.abort()}catch{}}};
  };
};
