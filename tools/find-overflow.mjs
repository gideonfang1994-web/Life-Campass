/**
 * 移动端横向溢出元素定位器
 *
 * 在 390px 视口下遍历 DOM，找出所有
 *   right > clientWidth  或  left < 0
 * 的元素，输出 tag / class / data-testid / 几何信息。
 *
 * 运行：node tools/find-overflow.mjs ..
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
  try { return JSON.parse(v); } catch { return v; }
}

const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-ovf-'));
const port = 9200 + Math.floor(Math.random() * 400);

const child = spawn(
  BROWSER,
  [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--allow-file-access-from-files',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    '--window-size=1440,1000',
    'about:blank',
  ],
  { stdio: 'ignore', detached: false }
);

function cleanup() {
  try { child.kill(); } catch {}
  try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch {}
}
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(1); });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForPort() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return await res.json();
    } catch {}
    await sleep(250);
  }
  throw new Error('DevTools 端口未就绪');
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
  await send('Emulation.setDeviceMetricsOverride', {
    width: WIDTH,
    height: HEIGHT,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await send('Page.navigate', { url: 'file:///' + HTML.replace(/\\/g, '/') });

  for (let i = 0; i < 120; i++) {
    const r = await evalJs(`return { tabs: document.querySelectorAll('nav button').length }`);
    if (r && !r.__err && r.tabs >= 10) break;
    await sleep(250);
  }
  await sleep(600);

  // 切到目标 tab
  await evalJs(`
    const btn = document.querySelector('[data-testid="nav-tab-${TAB}"]');
    if (btn) btn.click();
    return true;
  `);
  await sleep(900);

  const out = await evalJs(`
    const de = document.documentElement;
    const cw = de.clientWidth;
    const all = Array.from(document.querySelectorAll('*'));
    const badSet = new Set();
    for (const el of all) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.right > cw + 1 || r.left < -1) badSet.add(el);
    }
    // 根因元素 = 溢出元素中「父元素不溢出」的那些（最外层溢出节点）
    const roots = [];
    for (const el of badSet) {
      const p = el.parentElement;
      if (p && badSet.has(p)) continue;
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      roots.push({
        tag: el.tagName.toLowerCase(),
        testid: el.getAttribute('data-testid'),
        cls: (el.className && el.className.toString ? el.className.toString() : '').slice(0, 200),
        left: Math.round(r.left),
        right: Math.round(r.right),
        width: Math.round(r.width),
        pos: st.position,
        minW: st.minWidth,
        widthCss: st.width,
        whiteSpace: st.whiteSpace,
        wordBreak: st.wordBreak,
        overflowX: st.overflowX,
        text: (el.textContent || '').trim().slice(0, 80),
        childCount: el.children.length,
        children: Array.from(el.children).slice(0, 8).map(c => {
          const cr = c.getBoundingClientRect();
          return {
            tag: c.tagName.toLowerCase(),
            testid: c.getAttribute('data-testid'),
            cls: (c.className && c.className.toString ? c.className.toString() : '').slice(0, 100),
            left: Math.round(cr.left),
            right: Math.round(cr.right),
            width: Math.round(cr.width),
            scrollW: c.scrollWidth
          };
        })
      });
    }
    return {
      scrollW: de.scrollWidth,
      clientW: cw,
      bodyScrollW: document.body.scrollWidth,
      bodyClientW: document.body.clientWidth,
      totalBad: badSet.size,
      rootCount: roots.length,
      roots
    };
  `);

  console.log(JSON.stringify(out, null, 2));
  cleanup();
  process.exit(0);
})().catch((e) => {
  console.error('失败:', e.message);
  cleanup();
  process.exit(1);
});
