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

/**
 * Bilge Defter UI v2 — framework bağımsız arayüz katmanı.
 * Çizim yapmaz, notları saklamaz, v37 şemasını dönüştürmez.
 * Yan etkiler yalnız connect({commands, getState, subscribe}) ile verilen işlevlerde olur.
 * build.py bu dosyadaki STYLE_INJECT işaretini derleme sırasında CSS ile değiştirir.
 */
(() => {
  'use strict';
  const STYLES = "/* Bilge Defter UI v2. Bu stiller Shadow DOM ile uygulamanın stillerinden ayrılır. */\n:host {--bd-ink:#183c35;--bd-muted:#586d67;--bd-line:#dce6e1;--bd-accent:#255f50;--bd-soft:#eaf2ed;--bd-paper:#fffef9;--bd-frame:#343b41;--bd-frame-ink:#fff;--bd-danger:#a33436;--bd-radius:16px;display:block;height:100%;min-height:260px;color:var(--bd-ink);font:15px/1.5 system-ui,-apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif;color-scheme:light;isolation:isolate;}\n*,*::before,*::after{box-sizing:border-box} [hidden]{display:none!important} button,input,select{font:inherit} button,input,select{outline-offset:3px} button{cursor:pointer;color:inherit} button:disabled{cursor:not-allowed;opacity:.46} button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,[tabindex]:focus-visible{outline:3px solid #156fbe;outline-offset:3px} button:focus:not(:focus-visible){outline:none} svg{width:22px;height:22px;display:block;flex:none} .sr-only{position:absolute!important;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}\n.shell{height:100%;display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:auto auto auto auto minmax(0,1fr) auto;background:#eef2ef;overflow:hidden}.brandbar{display:flex;align-items:center;gap:16px;min-height:66px;padding:8px 22px;background:var(--bd-frame);color:var(--bd-frame-ink)}.brand{display:flex;align-items:center;gap:10px;white-space:nowrap;font-weight:700;font-size:18px;letter-spacing:-.45px}.brand svg{width:31px;height:31px}.build-label{font-size:10px;font-weight:500;border:1px solid currentColor;border-radius:20px;padding:3px 7px;opacity:.8;letter-spacing:0}.crumbs{display:flex;align-items:center;gap:10px;flex:1;min-width:0;justify-content:center}.book-title{font-size:12px;opacity:.8;max-width:22vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.page-title{background:none;border:none;color:inherit;font-size:14px;font-weight:650;min-height:44px;max-width:30vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0 6px;text-align:left}.divider{opacity:.5}.icon-button{display:inline-flex;align-items:center;justify-content:center;min-width:48px;min-height:48px;border-radius:12px;border:1px solid var(--bd-line);background:white;padding:10px}.brandbar .icon-button{background:#ffffff12;border-color:#ffffff30;color:inherit}.brandbar .icon-button:hover{background:#ffffff20}.navrow{display:flex;gap:5px;align-items:center;justify-content:space-between;background:#fff;padding:7px 20px;border-bottom:1px solid var(--bd-line)}.navgroup{display:flex;gap:4px;align-items:center}.nav-button{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:46px;padding:8px 14px;background:transparent;border:1px solid transparent;border-radius:11px;font-size:13px;font-weight:600;white-space:nowrap}.nav-button:hover,.nav-button[aria-expanded=true]{background:var(--bd-soft);border-color:var(--bd-line)}.nav-button svg{width:19px;height:19px}.nav-button.primary-action{background:var(--bd-accent);color:#fff}.nav-button.primary-action:hover{background:#194b3e}.mobile-label{display:none}.save-badge{display:flex;gap:7px;align-items:center;white-space:nowrap;font-size:11px;min-height:34px;padding:3px 0}.save-dot{width:7px;height:7px;background:#c5cbd0;border-radius:50%;display:inline-block;flex:none}.save-badge[data-kind=saved] .save-dot{background:#8ae6ad}.save-badge[data-kind=pending] .save-dot{background:#f4cc6b}.save-badge[data-kind=error] .save-dot{background:#ff9e97}\n.toolbar{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:9px 22px;background:#f9fbf9;border-bottom:1px solid var(--bd-line)}.tools{display:flex;align-items:center;gap:5px}.tool{display:flex;align-items:center;justify-content:center;gap:8px;min-width:72px;min-height:48px;border:1px solid transparent;background:transparent;border-radius:12px;padding:7px 12px;font-size:12px;font-weight:600}.tool:hover{background:var(--bd-soft)}.tool[aria-pressed=true]{background:#e2eee6;border:1px solid #255f50;box-shadow:inset 0 0 0 1px #255f50}.tool[data-v2-tool=marker][aria-pressed=true]{background:#faf1d5}.tool[data-v2-tool=eraser][aria-pressed=true]{background:#f7e6e3}.tool.history{min-width:48px;width:48px;padding:10px}.tool.history .tool-label{display:none}.tool[data-command=\"history.undo\"]{margin-left:10px;border-left:1px solid var(--bd-line)}.inkquick{display:flex;align-items:center;gap:8px}.ink-button{display:flex;align-items:center;justify-content:center;gap:9px;min-height:48px;border-radius:12px;border:1px solid var(--bd-line);background:white;padding:8px 12px;font-size:12px;white-space:nowrap}.ink-preview{width:19px;height:19px;border-radius:50%;border:2px solid white;box-shadow:0 0 0 1px #b5c9bd;background:var(--bd-ink)}.ink-button svg{width:15px;height:15px}.hint{font-size:11px;color:var(--bd-muted)}.workspace{min-width:0;min-height:0;position:relative;overflow:hidden;padding:0;background:#edf1ee}.editor-slot{display:block;width:100%;height:100%;min-height:0}.editor-slot ::slotted(*){height:100%!important;width:100%!important;display:grid!important;margin:0;min-height:0!important}.footer{display:flex;align-items:center;justify-content:space-between;gap:10px;background:#fff;padding:3px 22px;border-top:1px solid var(--bd-line);min-height:48px;font-size:11px;color:var(--bd-muted)}.footer-start{display:flex;align-items:center;gap:10px}.mode-dot{width:7px;height:7px;background:#397b60;border-radius:50%}.zoom{display:flex;align-items:center;gap:1px}.zoom button{height:42px;min-width:42px;padding:5px;border:0;background:transparent;border-radius:10px;font-size:12px}.zoom button:hover{background:var(--bd-soft)}.zoom svg{width:18px;height:18px;margin:auto}.footer-help{display:flex;align-items:center;gap:6px}.footer-help svg{width:14px;height:14px}.alert{display:flex;gap:12px;align-items:center;background:#fff1e7;border-bottom:1px solid #e1ba94;padding:10px 20px;font-size:12px;color:#633f1c}.alert.error{background:#fff0ec;border-color:#d6a8a2;color:#702c2b}.alert-text{flex:1;min-width:0;overflow-wrap:anywhere}.alert button{min-height:40px;min-width:40px;background:white;border:1px solid #d5b8a4;border-radius:9px;padding:6px 10px;font-size:12px}.busy-indicator{position:absolute;bottom:14px;left:50%;transform:translateX(-50%);z-index:6;display:flex;gap:10px;align-items:center;padding:10px 16px;border:1px solid var(--bd-line);border-radius:30px;background:#fff;box-shadow:0 8px 30px #183c351a;font-size:13px}.busy-indicator svg{animation:spin 1.2s linear infinite}.toast{position:absolute;left:50%;bottom:60px;transform:translateX(-50%);padding:11px 18px;background:#213e35;color:#fff;border-radius:12px;max-width:min(580px,92%);z-index:40;box-shadow:0 6px 30px #0002;font-size:13px;pointer-events:none;text-align:center}\n/* Native dialogs: header + scrollable content + reachable footer. */\ndialog{padding:0;border:1px solid var(--bd-line);border-radius:20px;width:min(460px,calc(100vw - 28px));max-width:none;max-height:calc(100dvh - 32px);background:var(--bd-paper);color:var(--bd-ink);box-shadow:0 20px 100px #10271f33;overflow:hidden;font:inherit}dialog[open]{display:grid;grid-template-rows:auto minmax(0,1fr) auto}dialog::backdrop{background:#172d294d;backdrop-filter:blur(2px)}.panel-header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:20px 22px 15px;border-bottom:1px solid var(--bd-line);background:var(--bd-paper)}.panel-header h2{font-size:21px;line-height:1.25;letter-spacing:-.5px;margin:3px 0 0;font-weight:700}.eyebrow{text-transform:uppercase;font-size:10px;font-weight:650;letter-spacing:1.6px;color:var(--bd-muted)}.panel-body{padding:20px 22px;overflow-y:auto;overscroll-behavior:contain;scrollbar-gutter:stable;min-height:0}.panel-body h3{font-size:12px;letter-spacing:.3px;margin:22px 0 10px}.panel-body h3:first-child{margin-top:0}.panel-footer{padding:12px 22px 16px;border-top:1px solid var(--bd-line);display:flex;gap:10px;background:var(--bd-paper);padding-bottom:max(16px,env(safe-area-inset-bottom))}.panel-footer button{flex:1}.button{display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:48px;padding:10px 16px;border-radius:12px;border:1px solid var(--bd-line);background:#fff;font-weight:600;font-size:13px}.button.primary{background:var(--bd-accent);border-color:var(--bd-accent);color:white}.button.subtle{background:var(--bd-soft);border-color:transparent}.button.danger{color:var(--bd-danger);background:#fbebe7;border-color:#e6c8c3}.full{width:100%}.helper{font-size:12px;line-height:1.65;color:var(--bd-muted);margin:12px 0 0}.helper strong{color:var(--bd-ink)}.warning{padding:12px 14px;border-radius:12px;background:#f7f0dd;color:#685323}.action-list{display:flex;flex-direction:column;gap:8px}.action{display:grid;grid-template-columns:44px minmax(0,1fr) 16px;gap:10px;text-align:left;align-items:center;width:100%;min-height:70px;padding:11px 12px;border-radius:14px;background:#fff;border:1px solid var(--bd-line);line-height:1.35}.action:not(:disabled):hover{background:var(--bd-soft);border-color:#88aa98}.action-icon{display:flex;align-items:center;justify-content:center;width:44px;height:44px;background:#eef4ef;border-radius:12px}.action strong{display:block;font-size:13px;font-weight:650}.action small{display:block;font-size:11px;color:var(--bd-muted);margin-top:5px}.action .chevron{width:15px;height:15px;color:#6a8377}.action:disabled{opacity:1;background:#f6f7f5;color:#687570}.action:disabled .action-icon{background:#ecefeb;color:#7d8984}.action:disabled small{color:#6b766f}.action.danger{margin-top:12px;border-color:#dfbbb4;background:#fff5f2;color:var(--bd-danger)}.action.danger .action-icon{background:#f9e5de;color:var(--bd-danger)}.action.danger small{color:#8a5048}.section-line{height:1px;background:var(--bd-line);margin:18px 0}\n.swatches{display:flex;gap:8px;flex-wrap:wrap}.swatch{width:48px;height:48px;min-width:48px;border:1px solid #d8e2da;border-radius:13px;background:#fff;padding:8px;position:relative}.swatch span{display:block;width:100%;height:100%;border-radius:50%;border:1px solid #0002}.swatch[aria-pressed=true]{border:2px solid var(--bd-accent);padding:7px;box-shadow:0 0 0 2px #255f5012}.swatch[aria-pressed=true]::after{content:\"✓\";position:absolute;right:-2px;bottom:-2px;background:var(--bd-accent);color:white;border:2px solid white;width:19px;height:19px;border-radius:50%;font-size:11px;text-align:center;line-height:15px}.custom-color{display:flex;align-items:center;justify-content:space-between;font-size:12px;min-height:52px;gap:12px}.custom-color input{height:44px;width:54px;padding:3px;border:1px solid var(--bd-line);border-radius:9px;background:white}.width-options{display:flex;gap:6px}.width-option{flex:1;min-width:0;height:70px;display:flex;flex-direction:column;gap:13px;align-items:center;justify-content:center;border-radius:12px;background:white;border:1px solid var(--bd-line);font-size:11px}.width-option[aria-pressed=true],.paper-option[aria-pressed=true]{border:2px solid var(--bd-accent);background:var(--bd-soft)}.width-option span{display:block;width:27px;background:var(--bd-ink);border-radius:12px}.range-label{display:flex;align-items:center;justify-content:space-between;gap:16px;font-size:12px;margin:20px 0 0}input[type=range]{width:100%;min-height:48px;accent-color:var(--bd-accent);cursor:pointer}.stroke-sample{height:66px;border:1px solid var(--bd-line);border-radius:12px;display:flex;align-items:center;justify-content:center;background:repeating-linear-gradient(transparent 0,transparent 22px,#dfe6dc 22px,#dfe6dc 23px)}.stroke-sample span{width:75%;height:4px;background:var(--bd-ink);border-radius:20px}.paper-options{display:grid;grid-template-columns:repeat(4,1fr);gap:7px}.paper-option{min-width:0;display:flex;align-items:center;flex-direction:column;gap:10px;min-height:96px;padding:10px 4px;border:1px solid var(--bd-line);border-radius:13px;background:white;font-size:11px}.paper-preview{width:33px;height:43px;border:1px solid #b9ccc1;border-radius:4px;background:#fffef8}.paper-preview.ruled{background:repeating-linear-gradient(#fffef8 0,#fffef8 7px,#bacabd 8px)}.paper-preview.grid{background-image:linear-gradient(#b8cdbb 1px,transparent 1px),linear-gradient(90deg,#b8cdbb 1px,transparent 1px);background-size:8px 8px}.paper-preview.dotted{background-image:radial-gradient(#9bb4a1 1px,transparent 1px);background-size:6px 6px}.toggle{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:13px 0;border-bottom:1px solid var(--bd-line);cursor:pointer}.toggle strong{font-size:13px;display:block}.toggle small{font-size:11px;color:var(--bd-muted);display:block;margin-top:4px;line-height:1.5}.toggle input{width:24px;height:24px;accent-color:var(--bd-accent);margin:12px;flex:none}.theme-options{display:grid;grid-template-columns:repeat(5,1fr);gap:6px}.theme-option{min-width:0;border:1px solid var(--bd-line);border-radius:12px;min-height:72px;display:flex;flex-direction:column;gap:8px;align-items:center;justify-content:center;background:white;font-size:10px;padding:6px 1px}.theme-option span{width:25px;height:22px;border:6px solid;border-radius:5px}.theme-option[aria-pressed=true]{outline:2px solid var(--bd-accent);outline-offset:-2px;background:var(--bd-soft)}.field-label{display:block;font-size:12px;font-weight:600;margin:14px 0 7px}.input,select{width:100%;min-height:48px;padding:11px 12px;border:1px solid #bccfc3;background:white;color:var(--bd-ink);border-radius:11px;font-size:13px}select{padding-right:24px}.two-buttons{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0}.library-stats{display:flex;align-items:center;justify-content:space-between;color:var(--bd-muted);font-size:11px;margin:18px 0 10px}.page-list{display:flex;flex-direction:column;gap:7px}.page-item{display:flex;align-items:center;gap:13px;border:1px solid var(--bd-line);border-radius:12px;background:#fff;text-align:left;padding:12px;min-height:65px;width:100%}.page-item[aria-current=page]{background:var(--bd-soft);border-color:var(--bd-accent);box-shadow:inset 3px 0 0 var(--bd-accent)}.page-thumb{width:26px;height:33px;flex:none;background:repeating-linear-gradient(white 0,white 6px,#d3dfd5 7px);border:1px solid #bac9bd;border-radius:4px}.page-item strong{display:block;font-size:13px;overflow-wrap:anywhere}.page-item small{display:block;font-size:11px;color:var(--bd-muted);margin-top:4px}.page-text{min-width:0}.empty{padding:22px 12px;text-align:center;color:var(--bd-muted);font-size:13px}.selection-bar{display:flex;align-items:center;gap:12px;padding:10px 22px;background:#e4eee7;border-bottom:1px solid #c7d8cc;font-size:12px}.selection-bar button{min-height:44px;background:#fff;border:1px solid #aec7b6;border-radius:11px;padding:7px 12px}.selection-bar span{flex:1}.selection-bar svg{width:18px;height:18px}.focus-mode .navrow{display:none}.focus-mode .brand{font-size:15px}.focus-mode .brandbar{min-height:54px}.focus-mode .brand svg{width:24px;height:24px}.focus-mode .toolbar{padding-top:5px;padding-bottom:5px}.focus-mode .footer-help,.focus-mode .build-label{display:none}.focus-exit{display:none}.focus-mode .focus-exit{display:inline-flex}\n@keyframes spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;animation:none!important;transition:none!important}}\n@media(min-width:1000px){dialog[data-panel=library]{margin:16px auto 16px 16px;width:350px;height:calc(100dvh - 32px)}dialog[data-panel=group],dialog[data-panel=settings]{margin:16px 16px 16px auto;max-height:calc(100dvh - 32px)}}\n@media(max-width:1000px){.brandbar{padding:7px 14px;gap:10px}.brand{font-size:16px}.brand svg{width:26px;height:26px}.build-label{display:none}.toolbar{padding:8px 14px;gap:8px}.tool{min-width:59px;padding:7px 9px}.hint{display:none}.navrow{padding:6px 14px}.nav-button{padding:7px 11px}.footer{padding:3px 14px}.footer-help{display:none}}\n@media(max-width:700px){.shell{grid-template-rows:auto auto auto minmax(0,1fr) auto auto}.brandbar{grid-row:1;min-height:59px;padding:6px 12px;gap:8px}.brand{font-size:14px;gap:7px}.brand svg{width:25px;height:25px}.crumbs{justify-content:flex-start;gap:5px}.book-title,.divider{display:none}.page-title{font-size:12px;max-width:28vw;padding:0 3px}.save-badge{display:none}.brandbar>.icon-button{min-width:44px;min-height:44px;padding:9px}.navrow{grid-row:2;padding:4px 7px;gap:0;min-height:57px}.navgroup{justify-content:space-between;gap:2px;width:100%}.nav-button{min-width:0;min-height:48px;padding:5px 7px;gap:4px;font-size:11px;flex:1}.nav-button svg{width:18px;height:18px}.nav-button.primary-action{padding-inline:9px}.full-label{display:none}.mobile-label{display:inline}.nav-focus{display:none}.alert{grid-row:3;padding:8px 12px;font-size:11px}.workspace{grid-row:4}.toolbar{grid-row:5;border-top:1px solid var(--bd-line);border-bottom:none;padding:6px 10px 2px;display:flex;align-items:stretch;flex-direction:column;gap:6px}.tools{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:3px}.tool{min-width:0;min-height:52px;padding:5px 1px;gap:2px;flex-direction:column;font-size:10px}.tool svg{width:21px;height:21px}.tool.history{width:auto;min-width:0;padding:5px 1px}.tool.history .tool-label{display:block}.tool[data-command=\"history.undo\"]{margin-left:0;border-left:1px solid transparent}.inkquick{justify-content:space-between}.ink-button{min-height:44px;padding:6px 10px;font-size:11px}.mobile-tool-help{display:block;font-size:10px;color:var(--bd-muted);text-align:right}.footer{grid-row:6;min-height:44px;padding:0 12px max(4px,env(safe-area-inset-bottom));font-size:10px;border-top:0}.footer-start .mode-dot{display:none}.footer-start{min-width:0}.footer-start span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.zoom button{min-height:44px;min-width:40px;font-size:11px}.toast{bottom:170px;font-size:12px}.focus-mode .navrow{display:flex}.focus-mode .toolbar{padding:6px 10px 2px}.focus-mode .brandbar{min-height:54px}.focus-exit{min-height:40px!important;min-width:40px!important}.selection-bar{padding:7px 12px;font-size:11px;position:absolute;inset:0 0 auto 0;z-index:5}.selection-bar button{min-height:44px;padding:7px}.panel-header{padding:17px 18px 12px}.panel-body{padding:17px 18px}.panel-footer{padding:10px 18px max(14px,env(safe-area-inset-bottom))}dialog{border-radius:18px;width:calc(100vw - 24px);max-height:calc(100dvh - 24px)}.panel-header h2{font-size:20px}.action{min-height:67px}.paper-options{gap:5px}.paper-option{font-size:10px}.width-options{gap:5px}}\n@media(min-width:701px){.mobile-tool-help{display:none}}\n@media(max-width:380px){.brandbar{padding-inline:8px;gap:5px}.brand{font-size:12px;gap:5px}.brand svg{width:22px;height:22px}.nav-button{padding:5px;font-size:10px;gap:3px}.nav-button svg{width:17px;height:17px}.navgroup{gap:1px}.page-title{max-width:26vw;font-size:11px}.panel-body{padding:15px}.panel-header{padding:14px 15px 10px}.panel-footer{padding-inline:15px}.swatches{gap:6px}.theme-options{gap:4px}}\n@media(max-height:520px) and (orientation:landscape){.brandbar{min-height:48px;padding-block:2px}.navrow{min-height:42px;padding-block:2px}.nav-button{min-height:40px}.toolbar{padding-block:3px}.tool{min-height:44px;flex-direction:row}.tool-label{font-size:10px}.inkquick,.footer{display:none}.panel-header{padding:9px 14px}.panel-body{padding:12px 14px}.panel-footer{padding:7px 14px}.panel-header h2{font-size:18px}.panel-footer .button{min-height:40px}}\n\n@media(min-width:701px){.brandbar{grid-row:1}.navrow{grid-row:2}.toolbar{grid-row:3}.alert{grid-row:4}.workspace{grid-row:5}.footer{grid-row:6}}\n/* Wide screens: commands and writing tools share one row, leaving more paper. */\n@media(min-width:1000px){\n .shell{grid-template-columns:minmax(470px,1fr) auto;grid-template-rows:auto auto auto minmax(0,1fr) auto}\n .brandbar{grid-column:1/-1;grid-row:1}.navrow{grid-row:2;grid-column:1;min-width:0;padding:8px 12px 8px 20px;background:#f9fbf9}\n .toolbar{grid-row:2;grid-column:2;padding:8px 20px 8px 10px;gap:12px}.nav-focus,.toolbar .hint{display:none}.tool{min-width:58px;padding:7px 8px}.nav-button{padding:8px 10px}\n .alert{grid-row:3;grid-column:1/-1}.workspace{grid-row:4;grid-column:1/-1}.footer{grid-row:5;grid-column:1/-1}\n .focus-mode .toolbar{grid-column:1/-1;justify-content:center}.focus-exit{display:inline-flex}\n}\n@media(max-width:380px){.tools{gap:2px}}\n@media(forced-colors:active){.tool[aria-pressed=true],.swatch[aria-pressed=true],.paper-option[aria-pressed=true],.theme-option[aria-pressed=true],.width-option[aria-pressed=true]{border:3px solid Highlight}.action-icon{border:1px solid ButtonText}}\n\n/* Grid tracks must not grow to min-content on narrow phones. */\n.brandbar,.navrow,.toolbar,.alert,.footer{min-width:0}\n@media(max-width:380px){.brandbar .brand{max-width:123px;overflow:hidden}.brandbar .brand svg{flex:none}.nav-button{flex-basis:0}.navrow .nav-button{padding-inline:3px}.inkquick{min-width:0}.mobile-tool-help{font-size:9px;max-width:138px}}\n\n/* Only explicitly decorated action buttons. Color/paper/pen swatches are excluded.\n   !important is confined to this compatibility layer: existing v41 ID selectors\n   and independently loaded module styles must not override the chosen colors. */\n.bd-btn[data-bd-button-role]{\n  --bd-btn-bg:var(--bd-btn-secondary-bg,#edf4f0);\n  --bd-btn-text:var(--bd-btn-secondary-text,#173b36);\n  --bd-btn-border:var(--bd-btn-secondary-border,#687b71);\n  --bd-btn-hover:var(--bd-btn-secondary-hover,#f2f7f4);\n  --bd-btn-active:var(--bd-btn-secondary-active,#f6f9f7);\n  background:var(--bd-btn-bg)!important;color:var(--bd-btn-text)!important;\n  border-color:var(--bd-btn-border)!important;filter:none!important;\n  text-shadow:none!important;transition:box-shadow .12s ease; /* Kontrast için zemin/yazı renkleri birlikte ve anında değişir. */\n}\n.bd-btn[data-bd-button-role=primary]{--bd-btn-bg:var(--bd-btn-primary-bg,#255f50);--bd-btn-text:var(--bd-btn-primary-text,#ffffff);--bd-btn-border:var(--bd-btn-primary-border,#255f50);--bd-btn-hover:var(--bd-btn-primary-hover,#22584a);--bd-btn-active:var(--bd-btn-primary-active,#205345)}\n.bd-btn[data-bd-button-role=danger]{--bd-btn-bg:var(--bd-btn-danger-bg,#fcece8);--bd-btn-text:var(--bd-btn-danger-text,#9b272d);--bd-btn-border:var(--bd-btn-danger-border,#9d6862);--bd-btn-hover:var(--bd-btn-danger-hover,#fcf0ed);--bd-btn-active:var(--bd-btn-danger-active,#fdf3f0);border-inline-start-width:3px!important;border-inline-start-style:solid!important}\n.bd-btn .action-icon,.bd-btn .chevron,.bd-btn strong,.bd-btn small{color:inherit!important}\n.bd-btn .action-icon{background:transparent!important}\n@media (hover:hover){.bd-btn[data-bd-button-role]:not(:disabled):not([aria-disabled=true]):hover{background:var(--bd-btn-hover)!important}}\n.bd-btn[data-bd-button-role]:not(:disabled):not([aria-disabled=true]):active{background:var(--bd-btn-active)!important}\n.bd-btn[data-bd-button-role]:focus-visible{outline:2px solid #ffffff!important;outline-offset:2px!important;box-shadow:0 0 0 5px #111827!important}\n.bd-btn[data-bd-button-role]:disabled,.bd-btn[data-bd-button-role][aria-disabled=true]{cursor:not-allowed;opacity:.52!important}\n.bd-btn[data-bd-button-role][aria-pressed=true]{text-decoration:underline;text-underline-offset:4px}\n/* Panel styles are namespaced; no global input/button/section resets. */\n.bdt-settings{display:block;text-align:left;font:14px/1.5 system-ui,-apple-system,\"Segoe UI\",sans-serif;color:#1b352f}\n.bdt-settings *{box-sizing:border-box}.bdt-settings [hidden]{display:none!important}\n.bdt-settings section{border:1px solid #d5dfd8;border-radius:16px;padding:16px;background:#fffefa;display:block}\n.bdt-title{display:flex;justify-content:space-between;gap:12px;align-items:center}\n.bdt-settings .bdt-title h3{font-size:19px;letter-spacing:-.3px;line-height:1.3;color:#1b352f;margin:0}\n.bdt-settings .bdt-eyebrow{font-size:9px;font-weight:700;letter-spacing:1.15px;color:#52675e;margin:0 0 4px;display:block}\n.bdt-tag{font-size:11px;line-height:1.4;border:1px solid #c3d3c8;border-radius:20px;padding:5px 9px;white-space:nowrap;color:#3e5749;background:#f3f6f1}\n.bdt-settings .bdt-help{font-size:12px;line-height:1.6;color:#52665e;margin:9px 0 13px}\n.bdt-presets{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin:13px 0}\n.bdt-settings .bdt-preset{min-width:0;min-height:48px;border:1px solid #becdc4;border-radius:10px;padding:7px 6px;display:flex;align-items:center;justify-content:center;gap:5px;background:#ffffff;color:#233d32;font:600 11px/1.2 system-ui;cursor:pointer}\n.bdt-swatch{width:15px;height:15px;border-radius:50%;border:1px solid #0003;flex:none}\n.bdt-settings .bdt-preset[aria-pressed=true]{border-color:#142e25;box-shadow:inset 0 0 0 1px #142e25;text-decoration:underline;text-underline-offset:4px;background:#edf3ed}\n.bdt-settings .bdt-preset:focus-visible,.bdt-settings input:focus-visible{outline:3px solid #005ea5;outline-offset:3px}\n.bdt-color-row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid #e0e7e1;min-height:65px}\n.bdt-color-row strong{font-size:12px;font-weight:650;display:block;color:#1b352f}.bdt-color-row small{font-size:11px;color:#596b63;display:block;margin-top:3px;font-variant-numeric:tabular-nums}\n.bdt-settings .bdt-color-row input[type=color]{width:54px;height:46px;flex:none;min-height:46px;padding:4px;border:1px solid #93a99b;border-radius:10px;background:#fff;cursor:pointer}\n.bdt-auto{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:15px 0 10px;cursor:pointer}\n.bdt-auto strong{font-size:12px;color:#1b352f;display:block}.bdt-auto small{font-size:11px;line-height:1.5;color:#52665e;display:block;margin-top:3px}\n.bdt-settings .bdt-auto input{appearance:auto;display:block;flex:none;accent-color:#255f50;width:24px;height:24px;min-height:24px;margin:10px}\n.bdt-settings .bdt-manual{padding:10px;border:1px solid #c6d4ca;border-radius:10px;margin:6px 0 12px;min-width:0}.bdt-manual legend{font-size:12px;font-weight:650;padding:0 5px}\n.bdt-warning{padding:10px 12px;border:1px solid #bc965c;border-radius:9px;background:#fff4de;color:#653e06;font-size:12px;line-height:1.55}\n.bdt-preview{margin:14px 0 12px;padding:12px;border:1px dashed #b1c3b7;border-radius:12px;background:#f8faf7;display:grid;gap:9px}\n.bdt-preview-pair{display:grid;grid-template-columns:1fr 1fr;gap:8px;min-width:0}\n.bdt-settings .bd-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-width:0;min-height:46px;width:auto;padding:10px 12px;border:1px solid;border-radius:11px;font:650 12px/1.35 system-ui;text-align:center;cursor:pointer}\n.bdt-preview>.bd-btn{width:100%}.bdt-preview-pair>.bd-btn{padding:9px 5px}\n.bdt-bottom>.bd-btn{width:100%}.bdt-bottom p{font-size:11px;line-height:1.55;color:#53685c;margin:9px 0 0}.bdt-bottom p[data-kind=error],.bdt-bottom p[data-kind=unavailable],.bdt-bottom p[data-kind=invalid]{color:#88382c}\n@media (max-width:380px){.bdt-settings section{padding:12px}.bdt-presets{grid-template-columns:repeat(2,minmax(0,1fr))}.bdt-preview-pair{grid-template-columns:1fr}}\n@media (prefers-reduced-motion:reduce){.bd-btn[data-bd-button-role]{transition:none}}\n@media (forced-colors:active){.bd-btn[data-bd-button-role]{background:ButtonFace!important;color:ButtonText!important;border:1px solid ButtonText!important;forced-color-adjust:auto}.bd-btn[data-bd-button-role]:focus-visible{outline:3px solid Highlight!important;box-shadow:none!important}.bd-btn[data-bd-button-role][aria-pressed=true],.bdt-preset[aria-pressed=true]{outline:2px solid Highlight!important}.bdt-swatch{forced-color-adjust:none}}\n";
  const ICONS = {
    book:'<path d="M3 5c4-1 7 0 9 2 2-2 5-3 9-2v15c-4-1-7 0-9 2-2-2-5-3-9-2V5Z"/><path d="M12 7v15M6 8v8"/>',
    pages:'<rect x="6" y="3" width="14" height="17" rx="2"/><path d="M3 7v14h13M10 8h6M10 12h6"/>',
    pen:'<path d="m4 20 4-1L20 7l-3-3L5 16l-1 4Zm11-14 3 3M5 16l3 3"/>',
    marker:'<path d="m7 13 8-9 5 5-9 8-4-4Zm0 0-3 4 3 3 4-3M3 21h7"/>',
    eraser:'<path d="m3 14 10-10 8 8-8 9H9l-6-6v-1Zm4-4 9 8M13 21h8"/>',
    hand:'<path d="M8 12V6a2 2 0 0 1 4 0v5-7a2 2 0 0 1 4 0v7-5a2 2 0 0 1 4 0v8c0 5-3 8-7 8-3 0-5-2-7-5l-3-4c-1-2 2-3 3-1l2 2"/>',
    undo:'<path d="m9 4-6 6 6 6M3 10h11a6 6 0 0 1 0 12" transform="translate(0 -2)"/>',
    redo:'<path d="m15 4 6 6-6 6m6-6H10a6 6 0 0 0 0 12" transform="translate(0 -2)"/>',
    plus:'<path d="M12 5v14M5 12h14"/>', minus:'<path d="M5 12h14"/>',
    close:'<path d="m6 6 12 12M6 18 18 6"/>', down:'<path d="m6 9 6 6 6-6"/>', right:'<path d="m9 5 7 7-7 7"/>',
    text:'<path d="M4 6V3h16v3M12 3v18m-4 0h8"/>', image:'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 6-6 4 4 3-3 5 5"/>',
    camera:'<path d="M3 6h4l2-3h6l2 3h4v15H3V6Z"/><circle cx="12" cy="13" r="4"/>',
    pdf:'<path d="M5 3h10l4 4v14H5V3Zm10 0v5h4M8 12h8M8 16h5"/>',
    edit:'<path d="m5 15 10-10 4 4L9 19H5v-4Zm8-8 4 4M4 22h16"/>',
    calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4M17 3v4M3 11h18M7 15h2M13 15h3"/>',
    dictionary:'<path d="M4 4h16v17H4V4ZM8 4v17M12 9h5M12 13h5"/>',
    scan:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M7 8h10M7 12h8M7 16h10"/>',
    search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
    paper:'<path d="M5 3h14v18H5V3ZM8 8h8M8 12h8M8 16h8"/>',
    top:'<path d="M4 4h16M12 21V9m-5 5 5-5 5 5"/>',
    trash:'<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/>',
    download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
    upload:'<path d="M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5"/>',
    restore:'<path d="M3 11a9 9 0 1 1 3 8M3 4v7h7M12 7v6l4 2"/>',
    device:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M10 17h4"/>',
    focus:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
    settings:'<path d="M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6"/>',
    folder:'<path d="M3 5h7l2 3h9v12H3V5Z"/>',
    spin:'<path d="M20 12a8 8 0 1 1-8-8"/>',
    check:'<path d="m5 12 4 4L19 6"/>',
    chart:'<path d="M18 20V10M12 20V4M6 20v-6"/>',
    heart:'<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
    cap:'<path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>',
    sparkle:'<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2-4.5-4.4 6.2-.9z"/>',
  };
  const icon = (name, cls='') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.paper}</svg>`;
  const GROUPS = {
    insert:{title:'Ekle',sub:'SAYFANI ZENGİNLEŞTİR',note:'Mevcut sayfalar ve notlar korunur.',actions:['insert.text','insert.image','insert.camera','pdf.open','presentation.native'],secondaryActions:['presentation.library','presentation.open']},
    study:{title:'Çalışma',sub:'NOTTAN ÖĞRENMEYE',note:'Bu işlemler mevcut çalışma modüllerine bağlanır. Arayüz tek başına sözlük veya yazı tanıma motoru değildir.',actions:['study.planner','study.dictionary','study.recognize','study.webSearch','study.guide']},
    page:{title:'Sayfa seçenekleri',sub:'YALNIZCA AÇIK SAYFA',note:'Temizleme ve çöp kutusu işlemleri ayrı onay ister.',actions:['page.rename','page.paper','page.top','selection.edit','page.clear','page.trash']},
    file:{title:'Dosya ve yedek',sub:'KOPYAN SENDE KALSIN',note:'Bu yedek normal defter sayfalarını ve deftere aktarılan sunum sayfalarını içerir; özgün PPTX dosyasını ayrıca sakla. Eski ayrı sunumlar için Önceki sunumlar ekranından sunum ve not yedeği al.',actions:['pdf.export','backup.export','backup.status','backup.import','backup.rollback']},
  };
  // UI komutları dışındaki bütün komutlar uygulamanın verdiği callback'e gider.
  const ACTIONS = {
    'insert.text':{label:'Metin ekle / düzenle',desc:'Klavyeyle yaz; çizim katmanını koru.',icon:'text',page:true},
    'insert.image':{label:'Görsel ekle',desc:'Cihazından bir görsel seç.',icon:'image',page:true},
    'insert.camera':{label:'Fotoğraf çek',desc:'Kamera veya cihaz seçicisini aç.',icon:'camera',page:true},
    'pdf.open':{label:'PDF aç',desc:'Belgeyi mevcut PDF motoruyla aç.',icon:'pdf'},
    'presentation.native':{label:'PowerPoint ekle',desc:'Slaytları defter sayfalarına ekle, üzerine yaz.',icon:'pdf'},
    'presentation.library':{label:'Önceki sunumlar',desc:'Daha önce ayrı kaydettiğin sunumları ve notlarını aç.',icon:'book'},
    'presentation.open':{label:'Sunucuda PDF’e dönüştür',desc:'Alternatif yöntem: dosyayı onayınla sunucuya gönderir.',icon:'pdf'},
    'study.library':{label:'Kütüphane',desc:'Kaynak kitapları bu pencerede aç; Deftere dön ile buraya dönersiniz. İnternet ve onaylı hesap gerekir.',icon:'book'},
    'study.planner':{label:'Takvim / çalışma planı',desc:'Derslerini ve tekrarlarını düzenle.',icon:'calendar'},
    'study.dictionary':{label:'Sözlük',desc:'Seçili metni veya girdiğin terimi incele.',icon:'dictionary',page:true},
    'study.recognize':{label:'Yazıyı tanı',desc:'Kapsamı seçerek mevcut tanıma motorunu aç.',icon:'scan',page:true},
    'study.webSearch':{label:'Web’de ara',desc:'Aranacak metni önce gör ve onayla.',icon:'search',page:true},
    'study.guide':{label:'Rehber & tanıtım turu',desc:'Uygulamanın özelliklerini ve ipuçlarını incele.',icon:'book',local:'guide'},
    'page.rename':{label:'Sayfanın adını değiştir',desc:'Notlarını daha kolay bul.',icon:'edit',page:true},
    'page.paper':{label:'Kâğıt görünümü',desc:'Çizgiler, noktalar ve sayfa rengi.',icon:'paper',local:'paper',page:true},
    'page.top':{label:'Sayfanın başına dön',desc:'Yazıları değiştirmeden yukarı git.',icon:'top',page:true},
    'selection.edit':{label:'Seçili öğeyi düzenle',desc:'Metnin veya görselin kendi araçlarını aç.',icon:'edit',page:true,selection:true},
    'page.clear':{label:'Sayfayı temizle',desc:'Açık sayfanın içeriğini kaldırır.',icon:'eraser',page:true,confirm:true,freeze:true},
    'page.trash':{label:'Sayfayı çöp kutusuna taşı',desc:'Kurtarma davranışı mevcut motor tarafından yönetilir.',icon:'trash',page:true,confirm:true,freeze:true},
    'pdf.export':{label:'Notlu PDF indir',desc:'Notlarını mevcut PDF dışa aktarıcısıyla al.',icon:'download',page:true},
    'backup.status':{label:'Kayıt ve eşitleme',desc:'Şifreli sunucu yedeği, eşitleme ve isteğe bağlı performans ölçümü.',icon:'download'},
    'backup.export':{label:'Yedek al',desc:'Uygulamanın kendi yedek dosyasını indir.',icon:'download'},
    'backup.import':{label:'Yedek yükle',desc:'Dosya seç; etkilerini gör; sonra onayla.',icon:'upload'},
    'backup.rollback':{label:'Yedek yüklemesini geri al',desc:'Son yükleme öncesi kopyaya dön.',icon:'restore',confirm:true,freeze:true,recovery:true},
    'settings.install':{label:'Kurulum ve çevrimdışı',desc:'Mevcut uygulamanın kurulum ekranını aç.',icon:'device'},
    'storage.persist':{label:'Kalıcı depolama iste',desc:'İzin verilmesi bağımsız yedek oluşturmaz.',icon:'device'},
    'history.undo':{label:'Geri al',page:true},'history.redo':{label:'Yinele',page:true},
    'tool.select':{label:'Yazı aracını değiştir',page:true},'ink.set':{label:'Renk ve kalınlık',page:true},
    'paper.set':{label:'Kâğıt görünümü',page:true},'view.zoom':{label:'Yakınlaştır',page:true},
    'settings.input':{label:'Giriş tercihleri'},'settings.frame':{label:'Çerçeve rengi'},
    'notebook.create':{label:'Yeni defter'},'notebook.rename':{label:'Defteri düzenle'},
    'page.create':{label:'Yeni sayfa'},'library.selectNotebook':{label:'Defter seç'},
    'library.selectPage':{label:'Sayfa seç'},'trash.open':{label:'Çöp kutusu'},
  };
  const TOOL_NAMES = {pen:'Kalem',marker:'Vurgula',eraser:'Çizgi silgisi',pan:'Gezin'};
  const INKS = [['#234e40','Koyu yeşil'],['#214d86','Mavi'],['#a53338','Kırmızı'],['#e8b746','Sarı'],['#67439d','Mor'],['#333a40','Grafit']];
  const PAPERS = [['#fffef8','Krem'],['#ffffff','Beyaz'],['#fff3c4','Sarı'],['#e0f1e5','Yeşil'],['#e4effa','Mavi'],['#f2e8f0','Pembe']];
  const THEMES = [['#193f39','Orman'],['#253e60','Gece'],['#343b41','Grafit'],['#603d5c','Mürdüm'],['#dccbae','Kum']];
  const PATTERNS = {ruled:'Çizgili',grid:'Kareli',dotted:'Noktalı',blank:'Çizgisiz'};
  const isHex = value => typeof value==='string' && /^#[0-9a-f]{6}$/i.test(value);
  const cleanText = (value, fallback='') => typeof value==='string' ? value.slice(0,400) : fallback;
  const esc = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const el = (name, cls, text) => { const node=document.createElement(name);if(cls)node.className=cls;if(text!=null)node.textContent=text;return node; };
  const ONBOARD_STYLES = `
/* Onboarding Modal Styles */
.onboarding-dialog{padding:0;border:1px solid var(--bd-line);border-radius:24px;width:min(740px,calc(100vw - 28px));max-width:none;max-height:calc(100dvh - 36px);background:var(--bd-paper);color:var(--bd-ink);box-shadow:0 25px 120px rgba(16,39,31,.35);overflow:hidden;font:inherit}
.onboarding-dialog[open]{display:grid;grid-template-rows:auto auto minmax(0,1fr) auto}
.onboarding-dialog::backdrop{background:rgba(18,38,33,.65);backdrop-filter:blur(4px)}
.onboard-header{padding:20px 24px 16px;background:linear-gradient(180deg,#edf4f0 0%,var(--bd-paper) 100%);border-bottom:1px solid var(--bd-line)}
.onboard-brand-row{display:flex;align-items:center;justify-content:space-between;gap:16px}
.onboard-brand{display:flex;align-items:center;gap:14px}
.onboard-logo{width:46px;height:46px;display:flex;align-items:center;justify-content:center;border-radius:14px;background:var(--bd-accent);color:#fff;box-shadow:0 4px 14px rgba(37,95,80,.28)}
.onboard-logo svg{width:28px;height:28px}
.onboard-title{font-size:22px;font-weight:750;letter-spacing:-.5px;margin:0;display:flex;align-items:center;gap:6px;color:var(--bd-ink)}
.onboard-sparkle svg{width:18px;height:18px;color:#e5a93b}
.onboard-subtitle{font-size:13px;font-weight:550;color:var(--bd-muted);margin:2px 0 0}
.onboard-motto{font-size:13px;font-style:italic;color:var(--bd-accent);margin:10px 0 12px;line-height:1.4}
.onboard-pillars{display:flex;gap:8px;flex-wrap:wrap}
.onboard-pillar{display:inline-flex;align-items:center;gap:6px;padding:5px 12px;background:#ffffff;border:1px solid var(--bd-line);border-radius:20px;font-size:12px;font-weight:600;color:var(--bd-ink);box-shadow:0 1px 3px rgba(0,0,0,.04)}
.onboard-pillar svg{width:16px;height:16px;color:var(--bd-accent)}
.onboard-nav{display:flex;border-bottom:1px solid var(--bd-line);background:#f7faf8;padding:6px 16px 0;gap:6px;overflow-x:auto}
.onboard-tab{display:inline-flex;align-items:center;gap:8px;padding:10px 14px;border:1px solid transparent;border-bottom:none;border-radius:12px 12px 0 0;background:transparent;font-size:12px;font-weight:650;color:var(--bd-muted);white-space:nowrap;transition:all .15s ease}
.onboard-tab:hover{color:var(--bd-ink);background:rgba(37,95,80,.05)}
.onboard-tab[aria-selected=true]{color:var(--bd-accent);background:var(--bd-paper);border-color:var(--bd-line);box-shadow:0 -2px 6px rgba(0,0,0,.02)}
.step-num{font-size:10px;font-weight:700;background:var(--bd-soft);color:var(--bd-accent);padding:2px 6px;border-radius:6px}
.onboard-tab[aria-selected=true] .step-num{background:var(--bd-accent);color:#ffffff}
.onboard-body{padding:20px 24px;overflow-y:auto;overscroll-behavior:contain;min-height:240px}
.onboard-slide{display:flex;flex-direction:column;gap:14px}
.onboard-card{border:1px solid var(--bd-line);border-radius:16px;background:#ffffff;padding:16px}
.banner-card{background:linear-gradient(135deg,#183c35 0%,#255f50 100%);color:#ffffff;border:none;padding:18px 20px}
.drawing-banner{background:linear-gradient(135deg,#1c4b42 0%,#2b6f5d 100%)}
.study-banner{background:linear-gradient(135deg,#1c3d52 0%,#295e7c 100%)}
.onboard-tag{display:inline-block;font-size:10px;font-weight:750;letter-spacing:1.2px;text-transform:uppercase;color:#f4cc6b;margin-bottom:6px}
.banner-card h3{margin:0 0 4px;font-size:17px;font-weight:700;letter-spacing:-.3px}
.banner-card p{margin:0;font-size:13px;opacity:.92;line-height:1.45}
.onboard-feature-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.feature-item{display:flex;align-items:flex-start;gap:12px;padding:12px 14px}
.feature-icon{width:36px;height:36px;border-radius:10px;background:var(--bd-soft);color:var(--bd-accent);display:flex;align-items:center;justify-content:center;flex:none}
.feature-icon svg{width:20px;height:20px}
.feature-item strong{display:block;font-size:13px;font-weight:650;margin-bottom:2px;color:var(--bd-ink)}
.feature-item p{margin:0;font-size:12px;color:var(--bd-muted);line-height:1.45}
.onboard-footer{padding:14px 24px;border-top:1px solid var(--bd-line);background:var(--bd-paper);display:flex;align-items:center;justify-content:space-between;gap:16px}
.onboard-privacy{display:flex;align-items:center;gap:8px;font-size:11px;color:var(--bd-muted)}
.privacy-dot{width:7px;height:7px;border-radius:50%;background:#397b60;flex:none}
.onboard-controls{display:flex;align-items:center;gap:8px}
.onboard-dots{display:flex;align-items:center;gap:6px;margin:0 6px}
.onboard-dot{width:8px;height:8px;border-radius:50%;background:#ccd7d0;transition:all .2s ease;border:0;padding:0;cursor:pointer}
.onboard-dot.active{width:22px;border-radius:10px;background:var(--bd-accent)}
@media (max-width:650px){
  .onboarding-dialog{width:calc(100vw - 16px);border-radius:18px}
  .onboard-header{padding:16px 16px 12px}
  .onboard-body{padding:14px 16px}
  .onboard-feature-grid{grid-template-columns:1fr;gap:8px}
  .onboard-footer{flex-direction:column;gap:10px;align-items:stretch}
  .onboard-controls{justify-content:space-between}
  .onboard-pillars{display:none}
  .onboard-tab span:not(.step-num){display:none}
  .onboard-tab{padding:8px 12px}
}
`;
  // The shared toolbar needs room for both navigation and themed writing tools.
  const TABLET_STYLES = `
.other-options{margin-top:14px;padding:0 12px;border:1px solid var(--bd-line);border-radius:12px;min-width:0}
.other-options>summary{min-height:44px;padding:11px 0;line-height:22px;font-size:12px;font-weight:600;cursor:pointer}
.other-options>summary:focus-visible{outline:3px solid #005ea5;outline-offset:2px}
.other-options[open]{padding-bottom:12px}.other-options .action-list{margin-top:4px}
.brand .brand-wordmark{width:164px;height:46px;object-fit:contain;background:#fffef9;border-radius:9px;padding:0 7px}
.brand .brand-appmark{display:none;width:44px;height:44px;object-fit:contain}
.onboard-logo img{width:100%;height:100%;object-fit:contain}
@media(max-width:700px){.brand .brand-wordmark{display:none}.brand .brand-appmark{display:block}.brand{gap:6px}}
dialog.panel[data-panel=library]{height:fit-content;margin:auto;max-height:calc(100dvh - 32px)}
dialog.panel[data-panel=library][open]{display:flex;flex-direction:column}
dialog.panel[data-panel=library] .panel-header,dialog.panel[data-panel=library] .panel-footer{flex-shrink:0}
dialog.panel[data-panel=library] .panel-body{flex:0 1 auto}
dialog.panel[data-pointer-focus=true] #bdx-panel-title:focus{outline:none}
.navgroup{min-width:0;flex-wrap:wrap}
.nav-button{flex-shrink:0}
@media(max-width:700px){.navrow .navgroup{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px;width:100%}.navrow .nav-button{width:100%;min-width:0;min-height:44px;white-space:normal}.navrow .nav-button svg{flex-shrink:0}}
@media(min-width:701px) and (max-width:1399px){
 .shell{grid-template-columns:minmax(0,1fr);grid-template-rows:auto auto auto auto minmax(0,1fr) auto}
 .brandbar,.navrow,.toolbar,.alert,.workspace,.footer{grid-column:1}
 .navrow{grid-row:2;padding:6px 14px}
 .toolbar{grid-row:3;padding:8px 14px}
 .alert{grid-row:4}.workspace{grid-row:5}.footer{grid-row:6}
 .focus-mode .toolbar{grid-column:1}
}
`;
  const template = `
    <style>${STYLES}:host(.layout-active) .navrow, :host(.layout-active) .toolbar, :host(.layout-active) .footer{display:none!important}:host(.layout-active) .shell{grid-template-rows:auto minmax(0,1fr)!important}:host(.layout-active) .workspace{grid-row:2!important}${ONBOARD_STYLES}</style>
    <style>${TABLET_STYLES}</style>
    <div class="shell">
      <header class="brandbar">
        <button class="icon-button" data-panel="library" aria-label="Defterler ve sayfalar" title="Defterler ve sayfalar" aria-haspopup="dialog" aria-expanded="false">${icon('pages')}</button>
        <div class="brand"><img class="brand-wordmark" src="icons/brand-mono-v51.png" alt="Bilge Defter" width="2172" height="724"><img class="brand-appmark" src="icons/brand-app-v51.png" alt="Bilge Defter" width="1254" height="1254"><span class="build-label"></span></div>
        <div class="crumbs"><span class="book-title"></span><span class="divider">/</span><button class="page-title" data-command="page.rename" title="Sayfanın adını değiştir"></button></div>
        <div class="save-badge" data-kind="unknown"><span class="save-dot"></span><span class="save-text">Kayıt durumu bekleniyor</span></div>
        <button class="icon-button focus-exit" data-focus title="Odak görünümünü aç / kapat" aria-label="Odak görünümünü aç / kapat">${icon('focus')}</button>
      </header>
      <nav class="navrow" aria-label="Defter işlemleri">
        <div class="navgroup">
          <button class="nav-button primary-action" data-panel="insert" aria-haspopup="dialog" aria-expanded="false">${icon('plus')}<span>Ekle</span></button>
          <button class="nav-button" data-panel="study" aria-haspopup="dialog" aria-expanded="false">${icon('calendar')}<span>Çalışma</span></button>
          <button class="nav-button" data-command="study.library" title="Kaynak kütüphanesi · bu pencerede açılır">${icon('book')}<span>Kütüphane</span></button>
          <button class="nav-button" data-panel="page" aria-haspopup="dialog" aria-expanded="false">${icon('paper')}<span>Sayfa</span></button>
          <button class="nav-button" data-panel="file" aria-haspopup="dialog" aria-expanded="false">${icon('folder')}<span class="full-label">Dosya ve yedek</span><span class="mobile-label">Dosya</span></button>
          <button class="nav-button" data-panel="settings" aria-haspopup="dialog" aria-expanded="false">${icon('settings')}<span>Ayarlar</span></button>
        </div>
        <button class="nav-button nav-focus" data-focus aria-pressed="false">${icon('focus')}<span>Odaklan</span></button>
      </nav>
      <div class="toolbar" aria-label="Yazma araçları">
        <div class="tools" role="group" aria-label="Kalem ve geçmiş">
          ${[['pen','Kalem','pen'],['marker','Vurgula','marker'],['eraser','Silgi','eraser'],['pan','Gezin','hand']].map(([id,label,ic])=>`<button class="tool" data-v2-tool="${id}" aria-pressed="false" title="${label}">${icon(ic)}<span class="tool-label">${label}</span></button>`).join('')}
          <button class="tool history" data-command="history.undo" aria-label="Geri al" title="Geri al">${icon('undo')}<span class="tool-label">Geri al</span></button>
          <button class="tool history" data-command="history.redo" aria-label="Yinele" title="Yinele">${icon('redo')}<span class="tool-label">Yinele</span></button>
        </div>
        <div class="inkquick"><button class="ink-button" data-panel="ink" aria-label="Mürekkep rengi ve kalınlığı" aria-haspopup="dialog"><span class="ink-preview"></span><span class="ink-label">4 px</span>${icon('down')}</button><span class="hint">Kalemle yaz · parmakla gezin</span><span class="mobile-tool-help">Ayarlar ayrı.<br>Notun ön planda.</span></div>
      </div>
      <div class="alert" hidden role="alert"><span class="alert-text"></span><button data-command="backup.export">Yedek al</button><button data-close-alert aria-label="Bildirimi kapat">${icon('close')}</button></div>
      <main class="workspace" aria-label="Not düzenleyici">
        <div class="selection-bar" hidden><span class="selection-text"></span><button data-command="selection.edit">Seçili öğeyi düzenle</button></div>
        <slot name="editor" class="editor-slot"></slot>
        <div class="busy-indicator" hidden role="status">${icon('spin')}<span></span></div>
        <div class="toast" hidden role="status" aria-live="polite"></div>
      </main>
      <footer class="footer"><div class="footer-start"><span class="mode-dot"></span><span class="mode-text">Motor bağlantısı bekleniyor</span></div><div class="zoom" role="group" aria-label="Sayfa yakınlaştırma"><button data-zoom="out" aria-label="Uzaklaştır">${icon('minus')}</button><button data-zoom="fit" class="zoom-value" aria-label="Sayfayı genişliğe sığdır">%100</button><button data-zoom="in" aria-label="Yakınlaştır">${icon('plus')}</button></div><span class="footer-help">${icon('device')}<span class="storage-description">Kayıt bilgisi ana uygulamadan gelir</span></span></footer>
    </div>
    <dialog aria-labelledby="bdx-panel-title" class="panel">
      <header class="panel-header"><div><div class="eyebrow" id="bdx-panel-sub"></div><h2 id="bdx-panel-title" tabindex="-1"></h2></div><button class="icon-button" data-close-panel aria-label="Paneli kapat">${icon('close')}</button></header>
      <div class="panel-body"></div>
      <footer class="panel-footer"><button class="button primary" data-return-editor>Yazmaya dön</button></footer>
    </dialog>
    <dialog aria-labelledby="bdx-onboarding-title" class="onboarding-dialog">
      <div class="onboard-shell">
        <header class="onboard-header">
          <div class="onboard-brand-row">
            <div class="onboard-brand">
              <span class="onboard-logo"><img src="icons/brand-app-v51.png" alt="" width="1254" height="1254"></span>
              <div>
                <h2 id="bdx-onboarding-title" class="onboard-title">Bilge Defter <span class="onboard-sparkle">${icon('sparkle')}</span></h2>
                <p class="onboard-subtitle">Akıllı notlar ve çalışma planı</p>
              </div>
            </div>
            <button class="icon-button onboard-close" data-close-onboarding aria-label="Tanıtımı kapat">${icon('close')}</button>
          </div>
          <p class="onboard-motto">“Daha organize, daha bilgili bir sen… Fikirlerin daha parlak bir geleceğe…”</p>
          <div class="onboard-pillars" role="region" aria-label="Temel ilkeler">
            <span class="onboard-pillar">${icon('cap')}<span>Daha iyi öğren</span></span>
            <span class="onboard-pillar">${icon('chart')}<span>Planlı ilerle</span></span>
            <span class="onboard-pillar">${icon('heart')}<span>Hedeflerine ulaş</span></span>
          </div>
        </header>

        <nav class="onboard-nav" role="tablist" aria-label="Tanıtım bölümleri">
          <button class="onboard-tab" role="tab" data-onboard-step="0" aria-selected="true" aria-controls="bdx-slide-0">
            <span class="step-num">01</span><span>Ana Sayfa (Dashboard)</span>
          </button>
          <button class="onboard-tab" role="tab" data-onboard-step="1" aria-selected="false" aria-controls="bdx-slide-1">
            <span class="step-num">02</span><span>Not Düzenleyici</span>
          </button>
          <button class="onboard-tab" role="tab" data-onboard-step="2" aria-selected="false" aria-controls="bdx-slide-2">
            <span class="step-num">03</span><span>Çalışma Planı / Takvim</span>
          </button>
        </nav>

        <div class="onboard-body">
          <div class="onboard-slide" id="bdx-slide-0" role="tabpanel">
            <div class="onboard-card banner-card">
              <span class="onboard-tag">GÜNÜNÜ PLANLA, HER ŞEY ELİNİN ALTINDA</span>
              <h3>Bugün daha fazlasını başarabilirsin.</h3>
              <p>Küçük notlar, büyük hedefler. İyi öğrenenler dünyayı değiştirir.</p>
            </div>
            <div class="onboard-feature-grid">
              <div class="onboard-card feature-item">
                <div class="feature-icon">${icon('calendar')}</div>
                <div><strong>Bugünkü Plan</strong><p>Derslerine ait çalışma programı ve görev listelerini tek ekranda takip et.</p></div>
              </div>
              <div class="onboard-card feature-item">
                <div class="feature-icon">${icon('folder')}</div>
                <div><strong>Defterlerim & Dersler</strong><p>Matematik, Türkçe, Fen gibi ders bazlı ayrı defterler oluştur ve düzenle.</p></div>
              </div>
              <div class="onboard-card feature-item">
                <div class="feature-icon">${icon('pages')}</div>
                <div><strong>Son Notlar</strong><p>En son üzerinde çalıştığın sayfalara doğrudan tek dokunuşla geri dön.</p></div>
              </div>
              <div class="onboard-card feature-item">
                <div class="feature-icon">${icon('sparkle')}</div>
                <div><strong>Akıllı Öğrenme Araçları</strong><p>Sözlük, arama ve yazı tanıma ile ders çalışma verimini en üst seviyeye çıkar.</p></div>
              </div>
            </div>
          </div>

          <div class="onboard-slide" id="bdx-slide-1" role="tabpanel" hidden>
            <div class="onboard-card banner-card drawing-banner">
              <span class="onboard-tag">ÖZGÜRCE YAZ, AKILLI ARAÇLARLA DAHA FAZLASINI YAP</span>
              <h3>Doğal el yazısı ve dijital kâğıdın gücü.</h3>
              <p>Gerçek tablet hissi, akıcı kalem vuruşları ve zengin not alma özellikleri.</p>
            </div>
            <div class="onboard-feature-grid">
              <div class="onboard-card feature-item">
                <div class="feature-icon">${icon('pen')}</div>
                <div><strong>Basınç Duyarlı Kalem & Vurgula</strong><p>Kalem kalınlığı, basınç algılama, fosforlu sarı vurgulama ve özel renkler.</p></div>
              </div>
              <div class="onboard-card feature-item">
                <div class="feature-icon">${icon('paper')}</div>
                <div><strong>4 Kâğıt Deseni & Silgi</strong><p>Çizgili, kareli, noktalı veya düz sayfalar; tam çizgi veya nokta silgisi.</p></div>
              </div>
              <div class="onboard-card feature-item">
                <div class="feature-icon">${icon('pdf')}</div>
                <div><strong>PDF Not Alma & İnceleme</strong><p>Ders kitaplarını ve PDF dosyalarını aç, sayfaların üzerine doğrudan not al.</p></div>
              </div>
              <div class="onboard-card feature-item">
                <div class="feature-icon">${icon('dictionary')}</div>
                <div><strong>12.000+ Kelimelik TDK Sözlük</strong><p>Okuma yaparken bilmediğin terimleri ve anlamları anında sözlükten sorgula.</p></div>
              </div>
            </div>
          </div>

          <div class="onboard-slide" id="bdx-slide-2" role="tabpanel" hidden>
            <div class="onboard-card banner-card study-banner">
              <span class="onboard-tag">HEDEFLERİN DOĞRULTUSUNDA, DÜZENLİ İLERLE</span>
              <h3>Disiplin, hayallerine giden köprüdür.</h3>
              <p>Haftalık planını yap, çalışma sürelerini ölç ve hedeflerine adım adım ulaş.</p>
            </div>
            <div class="onboard-feature-grid">
              <div class="onboard-card feature-item">
                <div class="feature-icon">${icon('calendar')}</div>
                <div><strong>Haftalık Ders Takvimi</strong><p>Ders bloklarını renklerle planla, gün gün çalışma saatlerini düzenle.</p></div>
              </div>
              <div class="onboard-card feature-item">
                <div class="feature-icon">${icon('chart')}</div>
                <div><strong>Çalışma İstatistikleri & Süre</strong><p>Bu hafta kaç saat çalıştığını, tamamlanan görevleri ve başarı oranını gör.</p></div>
              </div>
              <div class="onboard-card feature-item">
                <div class="feature-icon">${icon('device')}</div>
                <div><strong>Yerel kayıt ve kontrollü paylaşım</strong><p>Sınıf sürümünü açarken internetle giriş gerekir. Açık oturumda bağlantı kesilse de notlar yerelde kaydedilir. Eşitleme ve yazı tanıma sunucuyu kullanır.</p></div>
              </div>
              <div class="onboard-card feature-item">
                <div class="feature-icon">${icon('download')}</div>
                <div><strong>Tam Bağımsız Yedekleme</strong><p>Tek tıkla JSON veya PDF yedeği al, notlarını güvenle arşivle ve taşı.</p></div>
              </div>
            </div>
          </div>
        </div>

        <footer class="onboard-footer">
          <div class="onboard-privacy"><span class="privacy-dot"></span><span>Notlar cihazında saklanır. Eşitlemeyi açarsan şifreli kopyası; tanımayı başlatırsan seçtiğin yazı görüntüsü sunucuya gönderilir.</span></div>
          <div class="onboard-controls">
            <button class="button subtle onboard-prev" data-onboard-action="prev" disabled aria-label="Önceki sayfa">← Önceki</button>
            <div class="onboard-dots" role="group" aria-label="Sayfa göstergeleri">
              <button class="onboard-dot active" data-onboard-dot="0" aria-label="1. Adım"></button>
              <button class="onboard-dot" data-onboard-dot="1" aria-label="2. Adım"></button>
              <button class="onboard-dot" data-onboard-dot="2" aria-label="3. Adım"></button>
            </div>
            <button class="button subtle onboard-next" data-onboard-action="next" aria-label="Sonraki sayfa">İlerle →</button>
            <button class="button primary onboard-start" data-onboard-action="start">Hemen Başla ✓</button>
          </div>
        </footer>
      </div>
    </dialog>
    <span class="sr-only" role="status" aria-live="polite" id="bdx-storage-live"></span>
  `;

  class BilgeDefterUI extends HTMLElement {
    constructor(){
      super();
      this.attachShadow({mode:'open'});
      this.shadowRoot.innerHTML=template; // Yalnız derlenmiş sabit HTML. Not metni innerHTML'e girmez.
      this._host=null;this._state={};this._unsubscribe=null;this._connected=false;this._busy=false;this._pending=null;
      this._returnFocus=null;this._restoreFocus=true;this._panelKind=null;this._group=null;this._focusMode=false;
      this._toastTimer=null;this._confirmResolve=null;this._libraryKey='';this._noticeKey='';this._lastLiveSave='';this._refreshQueued=false;
      this._panel=this.$('dialog.panel');
      this._pointerPanelOpening=false;
      this.shadowRoot.addEventListener('pointerdown',()=>{this._pointerPanelOpening=true;});
      this.shadowRoot.addEventListener('keydown',()=>{this._pointerPanelOpening=false;this._panel.dataset.pointerFocus='false';});
      this._onboarding=this.$('dialog.onboarding-dialog');
      this._onboardingStep=0;
      this.shadowRoot.addEventListener('click',e=>this._click(e));
      this.shadowRoot.addEventListener('change',e=>this._change(e));
      this.shadowRoot.addEventListener('input',e=>this._input(e));
      this._panel.addEventListener('keydown',e=>this._trapFocus(e));
      this._panel.addEventListener('cancel',()=>{if(this._confirmResolve){this._confirmResolve(false);this._confirmResolve=null;}});
      this._panel.addEventListener('close',()=>this._onClose());
      this._onboarding?.addEventListener('cancel',()=>this.closeOnboarding(true));
      this._onboarding?.addEventListener('close',()=>this._onCloseOnboarding());
      this._onboarding?.addEventListener('click',e=>{if(e.target===this._onboarding)this.closeOnboarding(true);});
    }
    $(selector){return this.shadowRoot.querySelector(selector);}
    $$(selector){return [...this.shadowRoot.querySelectorAll(selector)];}
    connectedCallback(){
      this._connected=true;
      if(!this._buttonTheme){
        // Production and legacy dialogs share a preference; keep the demo key
        // separate unless the production host explicitly supplies its key.
        if(this.getAttribute('button-theme-key')==='bilge-defter-button-theme-v1'){
          try{const key='bilge-defter-button-theme-v1',legacy=localStorage.getItem('bilge-defter-ui-v2-button-theme-v1');if(localStorage.getItem(key)===null&&legacy){const decoded=globalThis.BilgeButtonTheme.decode(legacy);if(decoded.status==='loaded')localStorage.setItem(key,JSON.stringify(decoded.theme))}}catch{/* Preference storage may be disabled; notebook storage is independent. */}
        }
        this._buttonTheme=globalThis.BilgeButtonTheme.createController({target:this,storageKey:this.getAttribute('button-theme-key')||'bilge-defter-ui-v2-button-theme-v1'});
        this._disposeButtonStyles=globalThis.BilgeButtonTheme.decorateButtons(this.shadowRoot);
      }
      if(this._host)this.connect(this._host);else this.refresh();
      try{
        const isTest = Boolean(navigator.webdriver) || location.search.includes('test=1') || location.search.includes('v=') || Boolean(globalThis.__TEST_MODE);
        const forceOnboarding = location.search.includes('onboarding=1');
        if(!localStorage.getItem('bilge_defter_onboarding_v1') && (!isTest || forceOnboarding)){
          queueMicrotask(()=>this.openOnboarding(0));
        }
      }catch(_){}
    }
    openOnboarding(step=0){
      if(this._busy)return;
      if(this._panel.open)this.closePanel(false);
      this.setOnboardingStep(step);
      if(!this._onboarding.open){
        this._onboarding.showModal();
        this.$('#bdx-onboarding-title')?.focus({preventScroll:true});
      }
    }
    closeOnboarding(markSeen=true){
      if(!this._onboarding||!this._onboarding.open)return;
      if(markSeen){
        try{localStorage.setItem('bilge_defter_onboarding_v1','true');}catch(_){}
      }
      this._onboarding.close();
    }
    _onCloseOnboarding(){
      try{localStorage.setItem('bilge_defter_onboarding_v1','true');}catch(_){}
    }
    setOnboardingStep(step){
      this._onboardingStep=Math.max(0,Math.min(2,Number(step)||0));
      const cur=this._onboardingStep;
      this.$$('.onboard-tab').forEach((tab,i)=>{tab.setAttribute('aria-selected',String(i===cur));});
      this.$$('.onboard-slide').forEach((slide,i)=>{slide.hidden=(i!==cur);});
      this.$$('.onboard-dot').forEach((dot,i)=>{dot.classList.toggle('active',i===cur);});
      const prevBtn=this.$('[data-onboard-action="prev"]');
      const nextBtn=this.$('[data-onboard-action="next"]');
      if(prevBtn)prevBtn.disabled=(cur===0);
      if(nextBtn)nextBtn.hidden=(cur===2);
    }
    get buttonTheme(){return this._buttonTheme;}
    disconnectedCallback(){this._disposeButtonStyles?.();this._disposeButtonStyles=null;this._buttonTheme?.destroy();this._buttonTheme=null;this._connected=false;this._unsubscribe?.();this._unsubscribe=null;clearTimeout(this._toastTimer);if(this._panel.open)this.closePanel(false);}
    /** Bağlantı değiştirmek yalnız arayüzü değiştirir; eski/üretim verisine dokunulmaz. */
    connect(host){
      if(!host || typeof host.getState!=='function' || !host.commands || typeof host.commands!=='object'){
        throw new TypeError('BilgeDefterUI.connect: getState ve commands gerekli.');
      }
      if(this._busy)throw new Error('İşlem sürerken motor bağlantısı değiştirilemez.');
      this._unsubscribe?.();this._unsubscribe=null;this._host=host;
      if(this._connected && typeof host.subscribe==='function'){
        const dispose=host.subscribe(()=>this.scheduleRefresh());
        if(typeof dispose==='function')this._unsubscribe=dispose;
      }
      this.refresh();return this;
    }
    scheduleRefresh(){if(this._refreshQueued)return;this._refreshQueued=true;queueMicrotask(()=>{this._refreshQueued=false;if(this._connected)this.refresh();});}
    getState(){return this._state;}
    refresh(){
      try{this._state=this._host?.getState() || {};}
      catch{this.showError('Motor durumu okunamadı. Notlara yazılmadı; mevcut uygulamayı kontrol et.');return;}
      const s=this._state,p=s.page||{},ink=s.ink||{};
      this.$('.build-label').textContent=cleanText(s.appLabel);this.$('.build-label').hidden=!s.appLabel;
      this.$('.book-title').textContent=cleanText(p.bookTitle,'Defter');this.$('.page-title').textContent=cleanText(p.title,'Sayfa seç');
      this.$('.page-title').disabled=!this.available('page.rename');
      this.$('.ink-preview').style.backgroundColor=isHex(ink.color)?ink.color:'#234e40';
      this.$('.ink-label').textContent=(TOOL_NAMES[s.tool]||'Kalem')+' · '+(Number.isFinite(ink.width)?ink.width:4)+' px';
      this.$('.ink-button').disabled=!this.available('ink.set');
      this.$$('[data-v2-tool],[data-tool]').forEach(b=>{b.disabled=!this.available('tool.select');b.setAttribute('aria-pressed',String((b.dataset.v2Tool||b.dataset.tool)===s.tool));});
      this.$$('[data-command]').forEach(b=>{b.disabled=!this.available(b.dataset.command);});
      this.$$('[data-zoom]').forEach(b=>{b.disabled=!this.available('view.zoom') || (b.dataset.zoom==='out'&&s.zoom<=1) || (b.dataset.zoom==='in'&&s.zoom>=3);});
      this.$('.zoom-value').textContent='%'+Math.round((Number.isFinite(s.zoom)?s.zoom:1)*100);
      const input=s.input||{},hint=s.tool==='pan'?'Gezinme açık · çizim kapalı':input.fingerDraw?'Parmak ve kalemle çizim açık':input.lockTouch?'Kalemle yaz · parmak kaydırması kilitli':'Kalemle yaz · parmakla gezin';
      this.$('.hint').textContent=hint;
      const save=s.save||{},status=['saved','pending','error','unknown'].includes(save.status)?save.status:'unknown';
      const saveText=cleanText(save.message,'Kayıt durumu doğrulanmadı');
      this.$('.save-badge').dataset.kind=status;this.$('.save-text').textContent=saveText;
      this.$('.mode-text').textContent=(s.tool?TOOL_NAMES[s.tool]+' · ':'')+saveText;
      this.$('.storage-description').textContent=cleanText(s.storageLabel,'Kayıt bilgisi ana uygulamadan gelir');
      // Her pointermove'da canlı alanı yenilemeyiz. Yalnız anlamlı kayıt durumu değişir.
      const live=status==='saved'?'Yerel kayıt tamamlandı.':status==='error'?saveText:'';
      if(live&&live!==this._lastLiveSave){this.$('#bdx-storage-live').textContent=live;this._lastLiveSave=live;}
      if(status==='pending')this._lastLiveSave='';
      if(status==='error' && this._noticeKey!==saveText){this._noticeKey=saveText;this.showError(cleanText(s.save?.detail,saveText),true);}
      if(status==='saved'&&this._noticeKey){this._noticeKey='';if(this.$('.alert').dataset.storage==='true')this.$('.alert').hidden=true;}
      const frame=isHex(s.frameColor)?s.frameColor:'#343b41';this.style.setProperty('--bd-frame',frame);
      this.style.setProperty('--bd-frame-ink',this._textOnColor(frame));
      const hasSelection=Boolean(s.selection?.kind);this.$('.selection-bar').hidden=!hasSelection;
      this.$('.selection-text').textContent=hasSelection?cleanText(s.selection.label,'Bir öğe seçili'):'';
      if(this._panel.open){this._updatePanelControls();if(this._panelKind==='library')this._renderLibraryList();}
    }
    _textOnColor(hex){
      const v=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);
      const l=.2126*v[0]+.7152*v[1]+.0722*v[2];return l>.179?'#142f29':'#ffffff';
    }
    available(id){
      const s=this._state,a=ACTIONS[id];if(!a || this._busy || s.ready===false || !this._host)return false;
      if(a.local==='paper')return this.available('paper.set');
      if(a.local==='guide')return true;
      if(typeof this._host.commands[id]!=='function')return false;
      if(a.page&&!s.page?.id)return false;
      if(a.selection&&!s.selection?.kind)return false;
      if(a.recovery&&!s.recovery?.available)return false;
      if(id==='history.undo'&&!s.canUndo)return false;
      if(id==='history.redo'&&!s.canRedo)return false;
      // Ana uygulama, salt okunur belge veya dolu kota gibi durumları da kapatabilir.
      if(s.disabledCommands&&Object.prototype.hasOwnProperty.call(s.disabledCommands,id))return false;
      return true;
    }
    unavailableReason(id){
      const a=ACTIONS[id]||{},s=this._state;
      if(this._busy)return 'Önce devam eden işlemi tamamla.';
      if(s.disabledCommands?.[id])return cleanText(s.disabledCommands[id]);
      if(a.local==='guide')return '';
      if(!this._host || typeof this._host.commands[a.local==='paper'?'paper.set':id]!=='function')return 'Bu örnekte bağlı değil · mevcut motora bağlanacak.';
      if(s.ready===false)return 'Not motoru hazırlanıyor.';
      if(a.selection&&!s.selection?.kind)return 'Önce bir metin veya görsel seç.';
      if(a.recovery&&!s.recovery?.available)return 'Geri dönüş kopyası yok.';
      if(a.page&&!s.page?.id)return 'Önce bir sayfa aç.';
      return 'Şu anda kullanılamıyor.';
    }
    _context(){return {pageId:this._state.page?.id||null,bookId:this._state.page?.bookId||null,revision:this._state.revision??null};}
    async run(id,payload={},options={}){
      const a=ACTIONS[id];if(!a){this.showError('Bilinmeyen arayüz komutu.');return {ok:false,code:'UNKNOWN_COMMAND'};}
      if(!this.available(id)){this.showError(this.unavailableReason(id));return {ok:false,code:'UNAVAILABLE'};}
      if(a.local){if(a.local==='guide')this.openOnboarding(0);else this.openPanel(a.local);return {ok:true,local:true};}
      const captured=options.context||this._context();
      if(a.confirm){
        const details=id==='backup.rollback'?cleanText(this._state.recovery?.explanation,'Geri dönüşten sonra hangi notların etkileneceğini uygulamanın kurtarma motoru doğrulamalı.'):
          id==='page.clear'?`“${cleanText(this._state.page?.title,'Açık sayfa')}” içeriği temizlenecek. ${this._state.clearIsUndoable?'Bu işlem bu oturumda Geri al ile geri getirilebilir.':'Bu motor geri alınabilirlik bildirmiyor. Önce bağımsız yedek al.'}`:
          `“${cleanText(this._state.page?.title,'Açık sayfa')}” çöp kutusuna taşınacak.`;
        const confirmed=await this.confirm(a.label,details);if(!confirmed)return {ok:false,cancelled:true};
        this.refresh();
        if(a.page&&this._state.page?.id!==captured.pageId){this.showError('Onay sırasında açık sayfa değişti. Yanlış sayfaya işlem uygulanmadı.');return {ok:false,code:'STALE_CONTEXT'};}
        if(!this.available(id)){this.showError(this.unavailableReason(id));return {ok:false,code:'UNAVAILABLE'};}
      }
      if(options.close!==false)this.closePanel(false);
      // Handler ilk await'ten ÖNCE çağrılır: dosya seçici/kamera için kullanıcı etkinliği korunur.
      this._busy=true;const aborter=new AbortController();this._pending={id,aborter};
      const slot=this.$('.editor-slot');if(a.freeze)slot.inert=true;
      this.$('.busy-indicator span').textContent=a.label+'…';this.$('.busy-indicator').hidden=false;this.refresh();
      try{
        const handler=this._host.commands[id];
        const result=await handler(payload,{...captured,signal:aborter.signal});
        if(result?.ok===false)throw Object.assign(new Error('Komut tamamlanmadı.'),{publicMessage:result.message});
        if(result?.message)this.notify(cleanText(result.message));
        // undefined, yalnızca ana uygulamanın kendi penceresini açmış olabilir.
        // Burada "kaydedildi" veya "PDF üretildi" mesajı uydurulmaz.
        return {ok:true,result};
      }catch(error){
        if(error?.name==='AbortError')this.notify('İşlem iptal edildi.');
        else this.showError(cleanText(error?.publicMessage,'İşlem tamamlanamadı. Otomatik tekrar yapılmadı; notlarını ve ana uygulamayı kontrol et.'));
        this.dispatchEvent(new CustomEvent('bdx-command-error',{detail:{command:id,code:error?.name||'Error'}}));
        return {ok:false,code:error?.name||'Error'};
      }finally{
        this._busy=false;this._pending=null;slot.inert=false;this.$('.busy-indicator').hidden=true;this.refresh();
      }
    }
    notify(message){clearTimeout(this._toastTimer);this.$('.toast').textContent=message;this.$('.toast').hidden=false;this._toastTimer=setTimeout(()=>{this.$('.toast').hidden=true;},4000);}
    showError(message,storage=false){const box=this.$('.alert');box.hidden=false;box.classList.add('error');box.dataset.storage=String(storage);this.$('.alert-text').textContent=message;this.$('[data-close-alert]').hidden=storage;}
    focusEditor(){
      const editor=this.$('slot').assignedElements()[0];
      const target=editor?.querySelector('[data-editor-focus],#viewport,[tabindex="0"],textarea')||editor;
      target?.focus?.({preventScroll:true});
    }
    _open(kind,title,sub,body,footer=null){
      const oldTarget=this.shadowRoot.activeElement;
      if(this._panel.open)this.closePanel(false);
      this._returnFocus=oldTarget?.isConnected?oldTarget:this.$('[data-panel="page"]');
      this._restoreFocus=true;this._panelKind=kind;this._panel.dataset.panel=kind;
      this.$('#bdx-panel-title').textContent=title;this.$('#bdx-panel-sub').textContent=sub;
      this.$('.panel-body').replaceChildren(body);
      const foot=this.$('.panel-footer');foot.innerHTML=footer||'<button class="button primary" data-return-editor>Yazmaya dön</button>';
      this._panel.dataset.pointerFocus=String(this._pointerPanelOpening);
      this._panel.showModal();this.$('#bdx-panel-title').focus({preventScroll:true});
      this.$('.panel-body').scrollTop=0;
      this.$$('[data-panel]').filter(x=>x.tagName==='BUTTON').forEach(b=>b.setAttribute('aria-expanded',String(b.dataset.panel===kind||b.dataset.panel===this._group)));
      this._updatePanelControls();
    }
    closePanel(restore=true){if(!this._panel.open)return;this._restoreFocus=restore;this._panel.close();}
    _onClose(){
      if(this._panel.open)return; // A previous close event must not reset a freshly opened panel.
      if(this._confirmResolve){this._confirmResolve(false);this._confirmResolve=null;}
      this.$$('[aria-expanded]').forEach(b=>b.setAttribute('aria-expanded','false'));
      const target=this._returnFocus,restore=this._restoreFocus;
      this._panelKind=null;this._group=null;
      if(restore)queueMicrotask(()=>{if(!this._panel.open&&!document.querySelector('dialog[open]')&&target?.isConnected)target.focus({preventScroll:true});});
    }
    _trapFocus(event){
      if(event.key!=='Tab')return;
      const nodes=[...this._panel.querySelectorAll('button:not(:disabled),[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(n=>!n.hidden && n.getClientRects().length);
      if(!nodes.length){event.preventDefault();this.$('#bdx-panel-title').focus();return;}
      const first=nodes[0],last=nodes[nodes.length-1],active=this.shadowRoot.activeElement;
      if(event.shiftKey&&(active===first||!nodes.includes(active))){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&active===last){event.preventDefault();first.focus();}
    }
    confirm(title,description){
      const body=el('div');body.append(el('p','helper',description));
      this._open('confirm',title,'İŞLEMİ ONAYLA',body,'<button class="button" data-confirm="no">Vazgeç</button><button class="button danger" data-confirm="yes">Onayla</button>');
      this.$('[data-confirm="no"]').focus();
      return new Promise(resolve=>{this._confirmResolve=resolve;});
    }
    openPanel(kind){
      if(this._busy){this.notify('Devam eden işlemin bitmesini bekle.');return;}
      this.refresh();
      if(GROUPS[kind])return this._openGroup(kind);
      if(kind==='ink')return this._openInk();
      if(kind==='paper')return this._openPaper();
      if(kind==='settings')return this._openSettings();
      if(kind==='library')return this._openLibrary();
    }
    _action(id){
      const a=ACTIONS[id],b=el('button','action'+(a.confirm?' danger':''));b.type='button';b.dataset.command=id;
      b.innerHTML=`<span class="action-icon">${icon(a.icon)}</span><span><strong>${esc(a.label)}</strong><small></small></span>${icon('right','chevron')}`;
      const available=this.available(id);b.disabled=!available;b.querySelector('small').textContent=available?a.desc:this.unavailableReason(id);return b;
    }
    _openGroup(group){
      const g=GROUPS[group],body=el('div'),list=el('div','action-list');g.actions.forEach(id=>list.append(this._action(id)));body.append(list);
      if(g.secondaryActions){
        const options=el('details','other-options'),secondary=el('div','action-list');options.id='pptxOtherOptions';
        g.secondaryActions.forEach(id=>secondary.append(this._action(id)));options.append(el('summary',null,'Diğer sunum seçenekleri'),secondary);body.append(options);
      }
      body.append(el('p','helper'+(group==='file'?' warning':''),g.note));
      this._open('group',g.title,g.sub,body);this._group=group;
      this.$$('[data-panel]').filter(x=>x.tagName==='BUTTON').forEach(b=>b.setAttribute('aria-expanded',String(b.dataset.panel===group)));
    }
    _swatches(values,attribute){
      const group=el('div','swatches');group.setAttribute('role','group');group.setAttribute('aria-label',attribute==='data-ink'?'Mürekkep renkleri':'Sayfa renkleri');
      values.forEach(([color,label])=>{const b=el('button','swatch');b.type='button';b.setAttribute(attribute,color);b.setAttribute('aria-label',label);b.title=label;b.setAttribute('aria-pressed','false');const sw=el('span');sw.style.backgroundColor=color;b.append(sw);group.append(b);});return group;
    }
    _openInk(){
      const body=el('div');body.append(el('h3',null,'Mürekkep rengi'),this._swatches(INKS,'data-ink'));
      const custom=el('label','custom-color');custom.innerHTML='Özel mürekkep rengi <input type="color" data-custom-ink aria-label="Özel mürekkep rengi">';body.append(custom,el('h3',null,'Çizgi kalınlığı'));
      const widths=el('div','width-options');widths.setAttribute('role','group');widths.setAttribute('aria-label','Kalınlık seçenekleri');
      [1,2,4,8,12].forEach(w=>{const b=el('button','width-option');b.dataset.width=String(w);b.setAttribute('aria-pressed','false');b.setAttribute('aria-label',w+' piksel');b.innerHTML=`<span style="height:${w}px"></span><small>${w} px</small>`;widths.append(b);});body.append(widths);
      const range=el('div');range.innerHTML='<label class="range-label" for="bdx-width">Kalınlık <output id="bdx-width-value">4 px</output></label><input id="bdx-width" data-width-range type="range" min="1" max="12" step="1"><div class="stroke-sample"><span></span></div>';
      body.append(range,el('p','helper','Vurgulayıcı ve silginin gerçek davranışı ana çizim motoruna bağlıdır. Bu örnekte silgi dokunulan çizginin tamamını kaldırır.'));
      this._open('ink','Renk ve kalınlık','SIK KULLANILAN AYARLAR',body);
    }
    _openPaper(){
      const body=el('div');body.append(el('h3',null,'Kâğıt düzeni'));
      const patterns=el('div','paper-options');patterns.setAttribute('role','group');patterns.setAttribute('aria-label','Kâğıt düzeni');
      Object.entries(PATTERNS).forEach(([value,label])=>{const b=el('button','paper-option');b.dataset.pattern=value;b.setAttribute('aria-pressed','false');b.innerHTML=`<span class="paper-preview ${value}" aria-hidden="true"></span><span>${label}</span>`;patterns.append(b);});
      body.append(patterns,el('h3',null,'Sayfa rengi'),this._swatches(PAPERS,'data-paper-color'));
      const custom=el('label','custom-color');custom.innerHTML='Özel sayfa rengi <input type="color" data-custom-paper aria-label="Özel sayfa rengi">';body.append(custom,el('p','helper warning','Yalnızca açık sayfa değişir. Mevcut yazı ve çizgiler korunmalıdır; bunu ana uygulamanın paper.set komutu uygular.'));
      this._open('paper','Kâğıt görünümü','YALNIZCA AÇIK SAYFA',body);
    }
    _openSettings(){
      const body=el('div');body.append(el('h3',null,'Kalem ve dokunma'));
      [
        ['fingerDraw','Parmakla çizim','Kapalıyken kalem yazar, parmak sayfada gezinir.'],
        ['lockTouch','Parmakla kaydırmayı kilitle','Henüz desteklenmiyor. İki parmakla kaydırma kullanılabilir.'],
        ['pressure','Kalem basıncı','Uyumlu kalemlerde otomatik uygulanır; ayrı açma/kapama henüz yok.'],
      ].forEach(([key,title,help])=>{const label=el('label','toggle');label.innerHTML=`<span><strong>${title}</strong><small>${help}</small></span><input type="checkbox" data-input-pref="${key}">`;body.append(label);});
      body.append(el('p','helper','Parmak çizimini kapatmak, donanımsal avuç içi algılama garantisi değildir. Gerçek kalem ve tablet testi gerekir.'),el('h3',null,'Dış çerçeve'));
      const colors=el('div','theme-options');THEMES.forEach(([color,label])=>{const b=el('button','theme-option');b.dataset.frame=color;b.setAttribute('aria-pressed','false');b.innerHTML=`<span style="border-color:${color}"></span><small>${label}</small>`;colors.append(b);});body.append(colors);
      const custom=el('label','custom-color');custom.innerHTML='Özel çerçeve rengi <input type="color" data-custom-frame aria-label="Özel çerçeve rengi">';body.append(custom,el('p','helper','Çerçeve tercihi kâğıt rengini ve notları değiştirmez. Saklama ana uygulamanın tercih katmanındadır.'),el('h3',null,'Kurulum ve kayıt'));
      const list=el('div','action-list');list.append(this._action('settings.install'),this._action('storage.persist'),this._action('study.guide'));body.append(list);
      const buttonTheme=document.createElement('bilge-button-theme-settings');buttonTheme.controller=this._buttonTheme;body.prepend(buttonTheme);
      this._open('settings','Ayarlar','NOT ALMA DENEYİMİN',body);
    }
    _openLibrary(){
      const body=el('div');body.innerHTML=`
        <label class="field-label" for="bdx-book-select">Defter / ders</label><select id="bdx-book-select"></select>
        <div class="two-buttons"><button class="button subtle" data-command="notebook.create">+ Yeni defter</button><button class="button subtle" data-command="notebook.rename">Defteri düzenle</button></div>
        <button class="button primary full" data-command="page.create">+ Yeni sayfa</button>
        <button class="button subtle full" data-command="presentation.library">Önceki sunumlar</button>
        <label class="field-label" for="bdx-page-search">Sayfa ara</label><input id="bdx-page-search" class="input" type="search" placeholder="Sayfa başlığı…" maxlength="100" autocomplete="off">
        <div class="library-stats"><span>BU DEFTERDE</span><span id="bdx-page-count"></span></div>
        <div class="page-list"></div><div class="section-line"></div>
        <button class="button subtle full" data-command="trash.open">Çöp kutusu</button>
        <p class="helper warning">Yerel kayıt, sunucu eşitlemesi ve bağımsız yedek farklı şeylerdir. Buradan defter seçmek notları taşımaz.</p>`;
      this._libraryKey='';this._open('library','Defterler ve sayfalar','ÇALIŞMA ALANIN',body);this._renderLibraryList();
    }
    _renderLibraryList(){
      if(!this.$('#bdx-book-select'))return;const s=this._state;
      const books=Array.isArray(s.books)?s.books:[],pages=Array.isArray(s.pages)?s.pages:[];
      const current=s.selectedBookId||s.page?.bookId;
      const bookSelect=this.$('#bdx-book-select');const bkey=JSON.stringify(books.map(b=>[b.id,b.name]));
      if(bookSelect.dataset.key!==bkey){bookSelect.replaceChildren();books.forEach(b=>{const opt=el('option',null,cleanText(b.name));opt.value=b.id;bookSelect.append(opt);});bookSelect.dataset.key=bkey;}
      bookSelect.value=current||'';bookSelect.disabled=!this.available('library.selectNotebook');
      const query=this.$('#bdx-page-search').value.toLocaleLowerCase('tr').trim();
      const filtered=pages.filter(p=>p.bookId===current&&!p.deleted);
      this.$('#bdx-page-count').textContent=filtered.length+' sayfa';
      const matching=filtered.filter(p=>cleanText(p.title).toLocaleLowerCase('tr').includes(query));
      const key=JSON.stringify([matching.map(p=>[p.id,p.title,p.subtitle]),s.page?.id,current,this.available('library.selectPage')]);
      if(key!==this._libraryKey){
        this._libraryKey=key;const list=this.$('.page-list');list.replaceChildren();
        matching.forEach(p=>{const b=el('button','page-item');b.dataset.selectPage=p.id;if(p.id===s.page?.id)b.setAttribute('aria-current','page');b.disabled=!this.available('library.selectPage');const thumb=el('span','page-thumb');thumb.setAttribute('aria-hidden','true');const t=el('span','page-text');t.append(el('strong',null,cleanText(p.title,'Başlıksız')),el('small',null,cleanText(p.subtitle,'Not sayfası')));b.append(thumb,t);list.append(b);});
        if(!matching.length)list.append(el('p','empty',query?'Bu başlıkta sayfa bulunamadı.':'Henüz sayfa yok. Yeni sayfa ekle.'));
      }
      this.$('[data-command="trash.open"]').textContent='Çöp kutusu ('+(Number.isFinite(s.trashCount)?s.trashCount:0)+')';
    }
    _updatePanelControls(){
      const s=this._state,ink=s.ink||{},paper=s.paper||{},focused=this.shadowRoot.activeElement;
      this._panel.querySelectorAll('[data-command]').forEach(b=>{b.disabled=!this.available(b.dataset.command);if(b.matches('.action'))b.querySelector('small').textContent=b.disabled?this.unavailableReason(b.dataset.command):ACTIONS[b.dataset.command].desc;});
      this._panel.querySelectorAll('[data-ink]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.ink===ink.color));b.disabled=!this.available('ink.set');});
      this._panel.querySelectorAll('[data-width]').forEach(b=>{b.setAttribute('aria-pressed',String(Number(b.dataset.width)===ink.width));b.disabled=!this.available('ink.set');});
      const width=this.$('[data-width-range]');if(width){width.max=s.tool==='eraser'?'64':'24';if(focused!==width)width.value=String(ink.width||4);width.disabled=!this.available('ink.set');this.$('#bdx-width-value').textContent=(ink.width||4)+' px';const sample=this.$('.stroke-sample span');sample.style.height=(ink.width||4)+'px';sample.style.backgroundColor=isHex(ink.color)?ink.color:'#234e40';}
      this._panel.querySelectorAll('[data-pattern]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.pattern===paper.pattern));b.disabled=!this.available('paper.set');});
      this._panel.querySelectorAll('[data-paper-color]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.paperColor===paper.color));b.disabled=!this.available('paper.set');});
      [['data-custom-ink',ink.color,'ink.set'],['data-custom-paper',paper.color,'paper.set'],['data-custom-frame',s.frameColor,'settings.frame']].forEach(([attr,color,id])=>{const n=this.$('['+attr+']');if(n){if(n!==focused&&isHex(color))n.value=color;n.disabled=!this.available(id);}});
      this._panel.querySelectorAll('[data-input-pref]').forEach(n=>{n.checked=Boolean(s.input?.[n.dataset.inputPref]);n.disabled=n.dataset.inputPref!=='fingerDraw'||!this.available('settings.input');});
      this._panel.querySelectorAll('[data-frame]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.frame===s.frameColor));b.disabled=!this.available('settings.frame');});
    }
    _click(event){
      const b=event.target.closest('button');if(!b||b.disabled)return;
      if(b.hasAttribute('data-close-onboarding')){this.closeOnboarding(true);return;}
      if(b.dataset.onboardStep!==undefined){this.setOnboardingStep(Number(b.dataset.onboardStep));return;}
      if(b.dataset.onboardAction==='prev'){this.setOnboardingStep(this._onboardingStep-1);return;}
      if(b.dataset.onboardAction==='next'){this.setOnboardingStep(this._onboardingStep+1);return;}
      if(b.dataset.onboardAction==='start'){this.closeOnboarding(true);return;}
      if(b.dataset.onboardDot!==undefined){this.setOnboardingStep(Number(b.dataset.onboardDot));return;}
      if(b.hasAttribute('data-confirm')){const done=this._confirmResolve;this._confirmResolve=null;this.closePanel(false);done?.(b.dataset.confirm==='yes');return;}
      if(b.hasAttribute('data-return-editor')){this.closePanel(false);this.focusEditor();return;}
      if(b.hasAttribute('data-close-panel')){this.closePanel();return;}
      if(b.hasAttribute('data-close-alert')){this.$('.alert').hidden=true;return;}
      if(b.hasAttribute('data-focus')){this._focusMode=!this._focusMode;this.$('.shell').classList.toggle('focus-mode',this._focusMode);this.$('.nav-focus').setAttribute('aria-pressed',String(this._focusMode));this.$('.nav-focus span').textContent=this._focusMode?'Odağı kapat':'Odaklan';this.dispatchEvent(new CustomEvent('bdx-layout-change'));return;}
      if(b.dataset.panel){this.openPanel(b.dataset.panel);return;}
      const toolId=b.dataset.v2Tool||b.dataset.tool;if(toolId){void this.run('tool.select',{tool:toolId},{close:false});return;}
      if(b.dataset.ink){void this.run('ink.set',{color:b.dataset.ink},{close:false});return;}
      if(b.dataset.width){void this.run('ink.set',{width:Number(b.dataset.width)},{close:false});return;}
      if(b.dataset.pattern){void this.run('paper.set',{pattern:b.dataset.pattern},{close:false});return;}
      if(b.dataset.paperColor){void this.run('paper.set',{color:b.dataset.paperColor},{close:false});return;}
      if(b.dataset.frame){void this.run('settings.frame',{color:b.dataset.frame},{close:false});return;}
      if(b.dataset.selectPage){void this.run('library.selectPage',{id:b.dataset.selectPage});return;}
      if(b.dataset.zoom){void this.run('view.zoom',{mode:b.dataset.zoom},{close:false});return;}
      if(b.dataset.command)void this.run(b.dataset.command);
    }
    _input(event){
      const t=event.target;
      if(t.id==='bdx-page-search'){this._renderLibraryList();return;}
      // Slider hareketinde yalnız önizleme; bırakınca tek state değişikliği.
      if(t.hasAttribute('data-width-range')){this.$('#bdx-width-value').textContent=t.value+' px';this.$('.stroke-sample span').style.height=t.value+'px';}
    }
    _change(event){
      const t=event.target;
      if(t.hasAttribute('data-width-range')){const width=Number(t.value);if(Number.isFinite(width)&&width>=1&&width<=Number(t.max))void this.run('ink.set',{width},{close:false});return;}
      if(t.hasAttribute('data-custom-ink')&&isHex(t.value)){void this.run('ink.set',{color:t.value},{close:false});return;}
      if(t.hasAttribute('data-custom-paper')&&isHex(t.value)){void this.run('paper.set',{color:t.value},{close:false});return;}
      if(t.hasAttribute('data-custom-frame')&&isHex(t.value)){void this.run('settings.frame',{color:t.value},{close:false});return;}
      if(t.dataset.inputPref){void this.run('settings.input',{[t.dataset.inputPref]:t.checked},{close:false});return;}
      if(t.id==='bdx-book-select')void this.run('library.selectNotebook',{id:t.value},{close:false});
    }
  }
  if(!customElements.get('bilge-defter-ui'))customElements.define('bilge-defter-ui',BilgeDefterUI);
  globalThis.BilgeDefterUI=Object.freeze({version:'2.1.0',commands:Object.keys(ACTIONS),groups:GROUPS});
})();
