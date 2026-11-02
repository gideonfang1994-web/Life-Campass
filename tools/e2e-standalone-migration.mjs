/**
 * 单文件产物（LifeCompass.html）的旧数据迁移端到端验证。
 *
 * 走 CDP 直连无头 Edge，真实加载单文件 HTML：
 *   1. 首次打开 → 让 App 落种子到 localStorage
 *   2. 注入「旧版本」数据（写死的旧周期键 + 用户自己的编辑 + 自建节点）
 *   3. 刷新页面 → 新版应自动执行迁移
 *   4. 断言：周期键按今天重建、版本号升级、用户编辑与自建节点都没丢
 *
 * 运行：node tools/e2e-standalone-migration.mjs ..
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';

const ROOT = path.resolve(process.argv[2] || '..');
const HTML = path.join(ROOT, 'LifeCompass.html');

if (!fs.existsSync(HTML)) {
  console.error('找不到产物：' + HTML);
  process.exit(1);
}

function findEdge() {
  const cands = [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  ];
  for (const c of cands) if (fs.existsSync(c)) return c;
  return null;
}

const BROWSER = findEdge();
if (!BROWSER) {
  console.error('未找到 Edge/Chrome');
  process.exit(1);
}

let msgId = 0;
const pending = new Map();
let ws = null;

function send(method, params = {}) {
  const id = ++msgId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error('CDP 超时: ' + method));
      }
    }, 30000);
  });
}

async function evalJs(expr) {
  const r = await send('Runtime.evaluate', {
    expression: `(async () => { ${expr} })()`,
    returnByValue: true,
    awaitPromise: true,
    userGesture: true,
  });
  if (r.exceptionDetails) {
    const d = r.exceptionDetails;
    return { __err: d.exception?.description || d.text || '页面求值异常' };
  }
  const v = r.result?.value;
  if (v === undefined) return { __err: 'no value' };
  if (typeof v === 'object' && v !== null) return v;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}

const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-migrate-'));
const port = 9700 + Math.floor(Math.random() * 200);

// Edge 启动时会去读 AppData 下的 TokenBroker/缓存目录，沙箱常拦这些路径。
// 把 LOCALAPPDATA / APPDATA / USERPROFILE 重定向到临时目录，绕开真实用户目录。
const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-home-'));
fs.mkdirSync(path.join(fakeHome, 'Local'), { recursive: true });
fs.mkdirSync(path.join(fakeHome, 'Roaming'), { recursive: true });
const childEnv = {
  ...process.env,
  LOCALAPPDATA: path.join(fakeHome, 'Local'),
  APPDATA: path.join(fakeHome, 'Roaming'),
  USERPROFILE: fakeHome,
  HOME: fakeHome,
};

const child = spawn(
  BROWSER,
  [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-sync',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-features=msEdgeSync,EdgeIdentityConsistency,msImplicitSignin',
    '--no-proxy-server',
    '--allow-file-access-from-files',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    '--window-size=1440,1000',
    'about:blank',
  ],
  { stdio: 'ignore', detached: false, env: childEnv }
);

function cleanup() {
  try { child.kill(); } catch {}
  try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch {}
  try { fs.rmSync(fakeHome, { recursive: true, force: true }); } catch {}
}
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(1); });

async function waitForPort() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return await res.json();
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('DevTools 端口未就绪');
}

/** 等 React 挂载 + 种子落到 localStorage */
async function waitForSeed(timeoutMs = 40000) {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < timeoutMs) {
    last = await evalJs(`
      const raw = localStorage.getItem('life_coach_plan_nodes');
      return {
        tabs: document.querySelectorAll('nav button').length,
        body: document.body ? document.body.innerText.length : 0,
        seedLen: raw ? raw.length : 0,
        version: localStorage.getItem('life_coach_plan_seed_version'),
      };
    `);
    if (last && !last.__err && last.seedLen > 100) return last;
    await new Promise((r) => setTimeout(r, 250));
  }
  return last;
}

let pass = 0;
let fail = 0;
const failures = [];

function check(name, cond, detail = '') {
  if (cond) {
    pass++;
    console.log(`  ✅ ${name}${detail ? ' —— ' + detail : ''}`);
  } else {
    fail++;
    failures.push(name + (detail ? ' —— ' + detail : ''));
    console.log(`  ❌ ${name}${detail ? ' —— ' + detail : ''}`);
  }
}

