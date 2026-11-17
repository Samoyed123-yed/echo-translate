'use strict';
/* Echo Translate. No external JS libraries, advertising, telemetry, or audio output. */
const $ = id => document.getElementById(id);
const els = {
  mic: $('micBtn'), micLabel: $('micLabel'), status: $('microStatus'), dot: $('statusDot'),
  translatorStatus: $('translatorStatus'), footer: $('footerStatus'), bottomDot: $('bottomDot'),
  mode: $('analysisSelect'), domain: $('domainSelect'), interval: $('intervalSelect'),
  language: $('languageSelect'), subject: $('subjectInput'), glossary: $('glossaryInput'), boost: $('boostSelect'), effort: $('effortSelect'),
  reference: $('referenceText'), model: $('ollamaModelInput'),
};
const DEFAULT_TERMS = {
  management: {
    'project charter':'项目章程','project scope':'项目范围','scope creep':'范围蔓延',
    'critical path':'关键路径','work breakdown structure':'工作分解结构','WBS':'工作分解结构',
    'earned value management':'挣值管理','earned value':'挣值','stakeholder':'干系人',
    'risk register':'风险登记册','sprint':'冲刺迭代','product backlog':'产品待办列表',
    'Scrum Master':'Scrum Master（敏捷教练）','deliverable':'可交付成果',
    'milestone':'里程碑','resource allocation':'资源分配','agile':'敏捷',
    'acceptance criteria':'验收标准','scope baseline':'范围基准','contingency reserve':'应急储备',
  },
  finance: {
    'net present value':'净现值','NPV':'净现值','discount rate':'贴现率','leverage':'杠杆',
    'liquidity':'流动性','duration':'久期','yield to maturity':'到期收益率',
    'cash flow':'现金流','capital structure':'资本结构','equity':'股权／权益',
    'return on equity':'净资产收益率','gross margin':'毛利率','volatility':'波动率',
    'hedging':'对冲','market capitalization':'总市值','default risk':'违约风险',
  },
  quant: {
    'Sharpe ratio':'夏普比率','backtesting':'回测','overfitting':'过拟合',
    'slippage':'滑点','drawdown':'回撤','maximum drawdown':'最大回撤',
    'alpha':'阿尔法收益','beta':'贝塔系数','factor exposure':'因子暴露',
    'momentum':'动量','mean reversion':'均值回归','volatility':'波动率',
    'statistical arbitrage':'统计套利','look-ahead bias':'前视偏差',
    'out-of-sample':'样本外','conditional expectation':'条件期望',
  },
  math: {
    'derivative':'导数','partial derivative':'偏导数','integral':'积分',
    'convex':'凸的','concave':'凹的','Hessian':'海森矩阵',
    'Lagrangian':'拉格朗日函数','KKT conditions':'KKT条件',
    'Nash equilibrium':'纳什均衡','Pareto efficiency':'帕累托有效',
    'Slutsky equation':'斯勒茨基方程','Roy\'s identity':'罗伊恒等式',
    'budget constraint':'预算约束','indirect utility':'间接效用',
    'marginal rate of substitution':'边际替代率','elasticity':'弹性',
  },
  business: {'business model':'商业模式','competitive advantage':'竞争优势','supply chain':'供应链'},
  economics: {'opportunity cost':'机会成本','marginal cost':'边际成本','Nash equilibrium':'纳什均衡','elasticity':'弹性'},
  statistics: {'confidence interval':'置信区间','null hypothesis':'原假设','standard deviation':'标准差','regression':'回归'},
  cs: {'algorithm':'算法','data structure':'数据结构','time complexity':'时间复杂度','machine learning':'机器学习'},
  engineering: {'tolerance':'公差','stress':'应力','strain':'应变','feedback control':'反馈控制'},
  physics: {'momentum':'动量','angular velocity':'角速度','entropy':'熵','electric field':'电场'},
  biology: {'gene expression':'基因表达','cell membrane':'细胞膜','natural selection':'自然选择'},
  law: {'burden of proof':'举证责任','jurisdiction':'管辖权','precedent':'判例','liability':'法律责任'},
  design: {'typography':'字体排印','visual hierarchy':'视觉层级','affordance':'可供性','user experience':'用户体验'},
  general: {'hypothesis':'假设','trade-off':'权衡','empirical evidence':'经验证据','framework':'框架'},
};
const samplePairs = [
  // Demo lines include typical slips (repeat, near-word slip, misheard term) to show the cleanup.
  ['The the project charter formally authorizes the project and gives the project manager authority to apply organizational resources.', '项目章程正式批准项目，并赋予项目经理使用组织资源的权限。'],
  ['A risk is an uncertain event that may effect affect an objective. An issue is something that has already happened.', '风险是可能影响项目目标的不确定事件；问题则是已经发生的事情。'],
  ['When we discuss scope creep, we mean uncontrolled changes to project scope without proper review of time and cost impacts.', '讨论范围蔓延时，我们指的是未经适当评估时间和成本影响而对项目范围进行的失控变更。'],
  ['Consider a critical pass consisting of four activities. A delay on that path can delay the entire project unless there is available float.', '假设关键路径由四项活动组成。如果没有可用浮动时间，该路径上的延误可能导致整个项目延期。'],
  ['What is the difference between project risk and an issue, and how would you respond to each one?', '项目风险与已发生的问题有什么区别？对于两者，你会分别采取怎样的应对措施？'],
];
const state = {
  rows: [], rowMap: new Map(), rowDom: new Map(), notes: [], qa: [], seen: new Set(),
  paras: [], paraMap: new Map(), paraDom: new Map(), parasArchive: [],
  follow: {en:true, zh:true, notes:true, qa:true},
  running:false, recognition:null, translator:null, translatorPair:'', translatorPromise:null,
  translatorAvailable:false, translatorError:'', translatePending:new Set(), interimPending:null,
  translating:false, activeEpoch:0, restartTimer:null, startAt:null, seconds:0,
  browserStatus:null, pendingJob:false, nextInsightAt:0, lastAnalysisFingerprint:'',
  glossaryCustom:'', referenceText:'', referenceLabel:'', demoTimers:[], demoMode:false,
  lastTranslatedMs:null, lastError:'', latestErrorAt:0, toastTimer:null, busyReference:false,
  notesArchive:[], qaArchive:[], transcriptArchive:[], idSeq:0, corrections:0, translateRetryAt:0,
  // Records: every session is saved to disk by the local server and never deleted automatically.
  sessionId:null, sessionStarted:null, dirty:false, saving:false, lastSavedAt:0,
  idBase:Date.now().toString(36).slice(-5),  // keeps segment ids unique across page reloads
};
const panelInfo = {
  en: {scroll:$('enScroll'),feed:$('enFeed'), empty:'enEmpty'},
  zh: {scroll:$('zhScroll'),feed:$('zhFeed'), empty:'zhEmpty'},
  notes: {scroll:$('notesScroll'),feed:$('notesFeed'),empty:'notesEmpty'},
  qa: {scroll:$('qaScroll'),feed:$('qaFeed'),empty:'qaEmpty'},
};
const safeText = value => String(value ?? '').replace(/\s+/g,' ').trim();
const truncate = (v,max) => String(v ?? '').slice(0,max);
const timeNow = () => new Date().toLocaleTimeString('en-US',{hour12:false});
const elapsed = ms => {let s=Math.floor(ms/1000);return `${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor(s/60)%60).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`};

function toast(message, error=false) {
  const el=$('toast'); el.textContent=message;el.classList.toggle('error',error);el.hidden=false;
  clearTimeout(state.toastTimer);state.toastTimer=setTimeout(()=>{el.hidden=true},6200);
}
function setFooter(message, active=false) {
  els.footer.textContent=message;$('bottomDot').classList.toggle('active',active);
}
function setMicState(active, text='') {
  state.running=active;
  els.status.textContent=text||(active?'LISTENING':'MICROPHONE OFF');
  els.dot.classList.toggle('active',active);els.mic.classList.toggle('running',active);
  els.micLabel.textContent=active?'停止收音':'启动麦克风';$('micIcon').textContent=active?'■':'●';
  setFooter(active?'正在识别讲课声音 · 全程静音':(text||'麦克风未启动'),active);
}
function panelAutoScroll(id, force=false){
  const p=panelInfo[id];if(!p)return;
  if(!force && !state.follow[id])return;
  requestAnimationFrame(()=>{p.scroll.scrollTop=p.scroll.scrollHeight});
}
function followButtonUpdate(id){
  const el=document.querySelector(`[data-follow="${id}"]`);
  el?.classList.toggle('unfollow',!state.follow[id]);
  if(el){el.textContent='↓ 最新';el.hidden=state.follow[id];}
}
Object.keys(panelInfo).forEach(id=>{
  const p=panelInfo[id];
  p.scroll.addEventListener('scroll',()=>{
    const nearEnd=p.scroll.scrollHeight-p.scroll.scrollTop-p.scroll.clientHeight < 24;
    if(nearEnd!==state.follow[id]){state.follow[id]=nearEnd;followButtonUpdate(id)}
  },{passive:true});
});
document.querySelectorAll('[data-follow]').forEach(btn=>btn.addEventListener('click',()=>{
  const id=btn.dataset.follow;state.follow[id]=true;followButtonUpdate(id);panelAutoScroll(id,true);
}));
function hideEmpty(kind){const el=$(panelInfo[kind].empty);if(el)el.remove()}
let glossaryCache={key:'',list:[]};
function buildGlossary(){
  const key=els.domain.value+'\n'+els.glossary.value;
  if(glossaryCache.key===key)return glossaryCache.list;
  const combined={...DEFAULT_TERMS[els.domain.value]};
  for(const line of els.glossary.value.split(/\r?\n/)){
    const match=line.match(/^\s*([^=：:]{2,90})\s*[=:：]\s*(.+?)\s*$/);
    if(match)combined[match[1].trim()]=match[2].trim();
  }
  const list=Object.entries(combined).sort((a,b)=>b[0].length-a[0].length);
  glossaryCache={key,list};return list;
}

/* ---------- Instant speech cleanup (runs before translation, so both panels stay in sync) ----------
   Conservative rules only; context-dependent slips are left to the Codex/Ollama correction pass. */
const COMMON_WORDS=new Set(('a an the and or but if so as at by for from in into onto of off on out over to up with without '+
  'is are was were be been being am do does did done have has had having will would shall should can could may might must '+
  'i you he she it we they me him her us them my your his its our their this that these those there here where when what which who whom whose why how '+
  'than then them they also just only very more most much many some same such each both all any few other another into '+
  'one two three four five six seven eight nine ten first last next well like line time form from were wear where whether weather '+
  'not no yes now new know knew see seen say said make made take took get got give gave go went come came use used need needs want '+
  'think thought mean means way ways part parts case cases point points kind kinds work works look looks call called set sets').split(' '));
