// Dictionary lookup: server-backed (invited origin) with the embedded TDK
// medical subset as offline fallback. Server can host additional dictionaries
// without any client change.
(() => {
  const dictDialog=document.createElement('dialog');dictDialog.id='dictDialog';dictDialog.className='tools-dialog';dictDialog.setAttribute('aria-labelledby','dictTitle');
  dictDialog.innerHTML='<div class="tools-heading"><h2 id="dictTitle">Sözlük</h2><button class="btn" id="dictClose">× Kapat</button></div><div class="tools-content"><p class="recovery-note">TDK Güncel Türkçe Sözlük (12. baskı) tam verisi sunucudan aranır; çevrim dışıyken cihazdaki tıp ağırlıklı alt küme kullanılır. Tanı veya tedavi önerisi DEĞİLDİR. El yazısı otomatik okunmaz.</p><div class="tool-row"><label for="dictSelect">Sözlük</label><select id="dictSelect" aria-label="Sözlük seçimi"></select></div><input id="dictQuery" type="text" placeholder="Örn. astım, ülser" autocomplete="off" maxlength="120" aria-label="Aranacak terim"><p id="dictCount" class="recovery-note" role="status"></p><div id="dictResults"></div><button class="btn" id="dictWeb" type="button">Web’de ara</button></div>';
  document.body.append(dictDialog);
  const dictNote=dictDialog.querySelector('.recovery-note');
  const localNote='Cihazdaki tıp ağırlıklı TDK alt kümesi kullanılıyor; tam sözlük hizmeti doğrulanmadı. Tanı veya tedavi önerisi DEĞİLDİR. El yazısı otomatik okunmaz.';
  dictNote.textContent=localNote;
  const dictStyle=document.createElement('style');dictStyle.textContent='#dictDialog{width:min(460px,calc(100% - 24px));max-height:calc(100dvh - 24px);overflow:auto;padding:0;border:1px solid #d5e2dc;border-radius:18px;background:#fffdf8;color:#17312d}#dictDialog::backdrop{background:#173b3650}#dictQuery{box-sizing:border-box;width:100%;padding:12px;border:1px solid #b6ccc4;border-radius:8px;font-size:16px;background:white;color:#17312d;margin-bottom:4px}#dictSelect{min-width:0;width:100%;min-height:40px;font-size:14px;padding:6px;border:1px solid #b6ccc4;border-radius:8px;background:white;color:#17312d}#dictResults{display:grid;gap:10px;max-height:50vh;overflow:auto;margin:6px 0}#dictResults .dict-entry{padding:10px 12px;border:1px solid #d5e2dc;border-radius:10px;background:#f4f8f5}#dictResults .dict-entry strong{display:block;margin-bottom:3px;font-size:15px}#dictResults .dict-entry p{margin:0;font-size:13px;line-height:1.5;color:#3c524a}';document.head.append(dictStyle);
  const dictOpen=document.createElement('button');dictOpen.id='dictOpen';dictOpen.className='btn';dictOpen.textContent='Sözlük';document.querySelector('.tool-actions').prepend(dictOpen);
  let dictList=[],activeDict=null,searchTimer=null,lastRequest=0,listGeneration=0;
  const requestDictionary=url=>(window.BilgeAccount?.fetch||fetch)(url,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});
  function invited(){return location.hostname==='defter.bilgearena.com'||window.__syncInvited===true}
  const norm=s=>String(s||'').toLocaleLowerCase('tr-TR').trim();
  function localSearch(query,limit=20){
    const q=norm(query);if(!q)return [];
    const data=window.BILGE_SOZLUK||[];
    const scored=data.map(e=>{const t=norm(e.term),d=norm(e.def);let score;if(t===q)score=0;else if(t.startsWith(q))score=1;else if(t.includes(q))score=2;else if(d.includes(q))score=3;else return null;return {entry:e,score}}).filter(x=>x!==null);
    return scored.sort((a,b)=>a.score-b.score||a.entry.term.localeCompare(b.entry.term,'tr')).slice(0,limit).map(x=>x.entry);
  }
  async function loadDictionaries(){
    const generation=++listGeneration;dictList=[];activeDict=null;dictNote.textContent=localNote;
    const select=document.querySelector('#dictSelect');select.replaceChildren();
    if(!invited()){select.closest('.tool-row').hidden=true;renderCount();return}
    try{
      const res=await requestDictionary('./api/v1/bilge-defter/dictionaries');
      if(!res.ok)throw Error();
      const data=await res.json();
      if(generation!==listGeneration||!dictDialog.open)return;
      dictList=(Array.isArray(data.dictionaries)?data.dictionaries:[]).filter(d=>typeof d?.id==='string'&&typeof d.name==='string').slice(0,20);
      if(!dictList.length)throw Error();
      for(const d of dictList){const o=document.createElement('option');o.value=d.id;o.textContent=`${d.name} (${d.count})`;select.append(o)}
      activeDict=dictList[0].id;select.closest('.tool-row').hidden=dictList.length<2;dictNote.textContent='Sunucudaki seçili sözlük kullanılıyor. Bağlantı veya hizmet sorunu olursa cihazdaki sınırlı alt kümeye dönülür. Tanı veya tedavi önerisi değildir.';renderCount();
    }catch{if(generation!==listGeneration||!dictDialog.open)return;dictList=[];activeDict=null;select.closest('.tool-row').hidden=true;renderCount()}
    if(norm(document.querySelector('#dictQuery').value))void doSearch();
  }
  function renderCount(){
    const q=norm(document.querySelector('#dictQuery').value);
    const el=document.querySelector('#dictCount');
    if(q){return}
    if(invited()&&dictList.length)el.textContent=`${dictList.length} sözlük hazır · aramak için yazın (çevrim dışıyken cihazdaki ${(window.BILGE_SOZLUK||[]).length} terimlik alt küme)`;
    else el.textContent=`Cihazdaki sınırlı sözlük · ${(window.BILGE_SOZLUK||[]).length} terim · aramak için yazın`;
  }
  function renderResults(entries,source){
    const list=document.querySelector('#dictResults');list.replaceChildren();
    const q=document.querySelector('#dictQuery').value;
    document.querySelector('#dictCount').textContent=q.trim()?`${entries.length} sonuç · ${source}`:'';
    if(!entries.length&&q.trim()){const p=document.createElement('p');p.className='recovery-note';p.textContent='Sözlükte bulunamadı. Web’de ara düğmesini kullanabilirsiniz.';list.append(p)}
    for(const e of entries){const card=document.createElement('section');card.className='dict-entry';const t=document.createElement('strong');t.textContent=e.term;const d=document.createElement('p');d.textContent=e.def;card.append(t,d);list.append(card)}
    document.querySelector('#dictWeb').disabled=!q.trim();
  }
  async function doSearch(){
    const request=++lastRequest;
    const q=document.querySelector('#dictQuery').value;
    if(!norm(q)){renderResults([]);renderCount();return}
    if(invited()&&activeDict){
      try{
        const res=await requestDictionary(`./api/v1/bilge-defter/dictionaries/${encodeURIComponent(activeDict)}/search?q=${encodeURIComponent(q)}&limit=25`);
        if(!res.ok)throw Error();
        const data=await res.json();
        if(request!==lastRequest||!dictDialog.open)return;
        const dict=dictList.find(d=>d.id===activeDict);
        if(!Array.isArray(data.results))throw Error();
        renderResults(data.results.filter(e=>typeof e?.term==='string'&&typeof e.def==='string').slice(0,25),dict?dict.name:'sunucu');
        return;
      }catch{}
    }
    if(request!==lastRequest||!dictDialog.open)return;
    dictNote.textContent=localNote;
    renderResults(localSearch(q),'cihazdaki alt küme');
  }
  document.querySelector('#dictQuery').addEventListener('input',()=>{++lastRequest;clearTimeout(searchTimer);if(!norm(document.querySelector('#dictQuery').value)){void doSearch();return}searchTimer=setTimeout(()=>{void doSearch()},250)});
  document.querySelector('#dictSelect').addEventListener('change',e=>{activeDict=e.target.value;if(norm(document.querySelector('#dictQuery').value))void doSearch()});
  document.querySelector('#dictClose').onclick=()=>dictDialog.close();
  dictDialog.addEventListener('close',()=>{++lastRequest;++listGeneration;clearTimeout(searchTimer)});
  dictOpen.onclick=()=>{if(!canEdit()||drawing||pan)return;closeTools();setSidebarOpen(false);document.querySelector('#dictQuery').value='';renderResults([]);dictDialog.showModal();dictDialog.scrollTop=0;void loadDictionaries();document.querySelector('#dictQuery').focus({preventScroll:true})};
  document.querySelector('#dictWeb').onclick=()=>{const q=document.querySelector('#dictQuery').value.trim();if(!q)return;window.open('https://www.google.com/search?q='+encodeURIComponent(q),'_blank','noopener,noreferrer')};
  window.openDictionary=term=>{closeTools();setSidebarOpen(false);document.querySelector('#dictQuery').value=term||'';dictDialog.showModal();dictDialog.scrollTop=0;void loadDictionaries();if(term)void doSearch()};
})();
