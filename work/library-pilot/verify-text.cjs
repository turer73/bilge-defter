'use strict';
const {chromium,webkit}=require('playwright'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const base='http://127.0.0.1:8766',out=path.resolve(__dirname,'../../outputs/library-text');fs.mkdirSync(out,{recursive:true});
(async()=>{const results=[];for(const [engine,name] of [[chromium,'chromium'],[webkit,'webkit']]){const browser=await engine.launch({headless:true});try{for(const width of [390,820]){
const c=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block'}),p=await c.newPage(),errors=[],external=[];
p.on('pageerror',e=>errors.push(e.message));await c.route('**/*',r=>{if(!r.request().url().startsWith(base+'/')){external.push(r.request().url());return r.abort();}return r.continue();});
await p.goto(base+'/#source=msu-neuroscience&page=14');await p.locator('#readText').waitFor();
assert.equal(await p.locator('#page').inputValue(),'14');const href=await p.locator('#readText').getAttribute('href');assert(href.endsWith('/read/msu-neuroscience/14?account=local'));
await p.goto(href);assert.equal(await p.locator('html').getAttribute('lang'),'en');assert((await p.locator('#sourceText').innerText()).length>100);
assert.equal(await p.locator('#sourceText').getAttribute('translate'),'yes');assert.equal(await p.locator('script').count(),1);assert.equal(await p.locator('script').getAttribute('src'),'../../quote.js?account=local');
assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
await p.screenshot({path:path.join(out,`text-${name}-${width}.png`)});results.push(name+' '+width+': actual extracted text, English language, only explicit transfer script, layout fits');
await p.getByRole('link',{name:'Sonraki sayfa →'}).click();assert(new URL(p.url()).pathname.endsWith('/15'));await p.getByRole('link',{name:'← Önceki sayfa'}).click();assert(new URL(p.url()).pathname.endsWith('/14'));
await p.getByRole('link',{name:'Özgün PDF görünümü',exact:true}).click();await p.locator('#pageImage').waitFor({state:'visible'});assert.equal(await p.locator('#page').inputValue(),'14');
assert.deepEqual(errors,[]);assert.deepEqual(external,[]);results.push(name+' '+width+': next/previous and exact PDF return, zero translation/network calls');await c.close();
}}finally{await browser.close();}}fs.writeFileSync(path.join(out,'browser-proof.json'),JSON.stringify({results,passed:results.length,actualBrowserTranslation:false,physicalIPad:false},null,2));console.log(JSON.stringify({passed:results.length,results}));})().catch(e=>{console.error(e);process.exit(1)});
