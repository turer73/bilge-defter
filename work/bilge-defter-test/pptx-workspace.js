// Native presentations use their own account-scoped store. The ordinary
// notebook schema and PDF import path remain unchanged.
(() => {
  'use strict';
  const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
  let generation = 0, revoked = false, opening = false, closing = null;
  let pilot = null, dialog = null, context = null, returnFocus = null;
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
    const previous = pilot, previousDialog = dialog;
    pilot = null; dialog = null; context = null;
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
    if (opening || closing) return false;
    if (!pilot) return true;
    if (!current()) return false;
    return pilot.prepareToLeave();
  }
  async function hasNotebookPresentations(id) {
    // Unauthenticated local notebook fixtures cannot create native app records.
    if (!window.BilgeAccount?.required) return false;
    const selected = capture();
    if (!selected || selected.notebook.id !== id || opening || pilot) throw Error('STALE');
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
  const style = document.createElement('style');
  style.textContent = '#pptxWorkspace{position:fixed;inset:0;margin:0;width:100%;height:100%;width:100dvw;height:100dvh;max-width:none;max-height:none;box-sizing:border-box;overflow:auto;padding:0;border:0;border-radius:0;background:#eef3ef;color:#173b36}#pptxWorkspace::backdrop{background:#173b36cc}#pptxWorkspace>div{height:100%}';
  document.head.append(style);
  window.BilgePptx = Object.freeze({open, close, prepareToLeave, hasNotebookPresentations,
    get active() { return !!dialog; }, get opening() { return opening; },
    snapshot:() => ({active:!!dialog, opening, notebookId:context?.notebook.id || null, pilot:pilot?.snapshot() || null})
  });
  addEventListener('bilge-account-locked', () => { revoked = true; cleanup({restoreFocus:false}); });
  const button = document.createElement('button'); button.id = 'pptxNotebookOpen'; button.className = 'btn';
  button.type = 'button'; button.textContent = 'Bu defterin sunumları';
  button.onclick = () => void open().then(result => { if (result?.ok === false) notify(result.message); });
  document.querySelector('#newPage')?.after(button);
  const legacyPdf = document.querySelector('#presentationOpen');
  if (legacyPdf) legacyPdf.textContent = 'PowerPoint → PDF (sunucu)';
})();
