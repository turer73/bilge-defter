// Explicit, same-origin handoff. Text never enters a URL or a server request.
(() => {
  'use strict';
  const box=document.querySelector('#quoteActions'),article=document.querySelector('#sourceText');
  if(!box||!article)return;
  const status=document.querySelector('#quoteStatus'),selected=document.querySelector('#quoteSelection'),whole=document.querySelector('#quotePage');
  const prefix='bilge-library-quote:',ttl=10*60*1000;
  let selection='',busy=false;
  function capture(){
    const s=getSelection();
    if(!s||s.isCollapsed||!s.rangeCount){selection='';return;}
    const r=s.getRangeAt(0);
    selection=article.contains(r.startContainer)&&article.contains(r.endContainer)?r.toString().trim():'';
  }
  document.addEventListener('selectionchange',capture);
  selected.addEventListener('pointerdown',e=>{capture();e.preventDefault();});
  async function send(all){
    if(busy)return;
    const content=(all?article.innerText:selection).trim();
    if(!content){status.textContent='Önce kaynak metninden bir satır veya bölüm seçin.';return;}
    const citation=`Kaynak: ${box.dataset.title}\n${box.dataset.authors} · ${box.dataset.license}\nPDF sayfası: ${box.dataset.page} · Basılı etiket: ${box.dataset.label}\n${box.dataset.sourceUrl}\nLisans: ${box.dataset.licenseUrl}\nEkranda görünen metin; tarayıcı çevirisi içerebilir. Özgün kaynakla karşılaştırın.`;
    const text=content+'\n\n'+citation;
    if(text.length>10000){status.textContent='Bu sayfanın metni tek öğe sınırını (10.000 karakter, kaynak dahil) aşıyor. Daha kısa bölümler seçerek alın; metin kesilmedi.';return;}
    if(!location.pathname.startsWith('/library/read/')){status.textContent='Deftere aktarım, uygulamanın davetli Kütüphane ekranında kullanılabilir. Bu yerel önizleme not defterine bağlı değil.';return;}
    busy=true;selected.disabled=whole.disabled=true;
    try{
      const response=await fetch('../../api/session',{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw Error('Oturum doğrulanamadı. Kütüphaneye yeniden giriş yapın.');
      const session=await response.json();
      if(!session.hosted||session.id!==box.dataset.account||!/^[a-f0-9-]{36}$/.test(session.id))throw Error('Hesap değişti. Kaynak sayfasını yeniden açın.');
      const now=Date.now(),token=crypto.randomUUID(),key=prefix+token;
      // Expired handoffs only; never touch notebook databases or unrelated storage.
      const pending=[];
      for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k.startsWith(prefix))pending.push(k);}
      for(const k of pending){try{const item=JSON.parse(localStorage.getItem(k));if(!item||item.expires<=now)localStorage.removeItem(k);}catch{}}
      if(pending.filter(k=>localStorage.getItem(k)!==null).length>=10)throw Error('Bekleyen çok sayıda alıntı var. Önce açık aktarımı tamamlayın veya 10 dakika bekleyin.');
      localStorage.setItem(key,JSON.stringify({version:1,account:session.id,expires:now+ttl,text}));
      status.textContent='Defter açılıyor. Hedef sayfayı seçin, ardından Bitti ile kaydedin.';
      // Same tab avoids popup blocking and does not expose an opener to source pages.
      location.assign('/#libraryQuote='+token);
    }catch(e){status.textContent=e.name==='QuotaExceededError'?'Aktarım için cihazda yer ayrılamadı. Notlar değiştirilmedi.':(e.message||'Aktarım hazırlanamadı. Notlar değiştirilmedi.');}
    finally{busy=false;selected.disabled=whole.disabled=false;}
  }
  selected.addEventListener('click',()=>send(false));whole.addEventListener('click',()=>send(true));
})();
