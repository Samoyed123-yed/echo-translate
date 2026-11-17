'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{test}=require('node:test');
const source=fs.readFileSync(require('node:path').join(__dirname,'../public/app.js'),'utf8');
function context(){
  const ctx={state:{rows:[],paras:[],pendingJob:true},els:{interval:{value:'10'}},Date,selectedEngine:()=> 'heuristic', $:()=>({checked:false})};
  ctx.paraRows=p=>p.rows.map(id=>ctx.state.rows.find(r=>r.id===id));
  ctx.paraEnglish=p=>ctx.paraRows(p).map(r=>r.en).join(' ');
  vm.createContext(ctx);
  vm.runInContext(source.slice(source.indexOf('function analysisBatch(){'),source.indexOf('async function doInsights(){')),ctx);
  vm.runInContext(source.slice(source.indexOf('const BOOST_GAIN='),source.indexOf('function chromeMajor()')),ctx);
  return ctx;
}
function populate(c,count){for(let i=0;i<count;i++){
  const r={id:'r'+i,en:'Sentence '+i,final:true,reviewed:false};c.state.rows.push(r);
  if(i%6===0)c.state.paras.push({id:'p'+i,rows:[]});c.state.paras.at(-1).rows.push(r.id);
}}
test('backlog older than 30 rows is processed completely even after speech stops',()=>{
  const c=context();populate(c,180);let rounds=0,seen=new Set();
  while(true){const batch=c.analysisBatch();if(!batch.paraNeed.length)break;
    assert.ok(batch.source.length<=32);assert.ok(batch.source.some(r=>r.id==='r179'));
    for(const p of batch.paraNeed){for(const r of c.paraRows(p)){assert.ok(batch.source.includes(r));r.reviewed=true;seen.add(r.id)}p.reviewedFor=c.paraEnglish(p)}
    assert.ok(++rounds<20);
  }assert.equal(seen.size,180);assert.equal(rounds,8);
});
test('failed or omitted paragraphs remain eligible without starving other paragraphs',()=>{
  const c=context();populate(c,60);const first=c.analysisBatch().paraNeed;
  first.forEach(p=>p.lastReviewAttempt=100);
  const second=c.analysisBatch().paraNeed;assert.ok(second.every(p=>!first.includes(p)));
  c.state.paras.filter(p=>!first.includes(p)).forEach(p=>{p.reviewedFor=c.paraEnglish(p);c.paraRows(p).forEach(r=>r.reviewed=true)});
  assert.deepEqual(c.analysisBatch().paraNeed.map(p=>p.id),first.map(p=>p.id));
});
test('changed paragraphs are queued again, interim paragraphs wait for final speech',()=>{
  const c=context();populate(c,12);for(const p of c.state.paras){p.reviewedFor=c.paraEnglish(p);c.paraRows(p).forEach(r=>r.reviewed=true)}
  assert.equal(c.analysisBatch().paraNeed.length,0);
  c.state.rows[0].en='Changed';assert.equal(c.analysisBatch().paraNeed.length,1);
  c.state.rows[0].final=false;assert.equal(c.analysisBatch().paraNeed.length,0);
});
test('next interval begins at completion rather than request start',()=>{
  const c=context(),now=Date.now();c.finishInsightRound();assert.equal(c.state.pendingJob,false);
  assert.ok(c.state.nextInsightAt>=now+10000);assert.equal(c.state.nextInsightAt,c.state.insightNotBefore);
});
test('adaptive gain is bounded, does not chase silence, and attenuates loud peaks',()=>{
  const c=context();assert.equal(c.adaptiveMicGain(0,0,'normal'),2.2);
  assert.equal(c.adaptiveMicGain(.005,.02,'normal'),5);
  assert.equal(c.adaptiveMicGain(.005,.02,'strong'),8);
  assert.equal(c.adaptiveMicGain(.4,.95,'strong'),1);
  for(const level of ['normal','strong'])for(const rms of [.001,.01,.03,.1,.5])assert.ok(Number.isFinite(c.adaptiveMicGain(rms,rms*2,level)));
});
function persistenceContext(storage={},disk=new Map()){
  const listeners={};
  const localStorage=storage;
  if(!localStorage.getItem)Object.defineProperties(localStorage,{
    getItem:{value:k=>localStorage[k]??null},setItem:{value:(k,v)=>{localStorage[k]=v}},removeItem:{value:k=>{delete localStorage[k]}}
  });
  const c={state:{rows:[{id:'r1',en:'Original lecture',raw:'Original lecture',final:true}],paras:[],transcriptArchive:[],parasArchive:[],notes:[],notesArchive:[],qa:[],qaArchive:[]},
    els:{subject:{value:'Test'},domain:{value:'general'},language:{value:'en-US'}},localStorage,Date,JSON,
    newSessionId:()=> 'test-session-123',toast:()=>{},timeNow:()=>'', $:()=>null,
    setInterval:()=>{},window:{addEventListener:(k,f)=>listeners[k]=f},document:{addEventListener:()=>{}},
    fetch:async(url,opt)=>{const id=url.split('/').at(-1);if(opt){disk.set(id,JSON.parse(opt.body));return {ok:true,json:async()=>({})}}
      return {ok:disk.has(id),status:disk.has(id)?200:404,json:async()=>disk.get(id)}},
  };
  vm.createContext(c);
  vm.runInContext(source.slice(source.indexOf("const DRAFT_PREFIX="),source.indexOf('function restoreSession(data){')),c);
  return {c,listeners,disk,storage};
}
test('refresh before first network save restores draft to server',async()=>{
  const {c,listeners,storage,disk}=persistenceContext();c.markDirty();listeners.pagehide();
  const refreshed=persistenceContext(storage,disk);await refreshed.c.recoverSessionDrafts();
  assert.equal(disk.get('test-session-123').transcript[0].en,'Original lecture');
  assert.equal(Object.keys(storage).length,0);
});
test('refresh during an in-flight save preserves new speech in its recovery draft',async()=>{
  const {c,storage,listeners}=persistenceContext();let complete;
  c.fetch=()=>new Promise(resolve=>complete=resolve);c.markDirty();const saving=c.saveSession();
  c.state.rows.push({id:'r2',en:'New speech'});c.markDirty();listeners.pagehide();complete({ok:true});await saving;
  assert.equal(JSON.parse(storage['ct-record-draft:test-session-123']).transcript.length,2);
  assert.equal(c.state.dirty,true);
});
test('clearing the visible transcript still saves the archived transcript',async()=>{
  const {c,disk}=persistenceContext();c.state.transcriptArchive=c.state.rows;c.state.rows=[];
  c.markDirty();await c.saveSession();assert.equal(disk.get('test-session-123').transcriptArchive.length,1);
});
test('failed disk save retains local recovery copy',async()=>{
  const {c,storage}=persistenceContext();c.fetch=async()=>({ok:false,status:503,json:async()=>({})});
  c.markDirty();await c.saveSession();assert.equal(c.state.dirty,true);assert.ok(storage['ct-record-draft:test-session-123']);
});
