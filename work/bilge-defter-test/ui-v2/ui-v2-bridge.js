/**
 * Bilge Defter v46 -> BilgeDefterUI V2.1 Entegrasyon Köprüsü
 */
(function() {
  'use strict';

  function createV2Bridge() {
    if (!window.BilgeDefterIntegration) return null;

    const listeners = new Set();
    function publish() {
      for (const fn of listeners) {
        try { fn(); } catch (e) { console.error('UI listener error:', e); }
      }
    }

    // Bilge Defter kayıt ve sayfa değişim olaylarında V2 arayüzünü güncelle
    if (typeof renderSaveStatus === 'function') {
      const origRenderSaveStatus = renderSaveStatus;
      window.renderSaveStatus = function() {
        origRenderSaveStatus.apply(this, arguments);
        publish();
      };
    }
    if (typeof renderPages === 'function') {
      const origRenderPages = renderPages;
      window.renderPages = function() {
        origRenderPages.apply(this, arguments);
        publish();
      };
    }
    if (typeof ready !== 'undefined' && !ready) {
      const checkReady = setInterval(() => {
        if (ready) {
          clearInterval(checkReady);
          publish();
        }
      }, 30);
    }
    const saveTarget = (typeof saveEl !== 'undefined' && saveEl) || document.querySelector('#saveState');
    if (saveTarget) {
      new MutationObserver(() => publish()).observe(saveTarget, { childList: true, characterData: true, subtree: true });
    }

    // The panel names lined paper 'ruled' (also its preview style); the engine stores 'lined'.
    const uiPattern = pattern => pattern === 'lined' ? 'ruled' : pattern;
    const enginePattern = pattern => pattern === 'ruled' ? 'lined' : pattern;

    function getState() {
      const p = typeof page === 'function' ? page() : null;
      const nbList = typeof notebooks === 'function' ? notebooks() : [{ id: 'general', title: 'Genel' }];
      const actBook = typeof activeNotebook !== 'undefined' ? activeNotebook : 'general';
      const allPages = (typeof state !== 'undefined' && state && Array.isArray(state.pages)) ? state.pages : [];
      const currentTool = typeof tool !== 'undefined' ? tool : 'pen';

      const PATTERNS = { lined: 'çizgili', grid: 'kareli', dotted: 'noktalı', blank: 'çizgisiz' };

      const pagesSummary = allPages.map(pageItem => ({
        id: pageItem.id,
        bookId: typeof pageNotebook === 'function' ? pageNotebook(pageItem) : 'general',
        title: pageItem.title || 'İsimsiz sayfa',
        subtitle: `${pageItem.strokes ? pageItem.strokes.length : 0} çizgi · ${PATTERNS[pageItem.paperPattern] || 'çizgili'}`,
        deleted: false
      }));

      const isClean = typeof isDirty === 'function' ? !isDirty() : true;
      const isSaving = typeof savePromise !== 'undefined' && !!savePromise;
      const hasFailed = typeof saveFailed !== 'undefined' && !!saveFailed;
      const hasConflict = typeof saveConflict !== 'undefined' && !!saveConflict;
      const isReady = typeof ready !== 'undefined' ? !!ready : true;

      const saveStatus = hasConflict ? 'error' : (hasFailed ? 'error' : (isSaving || !isClean ? 'pending' : (isReady ? 'saved' : 'unknown')));
      const saveMsg = (typeof saveEl !== 'undefined' && saveEl?.textContent) || (isClean ? 'Bu cihazda kaydedildi' : 'Kaydediliyor…');

      return {
        ready: isReady,
        appLabel: document.querySelector('.badge')?.textContent || '',
        revision: typeof editRevision !== 'undefined' ? editRevision : 0,
        page: p ? {
          id: p.id,
          title: p.title,
          bookId: actBook,
          bookTitle: typeof notebookTitle === 'function' ? notebookTitle(actBook) : 'Genel'
        } : null,
        selectedBookId: actBook,
        books: nbList.map(n => ({ id: n.id, name: n.title })),
        pages: pagesSummary,
        trashCount: (typeof state !== 'undefined' && state?.trash) ? state.trash.length : 0,
        tool: currentTool === 'pan' ? 'pan' : (currentTool === 'eraser' ? 'eraser' : (currentTool === 'marker' ? 'marker' : 'pen')),
        ink: {
          color: (document.querySelector('#color')?.value) || '#173b36',
          width: typeof toolWidths !== 'undefined' ? (toolWidths[currentTool] || 4) : 4
        },
        paper: {
          color: typeof paperColor === 'function' ? paperColor() : '#fffdf8',
          pattern: uiPattern(typeof paperPattern === 'function' ? paperPattern() : 'lined')
        },
        canUndo: !!(p && (p.strokes?.length || clearedPages.has(p.id) || mediaUndo.get(p.id)?.length)),
        canRedo: false,
        clearIsUndoable: true,
        zoom: typeof viewZoom === 'function' ? viewZoom() : 1,
        input: {
          fingerDraw: !document.querySelector('#penOnly')?.checked,
          lockTouch: false,
          pressure: true
        },
        frameColor: localStorage.getItem('bilge-defter-frame-v1') || '#343b41',
        selection: null,
        recovery: {
          available: document.querySelector('#restorePrevious')?.disabled === false,
          explanation: 'Yükleme öncesi yedeği geri getirebilirsiniz.'
        },
        save: {
          status: saveStatus,
          message: saveMsg,
          detail: (typeof failureMessage !== 'undefined' && failureMessage) || ''
        },
        storageLabel: document.querySelector('#storageState')?.textContent || 'Bu cihazda kaydedildi',
        disabledCommands: {}
      };
    }

    const commands = {
      'tool.select': (payload) => {
        if (!payload || !payload.tool) return;
        if (payload.tool === 'pan') {
          return {message: 'Sayfayı iki parmakla kaydırın. Ayrı gezinme aracı henüz desteklenmiyor.'};
        } else {
          if (typeof selectTool === 'function') selectTool(payload.tool);
        }
        publish();
      },
      'ink.set': (payload) => {
        if (payload.color) {
          const colorInput = document.querySelector('#color');
          if (colorInput) {
            colorInput.value = payload.color;
            colorInput.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }
        if (payload.width !== undefined) {
          const widthInput = document.querySelector('#width');
          if (widthInput) {
            widthInput.value = payload.width;
            widthInput.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }
        publish();
      },
      'paper.set': (payload) => {
        if (payload.color && typeof setPaperColor === 'function') {
          setPaperColor(payload.color);
        }
        if (payload.pattern && typeof setPaperPattern === 'function') {
          setPaperPattern(enginePattern(payload.pattern));
        }
        publish();
      },
      'history.undo': () => {
        document.querySelector('#undo')?.click();
        publish();
      },
      'history.redo': () => {
        publish();
      },
      'insert.text': () => {
        if (typeof openMediaText === 'function') {
          openMediaText();
        } else {
          document.querySelector('#textAdd')?.click();
        }
      },
      'insert.image': () => {
        document.querySelector('#imageAdd')?.click();
      },
      'insert.camera': () => {
        document.querySelector('#cameraAdd')?.click();
      },
      'pdf.open': () => {
        document.querySelector('#pdfOpen')?.click();
      },
      'presentation.open': () => {
        document.querySelector('#presentationOpen')?.click();
      },
      'presentation.native': () => window.BilgePptx.importToNotebook(),
      'presentation.library': () => window.BilgePptx.open(),
      'pdf.export': () => {
        document.querySelector('#pdfExportOpen')?.click();
      },
      'selection.edit': () => {
        document.querySelector('#mediaEdit')?.click();
      },
      'study.planner': () => {
        document.querySelector('#plannerOpen')?.click();
      },
      'study.library': () => window.openBilgeLibrary(),
      'study.dictionary': () => {
        document.querySelector('#dictOpen')?.click();
      },
      'study.recognize': () => {
        document.querySelector('#ocrOpen')?.click();
      },
      'study.webSearch': () => {
        document.querySelector('#searchBtn')?.click();
      },
      'study.guide': () => {
        window.__v2UI?.ui?.openOnboarding?.(0);
      },
      'page.top': () => {
        document.querySelector('#scrollToTop')?.click();
      },
      'page.clear': () => {
        document.querySelector('#clearPage')?.click();
        publish();
      },
      'page.trash': () => {
        if (!canEdit() || drawing || pan || !page()) return;
        editingPageId = activeId;
        document.querySelector('#deletePage')?.click();
        publish();
      },
      'page.rename': () => {
        if (!canEdit() || drawing || pan) return;
        const curPage = typeof page === 'function' ? page() : null;
        if (!curPage) return;
        const newTitle = prompt('Sayfa adını girin:', curPage.title);
        if (newTitle && newTitle.trim()) {
          curPage.title = newTitle.trim().slice(0, 80);
          if (typeof renderPages === 'function') renderPages();
          if (typeof scheduleSave === 'function') scheduleSave();
          publish();
        }
      },
      'page.create': () => {
        document.querySelector('#newPage')?.click();
        publish();
      },
      'notebook.create': () => {
        document.querySelector('#newNotebook')?.click();
        publish();
      },
      'notebook.rename': () => {
        document.querySelector('#editNotebook')?.click();
        publish();
      },
      'library.selectNotebook': ({ id }) => {
        if (!notebooks().some(n => n.id === id)) return;
        const select = document.querySelector('#notebookSelect');
        if (select) {
          select.value = id;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          publish();
        }
      },
      'library.selectPage': ({ id }) => {
        if (!canEdit() || drawing || pan) return;
        const target = state.pages.find(p => p.id === id);
        if (!target) return;
        activeNotebook = pageNotebook(target);
        state.activeNotebook = activeNotebook;
        activeId = id;
        setSidebarOpen(false);
        renderPages();drawAll();scheduleSave();
        publish();
      },
      'trash.open': () => {
        document.querySelector('#openTrash')?.click();
      },
      'backup.status': () => window.openReliability?.(),
      'backup.export': () => {
        document.querySelector('#exportBtn')?.click();
      },
      'backup.import': () => {
        document.querySelector('#importBtn')?.click();
      },
      'backup.rollback': () => {
        document.querySelector('#restorePrevious')?.click();
        publish();
      },
      'settings.frame': ({ color }) => {
        if (/^#[0-9a-f]{6}$/i.test(color)) {
          applyFrame(color, true);
          publish();
        }
      },
      'settings.input': (payload) => {
        if (payload.fingerDraw !== undefined) {
          const penOnly = document.querySelector('#penOnly');
          if (penOnly) {
            penOnly.checked = !payload.fingerDraw;
            penOnly.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
        publish();
      },
      'settings.install': () => {
        document.querySelector('#pwaOpen')?.click();
      },
      'storage.persist': async () => {
        if (navigator.storage?.persist) {
          const res = await navigator.storage.persist();
          return { message: res ? 'Kalıcı depolama izni verildi.' : 'Kalıcı depolama izni verilmedi.' };
        }
        return { message: 'Tarayıcınız kalıcı depolama API\'sini desteklemiyor.' };
      },
      'view.zoom': ({ mode }) => {
        const p = typeof page === 'function' ? page() : null;
        if (!p) return;
        let z = viewZoom();
        if (mode === 'in') z = Math.min(3, z + 0.25);
        else if (mode === 'out') z = Math.max(1, z - 0.25);
        else if (mode === 'fit') z = 1;
        setViewZoom(z);
        publish();
      }
    };

    return {
      host: {
        getState,
        subscribe(fn) {
          listeners.add(fn);
          return () => listeners.delete(fn);
        },
        commands
      },
      publish
    };
  }

  window.initBilgeDefterV2 = function() {
    if (!window.BilgeDefterIntegration) {
      console.warn('BilgeDefterIntegration bulunamadı; eski arayüz korunuyor.');
      return null;
    }

    const appRoot = document.querySelector('.workspace');
    if (!appRoot) {
      console.warn('.workspace bulunamadı.');
      return null;
    }

    const bridge = createV2Bridge();
    if (!bridge) return null;

    const result = window.BilgeDefterIntegration.mount({
      editorRoot: appRoot,
      oldChrome: [appRoot.querySelector('.edge-actions')],
      buttonThemeKey: 'bilge-defter-button-theme-v1',
      host: bridge.host
    });
    // Hide only after a successful mount. Preserve DOM handlers and a reversible
    // fallback, but never leave transparent buttons over the writing surface.
    const outerChrome=[document.querySelector('.app > header'),document.querySelector('.app > footer')].filter(Boolean);
    const savedChrome=outerChrome.map(node=>({node,style:node.getAttribute('style'),hidden:node.hidden,inert:node.inert,aria:node.getAttribute('aria-hidden')}));
    for(const {node} of savedChrome){node.style.setProperty('display','none','important');node.hidden=true;node.inert=true;node.setAttribute('aria-hidden','true')}
    const destroy=result.destroy;
    let layoutObserver=null,focusObserver=null;
    // Focus view: the writing surface fills the whole editor area. The shell's focus-mode class
    // lives in shadow DOM, so it is mirrored on <html> for the page stylesheet; the canvas
    // follows through its ResizeObserver.
    const focusStyle=document.createElement('style');
    focusStyle.textContent='html.bd-focus bilge-defter-ui .workspace .paper-wrap{padding:0!important}html.bd-focus bilge-defter-ui .workspace .paper{max-width:none!important;margin:0!important;border-width:0!important;border-radius:0!important;box-shadow:none!important}';
    document.head.append(focusStyle);
    result.destroy=()=>{document.removeEventListener('close',returnDialogFocus,true);layoutObserver?.disconnect();focusObserver?.disconnect();focusStyle.remove();document.documentElement.classList.remove('bd-focus');destroy();for(const s of savedChrome){if(s.style===null)s.node.removeAttribute('style');else s.node.setAttribute('style',s.style);s.node.hidden=s.hidden;s.node.inert=s.inert;if(s.aria===null)s.node.removeAttribute('aria-hidden');else s.node.setAttribute('aria-hidden',s.aria)}window.__v2UI=null;window.__v2Bridge=null;resize()};

    // Native engine dialogs formerly returned focus to now-hidden old tools.
    // Retain the visible V2 trigger instead, after the engine's close handler.
    let dialogTrigger=null;
    result.ui.shadowRoot.addEventListener('click',event=>{const button=event.composedPath().find(node=>node instanceof HTMLButtonElement);if(button)dialogTrigger=button});
    const returnDialogFocus=event=>{if(!(event.target instanceof HTMLDialogElement))return;queueMicrotask(()=>{if(!result.ui.isConnected||document.querySelector('dialog[open]')||result.ui.shadowRoot.querySelector('dialog[open]'))return;const target=dialogTrigger?.isConnected&&dialogTrigger.getClientRects().length?dialogTrigger:result.ui.shadowRoot.querySelector('[data-panel="insert"]');target?.focus({preventScroll:true})})};
    document.addEventListener('close',returnDialogFocus,true);

    window.__v2UI = result;
    window.__v2Bridge = bridge;

    if (result && result.ui) {
      const syncLayoutActive = () => {
        result.ui.classList.toggle('layout-active', appRoot.classList.contains('layout-active'));
      };
      layoutObserver = new MutationObserver(syncLayoutActive);
      layoutObserver.observe(appRoot, { attributes: true, attributeFilter: ['class'] });
      syncLayoutActive();
      const shell = result.ui.shadowRoot.querySelector('.shell');
      if (shell) {
        const syncFocus = () => document.documentElement.classList.toggle('bd-focus', shell.classList.contains('focus-mode'));
        focusObserver = new MutationObserver(syncFocus);
        focusObserver.observe(shell, { attributes: true, attributeFilter: ['class'] });
        syncFocus();
      }
    }

    bridge.publish();
    return result;
  };
})();
