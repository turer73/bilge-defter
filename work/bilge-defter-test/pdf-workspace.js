// v74 must be installed as a read-compatible rollback target before this v75 writer.
const PDF_PAGE_LIMIT=100;
// Local raster PDF export. Separate ink layer preserves the document under eraser strokes.
const pdfExportDialog=document.createElement('dialog');pdfExportDialog.id='pdfExportDialog';pdfExportDialog.className='tools-dialog';pdfExportDialog.setAttribute('aria-labelledby','pdfExportTitle');
pdfExportDialog.innerHTML='<div class="tools-heading"><h2 id="pdfExportTitle">Notlu PDF indir</h2><button class="btn" id="pdfExportClose">× Kapat / iptal</button></div><div class="tools-content"><p class="recovery-note">PDF zemini, kalem, fosforlu, metin ve görseller birlikte aktarılır. İşlem tamamen bu cihazda yapılır.</p><label>Kapsam <select id="pdfExportScope"><option value="page">Açık PDF sayfası</option><option value="notebook">Bu defterdeki PDF sayfaları</option></select></label><p id="pdfExportSummary" class="recovery-note"></p><p class="recovery-note">Görüntü tabanlı çıktı: metin aranamaz veya seçilemez. Sayfa oranı korunur; özgün baskı ölçüsü korunmaz. PDF sınırları dışındaki notlar ve normal defter sayfaları dahil edilmez. Düzenlenebilir kopya için ayrıca JSON yedeği alın.</p><button class="btn primary" id="pdfExportStart">PDF hazırla</button><p id="pdfExportStatus" role="status">Kapsamı seçin.</p><a class="btn primary" id="pdfExportDownload" hidden>PDF indir</a></div>';
document.body.append(pdfExportDialog);
const pdfExportStyle=document.createElement('style');pdfExportStyle.textContent='#pdfExportDialog{width:min(520px,calc(100% - 24px));max-height:calc(100dvh - 24px);overflow:auto;padding:0;border:1px solid #d5e2dc;border-radius:18px;background:#fffdf8;color:#17312d}#pdfExportDialog::backdrop{background:#173b3650}#pdfExportDialog select{display:block;width:100%;min-height:44px;font:inherit;margin-top:8px}#pdfExportDownload{display:block;text-align:center;text-decoration:none}#pdfExportDownload[hidden]{display:none}#pdfExportStatus{line-height:1.5;overflow-wrap:anywhere}';document.head.append(pdfExportStyle);
const pdfExportOpen=document.createElement('button');pdfExportOpen.id='pdfExportOpen';pdfExportOpen.className='btn';pdfExportOpen.textContent='Notlu PDF indir';document.querySelector('.tool-actions').append(pdfExportOpen);
let pdfExportRequest=0,pdfExportUrl=null,pdfExportBusy=false;
const PDF_EXPORT_LIMIT=64*1024*1024;
function clearPdfDownload(){if(pdfExportUrl)URL.revokeObjectURL(pdfExportUrl);pdfExportUrl=null;const a=document.querySelector('#pdfExportDownload');a.hidden=true;a.removeAttribute('href')}
function pdfExportPages(){return document.querySelector('#pdfExportScope').value==='page'?(page()?.pdf?[page()]:[]):notebookPages().filter(p=>p.pdf)}
function describePdfExport(){const pages=pdfExportPages(),ignored=notebookPages().filter(p=>!p.pdf).length;document.querySelector('#pdfExportSummary').textContent=`${pages.length} PDF sayfası seçili (en fazla ${PDF_PAGE_LIMIT}).`+(document.querySelector('#pdfExportScope').value==='notebook'&&ignored?` ${ignored} normal sayfa dahil edilmeyecek.`:'');document.querySelector('#pdfExportStart').disabled=pdfExportBusy||!pages.length||pages.length>PDF_PAGE_LIMIT}
pdfExportOpen.onclick=()=>{if(!canEdit()||drawing||pan||!page())return;closeTools();clearPdfDownload();document.querySelector('#pdfExportScope').value=page().pdf?'page':'notebook';describePdfExport();document.querySelector('#pdfExportStatus').textContent='Kapsamı seçin. Çıktı JSON yedeğinin yerine geçmez.';pdfExportDialog.showModal()};
document.querySelector('#pdfExportScope').onchange=()=>{clearPdfDownload();describePdfExport();document.querySelector('#pdfExportStatus').textContent='Yeni kapsam için PDF hazırlayın.'};
document.querySelector('#pdfExportClose').onclick=()=>pdfExportDialog.close();
pdfExportDialog.addEventListener('close',()=>{pdfExportRequest++;clearPdfDownload();document.querySelector('#toolsToggle').focus({preventScroll:true})});
async function exportImage(src){const im=new Image();let timer;try{im.src=src;await Promise.race([im.decode(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Görüntü okuma zaman aşımı.')),10000)})]);return im}catch{im.src='';throw Error('Bir PDF zemini veya görsel okunamadı. Eksik çıktı oluşturulmadı.')}finally{clearTimeout(timer)}}
// Byte offsets and stream lengths use Uint8Array lengths, never UTF-16 string positions.
function rasterPdfBuilder(){
 const chunks=[],offsets=[0],pageIds=[];let size=0,nextId=3;
 const add=value=>{const b=typeof value==='string'?new TextEncoder().encode(value):value;size+=b.byteLength;if(size>PDF_EXPORT_LIMIT)throw Error('Çıktı 64 MB sınırını aşıyor. Tek sayfa olarak deneyin.');chunks.push(b)};
 const object=(id,head,bytes)=>{offsets[id]=size;add(`${id} 0 obj\n${head}`);if(bytes){add(`\nstream\n`);add(bytes);add('\nendstream')}add('\nendobj\n')};
 add('%PDF-1.4\n');
 return {page(jpeg,width,height){const imageId=nextId++,contentId=nextId++,pageId=nextId++,w=width>height?842:595,h=Number((w*height/width).toFixed(3));
  object(imageId,`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.byteLength} >>`,jpeg);
  const content=new TextEncoder().encode(`q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q\n`);object(contentId,`<< /Length ${content.byteLength} >>`,content);
  object(pageId,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`);pageIds.push(pageId);
 },finish(){object(1,'<< /Type /Catalog /Pages 2 0 R >>');object(2,`<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map(id=>id+' 0 R').join(' ')}] >>`);const start=size;add(`xref\n0 ${nextId}\n0000000000 65535 f \n`);for(let id=1;id<nextId;id++)add(String(offsets[id]).padStart(10,'0')+' 00000 n \n');add(`trailer\n<< /Size ${nextId} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`);return new Blob(chunks,{type:'application/pdf'})}};
}
document.querySelector('#pdfExportStart').onclick=async()=>{
 if(pdfExportBusy||!pdfExportDialog.open)return;const pages=pdfExportPages();if(!pages.length||pages.length>PDF_PAGE_LIMIT)return;
 // Freeze only exported values; never switch the active page or write notebook data.
 const snapshot=pages.map(p=>({pdf:{...p.pdf},strokes:p.strokes.map(s=>({...s,points:s.points.map(p=>({...p}))}))}));
 const filename=(notebookTitle(activeNotebook)+'-notlu').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,120)+'.pdf';
 const request=++pdfExportRequest,alive=()=>request===pdfExportRequest&&pdfExportDialog.open;
 pdfExportBusy=true;clearPdfDownload();describePdfExport();document.querySelector('#pdfExportScope').disabled=true;
 const status=document.querySelector('#pdfExportStatus'),sheet=document.createElement('canvas'),ink=document.createElement('canvas'),builder=rasterPdfBuilder();
 try{
  for(let i=0;i<snapshot.length;i++){
   if(!alive())return;status.textContent=`Hazırlanıyor: ${i+1}/${snapshot.length}…`;const p=snapshot[i],images=new Map();let bg;
   try{
    bg=await exportImage(p.pdf.image);if(!alive())return;
    for(const s of p.strokes.filter(s=>s.tool==='image'))if(!images.has(s.image)){images.set(s.image,await exportImage(s.image));if(!alive())return}
    sheet.width=ink.width=p.pdf.width;sheet.height=ink.height=p.pdf.height;
    const base=sheet.getContext('2d'),overlay=ink.getContext('2d');base.fillStyle='#ffffff';base.fillRect(0,0,sheet.width,sheet.height);base.drawImage(bg,0,0,sheet.width,sheet.height);
    for(let n=0;n<p.strokes.length;n++){drawStroke(p.strokes[n],overlay,images);if(n%100===99){await new Promise(r=>setTimeout(r,0));if(!alive())return}}
    base.drawImage(ink,0,0);const jpeg=await new Promise((resolve,reject)=>sheet.toBlob(b=>b?resolve(b):reject(Error('PDF görüntüsü hazırlanamadı.')),'image/jpeg',.94));
    if(!alive())return;builder.page(new Uint8Array(await jpeg.arrayBuffer()),sheet.width,sheet.height);
   }finally{if(bg)bg.src='';for(const im of images.values())im.src='';sheet.width=ink.width=1;sheet.height=ink.height=1}
   await new Promise(r=>setTimeout(r,0));
  }
  if(!alive())return;const blob=builder.finish();pdfExportUrl=URL.createObjectURL(blob);const a=document.querySelector('#pdfExportDownload');a.href=pdfExportUrl;a.download=filename;a.hidden=false;status.textContent=`${snapshot.length} sayfa hazır · ${(blob.size/1048576).toFixed(1)} MB. Kaydetmek için PDF indir düğmesine basın.`;
 }catch(error){if(alive())status.textContent=`PDF hazırlanamadı. ${error.message} Notlar değişmedi.`}
 finally{pdfExportBusy=false;document.querySelector('#pdfExportScope').disabled=false;if(pdfExportDialog.open)describePdfExport()}
};
// PDF.js renders locally. Device PDFs never leave the browser; PowerPoint conversion
// below requires separate explicit consent before uploading the selected deck.
const pdfDialog=document.createElement('dialog');pdfDialog.id='pdfDialog';pdfDialog.setAttribute('aria-labelledby','pdfTitle');
pdfDialog.innerHTML='<div class="tools-heading"><h2 id="pdfTitle">PDF üzerine çalış</h2><button class="btn" id="pdfClose">× Kapat</button></div><div class="tools-content"><p class="recovery-note">PDF cihazda işlenir, sunucuya gönderilmez. En fazla 20 MB / '+PDF_PAGE_LIMIT+' sayfa. Görsel yoğunluğuna göre cihazın güvenli görüntü bütçesi daha erken dolabilir. Sayfalar 1000 piksel genişlikte görüntü olarak saklanır; özgün PDF dosyanızı ayrıca koruyun.</p><p class="recovery-note">Metin seçimi, bağlantılar ve form doldurma yoktur. Notlu PDF çıktısı için Araçlar → Notlu PDF indir kullanın. PDF zemini silinmez; kalem, fosforlu ve silgi yalnız eklediğiniz notlara uygulanır.</p><button class="btn" id="pdfChoose">Cihazdan PDF seç</button><input id="pdfFile" type="file" accept="application/pdf,.pdf" hidden><p id="pdfProgress" role="status">Bir PDF seçin. Hazır olunca yeni deftere ekleyin.</p><button class="btn primary" id="pdfApply" disabled>Yeni deftere ekle</button><p class="recovery-note">PDF görüntüleri ve yazılar JSON yedeğine dahildir. İçe aktarma mevcut sayfaların yerine geçmez.</p></div>';
document.body.append(pdfDialog);
const pdfStyle=document.createElement('style');pdfStyle.textContent='#pdfDialog{width:min(500px,calc(100% - 24px));max-height:calc(100dvh - 24px);padding:0;border:1px solid #d5e2dc;border-radius:18px;background:#fffdf8;color:#17312d}#pdfDialog::backdrop{background:#173b3650}#pdfDialog .btn{min-height:44px}#pdfProgress{margin:0;line-height:1.5;overflow-wrap:anywhere}#pdfCanvas{position:absolute;inset:0;pointer-events:none}#pdfCanvas[hidden],#pdfNavigation[hidden],#pdfBackdropState[hidden]{display:none}#canvas{position:relative}#pdfBackdropState{position:absolute;inset:0;display:grid;place-content:center;text-align:center;padding:20px;background:#fffdf8;pointer-events:none}.workspace.has-pdf{grid-template-rows:auto minmax(0,1fr)}#pdfNavigation{display:flex;align-items:center;gap:8px;padding:5px 12px;min-width:0}#pdfNavigation .btn{min-width:44px;min-height:44px;flex:none}#pdfPageLabel{flex:1;min-width:0;font-size:12px;overflow-wrap:anywhere}#pdfOpen{grid-column:1/-1}';document.head.append(pdfStyle);
const pdfOpen=document.createElement('button');pdfOpen.id='pdfOpen';pdfOpen.className='btn';pdfOpen.textContent='PDF üzerine çalış';document.querySelector('.tool-actions').prepend(pdfOpen);
const pdfCanvas=document.createElement('canvas');pdfCanvas.id='pdfCanvas';pdfCanvas.hidden=true;pdfCanvas.setAttribute('aria-hidden','true');document.querySelector('.paper').prepend(pdfCanvas);
const pdfBackdropState=document.createElement('div');pdfBackdropState.id='pdfBackdropState';pdfBackdropState.hidden=true;pdfBackdropState.setAttribute('role','status');document.querySelector('.paper').append(pdfBackdropState);
const pdfNavigation=document.createElement('div');pdfNavigation.id='pdfNavigation';pdfNavigation.hidden=true;pdfNavigation.innerHTML='<button class="btn" id="pdfPrevious" aria-label="Önceki sayfa">←</button><span id="pdfPageLabel"></span><button class="btn" id="pdfNext" aria-label="Sonraki sayfa">→</button>';document.querySelector('.workspace').prepend(pdfNavigation);
const pdfZoomControls=document.createElement('div');pdfZoomControls.id='pdfZoomControls';pdfZoomControls.innerHTML='<button class="btn" id="pdfZoomOut" aria-label="PDF küçült">−</button><output id="pdfZoomValue" aria-live="polite">%100</output><button class="btn" id="pdfZoomIn" aria-label="PDF büyüt">+</button><button class="btn" id="pdfFit">Genişliğe sığdır</button>';pdfNavigation.append(pdfZoomControls);
pdfStyle.textContent+='#pdfNavigation{flex-wrap:wrap}#pdfZoomControls{display:flex;align-items:center;gap:6px}#pdfZoomControls .btn{min-width:44px}#pdfZoomValue{min-width:48px;text-align:center;font-size:13px}@media(max-width:650px){#pdfZoomControls{flex-basis:100%;justify-content:center}#pdfFit{font-size:13px}}';
let pdfBusy=false,pdfPending=null,pdfRequest=0,pdfTask=null,pdfLibrary=null,pdfImage=null,pdfImageSource=null,pdfImageFailed=false;
let cancelPresentation=()=>{},updatePresentationControls=()=>{};
const PDF_FILE_LIMIT=20*1024*1024,PDF_IMAGE_LIMIT=24*1024*1024;
// v71: images are stored apart, so a pen stroke no longer rewrites them; they are still all held in
// memory and checked at startup. New PDFs are refused when the notebook's images would exceed this.
// Notebooks already larger keep working.
const NOTEBOOK_PDF_LIMIT=96*1024*1024;
function notebookLimitError(total){return new Error(`Bu PDF ile defterdeki görseller ${Math.round(total/1048576)} MB olur; iPad'de güvenilir kayıt için sınır ${NOTEBOOK_PDF_LIMIT/1048576} MB. Önce JSON yedeği alın, sonra artık gerekmeyen PDF defterlerini silip Çöp Kutusundan da kaldırın.`)}
// v69 reads PNG and JPEG page images; it still writes PNG. Accepting JPEG now lets a later release
// store smaller JPEG pages and still roll back to this one.
// v70: a page that is mostly photo or slide art is stored as JPEG when that is clearly smaller
// (under 60% of the PNG); text pages stay PNG and sharp. v69 already reads JPEG pages.
function pdfPageImage(surface){const png=surface.toDataURL('image/png'),jpeg=surface.toDataURL('image/jpeg',.88);return jpeg.startsWith('data:image/jpeg;base64,')&&jpeg.length<png.length*.6?jpeg:png}
function pdfImageSize(src){
  const png=src.startsWith('data:image/png;base64,'),jpeg=!png&&src.startsWith('data:image/jpeg;base64,');if(!png&&!jpeg)return null;
  const b64=src.slice(png?22:23);if(!/^[A-Za-z0-9+/]+={0,2}$/.test(b64))return null;
  if(png){const h=atob(b64.slice(0,44));if(!h.startsWith('\x89PNG\r\n\x1a\n')||h.slice(12,16)!=='IHDR')return null;const n=i=>((h.charCodeAt(i)*16777216)+(h.charCodeAt(i+1)<<16)+(h.charCodeAt(i+2)<<8)+h.charCodeAt(i+3));return {width:n(16),height:n(20)}}
  // JPEG: walk the marker segments to the first start-of-frame, which holds the size.
  const h=atob(b64.length<=65536?b64:b64.slice(0,65536)),c=i=>h.charCodeAt(i);if(c(0)!==255||c(1)!==216)return null;
  for(let i=2;i+8<h.length;){if(c(i)!==255)return null;const m=c(i+1);if(m===255){i++;continue}
    if(m>=192&&m<=207&&m!==196&&m!==200&&m!==204)return {width:c(i+7)*256+c(i+8),height:c(i+5)*256+c(i+6)};
    if(m===216||m===1||(m>=208&&m<=215)){i+=2;continue}i+=2+c(i+2)*256+c(i+3)}
  return null;
}
function validPdfBackground(b){
  if(!b||b.width!==1000||!Number.isSafeInteger(b.height)||b.height<100||b.height>3000||typeof b.name!=='string'||b.name.length>200||!Number.isSafeInteger(b.number)||!Number.isSafeInteger(b.total)||b.number<1||b.number>b.total||b.total>PDF_PAGE_LIMIT||typeof b.image!=='string'||b.image.length>6*1024*1024)return false;
  try{const size=pdfImageSize(b.image);return !!size&&size.width===b.width&&size.height===b.height}catch{return false}
}
async function validatePdfImages(book){
  const images=new Set([...book.pages,...(book.trash||[]).map(t=>t.page)].filter(p=>p.pdf).map(p=>p.pdf.image));
  for(const src of images){const image=new Image();let timer;try{image.src=src;await Promise.race([image.decode(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error()),10000)})])}catch{throw new Error('Yedekteki PDF görüntüsü okunamadı. Mevcut notlar değiştirilmedi.')}finally{clearTimeout(timer);image.src=''}}
}
function validPdfView(p){return (p.fitScale===undefined||(!p.pdf&&Number.isFinite(p.fitScale)&&p.fitScale>=0.2&&p.fitScale<=1))&&(p.pdfZoom===undefined||(!!p.pdf&&Number.isFinite(p.pdfZoom)&&p.pdfZoom>=1&&p.pdfZoom<=3))&&(p.viewX===undefined||(!!p.pdf&&Number.isFinite(p.viewX)&&p.viewX>=0&&p.viewX<=1000*(1-1/(p.pdfZoom??1))+1e-7))}
function pdfZoom(){return page()?.pdf?(page().pdfZoom??1):1}
// Plain pages zoom for this session only: their saved shape stays the one v60 reads,
// so rollback and older copies keep working. PDF zoom and position are saved as before.
const plainViews=new WeakMap();
function viewZoom(){const p=page();return p?.pdf?pdfZoom():(plainViews.get(p)?.zoom??1)}
function maxViewX(){const p=page(),zoom=viewZoom();if(!p||zoom===1)return 0;return (p.pdf?p.pdf.width:Math.max(1,canvas.getBoundingClientRect().width)/(p.fitScale||1))*(1-1/zoom)}
function viewX(){const p=page();return Math.min(maxViewX(),Math.max(0,(p?.pdf?p.viewX:plainViews.get(p)?.x)||0))}
function setViewX(x){const p=page();if(!p)return;if(p.pdf){p.viewX=x;return}const v=plainViews.get(p);if(v)v.x=x}
function paperScale(){const p=page();return p?.pdf?Math.max(1,canvas.getBoundingClientRect().width)/p.pdf.width*pdfZoom():(p?.fitScale||1)*viewZoom()}
function updatePdfZoom(){const zoom=viewZoom();document.querySelector('#pdfZoomValue').textContent=`%${Math.round(zoom*100)}`;document.querySelector('#pdfZoomOut').disabled=zoom<=1;document.querySelector('#pdfZoomIn').disabled=zoom>=3}
function setViewZoom(value){
  const p=page();if(!canEdit()||drawing||pan||!p||!Number.isFinite(value))return;
  const next=Math.max(1,Math.min(3,Math.round(value*4)/4));if(next===viewZoom())return;
  const r=canvas.getBoundingClientRect(),oldScale=paperScale(),cx=viewX()+r.width/(2*oldScale),cy=viewY()+r.height/(2*oldScale);
  if(p.pdf)p.pdfZoom=next;else{const v=plainViews.get(p)||{zoom:1,x:0};v.zoom=next;plainViews.set(p,v)}
  const scale=paperScale();setViewX(Math.max(0,Math.min(maxViewX(),cx-r.width/(2*scale))));p.viewY=Math.max(0,cy-r.height/(2*scale));
  updatePdfZoom();drawAll();scheduleSave();document.querySelector('#inputState').textContent=`${p.pdf?'PDF ':''}%${Math.round(next*100)} · iki parmakla her yöne kaydırın`;
}
function setPdfZoom(value){if(page()?.pdf)setViewZoom(value)}
document.querySelector('#pdfZoomOut').onclick=()=>setPdfZoom(pdfZoom()-.25);document.querySelector('#pdfZoomIn').onclick=()=>setPdfZoom(pdfZoom()+.25);document.querySelector('#pdfFit').onclick=()=>setPdfZoom(1);
function pdfBackgroundReady(){return !page()?.pdf||(pdfImageSource===page().pdf.image&&pdfImage?.complete&&pdfImage.naturalWidth>0&&!pdfImageFailed)}
function drawPdfBackground(){
  const bg=page()?.pdf;pdfCanvas.hidden=!bg;pdfBackdropState.hidden=!bg;if(!bg){pdfImage=null;pdfImageSource=null;pdfImageFailed=false;return}
  if(pdfImageSource!==bg.image){
    pdfImageSource=bg.image;pdfImageFailed=false;const image=new Image();pdfImage=image;
    image.onload=()=>{if(pdfImage===image)drawAll()};image.onerror=()=>{if(pdfImage===image){pdfImageFailed=true;pdfBackdropState.hidden=false;pdfBackdropState.textContent='PDF görüntüsü açılamadı. Bu sayfada yazı durduruldu; yedeğinizi koruyun.'}};image.src=bg.image;
  }
  if(!pdfBackgroundReady()){pdfBackdropState.hidden=false;pdfBackdropState.textContent=pdfImageFailed?'PDF görüntüsü açılamadı. Yedeğinizi koruyun.':'PDF sayfası açılıyor…';return}
  pdfBackdropState.hidden=true;
  if(pdfCanvas.width!==canvas.width||pdfCanvas.height!==canvas.height){pdfCanvas.width=canvas.width;pdfCanvas.height=canvas.height}
  const c=pdfCanvas.getContext('2d'),scale=paperScale(),d=canvas.width/Math.max(1,canvas.getBoundingClientRect().width);c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,pdfCanvas.width,pdfCanvas.height);c.setTransform(d*scale,0,0,d*scale,-viewX()*d*scale,-viewY()*d*scale);c.drawImage(pdfImage,0,0,bg.width,bg.height);
}
function updatePdfNavigation(){
  updatePdfZoom();
  const bg=page()?.pdf;pdfNavigation.hidden=!bg;document.querySelector('.workspace').classList.toggle('has-pdf',!!bg);if(!bg)return;
  const pages=notebookPages(),index=pages.findIndex(p=>p.id===activeId);document.querySelector('#pdfPageLabel').textContent=`${bg.name} · PDF ${bg.number}/${bg.total}`;
  document.querySelector('#pdfPrevious').disabled=index<=0||!pages[index-1]?.pdf;document.querySelector('#pdfNext').disabled=index>=pages.length-1||!pages[index+1]?.pdf;
}
function navigatePdf(delta){if(!canEdit()||drawing||pan)return;const pages=notebookPages(),index=pages.findIndex(p=>p.id===activeId),target=pages[index+delta];if(!target?.pdf)return;activeId=target.id;renderPages();drawAll();scheduleSave()}
document.querySelector('#pdfPrevious').onclick=()=>navigatePdf(-1);document.querySelector('#pdfNext').onclick=()=>navigatePdf(1);
function pdfMessage(text){document.querySelector('#pdfProgress').textContent=text}
function cancelPdf(){pdfRequest++;pdfPending=null;pdfBusy=false;const task=pdfTask;pdfTask=null;if(task)void task.destroy().catch(()=>{});cancelPresentation();document.querySelector('#pdfChoose').disabled=false;document.querySelector('#pdfApply').disabled=true;updatePresentationControls()}
pdfDialog.addEventListener('close',()=>{
  // A queued close event may belong to the previous opening of this dialog.
  if(pdfDialog.open)return;
  cancelPdf();document.querySelector('#toolsToggle').focus({preventScroll:true});
});
document.querySelector('#pdfClose').onclick=()=>{if(document.querySelector('#pdfClose').disabled)return;pdfDialog.close()};
pdfDialog.addEventListener('cancel',e=>{if(document.querySelector('#pdfClose').disabled)e.preventDefault()});
pdfOpen.onclick=()=>{if(!canEdit()||drawing||pan)return;closeTools();cancelPdf();pdfMessage('Bir PDF seçin. Hazır olunca yeni deftere ekleyin.');pdfDialog.showModal()};
document.querySelector('#pdfChoose').onclick=()=>document.querySelector('#pdfFile').click();
document.querySelector('#pdfFile').onchange=e=>{const file=e.target.files[0];e.target.value='';if(file)void importPdfFile(file)};
// Shared import preserves the v72 image budget, atomic save and asset migration.
async function importPdfFile(file,presentationName=null){
  if(!file||!ready||saveConflict||pdfBusy||!pdfDialog.open)return;
  cancelPdf();const request=pdfRequest;pdfBusy=true;document.querySelector('#pdfChoose').disabled=true;let task,timeout;
  updatePresentationControls();
  const sourceName=presentationName||file.name;
  try{
    if(file.size>PDF_FILE_LIMIT)throw new Error('Bu ilk sürüm en fazla 20 MB PDF kabul eder. Daha küçük bir dosya seçin.');
    if(!await flushSave())throw new Error('Mevcut notlar kaydedilemedi. Önce pencereyi kapatıp kaydı düzeltin.');
    pdfMessage('PDF cihazda açılıyor…');
    pdfLibrary??=await import('./vendor/pdfjs/pdf.min.js');if(request!==pdfRequest)return;
    pdfLibrary.GlobalWorkerOptions.workerSrc='./vendor/pdfjs/pdf.worker.min.js';
    const data=new Uint8Array(await file.arrayBuffer());if(request!==pdfRequest)return;
    task=pdfLibrary.getDocument({data,isEvalSupported:false,enableXfa:false,stopAtErrors:true,cMapUrl:'./vendor/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'./vendor/pdfjs/standard_fonts/',wasmUrl:'./vendor/pdfjs/wasm/'});pdfTask=task;
    timeout=setTimeout(()=>{if(request===pdfRequest){cancelPdf();pdfMessage('PDF hazırlığı zaman aşımına uğradı. Daha küçük bir dosya deneyin.')}},60000);
    const doc=await task.promise;if(request!==pdfRequest)return;
    if(doc.numPages>PDF_PAGE_LIMIT)throw new Error(`Bu belgede ${doc.numPages} sayfa var. En fazla ${PDF_PAGE_LIMIT} sayfa kabul edilir. Dosyayı bölerek deneyin.`);
    const pages=[];let bytes=0;const existingImages=notebookImageBytes();
    for(let number=1;number<=doc.numPages;number++){
      if(request!==pdfRequest)return;pdfMessage(`PDF sayfası hazırlanıyor: ${number}/${doc.numPages}`);
      const source=await doc.getPage(number),base=source.getViewport({scale:1}),viewport=source.getViewport({scale:1000/base.width});
      if(!Number.isFinite(viewport.height)||viewport.height<100||viewport.height>3000)throw new Error('PDF sayfa oranı bu ilk sürümde desteklenmiyor.');
      const surface=document.createElement('canvas');surface.width=1000;surface.height=Math.ceil(viewport.height);let image;
      try{await source.render({canvasContext:surface.getContext('2d'),viewport,background:'#ffffff'}).promise;if(request!==pdfRequest)return;image=pdfPageImage(surface)}
      finally{surface.width=surface.height=1;source.cleanup()}
      bytes+=image.length;
      if(image.length>6*1024*1024||bytes>PDF_IMAGE_LIMIT)throw new Error('PDF görüntüleri tablet test sınırını aşıyor. Daha az sayfalı dosya deneyin.');if(existingImages+bytes>NOTEBOOK_PDF_LIMIT)throw notebookLimitError(existingImages+bytes);
      pages.push({id:newPageId(),title:presentationName?`Sunum · Slayt ${number}`:`PDF · Sayfa ${number}`,strokes:[],viewY:0,pdf:{image,width:1000,height:Math.ceil(viewport.height),name:sourceName.slice(0,200),number,total:doc.numPages},updated:new Date().toISOString()});
      // Give input/close/progress a turn between pages; keep only one live render canvas.
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    if(request!==pdfRequest)return;pdfPending={title:sourceName.replace(/\.(pdf|pptx?)$/i,'').trim().slice(0,65)||'Belge',pages,presentation:!!presentationName};pdfMessage(`${sourceName} · ${pages.length} ${presentationName?'slayt':'sayfa'} hazır. Yeni deftere ekleyin. Özgün dosyanızı ayrıca koruyun.`);document.querySelector('#pdfApply').disabled=false;
  }catch(error){if(request===pdfRequest){pdfPending=null;pdfMessage(error?.name==='PasswordException'?'Şifreli PDF bu ilk sürümde desteklenmiyor. Şifresiz bir kopya seçin.':`PDF eklenmedi. ${error?.message||'Dosya okunamadı.'}`)}}
  finally{clearTimeout(timeout);if(task)await task.destroy().catch(()=>{});if(request===pdfRequest){pdfTask=null;pdfBusy=false;document.querySelector('#pdfChoose').disabled=false;updatePresentationControls()}}
}
document.querySelector('#pdfApply').onclick=async()=>{
  if(!pdfPending||pdfBusy||!ready||saveConflict)return;
  pdfBusy=true;document.querySelector('#pdfApply').disabled=true;document.querySelector('#pdfChoose').disabled=true;document.querySelector('#pdfClose').disabled=true;pdfMessage('PDF ve mevcut notlar birlikte kaydediliyor…');
  updatePresentationControls();
  try{
    if(!await flushSave())throw new Error('Mevcut notlar kaydedilemedi; önce kayıt sorununu düzeltin.');
    const adding=pdfPending.pages.reduce((n,p)=>n+p.pdf.image.length,0),current=notebookImageBytes();if(current+adding>NOTEBOOK_PDF_LIMIT)throw notebookLimitError(current+adding);
    const estimate=await navigator.storage?.estimate?.().catch(()=>null);
    if(estimate&&Number.isFinite(estimate.quota)&&Number.isFinite(estimate.usage)&&estimate.quota-estimate.usage<2*(current+adding))throw new Error('Cihazda bu PDF için yeterli boş alan yok. Mevcut notlar korundu; iPad Saklama Alanı’ndan yer açıp yeniden deneyin.');
    const id=newPageId(),titles=new Set(notebooks().map(n=>n.title.toLocaleLowerCase('tr-TR')));let title=pdfPending.title,n=2;while(titles.has(title.toLocaleLowerCase('tr-TR')))title=`${pdfPending.title} (${n++})`;
    const added=pdfPending.pages.map(p=>({...p,notebookId:id})),next={...state,version:Math.max(2,state.version),notebooks:[...(state.notebooks||[]),{id,title}],pages:[...state.pages,...added],active:added[0].id,activeNotebook:id};
    if(!validState(next))throw new Error('PDF kayıt yapısı doğrulanamadı.');
    await dbPut(next,{preservePrevious:true});scheduleAssetSweep();state=next;activeId=next.active;activeNotebook=id;editRevision++;savedRevision=editRevision;saveFailed=false;failureMessage='';pdfPending=null;pdfDialog.close();renderPages();resize();renderSaveStatus();await refreshRecovery();document.querySelector('#inputState').textContent='PDF eklendi · kalemle yazın, iki parmakla kaydırın';
  }catch(error){pdfMessage(`PDF eklenmedi; mevcut notlar korundu. ${error?.name==='NotebookConflict'?'Başka sekmede değişiklik var. Pencereyi kapatıp kayıtlı defteri yeniden açın.':error?.message||'Kaydı tekrar deneyin.'}`);if(error?.name==='NotebookConflict'){saveError(error);pdfDialog.close()}}
  finally{pdfBusy=false;document.querySelector('#pdfClose').disabled=false;document.querySelector('#pdfChoose').disabled=false;document.querySelector('#pdfApply').disabled=!pdfPending;updatePresentationControls()}
};

// Never display raw server errors or an unbounded body in a notebook window.
async function presentationErrorMessage(response){
  const fallback=({429:'Sunucu meşgul. Biraz sonra yeniden deneyin.',413:'Sunum boyut sınırını aşıyor.',415:'Sunum türü veya içeriği desteklenmiyor.',422:'Sunum açılamadı. Dosya bozuk, şifreli ya da güvenlik nedeniyle reddedilmiş olabilir.',503:'Sunum hizmeti şu anda kullanılamıyor; yöneticinize bildirin.',504:'Dönüştürme zaman aşımına uğradı. Yeniden göndermeden önce yöneticinin hizmeti denetlemesi gerekiyor.'})[response.status]||'İşlem tamamlanamadı. Hesabınızı ve bağlantınızı denetleyin.';
  if(response.status!==422||!(response.headers.get('content-type')||'').toLowerCase().startsWith('application/json')||!response.body){void response.body?.cancel().catch(()=>{});return fallback}
  const reader=response.body.getReader();let size=0,text='',timer;const decoder=new TextDecoder();
  // Some engines buffer a partial error body until EOF. A byte cap alone cannot
  // release the editor then; bound this optional explanation separately from conversion.
  const deadline=new Promise(resolve=>{timer=setTimeout(()=>resolve(null),5000)});
  try{
    for(;;){const part=await Promise.race([reader.read(),deadline]);if(!part){void reader.cancel().catch(()=>{});return fallback}const {value,done}=part;if(done)break;size+=value.byteLength;if(size>4096){void reader.cancel().catch(()=>{});return fallback}text+=decoder.decode(value,{stream:true})}
    text+=decoder.decode();const detail=JSON.parse(text)?.detail;
    if(detail?.code==='presentation_slide_limit'&&detail.max_slides===PDF_PAGE_LIMIT&&Number.isSafeInteger(detail.actual_slides)&&detail.actual_slides>PDF_PAGE_LIMIT&&detail.actual_slides<=1000000)return `Bu sunumda ${detail.actual_slides} slayt var. En fazla ${PDF_PAGE_LIMIT} slayt kabul edilir. Sunumu bölerek deneyin.`;
  }catch{/* Only the specific safe numeric contract is user-visible. */}finally{clearTimeout(timer);reader.releaseLock()}
  return fallback;
}
// Adapted from b03bb10's opt-in import, integrated with v72's save/asset safeguards.
// Closing/offline/account lock invalidates both the upload and any delayed response.
(() => {
  'use strict';
  const base='./api/v1/bilge-defter/pdf-tools/',types={pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation'};
  const section=document.createElement('section');section.id='pdfPresentationSection';
  section.innerHTML='<button class="btn" id="pdfPresentationChoose">PowerPoint seç (.pptx)</button><input id="pdfPresentationFile" type="file" accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation" hidden><p class="recovery-note">Eski .ppt dosyalarını PowerPoint’ten PDF olarak dışa aktarıp Cihazdan PDF seç ile açın.</p><div id="pdfPresentationConsent" hidden><p class="recovery-note">Yalnız seçtiğiniz sunum, onayınızla Bilge Defter sunucusunda PDF’e çevrilir. Mevcut defteriniz gönderilmez. Dönüşüm internet ve onaylı hesap gerektirir. Slaytlar sabit görüntü olur; animasyon, video ve konuşmacı notları aktarılmaz. Yazı tipi ve yerleşim değişebilir; eklemeden önce slaytları kontrol edin. En fazla 20 MB / '+PDF_PAGE_LIMIT+' slayt. Görsel yoğunluğu cihazın güvenli görüntü bütçesini aşabilir. Makro, gömülü nesne ve dış bağlantı içeren dosyalar güvenlik nedeniyle reddedilebilir.</p><label class="presentation-consent"><input id="pdfPresentationAgree" type="checkbox"> Seçtiğim sunumun sunucuda dönüştürülmesini onaylıyorum.</label><button class="btn primary" id="pdfPresentationSend" disabled>Sunumu gönder ve dönüştür</button></div>';
  document.querySelector('#pdfProgress').before(section);
  const preview=document.createElement('div');preview.id='presentationPreview';preview.hidden=true;
  preview.innerHTML='<p class="recovery-note">Dönüşüm önizlemesi: yerleşimi kontrol edin. Henüz deftere eklenmedi.</p><img id="presentationPreviewImage" alt="Dönüştürülen slayt önizlemesi"><div class="presentation-preview-controls"><button class="btn" id="presentationPreviewPrevious" aria-label="Önceki slayt önizlemesi">←</button><output id="presentationPreviewCount" aria-live="polite"></output><button class="btn" id="presentationPreviewNext" aria-label="Sonraki slayt önizlemesi">→</button></div>';
  section.append(preview);
  pdfStyle.textContent+='#pdfDialog{overflow:auto}#pdfPresentationSection{margin:12px 0}#pdfPresentationConsent[hidden]{display:none}#pdfPresentationSection .presentation-consent{display:flex;gap:10px;align-items:flex-start;line-height:1.5;margin:12px 0}#pdfPresentationAgree{flex:none;width:22px;height:22px}#pdfPresentationSection .btn{max-width:100%;white-space:normal}';
  pdfStyle.textContent+='#presentationPreview[hidden]{display:none}#presentationPreviewImage{display:block;width:100%;height:auto;border:1px solid #d5e2dc}#presentationPreview .presentation-preview-controls{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:8px}';
  const choose=section.querySelector('#pdfPresentationChoose'),input=section.querySelector('#pdfPresentationFile'),block=section.querySelector('#pdfPresentationConsent'),agree=section.querySelector('#pdfPresentationAgree'),send=section.querySelector('#pdfPresentationSend');
  const open=document.createElement('button');open.id='presentationOpen';open.className='btn';open.textContent='PowerPoint aç';pdfOpen.after(open);
  open.onclick=()=>{pdfOpen.click();if(pdfDialog.open)choose.focus({preventScroll:true})};
  let selected=null,busy=false,epoch=0,controller=null,previewPending=null,previewIndex=0;
  function allowed(){const a=window.BilgeAccount;return !!(a?.required&&!a.locked&&a.identity?.status==='approved'&&navigator.onLine)}
  function controls(){
    choose.disabled=pdfBusy||busy;agree.disabled=pdfBusy||busy;send.disabled=pdfBusy||busy||!selected||!agree.checked||!allowed();block.hidden=!selected;
    if(previewPending!==pdfPending){previewPending=pdfPending;previewIndex=0}
    preview.hidden=!pdfPending?.presentation;
    const image=preview.querySelector('img');
    if(preview.hidden){image.removeAttribute('src');return}
    const pages=pdfPending.pages;image.src=pages[previewIndex].pdf.image;
    preview.querySelector('output').textContent=`Slayt ${previewIndex+1} / ${pages.length}`;
    preview.querySelector('#presentationPreviewPrevious').disabled=pdfBusy||previewIndex===0;
    preview.querySelector('#presentationPreviewNext').disabled=pdfBusy||previewIndex>=pages.length-1;
  }
  preview.querySelector('#presentationPreviewPrevious').onclick=()=>{if(!pdfBusy&&previewIndex>0){previewIndex--;controls()}};
  preview.querySelector('#presentationPreviewNext').onclick=()=>{if(!pdfBusy&&previewIndex<(pdfPending?.pages.length||0)-1){previewIndex++;controls()}};
  function reset(){epoch++;controller?.abort();controller=null;selected=null;busy=false;input.value='';agree.checked=false;controls()}
  cancelPresentation=reset;updatePresentationControls=controls;
  choose.onclick=()=>{if(!choose.disabled&&pdfDialog.open)input.click()};
  input.onchange=async()=>{
    const file=input.files[0];if(!file||pdfBusy||!pdfDialog.open)return;
    cancelPdf();const token=epoch;
    if(!allowed()){pdfMessage('PowerPoint aktarımı internet ve onaylı hesap gerektirir. Hiçbir dosya gönderilmedi. Sunumu PDF olarak dışa aktarıp cihazdan açabilirsiniz.');return}
    const ext=(file.name.match(/\.(pptx?)$/i)||[])[1]?.toLowerCase(),media=types[ext];
    if(!media){pdfMessage('Bu sürüm yalnız .pptx sunumlarını destekler. Eski .ppt dosyasını PowerPoint’ten PDF olarak dışa aktarıp açın. Hiçbir dosya gönderilmedi.');return}
    if(file.size<8||file.size>PDF_FILE_LIMIT){pdfMessage('Boş olmayan, en fazla 20 MB sunum seçin. Hiçbir dosya gönderilmedi.');return}
    try{
      const bytes=new Uint8Array(await file.slice(0,8).arrayBuffer()),magic=ext==='pptx'?[0x50,0x4b,0x03,0x04]:[0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1];
      if(!magic.every((b,i)=>bytes[i]===b))throw Error('Sunum dosyası doğrulanamadı.');
      if(token!==epoch||!pdfDialog.open)return;
      selected={file,media};pdfMessage(`${file.name} seçildi. Henüz gönderilmedi; dönüştürmek için aşağıdaki onayı işaretleyin.`);controls();
    }catch{if(token===epoch)pdfMessage('Sunum dosyası okunamadı veya doğrulanamadı. Hiçbir dosya gönderilmedi.')}
  };
  agree.onchange=controls;
  send.onclick=async()=>{
    controls();if(send.disabled||!ready||saveConflict)return;
    const token=++epoch,account=window.BilgeAccount.identity.id,{file,media}=selected,abort=new AbortController();controller=abort;busy=true;pdfBusy=true;document.querySelector('#pdfChoose').disabled=true;controls();
    const alive=()=>token===epoch&&pdfDialog.open&&allowed()&&window.BilgeAccount.identity.id===account;
    const timer=setTimeout(()=>abort.abort(),100000);
    try{
      if(!await flushSave())throw Error('Mevcut notlar kaydedilemedi; sunum gönderilmedi.');
      if(!alive())return;
      pdfMessage('Sunum hizmeti denetleniyor… Henüz dosya gönderilmedi.');
      const status=await window.BilgeAccount.fetch(base+'status',{signal:abort.signal});if(!alive())return;
      const info=status.ok&&(status.headers.get('content-type')||'').includes('application/json')?await status.json():null;if(!alive())return;
      if(info?.worker_state==='unknown')throw Error('Önceki dönüştürme işleminin sonucu belirsiz. Yöneticinin sunum hizmetini denetlemesi gerekiyor; yeni dosya gönderilmedi.');
      if(!(info?.configured===true&&info.consent_required===true&&info.operations?.includes('convert')))throw Error('Sunucuda PowerPoint aktarımı henüz açılmadı. Sunumu PDF olarak dışa aktarıp cihazdan açabilirsiniz.');
      pdfMessage('Sunum PDF’e dönüştürülüyor… Pencereyi kapatarak beklemeyi iptal edebilirsiniz.');
      const response=await window.BilgeAccount.fetch(base+'convert',{method:'POST',headers:{'Content-Type':media,'X-Bilge-Pdf-Consent':'1'},body:file,signal:abort.signal});
      if(!alive())return;
      if(!response.ok)throw Error(await presentationErrorMessage(response));
      if((response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase()!=='application/pdf'||Number(response.headers.get('content-length')||0)>PDF_FILE_LIMIT||!response.body)throw Error('Sunucudan geçerli PDF alınamadı.');
      const reader=response.body.getReader(),chunks=[];let size=0;
      try{for(;;){const {value,done}=await reader.read();if(!alive()){await reader.cancel();return}if(done)break;size+=value.length;if(size>PDF_FILE_LIMIT)throw Error('Dönüşüm sonucu 20 MB sınırını aşıyor.');chunks.push(value)}}catch(e){await reader.cancel().catch(()=>{});throw e}finally{reader.releaseLock()}
      const blob=new Blob(chunks,{type:'application/pdf'});
      if(!new TextDecoder().decode(await blob.slice(0,5).arrayBuffer()).startsWith('%PDF-')||!new TextDecoder().decode(await blob.slice(-1024).arrayBuffer()).includes('%%EOF'))throw Error('Sunucu eksik PDF döndürdü.');
      if(!alive())return;
      // End the upload before handing over; cancelPdf inside import revokes this epoch.
      clearTimeout(timer);controller=null;busy=false;pdfBusy=false;selected=null;agree.checked=false;controls();
      await importPdfFile(new File([blob],file.name.replace(/\.pptx?$/i,'')+'.pdf',{type:'application/pdf'}),file.name);
    }catch(e){if(token===epoch&&pdfDialog.open)pdfMessage(e.name==='AbortError'?'Dönüştürme zaman aşımına uğradı veya iptal edildi. Notlar değişmedi.':`Sunum eklenmedi. ${e.message==='Failed to fetch'?'Bağlantı kurulamadı.':e.message||'İşlem tamamlanamadı.'}`)}
    finally{clearTimeout(timer);abort.abort();if(token===epoch){controller=null;busy=false;pdfBusy=false;agree.checked=false;document.querySelector('#pdfChoose').disabled=false;controls()}}
  };
  // Network loss does not imply an already-uploaded file was never sent.
  addEventListener('offline',()=>{if(selected||busy){cancelPdf();if(pdfDialog.open)pdfMessage('Bağlantı kesildi; aktarım tamamlanmadı. Notlar değişmedi. Sunucuya ulaşan işlem bir süre daha çalışabilir.')}});
  addEventListener('bilge-account-locked',()=>{cancelPdf();if(pdfDialog.open)pdfMessage('Hesap erişimi değişti. Aktarım durduruldu; notlar değişmedi.')});
  addEventListener('pagehide',()=>cancelPdf());
})();
