'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {requests}=require('./audit.cjs'),{buildPayload,parseReply}=require('./run-models.cjs');
const entry=requests().cases[0],model='qwen2.5:7b';
function good(){return {model,done:true,done_reason:'stop',content:JSON.stringify({segments:[{id:'p1',text:'Sentetik çeviri.'}]})};}
test('only two installed selected models allowed',()=>assert.throws(()=>buildPayload('deepseek-chat',entry)));
test('reject private or modified input instead of sending it',()=>assert.throws(()=>buildPayload(model,{...entry,user:'private note'})));
test('bounded deterministic generation without tools or paid fallback',()=>{const p=buildPayload(model,entry);assert.equal(p.options.num_predict,512);assert.equal(p.options.num_thread,4);assert.equal(p.stream,false);assert.equal(p.tools,undefined);assert.equal(p.messages.length,2);assert.equal(p.options.temperature,0.1);});
test('disable thinking only on the selected thinking-capable model',()=>{assert.equal(buildPayload('qwen3.5:9b',entry).think,false);assert.equal(buildPayload(model,entry).think,undefined);});
test('strict JSON output accepted',()=>assert.equal(parseReply(good(),entry,model)[0].id,'p1'));
test('truncated output cannot count as completed',()=>assert.throws(()=>parseReply({...good(),done_reason:'length'},entry,model)));
test('unexpected returned model rejected',()=>assert.throws(()=>parseReply({...good(),model:'other'},entry,model)));
test('tool requests rejected and never executed',()=>assert.throws(()=>parseReply({...good(),toolCallsPresent:true},entry,model)));
test('malformed nonempty JSON rejected',()=>assert.throws(()=>parseReply({...good(),content:'NOT_JSON'},entry,model)));
test('model error instead of translation rejected',()=>assert.throws(()=>parseReply({...good(),content:'{"error":"cannot translate"}'},entry,model)));
test('missing and duplicated segment ids rejected',()=>{for(const segments of [[],[{id:'bad',text:'x'}],[{id:'p1',text:'x'},{id:'p1',text:'y'}]])assert.throws(()=>parseReply({...good(),content:JSON.stringify({segments})},entry,model));});
