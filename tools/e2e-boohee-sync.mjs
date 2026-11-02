/**
 * 薄荷开放平台「直连同步」端到端验证
 *
 * 走 CDP 直连无头 Edge，真实渲染单文件 HTML，
 * 在页面上下文里：
 *   1) 打开「薄荷直连」面板
 *   2) 用 fetch 打桩（拦截薄荷域名，把真实 API 请求重定向到本地桩）
 *   3) 填凭证 → 点同步 → 断言数据真的写进了 localStorage 与界面
 *
 * 关键：拦截发生在页面里，因此走的是【真实的生产代码路径】
 *      （booheeOpenApi.ts → fetch → CORS → 映射 → 合并 → 持久化）。
 *
 * 运行：node tools/e2e-boohee-sync.mjs ..
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

const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-boohee-'));
const port = 10200 + Math.floor(Math.random() * 300);

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
    '--window-size=1440,1100',
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

  // 等待挂载
  let mounted = false;
  for (let i = 0; i < 120; i++) {
    const r = await evalJs(
      `return { tabs: document.querySelectorAll('nav button').length, body: document.body ? document.body.innerText.length : 0 }`
    );
    if (r && !r.__err && r.tabs >= 14 && r.body > 500) { mounted = true; break; }
    await sleep(250);
  }
  check('页面挂载完成', mounted);
  if (!mounted) { console.log('\n挂载失败，退出'); process.exit(1); }

  // ============ 组 1：切到量化健康页 ============
  console.log('\n════════ 组 1/5：导航到量化健康 ════════');
  const navRes = await evalJs(
    `const btns = Array.from(document.querySelectorAll('nav button'));
     const target = btns.find(b => (b.innerText || '').includes('量化健康'));
     if (!target) return { ok: false };
     target.click();
     await new Promise(r => setTimeout(r, 600));
     return {
       ok: true,
       view: !!document.querySelector('[data-testid="health-metrics-view"]'),
       hasBooheeBtn: !!document.querySelector('[data-testid="health-open-boohee"]')
     };`
  );
  check('切到量化健康视图', navRes.ok && navRes.view, JSON.stringify(navRes));
  check('存在「薄荷直连」入口按钮', navRes.hasBooheeBtn === true);

  // ============ 组 2：打开面板 ============
  console.log('\n════════ 组 2/5：打开薄荷直连面板 ════════');
  const panelRes = await evalJs(
    `document.querySelector('[data-testid="health-open-boohee"]').click();
     await new Promise(r => setTimeout(r, 400));
     const p = document.querySelector('[data-testid="boohee-sync-panel"]');
     return {
       open: !!p,
       text: p ? p.innerText.slice(0, 400) : '',
       testIds: p ? Array.from(p.querySelectorAll('[data-testid]')).map(e => e.getAttribute('data-testid')) : []
     };`
  );
  check('薄荷直连面板已打开', panelRes.open === true);
  check('面板暴露关键测试钩子',
    ['boohee-user-id', 'boohee-api-key', 'boohee-sync-trigger', 'boohee-start-date', 'boohee-end-date', 'boohee-include-eating']
      .every((t) => panelRes.testIds.includes(t)),
    panelRes.testIds.join(','));
  check('面板说明写清了能力边界',
    String(panelRes.text).includes('开放平台') && String(panelRes.text).includes('导出'),
    String(panelRes.text).slice(0, 120));

  // ============ 组 3：凭证未填时按钮禁用 ============
  console.log('\n════════ 组 3/5：凭证校验 ════════');
  const disabledRes = await evalJs(
    `const btn = document.querySelector('[data-testid="boohee-sync-trigger"]');
     return { disabled: btn.disabled, hint: !!document.querySelector('[data-testid="boohee-hint"]') };`
  );
  check('未填凭证时同步按钮禁用', disabledRes.disabled === true);
  check('未填凭证时给出提示', disabledRes.hint === true);

  // ============ 组 4：拦截 fetch 打桩，走真实同步链路 ============
  console.log('\n════════ 组 4/5：拦截 fetch 并执行真实同步 ════════');
  const syncRes = await evalJs(`
    // 记录请求
    window.__calls = [];
    const realFetch = window.fetch;
    window.fetch = async function (input, init) {
      const url = typeof input === 'string' ? input : (input && input.url) || String(input);
      if (url.includes('api.boohee.com/open-apis')) {
        window.__calls.push({ url, method: (init && init.method) || 'GET', headers: (init && init.headers) || {} });
        const u = new URL(url);
        const path = u.pathname;
        const q = u.searchParams;

        const envelope = (data) => ({ code: 0, message: 'ok', now: 1722851989, data });

        if (path.endsWith('/v2/weight/records')) {
          return new Response(JSON.stringify(envelope({
            total: 2,
            items: [
              { id: 1, record_on: '2026-10-20', weight: 70.2, body_fat: 22.1, measure_time: '2026-10-20 08:00:00' },
              { id: 2, record_on: '2026-10-21', weight: 69.9, body_fat: 21.9, measure_time: '2026-10-21 08:00:00' }
            ]
          })), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        if (path.endsWith('/v2/eating/records')) {
          const on = q.get('record_on');
          if (on === '2026-10-20') {
            return new Response(JSON.stringify(envelope({
              daily: {
                meals: [
                  { meal_type: 1, items: [{ id: 1, food_name: '燕麦粥', food_code: 'f1', amount: 200, unit_name: '克', calories: 280, protein: 11, fat: 5, carbohydrate: 46 }] },
                  { meal_type: 2, items: [{ id: 2, food_name: '米饭', food_code: 'f2', amount: 200, unit_name: '克', calories: 232, protein: 4.6, fat: 0.8, carbohydrate: 50.2 }] }
                ],
                total_calories: 512, total_protein: 15.6, total_fat: 5.8, total_carbohydrate: 96.2
              }
            })), { status: 200, headers: { 'Content-Type': 'application/json' } });
          }
          return new Response(JSON.stringify(envelope({ daily: null })), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        if (path.endsWith('/v1/food/search')) {
          return new Response(JSON.stringify(envelope({
            page: 1, per_page: 20, has_more: false,
            foods: [{ code: '10001', name: '米饭', calories: 116, protein: 2.6, fat: 0.3, carbohydrate: 25.9 }]
          })), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        return new Response(JSON.stringify({ code: 0, message: 'ok', data: {} }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return realFetch.apply(this, arguments);
    };

    // 填凭证
    const setVal = (testid, value) => {
      const el = document.querySelector('[data-testid="' + testid + '"]');
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      setter.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    setVal('boohee-user-id', 'e2e_user');
    setVal('boohee-api-key', 'sk-e2e-fake-key');
    setVal('boohee-start-date', '2026-10-20');
    setVal('boohee-end-date', '2026-10-21');

    await new Promise(r => setTimeout(r, 300));

    const btn = document.querySelector('[data-testid="boohee-sync-trigger"]');
    const disabledBefore = btn.disabled;
    btn.click();
    await new Promise(r => setTimeout(r, 1500));

    const result = document.querySelector('[data-testid="boohee-sync-result"]');
    const err = document.querySelector('[data-testid="boohee-sync-error"]');
    const warnBox = document.querySelector('[data-testid="boohee-sync-warnings"]');
    const stored = JSON.parse(localStorage.getItem('life_coach_health_entries') || '[]');
    const batches = JSON.parse(localStorage.getItem('life_coach_health_imports') || '[]');

    // 直接复现一次 fetch，看真实响应体
    let rawBody = '';
    try {
      const probe = await window.fetch('https://api.boohee.com/open-apis/v2/weight/records?user_id=e2e_user&start_date=2026-10-20&end_date=2026-10-21', { headers: { 'X-Api-Key': 'sk-e2e-fake-key' } });
      rawBody = await probe.text();
    } catch (e) {
      rawBody = 'probe-failed: ' + e;
    }

    return {
      disabledBefore,
      hasResult: !!result,
      warningsText: warnBox ? warnBox.innerText : '',
      rawBody: rawBody.slice(0, 300),      days: result ? Number(result.getAttribute('data-days')) : -1,
      weightRecords: result ? Number(result.getAttribute('data-weight-records')) : -1,
      eatingRecords: result ? Number(result.getAttribute('data-eating-records')) : -1,
      errorText: err ? err.innerText : '',
      calls: window.__calls.map(c => c.method + ' ' + new URL(c.url).pathname),
      apiKeyHeader: (window.__calls[0] && window.__calls[0].headers && window.__calls[0].headers['X-Api-Key']) || '',
      userIdInQuery: window.__calls.length ? new URL(window.__calls[0].url).searchParams.get('user_id') : '',
      storedCount: stored.length,
      storedSample: stored,
      booheeCount: stored.filter(e => e.source === 'boohee').length,
      batchCount: batches.length,
      batchSource: batches.length ? batches[batches.length - 1].source : '',
      batchName: batches.length ? batches[batches.length - 1].fileName : ''
    };
  `);

  check('填完凭证后同步按钮解锁', syncRes.disabledBefore === false, String(syncRes.disabledBefore));
  console.log('  ℹ️ warnings:', JSON.stringify(syncRes.warningsText));
  console.log('  ℹ️ rawBody:', JSON.stringify(syncRes.rawBody));
  check('同步完成并显示结果卡', syncRes.hasResult === true, syncRes.errorText);
  check('同步得到 2 天数据', syncRes.days === 2, String(syncRes.days));
  check('体重记录 2 条', syncRes.weightRecords === 2, String(syncRes.weightRecords));
  check('饮食明细 2 条', syncRes.eatingRecords === 2, String(syncRes.eatingRecords));
  check('请求打到 /v2/weight/records',
    syncRes.calls.some((c) => c.includes('/v2/weight/records')), syncRes.calls.join(' | '));
  check('请求打到 /v2/eating/records',
    syncRes.calls.some((c) => c.includes('/v2/eating/records')), syncRes.calls.join(' | '));
  check('携带了 X-Api-Key 请求头', syncRes.apiKeyHeader === 'sk-e2e-fake-key', syncRes.apiKeyHeader);
  check('请求带上了 user_id', syncRes.userIdInQuery === 'e2e_user', syncRes.userIdInQuery);
  check('数据写入 localStorage', syncRes.storedCount >= 2, String(syncRes.storedCount));
  check('来源标记为 boohee', syncRes.booheeCount >= 2, String(syncRes.booheeCount));
  check('生成了导入批次记录', syncRes.batchCount >= 1, String(syncRes.batchCount));
  check('批次来源为 boohee', syncRes.batchSource === 'boohee', syncRes.batchSource);

  const d20 = (syncRes.storedSample || []).find((e) => e.date === '2026-10-20');
  check('体重映射正确（10-20）', d20 && d20.weightKg === 70.2, JSON.stringify(d20));
  check('体脂映射正确（10-20）', d20 && d20.bodyFatPct === 22.1, JSON.stringify(d20));
  check('热量映射正确（10-20）', d20 && d20.caloriesIntake === 512, JSON.stringify(d20));
  check('蛋白映射正确（10-20）', d20 && d20.proteinG === 15.6, JSON.stringify(d20));
  check('碳水映射正确（10-20）', d20 && d20.carbsG === 96.2, JSON.stringify(d20));
  check('餐次数映射正确（10-20）', d20 && d20.mealCount === 2, JSON.stringify(d20));

  // ============ 组 5：食物搜索自检 + 错误提示 ============
  console.log('\n════════ 组 5/5：连通性自检与错误提示 ════════');
  const searchRes = await evalJs(`
    const setVal = (testid, value) => {
      const el = document.querySelector('[data-testid="' + testid + '"]');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    setVal('boohee-food-keyword', '米饭');
    await new Promise(r => setTimeout(r, 200));
    document.querySelector('[data-testid="boohee-food-search"]').click();
    await new Promise(r => setTimeout(r, 900));
    const list = document.querySelector('[data-testid="boohee-food-results"]');
    return {
      has: !!list,
      text: list ? list.innerText : ''
    };
  `);
  check('食物搜索返回结果', searchRes.has === true, searchRes.text);
  check('搜索结果含食物名', String(searchRes.text).includes('米饭'), searchRes.text);

  // 无效 Key 时的报错
  const errRes = await evalJs(`
    // 让薄荷域名返回 1050
    window.fetch = async function (input, init) {
      const url = typeof input === 'string' ? input : (input && input.url) || String(input);
      if (url.includes('api.boohee.com/open-apis')) {
        return new Response(JSON.stringify({ code: 1050, message: '无效的 API Key' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    document.querySelector('[data-testid="boohee-sync-trigger"]').click();
    await new Promise(r => setTimeout(r, 1200));
    const err = document.querySelector('[data-testid="boohee-sync-error"]');
    return { text: err ? err.innerText : '' };
  `);
  check('无效 Key 给出可读报错', String(errRes.text).includes('API Key'), errRes.text);

  // ============ 截图：面板 UI 渲染确认 ============
  try {
    // 只截视口（不用 captureBeyondViewport）：长页面全量合成会压缩失真、串内容
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1280, height: 900, deviceScaleFactor: 1, mobile: false,
    });
    await evalJs(`
      const panel = document.querySelector('[data-testid="boohee-sync-panel"]');
      if (panel) {
        panel.scrollIntoView({ block: 'center' });
        // 面板可能是懒渲染，等一帧
        await new Promise(r => setTimeout(r, 600));
      }
      return {
        found: !!panel,
        title: document.title,
        hasBoohee: document.body.innerText.includes('薄荷'),
      };
    `);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    const outDir = path.join(ROOT, 'shots');
    fs.mkdirSync(outDir, { recursive: true });
    const shotPath = path.join(outDir, '22-boohee-sync-panel.png');
    fs.writeFileSync(shotPath, Buffer.from(shot.data, 'base64'));
    console.log('\n📸 薄荷面板截图：' + shotPath);
  } catch (e) {
    console.log('\n⚠️ 截图跳过：' + (e?.message || e));
  }

  // ============ 汇总 ============
  console.log('\n' + '='.repeat(56));
  console.log(`通过 ${pass} / 失败 ${fail} / 合计 ${pass + fail}`);
  if (failures.length) {
    console.log('\n失败明细：');
    for (const f of failures) console.log('  ✗ ' + f);
  }
  console.log('='.repeat(56));
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('e2e 异常:', e);
  process.exit(1);
});
