/** v43 DOM adapter. Moves original controls; never clones a canvas or changes notebook data. */
(() => {
  'use strict';
  function mount() {
    if (window.BilgeUX) return;
    const $ = selector => document.querySelector(selector);
    const app = $('.app'), main = $('.app > main'), workspace = $('.workspace');
    const dialog = $('#toolsDialog'), content = $('#toolsDialog > .tools-content');
    const heading = $('#toolsDialog > .tools-heading'), done = $('#toolsDone');
    const toggle = $('#toolsToggle'), drawing = $('.drawing-tools'), canvas = $('#canvas');
    const theme = window.BilgeButtonTheme;
    if (![app,main,workspace,dialog,content,heading,done,toggle,drawing,canvas,theme].every(Boolean)) {
      console.warn('Bilge UX: v43 arayüz bağlantıları eksik; mevcut arayüz korundu.');
      return;
    }
    const moves=[], added=[], cleanups=[], panes=new Map(), controls=new Map();
    let destroyed=false, opener=null, active='drawing', controller, undecorate;
    function move(node,target) {
      if (!node) return;
      const marker=document.createComment('bilge-ux-original-position');
      node.before(marker); moves.push([node,marker]); target.append(node);
    }
    function element(tag,className,text) {
      const node=document.createElement(tag);
      if(className)node.className=className;
      if(text!==undefined)node.textContent=text;
      return node;
    }
    function listen(node,event,handler) {
      node.addEventListener(event,handler);
      cleanups.push(()=>node.removeEventListener(event,handler));
    }
    function restore() {
      if(destroyed)return;
      destroyed=true;
      cleanups.reverse().forEach(fn=>fn());
      undecorate?.();
      for(const [node,marker] of moves.reverse()) {if(marker.parentNode)marker.replaceWith(node);}
      added.reverse().forEach(node=>node.remove());
      controller?.destroy();
      document.documentElement.classList.remove('bd-ux-enabled');
      delete window.BilgeUX;
    }
    try {
      const tasks=[['drawing','Çizim'],['insert','Ekle'],['study','Çalışma'],['page','Sayfa'],['files','Dosya ve yedek'],['settings','Ayarlar']];
      const nav=element('nav','ux-menu');nav.setAttribute('aria-label','Defter işlemleri');main.before(nav);added.push(nav);
      const tabs=element('div','ux-dialog-nav');tabs.setAttribute('role','group');tabs.setAttribute('aria-label','Araç kategorileri');heading.after(tabs);added.push(tabs);
      const footer=element('div','ux-dialog-footer');dialog.append(footer);added.push(footer);move(done,footer);
      const originals=Array.from(content.children);
      function select(key) {
        if(!panes.has(key))return;
        active=key;
        for(const [id,pane] of panes)pane.hidden=id!==key;
        for(const [id,buttons] of controls)buttons.forEach(b=>b.setAttribute('aria-pressed',String(id===key)));
        content.scrollTop=0;
      }
      function open(key,button) {
        if(button?.disabled)return;
        opener=button;select(key);
        // Preserve the real v43 open handler (drawing finalisation / control refresh).
        if(!dialog.open)toggle.click();
        if(dialog.open)controls.get(key)?.[1]?.focus();
      }
      for(const [key,label] of tasks) {
        const pane=element('section','ux-pane');pane.id='ux-pane-'+key;pane.setAttribute('aria-label',label);content.append(pane);added.push(pane);panes.set(key,pane);
        const outside=element('button','btn',label),inside=element('button','btn',label);
        for(const b of [outside,inside]){b.type='button';b.dataset.uxTask=key;b.setAttribute('aria-controls',pane.id);}
        outside.setAttribute('aria-haspopup','dialog');nav.append(outside);tabs.append(inside);controls.set(key,[outside,inside]);
        listen(outside,'click',()=>open(key,outside));listen(inside,'click',()=>select(key));
      }
      // Original node identity and event handlers survive the move.
      const groups=Array.from(content.querySelectorAll('.action-group'));
      const route={textAdd:'insert',imageAdd:'insert',cameraAdd:'insert',pdfOpen:'insert',mediaEdit:'page',plannerOpen:'study',dictOpen:'study',ocrOpen:'study',searchBtn:'study',undo:'page',clearPage:'page',scrollToTop:'page',pdfExportOpen:'files',exportBtn:'files',importBtn:'files',restorePrevious:'files',pwaOpen:'settings'};
      for(const group of groups) {
        const first=group.querySelector('button[id]');
        move(group,panes.get(route[first?.id]||'files'));
      }
      // Mixed groups are split without duplicating commands or file inputs.
      for(const [id,key] of Object.entries(route)) {
        const node=document.getElementById(id);
        if(node && !panes.get(key).contains(node))move(node,panes.get(key));
      }
      for(const node of originals) {
        if(node===done || panes.has(node.id))continue;
        if(node.parentElement!==content)continue;
        const key=node.querySelector('#drawingTitle,#width')?'drawing':
          node.querySelector('#paperColor,#paperPatternTitle')?'page':
          node.id==='appearanceSection'||node.matches('.palm-control')?'settings':
          node.querySelector('#importFile,.tool-actions')?'files':'settings';
        move(node,panes.get(key));
      }
      const warning=element('p','ux-help','Yerel geri dönüş kopyası bağımsız yedek değildir. JSON yedeğini ayrıca sakla.');panes.get('files').append(warning);added.push(warning);
      const destructive=$('#clearPage');
      if(destructive) {
        const zone=element('div','ux-danger-zone');panes.get('page').append(zone);added.push(zone);
        zone.append(element('p','ux-help','Sayfa içeriğini temizleme'));move(destructive,zone);
        // Keep the application's existing confirmation and undo behaviour.
      }
      const bar=element('div','ux-writing-bar');bar.setAttribute('role','group');bar.setAttribute('aria-label','Yazma araçları');workspace.append(bar);added.push(bar);
      move(drawing,bar);move($('#quickUndo'),bar);move($('#eraserSizeToggle'),bar);move(toggle,bar);
      for(const b of drawing.querySelectorAll('button[data-tool]')) {
        const label=element('span','ux-tool-label',({pen:'Kalem',marker:'Vurgula',eraser:'Silgi'})[b.dataset.tool]||b.title);
        b.append(label);added.push(label);
      }
      // Page search filters rendered titles only. It never deletes/reorders notes.
      const pages=$('#pages');
      if(pages) {
        const label=element('label','ux-page-search','Sayfalarda ara');
        const search=element('input');search.type='search';search.placeholder='Sayfa adı';search.setAttribute('aria-label','Sayfa adına göre filtrele');label.append(search);pages.before(label);added.push(label);
        const previousHidden=new Map();
        function filter(){
          const query=search.value.trim().toLocaleLowerCase('tr-TR');
          for(const item of pages.children){
            if(!previousHidden.has(item))previousHidden.set(item,item.hidden);
            item.hidden=previousHidden.get(item)||!(item.querySelector('button')?.textContent||item.textContent).toLocaleLowerCase('tr-TR').includes(query);
          }
          for(const item of previousHidden.keys())if(!pages.contains(item))previousHidden.delete(item);
        }
        listen(search,'input',filter);
        const observer=new MutationObserver(filter);observer.observe(pages,{childList:true,subtree:true,characterData:true});
        cleanups.push(()=>{observer.disconnect();for(const [node,hidden] of previousHidden)node.hidden=hidden;});
      }
      controller=theme.createController({target:document.documentElement});
      const settings=document.createElement('bilge-button-theme-settings');settings.id='buttonThemeSection';settings.controller=controller;panes.get('settings').append(settings);added.push(settings);
      undecorate=theme.decorateButtons(document);
      listen(dialog,'close',()=>{controller.flush();if(opener?.isConnected&&!document.querySelector('dialog[open]'))opener.focus();opener=null;});
      select(active);
      document.documentElement.classList.add('bd-ux-enabled');
      window.BilgeUX=Object.freeze({open,controller,destroy:restore});
      if(canvas!==$('#canvas'))throw Error('Canvas identity changed');
    } catch(error) {restore();console.error('Bilge UX geri alındı; not verisi değiştirilmedi.',error);}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
