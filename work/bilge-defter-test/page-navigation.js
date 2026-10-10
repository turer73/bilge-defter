/* Numbered PDF/PPTX navigation. This overlay never changes the writing canvas size. */
(()=>{
  'use strict';
  const workspace=document.querySelector('.workspace');
  if(!workspace)return;
  const style=document.createElement('style');
  style.textContent=`
    #documentPagesToggle,#documentPagesPanel{position:absolute;left:max(8px,env(safe-area-inset-left));top:8px;z-index:12}
    #documentPagesToggle{top:auto;bottom:8px;min-height:44px;max-width:calc(100% - 16px);padding:8px 12px;border:1px solid #b6ccc4;box-shadow:0 2px 10px #173b361a}
    #documentPagesPanel{z-index:13;bottom:64px;width:min(304px,calc(100% - 16px));display:grid;grid-template-rows:auto minmax(0,1fr);border:1px solid #b6ccc4;border-radius:14px;background:var(--paper,#fffdf8);color:#17312d;box-shadow:0 6px 24px #173b3633;overflow:hidden}
    #documentPagesToggle[hidden],#documentPagesPanel[hidden],.workspace.layout-active #documentPagesToggle,.workspace.layout-active #documentPagesPanel{display:none!important}
    #documentPagesPanel .document-pages-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;border-bottom:1px solid #d5e2dc}
    #documentPagesClose{min-width:44px;min-height:44px;flex:none}
    #documentPagesList{display:grid;align-content:start;gap:6px;min-height:0;padding:8px;overflow:auto;overscroll-behavior:contain;touch-action:pan-y}
    #documentPagesList button{display:flex;align-items:center;gap:10px;min-height:48px;min-width:0;text-align:left;padding:8px;border:1px solid #d5e2dc;border-radius:10px;background:#fff;color:#17312d}
    #documentPagesList button[aria-current=page]{border:2px solid #255f50;background:#eaf2ed;font-weight:700}
    #documentPagesList .document-page-number{min-width:32px;text-align:center;font-variant-numeric:tabular-nums;font-weight:700}
    #documentPagesList .document-page-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    #documentPagesToggle:focus-visible,#documentPagesPanel button:focus-visible{outline:3px solid #156fbe;outline-offset:-3px}
    #documentPagesList button:disabled{opacity:.5}
    @media(forced-colors:active){#documentPagesList button[aria-current=page]{border-color:Highlight;outline:1px solid Highlight}}
  `;
  document.head.append(style);
  const toggle=document.createElement('button');
  toggle.id='documentPagesToggle';toggle.type='button';toggle.className='btn';toggle.hidden=true;
  toggle.setAttribute('aria-controls','documentPagesPanel');toggle.setAttribute('aria-expanded','false');
  const panel=document.createElement('aside');
  panel.id='documentPagesPanel';panel.hidden=true;panel.setAttribute('aria-labelledby','documentPagesTitle');
  const heading=document.createElement('div');heading.className='document-pages-heading';
  const title=document.createElement('strong');title.id='documentPagesTitle';title.textContent='Belge sayfaları';
  const closeButton=document.createElement('button');closeButton.id='documentPagesClose';closeButton.type='button';closeButton.className='btn';closeButton.textContent='× Kapat';closeButton.setAttribute('aria-label','Belge sayfalarını kapat');
  heading.append(title,closeButton);
  const list=document.createElement('div');list.id='documentPagesList';list.setAttribute('aria-label','Bu defterdeki PDF ve sunum sayfaları');
  panel.append(heading,list);workspace.append(toggle,panel);
  let openedFor=null,listKey='',listOwner=null,listBook=null,selectedButton=null,refreshQueued=false;
  const buttons=new Map(),observedDialogs=new WeakSet();
  function close(restore=false){
    const hadFocus=panel.contains(document.activeElement);
    panel.hidden=true;openedFor=null;toggle.setAttribute('aria-expanded','false');
    if(restore&&hadFocus&&!toggle.hidden)toggle.focus({preventScroll:true});
  }
  function clearList(){
    if(list.childNodes.length)list.replaceChildren();
    buttons.clear();listKey='';listOwner=null;listBook=null;selectedButton=null;
  }
  function context(){
    try{
      if(!ready||!state||!page()?.pdf||!canEdit()||window.BilgePptx?.active||workspace.classList.contains('layout-active')||document.querySelector('dialog[open]')||document.querySelector('bilge-defter-ui')?.shadowRoot?.querySelector('dialog[open]'))return null;
      const pages=notebookPages().filter(p=>p.pdf);
      if(!pages.some(p=>p.id===activeId))return null;
      return {owner:state,db:DB,book:activeNotebook,pages,active:activeId,busy:!!(drawing||pan||mediaGesture||mediaPending||mediaPlacement||mediaSelecting||mediaBusy)};
    }catch{return null} // The module may load while the notebook is still starting.
  }
  function sameContext(a,b){return !!a&&!!b&&a.owner===b.owner&&a.db===b.db&&a.book===b.book}
  function queueRefresh(){if(refreshQueued)return;refreshQueued=true;queueMicrotask(()=>{refreshQueued=false;refresh()})}
  const dialogObserver=new MutationObserver(queueRefresh);
  function watchDialogs(){
    const dialogs=[...document.querySelectorAll('dialog'),...(document.querySelector('bilge-defter-ui')?.shadowRoot?.querySelectorAll('dialog')||[])];
    for(const dialog of dialogs)if(!observedDialogs.has(dialog)){observedDialogs.add(dialog);dialogObserver.observe(dialog,{attributes:true,attributeFilter:['open']})}
  }
  function refresh(){
    watchDialogs();
    const next=context();
    if(!next){toggle.hidden=true;close();clearList();return}
    if(openedFor&&!sameContext(openedFor,next))close();
    toggle.hidden=false;toggle.disabled=next.busy;
    const label=`Sayfalar · ${next.pages.findIndex(p=>p.id===next.active)+1}/${next.pages.length}`;
    if(toggle.textContent!==label)toggle.textContent=label;
    if(panel.hidden)return;
    // Only metadata changes rebuild buttons. Scrolling between slides only changes
    // the selected marker; page images and canvas previews are deliberately absent.
    const key=JSON.stringify(next.pages.map(p=>[p.id,p.title,p.pdf.name,p.pdf.number,p.pdf.total]));
    if(key!==listKey||next.owner!==listOwner||next.book!==listBook){
      clearList();listKey=key;listOwner=next.owner;listBook=next.book;
      const fragment=document.createDocumentFragment();
      next.pages.forEach((p,index)=>{
        const button=document.createElement('button');button.type='button';button.dataset.pageId=p.id;
        const number=document.createElement('span');number.className='document-page-number';number.textContent=String(index+1);number.setAttribute('aria-hidden','true');
        const name=document.createElement('span');name.className='document-page-title';name.textContent=p.title||`Sayfa ${index+1}`;
        button.title=`${p.pdf.name||'Belge'} · kaynak sayfa ${p.pdf.number}/${p.pdf.total}`;
        button.setAttribute('aria-label',`${index+1}. sayfa · ${p.title||'Başlıksız'}`);button.append(number,name);buttons.set(p.id,button);fragment.append(button);
      });
      list.append(fragment);
    }
    const selected=buttons.get(next.active);
    if(selectedButton!==selected){selectedButton?.removeAttribute('aria-current');selected?.setAttribute('aria-current','page');selectedButton=selected}
    for(const button of buttons.values())button.disabled=next.busy;
  }
  function choose(id){
    const current=context();
    // A delayed click from a different account, replaced notebook or old panel
    // must not select an identically named page from the new source.
    if(!sameContext(openedFor,current)||current.busy){refresh();return}
    const target=current.pages.find(p=>p.id===id);if(!target){refresh();return}
    const zoom=viewZoom(),slideFlow=window.BilgeSlideFlow;
    close(true);
    if(slideFlow?.enabled()&&slideFlow.jumpTo(id)){renderPages();return}
    // A normal PDF or another continuous run uses the same existing page model.
    // Keep the departing page's view, retain zoom, and only save view-state fields.
    activeId=target.id;state.active=activeId;target.viewY=0;target.viewX=0;target.pdfZoom=zoom;
    if(slideFlow?.enabled()&&slideFlow.jumpTo(id,zoom)){renderPages();return}
    markViewChanged();scheduleViewSave();renderPages();drawAll();
  }
  toggle.addEventListener('click',()=>{
    const current=context();if(!current||current.busy){refresh();return}
    if(!panel.hidden){close(true);return}
    openedFor=current;panel.hidden=false;toggle.setAttribute('aria-expanded','true');refresh();
    if(!panel.hidden){const selected=buttons.get(current.active);selected?.focus({preventScroll:true});selected?.scrollIntoView({block:'nearest'})}
  });
  closeButton.addEventListener('click',()=>close(true));
  list.addEventListener('click',event=>{const button=event.target.closest('button[data-page-id]');if(button&&!button.disabled&&list.contains(button))choose(button.dataset.pageId)});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel.hidden){event.preventDefault();close(true)}},{capture:true});
  document.addEventListener('pointerdown',event=>{if(!panel.hidden&&!panel.contains(event.target)&&event.target!==toggle)close()},{capture:true});
  // Modal panels may be created by other modules or live inside the UI shadow root.
  // Observe their open state, not all page mutations or pointer-move frames.
  document.addEventListener('click',queueRefresh,{capture:true});
  // Wait until the app has cleared the pointer owner before enabling navigation.
  // No move listener: drawing samples must not rebuild navigation metadata.
  for(const type of ['pointerup','pointercancel','lostpointercapture'])document.addEventListener(type,queueRefresh,{capture:true});
  addEventListener('blur',queueRefresh);
  new MutationObserver(queueRefresh).observe(workspace,{attributes:true,attributeFilter:['class']});
  new MutationObserver(queueRefresh).observe(document.body,{childList:true});
  const saveState=document.querySelector('#saveState');if(saveState)new MutationObserver(queueRefresh).observe(saveState,{childList:true,characterData:true,subtree:true});
  addEventListener('bilge-account-locked',()=>{toggle.hidden=true;close();clearList()});
  addEventListener('pagehide',()=>{close();clearList()});
  addEventListener('pageshow',queueRefresh);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')close();else queueRefresh()});
  window.BilgePageNavigation=Object.freeze({refresh,close});
  refresh();queueRefresh();
})();
