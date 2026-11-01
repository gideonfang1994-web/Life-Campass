/**
 * 浏览器端 AI 接入链路综合验收 —— CDP 版（替代 agent-browser）
 *
 * 背景：agent-browser 在本机沙箱内完全不可用（socket 目录不可写），
 * 但无头 Edge 可以正常启动。于是直接用 Chrome DevTools Protocol 驱动，
 * 能力等价于 agent-browser eval，且不依赖任何第三方包（Node 22 自带 WebSocket）。
 *
 * 用法：
 *   1) node tools/mock-llm-server.mjs &          # 8791
 *   2) node tools/e2e-cdp.mjs [htmlPath]         # 自行拉起 Edge 并跑完 7 组断言
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const MOCK = 'http://localhost:8791';
const CDP_PORT = 9333;
const EDGE =
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

// ---------- 定位产物 ----------
const CANDIDATES = ['../LifeCompass.html', 'LifeCompass.html', '../dist/LifeCompass.html'];
let htmlFile = process.argv[2] ? path.resolve(process.argv[2]) : null;
if (!htmlFile) {
  for (const rel of CANDIDATES) {
    const abs = path.resolve(process.cwd(), rel);
    if (fs.existsSync(abs)) { htmlFile = abs; break; }
  }
}
if (!htmlFile || !fs.existsSync(htmlFile)) {
  console.error('未找到 LifeCompass.html，已尝试：\n  ' + CANDIDATES.join('\n  '));
  process.exit(1);
}
const fileUrl = 'file:///' + htmlFile.replace(/\\/g, '/');

// ---------- 冒烟：mock 是否在线 ----------
async function mockUp() {
  try {
    const r = await fetch(`${MOCK}/__last`, { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch { return false; }
}
if (!(await mockUp())) {
  console.error('mock-llm-server 未在 8791 运行，请先执行：node tools/mock-llm-server.mjs');
  process.exit(1);
}

// ---------- 启动无头 Edge（带远程调试） ----------
const userDataDir = path.resolve(os.tmpdir(), 'lc-cdp-profile').replace(/\\/g, '/');
fs.rmSync(userDataDir, { recursive: true, force: true });
fs.mkdirSync(userDataDir, { recursive: true });

const edge = spawn(
  EDGE,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--hide-scrollbars',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--window-size=1440,900',
    '--allow-file-access-from-files',
    'about:blank',
  ],
  { stdio: ['ignore', 'ignore', 'ignore'], detached: false }
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitCdp() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`, {
        signal: AbortSignal.timeout(1000),
      });
      if (r.ok) return true;
    } catch { /* not ready */ }
    await sleep(250);
  }
  return false;
}

