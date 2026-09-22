/**
 * Bilge Defter — bağımsız buton teması, 1.0.0.
 * Yalnız tercih anahtarını ve --bd-btn-* değişkenlerini yönetir.
 * Defter/IndexedDB, mürekkep, kâğıt, çerçeve ve yedek verilerine erişmez.
 * Kontrast: W3C WCAG 2.2, sRGB bağıl parlaklık, yuvarlanmadan >= 4.5.
 */
(function (global) {
  'use strict';
  const VERSION = 1;
  const ROLES = Object.freeze(['primary', 'secondary', 'danger']);
  const LABELS = Object.freeze({primary:'Birincil buton', secondary:'İkincil buton', danger:'Uyarı / silme butonu'});
  const MIN_CONTRAST = 4.5;
  const KEY = 'bilge-defter-button-theme-v1';
  const clone = value => JSON.parse(JSON.stringify(value));
  const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const isHex = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
  const DEFAULT = Object.freeze({version:VERSION, autoText:true,
    primary:Object.freeze({bg:'#255f50', text:'#ffffff'}),
    secondary:Object.freeze({bg:'#edf4f0', text:'#173b36'}),
    danger:Object.freeze({bg:'#fcece8', text:'#9b272d'})});
  const PRESETS = Object.freeze([
    {id:'orman',name:'Orman',primary:'#255f50',secondary:'#edf4f0',danger:'#fcece8'},
    {id:'gece',name:'Gece',primary:'#243b6b',secondary:'#edf1fa',danger:'#fcece8'},
    {id:'bilge',name:'Bilge mavi',primary:'#1763a6',secondary:'#eaf3fc',danger:'#fcece8'},
    {id:'murdum',name:'Mürdüm',primary:'#69407d',secondary:'#f2ecf6',danger:'#fcece8'},
    {id:'kehribar',name:'Kehribar',primary:'#ffcf70',secondary:'#fff5e3',danger:'#fcece8'},
    {id:'grafit',name:'Grafit',primary:'#434c56',secondary:'#edf0f3',danger:'#fcece8'}
  ].map(Object.freeze));
  function validateTheme(value) {
    if (!isObject(value) || value.version !== VERSION || typeof value.autoText !== 'boolean') {
      throw new TypeError('Geçersiz buton teması sürümü veya yapısı.');
    }
    const safe = {version:VERSION, autoText:value.autoText};
    for (const role of ROLES) {
      if (!isObject(value[role]) || !isHex(value[role].bg) || !isHex(value[role].text)) {
        throw new TypeError('Renkler #RRGGBB biçiminde olmalı.');
      }
      safe[role] = {bg:value[role].bg.toLowerCase(), text:value[role].text.toLowerCase()};
    }
    return safe; // Bilinmeyen alanlar taşınmaz; hiçbir veri CSS olarak yorumlanmaz.
  }
  function decode(raw) {
    if (raw === null || raw === undefined) return {theme:clone(DEFAULT), status:'default'};
    if (typeof raw !== 'string' || raw.length > 8192) return {theme:clone(DEFAULT), status:'invalid'};
    try { return {theme:validateTheme(JSON.parse(raw)), status:'loaded'}; }
    catch { return {theme:clone(DEFAULT), status:'invalid'}; }
  }
  function luminance(hex) {
    if (!isHex(hex)) throw new TypeError('Geçersiz renk.');
    const linear = [1,3,5].map(i => parseInt(hex.slice(i,i+2),16)/255)
      .map(c => c <= 0.04045 ? c/12.92 : ((c+0.055)/1.055)**2.4);
    return linear[0]*0.2126 + linear[1]*0.7152 + linear[2]*0.0722;
  }
  function contrast(a,b) {
    const x=luminance(a),y=luminance(b);
    return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);
  }
  function autoInk(bg) {
    // Siyah veya beyazdan yüksek kontrastlı olanı seçmek her sRGB zemini kapsar.
    return contrast(bg,'#000000') >= contrast(bg,'#ffffff') ? '#000000' : '#ffffff';
  }
  function mix(a,b,amount) {
    return '#'+[1,3,5].map(i => Math.round(parseInt(a.slice(i,i+2),16)*(1-amount)
      +parseInt(b.slice(i,i+2),16)*amount).toString(16).padStart(2,'0')).join('');
  }
  function borderFor(bg,text,surface='#fffdf8') {
    if (contrast(bg,surface) >= 3) return bg;
    // Açık butonun kâğıt renkli panelde sınırı kaybolmasın.
    for (let step=1; step<=20; step++) {
      const candidate=mix(bg,text,step/20);
      if (contrast(candidate,surface)>=3) return candidate;
    }
    return autoInk(surface);
  }
  function derive(value) {
    const theme=validateTheme(value), styles={}, roles={};
    for (const role of ROLES) {
      const cfg=theme[role], corrected=!theme.autoText && contrast(cfg.bg,cfg.text)<MIN_CONTRAST;
      const text=theme.autoText || corrected ? autoInk(cfg.bg) : cfg.text;
      const away=luminance(cfg.bg)>luminance(text)?'#ffffff':'#000000';
      const hover=mix(cfg.bg,away,0.07), active=mix(cfg.bg,away,0.13);
      roles[role]={bg:cfg.bg,text,hover,active,border:borderFor(cfg.bg,text),
        ratio:contrast(cfg.bg,text), corrected};
      for (const property of ['bg','text','hover','active','border']) {
        styles[`--bd-btn-${role}-${property}`]=roles[role][property];
      }
    }
    return {theme,styles,roles};
  }
  function fromPreset(id) {
    const preset=PRESETS.find(p=>p.id===id);
    if (!preset) throw new TypeError('Bilinmeyen hazır tema.');
    const theme=clone(DEFAULT);
    for (const role of ROLES) theme[role].bg=preset[role];
    return theme;
  }
  function presetId(theme) {
    if (!theme.autoText) return null;
    return PRESETS.find(p=>ROLES.every(r=>p[r]===theme[r].bg))?.id || null;
  }
  /**
   * Küçük görünüm tercihi için localStorage yeterlidir. Erişim engelliyse
   * oturum içi tercih uygulanır; kaydedildi mesajı verilmez.
   * storageParam yalnız test veya başka tercih depolayıcısı içindir.
   */
  function createController({target, storageKey=KEY, storage:storageParam}={}) {
    if (!target?.style) throw new TypeError('Tema hedefi bir HTML elementi olmalı.');
    let storage, theme=clone(DEFAULT), state='default', pending=false, timer=null, destroyed=false;
    const listeners=new Set(), targets=new Map();
    function addTarget(element) {
      if (!element?.style || targets.has(element)) return;
      const before={};for (const key of Object.keys(derive(DEFAULT).styles)) before[key]=[element.style.getPropertyValue(key),element.style.getPropertyPriority(key)];
      targets.set(element,before); applyTo(element);
    }
    function applyTo(element) {for(const [key,value] of Object.entries(derive(theme).styles))element.style.setProperty(key,value);}
    try {
      storage=storageParam===undefined ? global.localStorage : storageParam;
      if (!storage) throw new Error('Depolama kullanılamıyor.');
      const loaded=decode(storage.getItem(storageKey));theme=loaded.theme;state=loaded.status;
    } catch {storage=null;state='unavailable';}
    addTarget(target);
    function snapshot() {return {...derive(theme), storage:state, pending, preset:presetId(theme)};}
    function emit() {const next=snapshot();for(const listener of listeners)listener(next);}
    function apply() {for(const element of targets.keys())applyTo(element);}
    function flush() {
      clearTimeout(timer);timer=null;
      if (destroyed || !pending) return state==='saved';
      pending=false;
      try {if(!storage)throw new Error('Depolama yok.');storage.setItem(storageKey,JSON.stringify(theme));state='saved';}
      catch {state='error';}
      emit();return state==='saved';
    }
    function setTheme(value,{immediate=false}={}) {
      if (destroyed) return false;
      theme=validateTheme(value);apply();pending=true;state='pending';clearTimeout(timer);
      if (immediate) flush(); else {timer=setTimeout(flush,250);emit();}
      return true;
    }
    function setColor(role,property,value,{immediate=false}={}) {
      if (!ROLES.includes(role) || !['bg','text'].includes(property) || !isHex(value)) return false;
      const next=clone(theme);next[role][property]=value;return setTheme(next,{immediate});
    }
    function onStorage(event) {
      if (destroyed || (event.key!==storageKey && event.key!==null)) return;
      if (event.storageArea && storage && event.storageArea!==storage) return;
      // Yerel tamamlanmamış tercih daha yeni kabul edilir; sekme olayı onu ezmez.
      if (pending) return;
      const value=decode(event.key===null ? null : event.newValue);
      theme=value.theme;state=value.status==='loaded'?'external':value.status;apply();emit();
    }
    function onVisibility(){if(global.document?.visibilityState==='hidden')flush();}
    global.addEventListener?.('storage',onStorage);
    global.addEventListener?.('pagehide',flush);
    global.document?.addEventListener('visibilitychange',onVisibility);
    return Object.freeze({
      getSnapshot:snapshot, setTheme,setColor,flush,addTarget,
      setAutoText(value){if(typeof value!=='boolean')return false;const next=clone(theme);next.autoText=value;return setTheme(next,{immediate:true});},
      usePreset(id){return setTheme(fromPreset(id),{immediate:true});},
      reset(){return setTheme(clone(DEFAULT),{immediate:true});},
      subscribe(fn){if(typeof fn!=='function')throw new TypeError('Dinleyici bir fonksiyon olmalı.');listeners.add(fn);fn(snapshot());return()=>listeners.delete(fn);},
      destroy(){
        flush();destroyed=true;clearTimeout(timer);listeners.clear();
        global.removeEventListener?.('storage',onStorage);global.removeEventListener?.('pagehide',flush);
        global.document?.removeEventListener('visibilitychange',onVisibility);
        for(const [element,before] of targets)for(const [key,[value,priority]] of Object.entries(before)){
          if(value)element.style.setProperty(key,value,priority);else element.style.removeProperty(key);
        }targets.clear();
      }
    });
  }
  const SELECTOR='button.btn,button.button,button.action,button.nav-button,button.tool,button.icon-button,button.ink-button,.zoom button,button.bd-btn';
  function decorateButtons(root) {
    const touched=new Map();
    function update(button) {
      if (button.closest('[data-bd-theme-exclude]') || !button.matches(SELECTOR))return;
      if (!touched.has(button))touched.set(button,{hasClass:button.classList.contains('bd-btn'),role:button.getAttribute('data-bd-button-role')});
      const fixed=button.getAttribute('data-bd-variant');
      const role=ROLES.includes(fixed)?fixed:button.classList.contains('danger')?'danger':
        button.classList.contains('primary')||button.classList.contains('primary-action')||button.classList.contains('active')||button.getAttribute('aria-pressed')==='true'||button.getAttribute('aria-expanded')==='true'?'primary':'secondary';
      if(!button.classList.contains('bd-btn'))button.classList.add('bd-btn');
      if(button.getAttribute('data-bd-button-role')!==role)button.setAttribute('data-bd-button-role',role);
    }
    function scan(node) {if(node.nodeType!==1 && node.nodeType!==9 && node.nodeType!==11)return;if(node.matches?.(SELECTOR))update(node);node.querySelectorAll?.(SELECTOR).forEach(update);}
    scan(root);
    const observer=new MutationObserver(records=>{
      for (const record of records) {
        if(record.type==='attributes')update(record.target);
        else record.addedNodes.forEach(scan);
      }
      // Removed nodes must not be retained for the lifetime of the editor.
      for(const node of touched.keys())if(!root.contains(node))touched.delete(node);
    });
    observer.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['class','aria-pressed','aria-expanded','data-bd-variant']});
    return ()=>{observer.disconnect();for(const [button,old] of touched){if(!old.hasClass)button.classList.remove('bd-btn');if(old.role===null)button.removeAttribute('data-bd-button-role');else button.setAttribute('data-bd-button-role',old.role);}touched.clear();};
  }
  const api=Object.freeze({VERSION,KEY,ROLES,LABELS,MIN_CONTRAST,DEFAULT,PRESETS,isHex,validateTheme,decode,luminance,contrast,autoInk,derive,fromPreset,presetId,createController,decorateButtons});
  if(typeof module==='object' && module.exports)module.exports=api;
  if(!global.document)return;
  global.BilgeButtonTheme=api;
  if(global.customElements.get('bilge-button-theme-settings'))return;
  let sequence=0;
  class ButtonThemeSettings extends HTMLElement {
    constructor(){super();this._controller=null;this._unsubscribe=null;this._id='bdt-'+(++sequence);}
    set controller(value){this._unsubscribe?.();this._unsubscribe=null;this._controller=value;if(this.isConnected)this._mount();}
    get controller(){return this._controller;}
    connectedCallback(){this._mount();}
    disconnectedCallback(){this._unsubscribe?.();this._unsubscribe=null;this._controller?.flush();}
    _mount(){
      if(!this._controller || this._unsubscribe)return;
      const id=this._id;
      this.classList.add('bdt-settings');
      this.innerHTML=`<section aria-labelledby="${id}-title">
        <div class="bdt-title"><div><p class="bdt-eyebrow">KİŞİSEL GÖRÜNÜM</p><h3 id="${id}-title">Buton teması</h3></div><span class="bdt-tag" data-bdt-theme-name></span></div>
        <p class="bdt-help">Butonlarını renklendir. Kâğıt, mürekkep ve dış çerçeve değişmez.</p>
        <div class="bdt-presets" role="group" aria-label="Hazır buton temaları" data-bdt-presets></div>
        <div class="bdt-colors" data-bdt-colors></div>
        <label class="bdt-auto" for="${id}-auto"><span><strong>Otomatik yazı rengi</strong><small>Zemine göre okunaklı siyah veya beyaz yazı.</small></span><input id="${id}-auto" type="checkbox" data-bdt-auto></label>
        <fieldset class="bdt-manual" data-bdt-manual hidden><legend>Özel yazı renkleri</legend><div data-bdt-text-colors></div><p class="bdt-help">4,5:1 altındaki seçimler uygulanmaz; okunaklı renk kullanılır.</p></fieldset>
        <p class="bdt-warning" data-bdt-warning role="status" hidden></p>
        <div class="bdt-preview" role="group" aria-label="İşlem yapmayan buton önizlemeleri">
          <span class="bdt-eyebrow">CANLI ÖNİZLEME · İŞLEM YAPMAZ</span>
          <button type="button" class="bd-btn primary" data-bd-variant="primary" data-bd-button-role="primary" aria-label="Yazmaya dön butonu önizlemesi">Yazmaya dön <span aria-hidden="true">↗</span></button>
          <div class="bdt-preview-pair"><button type="button" class="bd-btn" data-bd-variant="secondary" data-bd-button-role="secondary" aria-label="Yedek al butonu önizlemesi">Yedek al</button><button type="button" class="bd-btn danger" data-bd-variant="danger" data-bd-button-role="danger" aria-label="Sayfayı temizle butonu önizlemesi"><span aria-hidden="true">!</span> Sayfayı temizle</button></div>
        </div>
        <div class="bdt-bottom"><button type="button" class="bd-btn" data-bd-variant="secondary" data-bd-button-role="secondary" data-bdt-reset>Varsayılan renkler</button><p data-bdt-storage role="status" aria-live="polite" aria-atomic="true"></p></div>
      </section>`;
      const presetBox=this.querySelector('[data-bdt-presets]');
      for(const preset of PRESETS){
        const button=document.createElement('button');button.type='button';button.className='bdt-preset';button.dataset.bdtPreset=preset.id;button.setAttribute('aria-pressed','false');
        const swatch=document.createElement('span');swatch.className='bdt-swatch';swatch.style.backgroundColor=preset.primary;swatch.setAttribute('aria-hidden','true');
        const name=document.createElement('span');name.textContent=preset.name;button.append(swatch,name);presetBox.append(button);
      }
      for(const role of ROLES){
        for(const property of ['bg','text']){
          const label=document.createElement('label');label.className='bdt-color-row';
          const group=document.createElement('span');const name=document.createElement('strong');name.textContent=LABELS[role]+(property==='text'?' yazısı':'');group.append(name);
          if(property==='bg'){const ratio=document.createElement('small');ratio.dataset.bdtRatio=role;group.append(ratio);}
          const input=document.createElement('input');input.type='color';input.id=`${id}-${role}-${property}`;input.dataset.bdtRole=role;input.dataset.bdtProperty=property;input.setAttribute('aria-label',name.textContent);
          label.htmlFor=input.id;label.append(group,input);this.querySelector(property==='bg'?'[data-bdt-colors]':'[data-bdt-text-colors]').append(label);
        }
      }
      this.onclick=event=>{
        const button=event.target.closest('button');if(!button)return;
        if(button.dataset.bdtPreset){this._controller.usePreset(button.dataset.bdtPreset);return;}
        if(button.hasAttribute('data-bdt-reset'))this._controller.reset();
      };
      this.oninput=event=>{const input=event.target;if(input.matches('[data-bdt-role]'))this._controller.setColor(input.dataset.bdtRole,input.dataset.bdtProperty,input.value);};
      this.onchange=event=>{const input=event.target;if(input.hasAttribute('data-bdt-auto'))this._controller.setAutoText(input.checked);else if(input.matches('[data-bdt-role]'))this._controller.flush();};
      this._unsubscribe=this._controller.subscribe(state=>this._render(state));
    }
    _render(state){
      this.querySelector('[data-bdt-theme-name]').textContent=PRESETS.find(p=>p.id===state.preset)?.name || 'Özel';
      this.querySelectorAll('[data-bdt-preset]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.bdtPreset===state.preset)));
      for(const input of this.querySelectorAll('[data-bdt-role]'))input.value=state.theme[input.dataset.bdtRole][input.dataset.bdtProperty];
      this.querySelector('[data-bdt-auto]').checked=state.theme.autoText;
      const manual=this.querySelector('[data-bdt-manual]');manual.hidden=state.theme.autoText;manual.disabled=state.theme.autoText;
      for(const role of ROLES){const node=this.querySelector(`[data-bdt-ratio="${role}"]`);node.textContent='Yazı kontrastı '+state.roles[role].ratio.toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2})+':1';}
      const corrected=ROLES.filter(r=>state.roles[r].corrected);const warning=this.querySelector('[data-bdt-warning]');warning.hidden=!corrected.length;
      warning.textContent=corrected.length?corrected.map(r=>LABELS[r]).join(', ')+': seçtiğin yazı rengi düşük kontrastlı. Seçimin saklandı; ekranda okunaklı renk kullanılıyor.':'';
      const messages={default:'Tercih yalnız bu tarayıcıda saklanır.',loaded:'Kayıtlı buton renklerin yüklendi.',saved:'Buton renkleri bu tarayıcıda kaydedildi.',pending:'Renk uygulandı · tercih kaydediliyor…',external:'Diğer sekmedeki buton tercihi uygulandı.',invalid:'Kayıtlı tema okunamadı; güvenli varsayılanlar kullanılıyor.',unavailable:'Bu oturumda uygulanır. Tarayıcı tercih kaydına izin vermiyor.',error:'Renk uygulandı ama kaydedilemedi. Notların etkilenmedi.'};
      const status=this.querySelector('[data-bdt-storage]');status.textContent=messages[state.storage]||messages.default;status.dataset.kind=state.storage;
    }
  }
  global.customElements.define('bilge-button-theme-settings',ButtonThemeSettings);
})(globalThis);
