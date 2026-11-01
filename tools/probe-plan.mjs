/**
 * 计划板 DOM 探针：查看各周期层的节点数与展开按钮情况
 *
 * 运行：node tools/probe-plan.mjs ..
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';

const ROOT = path.resolve(process.argv[2] || '..');
const HTML = path.join(ROOT, 'LifeCompass.html');

if (!fs.existsSync(HTML)) { console.error('找不到产物：' + HTML); process.exit(1); }
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
if (!BROWSER) { console.error('未找到 Edge/Chrome'); process.exit(1); }

let msgId = 0; const pending = new Map(); let ws = null;
function send(method, params = {}) {
  const id = ++msgId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error('CDP 超时: ' + method)); } }, 30000);
  });
}
async function evalJs(expr) {
  const r = await send('Runtime.evaluate', {
    expression: `(async () => { ${expr} })()`, returnByValue: true, awaitPromise: true, userGesture: true,
  });
  if (r.exceptionDetails) return { __err: r.exceptionDetails.exception?.description || r.exceptionDetails.text };
  const v = r.result?.value;
  if (v === undefined) return { __err: 'no value' };
  if (typeof v === 'object' && v !== null) return v;
  try { return JSON.parse(v); } catch { return v; }
}

const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-plan-'));
const port = 9400 + Math.floor(Math.random() * 300);
const child = spawn(BROWSER, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', '--disable-extensions', '--allow-file-access-from-files',
  `--remote-debugging-port=${port}`, `--user-data-dir=${profileDir}`,
  '--window-size=1440,1000', 'about:blank',
], { stdio: 'ignore', detached: false });
function cleanup() { try { child.kill(); } catch {} try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch {} }
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(1); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  for (let i = 0; i < 60; i++) {
    try { const res = await fetch(`http://127.0.0.1:${port}/json/version`); if (res.ok) break; } catch {}
    await sleep(250);
  }
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const target = list.find((t) => t.type === 'page') || list[0];
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result);
    }
  });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: 'file:///' + HTML.replace(/\\/g, '/') });
  for (let i = 0; i < 120; i++) {
    const r = await evalJs(`return { tabs: document.querySelectorAll('nav button').length }`);
    if (r && !r.__err && r.tabs >= 10) break;
    await sleep(250);
  }
  await sleep(700);

  // 切到计划板
  await evalJs(`
    const navs = Array.from(document.querySelectorAll('nav'));
    const mobile = navs.find(n => (n.getAttribute('aria-label')||'').includes('移动端'));
    const desktop = navs.find(n => n !== mobile);
    const b = Array.from(desktop.querySelectorAll('button')).find(x => x.innerText.includes('日周月年'));
    if (b) b.click();
    return true;
  `);
  await sleep(1200);

  const out = await evalJs(`
    const cycles = ['year','quarter','month','week','day'];
    const res = {};
    res.initialCycleTabs = Array.from(document.querySelectorAll('[data-testid="plan-cycle-tab"]')).map(t => ({
      cycle: t.getAttribute('data-cycle'),
      active: t.getAttribute('data-active'),
      text: t.innerText.trim()
    }));
    for (const c of cycles) {
      const tab = document.querySelector('[data-testid="plan-cycle-tab"][data-cycle="' + c + '"]');
      if (tab) { tab.click(); await new Promise(r => setTimeout(r, 800)); }
      const nodes = Array.from(document.querySelectorAll('[data-testid="plan-node"]'));
      const toggles = Array.from(document.querySelectorAll('button[data-node-toggle]'));
      res[c] = {
        nodeCount: nodes.length,
        toggleCount: toggles.length,
        togglesWithChildren: toggles.filter(b => b.getAttribute('title') === '展开/收起下级').length,
        titles: Array.from(new Set(toggles.map(b => b.getAttribute('title')))),
        cycles: nodes.map(n => n.getAttribute('data-node-cycle')),
        childCounts: nodes.map(n => n.getAttribute('data-node-child-count')),
        expandedFlags: toggles.map(b => b.getAttribute('data-expanded')).slice(0, 8)
      };
    }
    return res;
  `);

  console.log(JSON.stringify(out, null, 2));
  cleanup(); process.exit(0);
})().catch((e) => { console.error('失败:', e.message); cleanup(); process.exit(1); });
