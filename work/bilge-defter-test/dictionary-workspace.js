// Local Turkish medical dictionary lookup. Offline, no server. Educational only:
// the data is a starter glossary, not medical decision support.
(() => {
  const dictDialog=document.createElement('dialog');dictDialog.id='dictDialog';dictDialog.className='tools-dialog';dictDialog.setAttribute('aria-labelledby','dictTitle');
  dictDialog.innerHTML='<div class="tools-heading"><h2 id="dictTitle">Sözlük</h2><button class="btn" id="dictClose">× Kapat</button></div><div class="tools-content"><p class="recovery-note">Başlangıç sözlüğü tıp terimlerini kısaca açıklar; tanı veya tedavi önerisi DEĞİLDİR. El yazısı otomatik okunmaz; aramak istediğiniz terimi yazın.</p><input id="dictQuery" type="text" placeholder="Örn. dispne, ülser" autocomplete="off" maxlength="120" aria-label="Aranacak terim"><p id="dictCount" class="recovery-note" role="status"></p><div id="dictResults"></div><button class="btn" id="dictWeb" type="button">Web’de ara</button></div>';
  document.body.append(dictDialog);
  const dictStyle=document.createElement('style');dictStyle.textContent='#dictDialog{width:min(460px,calc(100% - 24px));max-height:calc(100dvh - 24px);overflow:auto;padding:0;border:1px solid #d5e2dc;border-radius:18px;background:#fffdf8;color:#17312d}#dictDialog::backdrop{background:#173b3650}#dictQuery{box-sizing:border-box;width:100%;padding:12px;border:1px solid #b6ccc4;border-radius:8px;font-size:16px;background:white;color:#17312d;margin-bottom:4px}#dictResults{display:grid;gap:10px;max-height:50vh;overflow:auto;margin:6px 0}#dictResults .dict-entry{padding:10px 12px;border:1px solid #d5e2dc;border-radius:10px;background:#f4f8f5}#dictResults .dict-entry strong{display:block;margin-bottom:3px;font-size:15px}#dictResults .dict-entry p{margin:0;font-size:13px;line-height:1.5;color:#3c524a}';document.head.append(dictStyle);
  const dictOpen=document.createElement('button');dictOpen.id='dictOpen';dictOpen.className='btn';dictOpen.textContent='Sözlük';document.querySelector('.tool-actions').prepend(dictOpen);
  const norm=s=>String(s||'').toLocaleLowerCase('tr-TR').trim();
  function dictSearch(query,limit=20){
    const q=norm(query);if(!q)return [];
    const data=window.BILGE_SOZLUK||[];
    const scored=data.map(e=>{const t=norm(e.term),d=norm(e.def);let score;if(t===q)score=0;else if(t.startsWith(q))score=1;else if(t.includes(q))score=2;else if(d.includes(q))score=3;else return null;return {entry:e,score}}).filter(x=>x!==null);
    return scored.sort((a,b)=>a.score-b.score||a.entry.term.localeCompare(b.entry.term,'tr')).slice(0,limit).map(x=>x.entry);
  }
  function renderDict(){
    const q=document.querySelector('#dictQuery').value;
    const found=dictSearch(q);
    const list=document.querySelector('#dictResults');list.replaceChildren();
    document.querySelector('#dictCount').textContent=q.trim()?`${found.length} sonuç${window.BILGE_SOZLUK&&found.length<window.BILGE_SOZLUK.length?' (en alakalı gösterildi)':''}`:`${(window.BILGE_SOZLUK||[]).length} terim hazır · aramak için yazın`;
    if(!found.length&&q.trim()){const p=document.createElement('p');p.className='recovery-note';p.textContent='Sözlükte bulunamadı. Web’de ara düğmesini kullanabilirsiniz.';list.append(p)}
    for(const e of found){const card=document.createElement('section');card.className='dict-entry';const t=document.createElement('strong');t.textContent=e.term;const d=document.createElement('p');d.textContent=e.def;card.append(t,d);list.append(card)}
    document.querySelector('#dictWeb').disabled=!q.trim();
  }
  document.querySelector('#dictQuery').addEventListener('input',renderDict);
  document.querySelector('#dictClose').onclick=()=>dictDialog.close();
  dictOpen.onclick=()=>{if(!canEdit()||drawing||pan)return;closeTools();setSidebarOpen(false);document.querySelector('#dictQuery').value='';dictDialog.showModal();dictDialog.scrollTop=0;renderDict();document.querySelector('#dictQuery').focus({preventScroll:true})};
  document.querySelector('#dictWeb').onclick=()=>{const q=document.querySelector('#dictQuery').value.trim();if(!q)return;window.open('https://www.google.com/search?q='+encodeURIComponent(q),'_blank','noopener,noreferrer')};
  window.openDictionary=term=>{closeTools();setSidebarOpen(false);document.querySelector('#dictQuery').value=term||'';dictDialog.showModal();dictDialog.scrollTop=0;renderDict();document.querySelector('#dictQuery').focus({preventScroll:true})};
})();
