/**
 * 在浏览器端（agent-browser eval）跑完四条链路的综合验收脚本。
 * 用法：node tools/e2e-ai-check.mjs
 * 前提：mock-llm-server 已在 8791 端口运行，LifeCompass.html 已在 agent-browser 中打开。
 */
import { execFileSync } from 'node:child_process';

const MOCK = 'http://localhost:8791';

function sh(cmd, args) {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/** agent-browser 在 Windows 上是 shell 包装脚本，必须走 shell 才能找到 */
function ab(code) {
  const out = execFileSync('agent-browser eval "$AB_CODE"', [], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
    env: { ...process.env, AB_CODE: code },
  }).trim();
  // agent-browser eval 输出带引号的 JSON 字符串
  try {
    const unquoted = JSON.parse(out);
    return typeof unquoted === 'string' ? unquoted : JSON.stringify(unquoted);
  } catch {
    return out;
  }
}

function reset() {
  sh('curl', ['-s', '-X', 'POST', `${MOCK}/__reset`]);
}
function last() {
  return JSON.parse(sh('curl', ['-s', `${MOCK}/__last`]));
}

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' —— ' + detail : ''}`);
}

// ---------- 1. Gemini 非流式 ----------
reset();
ab(`window.LifeCompassAI.setConfig({provider:'gemini',baseUrl:'${MOCK}/v1beta',model:'gemini-3.8-flash',apiKey:'k-gemini',jsonMode:true});`);
let r = JSON.parse(
  ab(`(async function(){ const res=await fetch('/api/coach/analyze-project',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project:{title:'测试项目',category:'career',fiveYearVision:'独立开发者'},userLogs:[{date:'2026-10-30',highlight:'写代码',energyLevel:4}]})}); const t=await res.text(); return JSON.stringify({s:res.status,n:t.length}); })()`)
);
let req = last();
check(
  'Gemini 非流式（analyze-project）',
  r.s === 200 && req.protocol === 'gemini' && req.stream === false && req.temperature === 0.6,
  `status=${r.s} temp=${req.temperature} stream=${req.stream} promptLen=${(req.userPreview || '').length}`
);
check(
  '  ↳ systemInstruction 与 server.ts 一致',
  (req.systemPreview || '').includes('资深的人生项目督导专家'),
  (req.systemPreview || '').slice(0, 24) + '…'
);

// ---------- 2. Gemini 流式 ----------
reset();
r = JSON.parse(
  ab(`(async function(){ const res=await fetch('/api/coach/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:[{role:'user',content:'我总拖延怎么办'}],persona:'strategic',context:{projects:[],logs:[]}})}); const ct=res.headers.get('content-type'); const rd=res.body.getReader(); const dec=new TextDecoder(); let buf='',chunks=0,text='',done=false; for(;;){const {done:d,value}=await rd.read(); if(d)break; buf+=dec.decode(value,{stream:true}); const ps=buf.split('\\n\\n'); buf=ps.pop()||''; for(const p of ps){const t=p.trim(); if(t.startsWith('data: ')){const ds=t.slice(6); if(ds==='[DONE]'){done=true;continue;} try{const j=JSON.parse(ds); if(j.text){chunks++;text+=j.text;}}catch(e){}}}} return JSON.stringify({s:res.status,ct,chunks,done,len:text.length}); })()`)
);
req = last();
check(
  'Gemini 流式（coach/chat）',
  r.s === 200 && r.ct.includes('event-stream') && r.chunks > 1 && r.done,
  `chunks=${r.chunks} done=${r.done} len=${r.len}`
);
check(
  '  ↳ 人格 systemInstruction 注入',
  req.protocol === 'gemini' && req.stream === true && req.temperature === 0.7 && (req.systemPreview || '').length > 50,
  `temp=${req.temperature} systemLen=${(req.systemPreview || '').length}`
);

// ---------- 3. OpenAI 兼容非流式 ----------
reset();
ab(`window.LifeCompassAI.setConfig({provider:'openai',baseUrl:'${MOCK}/v1',model:'deepseek-v4-flash',apiKey:'sk-test',jsonMode:true});`);
r = JSON.parse(
  ab(`(async function(){ const res=await fetch('/api/ai/autofill',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'daily_log',context:{projects:[{title:'测试项目',progress:40}],recentLogs:[]}})}); const t=await res.text(); return JSON.stringify({s:res.status,n:t.length,hasHighlight:t.includes('highlight')}); })()`)
);
req = last();
check(
  'OpenAI 兼容非流式（autofill/daily_log）',
  r.s === 200 && req.protocol === 'openai' && req.stream === false && req.temperature === 0.6,
  `status=${r.s} temp=${req.temperature} json=${req.responseFormat}`
);
check(
  '  ↳ 分支 prompt 非空',
  (req.userPreview || '').length > 200,
  `promptLen=${(req.userPreview || '').length}`
);

// ---------- 4. OpenAI 兼容流式 ----------
reset();
r = JSON.parse(
  ab(`(async function(){ const res=await fetch('/api/coach/goal-consultation-chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:[{role:'user',content:'我想5年做到年入百万'}],context:{}})}); const ct=res.headers.get('content-type'); const rd=res.body.getReader(); const dec=new TextDecoder(); let buf='',chunks=0,text='',done=false; for(;;){const {done:d,value}=await rd.read(); if(d)break; buf+=dec.decode(value,{stream:true}); const ps=buf.split('\\n\\n'); buf=ps.pop()||''; for(const p of ps){const t=p.trim(); if(t.startsWith('data: ')){const ds=t.slice(6); if(ds==='[DONE]'){done=true;continue;} try{const j=JSON.parse(ds); if(j.text){chunks++;text+=j.text;}}catch(e){}}}} return JSON.stringify({s:res.status,ct,chunks,done,len:text.length}); })()`)
);
req = last();
check(
  'OpenAI 兼容流式（goal-consultation-chat）',
  r.s === 200 && r.ct.includes('event-stream') && r.chunks > 1 && r.done,
  `chunks=${r.chunks} done=${r.done} len=${r.len}`
);
check(
  '  ↳ system 消息含目标上下文',
  req.protocol === 'openai' && req.stream === true && req.temperature === 0.7 && (req.systemPreview || '').length > 100,
  `temp=${req.temperature} systemLen=${(req.systemPreview || '').length}`
);

// ---------- 5. 字段缺失健壮性 ----------
reset();
r = JSON.parse(
  ab(`(async function(){ try{ const res=await fetch('/api/coach/analyze-project',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project:{title:'极简'}})}); const t=await res.text(); return JSON.stringify({s:res.status,ok:t.length>0}); }catch(e){ return JSON.stringify({s:-1,err:e.message}); } })()`)
);
check('字段缺失不抛错（Proxy 作用域）', r.s === 200 && r.ok, `status=${r.s}`);

// ---------- 6. 清除配置后回退降级 ----------
ab(`window.LifeCompassAI.setConfig(null);`);
r = JSON.parse(
  ab(`(async function(){ const res=await fetch('/api/coach/smart-breakdown',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({goalTitle:'三个月学会吉他',wheelScores:{career:7}}) }); const t=await res.text(); return JSON.stringify({s:res.status,n:t.length,body:t.slice(0,80)}); })()`)
);
check('清除配置后回退离线降级', r.s === 200 && r.n > 20, `status=${r.s} len=${r.n}`);

const failed = results.filter((x) => !x.ok);
console.log(`\n合计 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length}`);
process.exit(failed.length === 0 ? 0 : 1);