const KEEP_REPEAT=new Set(['that','had','is','very','really','so','no','bye','ha']);
const normWord=w=>w.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}'’-]+$/gu,'').replace(/[’]/g,"'");
const endsClause=w=>/[.?!;:,]$/.test(w);
function lev(a,b,limit=4){
  if(Math.abs(a.length-b.length)>limit)return limit+1;
  let prev=Array.from({length:b.length+1},(_,j)=>j);
  for(let i=1;i<=a.length;i++){
    const cur=[i];let best=i;
    for(let j=1;j<=b.length;j++){cur[j]=Math.min(prev[j]+1,cur[j-1]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));best=Math.min(best,cur[j])}
    if(best>limit)return limit+1;prev=cur;
  }
  return prev[b.length];
}
const isInflection=(a,b)=>{const [s,l]=a.length<=b.length?[a,b]:[b,a];return l.startsWith(s)&&/^(s|es|d|ed|ing|er|ers|ly|'s|n't)$/.test(l.slice(s.length))};
function fixTerms(tokens,fixes){
  for(const [term] of buildGlossary()){
    const tw=term.split(/\s+/);const target=term.toLowerCase();
    if(/^[A-Z0-9]{2,6}$/.test(term))continue;               // acronyms: too short to fuzz safely
    if(tw.length===1&&term.length<8)continue;                // short single words: too many legit neighbours
    const limit=tw.length===1?1:Math.min(3,Math.max(1,Math.floor(target.length*0.18)));
    for(let i=0;i+tw.length<=tokens.length;i++){
      const win=tokens.slice(i,i+tw.length);
      if(win.slice(0,-1).some(endsClause))continue;
      const words=win.map(normWord);
      const got=words.join(' ');
      if(got===target||isInflection(got,target))continue;
      if(words.some((w,k)=>!w||w[0]!==tw[k][0].toLowerCase()))continue;
      if(lev(got,target,limit)>limit)continue;
      const tail=(win.at(-1).match(/[^\p{L}\p{N}]+$/u)||[''])[0];
      let repl=tw.slice();if(/^\p{Lu}/u.test(win[0])&&!/^\p{Lu}/u.test(repl[0]))repl[0]=repl[0][0].toUpperCase()+repl[0].slice(1);
      repl[repl.length-1]+=tail;
      fixes.push({from:win.join(' '),to:repl.join(' '),by:'term'});
      tokens.splice(i,tw.length,...repl);
    }
  }
}
function cleanSpeech(raw){
  const fixes=[];
  let text=raw.replace(/\b(?:u+h+m*|u+m+|e+r+m+|h+m+|m{2,})\b[,.]?\s*/gi,()=>{fixes.push({by:'filler'});return ''});
  let t=text.split(/\s+/).filter(Boolean);
  // 1) Repeated words / phrases: "the the", "we need to we need to" -> keep one copy.
  for(let n=4;n>=1;n--){
    for(let i=0;i+2*n<=t.length;i++){
      const a=t.slice(i,i+n),b=t.slice(i+n,i+2*n);
      if(endsClause(a.at(-1))&&!/,$/.test(a.at(-1)))continue;
      const na=a.map(normWord),nb=b.map(normWord);
      if(!na.every(Boolean)||na.join(' ')!==nb.join(' '))continue;
      if(n===1&&(KEEP_REPEAT.has(na[0])||/^\d/.test(na[0])))continue;
      if(/^\p{Lu}/u.test(a[0])&&!/^\p{Lu}/u.test(b[0]))t[i+n]=b[0][0].toUpperCase()+b[0].slice(1);
      fixes.push({from:a.join(' '),to:'',by:'repeat'});t.splice(i,n);i=Math.max(-1,i-2);
    }
  }
  // 2) Cut-off fragment or near-identical slip immediately replaced: "proj project", "affect effect".
  for(let i=0;i+1<t.length;i++){
    const a=normWord(t[i]),b=normWord(t[i+1]);if(!a||!b||a===b)continue;
    if(endsClause(t[i])&&!/-$/.test(t[i]))continue;
    const fragment=(/-$/.test(t[i])&&b.startsWith(a.replace(/-$/,''))&&a.length>1)||
      (a.length>=3&&b.length-a.length>=2&&b.startsWith(a)&&!COMMON_WORDS.has(a));
    const nearSlip=a.length>=4&&b.length>=4&&!COMMON_WORDS.has(a)&&!COMMON_WORDS.has(b)&&!isInflection(a,b)&&
      lev(a,b,2)<=(Math.max(a.length,b.length)>=7?2:1);
    if(fragment||nearSlip){
      if(/^\p{Lu}/u.test(t[i])&&!/^\p{Lu}/u.test(t[i+1]))t[i+1]=t[i+1][0].toUpperCase()+t[i+1].slice(1);
      fixes.push({from:t[i],to:'',by:fragment?'fragment':'slip'});t.splice(i,1);i--;
    }
  }
  // 3) Misheard technical terms close to the course glossary: "critical pass" -> "critical path".
  fixTerms(t,fixes);
  return {text:t.join(' '),fixes};
}
function glossaryHits(english){
  const en=String(english||'').toLowerCase();let found=[];
  for(const [term,zh] of buildGlossary()){
    if(en.includes(term.toLowerCase()) && !found.some(x=>x[0].toLowerCase()===term.toLowerCase()))found.push([term,zh]);
    if(found.length>=5)break;
  }
  return found;
}
/* ---------- Paragraphs ----------
   Chrome's recognizer cuts continuous speech at every pause (and often adds a period there), so one spoken sentence
   can arrive as several fragments. English is shown as a flowing passage of those fragments; Chinese is translated a
   whole paragraph at a time, so sentences that span fragments come out as complete Chinese sentences. */
const PARA_MAX_ROWS=6,PARA_MAX_CHARS=520;
function getRow(id){return state.rowMap.get(id)}
function getPara(id){return state.paraMap.get(id)}
function paraOf(row){return state.paraMap.get(row.para)}
function paraRows(p){return p.rows.map(id=>state.rowMap.get(id)).filter(Boolean)}
function paraEnglish(p){
  const useInterim=$('useInterim').checked;
  return paraRows(p).filter(r=>r.en&&(r.final||useInterim)).map(r=>r.en).join(' ');
}
// Only the confirmed (final) fragments: the paragraph's full, coherent translation is made from these.
function paraFinalEnglish(p){return paraRows(p).filter(r=>r.en&&r.final).map(r=>r.en).join(' ')}
/* The part of the paragraph on screen that the full translation does not cover yet — usually the sentence being
   spoken right now. It is translated on its own (short, so fast) and shown at once, then folded into the full
   paragraph translation when the recognizer confirms it. */
function liveTail(p){
  const shown=paraEnglish(p);
  if(!p.zhFor)return shown;
  return shown.startsWith(p.zhFor)?shown.slice(p.zhFor.length).trim():'';
}
/* A paragraph only ends where a sentence ends — never at a pause in the middle of a sentence, so neither the
   English nor the Chinese is cut mid-sentence. (Hard caps stop a paragraph growing forever if punctuation is lost.) */
const PARA_HARD_ROWS=12,PARA_HARD_CHARS=1000;
function endsSentence(row){
  if(!row||!row.final||!row.en)return !row?.en;
  const m=row.en.match(/([A-Za-z']+)?([.?!…])["')\]]?$/);
  return !!m&&!(m[1]&&DANGLING.has(m[1].toLowerCase()));
}
function assignPara(row){
  let p=state.paras.at(-1);
  const rows=p?paraRows(p):[],chars=rows.reduce((n,r)=>n+r.en.length,0);
  const full=p&&(p.rows.length>=PARA_MAX_ROWS||chars>=PARA_MAX_CHARS);
  const hardFull=p&&(p.rows.length>=PARA_HARD_ROWS||chars>=PARA_HARD_CHARS);
  if(!p||hardFull||(full&&endsSentence(rows.filter(r=>r.en).at(-1)))){
    p={id:'p'+row.id,rows:[],zh:'',zhFor:'',zhBy:'',time:row.time};state.paras.push(p);state.paraMap.set(p.id,p);
  }
  p.rows.push(row.id);row.para=p.id;return p;
}
/* After corrections remove a false sentence break at the end of a paragraph, pull the rest of that sentence back
   from the next paragraph, so the sentence (and its Chinese) is whole again. Both paragraphs are re-translated
   right away. */
function reflowParagraphs(){
  const start=Math.max(0,state.paras.length-10);
  for(let i=start;i<state.paras.length-1;i++){
    const p=state.paras[i],next=state.paras[i+1];let moved=false;
    while(next.rows.length&&p.rows.length<PARA_HARD_ROWS&&!endsSentence(paraRows(p).filter(r=>r.en).at(-1))){
      const rid=next.rows.shift(),row=getRow(rid);if(!row)continue;
      p.rows.push(rid);row.para=p.id;moved=true;
      const span=state.rowDom.get(rid),d=state.paraDom.get(p.id);if(span&&d)d.en.append(span);
    }
    if(!moved)continue;
    if(!next.rows.length){
      const nd=state.paraDom.get(next.id);if(nd){nd.en.remove();nd.zh.remove();state.paraDom.delete(next.id)}
      state.paras.splice(i+1,1);state.paraMap.delete(next.id);
    }else{renderParaZh(next);queueParaTranslation(next,true,true)}
    renderParaZh(p);queueParaTranslation(p,true,true);markDirty();
  }
}
function paraDom(p){
  let d=state.paraDom.get(p.id);
  if(!d){
    hideEmpty('en');hideEmpty('zh');
    const en=document.createElement('p');en.className='passage';en.dataset.para=p.id;
    const zh=document.createElement('p');zh.className='passage';zh.dataset.para=p.id;
    const zhMain=document.createElement('span'),zhLive=document.createElement('span');zhLive.className='zh-live';
    zh.append(zhMain,zhLive);
    panelInfo.en.feed.append(en);panelInfo.zh.feed.append(zh);
    d={en,zh,zhMain,zhLive};state.paraDom.set(p.id,d);trimRendered();
  }
  return d;
}
function trimRendered(){
  // Bound only rendered content; every record is kept for the class record and export.
  while(state.paraDom.size>90){
    const [id,d]=state.paraDom.entries().next().value;
    for(const kind of ['en','zh']){
      const p=panelInfo[kind],before=p.scroll.scrollHeight,top=p.scroll.scrollTop;
      d[kind].remove();if(!state.follow[kind])p.scroll.scrollTop=top-(before-p.scroll.scrollHeight);
    }
    for(const rid of getPara(id)?.rows||[])state.rowDom.delete(rid);
    state.paraDom.delete(id);
  }
}
function setRowText(row){
  const p=paraOf(row);if(!p)return;
  if(!state.paraDom.has(p.id)&&state.paras.indexOf(p)<state.paras.length-90){markDirty();return}
  const d=paraDom(p);
  let box=state.rowDom.get(row.id);
  if(!box){
    box=document.createElement('span');box.className='passage-segment';box.dataset.id=row.id;
    d.en.append(box);state.rowDom.set(row.id,box);
  }
  box.textContent=row.en?row.en+' ':'';
  box.classList.toggle('interim',!row.final);
  box.classList.toggle('fixed',(row.fixes||[]).some(f=>f.by==='term'||f.by==='model'));
  box.title=row.raw&&row.raw!==row.en?`已修正口误/误识别\n原识别：${row.raw}`:'';
  renderParaZh(p);
  if(row.final)markDirty();   // live (interim) words are saved once confirmed; avoids rewriting the record per word
  panelAutoScroll('en');
}
function renderParaZh(p){
  const d=state.paraDom.get(p.id);if(!d)return;
  const english=paraEnglish(p);
  // Chinese counts as current when it translates the English on screen, or an earlier part of it that has only
  // been extended since. If the English was corrected, the old Chinese is dimmed until the new translation lands.
  const current=!p.zh||english===p.zhFor||(!!p.zhFor&&english.startsWith(p.zhFor));
  d.zhMain.textContent=english?p.zh:'';
  // Live tail: the in-progress sentence's own quick translation, shown right after the confirmed Chinese.
  const tail=current?liveTail(p):'';
  const tailOk=!!tail&&!!p.tailFor&&(tail===p.tailFor||tail.startsWith(p.tailFor)||p.tailFor.startsWith(tail.slice(0,24)));
  d.zhLive.textContent=tailOk?(p.zh?' ':'')+p.tailZh:'';
  d.zh.classList.toggle('stale',!!p.zh&&!current);
  d.en.hidden=d.zh.hidden=!english;
  const hits=glossaryHits(english).map(([term,zh])=>`${term} → ${zh}`);
  if(p.zhBy==='model')hits.unshift('译文已按上下文与术语校对');
  d.zh.title=hits.join('\n');
  panelAutoScroll('zh');
}
/* Words the translator left in English (course terms, acronyms and names excluded). Several of them in a
   paragraph's Chinese mean the English there is probably misrecognized. */
