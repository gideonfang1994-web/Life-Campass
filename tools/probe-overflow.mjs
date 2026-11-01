/**
 * 溢出源二分实验
 *
 * 在 390px 视口下逐个隐藏候选元素，观察 scrollWidth 是否回落到 clientWidth，
 * 从而定位真正撑宽文档的元素。也可输出「内部溢出」元素（scrollWidth > clientWidth 且 overflowX visible）。
 *
 * 运行：node tools/probe-overflow.mjs ..
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';

const ROOT = path.resolve(process.argv[2] || '..');
const HTML = path.join(ROOT, 'LifeCompass.html');
const TAB = process.argv[3] || 'health_metrics';
const WIDTH = Number(process.argv[4] || 390);
const HEIGHT = Number(process.argv[5] || 844);

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
if (!BROWSER) { console.error('未找到 Edge/Chrome'); process.exit(1); }

let msgId = 0;
const pending = new Map();
let ws = null;
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
    expression: `(async () => { ${expr} })()`,
    returnByValue: true, awaitPromise: true, userGesture: true,
  });
  if (r.exceptionDetails) return { __err: r.exceptionDetails.exception?.description || r.exceptionDetails.text };
  const v = r.result?.value;
  if (v === undefined) return { __err: 'no value' };
  if (typeof v === 'object' && v !== null) return v;
  try { return JSON.parse(v); } catch { return v; }
}

const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-prb-'));
const port = 9600 + Math.floor(Math.random() * 300);
const child = spawn(BROWSER, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', '--disable-extensions', '--allow-file-access-from-files',
  `--remote-debugging-port=${port}`, `--user-data-dir=${profileDir}`,
  '--window-size=1440,1000', 'about:blank',
], { stdio: 'ignore', detached: false });
function cleanup() {
  try { child.kill(); } catch {}
  try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch {}
}
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(1); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitForPort() {
  for (let i = 0; i < 60; i++) {
    try { const res = await fetch(`http://127.0.0.1:${port}/json/version`); if (res.ok) return; } catch {}
    await sleep(250);
  }
  throw new Error('DevTools 端口未就绪');
}

(async () => {
  await waitForPort();
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
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: true });
  await send('Page.navigate', { url: 'file:///' + HTML.replace(/\\/g, '/') });
  for (let i = 0; i < 120; i++) {
    const r = await evalJs(`return { tabs: document.querySelectorAll('nav button').length }`);
    if (r && !r.__err && r.tabs >= 10) break;
    await sleep(250);
  }
  await sleep(600);
  await evalJs(`const b = document.querySelector('[data-testid="nav-tab-${TAB}"]'); if (b) b.click(); return true;`);
  await sleep(900);

  // 1) 内部溢出元素（自身内容超出自身盒子）
  const inner = await evalJs(`
    const out = [];
    for (const el of document.querySelectorAll('*')) {
      const st = getComputedStyle(el);
      if (st.overflowX !== 'visible') continue;
      if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) {
        const r = el.getBoundingClientRect();
        out.push({
          tag: el.tagName.toLowerCase(),
          testid: el.getAttribute('data-testid'),
          cls: (el.className && el.className.toString ? el.className.toString() : '').slice(0, 150),
          clientW: el.clientWidth,
          scrollW: el.scrollWidth,
          rectW: Math.round(r.width),
          text: (el.textContent || '').trim().slice(0, 70)
        });
      }
    }
    return out.slice(0, 40);
  `);

  // 2) 二分实验：逐个隐藏候选，看 scrollWidth 是否回落
  const bisect = await evalJs(`
    const de = document.documentElement;
    const base = de.scrollWidth;
    const cands = Array.from(document.querySelectorAll('[data-testid], section, table, ul, li'))
      .filter(el => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
    const hits = [];
    for (const el of cands) {
      const prev = el.style.display;
      el.style.display = 'none';
      const now = de.scrollWidth;
      el.style.display = prev;
      if (now < base) {
        hits.push({
          tag: el.tagName.toLowerCase(),
          testid: el.getAttribute('data-testid'),
          cls: (el.className && el.className.toString ? el.className.toString() : '').slice(0, 140),
          newScrollW: now,
          delta: base - now,
          text: (el.textContent || '').trim().slice(0, 60)
        });
      }
    }
    return { base, hits: hits.slice(0, 30) };
  `);

  console.log('=== 内部溢出元素 ===');
  console.log(JSON.stringify(inner, null, 2));
  console.log('\n=== 隐藏后 scrollWidth 回落的元素 ===');
  console.log(JSON.stringify(bisect, null, 2));

  cleanup();
  process.exit(0);
})().catch((e) => { console.error('失败:', e.message); cleanup(); process.exit(1); });
