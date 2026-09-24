/** Bilge Defter v41+ buton teması. ui-workspace.js sonrasında yüklenir. */
(() => {
  'use strict';
  if (window.BilgeButtonThemeInstallation) return;
  const mount = () => {
    if (window.BilgeButtonThemeInstallation) return;
    const done=document.getElementById('toolsDone');
    if (!done || !window.BilgeButtonTheme) {
      console.warn('Buton teması bağlanamadı: #toolsDone veya tema modülü bulunamadı. Notlar değiştirilmedi.');
      return;
    }
    const controller=window.BilgeButtonTheme.createController({target:document.documentElement});
    // Same-document storage events do not fire: mirror the actual controllers
    // so native PDF/backup dialogs and the new toolbar show the same theme.
    const ui=document.querySelector('bilge-defter-ui')?.buttonTheme,unsubscribers=[];
    if(ui){
      const mirror=(source,target)=>source.subscribe(snapshot=>{if(JSON.stringify(snapshot.theme)!==JSON.stringify(target.getSnapshot().theme))target.setTheme(snapshot.theme,{immediate:true})});
      unsubscribers.push(mirror(ui,controller),mirror(controller,ui));
    }
    const section=document.createElement('bilge-button-theme-settings');
    section.id='buttonThemeSection';section.controller=controller;
    const appearance=document.getElementById('appearanceSection');
    if(appearance)appearance.after(section);else done.before(section);
    const stop=window.BilgeButtonTheme.decorateButtons(document);
    window.BilgeButtonThemeInstallation=Object.freeze({controller,
      destroy(){for(const unsubscribe of unsubscribers)unsubscribe();section.remove();stop();controller.destroy();delete window.BilgeButtonThemeInstallation;}
    });
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
