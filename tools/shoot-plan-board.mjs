/**
 * 计划板截图脚本：桌面 / 诊断面板 / 移动端 三张。
 *
 * 运行：node tools/shoot-plan-board.mjs ..
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';

const ROOT = path.resolve(process.argv[2] || '..');
const HTML = path.join(ROOT, 'LifeCompass.html');
const SHOTS = path.join(ROOT, 'shots');

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
    return { __err: r.exceptionDetails.exception?.description || r.exceptionDetails.text };
  }
  return r.result?.value;
}

async function shot(file, { full = true } = {}) {
  const { data } = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: full,
  });
  const p = path.join(SHOTS, file);
  fs.writeFileSync(p, Buffer.from(data, 'base64'));
  const kb = Math.round(fs.statSync(p).size / 1024);
  console.log(`📸 ${file}  (${kb} KB)`);
  return p;
}

const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-shot-'));
const port = 9733 + Math.floor(Math.random() * 300);

const child = spawn(
  BROWSER,
  [
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--allow-file-access-from-files',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    '--window-size=1440,1100',
    'about:blank',
  ],
  { stdio: 'ignore' }
);

function cleanup() {
  try { child.kill(); } catch {}
  try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch {}
}
process.on('exit', cleanup);

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

async function waitMounted() {
  for (let i = 0; i < 120; i++) {
    const r = await evalJs(
      `return { tabs: document.querySelectorAll('nav button').length,
                body: document.body ? document.body.innerText.length : 0 }`
    );
    if (r && !r.__err && r.tabs >= 12 && r.body > 500) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

const openPlanBoard = `
  const navs = Array.from(document.querySelectorAll('nav'));
  const mobile = navs.find(n => (n.getAttribute('aria-label') || '').includes('移动端'));
  const desktop = navs.find(n => n !== mobile);
  const btn = Array.from(desktop.querySelectorAll('button'))
    .find(b => b.innerText.includes('日周月年') || b.innerText.includes('计划板'));
  if (!btn) return { ok: false };
  btn.click();
  await new Promise(r => setTimeout(r, 1000));
  return { ok: true };
`;

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

  fs.mkdirSync(SHOTS, { recursive: true });

  // ---------- 桌面端 ----------
  await send('Page.navigate', { url: 'file:///' + HTML.replace(/\\/g, '/') });
  if (!await waitMounted()) throw new Error('桌面端挂载失败');

  console.log('\n── 桌面端 ──');
  await evalJs(openPlanBoard);
  await shot('16-plan-board-desktop.png');

  // 展开整棵树
  await evalJs(
    `for (let i = 0; i < 10; i++) {
       const t = Array.from(document.querySelectorAll('button[title="展开/收起下级"]'))
         .filter(b => b.getAttribute('data-expanded') !== 'true');
       if (!t.length) break;
       t.forEach(b => b.click());
       await new Promise(r => setTimeout(r, 320));
     }
     return true;`
  );
  await shot('17-plan-board-tree.png');

  // ---------- 诊断面板 ----------
  console.log('\n── 勾稽诊断面板 ──');
  await evalJs(
    `const tg = document.querySelector('[data-testid="plan-issue-toggle"]');
     if (tg) { tg.click(); await new Promise(r => setTimeout(r, 800)); }
     return true;`
  );
  await shot('18-plan-board-issues.png');

  // 面板滚到底部，看全部问题
  await evalJs(
    `const p = document.querySelector('[data-testid="plan-issue-panel"]');
     if (p) {
       const scroller = Array.from(p.querySelectorAll('div'))
         .find(d => d.scrollHeight > d.clientHeight + 20);
       if (scroller) scroller.scrollTop = scroller.scrollHeight;
     }
     await new Promise(r => setTimeout(r, 500));
     return true;`
  );
  await shot('19-plan-board-issues-full.png');

  // ---------- 移动端 ----------
  console.log('\n── 移动端 ──');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await send('Page.reload', { ignoreCache: false });
  await new Promise((r) => setTimeout(r, 2500));
  if (!await waitMounted()) throw new Error('移动端挂载失败');

  await evalJs(
    `const navs = Array.from(document.querySelectorAll('nav'));
     const mobile = navs.find(n => (n.getAttribute('aria-label') || '').includes('移动端'));
     const btn = mobile ? Array.from(mobile.querySelectorAll('button'))
       .find(b => b.innerText.includes('计划板') || b.innerText.includes('日周月年')) : null;
     if (!btn) return { ok: false };
     btn.click();
     await new Promise(r => setTimeout(r, 1000));
     return { ok: true };`
  );
  await shot('20-plan-board-mobile.png');

  await evalJs(
    `const tg = document.querySelector('[data-testid="plan-issue-toggle"]');
     if (tg) { tg.click(); await new Promise(r => setTimeout(r, 800)); }
     return true;`
  );
  await shot('21-plan-board-mobile-issues.png');

  console.log('\n✅ 截图完成');

  cleanup();
  process.exit(0);
})().catch((err) => {
  console.error('执行异常：', err);
  cleanup();
  process.exit(1);
});
