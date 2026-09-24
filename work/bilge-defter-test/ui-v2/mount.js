/**
 * Mevcut Bilge Defter uygulamasına geri alınabilir arayüz bağlama.
 * İşlev adları tahmin edilmez; çağıran kod gerçek callback'leri verir.
 * Bu dosya kendiliğinden çalışmaz, veritabanı açmaz ve not taşımaz.
 */
(() => {
 'use strict';
 const REQUIRED_FROM_SCREEN = Object.freeze([
  'tool.select','ink.set','paper.set','history.undo',
  'insert.text','insert.image','insert.camera','pdf.open','selection.edit',
  'study.planner','study.dictionary','study.recognize','study.webSearch',
  'page.top','page.clear','pdf.export','backup.export','backup.import','backup.rollback',
  'settings.frame','settings.input','settings.install',
  'notebook.create','notebook.rename','page.create','page.rename',
  'library.selectNotebook','library.selectPage','trash.open',
 ]);
 function audit(host,required=REQUIRED_FROM_SCREEN){
  const errors=[],warnings=[];
  if(!host || typeof host.getState!=='function')errors.push('getState() bağlanmadı.');
  if(typeof host?.subscribe!=='function')errors.push('subscribe(listener) bağlanmadı.');
  const commands=host?.commands||{};
  const missing=required.filter(id=>typeof commands[id]!=='function');
  missing.forEach(id=>errors.push('Komut bağlanmadı: '+id));
  if(typeof host?.getState==='function'){
   try{
    const s=host.getState();
    if(!s || typeof s!=='object')errors.push('getState() bir durum nesnesi döndürmeli.');
    else{
     if(typeof s.ready!=='boolean')errors.push('Durumda ready: boolean gerekli.');
     if(!s.save || !['unknown','pending','saved','error'].includes(s.save.status))errors.push('Gerçek kayıt durumu save.status olarak verilmeli.');
     if(!Array.isArray(s.books)||!Array.isArray(s.pages))errors.push('books ve pages özet dizileri gerekli.');
     if(typeof s.clearIsUndoable!=='boolean')warnings.push('Temizlemenin geri alınabilirliği bildirilmedi.');
    }
   }catch(_){errors.push('getState() hata verdi.');}
  }
  return {ok:errors.length===0,errors,warnings,missing};
 }
 /**
  * @param {{editorRoot:HTMLElement, host:object, oldChrome?:HTMLElement[], requiredCommands?:string[], height?:string}} options
  * @returns {{ui:HTMLElement,destroy:()=>void,audit:object}}
  * requiredCommands yalnız gerçekten olmayan modüller için açık kararla azaltılmalı.
  */
 function mount({editorRoot,host,oldChrome=[],requiredCommands=REQUIRED_FROM_SCREEN,height='100dvh',buttonThemeKey=null}){
  const result=audit(host,requiredCommands);
  if(!result.ok){const e=new Error('Arayüz bağlanmadı. Eksik komutlar tamamlanmadan eski arayüz gizlenmez.');e.audit=result;throw e;}
  if(!(editorRoot instanceof HTMLElement)||!editorRoot.isConnected)throw new TypeError('Bağlı bir editorRoot gerekli.');
  if(!customElements.get('bilge-defter-ui'))throw new Error('Önce dist/bilge-defter-ui.js yüklenmeli.');
  if(editorRoot.closest('bilge-defter-ui'))throw new Error('Bu düzenleyici zaten bağlanmış.');
  for(const node of oldChrome){
   if(!(node instanceof HTMLElement)||node===editorRoot||!editorRoot.contains(node))throw new TypeError('oldChrome yalnız editorRoot içindeki doğrulanmış eski araç alanlarını içermeli.');
   if(node.matches('canvas,[data-editor-focus]') || node.querySelector('canvas,[data-editor-focus]'))throw new Error('Çizim alanını içeren bir bölüm araç çubuğu olarak gizlenemez.');
  }
  const parent=editorRoot.parentNode,next=editorRoot.nextSibling,originalSlot=editorRoot.getAttribute('slot');
  const saved=oldChrome.map(node=>({node,style:node.getAttribute('style'),hidden:node.hidden,inert:node.inert,aria:node.getAttribute('aria-hidden')}));
  const ui=document.createElement('bilge-defter-ui');ui.style.height=height;ui.style.width='100%';
  if(buttonThemeKey)ui.setAttribute('button-theme-key',buttonThemeKey);
  let destroyed=false;
  const restore=()=>{
   if(destroyed)return;destroyed=true;
   // Bütün düzenleyici kökü tek parça döner; canvas ve dinleyiciler yeniden yaratılmaz.
   if(next?.parentNode===parent)parent.insertBefore(editorRoot,next);else parent.appendChild(editorRoot);
   if(originalSlot===null)editorRoot.removeAttribute('slot');else editorRoot.setAttribute('slot',originalSlot);
   saved.forEach(s=>{if(s.style===null)s.node.removeAttribute('style');else s.node.setAttribute('style',s.style);s.node.hidden=s.hidden;s.node.inert=s.inert;if(s.aria===null)s.node.removeAttribute('aria-hidden');else s.node.setAttribute('aria-hidden',s.aria);});
   ui.remove();
  };
  try{
   parent.insertBefore(ui,editorRoot);editorRoot.setAttribute('slot','editor');ui.appendChild(editorRoot);ui.connect(host);
   saved.forEach(s=>{s.node.style.setProperty('display','none','important');s.node.hidden=true;s.node.inert=true;s.node.setAttribute('aria-hidden','true');});
   return {ui,destroy:restore,audit:result};
  }catch(error){restore();throw error;}
 }
 globalThis.BilgeDefterIntegration=Object.freeze({audit,mount,requiredCommands:REQUIRED_FROM_SCREEN});
})();
