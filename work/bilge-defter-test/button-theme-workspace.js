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
    const section=document.createElement('bilge-button-theme-settings');
    section.id='buttonThemeSection';section.controller=controller;
    const appearance=document.getElementById('appearanceSection');
    if(appearance)appearance.after(section);else done.before(section);
    const stop=window.BilgeButtonTheme.decorateButtons(document);
    window.BilgeButtonThemeInstallation=Object.freeze({controller,
      destroy(){section.remove();stop();controller.destroy();delete window.BilgeButtonThemeInstallation;}
    });
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
