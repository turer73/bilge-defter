'use strict';
// Classic script inside sandbox="allow-scripts" WITHOUT allow-same-origin.
// Do not add storage, fetch, parent DOM access, accounts or privileged RPCs.
(()=>{
  const runtime=globalThis.BilgePptxRuntime;
  const stage=document.getElementById('stage');
  // srcdoc has no fragment. The parent supplies only a random channel token in
  // the browsing-context name, never an account, file path or notebook value.
  const token=/^bilge-pptx-([a-f0-9]{64})$/.exec(window.name)?.[1];
  if(!runtime||!stage||!token||parent===window)return;
  const MiB=1024*1024,MAX_BYTES=20*MiB,MAX_XML=2*MiB,MAX_XML_TOTAL=16*MiB;
  const LIMITS=Object.freeze({maxEntries:4000,maxEntryUncompressedBytes:32*MiB,maxTotalUncompressedBytes:128*MiB,maxMediaBytes:96*MiB,maxConcurrency:2});
  const CODES=new Set(['UNSUPPORTED','LIMIT','TIMEOUT','RENDER']);
  const fail=code=>{throw Object.assign(new Error(code),{code});};
  const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
  const keys=(value,allowed)=>record(value)&&Object.keys(value).every(key=>allowed.includes(key));
  const textDecoder=new TextDecoder('utf-8',{fatal:true});
  let port=null,viewer=null,handle=null,meta=null,busy=false,lastId=0,nodeErrors=0,blocked=false,closed=false;
  const urls=new Map(),createURL=URL.createObjectURL.bind(URL),revokeURL=URL.revokeObjectURL.bind(URL);
  URL.createObjectURL=value=>{const url=createURL(value);urls.set(url,value);return url;};
  URL.revokeObjectURL=url=>{urls.delete(url);revokeURL(url);};
  // FontFace instances are not serializable into an SVG image. Retain only
  // bounded sources, inside the sandbox, so a snapshot can embed the exact
  // registered font instead of silently changing its metrics.
  const NativeFontFace=globalThis.FontFace;let fontSources=new WeakMap();
  if(NativeFontFace)globalThis.FontFace=class extends NativeFontFace{
    constructor(family,source,descriptors){
      super(family,source,descriptors);
      let blob=null;
      if(source instanceof ArrayBuffer||ArrayBuffer.isView(source)){
        const size=source.byteLength;
        // The pinned runtime bounds live faces to eight. A weak association
        // neither retains disposed fonts nor drops a face awaiting fonts.add().
        if(size>0&&size<=8*MiB)blob=new Blob([source],{type:'font/ttf'});
      }
      fontSources.set(this,blob);
    }
  };
  document.addEventListener('securitypolicyviolation',()=>{blocked=true;});
  // Inert plus a capturing guard: content never supplies navigation, input or
  // media controls. The only interactive surface is the host's ink canvas.
  for(const type of ['click','auxclick','dblclick','contextmenu','keydown','submit'])document.addEventListener(type,event=>{event.preventDefault();event.stopImmediatePropagation();},true);
  function clear(){
    try{handle?.dispose();}catch{}handle=null;
    try{viewer?.destroy();}catch{}viewer=null;meta=null;stage.replaceChildren();
    for(const url of urls.keys())try{revokeURL(url);}catch{}urls.clear();
    try{document.fonts.clear();}catch{}
    fontSources=new WeakMap();
    nodeErrors=0;blocked=false;
  }
  function shutdown(){closed=true;clear();try{port?.close();}catch{}port=null;window.removeEventListener('message',connect);}
  window.addEventListener('pagehide',shutdown,{once:true});

  // Inspect the central directory BEFORE JSZip allocates expanded entries.
  // This is a bounded policy check, not a claim that browser memory is capped:
  // image/font decoding and DOM rendering require additional memory.
  function inspectDirectory(buffer){
    if(!(buffer instanceof ArrayBuffer)||buffer.byteLength<22||buffer.byteLength>MAX_BYTES)fail('LIMIT');
    const view=new DataView(buffer),bytes=new Uint8Array(buffer),length=bytes.length;
    if(view.getUint32(0,true)!==0x04034b50)fail('UNSUPPORTED');
    let end=-1;
    for(let offset=length-22;offset>=Math.max(0,length-65557);offset--){
      if(view.getUint32(offset,true)===0x06054b50&&offset+22+view.getUint16(offset+20,true)===length){end=offset;break;}
    }
    if(end<0||view.getUint16(end+4,true)||view.getUint16(end+6,true))fail('UNSUPPORTED');
    const count=view.getUint16(end+10,true),size=view.getUint32(end+12,true),start=view.getUint32(end+16,true);
    if(!count||count>LIMITS.maxEntries||view.getUint16(end+8,true)!==count)fail('LIMIT');
    if(start+size!==end||start>=end)fail('UNSUPPORTED');
    const names=new Map();let position=start,total=0,media=0,xmlTotal=0;
    for(let index=0;index<count;index++){
      if(position+46>end||view.getUint32(position,true)!==0x02014b50)fail('UNSUPPORTED');
      const flags=view.getUint16(position+8,true),method=view.getUint16(position+10,true),compressed=view.getUint32(position+20,true),expanded=view.getUint32(position+24,true);
      const nameLength=view.getUint16(position+28,true),extra=view.getUint16(position+30,true),comment=view.getUint16(position+32,true),local=view.getUint32(position+42,true);
      if(!nameLength||nameLength>512||position+46+nameLength+extra+comment>end||local+30>start||(flags&1)||![0,8].includes(method))fail('UNSUPPORTED');
      if(expanded>LIMITS.maxEntryUncompressedBytes||(expanded&&(!compressed||expanded/compressed>200)))fail('LIMIT');
      if(view.getUint32(local,true)!==0x04034b50||view.getUint16(local+8,true)!==method||view.getUint16(local+6,true)!==flags)fail('UNSUPPORTED');
      const localNameLength=view.getUint16(local+26,true),localExtra=view.getUint16(local+28,true);
      if(localNameLength!==nameLength||local+30+localNameLength+localExtra+compressed>start)fail('UNSUPPORTED');
      let name;try{name=textDecoder.decode(bytes.subarray(position+46,position+46+nameLength));}catch{fail('UNSUPPORTED');}
      for(let n=0;n<nameLength;n++)if(bytes[position+46+n]!==bytes[local+30+n])fail('UNSUPPORTED');
      if(name.startsWith('/')||name.includes('\\')||/[\u0000-\u001f\u007f]/.test(name)||name.split('/').some(part=>part==='.'||part==='..')||name.split('/').length>16||/%(?:2f|5c|2e)/i.test(name))fail('UNSUPPORTED');
      const folded=name.toLowerCase();
      if(names.has(folded)||/vba|activex|oleobject/.test(folded)||folded.startsWith('ppt/embeddings/')||/\.(?:exe|dll|bin|pptm|ppsm|potm)$/.test(folded))fail('UNSUPPORTED');
      const mode=view.getUint32(position+38,true)>>>16;if((mode&0xf000)===0xa000)fail('UNSUPPORTED');
      total+=expanded;if(folded.startsWith('ppt/media/'))media+=expanded;
      if(/\.(?:xml|rels|svg)$/.test(folded)){if(expanded>MAX_XML)fail('LIMIT');xmlTotal+=expanded;}
      if(total>LIMITS.maxTotalUncompressedBytes||media>LIMITS.maxMediaBytes||xmlTotal>MAX_XML_TOTAL)fail('LIMIT');
      names.set(folded,{name,expanded});position+=46+nameLength+extra+comment;
    }
    if(position!==end||!['[content_types].xml','ppt/presentation.xml','ppt/_rels/presentation.xml.rels','_rels/.rels'].every(name=>names.has(name)))fail('UNSUPPORTED');
    return names;
  }
  function parseXml(text){
    if(/<!DOCTYPE|<!ENTITY/i.test(text))fail('UNSUPPORTED');
    const xml=new DOMParser().parseFromString(text,'application/xml');
    if(xml.querySelector('parsererror'))fail('UNSUPPORTED');
    return xml;
  }
  function cacheCheckedXml(entry,raw,text){
    const original=entry.async.bind(entry);
    // The package asks for the same XML a second time while constructing its
    // categorized model. Reuse only the bytes/text we already bounded and
    // checked, never a different path or a different document.
    entry.async=(kind,...rest)=>kind==='string'?Promise.resolve(text):kind==='uint8array'?Promise.resolve(raw):original(kind,...rest);
  }
  async function validateArchive(buffer,names){
    const zip=await runtime.zip.loadAsync(buffer);performance.mark('pptx-policy-zip-end');let nodes=0,links=0,slides=0;
    const entries=[...names.values()].filter(({name})=>/\.(?:xml|rels|svg)$/i.test(name));let cursor=0,failure=null;
    const readNext=async()=>{while(cursor<entries.length&&!failure){
      const {name,expanded}=entries[cursor++];
      try{
      const entry=zip.file(name);if(!entry)fail('UNSUPPORTED');
      const raw=await entry.async('uint8array');if(raw.byteLength!==expanded||raw.byteLength>MAX_XML)fail('LIMIT');
      let text;try{text=textDecoder.decode(raw);}catch{fail('UNSUPPORTED');}
      const xml=parseXml(text),stack=[{element:xml.documentElement,depth:1}];
      // Avoid repeated indexing of a live XML NodeList and walking every
      // ancestor for every node. WebKit is particularly costly on that path.
      while(stack.length){
        const {element,depth}=stack.pop();if(++nodes>160000||depth>100)fail('LIMIT');
        for(let child=element.lastElementChild;child;child=child.previousElementSibling)stack.push({element:child,depth:depth+1});
        if(['oleObj','control','script','foreignObject'].includes(element.localName))fail('UNSUPPORTED');
        if(name.toLowerCase()==='[content_types].xml'&&/macroenabled|vba|activex|oleobject/i.test(element.getAttribute('ContentType')||''))fail('UNSUPPORTED');
        if(name.toLowerCase()==='ppt/presentation.xml'&&element.localName==='sldId'&&element.parentElement?.localName==='sldIdLst')slides++;
        if(element.localName==='Relationship'){
          const type=element.getAttribute('Type')||'',target=element.getAttribute('Target')||'',mode=element.getAttribute('TargetMode')||'';
          if(/vba|activex|oleobject/i.test(type)||target.length>4096)fail('UNSUPPORTED');
          if(mode==='External'){
            let url;try{url=new URL(target);}catch{fail('UNSUPPORTED');}
            if(!type.endsWith('/hyperlink')||!['https:','http:'].includes(url.protocol)||url.username||url.password)fail('UNSUPPORTED');
            links++;
          }else if(mode||/^[a-z][a-z0-9+.-]*:/i.test(target)||target.startsWith('//'))fail('UNSUPPORTED');
        }
        if(name.toLowerCase().endsWith('.svg'))for(const attribute of element.attributes){
          if(/^on/i.test(attribute.name)||/href$/i.test(attribute.localName)&&!attribute.value.startsWith('#')||/url\(\s*[^#\s]/i.test(attribute.value))fail('UNSUPPORTED');
        }
      }
      cacheCheckedXml(entry,raw,text);
      }catch(cause){failure??=cause;}
    }};
    // At most two bounded XML reads run together; await both even on failure
    // so a rejected import cannot leave a parser running behind the next one.
    await Promise.all(Array.from({length:Math.min(LIMITS.maxConcurrency,entries.length)},readNext));
    if(failure)throw failure;
    if(slides<1)fail('UNSUPPORTED');if(slides>100)fail('LIMIT');
    return {slides,links,zip};
  }
  function imageBudget(data){
    const view=new DataView(data.buffer,data.byteOffset,data.byteLength);let width=0,height=0;
    if(data.byteLength>=24&&view.getUint32(0)===0x89504e47&&view.getUint32(4)===0x0d0a1a0a){width=view.getUint32(16);height=view.getUint32(20);}
    else if(data.byteLength>=10&&data[0]===0xff&&data[1]===0xd8){
      for(let p=2,steps=0;p+4<data.byteLength&&steps++<2048;){
        if(data[p++]!==0xff)break;let marker=data[p++];while(marker===0xff&&p<data.byteLength)marker=data[p++];
        if(marker===0xd9||marker===0xda)break;if(marker===0x01||marker>=0xd0&&marker<=0xd7)continue;
        const length=view.getUint16(p);if(length<2||p+length>data.byteLength)break;
        if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)&&length>=7){height=view.getUint16(p+3);width=view.getUint16(p+5);break;}p+=length;
      }
    }
    if(width>8192||height>8192||width*height>16*1024*1024)fail('LIMIT');
  }
  async function load(bytes){
    clear();performance.clearMarks();performance.mark('pptx-directory-start');
    const names=inspectDirectory(bytes);performance.mark('pptx-directory-end');
    const policy=await validateArchive(bytes,names);performance.mark('pptx-policy-end');
    // Parsing would otherwise reopen the identical ZIP and inflate every XML
    // twice. The same pinned library owns both passes. Temporarily share this
    // exact byte-identity archive, then restore its loader even on failure.
    const originalLoad=runtime.zip.loadAsync;
    runtime.zip.loadAsync=function(buffer,...rest){return buffer===bytes?Promise.resolve(policy.zip):originalLoad.call(this,buffer,...rest);};
    let files;try{files=await runtime.parse(bytes,LIMITS);}finally{runtime.zip.loadAsync=originalLoad;}
    performance.mark('pptx-parse-end');
    if(files.slides.size!==policy.slides)fail('UNSUPPORTED');
    if(files.mediaResolver){const resolve=files.mediaResolver.resolve.bind(files.mediaResolver);files.mediaResolver.resolve=async target=>{const result=await resolve(target);if(result)imageBudget(result.data);return result;};}
    const model=runtime.build(files,{lazySlides:true});
    performance.mark('pptx-model-end');
    if(model.slides.length!==policy.slides||![model.width,model.height].every(value=>Number.isFinite(value)&&value>=1&&value<=100000)||model.height/model.width<0.1||model.height/model.width>3)fail('LIMIT');
    viewer=new runtime.Viewer(stage,{width:1000,pdfjs:false,lazySlides:true,lazyMedia:true,zipLimits:LIMITS,
      embeddedFontLimits:{maxFaces:8,maxInputBytesPerFace:4*MiB,maxDecompressedBytesPerFace:8*MiB,maxTotalDecompressedBytes:16*MiB,maxProcessingMs:150},
      onNodeError:()=>{nodeErrors++;},onSlideError:()=>{nodeErrors++;}});
    viewer.load(model);
    meta={slideCount:model.slides.length,width:model.width,height:model.height,warnings:['experimental_layout','font_fallback_possible',...(policy.links?['links_disabled']:[])]};
    return meta;
  }
  async function show(index){
    if(!meta||!Number.isSafeInteger(index)||index<0||index>=meta.slideCount)fail('UNSUPPORTED');
    handle?.dispose();handle=null;stage.replaceChildren();nodeErrors=0;blocked=false;
    handle=viewer.renderThumbnailToContainer(index,stage,{width:1000});if(!handle)fail('RENDER');
    await handle.ready;await document.fonts.ready;
    const images=[...stage.querySelectorAll('img')];
    const decoded=await Promise.allSettled(images.map(image=>image.decode()));
    // A below-viewport iframe may not receive animation frames. Readiness is
    // resource/layout completion, not a paint acknowledgement: paint happens
    // naturally when the user scrolls here. Yield once for pending DOM/error
    // tasks, then force layout without waiting on offscreen requestAnimationFrame.
    await new Promise(resolve=>setTimeout(resolve,0));
    stage.getBoundingClientRect();
    if(blocked||nodeErrors||decoded.some(value=>value.status!=='fulfilled')||images.some(image=>!image.complete||image.naturalWidth===0)||/Unsupported format:|Unsupported chart|Chart render error|Render Error/i.test(stage.textContent||''))fail('RENDER');
    if(stage.querySelectorAll('*').length>30000||images.reduce((sum,image)=>sum+image.naturalWidth*image.naturalHeight,0)>64*1024*1024)fail('LIMIT');
    return {index,width:1000,height:1000*meta.height/meta.width,warnings:meta.warnings};
  }
  // A serialized foreignObject image must use a data URL. A blob URL taints
  // canvas in Chromium and WebKit even inside this opaque sandbox. Its nested
  // resources must also be inlined: otherwise export can succeed with missing
  // pictures. No fetch or new browsing/storage privilege is needed here.
  async function snapshot(index){
    const slide=await show(index),height=Math.ceil(slide.height);
    const MAX_NODES=6000,MAX_SERIALIZED=16*MiB,MAX_RESOURCES=16*MiB,MAX_RESOURCE=8*MiB,MAX_IMAGE=6*MiB;
    const XHTML='http://www.w3.org/1999/xhtml',SVG='http://www.w3.org/2000/svg';
    if(height<100||height>3000||1000*height>3000000)fail('LIMIT');
    const source=handle?.element;if(!source||!stage.contains(source))fail('RENDER');
    const count=source.querySelectorAll('*').length+1;if(count>MAX_NODES)fail('LIMIT');
    let chars=0,resourceBytes=0,nodeCount=0,decodedPixels=0;const resources=new Map(),pictureProbes=[],ids=new Set([source,...source.querySelectorAll('[id]')].map(node=>node.id).filter(Boolean));
    const charge=value=>{chars+=value.length;if(chars>MAX_SERIALIZED)fail('LIMIT');return value;};
    const readBlob=blob=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Object.assign(Error('Unreadable raster resource'),{code:'RENDER'}));reader.readAsDataURL(blob);});
    const checkSvg=text=>{
      if(text.length>MAX_XML)fail('LIMIT');const xml=parseXml(text);
      if(xml.documentElement.localName!=='svg'||xml.querySelectorAll('*').length>MAX_NODES)fail('UNSUPPORTED');
      for(const element of [xml.documentElement,...xml.querySelectorAll('*')]){
        if(['script','foreignObject','iframe','object','embed','animate','set','animateTransform'].includes(element.localName))fail('UNSUPPORTED');
        for(const attr of element.attributes){
          if(/^on/i.test(attr.name)||/href$/i.test(attr.localName)&&!/^#[A-Za-z_][\w:.-]*$/.test(attr.value)||/url\(/i.test(attr.value.replace(/url\(\s*["']?#[A-Za-z_][\w:.-]*["']?\s*\)/gi,'')))fail('UNSUPPORTED');
        }
        if(element.localName==='style'&&/@import|url\(/i.test(element.textContent||''))fail('UNSUPPORTED');
      }
    };
    const resource=async(url,kind='image')=>{
      if(typeof url!=='string'||!url||url.length>MAX_SERIALIZED)fail('UNSUPPORTED');
      const cacheKey=kind+':'+url;if(resources.has(cacheKey))return resources.get(cacheKey);
      let data,mime,bytes,svgText=null;
      if(url.startsWith('blob:')){
        const blob=urls.get(url);if(!(blob instanceof Blob))fail('UNSUPPORTED');if(blob.size>MAX_RESOURCE||blob.size<1)fail('LIMIT');
        bytes=blob.size;mime=blob.type.toLowerCase();if(mime==='image/svg+xml')svgText=await blob.text();
        if(kind==='image'&&!/^image\/(?:png|jpeg|gif|webp|bmp|svg\+xml)$/.test(mime))fail('UNSUPPORTED');
        if(resourceBytes+bytes>MAX_RESOURCES)fail('LIMIT');data=await readBlob(blob);
      }else{
        const match=/^data:(image\/(?:png|jpeg|gif|webp|bmp|svg\+xml));(base64),([A-Za-z0-9+/]+={0,2})$/.exec(url);
        if(!match||match[3].length%4)fail('UNSUPPORTED');mime=match[1];bytes=match[3].length*3/4;
        if(bytes>MAX_RESOURCE||resourceBytes+bytes>MAX_RESOURCES)fail('LIMIT');
        let raw;try{raw=atob(match[3]);}catch{fail('UNSUPPORTED');}
        if(mime==='image/svg+xml')svgText=textDecoder.decode(Uint8Array.from(raw,c=>c.charCodeAt(0)));
        data=url;
      }
      if(svgText!==null)checkSvg(svgText);
      resourceBytes+=bytes;
      if(kind==='image'){
        if(pictureProbes.length>=128)fail('LIMIT');
        const image=new Image(),probe=document.createElement('canvas');image.src=data;
        try{
          await image.decode();const pixels=image.naturalWidth*image.naturalHeight;
          if(!image.complete||!image.naturalWidth||!image.naturalHeight)fail('RENDER');
          if(image.naturalWidth>8192||image.naturalHeight>8192||pixels>16*MiB||(decodedPixels+=pixels)>64*MiB)fail('LIMIT');
          probe.width=probe.height=16;const context=probe.getContext('2d',{willReadFrequently:true});
          let chosen=null;
          for(const background of [0,255]){
            context.fillStyle=background?'#fff':'#000';context.fillRect(0,0,16,16);context.drawImage(image,0,0,16,16);
            const expected=context.getImageData(0,0,16,16).data;let difference=0;
            for(let offset=0;offset<expected.length;offset+=4)for(let channel=0;channel<3;channel++)difference+=Math.abs(expected[offset+channel]-background);
            if(!chosen||difference>chosen.difference)chosen={data,expected,background,difference};
          }
          // A fixed-color backing would mistake a matching solid-color image
          // for a still-empty slot. Pick the higher-contrast backing per image.
          pictureProbes.push(chosen);
        }finally{probe.width=probe.height=1;image.removeAttribute('src');}
      }
      resources.set(cacheKey,data);return data;
    };
    const localRef=value=>{
      const text=value.startsWith('#')?value:value.startsWith(location.href.split('#')[0]+'#')?value.slice(location.href.split('#')[0].length):null;
      if(!text||!ids.has(text.slice(1))||!/^#[A-Za-z_][\w:.-]*$/.test(text))fail('UNSUPPORTED');return text;
    };
    const inlineCss=async value=>{
      if(/@import|expression\(|-moz-binding|image-set\(/i.test(value))fail('UNSUPPORTED');
      const matches=[...value.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]*))\s*\)/gi)];
      if(matches.length>32)fail('LIMIT');let result='',cursor=0;
      for(const match of matches){const url=match[1]??match[2]??match[3];if(/\\|[\u0000-\u001f]/.test(url))fail('UNSUPPORTED');
        // Every CSS URL must be a checked fragment, not merely the first URL
        // in a multi-layer value. Image bytes belong only in native SVG href.
        const replacement=localRef(url);
        result+=value.slice(cursor,match.index)+'url("'+replacement+'")';cursor=match.index+match[0].length;
      }
      result+=value.slice(cursor);if(/url\(/i.test(value)&&!matches.length)fail('UNSUPPORTED');return result;
    };
    const clone=async(node,depth=0)=>{
      if(++nodeCount>MAX_NODES||depth>100)fail('LIMIT');
      if(node.nodeType===Node.TEXT_NODE)return document.createTextNode(charge(node.textContent||''));
      if(node.nodeType!==Node.ELEMENT_NODE)return null;
      const tag=node.localName;
      if(![XHTML,SVG].includes(node.namespaceURI)||['script','iframe','object','embed','link','meta','base','style','video','audio','source','track','input','textarea','select','button','foreignObject','animate','animateTransform','set'].includes(tag))fail('UNSUPPORTED');
      const computed=getComputedStyle(node);
      for(const pseudo of ['::before','::after']){const content=getComputedStyle(node,pseudo).content;if(content&&!['none','normal','""'].includes(content))fail('UNSUPPORTED');}
      let copy;
      if(tag==='canvas'||tag==='img'){
        if(tag==='canvas'&&(node.width*node.height>16*MiB||node.width<1||node.height<1))fail('LIMIT');
        // foreignObject HTML images may paint AFTER the outer SVG's decode,
        // independently even for identical data URLs. Native SVG image nodes
        // participate in the SVG image-resource lifecycle instead. Preserve
        // their exact local CSS content box; the existing parent transforms,
        // clipping, opacity and borders remain on this outer replacement.
        if(computed.objectFit!=='fill'||computed.objectPosition!=='50% 50%')fail('UNSUPPORTED');
        const width=Number.parseFloat(computed.width),height=Number.parseFloat(computed.height);
        if(!/^\d+(?:\.\d+)?px$/.test(computed.width)||!/^\d+(?:\.\d+)?px$/.test(computed.height)||width<=0||height<=0||width>16384||height>16384)fail('UNSUPPORTED');
        copy=document.createElementNS(SVG,'svg');if(node.id)copy.setAttribute('id',node.id);copy.setAttribute('width',String(width));copy.setAttribute('height',String(height));
        const image=document.createElementNS(SVG,'image');image.setAttribute('width',String(width));image.setAttribute('height',String(height));image.setAttribute('preserveAspectRatio','none');
        image.setAttribute('href',charge(await resource(tag==='canvas'?node.toDataURL('image/png'):node.currentSrc||node.getAttribute('src')||'')));copy.appendChild(image);
      }else{
        copy=node.cloneNode(false);
        for(const attr of [...copy.attributes]){
          if(/^on/i.test(attr.name))fail('UNSUPPORTED');
          if(['style','class','src','srcset','sizes','href','xlink:href'].includes(attr.name))copy.removeAttribute(attr.name);
          else if(/url\(/i.test(attr.value))copy.setAttribute(attr.name,charge(await inlineCss(attr.value)));
          else charge(attr.value);
        }
        if(node.namespaceURI===SVG&&['image','use'].includes(tag)){
          const href=node.getAttribute('href')||node.getAttributeNS('http://www.w3.org/1999/xlink','href')||'';
          copy.setAttribute('href',charge(tag==='use'?localRef(href):await resource(href)));
        }
      }
      for(const property of computed){
        const original=computed.getPropertyValue(property);
        // CSS image resources use the same late foreignObject paint path as
        // HTML img. Until explicitly mapped to SVG, do not silently omit them.
        if(/url\(/i.test(original)&&!/^url\(\s*["']?(?:#|about:srcdoc#)/i.test(original))fail('UNSUPPORTED');
        const value=await inlineCss(original);if(value)copy.style.setProperty(property,charge(value),computed.getPropertyPriority(property));
      }
      if(tag!=='canvas'&&tag!=='img')for(const child of node.childNodes){const item=await clone(child,depth+1);if(item)copy.appendChild(item);}
      return copy;
    };
    const copy=await clone(source);if(closed)fail('RENDER');
    copy.style.setProperty('margin','0');copy.style.setProperty('width','1000px');copy.style.setProperty('height',height+'px');
    const probeColumns=62,probeHeight=pictureProbes.length?Math.ceil(pictureProbes.length/probeColumns)*16:0,renderHeight=height+probeHeight;
    const root=document.createElementNS(SVG,'svg');root.setAttribute('xmlns',SVG);root.setAttribute('width','1000');root.setAttribute('height',String(renderHeight));
    const fonts=document.createElementNS(SVG,'style');let fontCss='';
    if(document.fonts.size>8)fail('LIMIT');
    for(const face of document.fonts){
      const blob=fontSources.get(face);if(!blob||face.status!=='loaded'||blob.size>MAX_RESOURCE||resourceBytes+blob.size>MAX_RESOURCES)fail('LIMIT');
      resourceBytes+=blob.size;const data=await readBlob(blob);const css=document.createElement('span').style;
      for(const [property,value]of [['font-family',face.family],['font-weight',face.weight],['font-style',face.style],['font-stretch',face.stretch],['unicode-range',face.unicodeRange]])css.setProperty(property,value);
      fontCss+=charge('@font-face{'+css.cssText+'src:url("'+data+'");}');
    }
    fonts.textContent=fontCss;root.appendChild(fonts);
    const foreign=document.createElementNS(SVG,'foreignObject');foreign.setAttribute('width','1000');foreign.setAttribute('height',String(height));foreign.appendChild(copy);root.appendChild(foreign);
    // Additional bounded resource-readiness check, NOT proof that another
    // foreignObject HTML image instance painted. Native SVG image replacements
    // above are essential; same-URL HTML copies alone did not fix WebKit. The
    // probe strip stays outside the returned slide and is never persisted.
    // A time limit is a failure, never permission to return a partial slide.
    if(probeHeight){
      const probeForeign=document.createElementNS(SVG,'foreignObject');probeForeign.setAttribute('y',String(height));probeForeign.setAttribute('width','1000');probeForeign.setAttribute('height',String(probeHeight));
      const strip=document.createElement('div');strip.style.cssText='position:relative;width:1000px;height:'+probeHeight+'px;';
      pictureProbes.forEach((probe,index)=>{const box=document.createElement('div'),image=document.createElement('img');box.style.cssText='position:absolute;width:16px;height:16px;left:'+(index%probeColumns*16)+'px;top:'+Math.floor(index/probeColumns)*16+'px;background:'+(probe.background?'#fff':'#000')+';';image.setAttribute('src',probe.data);image.style.cssText='display:block;margin:0;padding:0;border:0;width:16px;height:16px;';box.appendChild(image);strip.appendChild(box);});
      probeForeign.appendChild(strip);root.appendChild(probeForeign);
    }
    const text=new XMLSerializer().serializeToString(root);if(text.length>MAX_SERIALIZED)fail('LIMIT');
    const image=new Image();image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(text);
    const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=renderHeight;
    try{
      await image.decode();if(closed||blocked||nodeErrors||image.naturalWidth!==1000||image.naturalHeight!==renderHeight)fail('RENDER');
      const context=canvas.getContext('2d',{willReadFrequently:true}),deadline=performance.now()+3000;
      const paint=()=>{context.fillStyle='#fff';context.fillRect(0,0,1000,renderHeight);context.drawImage(image,0,0);};
      while(true){
        paint();let ready=true;
        for(let index=0;index<pictureProbes.length;index++){
          const expected=pictureProbes[index].expected,actual=context.getImageData(index%probeColumns*16,height+Math.floor(index/probeColumns)*16,16,16).data;
          let error=0,expectedDifference=0,actualDifference=0;
          for(let offset=0;offset<actual.length;offset+=4)for(let channel=0;channel<3;channel++){
            const background=pictureProbes[index].background;error+=Math.abs(expected[offset+channel]-actual[offset+channel]);expectedDifference+=Math.abs(expected[offset+channel]-background);actualDifference+=Math.abs(actual[offset+channel]-background);
          }
          if(error/(16*16*3)>18||actualDifference<expectedDifference*.8){ready=false;break;}
        }
        if(ready)break;
        if(closed||blocked||nodeErrors)fail('RENDER');if(performance.now()>=deadline)fail('TIMEOUT');
        await new Promise(resolve=>setTimeout(resolve,25));
      }
      // Copy only the real slide. Canvas resize clears the transient probe row.
      if(probeHeight){const cropped=context.getImageData(0,0,1000,height);canvas.height=height;context.putImageData(cropped,0,0);}
      let output=canvas.toDataURL('image/png');
      if(output.length>512*1024){const jpeg=canvas.toDataURL('image/jpeg',.88);if(jpeg.length<output.length*.8)output=jpeg;}
      if(output.length>MAX_IMAGE)fail('LIMIT');
      return {index,width:1000,height,image:output,warnings:slide.warnings};
    }finally{canvas.width=canvas.height=1;image.removeAttribute('src');}
  }
  async function command(event){
    if(closed)return;const data=event.data;
    if(busy||!keys(data,['v','id','command','bytes','index'])||data.v!==1||!Number.isSafeInteger(data.id)||data.id<=lastId||data.id>0x7fffffff||!['load','show','snapshot'].includes(data.command)){shutdown();return;}
    if(data.command==='load'?!keys(data,['v','id','command','bytes'])||!(data.bytes instanceof ArrayBuffer):!keys(data,['v','id','command','index'])||!Number.isSafeInteger(data.index)){shutdown();return;}
    lastId=data.id;busy=true;
    try{const value=await (data.command==='load'?load(data.bytes):data.command==='snapshot'?snapshot(data.index):show(data.index));if(!closed)port.postMessage({v:1,id:data.id,ok:true,value});}
    catch(cause){const code=CODES.has(cause?.code)?cause.code:/limit|bytes|size/i.test(cause?.message||'')?'LIMIT':data.command==='load'?'UNSUPPORTED':'RENDER';clear();if(!closed)port.postMessage({v:1,id:data.id,ok:false,code});}
    finally{busy=false;}
  }
  function connect(event){
    if(port||closed||event.source!==parent||event.ports.length!==1||!keys(event.data,['type','token'])||event.data.type!=='bilge-pptx-connect'||event.data.token!==token)return;
    window.removeEventListener('message',connect);port=event.ports[0];port.onmessage=command;port.onmessageerror=shutdown;port.start();port.postMessage({v:1,id:0,type:'connected'});
  }
  window.addEventListener('message',connect);
  parent.postMessage({type:'bilge-pptx-ready',token},'*');
})();
