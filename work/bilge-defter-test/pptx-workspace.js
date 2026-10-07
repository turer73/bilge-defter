// New PPTX imports become ordinary notebook image pages. The old independent
// presentation store remains readable and is never migrated or deleted here.
(() => {
  'use strict';
  const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
  let generation = 0, revoked = false, opening = false, closing = null;
  let pilot = null, dialog = null, context = null, returnFocus = null, importSession = null;
  const notify = text => {
    const ui = window.__v2UI?.ui;
    if (ui?.showError) ui.showError(text); else alert(text);
  };
  function capture() {
    const account = window.BilgeAccount, identity = account?.identity;
    if (revoked || !account?.required || account.locked || identity?.type !== 'access' ||
        identity.status !== 'approved' || !UUID.test(identity.id || '') ||
        typeof ready === 'undefined' || !ready || typeof DB !== 'string' ||
        DB !== 'bilge-defter-account-' + identity.id) return null;
    const notebook = notebooks().find(book => book.id === activeNotebook);
    if (!notebook) return null;
    return {account, id:identity.id, scope:DB, state, notebook:{id:notebook.id, title:notebook.title}};
  }
  function current(value = context) {
    if (!value || revoked) return false;
    const account = window.BilgeAccount;
    return account === value.account && account.required === true && !account.locked &&
      account.identity?.type === 'access' && account.identity?.status === 'approved' &&
      account.identity?.id === value.id && ready && DB === value.scope && state === value.state &&
      activeNotebook === value.notebook.id && notebooks().some(book => book.id === value.notebook.id);
  }
  function pendingEdit() {
    return (typeof drawing !== 'undefined' && drawing) || (typeof pan !== 'undefined' && pan) ||
      (typeof pinchT !== 'undefined' && pinchT) || (typeof mediaPending !== 'undefined' && mediaPending) ||
      (typeof mediaGesture !== 'undefined' && mediaGesture) || (typeof plannerDirty !== 'undefined' && plannerDirty) ||
      (typeof importing !== 'undefined' && importing) || (typeof pdfBusy !== 'undefined' && pdfBusy) ||
      (typeof pdfExportBusy !== 'undefined' && pdfExportBusy);
  }
  function cleanup({restoreFocus = true} = {}) {
    generation++; opening = false;
    const previous = pilot, previousDialog = dialog, previousImport = importSession;
    pilot = null; dialog = null; context = null; importSession = null;
    if (previousImport) {
      window.BilgeRasterImport?.revoke(previousImport.lease);
      previousImport.abort?.abort(); previousImport.renderer?.dispose(); previousImport.store?.close();
      previousImport.pages = null; previousImport.source = null;
    }
    previous?.destroy();
    if (previousDialog) { if (previousDialog.open) previousDialog.close(); previousDialog.remove(); }
    if (restoreFocus && !revoked && !window.BilgeAccount?.locked && returnFocus?.isConnected) {
      try { returnFocus.focus({preventScroll:true}); } catch {}
    }
    returnFocus = null;
  }
  async function close() {
    if (closing) return closing;
    if (!dialog) return true;
    // An already submitted notebook transaction must report its result first.
    if (importSession?.phase === 'committing') return false;
    if (!current()) { cleanup({restoreFocus:false}); return false; }
    if (opening) { cleanup(); return true; }
    const selected = pilot;
    if (!selected) { cleanup(); return true; }
    closing = (async () => {
      // A failed save keeps the visible draft and recovery controls open.
      const result = await selected.requestClose();
      return result === true;
    })().catch(() => false).finally(() => { closing = null; });
    return closing;
  }
  async function prepareToLeave() {
    if (importSession) {
      if (importSession.phase === 'committing') return false;
      cleanup(); return true;
    }
    if (opening || closing) return false;
    if (!pilot) return true;
    if (!current()) return false;
    return pilot.prepareToLeave();
  }
  async function hasNotebookPresentations(id) {
    // Unauthenticated local notebook fixtures cannot create native app records.
    if (!window.BilgeAccount?.required) return false;
    const selected = capture();
    if (!selected || selected.notebook.id !== id || opening || pilot || importSession) throw Error('STALE');
    const own = generation;
    const valid = () => generation === own && current(selected);
    const {openStore} = await import('./pptx/store.js');
    if (!valid()) throw Error('STALE');
    const store = await openStore(selected.scope, {guard:valid});
    try {
      const records = await store.list();
      if (!valid()) throw Error('STALE');
      return records.some(record => record.notebook?.id === id);
    } finally { store.close(); }
  }
  async function open() {
    if (opening || pilot || dialog) return {ok:false, message:'Sunum penceresi zaten açık.'};
    const selected = capture();
    if (!selected) return {ok:false, message:'Sunum için onaylı hesabınızla giriş yapın. Hesapsız sunum alanı açılmadı.'};
    if (!canEdit() || pendingEdit()) return {ok:false, message:'Önce açık çizim, düzenleme veya içe aktarma işlemini tamamlayın.'};
    context = selected; opening = true; const own = ++generation;
    returnFocus = document.activeElement;
    if (typeof closeTools === 'function') closeTools();
    if (typeof setSidebarOpen === 'function') setSidebarOpen(false);
    dialog = document.createElement('dialog'); dialog.id = 'pptxWorkspace';
    dialog.setAttribute('aria-label', selected.notebook.title + ' defterinin sunumları');
    const shell = document.createElement('div'); dialog.append(shell);
    const shadow = shell.attachShadow({mode:'open'});
    const status = document.createElement('p'); status.id = 'pptxWorkspaceLoading'; status.setAttribute('role','status');
    status.textContent = 'Defter kaydediliyor, sunum alanı hazırlanıyor…';
    const cancel = document.createElement('button'); cancel.id = 'pptxWorkspaceCancel'; cancel.type = 'button'; cancel.textContent = 'Deftere dön';
    cancel.onclick = () => void close(); shadow.append(status, cancel);
    dialog.addEventListener('cancel', event => { event.preventDefault(); void close(); });
    // No generic dialog closer may bypass the pilot's successful-save barrier.
    const ownerDialog = dialog;
    dialog.addEventListener('close', () => {
      if (ownerDialog !== dialog) return;
      if (!current()) { cleanup({restoreFocus:false}); return; }
      if (!ownerDialog.open) ownerDialog.showModal();
    });
    document.body.append(dialog); dialog.showModal(); cancel.focus({preventScroll:true});
    try {
      if (!await flushSave()) throw Error('SAVE');
      if (generation !== own || !current(selected)) return {ok:false, message:'Sunum açılırken hesap veya defter değişti; işlem uygulanmadı.'};
      const verifiedScope = await selected.account.ready;
      if (verifiedScope !== selected.scope || generation !== own || !current(selected)) throw Error('STALE');
      const stylesheet = document.createElement('link'); stylesheet.rel = 'stylesheet'; stylesheet.href = './pptx/host.css';
      const styled = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(Error('STYLE')), 15000);
        stylesheet.onload = () => { clearTimeout(timeout); resolve(); };
        stylesheet.onerror = () => { clearTimeout(timeout); reject(Error('STYLE')); };
      });
      shadow.prepend(stylesheet);
      const [{mountPilot}] = await Promise.all([import('./pptx/host.js'), styled]);
      if (generation !== own || !current(selected)) return {ok:false, message:'Sunum açılışı iptal edildi.'};
      const mount = document.createElement('div'); shadow.append(mount);
      const created = await mountPilot(mount, {
        scope:selected.scope, notebook:selected.notebook, mode:'app',
        guard:() => generation === own && current(selected),
        onClose:() => { if (generation === own) cleanup(); }
      });
      if (generation !== own || !current(selected)) { created.destroy(); return {ok:false, message:'Sunum açılışı iptal edildi.'}; }
      pilot = created; opening = false; status.remove(); cancel.remove();
      shadow.querySelector('#pptxExit')?.focus({preventScroll:true});
      return {ok:true};
    } catch (error) {
      if (generation !== own) return {ok:false, message:'Sunum açılışı iptal edildi.'};
      const message = error.message === 'SAVE' ? 'Defter kaydedilemedi. Önce mevcut defterin yedeğini alın; sunum açılmadı.' :
        'Sunum alanı hazırlanamadı. Mevcut notlar korunuyor; bağlantıyı ve uygulama güncellemesini denetleyin.';
      cleanup(); return {ok:false, message};
    } finally {
      if (generation === own && !pilot) cleanup({restoreFocus:current(selected)});
    }
  }
  // The old reader stores variable-pressure segments. Split them into ordinary
  // pen segments with fixed effective widths; they remain editable/erasable,
  // rather than permanently baking old handwriting into the slide background.
  function notebookInk(notes, meta, model) {
    const result = new Map(); let points = 0, count = 0;
    for (const entry of model.normalizeStrokes(notes, meta)) {
      const strokes = [];
      for (const stroke of entry.strokes) {
        for (let i = 0; i < Math.max(1, stroke.points.length - 1); i++) {
          const a = stroke.points[i], b = stroke.points[i + 1];
          const segment = {tool:'pen', color:stroke.color,
            width:Math.max(.5, stroke.width * (a.pressure > 0 ? .35 + a.pressure * .9 : 1)),
            points:[{x:a.x, y:a.y, p:.5}, ...(b ? [{x:b.x, y:b.y, p:.5}] : [])]};
          points += segment.points.length;
          if (++count > 500000 || points > 1000000) throw Error('Eski notlar aktarım sınırını aşıyor. İsterseniz eski notları aktarmadan hazırlayın; özgün notlar korunur.');
          strokes.push(segment);
        }
      }
      result.set(entry.slide, strokes);
    }
    if (JSON.stringify([...result.values()]).length > 16 * 1024 * 1024)
      throw Error('Eski notlar 16 MB aktarım sınırını aşıyor. Notlar olmadan hazırlayabilirsiniz; özgün kayıt korunur.');
    return result;
  }
  async function importToNotebook() {
    if (opening || pilot || dialog) return {ok:false, message:'Önce açık sunum penceresini kapatın.'};
    const selected = capture(), helper = window.BilgeRasterImport;
    if (!selected || !helper) return {ok:false, message:'Sunum eklemek için onaylı hesabınızla giriş yapın ve uygulamayı güncelleyin.'};
    if (!canEdit() || pendingEdit()) return {ok:false, message:'Önce açık çizim, düzenleme veya içe aktarma işlemini tamamlayın.'};
    context = selected; opening = true; const own = ++generation;
    returnFocus = document.activeElement;
    if (typeof closeTools === 'function') closeTools();
    if (typeof setSidebarOpen === 'function') setSidebarOpen(false);
    const owner = document.createElement('dialog'); owner.id = 'pptxImportDialog'; dialog = owner;
    owner.setAttribute('aria-labelledby', 'pptxNotebookTitle');
    owner.innerHTML = `<header><h2 id="pptxNotebookTitle">PowerPoint ekle</h2><button type="button" id="pptxNotebookCancel">Vazgeç</button></header>
      <p class="pptx-import-intro">Slaytları defter sayfalarına ekleyin, üzerine kalemle yazın.</p>
      <div class="pptx-import-source"><button type="button" id="pptxNotebookChoose" class="pptx-primary">Sunum seç</button><span class="pptx-import-hint">PPTX · En fazla 20 MiB / 100 slayt</span>
      <input id="pptxNotebookFile" type="file" hidden aria-label="PowerPoint dosyası seç" accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation">
      <p id="pptxNotebookFilename" hidden></p></div>
      <div class="pptx-import-target"><p id="pptxNotebookTarget"></p><label class="pptx-check"><input type="checkbox" id="pptxNotebookNew"> Yeni defter oluştur</label></div>
      <p class="pptx-import-preserved">Mevcut sayfalar korunur.</p>
      <progress id="pptxNotebookProgress" aria-label="Slayt hazırlama ilerlemesi" hidden></progress>
      <p id="pptxNotebookStatus" role="status" aria-live="polite">Mevcut defter kaydediliyor…</p>
      <p id="pptxNotebookWarning" class="pptx-import-notice" hidden></p>
      <button type="button" id="pptxNotebookPrepare" hidden disabled>Yeniden hazırla</button>
      <figure id="pptxNotebookPreview" hidden><img alt="Hazırlanan sunumun ilk slayt zemini"><figcaption>İlk slaytın önizlemesi</figcaption></figure>
      <details id="pptxNotebookLegacy"><summary>Eski sunum veya yedekten ekle</summary>
      <button type="button" id="pptxNotebookChooseBackup">Sunum yedeği seç (.bdpptx)</button><input id="pptxNotebookBackup" type="file" hidden aria-label="Sunum ve not yedeği seç" accept=".bdpptx,application/x-bilge-defter-pptx">
      <label>Bu defterdeki eski sunum<select id="pptxNotebookSaved" disabled><option value="">Kayıtlar denetleniyor…</option></select></label><button type="button" id="pptxNotebookLoadSaved" disabled>Seçili sunumu hazırla</button><p id="pptxNotebookSavedStatus" role="status"></p></details>
      <div id="pptxNotebookNotesRow" hidden><label class="pptx-check"><input type="checkbox" id="pptxNotebookNotes" checked> Önceki kalem notlarını da aktar</label><p>Notların konumu ve kalınlığı korunmaya çalışılır; ince çizgiler ve çizgi uçları biraz farklı görünebilir. Asıl kayıt değiştirilmez.</p></div>
      <details id="pptxNotebookInfo"><summary>Yedek ve görünüm bilgisi</summary><p>Slaytlar bu cihazda hazırlanır; sunucuya gönderilmez ve PDF’e dönüştürülmez. Hazırlanan sayfalar normal JSON defter yedeğine dahildir. Özgün PPTX dosyası bu yedeğe eklenmez; dosyanızı ve varsa eski .bdpptx yedeğinizi saklayın.</p><p>Animasyon ve geçişler aktarılmaz; görünüm PowerPoint ile birebir olmayabilir.</p></details>
      <footer><button type="button" id="pptxNotebookApply" class="pptx-primary" disabled>Deftere ekle</button></footer><div id="pptxNotebookRenderer" aria-hidden="true"></div>`;
    const el = id => owner.querySelector('#' + id);
    const session = {phase:'opening', request:0, pages:null, source:null, lease:null, abort:null, renderer:null, store:null, model:null, createRenderer:null, selectedName:'', completed:0, total:0};
    importSession = session;
    const valid = () => importSession === session && generation === own && current(selected);
    const validLease = () => valid() && session.lease && helper.isCurrent(session.lease);
    const check = request => { if (!validLease() || (request !== undefined && session.request !== request)) throw Error('Hesap, defter veya işlem değişti. Pencereyi yeniden açın.'); };
    const message = text => { if (valid()) el('pptxNotebookStatus').textContent = text; };
    function progress() {
      const bar = el('pptxNotebookProgress');
      bar.hidden = session.phase !== 'preparing';
      if (session.total) { bar.max = session.total; bar.value = session.completed; bar.setAttribute('aria-valuetext', `${session.completed} / ${session.total} slayt hazır`); }
      else { bar.removeAttribute('value'); bar.removeAttribute('aria-valuetext'); }
    }
    function controls() {
      const blocked = ['opening','committing','uncertain'].includes(session.phase);
      for (const id of ['pptxNotebookFile','pptxNotebookBackup','pptxNotebookChoose','pptxNotebookChooseBackup','pptxNotebookNew','pptxNotebookSaved']) el(id).disabled = blocked;
      el('pptxNotebookChoose').textContent = session.selectedName ? 'Sunumu değiştir' : 'Sunum seç';
      el('pptxNotebookChoose').classList.toggle('pptx-primary', !session.selectedName);
      el('pptxNotebookFilename').hidden = !session.selectedName;
      el('pptxNotebookFilename').textContent = session.selectedName;
      el('pptxNotebookTarget').textContent = el('pptxNotebookNew').checked ? 'Hedef: Sunum adıyla yeni defter' : 'Hedef: ' + selected.notebook.title;
      el('pptxNotebookLoadSaved').disabled = blocked || !session.store || !el('pptxNotebookSaved').value;
      el('pptxNotebookNotes').disabled = blocked || session.phase === 'preparing';
      el('pptxNotebookPrepare').hidden = !['error','selected'].includes(session.phase) || !session.source;
      el('pptxNotebookPrepare').disabled = blocked || session.phase === 'preparing' || !session.source;
      el('pptxNotebookApply').disabled = session.phase !== 'ready' || !session.pages;
      el('pptxNotebookApply').textContent = session.phase === 'committing' ? 'Ekleniyor…' : session.phase === 'ready' && session.pages ? `${session.pages.length} slaytı ekle` : 'Deftere ekle';
      el('pptxNotebookCancel').disabled = session.phase === 'committing';
      el('pptxNotebookCancel').textContent = session.phase === 'uncertain' ? 'Kapat ve defteri kontrol et' : 'Vazgeç';
      // Keep the live status outside aria-busy so preparation updates are announced.
      el('pptxNotebookPreview').setAttribute('aria-busy', String(session.phase === 'preparing'));
      progress();
    }
    function stopPreparation() {
      session.request++; session.abort?.abort(); session.renderer?.dispose();
      session.abort = null; session.renderer = null; session.pages = null;
      session.completed = 0; session.total = 0;
      el('pptxNotebookPreview').hidden = true; el('pptxNotebookPreview').querySelector('img').removeAttribute('src');
      el('pptxNotebookWarning').hidden = true;
    }
    async function prepare(sourceReader, {reuse = false, name = ''} = {}) {
      if (!validLease() || ['opening','committing','uncertain'].includes(session.phase)) return;
      stopPreparation(); const request = session.request;
      if (!reuse) { session.source = null; session.selectedName = name; el('pptxNotebookNotesRow').hidden = true; }
      session.phase = 'preparing'; controls(); message('Sunum bu cihazda doğrulanıyor…');
      const abort = new AbortController(); session.abort = abort;
      let renderer;
      try {
        const source = await sourceReader(); check(request);
        if (!(source.bytes instanceof ArrayBuffer) || source.bytes.byteLength < 8 || source.bytes.byteLength > session.model.LIMITS.FILE_BYTES)
          throw Error('PPTX dosyası boş veya 20 MiB sınırının üzerinde.');
        source.name = session.model.sanitizeName(source.name); session.source = source;
        session.selectedName = source.name; controls();
        const hasNotes = !!source.notes?.some(entry => entry.strokes?.length);
        el('pptxNotebookNotesRow').hidden = !hasNotes;
        if (!reuse) el('pptxNotebookNotes').checked = true;
        renderer = await session.createRenderer(el('pptxNotebookRenderer'), {signal:abort.signal});
        if (!validLease() || session.request !== request) { renderer.dispose(); return; }
        session.renderer = renderer;
        const rawMeta = await renderer.load(source.bytes); check(request);
        const meta = session.model.validateMeta({slideCount:rawMeta.slideCount, width:rawMeta.width, height:rawMeta.height});
        session.total = meta.slideCount; progress();
        if (source.meta && (source.meta.slideCount !== meta.slideCount || source.meta.width !== meta.width || source.meta.height !== meta.height))
          throw Error('Yedekteki slayt bilgisi özgün sunumla uyuşmuyor; aktarılmadı.');
        const ink = hasNotes && el('pptxNotebookNotes').checked ? notebookInk(source.notes, meta, session.model) : new Map();
        const warnings = new Set(rawMeta.warnings || []), pages = []; let imageBytes = 0;
        for (let index = 0; index < meta.slideCount; index++) {
          check(request); message(`Slaytlar hazırlanıyor: ${index + 1} / ${meta.slideCount}. Henüz deftere eklenmedi.`);
          const slide = await renderer.snapshot(index); check(request);
          if (slide.index !== index || slide.width !== 1000 || !Number.isSafeInteger(slide.height) || slide.height < 100 || slide.height > 3000 ||
              typeof slide.image !== 'string' || !/^data:image\/(png|jpeg);base64,/.test(slide.image) || slide.image.length > 6 * 1024 * 1024)
            throw Error('Slayt görüntüsü güvenli aktarım sınırlarını karşılamıyor.');
          imageBytes += slide.image.length;
          if (imageBytes > 24 * 1024 * 1024) throw Error('Sunum görüntüleri 24 MB aktarım sınırını aşıyor. Sunumu bölerek deneyin.');
          pages.push({image:slide.image, width:slide.width, height:slide.height, number:index + 1, total:meta.slideCount, strokes:ink.get(index + 1) || []});
          session.completed = index + 1; progress();
          for (const warning of slide.warnings || []) warnings.add(warning);
          // Yield between slides, so cancel/account lock can stop a large deck.
          await new Promise(resolve => setTimeout(resolve, 0)); check(request);
        }
        session.pages = pages; session.phase = 'ready';
        const preview = el('pptxNotebookPreview'); preview.querySelector('img').src = pages[0].image; preview.hidden = false;
        preview.querySelector('figcaption').textContent = hasNotes && el('pptxNotebookNotes').checked ?
          'İlk slaytın zemini. Eski kalem notları düzenlenebilir çizgiler olarak eklenecek.' : 'İlk slaytın zemini.';
        message(`${pages.length} slayt hazır · ${(imageBytes / 1024 / 1024).toFixed(1)} MB. Henüz deftere eklenmedi.`);
        el('pptxNotebookWarning').hidden = !warnings.size;
        el('pptxNotebookWarning').textContent = warnings.size ? 'Bazı sunum öğeleri desteklenmeyebilir. Ekledikten sonra slaytları özgün dosyayla karşılaştırın.' : '';
      } catch (error) {
        if (!valid() || session.request !== request) return;
        session.pages = null; session.phase = 'error';
        message((error?.message || 'Sunum hazırlanamadı.') + ' Deftere hiçbir sayfa eklenmedi.');
      } finally {
        renderer?.dispose();
        if (valid() && session.request === request) { session.renderer = null; session.abort = null; controls(); }
      }
    }
    el('pptxNotebookCancel').onclick = () => void close();
    owner.addEventListener('cancel', event => { event.preventDefault(); void close(); });
    owner.addEventListener('close', () => {
      if (owner !== dialog) return;
      if (!valid()) { cleanup({restoreFocus:false}); return; }
      // Neither Escape nor a generic dialog closer may bypass the commit barrier.
      if (!owner.open) owner.showModal();
    });
    el('pptxNotebookChoose').onclick = () => el('pptxNotebookFile').click();
    el('pptxNotebookChooseBackup').onclick = () => el('pptxNotebookBackup').click();
    el('pptxNotebookNew').onchange = controls;
    el('pptxNotebookFile').onchange = event => {
      const file = event.target.files?.[0]; if (!file) return;
      void prepare(async () => {
        if (!/\.pptx$/i.test(file.name) || file.size < 8 || file.size > session.model.LIMITS.FILE_BYTES) throw Error('20 MiB altında bir .pptx dosyası seçin.');
        const bytes = await file.arrayBuffer(); return {bytes, name:file.name, notes:[]};
      }, {name:file.name});
      event.target.value = '';
    };
    el('pptxNotebookBackup').onchange = event => {
      const file = event.target.files?.[0]; if (!file) return;
      void prepare(async () => {
        if (!/\.bdpptx$/i.test(file.name)) throw Error('Bir .bdpptx sunum ve not yedeği seçin.');
        return session.model.parseBackup(file);
      }, {name:file.name});
      event.target.value = '';
    };
    el('pptxNotebookSaved').onchange = controls;
    el('pptxNotebookLoadSaved').onclick = () => {
      const id = el('pptxNotebookSaved').value;
      if (!id || !session.store) return;
      void prepare(async () => {
        const record = await session.store.get(id);
        if (record.notebook?.id !== selected.notebook.id) throw Error('Sunum başka bir deftere ait; bu seçimden aktarılmadı.');
        return record;
      }, {name:el('pptxNotebookSaved').selectedOptions[0]?.textContent || ''});
    };
    el('pptxNotebookNotes').onchange = () => {
      stopPreparation(); session.phase = 'selected'; controls();
      message('Not seçimi değişti. Deftere eklemeden önce Yeniden hazırla’ya basın.');
    };
    el('pptxNotebookPrepare').onclick = () => {
      const source = session.source;
      if (source) void prepare(async () => source, {reuse:true});
    };
    el('pptxNotebookApply').onclick = async () => {
      if (session.phase !== 'ready' || !session.pages || !validLease()) return;
      const candidate = {name:session.source.name, pages:session.pages, newNotebook:el('pptxNotebookNew').checked};
      session.phase = 'committing'; controls(); message('Sunum tek işlemle kaydediliyor. Bu pencereyi kapatmayın…');
      try {
        const result = await helper.commit(candidate, session.lease);
        if (!result?.ok) throw Error('Kayıt sonucu doğrulanamadı.');
        // The successful commit deliberately changes state/active notebook.
        if (importSession === session && generation === own) cleanup();
      } catch (error) {
        if (importSession !== session || generation !== own) return;
        const uncertain = ['ImportCommitted','ImportCommitUnknown'].includes(error?.name);
        session.phase = uncertain ? 'uncertain' : 'error'; session.pages = null;
        el('pptxNotebookStatus').textContent = error?.message || 'Sunum kaydedilemedi. Defteri ve yedeğinizi kontrol edin.';
        if (uncertain) { session.source = null; helper.revoke(session.lease); }
        controls();
      }
    };
    controls(); document.body.append(owner); owner.showModal(); el('pptxNotebookCancel').focus({preventScroll:true});
    try {
      if (!await helper.settle()) throw Error('SAVE');
      if (!valid()) throw Error('STALE');
      if (await selected.account.ready !== selected.scope || !valid()) throw Error('STALE');
      session.lease = helper.capture({guard:valid});
      if (!session.lease || session.lease.scope !== selected.scope || session.lease.notebook.id !== selected.notebook.id) throw Error('STALE');
      const [model, bridge, storage] = await Promise.all([import('./pptx/model.js'), import('./pptx/renderer-bridge.js'), import('./pptx/store.js')]);
      check(); session.model = model; session.createRenderer = bridge.createRenderer;
      session.phase = 'idle'; opening = false; controls(); message('Sunum seçtiğinizde slaytlar otomatik hazırlanır.');
      // Listing never writes a presentation. Failure must not prevent file import.
      void (async () => {
        let store;
        try {
          store = await storage.openStore(selected.scope, {guard:validLease});
          if (!validLease()) { store.close(); return; }
          session.store = store;
          const records = await store.list(); check();
          const options = records.filter(record => record.notebook?.id === selected.notebook.id);
          const select = el('pptxNotebookSaved'); select.replaceChildren();
          const empty = document.createElement('option'); empty.value = ''; empty.textContent = options.length ? 'Sunum seçin…' : 'Bu defterde eski sunum yok'; select.append(empty);
          for (const record of options) { const option = document.createElement('option'); option.value = record.id; option.textContent = record.name; select.append(option); }
          el('pptxNotebookSavedStatus').textContent = 'Eski kayıtlar korunur; bu işlem deftere ayrı bir kopya ekler.';
        } catch {
          store?.close(); if (valid()) { session.store = null; el('pptxNotebookSavedStatus').textContent = 'Eski sunum listesi okunamadı. Özgün dosyanızı veya .bdpptx yedeğinizi kullanabilirsiniz.'; }
        } finally { if (valid()) controls(); }
      })();
      return {ok:true};
    } catch (error) {
      if (generation !== own) return {ok:false, message:'Sunum ekleme iptal edildi.'};
      cleanup(); return {ok:false, message:error.message === 'SAVE' ? 'Mevcut defter kaydedilemedi. Önce yedek alın; sunum ekleme açılmadı.' : 'Sunum ekleme hazırlanamadı. Hesap durumunu ve uygulama güncellemesini kontrol edin.'};
    }
  }
  const style = document.createElement('style');
  style.textContent = '#pptxWorkspace{position:fixed;inset:0;margin:0;width:100%;height:100%;width:100dvw;height:100dvh;max-width:none;max-height:none;box-sizing:border-box;overflow:auto;padding:0;border:0;border-radius:0;background:#eef3ef;color:#173b36}#pptxWorkspace::backdrop{background:#173b36cc}#pptxWorkspace>div{height:100%}';
  document.head.append(style);
  style.textContent += `
    #pptxImportDialog{box-sizing:border-box;width:min(620px,calc(100vw - 24px));max-height:calc(100dvh - 24px);padding:20px 22px 0;overflow:auto;border:1px solid #d5e1da;border-radius:20px;color:#173b36;background:#fffef9;font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;box-shadow:0 18px 60px #173b3626}
    #pptxImportDialog::backdrop{background:#173b3680}
    #pptxImportDialog *{box-sizing:border-box}
    /* Main-app header/footer rules must not style this self-contained dialog. */
    #pptxImportDialog>header,#pptxImportDialog>footer{all:unset;box-sizing:border-box;display:flex;gap:12px;align-items:center;justify-content:space-between;color:inherit;background:#fffef9;font:inherit}
    #pptxImportDialog>header{padding:0 0 12px;border-bottom:1px solid #dce6e1}
    #pptxImportDialog>footer{position:sticky;bottom:0;z-index:1;padding:14px 0 max(16px,env(safe-area-inset-bottom));margin-top:10px;border-top:1px solid #dce6e1}
    #pptxImportDialog h2{color:inherit;font:700 21px/1.25 system-ui,-apple-system,"Segoe UI",sans-serif;margin:0;min-width:0}
    #pptxImportDialog p{margin:10px 0;line-height:1.5;overflow-wrap:anywhere}
    #pptxImportDialog .pptx-import-intro{color:#52695f;margin:14px 0}
    #pptxImportDialog label{display:block;min-width:0;margin:12px 0}
    #pptxImportDialog select{display:block;width:100%;min-width:0;max-width:100%;min-height:44px;margin-top:7px;padding:10px;border:1px solid #bdcfc5;border-radius:10px;background:#fff;color:#173b36;font-family:inherit;font-size:16px;line-height:1.4}
    #pptxImportDialog .pptx-check{display:flex;gap:10px;align-items:center;min-height:44px;margin:0;cursor:pointer}
    #pptxImportDialog .pptx-check input{flex:none;width:20px;height:20px;min-height:0;margin:0;accent-color:#255f50}
    #pptxImportDialog button{width:auto;min-width:44px;min-height:44px;margin:0;padding:10px 14px;border:1px solid #bacfc2;border-radius:11px;color:#173b36;background:#edf4ef;font:600 14px/1.35 system-ui,-apple-system,"Segoe UI",sans-serif;cursor:pointer}
    #pptxImportDialog button:disabled{cursor:not-allowed;opacity:.55}
    #pptxImportDialog button.pptx-primary{color:#fff;background:#255f50;border-color:#255f50}
    #pptxImportDialog button:focus-visible,#pptxImportDialog summary:focus-visible,#pptxImportDialog input:focus-visible,#pptxImportDialog select:focus-visible{outline:3px solid #005ea5;outline-offset:3px}
    #pptxNotebookCancel{flex:none;max-width:55%}
    #pptxImportDialog #pptxNotebookApply{flex:1;width:100%;min-height:48px;font-size:16px}
    #pptxImportDialog .pptx-import-source{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;margin:0 0 14px}
    #pptxImportDialog .pptx-import-hint{font-size:12px;color:#52695f}
    #pptxImportDialog #pptxNotebookFilename{width:100%;margin:0;font-weight:600}
    #pptxImportDialog .pptx-import-target{padding:10px 12px 4px;border:1px solid #dce6e1;border-radius:12px;background:#f2f6f1}
    #pptxImportDialog #pptxNotebookTarget{margin:0;font-weight:600}
    #pptxImportDialog .pptx-import-preserved{color:#52695f;font-size:12px;margin:8px 0}
    #pptxNotebookStatus{font-size:13px;min-height:20px}
    #pptxNotebookProgress{display:block;width:100%;height:8px;margin:12px 0;accent-color:#255f50}
    #pptxImportDialog details{margin-top:8px;padding:0 12px;border:1px solid #dce6e1;border-radius:11px;min-width:0;background:transparent}
    #pptxImportDialog summary{min-height:44px;padding:11px 0;cursor:pointer;font-weight:600;font-size:13px;line-height:22px}
    #pptxImportDialog details[open]{padding-bottom:10px}
    #pptxImportDialog details p,#pptxNotebookNotesRow p{font-size:12px;color:#52695f}
    #pptxNotebookPreview{margin:10px 0 14px}
    #pptxNotebookPreview img{display:block;width:100%;height:160px;object-fit:contain;border:1px solid #dce6e1;border-radius:10px;background:#f2f5f2}
    #pptxNotebookPreview figcaption{font-size:12px;color:#52695f;line-height:1.5;margin-top:5px}
    #pptxImportDialog .pptx-import-notice{font-size:13px;background:#fff3dc;color:#6b4719;padding:10px 12px;border-radius:10px}
    #pptxNotebookRenderer{position:fixed;left:-10000px;top:0;width:1000px;height:3000px;overflow:hidden;contain:strict;pointer-events:none}
    #pptxImportDialog [hidden]{display:none!important}
    @media(max-width:440px){#pptxImportDialog{padding:16px 16px 0;border-radius:16px}#pptxImportDialog h2{font-size:19px}#pptxNotebookPreview img{height:130px}#pptxImportDialog .pptx-import-source{gap:7px 10px}}
    @media(forced-colors:active){#pptxImportDialog button{border:1px solid ButtonText}#pptxImportDialog button.pptx-primary{color:ButtonText;background:ButtonFace}}
  `;
  window.BilgePptx = Object.freeze({open, importToNotebook, close, prepareToLeave, hasNotebookPresentations,
    get active() { return !!dialog; }, get opening() { return opening; },
    snapshot:() => ({active:!!dialog, opening, notebookId:context?.notebook.id || null, pilot:pilot?.snapshot() || null,
      import:importSession ? {phase:importSession.phase, pages:importSession.pages?.length || 0} : null})
  });
  addEventListener('bilge-account-locked', () => { revoked = true; cleanup({restoreFocus:false}); });
  const button = document.createElement('button'); button.id = 'pptxNotebookOpen'; button.className = 'btn';
  button.type = 'button'; button.textContent = 'Bu defterin sunumları';
  button.onclick = () => void open().then(result => { if (result?.ok === false) notify(result.message); });
  document.querySelector('#newPage')?.after(button);
  const legacyPdf = document.querySelector('#presentationOpen');
  if (legacyPdf) legacyPdf.textContent = 'PowerPoint → PDF (sunucu)';
})();
