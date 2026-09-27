'use strict';
const $=id=>document.getElementById(id);
let books=[], active=null, readerEpoch=0, searchEpoch=0, session=null;
const root=new URL('./',location.href);
const localURL=path=>new URL(path.replace(/^\//,''),root);
const textLink=document.createElement('a');textLink.id='readText';textLink.className='read-action';textLink.textContent='Metin olarak oku';textLink.target='_blank';textLink.rel='noopener noreferrer';$('bookmark').after(textLink);
function node(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
async function api(path, options={}){const headers=new Headers(options.headers);if(session)headers.set('X-Library-Account',session.id);const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);try{const r=await fetch(localURL(path),{...options,headers,cache:'no-store',redirect:'error',signal:controller.signal});const data=await r.json();if(!r.ok){if([401,403,409,503].includes(r.status)){readerEpoch++;searchEpoch++;$('reader').close();$('results').replaceChildren();$('login').hidden=false;$('status').textContent=data.error||'Oturumu yeniden açın.';for(const button of document.querySelectorAll('button'))button.disabled=true;}throw Error(data.error||'İşlem tamamlanamadı.');}return data;}finally{clearTimeout(timer);}}
function link(text,url){const a=node('a',text);a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;}
function card(book,page=1,snippet=''){
 const c=node('article',undefined,'card');c.append(node('span',book.license,'license'),node('h2',book.title),node('p',`${book.authors} · ${book.publisher} · ${book.year}`,'meta'));
 c.append(node('p',snippet||`${book.receipt.pages} PDF sayfası · ${(book.receipt.bytes/1048576).toFixed(1)} MiB · ${session?.hosted?'Sunucuda saklı':'Bu bilgisayarda saklı'}`));
 const actions=node('div',undefined,'actions'),open=node('button',snippet?`PDF sayfası ${page} →`:'Kitabı aç');open.onclick=()=>openPage(book.id,page);
 actions.append(open,link('Yayıncı',book.url),link('Lisans',book.license_url),link('Özgün PDF’yi indir',localURL(`/pdf/${book.id}.pdf?account=${encodeURIComponent(session.id)}`)));c.append(actions);
 const details=node('details');details.append(node('summary','Kaynak kaydı'),node('p',book.provenance),node('p','Özgün dosya değiştirilmedi. Özel içerik/görsel lisansları PDF içinde korunur.'),node('p',`SHA-256: ${book.receipt.sha256}`,'meta'),node('p','Lisans beyanı kontrol tarihi: 25.09.2026. Akademik içerik kabulü bekliyor.','meta'));
 const licensePage=node('button','PDF içindeki lisans sayfası','secondary');licensePage.onclick=()=>openPage(book.id,book.license_pdf_page);details.append(licensePage);c.append(details);return c;
}
function all(){searchEpoch++;$('results').replaceChildren(...books.map(b=>card(b)));$('status').textContent=session?.hosted?`${books.length} kaynak sunucuda. Kaydedilen sayfalar yalnız hesabınıza aittir.`:`${books.length} özgün kaynak yerel diskte. Kaydetmek için bir PDF sayfasını açın.`;}
async function openPage(id,page){
 const book=books.find(b=>b.id===id);if(!book||!Number.isInteger(page)||page<1||page>book.receipt.pages){$('pageStatus').textContent='Geçerli bir PDF sayfası girin.';return;}
 const epoch=++readerEpoch;active={id,page};$('readerTitle').textContent=book.title;$('credit').textContent=`${book.authors} · ${book.license} · Özgün kaynak`;
 textLink.href=localURL(`/read/${id}/${page}?account=${encodeURIComponent(session.id)}`);
 $('page').value=page;$('page').max=book.receipt.pages;$('prev').disabled=page===1;$('next').disabled=page===book.receipt.pages;
 $('pageImage').hidden=true;$('bookmark').disabled=true;$('pageStatus').textContent=`PDF sayfası ${page} / ${book.receipt.pages} hazırlanıyor…`;
 if(!$('reader').open)$('reader').showModal();
 const img=$('pageImage');img.onload=()=>{if(epoch!==readerEpoch)return;img.hidden=false;$('bookmark').disabled=false;$('pageStatus').textContent=`PDF sayfası ${page} / ${book.receipt.pages}`;};
 img.onerror=()=>{if(epoch===readerEpoch)$('pageStatus').textContent='Sayfa açılamadı. Tekrar deneyin veya özgün PDF’yi indirin.';};
 img.src=localURL(`/page/${id}/${page}.png?account=${encodeURIComponent(session.id)}`);img.alt=`${book.title}, PDF sayfası ${page}`;
}
$('close').onclick=()=>{$('reader').close();readerEpoch++;};
$('reader').addEventListener('close',()=>{readerEpoch++;});
$('go').onclick=()=>active&&openPage(active.id,Number($('page').value));
$('page').onkeydown=e=>{if(e.key==='Enter')$('go').click();};
$('prev').onclick=()=>active&&openPage(active.id,active.page-1);
$('next').onclick=()=>active&&openPage(active.id,active.page+1);
$('bookmark').onclick=async()=>{const target={...active},epoch=readerEpoch;$('bookmark').disabled=true;try{await api('/api/saved',{method:'POST',headers:{'Content-Type':'application/json','X-Library-Pilot':'1'},body:JSON.stringify(target)});if(epoch===readerEpoch)$('pageStatus').textContent=`PDF sayfası ${target.page} ${session.hosted?'hesabınıza özel listeye':'bu bilgisayardaki pilot listesine'} kaydedildi.`;}catch(e){if(epoch===readerEpoch)$('pageStatus').textContent=e.message;}finally{if(epoch===readerEpoch)$('bookmark').disabled=false;}};
$('all').onclick=all;
$('saved').onclick=async()=>{const epoch=++searchEpoch;try{const saved=await api('/api/saved');if(epoch!==searchEpoch)return;$('results').replaceChildren(...saved.filter(s=>books.some(b=>b.id===s.id)).map(s=>card(books.find(b=>b.id===s.id),s.page,`Kaydedilen PDF sayfası ${s.page}`)));$('status').textContent=saved.length?`${saved.length} sayfa yer imi. Özgün kitaplar ${session.hosted?'sunucuda':'yerel diskte'} korunur.`:'Henüz sayfa kaydetmediniz. Bir kitabı açıp “Sayfayı kaydet”e basın.';}catch(e){if(epoch===searchEpoch)$('status').textContent=e.message;}};
$('search').onsubmit=async e=>{e.preventDefault();const epoch=++searchEpoch,q=$('query').value.trim();if(!q){all();return;}$('results').replaceChildren();$('status').textContent='Özgün metinlerde aranıyor…';try{const data=await api(`/api/search?q=${encodeURIComponent(q)}&source=${encodeURIComponent($('source').value)}`);if(epoch!==searchEpoch)return;$('results').replaceChildren(...data.results.map(r=>card(books.find(b=>b.id===r.id),r.page,r.snippet)));$('status').textContent=`Aranan özgün terim: “${data.searched}” · ${data.results.length} sayfa sonucu (kaynak başına en fazla 5). Türkçe eşleştirme sınırlıdır; otomatik çeviri değildir.`;}catch(e){if(epoch===searchEpoch)$('status').textContent=e.message;}};
$('login').href=location.href;
api('/api/session').then(async identity=>{session=identity;if(identity.hosted){document.querySelector('.eyebrow').textContent='BİLGE DEFTER / DAVETLİ KÜTÜPHANE TESTİ';$('scope').textContent='Mevcut onaylı Bilge Defter hesabınızla kullanılır. Kaynaklar İngilizcedir; çeviri ve yapay zekâ yanıtı yoktur. Eğitim içindir; klinik karar veya gözetimsiz deney kaynağı değildir.';$('saveScope').textContent='“Sayfayı kaydet” hesabınıza özel sunucu yer imi oluşturur. Defter notlarına aktarılmaz. “Özgün PDF’yi indir” kaynak dosyanın değişmemiş kopyasını verir. İnternet bağlantısı gerekir.';}
books=await api('/api/catalog');for(const b of books){const o=node('option',b.title);o.value=b.id;$('source').append(o);}all();
const fragment=new URLSearchParams(location.hash.slice(1));
const incoming=fragment.get('q')?.trim().slice(0,120);
if(incoming){$('query').value=incoming;history.replaceState(null,'',location.pathname);$('search').requestSubmit();}
else if(fragment.has('source')){const id=fragment.get('source'),n=Number(fragment.get('page'));if(books.some(b=>b.id===id&&Number.isInteger(n)&&n>=1&&n<=b.receipt.pages)){history.replaceState(null,'',location.pathname);openPage(id,n);}}
}).catch(e=>{$('status').textContent=e.message;$('login').hidden=false;});