(async () => {
  await waitForPort();

  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const target = list.find((t) => t.type === 'page') || list[0];
  ws = new WebSocket(target.webSocketDebuggerUrl);

  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    }
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: 'file:///' + HTML.replace(/\\/g, '/') });

  console.log('\n════════ 组 1/3：首次打开落种子 ════════');
  const first = await waitForSeed();
  check('页面挂载并落种子', first && !first.__err && first.seedLen > 100, JSON.stringify(first));
  if (!first || first.__err || first.seedLen <= 100) {
    console.log('页面未就绪，退出');
    process.exit(1);
  }

  console.log('\n════════ 组 2/3：注入旧数据 ════════');
  const injected = await evalJs(`
    const raw = localStorage.getItem('life_coach_plan_nodes');
    const nodes = JSON.parse(raw);
    const STALE = { year: '2025', quarter: '2026-Q2', month: '2026-06', week: '2026-W30', day: '2026-06-15' };
    const old = nodes.map((n) => ({
      ...n,
      title: n.cycle === 'month' ? n.title.replace(/^\\d{1,2}\\s*月：/, '6 月：')
           : n.cycle === 'day' ? n.title.replace(/^(\\d{1,2}-\\d{1,2})/, '6-15')
           : n.cycle === 'week' ? n.title.replace(/^第\\s*\\d+\\s*周：/, '第 30 周：')
           : n.cycle === 'quarter' ? n.title.replace(/^第\\s*\\d+\\s*季度/, '第 2 季度')
           : n.title,
      periodKey: STALE[n.cycle] != null ? STALE[n.cycle] : n.periodKey,
    }));
    // 模拟用户自己的编辑
    const edited = old.map((n) => {
      if (n.id === 'pn-m1') {
        return { ...n, title: '我自己写的目标', plannedHours: 99, progress: 42, declaredProgress: 42 };
      }
      return n;
    });
    // 模拟用户自建的节点
    edited.push({ ...old[0], id: 'pn-custom-1', title: '我自己加的节点', cycle: 'day',
                  periodKey: '2026-06-15', parentId: undefined, children: [] });
    localStorage.setItem('life_coach_plan_nodes', JSON.stringify(edited));
    localStorage.removeItem('life_coach_plan_seed_version');
    return { count: edited.length, staleMonth: old.find(n => n.cycle === 'month').periodKey };
  `);
  check('旧数据注入成功', injected && !injected.__err && injected.count > 0, JSON.stringify(injected));
  if (!injected || injected.__err) process.exit(1);

  console.log('\n════════ 组 3/3：刷新后自动迁移 ════════');
  await send('Page.reload', { ignoreCache: true });
  const t0 = Date.now();
  let after = null;
  while (Date.now() - t0 < 40000) {
    after = await evalJs(`
      const nodes = JSON.parse(localStorage.getItem('life_coach_plan_nodes') || '[]');
      const version = localStorage.getItem('life_coach_plan_seed_version');
      const STALE = ['2025', '2026-Q2', '2026-06', '2026-W30', '2026-06-15'];
      const SEED_IDS = new Set(nodes.filter(n => n.id !== 'pn-custom-1').map(n => n.id));
      const seedNodes = nodes.filter(n => n.id !== 'pn-custom-1');
      return {
        version,
        count: nodes.length,
        monthKeys: [...new Set(nodes.filter(n => n.cycle === 'month').map(n => n.periodKey))].sort(),
        weekKeys: [...new Set(nodes.filter(n => n.cycle === 'week').map(n => n.periodKey))].sort(),
        staleCount: seedNodes.filter(n => STALE.includes(n.periodKey)).length,
        staleIds: seedNodes.filter(n => STALE.includes(n.periodKey)).map(n => n.id),
        m1Title: (nodes.find(n => n.id === 'pn-m1') || {}).title,
        m1Hours: (nodes.find(n => n.id === 'pn-m1') || {}).plannedHours,
        m1Progress: (nodes.find(n => n.id === 'pn-m1') || {}).progress,
        customTitle: (nodes.find(n => n.id === 'pn-custom-1') || {}).title,
      };
    `);
    if (after && !after.__err && after.version) break;
    await new Promise((r) => setTimeout(r, 250));
  }

  check('版本号已升级为 2', after && after.version === '2', String(after?.version));
  check('月层周期键已按今天重建', after && !after.monthKeys.includes('2026-06'), after?.monthKeys.join(','));
  check('周层周期键已按今天重建', after && !after.weekKeys.includes('2026-W30'), after?.weekKeys.join(','));
  // 注意：只统计**种子节点**的陈旧键残留。用户自建节点（pn-custom-1）的
  // periodKey 是用户自己的数据，迁移必须原样保留 —— 不能算作"残留"。
  check('种子节点无陈旧周期键残留', after && after.staleCount === 0, `${after?.staleCount} 个残留：${(after?.staleIds || []).join(',')}`);
  check('节点数未丢失（含自建节点）', after && after.count === injected.count, `${after?.count} vs ${injected.count}`);
  check('用户重写的标题保留', after && after.m1Title === '我自己写的目标', after?.m1Title);
  check('用户改的工时保留', after && after.m1Hours === 99, String(after?.m1Hours));
  check('用户改的进度保留', after && after.m1Progress === 42, String(after?.m1Progress));
  check('用户自建节点保留', after && after.customTitle === '我自己加的节点', String(after?.customTitle));

  console.log('\n════════════════════════════════════════');
  console.log(`  通过 ${pass} 项 / 失败 ${fail} 项`);
  if (after) {
    console.log(`  月层周期键: ${after.monthKeys.join(', ')} | 周层: ${after.weekKeys.join(', ')}`);
  }
  console.log('════════════════════════════════════════');
  if (fail > 0) {
    console.log('\n失败明细：');
    failures.forEach((f) => console.log('  - ' + f));
    process.exit(1);
  }
})().catch((e) => {
  console.error(e);
  cleanup();
  process.exit(1);
});