function untranslatedWords(zh){
  let text=String(zh||'');
  for(const [term] of buildGlossary())text=text.split(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi')).join(' ');
  text=text.replace(/\b[A-Z][A-Za-z]*\b/g,' ');
  return (text.match(/[a-z][a-z'-]{2,}/g)||[]);
}
/* Recognition puts a period at every pause, even mid-sentence ("…when the object of."). A period right after
   such a word is always a false break: drop it, and continue the sentence in the next fragment in lower case.
   The model then repairs any remaining breaks with full context. */
// Only words that essentially never end an English sentence ("…what they are." / "…look at this." are real endings).
const DANGLING=new Set('of the a an to and or but than between into whose whether because our your their its'.split(' '));
function mendFragment(row,text){
  const m=text.match(/([A-Za-z']+)\.$/);
  if(m&&DANGLING.has(m[1].toLowerCase()))text=text.slice(0,-1);
  const prev=state.rows[state.rows.indexOf(row)-1];
  if(prev?.en&&!/[.?!:;]["')\]]?$/.test(prev.en)&&/^[A-Z][a-z]/.test(text)&&!/^I\b/.test(text)&&
     !buildGlossary().some(([term])=>/^[A-Z]/.test(term)&&text.startsWith(term)))text=text[0].toLowerCase()+text.slice(1);
  return text;
}
function insertSpeech(id,english,final=false){
  const raw=safeText(english);if(!raw)return;
  let row=getRow(id);
  if(!row){
    row={id,num:state.rows.length+1,time:timeNow(),raw:'',en:'',fixes:[],final:false,reviewed:false,
         updated:0,version:0,firstSeen:Date.now(),source:'speech'};
    state.rowMap.set(id,row);state.rows.push(row);assignPara(row);
  }
  if(row.raw===raw && row.final===final)return;
  const cleaned=$('useSlipFix').checked?cleanSpeech(raw):{text:raw,fixes:[]};
  if(!cleaned.text)return;
  row.raw=raw;row.en=$('useSlipFix').checked?mendFragment(row,cleaned.text):cleaned.text;
  row.fixes=cleaned.fixes;row.final=!!final;row.reviewed=false;row.version++;row.updated=Date.now();
  setRowText(row);queueParaTranslation(paraOf(row),row.final);
  // Newly confirmed English is checked by the next correction round as soon as the pipeline is free.
  if(final&&row.en.length>3)state.nextInsightAt=Math.min(state.nextInsightAt||Infinity,Date.now()+CORRECTION_GAP_MS);
}
function clearTranslationEngine(){state.translator=null;state.translatorPair='';state.translatorPromise=null;state.translatorError=''}
function nativeCode(){return els.language.value.split('-')[0]}
function beginTranslator(){
  const pair=`${nativeCode()}-zh`;
  if(pair===state.translatorPair && state.translator)return Promise.resolve(state.translator);
  if(pair===state.translatorPair && state.translatorPromise)return state.translatorPromise;
  clearTranslationEngine();
  if(nativeCode()==='zh'){
    state.translatorPair=pair;els.translatorStatus.textContent='源语言为中文 · 无需翻译';return Promise.resolve(null);
  }
  if(typeof window.Translator==='undefined'){
    const msg='浏览器不支持本地 Translator API。建议 Chrome 138+；也可用 Ollama 替代。';
    state.translatorError=msg;els.translatorStatus.textContent='本地翻译不可用';return Promise.resolve(null);
  }
  // Must call create() from a real user interaction when language pack needs download.
  state.translatorPair=pair;
  try{
    const options={sourceLanguage:nativeCode(),targetLanguage:'zh',monitor(m){
      m.addEventListener('downloadprogress',e=>{
        els.translatorStatus.textContent=`正在下载翻译语言包 ${Math.round(e.loaded*100)}%`;
      });
    }};
    els.translatorStatus.textContent='准备本地翻译语言包…';
    const promise=window.Translator.create(options);
    state.translatorPromise=promise.then(instance=>{
      if(state.translatorPair===pair){state.translator=instance;state.translatorError='';els.translatorStatus.textContent='Chrome 本地翻译已就绪 · ¥0';drainTranslations()}
      return instance;
    }).catch(e=>{
      state.translatorError=`本地翻译初始化失败：${e.message||e}`;
      els.translatorStatus.textContent='翻译模型不可用 · 可切换 Ollama';
      toast(state.translatorError,true);return null;
    });return state.translatorPromise;
  }catch(e){
    state.translatorError=`无法启动本地翻译：${e.message}`;
    els.translatorStatus.textContent='本地翻译启动失败';return Promise.resolve(null);
  }
}
function translationFallbackMode(){return els.mode.value==='ollama' && state.browserStatus?.ollama?.available}
function queueParaTranslation(p,final=true,urgent=false){
  if(!p)return;
  if(nativeCode()==='zh'){p.zh=paraEnglish(p);p.zhFor=p.zh;p.zhBy='source';renderParaZh(p);return}
  // Confirmed text gets a full paragraph translation (coherent sentences); the live tail gets a quick one.
  // Corrected English jumps the queue, so its Chinese changes almost at once.
  if(urgent)(state.translateUrgent||=new Set()).add(p.id);
  else if(final)state.translatePending.add(p.id);
  if(state.translator)state.interimPending=p.id;   // quick tails use the on-device translator only
  if(state.translator || translationFallbackMode())scheduleDrain();
}
let drainTimer=null;
function scheduleDrain(){
  if(drainTimer)return;
  const wait=Math.max(40,(state.translateRetryAt||0)-Date.now());
  drainTimer=setTimeout(()=>{drainTimer=null;drainTranslations()},wait);
}
async function translateTail(p){
  const tail=liveTail(p);
  if(!tail||tail===p.tailFor)return;
  const chinese=safeText(await state.translator.translate(tail));
  const now=liveTail(p);
  if(now===tail||now.startsWith(tail)){p.tailZh=chinese;p.tailFor=tail;renderParaZh(p)}
  if(now&&now!==tail)state.interimPending=p.id;   // speech moved on while translating: catch up next
}
async function drainTranslations(){
  if(state.translating)return;
  if(!state.translator && !translationFallbackMode())return;
  state.translating=true;
  try{
    while(state.translator || translationFallbackMode()){
      let id=null;
      if(state.translateUrgent?.size){id=state.translateUrgent.values().next().value;state.translateUrgent.delete(id);state.translatePending.delete(id)}
      else if(state.translatePending.size){id=state.translatePending.values().next().value;state.translatePending.delete(id)}
      else if(state.interimPending){
        id=state.interimPending;state.interimPending=null;
        const tp=getPara(id);
        if(tp&&state.translator){try{await translateTail(tp)}catch{}}
        continue;
      }
      else break;
      const p=getPara(id);if(!p)continue;
      const english=paraFinalEnglish(p);
      if(!english||english===p.zhFor)continue;
      const started=performance.now();
      try{
        let chinese;
        if(state.translator)chinese=await state.translator.translate(english);
        else{
          const prev=state.paras[state.paras.indexOf(p)-1];
          const context=prev?paraEnglish(prev).slice(-400):'';
          const resp=await fetch('/api/translate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'ollama',text:english,context,domain:els.domain.value,glossary:els.glossary.value,model:els.model.value})});
          const out=await resp.json();if(!resp.ok)throw new Error(out.error);chinese=out.translation;
        }
        if(state.translatorError.startsWith('翻译发生错误')){state.translatorError='';setFooter(state.running?'正在识别讲课声音 · 全程静音':'翻译已恢复',state.running)}
        const now=paraFinalEnglish(p);
        if(now===english||now.startsWith(english)){
          p.zh=safeText(chinese);p.zhFor=english;p.zhBy='browser';state.lastTranslatedMs=performance.now()-started;
          // "Can't translate it" signal: English words the translator left untranslated point at misrecognized
          // speech. Flag those fragments so the next analysis round (pulled forward) fixes English + Chinese together.
          const left=untranslatedWords(p.zh);
          if(left.length>=2){
            for(const r of paraRows(p))if(r.final&&left.some(w=>r.en.toLowerCase().includes(w))){r.suspect=true;r.reviewed=false}
            state.nextInsightAt=Math.min(state.nextInsightAt||Infinity,Date.now()+1500);
          }
          $('latencyFoot').textContent=`TRANSLATE ${Math.round(state.lastTranslatedMs)} ms*`;
          renderParaZh(p);markDirty();
          if(liveTail(p))state.interimPending=p.id;   // refresh the quick tail for whatever is still live
        }
        if(now!==english)queueParaTranslation(p,true);
      }catch(e){
        // Keep the paragraph queued and back off, instead of dropping it and retrying in a tight loop.
        state.translatePending.add(p.id);
        state.translateRetryAt=Date.now()+4000;
        const msg=`翻译发生错误：${e.message||e}`;
        if(msg!==state.translatorError)toast(msg,true);
        state.translatorError=msg;setFooter(msg);
        break;
      }
    }
  }finally{state.translating=false;if((state.translateUrgent?.size||state.translatePending.size||state.interimPending)&&(state.translator||translationFallbackMode()))scheduleDrain()}
}
function newRecognition(){
  const Speech=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!Speech){toast('当前浏览器不支持 SpeechRecognition。建议使用桌面版 Google Chrome。',true);setMicState(false);return}
  const rec=new Speech();rec.lang=els.language.value;rec.continuous=true;rec.interimResults=true;rec.maxAlternatives=1;
  if($('useNativeLocalSpeech').checked && 'processLocally' in rec){
    rec.processLocally=true;
    // On-device recognition can be biased toward course terms (Chrome contextual biasing), where supported.
    if('phrases' in rec && typeof window.SpeechRecognitionPhrase==='function'){
      try{rec.phrases=buildGlossary().slice(0,60).map(([term])=>new window.SpeechRecognitionPhrase(term,3))}catch{}
    }
  }
  const epoch=++state.activeEpoch;
  rec.onstart=()=>{if(state.running){setMicState(true,'LISTENING');setFooter('正在接收老师讲话 · 语音字幕免费模式',true)}};
  rec.onresult=e=>{
    if(!state.running || epoch!==state.activeEpoch)return;
    state.lastResultAt=Date.now();if(state.boost?.track)state.boostConfirmed=true;
    for(let i=e.resultIndex;i<e.results.length;i++){
      const result=e.results[i];if(!result||!result[0])continue;
      insertSpeech(`s${state.idBase}${epoch}-${i}`,result[0].transcript,result.isFinal);
    }
  };
  rec.onerror=e=>{
    const fatal=['not-allowed','service-not-allowed','audio-capture','language-not-supported'];
    if(e.error==='no-speech'){setFooter('暂未检测到语音，继续等待…',true);return}
    if(e.error==='phrases-not-supported'||e.error==='aborted')return;
    if(e.error==='audio-capture'&&state.boost){
      // The processed track was refused: retry once with the plain microphone.
      disableBoost('增强后的音轨无法用于识别，已改用原始麦克风。');
      if(state.running){clearTimeout(state.restartTimer);state.restartTimer=setTimeout(()=>{if(state.running)newRecognition()},300)}
      return;
    }
    const explanation={
      'not-allowed':'麦克风访问被拒绝；请在 Chrome 地址栏左侧允许本网站使用麦克风。',
      'audio-capture':'找不到麦克风；请确认 Windows 输入设备和系统麦克风权限。',
      'network':'浏览器在线语音识别连接失败。请检查网络；无网络时可尝试设备内识别。',
      'language-not-supported':'缺少设备内语音识别语言包；关闭设备内识别选项，或先安装相应语言包。',
      'service-not-allowed':'浏览器阻止了语音识别服务。',
    };
    const msg=explanation[e.error]||`语音识别出现错误：${e.error}`;
    state.lastError=msg;setFooter(msg);if(fatal.includes(e.error)){state.running=false;toast(msg,true);setMicState(false)}
  };
  rec.onend=()=>{
    if(state.recognition!==rec)return;
    if(!state.running)return;
    setFooter('语音识别会话结束，正在自动恢复…',true);
    clearTimeout(state.restartTimer);
    state.restartTimer=setTimeout(()=>{
      if(state.running && state.recognition===rec)newRecognition();
    },650);
  };
  state.recognition=rec;
  const track=state.boost?.track;
  try{
    if(track&&track.readyState==='live')rec.start(track);else rec.start();
  }catch(e){
    if(track){   // this Chrome cannot recognize a processed track: fall back to the plain microphone
      disableBoost('当前 Chrome 不支持增强后的音轨，已改用原始麦克风。');
      try{rec.start();return}catch(e2){e=e2}
    }
    setMicState(false);toast(`无法启动麦克风：${e.message}`,true);
  }
}
function stopListening(){
  state.running=false;clearTimeout(state.restartTimer);
  try{state.recognition?.stop()}catch{}
  state.recognition=null;setMicState(false);closeBoostedMic();
  setFooter('已停止收音。可以继续阅读或导出本次课堂记录。');
}

/* ---------- Far-voice boost ----------
   A lecturer across the room reaches a laptop mic quietly, mixed with room noise. With boost on, the mic is opened
   through Web Audio: rumble below 90 Hz is cut, the consonant range is lifted slightly for clarity, a compressor
   raises quiet speech and evens out loud moments, and a limiter prevents clipping. Chrome (desktop 133+) then
   recognizes this processed track instead of the raw microphone. Older Chrome falls back to the plain mic. */
const BOOST_GAIN={normal:2.2,strong:3.6};
function adaptiveMicGain(rms,peak,level){
  const base=BOOST_GAIN[level]||2.2,max=level==='strong'?8:5;
  if(rms<0.004)return base; // do not chase silence / low room hiss
  return Math.max(1,Math.min(max,0.10/rms,peak>0?0.85/peak:max));
}
function chromeMajor(){const m=navigator.userAgent.match(/Chrome\/(\d+)/);return m?Number(m[1]):0}
/* Opens the mic for the level meter, and — only when boost is on — builds the processed track for recognition.
   With boost off (the default) recognition uses Chrome's own microphone path, exactly as before; the stream here
   only feeds the meter. Returns the track recognition should use, or null for the plain microphone. */
async function openBoostedMic(){
  closeBoostedMic();
  const micEpoch=state.micEpoch;
  const level=els.boost.value;
  if(!navigator.mediaDevices?.getUserMedia)return null;
  const useBoost=level!=='off'&&!state.boostUnsupported&&chromeMajor()>=133;
  const stream=await navigator.mediaDevices.getUserMedia({audio:useBoost?{echoCancellation:false,noiseSuppression:true,autoGainControl:true,channelCount:1}:true});
  if(micEpoch!==state.micEpoch||!state.running){stream.getTracks().forEach(t=>t.stop());return null}
  let ctx;
  try{
  ctx=new (window.AudioContext||window.webkitAudioContext)();
  await ctx.resume();
  if(micEpoch!==state.micEpoch||!state.running){stream.getTracks().forEach(t=>t.stop());await ctx.close();return null}
  const node=(make,set)=>{const n=make();set(n);return n};
  const src=ctx.createMediaStreamSource(stream);
  if(!useBoost){
    const analyser=node(()=>ctx.createAnalyser(),n=>{n.fftSize=1024});
    src.connect(analyser);
    state.boost={stream,ctx,analyser,level:'off',track:null};
    startLevelMeter();
    return null;
  }
  state.boostConfirmed=false;state.loudMs=0;state.boostStartedAt=Date.now();
  const highpass=node(()=>ctx.createBiquadFilter(),n=>{n.type='highpass';n.frequency.value=90});
  const presence=node(()=>ctx.createBiquadFilter(),n=>{n.type='peaking';n.frequency.value=2500;n.Q.value=0.9;n.gain.value=4});
  const comp=node(()=>ctx.createDynamicsCompressor(),n=>{n.threshold.value=-42;n.knee.value=18;n.ratio.value=4;n.attack.value=0.004;n.release.value=0.25});
  const gain=node(()=>ctx.createGain(),n=>{n.gain.value=BOOST_GAIN[level]||2.2});
  const limiter=node(()=>ctx.createDynamicsCompressor(),n=>{n.threshold.value=-3;n.knee.value=0;n.ratio.value=20;n.attack.value=0.001;n.release.value=0.1});
  const analyser=node(()=>ctx.createAnalyser(),n=>{n.fftSize=1024});
  const inputAnalyser=node(()=>ctx.createAnalyser(),n=>{n.fftSize=1024});
  const dest=ctx.createMediaStreamDestination();
  src.connect(highpass);highpass.connect(presence);presence.connect(comp);comp.connect(gain);gain.connect(limiter);
  comp.connect(inputAnalyser);limiter.connect(dest);limiter.connect(analyser);
  state.boost={stream,ctx,analyser,inputAnalyser,gain,level,track:dest.stream.getAudioTracks()[0]};
  startLevelMeter();
  return state.boost.track;
  }catch(e){stream.getTracks().forEach(t=>t.stop());if(ctx)await ctx.close().catch(()=>{});throw e}
}
function closeBoostedMic(){
  state.micEpoch=(state.micEpoch||0)+1;
  clearInterval(state.meterTimer);state.meterTimer=null;$('micMeter').hidden=true;
  if(!state.boost)return;
  for(const t of state.boost.stream.getTracks())t.stop();
  state.boost.track?.stop();state.boost.ctx.close().catch(()=>{});state.boost=null;
}
function disableBoost(message){
  state.boostUnsupported=true;closeBoostedMic();if(message)toast(message,true);
}
// Small input meter in the time chip: shows whether the lecturer's voice is actually reaching the recognizer.
function startLevelMeter(){
  const meter=$('micMeter'),bars=[...meter.children],buf=new Float32Array(1024),input=new Float32Array(1024);
  meter.hidden=false;clearInterval(state.meterTimer);
  state.meterTimer=setInterval(()=>{
    const a=state.boost?.analyser;if(!a)return;
    const boost=state.boost;
    if(boost.gain&&boost.inputAnalyser){
      boost.inputAnalyser.getFloatTimeDomainData(input);
      let energy=0,peak=0;for(const v of input){energy+=v*v;peak=Math.max(peak,Math.abs(v))}
      const target=adaptiveMicGain(Math.sqrt(energy/input.length),peak,boost.level);
      boost.gain.gain.setTargetAtTime(target,boost.ctx.currentTime,target<boost.gain.gain.value?0.08:0.6);
    }
    a.getFloatTimeDomainData(buf);let sum=0;for(const v of buf)sum+=v*v;
    const db=20*Math.log10(Math.sqrt(sum/buf.length)+1e-9);
    const lit=[-58,-46,-36,-27,-18].filter(t=>db>t).length;
    bars.forEach((b,i)=>b.classList.toggle('on',i<lit));
    meter.title=`收音电平 ${Math.round(db)} dBFS（老师说话时应亮 2–4 格）`;
    // Safety net: if the boosted track carries clear sound but recognition returns nothing, go back to the
    // plain microphone automatically instead of leaving the transcript empty.
    const now=Date.now(),dt=Math.min(1000,now-(state.meterLastAt||now));state.meterLastAt=now;
    if(boost.track&&!state.boostConfirmed&&state.running){
      if(db>-42)state.loudMs=(state.loudMs||0)+dt;   // real time, so a throttled background timer still counts
      if(state.loudMs>3500&&now-(state.boostStartedAt||0)>8000)fallbackToPlainMic();
    }
  },120);
}
function fallbackToPlainMic(){
  state.boostUnsupported=true;
  toast('增强后的声音没有产生字幕，已自动改回原始麦克风。（可在设置里再打开增强）',true);
  const old=state.recognition;state.recognition=null;try{old?.abort()}catch{}
  openBoostedMic().catch(()=>null).then(()=>{if(state.running)newRecognition()});
}
function startListening(){
  if(state.demoMode)stopDemo();
  if(state.isDemoSession){clearView();state.isDemoSession=false;state.sessionId=null;state.sessionStarted=null}
  if(!window.isSecureContext){toast('麦克风权限需要 localhost 或 HTTPS。请通过 start_windows.bat 启动应用。',true);return}
  const Speech=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!Speech){toast('浏览器没有 Web Speech API。请更新到 Windows 桌面版 Chrome。',true);return}
  if(!state.startAt)state.startAt=Date.now();
  state.running=true;
  // Begin from the user's click: model download and microphone may require user activation.
  beginTranslator();
  openBoostedMic()
    .catch(e=>{
      // The meter/boost stream is optional: recognition always works on Chrome's own microphone path.
      if(els.boost.value!=='off')disableBoost(`远距离收音增强没能开启（${e.message||e}），已改用原始麦克风。`);
      else closeBoostedMic();
      return null;
    })
    .then(()=>{if(state.running)newRecognition()});
}
els.mic.addEventListener('click',()=>{if(state.running)stopListening();else startListening()});

/* ---------- Key points and Q&A: newest first ----------
   Core notes (importance 4–5) stay until the model says they are no longer key points ("remove"). Minor notes the
   model stops mentioning leave the panel. Questions the lecture has moved past are removed. Anything that leaves a
   panel goes to an archive that is saved and exported. */
const MAX_QA=3,QA_REFRESH_MS=40000;
function dedupeKey(body){return safeText(body).toLowerCase().replace(/[^\p{L}\p{N} ]/gu,'').slice(0,190)}
const noteLevel=n=>Number(n.importance)||3;
function matchOld(current,item,field,used){
  let old=item.id&&item.id!=='new'?current.find(x=>x.id===item.id)||null:null;
  if(!old){const key=dedupeKey(item[field]);old=current.find(x=>!used.has(x.id)&&dedupeKey(x[field])===key)||null}
  return old&&used.has(old.id)?null:old;
}
function reconcileNotes(incoming,merged,quality){
  const current=state.notes,mergedSet=new Set(merged||[]);
  if(!incoming?.length&&!mergedSet.size)return false;      // "nothing to change"
  const used=new Set(),keys=new Set(),next=[],now=Date.now();
  for(const item of incoming||[]){
    const key=dedupeKey(item.en);if(!key||keys.has(key))continue;keys.add(key);
    const old=matchOld(current,item,'en',used);
    if(old)mergedSet.delete(old.id);                        // kept and merged at once: keep it
    const id=old?old.id:`n${++state.idSeq}`;used.add(id);
    next.push({id,en:item.en,zh:item.zh||old?.zh||'',importance:Number(item.importance)||old?.importance||3,
      score:item.score??old?.score,kind:item.kind||old?.kind||quality,created:old?.created||now,time:old?.time||timeNow(),
      fresh:!old,changed:!!old&&(old.en!==item.en||old.zh!==item.zh)});
  }
  for(const old of current){
    if(used.has(old.id))continue;
    if(!mergedSet.has(old.id)&&noteLevel(old)>=4){next.push({...old,fresh:false,changed:false});continue}
    state.notesArchive.push({...old,fresh:false,changed:false,retiredAt:timeNow(),reason:mergedSet.has(old.id)?'removed':'minor'});
  }
  next.sort((a,b)=>b.created-a.created);   // stable: same-round items keep the model's order
  state.notes=next;renderList('note');return true;
}
function reconcileQa(incoming,quality,removeIds){
  const removeSet=new Set(removeIds||[]);
  if(!incoming?.length){
    // No new list: only drop questions the lecture has moved past.
    if(!removeSet.size)return false;
    const keep=state.qa.filter(q=>!removeSet.has(q.id));
    for(const q of state.qa)if(removeSet.has(q.id))state.qaArchive.push({...q,fresh:false,changed:false,retiredAt:timeNow(),reason:'outdated'});
    state.qa=keep;renderList('qa');return true;
  }
  const current=state.qa.filter(q=>!removeSet.has(q.id)),used=new Set(),keys=new Set(),next=[],now=Date.now();
  for(const q of state.qa)if(removeSet.has(q.id))state.qaArchive.push({...q,fresh:false,changed:false,retiredAt:timeNow(),reason:'outdated'});
  for(const item of incoming){
    if(next.length>=MAX_QA)break;
    const key=dedupeKey(item.q);if(!key||keys.has(key))continue;keys.add(key);
    const old=matchOld(current,item,'q',used);
    const id=old?old.id:`q${++state.idSeq}`;used.add(id);
    next.push({id,q:item.q,a:item.a,kind:item.kind||old?.kind||quality,created:old?.created||now,time:old?.time||timeNow(),
      fresh:!old,changed:!!old&&(old.q!==item.q||old.a!==item.a)});
  }
  for(const old of current)if(!used.has(old.id))state.qaArchive.push({...old,fresh:false,changed:false,retiredAt:timeNow()});
  next.sort((a,b)=>b.created-a.created);
  state.qa=next;renderList('qa');return true;
}
function renderList(kind){
  const isNote=kind==='note',panel=isNote?panelInfo.notes:panelInfo.qa,list=isNote?state.notes:state.qa;
  hideEmpty(isNote?'notes':'qa');
  const cards=list.map(item=>{
    const card=document.createElement('article');card.className='mini-card';card.dataset.id=item.id;
    if(item.kind==='rules'){card.classList.add('heuristic');card.title='基础摘录（免模型）'}
    if(item.fresh)card.classList.add('fresh');else if(item.changed)card.classList.add('updated');
    const meta=document.createElement('div');meta.className='mini-meta';
    const time=document.createElement('span');time.textContent=String(item.time||'').slice(0,5);meta.append(time);
    if(isNote&&noteLevel(item)>=4){
      card.dataset.core='1';const tag=document.createElement('span');tag.className='mini-tag';
      tag.textContent=noteLevel(item)>=5?'核心':'重要';meta.append(tag);
    }
    const text1=document.createElement('div');text1.className='mini-en';text1.textContent=isNote?item.en:item.q;
    const text2=document.createElement('div');text2.className='mini-zh';text2.textContent=isNote?item.zh:item.a;
    card.append(meta,text1,text2);
    item.fresh=false;item.changed=false;return card;
  });
  panel.feed.replaceChildren(...cards);
  $('qaCount').textContent=`${state.qa.length} QUESTIONS`;
  markDirty();
}
const EMPHASIS=/\b(important|key|remember|exam|test|quiz|assignment|must|critical|note that|difference|differs?|versus|vs\.?|whereas|because|therefore|in contrast|trade-?off|formula|equals)\b/i;
const DEFINITION=/\b(?:is|are)\s+(?:defined as|called|known as|an?\b|the\b)|\bmeans\b|\brefers? to\b/i;
function sentenceScore(en){
  let s=0;if(DEFINITION.test(en))s+=3;if(EMPHASIS.test(en))s+=2;
  s+=Math.min(3,glossaryHits(en).length*1.5);if(en.length<45)s-=2;if(en.length>280)s-=1;return s;
}
const scoreToImportance=s=>s>=6?5:s>=4?4:s>=1.5?3:2;
function rulesInsights(){
  const rows=state.rows.filter(r=>r.final&&r.en.length>45);
  if(!rows.length)return;
  // Candidates from the latest speech that are not already a note (or a retired one).
  const known=new Set([...state.notes,...state.notesArchive].map(n=>dedupeKey(n.en)));
  const fresh=rows.slice(-12).map(r=>({id:'new',en:truncate(r.en,240),zh:'',score:sentenceScore(r.en)}))
    .filter(c=>c.score>0&&!known.has(dedupeKey(c.en))).map(c=>({...c,importance:scoreToImportance(c.score)}));
  if(fresh.length){
    // Minor notes compete with the new candidates; core notes stay automatically.
    const minor=state.notes.filter(n=>noteLevel(n)<4).map(n=>({...n,score:n.score??noteLevel(n)*1.4}));
    reconcileNotes([...minor,...fresh].sort((a,b)=>b.score-a.score).slice(0,6),[],'rules');
    fillNoteChinese();
  }
  if(state.qa.some(q=>q.kind!=='rules'))return;   // never replace model questions with template ones
  const qs=[];
  for(const n of state.notes){
    const def=n.en.match(/^\s*(?:an?\s+|the\s+)?([a-z][a-z\s-]{3,48}?)\s+(?:is|are|means|refers to)\s+/i);
    const diff=n.en.match(/difference between\s+([^,.;?]{3,40}?)\s+and\s+([^,.;?]{3,40})/i);
    if(diff)qs.push({id:'new',q:`How do ${diff[1].trim()} and ${diff[2].trim()} differ, and why does the distinction matter?`,a:`From the lecture: “${truncate(n.en,250)}”`});
    else if(def)qs.push({id:'new',q:`Explain ${def[1].trim()} in your own words and give a case where it applies.`,a:`From the lecture: “${truncate(n.en,250)}”`});
    if(qs.length>=MAX_QA)break;
  }
  if(qs.length)reconcileQa(qs,'rules');
}
// Rule-based notes come straight from transcript sentences; give them Chinese with the local translator.
async function fillNoteChinese(){
  if(!state.translator)return;
  let changed=false;
  for(const n of state.notes.filter(n=>!n.zh).slice(0,4)){
    try{n.zh=safeText(await state.translator.translate(n.en));changed=true}catch{break}
  }
  if(changed)renderList('note');
}
/* Context fixes from the model: corrected English fragments, plus a checked Chinese translation of each whole
   paragraph. Applied only if the text is unchanged since it was sent, so a late answer never overwrites newer text.
   English and Chinese change in the same step; if a paragraph's Chinese did not come back, the old Chinese is dimmed
   and the paragraph is re-translated at once. */
function applyModelFixes(out,sent,sentParas){
  const enById=new Map((out.corrections||[]).map(c=>[c.id,c.en]));
  let fixedEn=0,fixedZh=0;const touched=new Set();
  for(const [id,value] of enById){
    const row=getRow(id);
    if(!row||!row.final||row.en!==sent.get(id))continue;
    const en=safeText(value);
    if(en===row.en)continue;
    row.fixes=[...(row.fixes||[]),{from:row.en,to:en,by:'model'}];
    if(!en)row.dropped=true;   // pure recognition noise: removed from the screen, the original stays in the record
    row.en=en;row.version++;row.updated=Date.now();row.suspect=false;row.reviewed=true;fixedEn++;touched.add(row.para);setRowText(row);
  }
  // A removed false break at a paragraph end pulls the rest of the sentence back into that paragraph.
  if(fixedEn)reflowParagraphs();
  for(const t of out.translations||[]){
    const p=getPara(t.id),info=sentParas.get(t.id);if(!p||!info||!t.zh)continue;
    if(!info.rows.every((rid,i)=>p.rows[i]===rid))continue;   // paragraph was re-cut meanwhile: re-translate instead
    // The model translated the paragraph as sent, with its own corrections applied.
    const expected=info.rows.map(rid=>enById.has(rid)?safeText(enById.get(rid)):info.en.get(rid)).filter(Boolean).join(' ');
    const now=info.rows.map(rid=>getRow(rid)?.en||'').filter(Boolean).join(' ');
    if(!expected||now!==expected)continue;   // something else changed meanwhile
    p.zh=safeText(t.zh);p.zhFor=expected;p.zhBy='model';fixedZh++;touched.delete(p.id);
    state.translateUrgent?.delete(p.id);state.translatePending.delete(p.id);renderParaZh(p);markDirty();
    if(liveTail(p))state.interimPending=p.id;
  }
  // Corrected English without new Chinese from the model: re-translate those paragraphs first, right now.
  for(const pid of touched)queueParaTranslation(getPara(pid),true,true);
  state.corrections+=fixedEn;
  if(fixedEn||fixedZh){
    const parts=[];if(fixedEn)parts.push(`修正 ${fixedEn} 处口误/误识别`);if(fixedZh)parts.push(`校对 ${fixedZh} 句译文`);
    setFooter(`已根据上下文${parts.join('，')}`,state.running);
  }
}
function selectedEngine(){
  const selected=els.mode.value;
  if(selected!=='auto')return selected;
  if(state.browserStatus?.codex?.authenticated)return 'codex';
  if(state.browserStatus?.ollama?.available && (state.browserStatus.ollama.models||[]).length)return 'ollama';
  return 'heuristic';
}
function setAnalysisFoot(engine, note=''){
  const name={codex:'CODEX · CHATGPT QUOTA',ollama:'OLLAMA · LOCAL MODEL',heuristic:'RULE-BASED · FREE'}[engine]||'MODEL';
  $('insightModeFoot').textContent=name+(note?` · ${note}`:'');
}
// Unfinished paragraph checks survive the moving live-context window.
function analysisBatch(){
  const pending=state.paras.filter(p=>{
    const rs=paraRows(p).filter(r=>r.en);
    return rs.length&&rs.every(r=>r.final)&&
      (p.reviewedFor!==paraEnglish(p)||rs.some(r=>!r.reviewed));
  });
  // Newest finished paragraphs first (that is what is on screen); earlier attempts are retried after them.
  const order=new Map(state.paras.map((p,i)=>[p.id,i]));
  pending.sort((a,b)=>(!!a.lastReviewAttempt-!!b.lastReviewAttempt)||(order.get(b.id)-order.get(a.id)));
  const paraNeed=pending.slice(0,4);
  const wanted=new Set(paraNeed.flatMap(p=>p.rows));
  const source=state.rows.filter(r=>wanted.has(r.id)&&r.en);
  for(const r of state.rows.slice(-8))if(r.en&&!wanted.has(r.id))source.push(r);
  return {source,paraNeed};
}
/* Two rhythms share one Codex pipeline:
   - corrections (+ their Chinese) run back-to-back while there is newly confirmed English to check, ~1.5 s apart;
   - key points / Q&A ride along only every 整理间隔 (and Q&A every ~40 s), so correction-only rounds stay small
     and fast. When nothing new needs checking, rounds pause until speech continues. */
const CORRECTION_GAP_MS=1500;
function needsCorrection(){
  return state.rows.slice(-40).some(r=>r.final&&r.en&&(!r.reviewed||r.suspect))||analysisBatch().paraNeed.length>0;
}
function notesDue(){return !state.notes.length||Date.now()-(state.lastNotesRoundAt||0)>=Number(els.interval.value)*1000}
function finishInsightRound(){
  state.pendingJob=false;
  const modelEngine=selectedEngine()!=='heuristic';
  const gap=modelEngine&&$('useSlipFix').checked&&needsCorrection()?CORRECTION_GAP_MS:Number(els.interval.value)*1000;
  state.insightNotBefore=Date.now()+gap;
  state.nextInsightAt=state.insightNotBefore;
}
async function doInsights(){
  if(state.pendingJob||state.demoMode)return;
  const {source,paraNeed}=analysisBatch();
  if(!source.length)return;
  // Fingerprint the raw speech so that our own corrections do not trigger another round.
  const fingerprint=source.map(x=>x.id+':'+x.raw+(x.suspect?'!':'')).join('|');
  if(!paraNeed.length&&(source.reduce((n,x)=>n+x.en.length,0)<90||fingerprint===state.lastAnalysisFingerprint))return;
  state.lastAnalysisFingerprint=fingerprint;
  const engine=selectedEngine();setAnalysisFoot(engine,'PROCESSING');
  if(engine==='heuristic'){rulesInsights();setAnalysisFoot(engine);$('insightTimeFoot').textContent=timeNow();return}
  if(engine==='codex' && !state.browserStatus?.codex?.authenticated){
    toast('Codex CLI 未安装或尚未登录，已暂时使用免费规则摘要。请打开设置查看。',true);
    rulesInsights();setAnalysisFoot('heuristic','CODEX NOT READY');return;
  }
  if(engine==='ollama' && !state.browserStatus?.ollama?.available){
    toast('Ollama 没有运行，暂时使用免费规则摘要。',true);
    rulesInsights();setAnalysisFoot('heuristic','OLLAMA NOT READY');return;
  }
  const fixOn=$('useSlipFix').checked;
  const paraRowIds=new Set(paraNeed.flatMap(p=>p.rows));
  // New fragments, plus every fragment of a paragraph being translated (so a sentence split across fragments can be
  // repaired as a whole).
  const review=source.filter(r=>r.final&&(!r.reviewed||paraRowIds.has(r.id)));
  const sent=new Map(review.map(r=>[r.id,r.en]));
  const sentParas=new Map(paraNeed.map(p=>[p.id,{rows:[...p.rows],en:new Map(paraRows(p).map(r=>[r.id,r.en]))}]));
  const payload={mode:engine,model:els.model.value,domain:els.domain.value,effort:els.effort.value,
    subject:els.subject.value,glossary:els.glossary.value,reference:els.reference.value,
    segments:source.map(x=>({id:x.id,en:x.en,time:x.time,review:sent.has(x.id),...(sent.has(x.id)?{suspect:!!x.suspect}:{})})),
    paragraphs:paraNeed.map(p=>({id:p.id,rows:p.rows.filter(id=>getRow(id)?.en),zh:p.zhFor===paraEnglish(p)?p.zh:''})),
    notes:state.notes.map(n=>({id:n.id,en:n.en,zh:n.zh,importance:noteLevel(n)})),
    questions:state.qa.map(q=>({id:q.id,q:q.q,a:q.a})),
    // Key points every 整理间隔, Q&A about every 40 s; rounds in between only correct and translate (smaller, faster).
    notes_due:notesDue(),
    questions_due:notesDue()&&(!state.qa.length||Date.now()-(state.lastQaRoundAt||0)>=QA_REFRESH_MS)};
  state.pendingJob=true;
  const sessionEpoch=state.analysisEpoch||0;
  const notesClearVersion=state.notesClearVersion||0,qaClearVersion=state.qaClearVersion||0;
  const panelsUnchanged=()=>notesClearVersion===(state.notesClearVersion||0)&&qaClearVersion===(state.qaClearVersion||0);
  for(const p of paraNeed)p.lastReviewAttempt=Date.now();
  try{
    const resp=await fetch('/api/insights',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const created=await resp.json();if(!resp.ok)throw new Error(created.error||'创建分析任务失败');
    const start=Date.now();
    for(;;){
      // Short polls: a correction is shown within ~0.4 s of Codex answering (the request is local and tiny).
      await new Promise(resolve=>setTimeout(resolve,400));
      const result=await (await fetch('/api/jobs/'+encodeURIComponent(created.job))).json();
      if(result.state==='done'){
        if(sessionEpoch!==(state.analysisEpoch||0))return;
        const out=result.result||{};
        for(const r of review)if(sent.get(r.id)===r.en){r.reviewed=true;r.suspect=false}
        if(!fixOn){
          // Correction switched off: keep the English as heard, and drop translations of text we did not adopt.
          const corrected=new Set((out.corrections||[]).map(c=>c.id));
          out.translations=(out.translations||[]).filter(t=>!(sentParas.get(t.id)?.rows||[]).some(id=>corrected.has(id)));
          out.corrections=[];
        }
        applyModelFixes(out,sent,sentParas);
        for(const p of paraNeed){
          const info=sentParas.get(p.id);
          const original=info.rows.map(id=>info.en.get(id)||'').filter(Boolean).join(' ');
          const current=paraEnglish(p);
          // Unchanged, valid browser Chinese can also be accepted by the model without a rewrite.
          if(p.zh&&p.zhFor===current&&(current===original||p.zhBy==='model'))p.reviewedFor=current;
        }
        markDirty();
        if(payload.notes_due&&notesClearVersion===(state.notesClearVersion||0)){state.lastNotesRoundAt=Date.now();reconcileNotes(out.notes,out.remove||out.merged,'model')}
        if(payload.questions_due&&qaClearVersion===(state.qaClearVersion||0)){state.lastQaRoundAt=Date.now();reconcileQa(out.questions,'model',out.remove_questions)}
        if(panelsUnchanged()&&(!state.notes.length||!state.qa.length))rulesInsights();
        $('insightTimeFoot').textContent=timeNow();setAnalysisFoot(engine);break;
      }
      if(result.state==='error'||result.state==='missing')throw new Error(result.message||'分析任务丢失');
      if(Date.now()-start>115000)throw new Error('分析等待超时');
    }
  }catch(e){
    if(sessionEpoch!==(state.analysisEpoch||0))return;
    state.lastAnalysisFingerprint='';
    setAnalysisFoot('heuristic','AI ERROR');if(panelsUnchanged())rulesInsights();toast(`右侧分析暂时回退到基础模式：${e.message}`,true);
  }finally{finishInsightRound()}
}
function tick(){
  if(state.startAt)$('sessionTime').textContent=elapsed(Date.now()-state.startAt);
  if(!state.startAt||state.demoMode||!state.rows.length||state.pendingJob||Date.now()<(state.insightNotBefore||0))return;
  const now=Date.now();
  if(!state.nextInsightAt)state.nextInsightAt=now+Number(els.interval.value)*1000;
  if(now>=state.nextInsightAt){state.nextInsightAt=now+Number(els.interval.value)*1000;doInsights()}
}
setInterval(tick,500);   // half-second scheduling, so a correction round starts close to its planned moment

async function refreshEnvironment(){
  $('connectionStatus').textContent='正在检测 Codex 与 Ollama…';
  try{
    const response=await fetch('/api/status');if(!response.ok)throw new Error('服务器不可用');
    state.browserStatus=await response.json();
    const c=state.browserStatus.codex,o=state.browserStatus.ollama;
    const one=c.authenticated?'Codex CLI 已登录，可使用订阅额度':c.installed?'Codex 已安装，但还没登录（运行 codex login）':'Codex CLI 尚未安装（可选）';
    const two=o.available?`Ollama 已连接（${o.models.length} 个模型）`:'Ollama 未运行（可选）';
    $('connectionStatus').textContent=`${one}；${two}。`;
    setAnalysisFoot(selectedEngine());
    if(!state.translator){
      els.translatorStatus.textContent=typeof window.Translator==='undefined'?'浏览器本地翻译 API 不可用':'Chrome 本地翻译可尝试（开始时初始化）';
    }
  }catch(e){$('connectionStatus').textContent=`连接本机服务失败：${e.message}`;state.browserStatus=null}
}
$('refreshStatusBtn').addEventListener('click',refreshEnvironment);
async function uploadReference(file){
  if(!file)return;if(file.size>12*1024*1024){toast('资料超过 12 MB，建议先提取文字后粘贴。',true);return}
  state.busyReference=true;$('referenceStatus').textContent=`正在提取 ${file.name} 的文字…`;
  try{
    const resp=await fetch('/api/reference',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Filename':encodeURIComponent(file.name)},body:await file.arrayBuffer()});
    const data=await resp.json();if(!resp.ok)throw new Error(data.error);
    state.referenceText=data.text;state.referenceLabel=file.name;els.reference.value=data.text.slice(0,12000);
    $('referenceStatus').textContent=`已读入 ${file.name}（${data.characters} 字符，当前框中最多使用前 12,000 字符；分析时再截取前 5,500 字符）。`;
  }catch(e){toast('文件未能读取：'+e.message,true);$('referenceStatus').textContent='读取失败，可手动粘贴纯文字。'}
  finally{state.busyReference=false}
}
$('referenceInput').addEventListener('change',e=>uploadReference(e.target.files?.[0]));
$('removeReferenceBtn').addEventListener('click',()=>{state.referenceText='';state.referenceLabel='';els.reference.value='';$('referenceInput').value='';$('referenceStatus').textContent='资料已清除。'});
function showSettings(show){$('settingsOverlay').hidden=!show;if(show){refreshEnvironment();setTimeout(()=>els.subject.focus(),100)}}
$('settingsBtn').addEventListener('click',()=>showSettings(true));$('settingsClose').addEventListener('click',()=>showSettings(false));
$('settingsSave').addEventListener('click',()=>{showSettings(false);state.nextInsightAt=Date.now()+Number(els.interval.value)*1000;toast('设置已保存。后续知识分析将使用更新后的课程信息。')});
$('settingsOverlay').addEventListener('click',e=>{if(e.target.id==='settingsOverlay')showSettings(false)});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('settingsOverlay').hidden)showSettings(false)});
$('fullscreenBtn').addEventListener('click',async()=>{
  try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen()}
  catch(e){toast('浏览器未允许全屏。也可以直接按 F11。',true)}
});
els.language.addEventListener('change',()=>{
  clearTranslationEngine();
  if(state.running){stopListening();toast('讲课语言已更新。请再次点击启动麦克风。')}
  else els.translatorStatus.textContent='语言已更改 · 点击启动以重新准备翻译';
});
els.domain.addEventListener('change',()=>{
  for(const row of state.rows)setRowText(row);
  toast('已切换专业术语表。新收到的字幕会使用当前专业领域。');
});
els.mode.addEventListener('change',()=>{setAnalysisFoot(selectedEngine());if(translationFallbackMode())drainTranslations()});
els.interval.addEventListener('change',()=>{state.nextInsightAt=Date.now()+Number(els.interval.value)*1000});
els.boost.addEventListener('change',()=>{
  state.boostUnsupported=false;
  try{localStorage.setItem('ct-boost-v2',els.boost.value)}catch{}
  if(state.running){stopListening();startListening();toast('收音设置已更新。')}
});
els.effort.addEventListener('change',()=>{try{localStorage.setItem('ct-effort',els.effort.value)}catch{}});
try{const saved=localStorage.getItem('ct-effort');if(saved&&[...els.effort.options].some(o=>o.value===saved))els.effort.value=saved}catch{}
// New key: an older saved "normal" must not switch boost back on now that the plain mic is the default.
try{const saved=localStorage.getItem('ct-boost-v2');if(saved&&[...els.boost.options].some(o=>o.value===saved))els.boost.value=saved}catch{}

function exportSession(asJson=false){
  if(!state.rows.length&&!state.notes.length&&!state.qa.length){toast('还没有课堂内容可以导出。');return}
  const date=new Date().toISOString().slice(0,19).replace(/[T:]/g,'-');
  let text,mime,ext;
  if(asJson){text=JSON.stringify({app:'Echo Translate',subject:els.subject.value,domain:els.domain.value,
    exportedAt:new Date().toISOString(),transcript:[...state.transcriptArchive,...state.rows.map(rowRecord)],
    paragraphs:[...state.parasArchive,...state.paras.map(paraRecord)],notes:state.notes,questions:state.qa,
    earlierNotes:state.notesArchive,earlierQuestions:state.qaArchive},null,2);
    mime='application/json';ext='json';}
  else{
    text=`# ${els.subject.value||'Classroom'} — Echo Translate\n\nExported: ${new Date().toLocaleString()}\n\n## Original and translated transcript\n\n`;
    // One block per paragraph: the English passage and its Chinese, then what recognition originally heard.
    const rowsById=new Map([...state.transcriptArchive,...state.rows].map(r=>[r.id,r]));
    const allParas=[...state.parasArchive,...state.paras];
    const covered=new Set(allParas.flatMap(p=>p.rows));
    const loose=[...rowsById.values()].filter(r=>!covered.has(r.id)).map(r=>({id:'x'+r.id,rows:[r.id],zh:r.zh||'',time:r.time}));
    for(const p of [...allParas,...loose]){
      const rs=p.rows.map(id=>rowsById.get(id)).filter(Boolean);
      const english=rs.filter(r=>r.en).map(r=>r.en).join(' ');
      if(english)text+=`### ${p.time||rs[0]?.time||''}\n\n${english}\n\n${p.zh||'(Translation unavailable)'}\n\n`;
      for(const r of rs){
        if(r.dropped)text+=`> 已作为识别噪音去除 / removed as recognition noise: ${r.raw}\n\n`;
        else if(r.raw&&r.raw!==r.en)text+=`> 原识别 / ASR: ${r.raw}\n\n`;
      }
    }
    const chrono=list=>[...list].sort((a,b)=>(a.created||0)-(b.created||0));
    const tag=n=>noteLevel(n)>=5?' `核心`':noteLevel(n)>=4?' `重要`':'';
    text+='## Bilingual key takeaways (in lecture order)\n\n';
    for(const n of chrono(state.notes))text+=`- ${String(n.time||'').slice(0,5)}${tag(n)} **${n.en}**\n  - ${n.zh}\n`;
    if(state.notesArchive.length){
      text+='\n### Minor or merged points (no longer shown in the panel)\n\n';
      for(const n of chrono(state.notesArchive))text+=`- ${String(n.time||'').slice(0,5)} ${n.en}\n  - ${n.zh}\n`;
    }
    text+='\n## Hardest likely questions and English answers\n\n';
    for(const q of chrono([...state.qa,...state.qaArchive]))text+=`**Q (${String(q.time||'').slice(0,5)}):** ${q.q}\n\n**A:** ${q.a}\n\n`;
    mime='text/markdown';ext='md';
  }
  const url=URL.createObjectURL(new Blob([text],{type:mime+';charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download=`Echo_Translate_${date}.${ext}`;
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000);
  toast(`已导出 ${ext.toUpperCase()}。按 Shift 点击「导出」可切换 JSON 格式。`);
}
$('exportBtn').addEventListener('click',e=>exportSession(e.shiftKey));
/* 「清空字幕」: empties the English and Chinese panels and keeps listening; key points and Q&A stay.
   The cleared lines move into this class's record (and exports), so nothing is lost. */
function clearTranscript(){
  if(!state.rows.length)return;
  state.transcriptArchive.push(...state.rows.map(rowRecord));state.parasArchive.push(...state.paras.map(paraRecord));
  state.rows=[];state.rowMap.clear();state.rowDom.clear();state.translatePending.clear();state.interimPending=null;
  state.paras=[];state.paraMap.clear();state.paraDom.clear();
  for(const kind of ['en','zh']){
    const el=document.createElement('div');el.className='empty-state';el.id=panelInfo[kind].empty;
    panelInfo[kind].feed.replaceChildren(el);state.follow[kind]=true;followButtonUpdate(kind);
  }
  state.analysisEpoch=(state.analysisEpoch||0)+1;
  state.lastAnalysisFingerprint='';markDirty();
  toast('字幕和翻译已清空，接着记录。之前的内容仍保存在本场记录里；重点和 Q&A 保留。');
}
$('clearTranscriptBtn').addEventListener('click',clearTranscript);

function clearAnalysisPanel(kind){
  const notes=kind==='note',key=notes?'notes':'qa',archive=notes?'notesArchive':'qaArchive';
  if(!state[key].length)return;
  state[archive].push(...state[key].map(item=>({...item,fresh:false,changed:false,retiredAt:timeNow(),reason:'cleared'})));
  state[key]=[];
  state[key+'ClearVersion']=(state[key+'ClearVersion']||0)+1;
  renderList(kind);
  cacheSessionDraft();
  saveSession(true);
  toast(`${notes?'重点':'Q&A'}已清空，原内容仍保留在课堂记录和导出中。`);
}
$('clearNotesBtn').addEventListener('click',()=>clearAnalysisPanel('note'));
$('clearQaBtn').addEventListener('click',()=>clearAnalysisPanel('qa'));


/* Clears the screen only. Records on disk are never touched here. */
function clearView(){
  stopListening();stopDemo();
  state.rows=[];state.rowMap.clear();state.rowDom.clear();state.notes=[];state.qa=[];state.seen.clear();
  state.notesArchive=[];state.qaArchive=[];state.transcriptArchive=[];state.corrections=0;state.idSeq=0;
  state.paras=[];state.paraMap.clear();state.paraDom.clear();state.parasArchive=[];
  state.translatePending.clear();state.interimPending=null;state.startAt=null;state.lastAnalysisFingerprint='';
  state.nextInsightAt=0;state.insightNotBefore=0;state.analysisEpoch=(state.analysisEpoch||0)+1;
  for(const [kind,p] of Object.entries(panelInfo)){
    const el=document.createElement('div');el.className='empty-state';el.id=p.empty;
    p.feed.replaceChildren(el);state.follow[kind]=true;followButtonUpdate(kind);
  }
  $('enCount').textContent='0 SEGMENTS';$('zhCount').textContent='0 TRANSLATED';$('qaCount').textContent='0 QUESTIONS';
  $('sessionTime').textContent='00:00:00';$('enFoot').textContent='WAITING FOR AUDIO';$('latencyFoot').textContent='—';
}

/* ---------- Class records ----------
   Saved by the local server to Documents/EchoTranslate-Records on this computer only (never uploaded,
   never shared with other installs). Autosaves every few seconds; nothing is deleted automatically. */
const RESUME_WITHIN_MS=3*3600*1000;
function newSessionId(){
  const d=new Date(),p=n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${Math.random().toString(36).slice(2,6)}`;
}
const DRAFT_PREFIX='ct-record-draft:';
function hasSessionContent(){return state.rows.length||state.transcriptArchive.length||state.notes.length||state.qa.length}
function ensureSession(){if(!state.sessionId){state.sessionId=newSessionId();state.sessionStarted=Date.now()}}
function cacheSessionDraft(){
  if(state.isDemoSession||state.restoring||!hasSessionContent())return;
  ensureSession();
  // A browser-side copy is only a backup for the server save (which reports its own failures); very long classes can
  // exceed browser storage, so a failed backup is not shown as an error during class.
  try{localStorage.setItem(DRAFT_PREFIX+state.sessionId,JSON.stringify({...sessionSnapshot(),id:state.sessionId,clientSavedAt:Date.now()}));state.draftError=false}
  catch(e){state.draftError=true;console.warn('record backup copy skipped:',e)}
}
/* Marks the record as changed. The heavy work (serialising the whole class, writing the backup copy, saving to the
   server) happens in the periodic save below — never per word, so long lectures do not slow the live subtitles. */
function markDirty(){if(!state.isDemoSession&&!state.restoring)state.dirty=true}

const stripUi=({fresh,changed,...rest})=>rest;
const rowRecord=r=>({id:r.id,num:r.num,time:r.time,raw:r.raw,en:r.en,para:r.para,fixes:r.fixes,final:r.final,reviewed:r.reviewed,dropped:r.dropped});
const paraRecord=p=>({id:p.id,rows:p.rows,zh:p.zh,zhFor:p.zhFor,zhBy:p.zhBy,reviewedFor:p.reviewedFor,time:p.time});
function sessionSnapshot(){
  return {app:'Echo Translate',version:3,subject:els.subject.value,domain:els.domain.value,language:els.language.value,
    startedAt:state.sessionStarted,idSeq:state.idSeq,
    // lines cleared from the screen with 「清空字幕」, kept in the record
    transcriptArchive:state.transcriptArchive,parasArchive:state.parasArchive,
    transcript:state.rows.map(rowRecord),paras:state.paras.map(paraRecord),
    notes:state.notes.map(stripUi),notesArchive:state.notesArchive.map(stripUi),
    questions:state.qa.map(stripUi),qaArchive:state.qaArchive.map(stripUi)};
}
async function saveSession(force=false){
  if(state.saving){await state.savePromise;if(force&&state.dirty)return saveSession(true);return}
  if(state.isDemoSession||state.restoring||(!state.dirty&&!force)||!hasSessionContent())return;
  ensureSession();cacheSessionDraft();
  const id=state.sessionId;
  let draft=null;try{draft=localStorage.getItem(DRAFT_PREFIX+id)}catch{}
  // Reuse the backup string only if it was just written successfully; otherwise it may be an older copy.
  const body=(!state.draftError&&draft)||JSON.stringify({...sessionSnapshot(),id,clientSavedAt:Date.now()});
  state.saving=true;state.dirty=false;
  state.savePromise=(async()=>{
    try{
      const resp=await fetch('/api/sessions/'+id,{method:'POST',headers:{'Content-Type':'application/json'},body});
      if(!resp.ok)throw new Error((await resp.json().catch(()=>({}))).error||`HTTP ${resp.status}`);
      state.lastSavedAt=Date.now();state.saveError='';
      // Clear only the exact draft acknowledged; preserve speech arriving during the request.
      try{if(localStorage.getItem(DRAFT_PREFIX+id)===draft)localStorage.removeItem(DRAFT_PREFIX+id)}catch{}
      const chip=$('sessionChip');if(chip)chip.title=`本场记录已自动保存 · ${timeNow()}`;
    }catch(e){
      state.dirty=true;
      if(!state.saveError)toast(`课堂记录暂时没能保存：${e.message||e}（会自动重试）`,true);
      state.saveError=String(e.message||e);
    }finally{state.saving=false}
  })();
  await state.savePromise;
}
setInterval(()=>saveSession(),2000);
window.addEventListener('pagehide',()=>{cacheSessionDraft()});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){cacheSessionDraft();saveSession()}});
async function recoverSessionDrafts(){
  let keys=[];
  try{keys=Object.keys(localStorage).filter(k=>k.startsWith(DRAFT_PREFIX))}catch{return}
  for(const key of keys){
    const raw=localStorage.getItem(key);
    try{
      const data=JSON.parse(raw);if(!data.id||!key.endsWith(data.id))continue;
      const existing=await fetch('/api/sessions/'+encodeURIComponent(data.id));
      if(existing.ok){const saved=await existing.json();if(saved.clientSavedAt&&saved.clientSavedAt>=data.clientSavedAt){localStorage.removeItem(key);continue}}
      else if(existing.status!==404)throw new Error(`HTTP ${existing.status}`);
      const resp=await fetch('/api/sessions/'+encodeURIComponent(data.id),{method:'POST',headers:{'Content-Type':'application/json'},body:raw});
      if(!resp.ok)throw new Error(`HTTP ${resp.status}`);
      if(localStorage.getItem(key)===raw)localStorage.removeItem(key);
    }catch(e){toast('上次课堂的恢复副本仍保存在此浏览器中；本地服务恢复后刷新即可补存。',true)}
  }
}
function restoreSession(data){
  state.restoring=true;
  state.sessionId=data.id;state.sessionStarted=data.startedAt||Date.now();state.isDemoSession=false;
  if(data.subject)els.subject.value=data.subject;
  if(data.domain&&[...els.domain.options].some(o=>o.value===data.domain))els.domain.value=data.domain;
  const legacy=[];   // records saved before paragraph translation kept Chinese per fragment
  for(const r of data.transcript||[]){
    if(!r||!r.id||state.rowMap.has(r.id))continue;
    const row={id:r.id,num:state.rows.length+1,time:r.time||'',raw:r.raw||r.en||'',en:r.en||'',dropped:!!r.dropped,
      fixes:r.fixes||[],final:r.final!==false,reviewed:!!r.reviewed,updated:0,version:1,firstSeen:0,source:'record'};
    state.rowMap.set(row.id,row);state.rows.push(row);legacy.push([row,r.zh||'']);
  }
  if(Array.isArray(data.paras)&&data.paras.length){
    for(const sp of data.paras){
      const p={id:sp.id,rows:(sp.rows||[]).filter(id=>state.rowMap.has(id)),zh:sp.zh||'',zhFor:sp.zhFor||'',zhBy:sp.zhBy||'',reviewedFor:sp.reviewedFor||'',time:sp.time||''};
      if(!p.rows.length||state.paraMap.has(p.id))continue;
      state.paras.push(p);state.paraMap.set(p.id,p);for(const id of p.rows)getRow(id).para=p.id;
    }
  }
  for(const [row] of legacy)if(!row.para)assignPara(row);
  for(const p of state.paras){
    if(!p.zh){const parts=legacy.filter(([row])=>row.para===p.id).map(([,zh])=>zh).filter(Boolean);if(parts.length){p.zh=parts.join('');p.zhFor=paraEnglish(p)}}
  }
  for(const row of state.rows)setRowText(row);
  for(const p of state.paras)if(paraEnglish(p)&&p.zhFor!==paraEnglish(p))queueParaTranslation(p,true);   // finish missing ones
  state.transcriptArchive=Array.isArray(data.transcriptArchive)?data.transcriptArchive:[];
  state.parasArchive=Array.isArray(data.parasArchive)?data.parasArchive:[];
  const created=(x,i)=>({...x,created:x.created||i});
  state.notes=(data.notes||[]).map(created);state.notesArchive=data.notesArchive||[];
  state.qa=(data.questions||[]).map(created);state.qaArchive=data.qaArchive||[];
  const ids=[...state.notes,...state.notesArchive,...state.qa,...state.qaArchive].map(x=>Number(String(x.id||'').slice(1))||0);
  state.idSeq=Math.max(Number(data.idSeq)||0,...ids,0);
  renderList('note');renderList('qa');
  for(const k of Object.keys(panelInfo)){state.follow[k]=true;panelAutoScroll(k,true)}
  state.dirty=false;state.restoring=false;
}
async function openSession(id){
  if(id===state.sessionId){showHistory(false);return}
  try{
    await saveSession(true);
    const resp=await fetch('/api/sessions/'+encodeURIComponent(id));const data=await resp.json();
    if(!resp.ok)throw new Error(data.error||`HTTP ${resp.status}`);
    clearView();restoreSession(data);showHistory(false);
    toast(`已打开 ${formatStamp(data.startedAt)} 的课堂记录。继续收音会接着记在这场里。`);
  }catch(e){toast('打开记录失败：'+(e.message||e),true)}
}
async function startNewSession(announce=true){
  await saveSession(true);
  clearView();state.sessionId=null;state.sessionStarted=null;state.isDemoSession=false;state.dirty=false;
  if($('sessionChip'))$('sessionChip').title='';
  if(announce)toast('已开始新课堂。上一场的记录已保存，可在「记录」里随时查看。');
}
function formatStamp(ms){
  if(!ms)return '—';const d=new Date(ms),p=n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
async function showHistory(show){
  $('historyOverlay').hidden=!show;if(!show)return;
  const list=$('historyList');list.replaceChildren();
  const loading=document.createElement('p');loading.className='history-empty';loading.textContent='正在读取…';list.append(loading);
  try{
    await saveSession();
    const data=await (await fetch('/api/sessions')).json();
    $('recordsDir').textContent=`保存位置（仅本机）：${data.recordsDir}`;
    const items=(data.sessions||[]).map(s=>{
      const item=document.createElement('div');item.className='history-item';if(s.id===state.sessionId)item.classList.add('current');
      const body=document.createElement('div');body.className='history-body';
      const title=document.createElement('b');title.textContent=`${formatStamp(s.startedAt)}  ${s.subject||'未命名课程'}`;
      const meta=document.createElement('span');meta.className='history-meta';
      meta.textContent=`${s.segments} 段字幕 · ${s.notes} 条重点 · ${s.questions} 个问题 · 最后更新 ${formatStamp(s.updatedAt)}`;
      const preview=document.createElement('span');preview.className='history-preview';preview.textContent=s.preview||'';
      body.append(title,meta,preview);
      const btn=document.createElement('button');btn.className='button secondary small';
      btn.textContent=s.id===state.sessionId?'当前':'打开';btn.disabled=s.id===state.sessionId;
      btn.addEventListener('click',()=>openSession(s.id));
      item.append(body,btn);return item;
    });
    if(!items.length){const empty=document.createElement('p');empty.className='history-empty';empty.textContent='还没有保存的课堂。开始收音后会自动保存。';items.push(empty)}
    list.replaceChildren(...items);
  }catch(e){loading.textContent='读取记录失败：'+(e.message||e)}
}
$('historyBtn').addEventListener('click',()=>showHistory(true));
$('historyClose').addEventListener('click',()=>showHistory(false));
$('historyOverlay').addEventListener('click',e=>{if(e.target.id==='historyOverlay')showHistory(false)});
$('openHistoryBtn').addEventListener('click',()=>{showSettings(false);showHistory(true)});
$('newSessionBtn').addEventListener('click',async()=>{
  if(state.running&&!confirm('正在收音。确定结束这一场并开始新课堂吗？（当前记录会保存）'))return;
  await startNewSession();showHistory(false);
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('historyOverlay').hidden)showHistory(false)});
async function resumeLatest(){
  try{
    await recoverSessionDrafts();
    const data=await (await fetch('/api/sessions')).json();
    const last=data.sessions?.[0];
    if(!last||Date.now()-last.updatedAt>RESUME_WITHIN_MS||state.rows.length||state.demoMode)return;
    const full=await (await fetch('/api/sessions/'+encodeURIComponent(last.id))).json();
    if(state.rows.length||state.demoMode)return;
    restoreSession(full);
    toast(`已恢复刚才的课堂记录（${formatStamp(last.startedAt)}）。要换新课，点「记录」→「开始新课堂」。`);
  }catch(e){toast('无法读取本机课堂记录，请检查本地服务是否已更新并正在运行。',true)}
}

function stopDemo(){for(const t of state.demoTimers)clearTimeout(t);state.demoTimers=[];state.demoMode=false;$('demoBtn').textContent='演示'}
$('demoBtn').addEventListener('click',async()=>{
  if(state.running){toast('请先停止麦克风，再使用演示功能。');return}
  if(state.demoMode){stopDemo();return}
  showSettings(false);
  // The demo runs on an empty, unsaved screen; the real record is saved first and stays in 记录.
  await startNewSession(false);state.isDemoSession=true;
  state.demoMode=true;$('demoBtn').textContent='停止演示';
  toast('演示模式：以下是模拟课堂文字和模拟翻译，不会保存到课堂记录。');
  if(!state.startAt)state.startAt=Date.now();
  samplePairs.forEach(([en,zh],i)=>{
    state.demoTimers.push(setTimeout(()=>{
      const id=`demo-${Date.now()}-${i}`;
      const partial=en.slice(0,Math.max(16,Math.floor(en.length/2)));
      insertSpeech(id,partial,false);
      state.demoTimers.push(setTimeout(()=>{
        insertSpeech(id,en,true);const row=getRow(id);
        if(row){
          // The demo carries its own Chinese, joined per paragraph like real translations.
          (state.demoZh||=new Map()).set(row.id,zh);const p=paraOf(row);
          p.zh=paraRows(p).map(r=>state.demoZh.get(r.id)||'').join('');p.zhFor=paraEnglish(p);p.zhBy='demo';renderParaZh(p);
        }
        if(i===samplePairs.length-1){
          reconcileNotes([
            {id:'new',en:'Risk is uncertain and may still happen; an issue has already occurred and needs a response now.',zh:'风险尚未发生且具有不确定性；问题已经发生，需要立即应对。',importance:5},
            {id:'new',en:'A delay on the critical path delays the whole project unless float is available.',zh:'关键路径上的延误会使整个项目延期，除非存在可用的浮动时间。',importance:5},
            {id:'new',en:'Scope creep = uncontrolled scope changes made without reviewing time and cost impact.',zh:'范围蔓延＝未评估时间与成本影响就发生的失控范围变更。',importance:4},
            {id:'new',en:'A project charter authorizes the project and gives the PM authority over resources.',zh:'项目章程正式批准项目，并赋予项目经理调用资源的权限。',importance:3},
          ],[],'rules');
          reconcileQa([
            {id:'new',q:'An activity off the critical path slips by 3 days. When does this delay the project, and how would you respond differently to the same event as a risk vs. an issue?',a:'Only if the slip exceeds that activity’s total float, which would make it critical. Before it happens it is a risk (plan a response, e.g. buffer or fast-tracking); once it has happened it is an issue to resolve and escalate now.'},
            {id:'new',q:'Why does scope creep threaten the critical path even when each change looks small?',a:'Unreviewed changes add work to activities without re-baselining time and cost; if any falls on a critical activity, or consumes float, the finish date moves.'},
          ],'rules');
          stopDemo();
        }
      },650));
    },i*1800));
  });
});

/* ---------- Theme: day (mint/white) before 16:00, night (grey-purple/pink) after ----------
   A manual toggle is remembered only until the next scheduled switch (16:00 or midnight). */
const THEME_KEY='ct-theme-override',SWITCH_HOUR=16;
const scheduledTheme=(d=new Date())=>d.getHours()<SWITCH_HOUR?'day':'night';
function nextSwitchAt(d=new Date()){
  const n=new Date(d);
  if(d.getHours()<SWITCH_HOUR)n.setHours(SWITCH_HOUR,0,0,0);else{n.setDate(n.getDate()+1);n.setHours(0,0,0,0)}
  return n.getTime();
}
let themeMemo=null; // fallback when browser storage is unavailable
function themeOverride(){
  let o=themeMemo;
  try{o=JSON.parse(localStorage.getItem(THEME_KEY)||'null')||themeMemo}catch{}
  if(o&&o.until>Date.now())return o.theme;
  themeMemo=null;try{localStorage.removeItem(THEME_KEY)}catch{}
  return null;
}
function applyTheme(){
  const theme=themeOverride()||scheduledTheme();
  document.documentElement.dataset.theme=theme;
  const btn=$('themeBtn');
  if(btn){btn.textContent=theme==='day'?'☾':'☀';btn.setAttribute('aria-label',theme==='day'?'切换到夜间配色':'切换到日间配色');btn.title=`切换配色（当前：${theme==='day'?'日间':'夜间'}；每天 16:00 自动切换，手动选择保持到下一个切换点）`}
}
$('themeBtn').addEventListener('click',()=>{
  const next=document.documentElement.dataset.theme==='day'?'night':'day';
  themeMemo=next===scheduledTheme()?null:{theme:next,until:nextSwitchAt()};
  try{if(themeMemo)localStorage.setItem(THEME_KEY,JSON.stringify(themeMemo));else localStorage.removeItem(THEME_KEY)}catch{}
  applyTheme();
});
applyTheme();setInterval(applyTheme,30000);

/* ---------- Frame art: a lit water surface ----------
   The texture itself is an SVG filter in index.html (smooth noise lit like rippling water; colours follow the
   theme tokens). Here we only size it to the window and mask it to the outer frame, so it never sits behind a
   panel and fades out softly before the gaps between panels. Static: re-sized on resize only. */
function drawWaterArt(){
  const svg=$('waterArt');if(!svg)return;
  const W=window.innerWidth,H=window.innerHeight;
  const F=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--frame'))||0;
  svg.style.display=F<16||W<700?'none':'block';
  if(svg.style.display==='none')return;
  svg.setAttribute('viewBox',`0 0 ${W} ${H}`);
  const set=(id,attrs)=>{const el=$(id);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,v)};
  // Filter region extends past the window so the lighting has no bevel at the screen edge.
  set('waterFx',{x:-60,y:-60,width:W+120,height:H+120});set('waterMask',{width:W,height:H});
  set('waterMaskOuter',{width:W,height:H});set('waterSurface',{x:-60,y:-60,width:W+120,height:H+120});
  set('waterMaskInner',{x:F,y:F,width:Math.max(0,W-2*F),height:Math.max(0,H-2*F)});
  set('waterTint',{x1:0,y1:0,x2:W,y2:H});
}
let waterTimer=null;
window.addEventListener('resize',()=>{clearTimeout(waterTimer);waterTimer=setTimeout(drawWaterArt,150)});
drawWaterArt();

// Initialize without recording, downloading models, or requesting microphone permission.
window.addEventListener('load',()=>{
  Object.keys(panelInfo).forEach(followButtonUpdate);
  refreshEnvironment();
  els.translatorStatus.textContent=typeof window.Translator!=='undefined'?'支持 Chrome 本地翻译 · 点击启动':'当前浏览器缺少 Translator API';
  $('sourceNote').textContent='SOURCE · CHROME SPEECH';
  $('modelNote').textContent='TRANSLATE · ON-DEVICE PREFERRED';
  setAnalysisFoot('heuristic','DETECTING');
  resumeLatest();
});