// ---------- 极简 CDP 客户端 ----------
class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    });
  }
  send(method, params = {}, timeoutMs = 60000) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP 超时: ${method}`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
}

async function connect() {
  // 复用已存在的 page target
  const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
  const page = list.find((t) => t.type === 'page');
  if (!page) throw new Error('未找到 page target');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error('WebSocket 连接失败')), { once: true });
  });
  return new CDP(ws);
}

/** 在页面里求值；表达式返回 Promise 时自动 await */
async function evaluate(expr, timeoutMs = 60000) {
  const res = await cdp.send(
    'Runtime.evaluate',
    { expression: expr, awaitPromise: true, returnByValue: true, userGesture: true },
    timeoutMs
  );
  if (res.exceptionDetails) {
    const d = res.exceptionDetails;
    throw new Error(d.exception?.description || d.text || '页面求值异常');
  }
  const v = res.result?.value;
  return typeof v === 'string' ? v : JSON.stringify(v);
}

// ---------- 断言 ----------
let pass = 0;
let fail = 0;
const failures = [];

function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`✅ ${name}${detail ? ' —— ' + detail : ''}`); }
  else { fail++; failures.push(name); console.log(`❌ ${name}${detail ? ' —— ' + detail : ''}`); }
}

/** 解析页面返回的 JSON 字符串（可能被二次编码） */
function parseMaybe(v) {
  let cur = v;
  for (let i = 0; i < 3; i++) {
    if (typeof cur !== 'string') break;
    const s = cur.trim();
    if (!s.startsWith('{') && !s.startsWith('[')) break;
    try { cur = JSON.parse(s); } catch { break; }
  }
  return cur;
}

async function reset() { await fetch(`${MOCK}/__reset`, { method: 'POST' }); }
async function last() { return (await fetch(`${MOCK}/__last`)).json(); }
async function setCfg(obj) {
  return evaluate(`window.LifeCompassAI.setConfig(${obj === null ? 'null' : JSON.stringify(obj)}); "ok";`);
}

/** 分组标题 */
function group(n, title) {
  console.log(`\n════════ ${n}/7 ${title} ════════`);
}

// ---------- 主流程 ----------
let cdp;
try {
  if (!(await waitCdp())) throw new Error('CDP 端口未就绪');
  cdp = await connect();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Page.navigate', { url: fileUrl });

  // 等页面真正就绪（LifeCompassAI 挂载完成）
  let ready = false;
  for (let i = 0; i < 120; i++) {
    await sleep(250);
    try {
      const ok = await evaluate(
        `!!(window.LifeCompassAI && document.querySelector('#root') && document.querySelector('#root').children.length)`,
        5000
      );
      if (ok === 'true' || ok === true) { ready = true; break; }
    } catch { /* 页面还在加载 */ }
  }
  if (!ready) throw new Error('页面 30 秒内未就绪（LifeCompassAI 未挂载）');
  console.log(`校验目标：${htmlFile}`);
  console.log('页面已就绪，开始 7 组断言\n');

  // ===== 1. Gemini 非流式 =====
  group(1, 'Gemini 原生 · 非流式（analyze-project, T=0.6）');
  await reset();
  await setCfg({ provider: 'gemini', baseUrl: `${MOCK}/v1beta`, model: 'gemini-3.8-flash', apiKey: 'k-gemini', jsonMode: true });
  let R = parseMaybe(await evaluate(`(async function(){
    const res = await fetch('/api/coach/analyze-project', {method:'POST',headers:{'Content-Type':'application/json'},
      body: JSON.stringify({project:{title:'测试项目',category:'career',fiveYearVision:'独立开发者'},userLogs:[{date:'2026-10-30',highlight:'写代码',energyLevel:4}]})});
    const t = await res.text();
    return JSON.stringify({s:res.status, n:t.length});
  })()`));
  let req = await last() || {};
  check('gemini 非流式协议/温度',
    req.protocol === 'gemini' && req.stream === false && req.temperature === 0.6,
    `proto=${req.protocol} stream=${req.stream} temp=${req.temperature}`);
  check('  └ 响应非空（200）', R.s === 200 && R.n > 40, `status=${R.s} len=${R.n}`);
  check('  └ systemInstruction 与 server.ts 一致',
    String(req.systemPreview || '').includes('资深的人生项目督导专家'),
    String(req.systemPreview || '').slice(0, 22) + '…');
  check('  └ API Key 走 query 参数', req.key === 'k-gemini', `key=${req.key}`);

  // ===== 2. Gemini 流式 =====
  group(2, 'Gemini 原生 · 流式（chat, T=0.7, SSE）');
  await reset();
  R = parseMaybe(await evaluate(`(async function(){
    const res = await fetch('/api/coach/chat',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({messages:[{role:'user',content:'我总拖延怎么办'}],persona:'strategic',context:{projects:[],logs:[]}})});
    const ct = res.headers.get('content-type');
    const rd = res.body.getReader(); const dec = new TextDecoder();
    let buf='', chunks=0, text='', done=false;
    for(;;){ const x = await rd.read(); if (x.done) break;
      buf += dec.decode(x.value,{stream:true});
      const ps = buf.split('\\n\\n'); buf = ps.pop() || '';
      for (const p of ps){ const t = p.trim(); if (t.startsWith('data: ')){ const ds = t.slice(6);
        if (ds === '[DONE]'){ done = true; continue; }
        try { const j = JSON.parse(ds); if (j.text){ chunks++; text += j.text; } } catch(e){}
      } } }
    return JSON.stringify({s:res.status, ct:ct, chunks:chunks, done:done, len:text.length});
  })()`));
  req = await last() || {};
  check('gemini 流式协议/温度',
    req.protocol === 'gemini' && req.stream === true && req.temperature === 0.7,
    `proto=${req.protocol} stream=${req.stream} temp=${req.temperature}`);
  check('  └ SSE 协议与收尾', R.s === 200 && String(R.ct).includes('text/event-stream') && R.chunks > 0 && R.done === true,
    `ct=${R.ct} chunks=${R.chunks} done=${R.done} len=${R.len}`);

  // ===== 3. OpenAI 兼容 非流式 =====
  group(3, 'OpenAI 兼容 · 非流式（autofill, T=0.6, JSON 模式）');
  await reset();
  await setCfg({ provider: 'openai', baseUrl: `${MOCK}/v1`, model: 'deepseek-v4-flash', apiKey: 'sk-test', jsonMode: true });
  R = parseMaybe(await evaluate(`(async function(){
    const res = await fetch('/api/ai/autofill',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({type:'daily_log',context:{projects:[{title:'测试项目',progress:40}],recentLogs:[]}})});
    const t = await res.text();
    return JSON.stringify({s:res.status, n:t.length, hasHighlight:t.indexOf('highlight')>=0});
  })()`));
  req = await last() || {};
  check('openai 非流式协议/温度/JSON 模式',
    req.protocol === 'openai' && req.stream === false && req.temperature === 0.6 && req.responseFormat === 'json_object',
    `proto=${req.protocol} temp=${req.temperature} rf=${req.responseFormat}`);
  check('  └ 严格 JSON 返回', R.s === 200 && R.n > 40 && R.hasHighlight === true, `status=${R.s} len=${R.n}`);
  check('  └ Authorization 头正确', req.auth === 'Bearer sk-test', `auth=${req.auth}`);

  // ===== 4. OpenAI 兼容 流式 =====
  group(4, 'OpenAI 兼容 · 流式（goal-consultation-chat, T=0.7）');
  await reset();
  R = parseMaybe(await evaluate(`(async function(){
    const res = await fetch('/api/coach/goal-consultation-chat',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({messages:[{role:'user',content:'我想5年做到年入百万'}],context:{}})});
    const ct = res.headers.get('content-type');
    const rd = res.body.getReader(); const dec = new TextDecoder();
    let buf='', chunks=0, text='', done=false;
    for(;;){ const x = await rd.read(); if (x.done) break;
      buf += dec.decode(x.value,{stream:true});
      const ps = buf.split('\\n\\n'); buf = ps.pop() || '';
      for (const p of ps){ const t = p.trim(); if (t.startsWith('data: ')){ const ds = t.slice(6);
        if (ds === '[DONE]'){ done = true; continue; }
        try { const j = JSON.parse(ds); if (j.text){ chunks++; text += j.text; } } catch(e){}
      } } }
    return JSON.stringify({s:res.status, ct:ct, chunks:chunks, done:done, len:text.length});
  })()`));
  req = await last() || {};
  check('openai 流式协议/温度',
    req.protocol === 'openai' && req.stream === true && req.temperature === 0.7,
    `proto=${req.protocol} stream=${req.stream} temp=${req.temperature}`);
  check('  └ SSE 协议与收尾', R.s === 200 && String(R.ct).includes('text/event-stream') && R.chunks > 0 && R.done === true,
    `ct=${R.ct} chunks=${R.chunks} done=${R.done}`);

  // ===== 5. 健壮性 =====
  group(5, '健壮性：字段缺失不抛错（Proxy 容错作用域）');
  await reset();
  await setCfg({ provider: 'gemini', baseUrl: `${MOCK}/v1beta`, model: 'gemini-3.8-flash', apiKey: 'k-gemini', jsonMode: true });
  R = parseMaybe(await evaluate(`(async function(){
    try {
      const res = await fetch('/api/coach/analyze-project',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({project:{title:'极简'}})});
      const t = await res.text();
      return JSON.stringify({s:res.status, n:t.length, err:null});
    } catch(e){ return JSON.stringify({s:-1, n:0, err:e.message}); }
  })()`));
  check('字段缺失仍返回 200', R.s === 200 && R.n > 20 && !R.err, `status=${R.s} len=${R.n} err=${R.err}`);
  req = await last() || {};
  check('  └ prompt 照常渲染（缺失字段→undefined）',
    req.protocol === 'gemini' && String(req.systemPreview || '').length + String(req.userPreview || '').length > 300,
    `sysLen=${String(req.systemPreview || '').length} userLen=${String(req.userPreview || '').length}`);

  // ===== 6. 降级 =====
  group(6, '降级：清除配置后回退离线演示');
  await setCfg(null);
  R = parseMaybe(await evaluate(`(async function(){
    const res = await fetch('/api/coach/smart-breakdown',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({goalTitle:'三个月学会吉他', wheelScores:{career:7}})});
    const t = await res.text();
    return JSON.stringify({s:res.status, n:t.length, head:t.slice(0,60), enabled:window.LifeCompassAI.enabled()});
  })()`));
  check('离线降级可用', R.s === 200 && R.n > 100 && R.enabled === false, `status=${R.s} len=${R.n} enabled=${R.enabled}`);

  // ===== 7. 无 Key 场景 =====
  group(7, '无 Key 场景：OpenAI 兼容（Ollama / 内网网关）');
  await reset();
  R = parseMaybe(await evaluate(`(function(){
    window.LifeCompassAI.setConfig({provider:'openai',baseUrl:'${MOCK}/v1',model:'llama3.1',apiKey:'',jsonMode:false});
    const c = window.LifeCompassAI.getConfig();
    return JSON.stringify({enabled:window.LifeCompassAI.enabled(), hasCfg:!!c, model:c&&c.model});
  })()`));
  check('无 Key 配置被正确识别为已启用',
    R.enabled === true && R.hasCfg === true && R.model === 'llama3.1',
    `enabled=${R.enabled} model=${R.model}`);
  R = parseMaybe(await evaluate(`(async function(){
    const res = await fetch('/api/coach/analyze-project',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({project:{title:'英文三字经小程序',progress:62},userLogs:[]})});
    const t = await res.text();
    return JSON.stringify({s:res.status, n:t.length});
  })()`));
  check('  └ 无 Key 也能正常请求', R.s === 200 && R.n > 20, `status=${R.s} len=${R.n}`);
  req = await last() || {};
  check('  └ 未发送 Authorization 头',
    req.protocol === 'openai' && req.auth === null && req.model === 'llama3.1',
    `auth=${req.auth} model=${req.model}`);

  // ===== 汇总 =====
  console.log('\n════════════════════════════════════════');
  console.log(`  通过 ${pass} 项 / 失败 ${fail} 项`);
  if (fail) console.log('  失败项：\n   - ' + failures.join('\n   - '));
  console.log('════════════════════════════════════════');
} catch (e) {
  console.error('\n[E2E 异常] ' + (e && e.message ? e.message : e));
  fail++;
} finally {
  try { cdp && cdp.ws.close(); } catch { /* ignore */ }
  try { edge.kill('SIGKILL'); } catch { /* ignore */ }
  await sleep(500);
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch { /* ignore */ }
}

process.exit(fail === 0 ? 0 : 1);
