// Dictionary lookup: server-backed (invited origin) with the embedded TDK
// medical subset as offline fallback. Server can host additional dictionaries
// without any client change.
(() => {
  const dictDialog=document.createElement('dialog');dictDialog.id='dictDialog';dictDialog.className='tools-dialog';dictDialog.setAttribute('aria-labelledby','dictTitle');
  dictDialog.innerHTML='<div class="tools-heading"><h2 id="dictTitle">Sözlük</h2><button class="btn" id="dictClose">× Kapat</button></div><div class="tools-content"><p class="recovery-note">TDK Güncel Türkçe Sözlük (12. baskı) tam verisi sunucudan aranır; çevrim dışıyken cihazdaki tıp ağırlıklı alt küme kullanılır. Tanı veya tedavi önerisi DEĞİLDİR. El yazısı otomatik okunmaz.</p><div class="tool-row"><label for="dictSelect">Sözlük</label><select id="dictSelect" aria-label="Sözlük seçimi"></select></div><input id="dictQuery" type="text" placeholder="Örn. astım, ülser" autocomplete="off" maxlength="120" aria-label="Aranacak terim"><p id="dictCount" class="recovery-note" role="status"></p><div id="dictResults"></div><button class="btn" id="dictWeb" type="button">Web’de ara</button></div>';
  document.body.append(dictDialog);
  const dictNote=dictDialog.querySelector('.recovery-note');
  const modeRow=document.createElement('label');modeRow.className='dict-mode';modeRow.textContent='Arama alanı';
  const modeSelect=document.createElement('select');modeSelect.id='dictMode';modeSelect.setAttribute('aria-label','Arama alanı');
  for(const [value,label] of [['general','Türkçe sözlük'],['anatomy','Anatomi terimleri · pilot']]){const option=document.createElement('option');option.value=value;option.textContent=label;modeSelect.append(option)}
  modeRow.append(modeSelect);dictNote.before(modeRow);
  const isAnatomy=()=>modeSelect.value==='anatomy';
  const pilotNote=()=>`${window.BilgeTerminology?.count||0} kavramlık çevrim dışı pilot. Türkçe, İngilizce ve Latince eşleştirmeler taslaktır; uzman kontrolü tamamlanmadı. İlk 100 kavram bağımsız hazırlandı; diğerlerinin etiketleri Wikidata’dan (CC0) alınıp tek tek gözden geçirildi. Resmî FIPAT çevirisi veya tıbbi karar desteği değildir.`;
  const queryDraft=document.createElement('section');queryDraft.id='dictQueryDraft';queryDraft.hidden=true;queryDraft.setAttribute('aria-live','polite');document.querySelector('#dictResults').after(queryDraft);
  let libraryTerm=null;
  const clearDraft=()=>{libraryTerm=null;queryDraft.hidden=true;queryDraft.replaceChildren()};
  // Only an explicit click opens the invited library. Never send notebook content.
  // Same window: the installed iPad app keeps its own window and storage, and the
  // library's "Deftere dön" comes back here instead of opening a second notebook.
  const leaveBlocked=()=>(typeof drawing!=='undefined'&&drawing)||(typeof importing!=='undefined'&&importing)||(typeof pdfBusy!=='undefined'&&pdfBusy)||(typeof mediaBusy!=='undefined'&&mediaBusy)||(typeof mediaPending!=='undefined'&&mediaPending)||(typeof mediaGesture!=='undefined'&&mediaGesture)||(typeof plannerDirty!=='undefined'&&plannerDirty);
  window.openBilgeLibrary=async(term='')=>{
    if(!navigator.onLine){alert('Kütüphane için internet bağlantısı gerekiyor. Defteriniz açık kalacak.');return;}
    const url=new URL('https://defter.bilgearena.com/library/');
    const q=String(term).trim().slice(0,120);if(q)url.hash=new URLSearchParams({q}).toString();
    // Another origin has other storage; its notebook could not be the one we return to.
    if(location.origin!==url.origin){window.open(url.href,'_blank','noopener,noreferrer');return;}
    const blocked='Önce açık düzenlemeyi bitirin; kütüphane ardından bu pencerede açılır.';
    if(leaveBlocked()){alert(blocked);return;}
    if(typeof flushSave==='function'&&!await flushSave()){alert('Kayıt tamamlanamadı; kütüphane açılmadı. Notlarınız bu pencerede duruyor.');return;}
    if(leaveBlocked()||(typeof isDirty==='function'&&isDirty())){alert(blocked);return;}
    location.assign(url.href);
  };
  const libraryButton=document.createElement('button');libraryButton.id='dictLibrary';libraryButton.type='button';libraryButton.className='btn';libraryButton.textContent='Kütüphanede ara';libraryButton.disabled=true;
  document.querySelector('#dictWeb').before(libraryButton);
  libraryButton.onclick=()=>{const q=libraryTerm||document.querySelector('#dictQuery').value.trim();if(q)window.openBilgeLibrary(q)};
  // Global tool-row display rules otherwise override the native hidden attribute.
  const hiddenStyle=document.createElement('style');hiddenStyle.textContent='#dictDialog .tool-row[hidden]{display:none}';document.head.append(hiddenStyle);
  const pilotStyle=document.createElement('style');pilotStyle.textContent='.dict-mode{display:grid;gap:6px;margin-bottom:12px;font-size:14px;font-weight:600}#dictMode{width:100%;min-height:44px;font-size:16px;padding:8px;border:1px solid #b6ccc4;border-radius:8px;background:white;color:#17312d}#dictDialog .dict-languages{display:grid;grid-template-columns:75px minmax(0,1fr);gap:5px;margin:8px 0;font-size:14px}#dictDialog dt{color:#52655e}#dictDialog dd{margin:0;overflow-wrap:anywhere}#dictDialog .dict-review{color:#775312;background:#fff2d8;padding:6px 8px;border-radius:6px;margin:6px 0}#dictDialog .dict-entry button{margin-top:8px;min-height:44px}#dictDialog .dict-reference{display:block;font-size:12px;margin-top:8px;overflow-wrap:anywhere}#dictDialog .dict-library{font-size:12px;margin:8px 0 0;color:#40524d;overflow-wrap:anywhere}#dictQueryDraft{padding:12px;background:#e8f2ec;border-radius:8px;overflow-wrap:anywhere}#dictQueryDraft[hidden]{display:none}#dictQueryDraft p{font-size:13px;line-height:1.5}';document.head.append(pilotStyle);
  const localNote='Cihazdaki tıp ağırlıklı TDK alt kümesi kullanılıyor; tam sözlük hizmeti doğrulanmadı. Tanı veya tedavi önerisi DEĞİLDİR. El yazısı otomatik okunmaz.';
  const serverNote='Sunucudaki seçili sözlük kullanılıyor. Bağlantı veya hizmet sorunu olursa cihazdaki sınırlı alt kümeye dönülür. Tanı veya tedavi önerisi değildir.';
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
    if(isAnatomy()){select.closest('.tool-row').hidden=true;dictNote.textContent=pilotNote();renderCount();return}
    if(!invited()){select.closest('.tool-row').hidden=true;renderCount();return}
    try{
      const res=await requestDictionary('./api/v1/bilge-defter/dictionaries');
      if(!res.ok)throw Error();
      const data=await res.json();
      if(generation!==listGeneration||!dictDialog.open||isAnatomy())return;
      dictList=(Array.isArray(data.dictionaries)?data.dictionaries:[]).filter(d=>typeof d?.id==='string'&&typeof d.name==='string').slice(0,20);
      if(!dictList.length)throw Error();
      for(const d of dictList){const o=document.createElement('option');o.value=d.id;o.textContent=`${d.name} (${d.count})`;select.append(o)}
      activeDict=dictList[0].id;select.closest('.tool-row').hidden=dictList.length<2;dictNote.textContent=serverNote;renderCount();
    }catch{if(generation!==listGeneration||!dictDialog.open)return;dictList=[];activeDict=null;select.closest('.tool-row').hidden=true;renderCount()}
    if(norm(document.querySelector('#dictQuery').value))void doSearch();
  }
  function renderCount(){
    const q=norm(document.querySelector('#dictQuery').value);
    const el=document.querySelector('#dictCount');
    if(q){return}
    if(isAnatomy()){el.textContent=`${window.BilgeTerminology?.count||0} taslak kavram · Türkçe, English veya Latince arayın`;return}
    if(invited()&&dictList.length)el.textContent=`${dictList.length} sözlük hazır · aramak için yazın (çevrim dışıyken cihazdaki ${(window.BILGE_SOZLUK||[]).length} terimlik alt küme)`;
    else el.textContent=`Cihazdaki sınırlı sözlük · ${(window.BILGE_SOZLUK||[]).length} terim · aramak için yazın`;
  }
  function renderResults(entries,source){
    const list=document.querySelector('#dictResults');list.replaceChildren();
    list.setAttribute('aria-busy','false');
    const q=document.querySelector('#dictQuery').value;
    document.querySelector('#dictCount').textContent=q.trim()?`${entries.length} sonuç · ${source}`:'';
    if(!entries.length&&q.trim()){const p=document.createElement('p');p.className='recovery-note';p.textContent='Sözlükte bulunamadı. Web’de ara düğmesini kullanabilirsiniz.';list.append(p)}
    for(const e of entries){const card=document.createElement('section');card.className='dict-entry';const t=document.createElement('strong');t.textContent=e.term;const d=document.createElement('p');d.textContent=e.def;card.append(t,d);list.append(card)}
    document.querySelector('#dictWeb').disabled=!q.trim();
  }
  function renderConcepts(query){
    const list=document.querySelector('#dictResults');list.replaceChildren();
    list.setAttribute('aria-busy','false');
    const renderedRequest=lastRequest;
    const engine=window.BilgeTerminology,hits=engine?.search(query)||[];
    dictNote.textContent=pilotNote();
    document.querySelector('#dictCount').textContent=query.trim()?`${hits.length} kavram · cihazdaki anatomi pilotu`:'';
    document.querySelector('#dictWeb').disabled=!query.trim();
    if(!query.trim()){renderCount();return}
    if(!engine){list.textContent='Terim paketi yüklenemedi. Türkçe sözlük seçeneğini kullanabilirsiniz.';return}
    if(!hits.length){list.textContent='Bu sınırlı pilotta bulunamadı. Terim yanlış olmak zorunda değil; Türkçe sözlük veya Web’de ara kullanılabilir.';return}
    for(const hit of hits){
      const c=hit.concept,card=document.createElement('section');card.className='dict-entry';card.dataset.conceptId=c.id;
      const title=document.createElement('strong');title.textContent=c.labels.tr;card.append(title);
      if(hit.match==='suggestion'){const p=document.createElement('p');p.textContent=`Bunu mu demek istediniz: ${hit.matchedText}? Yazdığınız metin değiştirilmedi.`;card.append(p)}
      if(hit.match==='abbreviation'){const p=document.createElement('p');p.textContent='Kısaltma eşleşmesi: anatomi bağlamını doğrulayın.';card.append(p)}
      const labels=document.createElement('dl');labels.className='dict-languages';
      for(const [lang,label] of [['tr','Türkçe'],['en','English'],['la','Latince']]){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=c.labels[lang]||'Doğrulanmış karşılık yok';dd.lang=lang;labels.append(dt,dd)}card.append(labels);
      const status=document.createElement('p');status.className='dict-review';status.textContent='Taslak eşleştirme · uzman onayı bekliyor';card.append(status);
      if(c.note){const p=document.createElement('p');p.textContent=c.note;card.append(p)}
      const ref=engine.sources.find(s=>c.referenceCandidates.includes(s.id));
      if(ref){const a=document.createElement('a');a.className='dict-reference';a.textContent='Kaynak adayı: '+ref.title;a.href=ref.url;a.target='_blank';a.rel='noopener noreferrer';card.append(a)}
      // Label provenance: which Wikidata item, and which labels the editor changed.
      const origin=c.labelSource;
      if(origin?.id==='wikidata'&&/^Q[0-9]+$/.test(origin.item)){const a=document.createElement('a');a.className='dict-reference';a.href='https://www.wikidata.org/wiki/'+origin.item;a.target='_blank';a.rel='noopener noreferrer';const names={tr:'Türkçe',en:'English',la:'Latince'},list=k=>(origin[k]||[]).map(l=>names[l]).filter(Boolean),edited=list('edited'),added=list('added');a.textContent=`Etiket kaynağı: Wikidata ${origin.item}${origin.ta98?' · TA98 '+origin.ta98:''} (CC0)${edited.length?' · editör düzeltmesi: '+edited.join(', '):''}${added.length?' · editör eklemesi: '+added.join(', '):''}`;card.append(a)}
      // Counts only: pages the library search matches for this term (all its words on the page).
      const found=Object.entries(c.library?.books||{}).filter(([,n])=>Number.isSafeInteger(n)&&n>0).sort((a,b)=>b[1]-a[1]);
      if(c.library?.term){const p=document.createElement('p');p.className='dict-library';const pages=found.reduce((a,[,n])=>a+n,0),top=found[0]&&engine.libraryBooks[found[0][0]];p.textContent=pages?`Kütüphane araması “${c.library.term}”: ${found.length} kitapta ${pages} sayfa eşleşiyor${top?` · en çok: ${top} (${found[0][1]})`:''}.`:`Kütüphane araması “${c.library.term}”: eşleşen sayfa yok.`;card.append(p)}
      const select=document.createElement('button');select.type='button';select.className='btn';select.textContent='Arama için seç';select.setAttribute('aria-label',c.labels.tr+' — arama için seç');
      select.onclick=()=>{
        // A detached card or queued event must never select a previous query/session.
        if(!dictDialog.open||!isAnatomy()||renderedRequest!==lastRequest||document.querySelector('#dictQuery').value!==query)return;
        const draft=engine.expansion(c.id,query);if(!draft)return;
        libraryTerm=c.library?.term||c.labels.en||c.labels.tr;
        queryDraft.replaceChildren();queryDraft.hidden=false;
        for(const text of ['Arama taslağı — henüz gönderilmedi','Özgün sorgu: '+draft.original,'Seçilen kavram: '+c.labels.tr,'Karşılıklar: '+draft.terms.join(' · '),'Kütüphanede ara: '+libraryTerm+' — seçilen taslak karşılığı kontrol edin. Yalnız düğmeye basınca gönderilir; kaynaklar İngilizcedir. Web’de ara özgün sorguyu kullanır.']){const p=document.createElement('p');p.textContent=text;queryDraft.append(p)}
      };
      card.append(select);list.append(card);
    }
  }
  function clearSearchResults(query){
    const pending=Boolean(query.trim()),list=document.querySelector('#dictResults');
    list.replaceChildren();list.setAttribute('aria-busy',String(pending));
    document.querySelector('#dictCount').textContent=pending?'Aranıyor…':'';
    document.querySelector('#dictWeb').disabled=!pending;
    libraryButton.disabled=!pending;
  }
  async function doSearch(){
    const request=++lastRequest;
    const q=document.querySelector('#dictQuery').value;
    clearDraft();
    clearSearchResults(q);
    if(isAnatomy()){renderConcepts(q);return}
    if(!norm(q)){renderResults([]);renderCount();return}
    if(invited()&&activeDict){
      try{
        const res=await requestDictionary(`./api/v1/bilge-defter/dictionaries/${encodeURIComponent(activeDict)}/search?q=${encodeURIComponent(q)}&limit=25`);
        if(!res.ok)throw Error();
        const data=await res.json();
        if(request!==lastRequest||!dictDialog.open)return;
        const dict=dictList.find(d=>d.id===activeDict);
        if(!Array.isArray(data.results))throw Error();
        dictNote.textContent=serverNote;
        renderResults(data.results.filter(e=>typeof e?.term==='string'&&typeof e.def==='string').slice(0,25),dict?dict.name:'sunucu');
        return;
      }catch{}
    }
    if(request!==lastRequest||!dictDialog.open)return;
    dictNote.textContent=localNote;
    renderResults(localSearch(q),'cihazdaki alt küme');
  }
  document.querySelector('#dictQuery').addEventListener('input',()=>{++lastRequest;clearDraft();clearTimeout(searchTimer);const query=document.querySelector('#dictQuery').value;clearSearchResults(query);if(!norm(query)){void doSearch();return}searchTimer=setTimeout(()=>{void doSearch()},250)});
  modeSelect.addEventListener('change',()=>{++lastRequest;++listGeneration;clearTimeout(searchTimer);clearDraft();document.querySelector('#dictResults').replaceChildren();document.querySelector('#dictQuery').placeholder=isAnatomy()?'Örn. kalp, heart, cor':'Örn. astım, ülser';void loadDictionaries();void doSearch()});
  document.querySelector('#dictSelect').addEventListener('change',e=>{++lastRequest;clearDraft();activeDict=e.target.value;if(norm(document.querySelector('#dictQuery').value))void doSearch()});
  document.querySelector('#dictClose').onclick=()=>dictDialog.close();
  dictDialog.addEventListener('close',()=>{++lastRequest;++listGeneration;clearTimeout(searchTimer);clearDraft();libraryButton.disabled=true});
  dictOpen.onclick=()=>{if(!canEdit()||drawing||pan)return;closeTools();setSidebarOpen(false);document.querySelector('#dictQuery').value='';renderResults([]);dictDialog.showModal();dictDialog.scrollTop=0;void loadDictionaries();document.querySelector('#dictQuery').focus({preventScroll:true})};
  document.querySelector('#dictWeb').onclick=()=>{const q=document.querySelector('#dictQuery').value.trim();if(!q)return;window.open('https://www.google.com/search?q='+encodeURIComponent(q),'_blank','noopener,noreferrer')};
  window.openDictionary=term=>{++lastRequest;clearTimeout(searchTimer);clearDraft();closeTools();setSidebarOpen(false);document.querySelector('#dictQuery').value=term||'';document.querySelector('#dictResults').replaceChildren();dictDialog.showModal();dictDialog.scrollTop=0;void loadDictionaries();void doSearch()};
})();
