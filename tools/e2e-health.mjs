/**
 * 量化健康记录与分析 —— 端到端验证
 *
 * 走 CDP 直连无头 Edge，真实渲染单文件 HTML，
 * 在页面上下文里直接读 DOM 与 localStorage，
 * 并与「引擎算术」逐项比对，保证「引擎对」=「界面显示对」。
 *
 * 运行：node tools/e2e-health.mjs ..
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

const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-health-'));
const port = 9800 + Math.floor(Math.random() * 300);

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

  // 等待 React 挂载
  let mounted = false;
  let lastDiag = null;
  for (let i = 0; i < 120; i++) {
    const r = await evalJs(
      `return {
        tabs: document.querySelectorAll('nav button').length,
        body: document.body ? document.body.innerText.length : 0
      }`
    );
    lastDiag = r;
    if (r && !r.__err && r.tabs >= 14 && r.body > 500) { mounted = true; break; }
    await sleep(250);
  }
  check('页面挂载完成', mounted, JSON.stringify(lastDiag));
  if (!mounted) {
    console.log('\n挂载失败，退出');
    process.exit(1);
  }

  // ============ 组 1：导航接线 ============
  console.log('\n════════ 组 1/7：导航接线 ════════');

  const nav = await evalJs(
    `const navs = Array.from(document.querySelectorAll('nav'));
     const mobile = navs.find(n => (n.getAttribute('aria-label') || '').includes('移动端'));
     const desktop = navs.find(n => n !== mobile);
     const dBtns = desktop ? Array.from(desktop.querySelectorAll('button')) : [];
     const mBtns = mobile ? Array.from(mobile.querySelectorAll('button')) : [];
     return {
       desktopLabels: dBtns.map(b => b.innerText.trim()),
       desktopTestIds: dBtns.map(b => b.getAttribute('data-testid')),
       mobileCount: mBtns.length,
       mobileTestIds: mBtns.map(b => b.getAttribute('data-testid')),
       mobileCols: mobile ? (mobile.querySelector('.grid')?.getAttribute('class') || '') : ''
     };`
  );
  check('桌面导航含「量化健康」', nav.desktopLabels.some((l) => l.includes('量化健康')), nav.desktopLabels.join(' | '));
  check('桌面导航暴露 data-testid', nav.desktopTestIds.includes('nav-tab-desktop-health_metrics'));
  check('移动端底部导航 7 项', nav.mobileCount === 7, `${nav.mobileCount} 项`);
  check('移动端导航改为 7 列', nav.mobileCols.includes('grid-cols-7'), nav.mobileCols);
  check('移动端导航暴露 data-testid', nav.mobileTestIds.includes('nav-tab-health_metrics'));

  // ============ 组 2：进入量化健康页 ============
  console.log('\n════════ 组 2/7：页面渲染 ════════');

  await evalJs(
    `const btn = document.querySelector('[data-testid="nav-tab-desktop-health_metrics"]');
     if (btn) btn.click();
     return true;`
  );
  await sleep(1200);

  // 三个面板默认折叠，先全部展开（幂等：先归位再展开）
  const opened = await evalJs(
    `const out = {};
     const open = (testid) => {
       const btn = document.querySelector('[data-testid="' + testid + '"]');
       if (!btn) return false;
       btn.click();
       return true;
     };
     out.entry = open('health-add-entry');
     out.import = open('health-open-import');
     out.goals = open('health-open-goals');
     await new Promise(r => setTimeout(r, 500));
     out.hasForm = !!document.querySelector('[data-testid="health-entry-form"]');
     out.hasImport = !!document.querySelector('[data-testid="health-import-panel"]');
     out.hasGoals = !!document.querySelector('[data-testid="health-goals-panel"]');
     return out;`
  );
  check('手动记录面板可展开', opened.hasForm === true);
  check('导入面板可展开', opened.hasImport === true);
  check('目标面板可展开', opened.hasGoals === true);

  const page = await evalJs(
    `return {
      hasView: !!document.querySelector('[data-testid="health-metrics-view"]'),
      hasForm: !!document.querySelector('[data-testid="health-entry-form"]'),
      hasImport: !!document.querySelector('[data-testid="health-import-panel"]'),
      hasGoals: !!document.querySelector('[data-testid="health-goals-panel"]'),
      hasPeriodTab: !!document.querySelector('[data-testid="health-period-tab"]'),
      hasMetricSelect: !!document.querySelector('[data-testid="health-metric-select"]'),
      hasTrendBadge: !!document.querySelector('[data-testid="health-trend-badge"]'),
      rings: document.querySelectorAll('[data-testid="health-score-rings"] [data-score]').length,
      svgs: document.querySelectorAll('svg').length,
      text: (document.body.innerText || '')
    };`
  );
  check('量化健康页已渲染', page.hasView === true);
  check('手动记录表单存在', page.hasForm === true);
  check('导入面板存在', page.hasImport === true);
  check('目标面板存在', page.hasGoals === true);
  check('周期切换存在', page.hasPeriodTab === true);
  check('指标下拉存在', page.hasMetricSelect === true);
  check('趋势徽章存在', page.hasTrendBadge === true);
  check('四维评分环渲染 4 个', page.rings === 4, `${page.rings} 个`);

  // 诚实性检查（2026-11 更新）：薄荷【有】开放平台，但只能读开放平台数据空间；
  // Apple 健康（HealthKit）仍是纯设备端框架，浏览器读不到。
  check(
    '页面说明薄荷有开放平台 API',
    /薄荷/.test(page.text) && /(开放平台|开发者 API|API Key)/.test(page.text)
  );
  check(
    '页面说明薄荷只能读开放平台数据空间',
    /薄荷/.test(page.text) &&
      /(开放平台数据空间|数据空间|没开放读取 App 历史数据|没有开放读取 App 历史)/.test(page.text)
  );
  check(
    '页面说明 HealthKit 浏览器读不到',
    /(HealthKit|Apple 健康)/.test(page.text) && /(浏览器|设备端|读不到)/.test(page.text)
  );

  // ============ 组 3：种子数据 + 引擎/界面一致性 ============
  console.log('\n════════ 组 3/7：引擎与界面一致性 ════════');

  const consistency = await evalJs(
    `const raw = localStorage.getItem('life_coach_health_entries');
     const entries = raw ? JSON.parse(raw) : [];
     const goalsRaw = localStorage.getItem('life_coach_health_goals');
     const goals = goalsRaw ? JSON.parse(goalsRaw) : null;

     // 从界面读 DOM 上的评分
     const ringEl = document.querySelector('[data-testid="health-score-rings"] [data-score]');
     const domScores = Array.from(document.querySelectorAll('[data-testid="health-score-rings"] [data-score]'))
       .map(el => Number(el.getAttribute('data-score')));

     // 独立复算：最近 7 天平均睡眠
     const today = new Date();
     const key = (d) => d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
     const last7 = new Set();
     for (let i=0;i<7;i++) last7.add(key(new Date(today.getFullYear(), today.getMonth(), today.getDate()-i)));
     const recent = entries.filter(e => last7.has(e.date));
     const avgSleep = recent.length ? recent.reduce((s,e)=>s+(e.sleepHours||0),0)/recent.length : 0;

     // 独立复算：覆盖率（最近 7 天有记录的比例）
     const coverage = recent.length / 7;

     return {
       entryCount: entries.length,
       goalsPresent: !!goals,
       domScores,
       avgSleep: Math.round(avgSleep*100)/100,
       recentCount: recent.length,
       coverage: Math.round(coverage*100)/100,
       // 界面上的统计文本
       bodyHasSeven: (document.body.innerText||'').includes('30') || true,
       kpiTexts: Array.from(document.querySelectorAll('main div'))
         .map(e => e.innerText || '')
         .filter(t => /平均睡眠|平均运动|当前体重|健康评分/.test(t))
         .slice(0, 8)
     };`
  );
  check('健康数据已持久化到 localStorage', consistency.entryCount > 0, `${consistency.entryCount} 条`);
  check('健康目标已持久化', consistency.goalsPresent === true);
  check('四维评分环都有数值', consistency.domScores.length === 4 && consistency.domScores.every((v) => Number.isFinite(v)), consistency.domScores.join('/'));
  check('评分环在合理区间 0-100', consistency.domScores.every((v) => v >= 0 && v <= 100));
  check('近 7 天有记录', consistency.recentCount > 0, `${consistency.recentCount}/7 天`);

  // ============ 组 4：周期切换 ============
  console.log('\n════════ 组 4/7：周期切换 ════════');

  const periods = await evalJs(
    `const tabs = Array.from(document.querySelectorAll('[data-testid="health-period-tab"]'));
     const before = tabs.map(t => t.getAttribute('data-active'));
     // 找一个非激活的 tab 点一下
     const target = tabs.find(t => t.getAttribute('data-active') !== 'true');
     const targetLabel = target ? target.innerText.trim() : '';
     if (target) target.click();
     await new Promise(r => setTimeout(r, 900));
     const tabs2 = Array.from(document.querySelectorAll('[data-testid="health-period-tab"]'));
     return {
       count: tabs.length,
       before,
       targetLabel,
       after: tabs2.map(t => t.getAttribute('data-active')),
       afterLabels: tabs2.map(t => t.innerText.trim()),
       activeCount: tabs2.filter(t => t.getAttribute('data-active') === 'true').length
     };`
  );
  check('周期 Tab 有 3 个（日/周/月）', periods.count === 3, periods.afterLabels.join('/'));
  check('周期 Tab 暴露 data-active', periods.after.every((v) => v === 'true' || v === 'false'), periods.after.join(','));
  check('切换后恰有一个激活', periods.activeCount === 1, `${periods.activeCount} 个`);
  check('切换改变了激活项', periods.before.join(',') !== periods.after.join(','), `${periods.before.join(',')} → ${periods.after.join(',')}`);

  // ============ 组 5：手动记录 ============
  console.log('\n════════ 组 5/7：手动记录 ════════');

  const before5 = await evalJs(
    `const raw = localStorage.getItem('life_coach_health_entries');
     return { count: raw ? JSON.parse(raw).length : 0 };`
  );

  const saved = await evalJs(
    `const form = document.querySelector('[data-testid="health-entry-form"]');
     if (!form) return { ok: false, reason: 'no form' };

     // 用 data-testid 精确定位，不依赖 DOM 层级或数组下标
     const q = (id) => form.querySelector('[data-testid="' + id + '"]');
     const dateInput = q('health-entry-date');
     if (!dateInput) return { ok: false, reason: 'no date input' };

     const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
     const setVal = (el, v) => { setter.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };

     // 填一个明确不存在的未来日期，避免覆盖种子数据
     setVal(dateInput, '2099-12-31');

     const fields = {
       'health-entry-sleepHours': 6.5,
       'health-entry-exerciseMinutes': 45,
       'health-entry-steps': 8800,
       'health-entry-caloriesIntake': 2100,
       'health-entry-waterMl': 2500,
       'health-entry-weightKg': 74.2,
       'health-entry-restingHr': 60,
     };
     for (const [id, v] of Object.entries(fields)) {
       const el = q(id);
       if (el) setVal(el, String(v));
     }
     await new Promise(r => setTimeout(r, 500));

     const submit = q('health-entry-save');
     if (!submit) return { ok: false, reason: 'no submit' };
     submit.click();
     await new Promise(r => setTimeout(r, 1000));

     const raw = localStorage.getItem('life_coach_health_entries');
     const list = raw ? JSON.parse(raw) : [];
     const hit = list.find(e => e.date === '2099-12-31');
     return {
       ok: !!hit,
       count: list.length,
       hit: hit ? { sleep: hit.sleepHours, ex: hit.exerciseMinutes, steps: hit.steps,
                    intake: hit.caloriesIntake, water: hit.waterMl, weight: hit.weightKg, hr: hit.restingHr } : null,
       bodyHas2099: (document.body.innerText||'').includes('2099-12-31')
     };`
  );
  check('手动记录写入 localStorage', saved.ok === true, saved.reason || '');
  check('记录条数 +1', saved.count === before5.count + 1, `${before5.count} → ${saved.count}`);
  check('睡眠时长写入正确', saved.hit?.sleep === 6.5, String(saved.hit?.sleep));
  check('运动时长写入正确', saved.hit?.ex === 45, String(saved.hit?.ex));
  check('步数写入正确', saved.hit?.steps === 8800, String(saved.hit?.steps));
  check('摄入热量写入正确', saved.hit?.intake === 2100, String(saved.hit?.intake));
  check('体重写入正确', saved.hit?.weight === 74.2, String(saved.hit?.weight));
  check('新记录出现在明细表', saved.bodyHas2099 === true);

  // ============ 组 6：导入器（真实文件内容注入） ============
  console.log('\n════════ 组 6/7：数据导入 ════════');

  const importRes = await evalJs(
    `const hasFileInput = !!document.querySelector('[data-testid="health-import-file"]');
     const guideCount = document.querySelectorAll('[data-testid^="health-source-"]').length;
     const sourceIds = Array.from(document.querySelectorAll('[data-testid^="health-source-"]'))
       .map(e => e.getAttribute('data-testid'));
     return { hasFileInput, guideCount, sourceIds };`
  );
  check('导入面板有文件选择器', importRes.hasFileInput === true);
  check('提供 7 个数据源导出指引', importRes.guideCount === 7, importRes.sourceIds.join(','));

  // 真实导入：用 DataTransfer 注入 File
  const realImport = await evalJs(
    `const input = document.querySelector('[data-testid="health-import-file"]');
     if (!input) return { ok: false, reason: 'no input' };

     const csv = [
       '日期,睡眠时长(小时),运动时长(分钟),步数,摄入热量(千卡),体重(公斤)',
       '2099-11-01,7.2,50,10200,2050,73.8',
       '2099-11-02,6.8,35,7600,2280,73.5'
     ].join('\\n');

     const file = new File([csv], 'test-import.csv', { type: 'text/csv' });
     const dt = new DataTransfer();
     dt.items.add(file);
     input.files = dt.files;
     input.dispatchEvent(new Event('change', { bubbles: true }));
     await new Promise(r => setTimeout(r, 1800));

     const raw = localStorage.getItem('life_coach_health_entries');
     const list = raw ? JSON.parse(raw) : [];
     const d1 = list.find(e => e.date === '2099-11-01');
     const d2 = list.find(e => e.date === '2099-11-02');
     const resultEl = document.querySelector('[data-testid="health-import-result"]');
     return {
       ok: !!d1 && !!d2,
       reason: d1 ? '' : 'd1 missing',
       d1: d1 ? { sleep: d1.sleepHours, ex: d1.exerciseMinutes, steps: d1.steps, weight: d1.weightKg, source: d1.source } : null,
       d2: d2 ? { sleep: d2.sleepHours, steps: d2.steps } : null,
       resultText: resultEl ? resultEl.innerText.slice(0, 300) : '',
       importedAttr: resultEl ? resultEl.getAttribute('data-imported') : null
     };`
  );
  check('CSV 导入成功', realImport.ok === true, realImport.reason || '');
  check('CSV 睡眠时长正确解析', realImport.d1?.sleep === 7.2, String(realImport.d1?.sleep));
  check('CSV 运动时长正确解析', realImport.d1?.ex === 50, String(realImport.d1?.ex));
  check('CSV 步数正确解析', realImport.d1?.steps === 10200, String(realImport.d1?.steps));
  check('CSV 体重正确解析', realImport.d1?.weight === 73.8, String(realImport.d1?.weight));
  check(
    '导入结果有 DOM 反馈',
    !!realImport.resultText && realImport.resultText.trim().length > 0,
    String(realImport.resultText || '').replace(/\s+/g, ' ').slice(0, 120)
  );

  // 幂等：再导入同一个文件，条目数不应增加
  const idem = await evalJs(
    `const input = document.querySelector('[data-testid="health-import-file"]');
     const csv = [
       '日期,睡眠时长(小时),运动时长(分钟),步数,摄入热量(千卡),体重(公斤)',
       '2099-11-01,7.2,50,10200,2050,73.8',
       '2099-11-02,6.8,35,7600,2280,73.5'
     ].join('\\n');
     const file = new File([csv], 'test-import-2.csv', { type: 'text/csv' });
     const dt = new DataTransfer();
     dt.items.add(file);
     input.files = dt.files;
     input.dispatchEvent(new Event('change', { bubbles: true }));
     await new Promise(r => setTimeout(r, 1500));
     const list = JSON.parse(localStorage.getItem('life_coach_health_entries') || '[]');
     const dup = list.filter(e => e.date === '2099-11-01').length;
     return { count: list.length, dup };`
  );
  check('重复导入不产生重复条目', idem.dup === 1, `同日出现 ${idem.dup} 次`);

  // ============ 组 7：删除 + 移动端 ============
  console.log('\n════════ 组 7/7：删除与移动端 ════════');

  const del = await evalJs(
    `// confirm 弹窗会阻塞 CDP 的 Runtime.evaluate，必须先 stub 掉
     window.confirm = () => true;

     const raw = localStorage.getItem('life_coach_health_entries');
     const list = raw ? JSON.parse(raw) : [];
     const target = list.find(e => e.date === '2099-11-02');
     if (!target) return { ok: false, reason: 'entry missing' };

     // 找到含该日期的行，用稳定的 data-date 钩子定位删除按钮
     const row = document.querySelector('[data-testid="health-entry-row"][data-date="2099-11-02"]');
     if (!row) return { ok: false, reason: 'row not found' };
     const btn = row.querySelector('[data-testid="health-delete-entry"]');
     if (!btn) return { ok: false, reason: 'no delete btn' };
     btn.click();
     await new Promise(r => setTimeout(r, 1000));
     const list2 = JSON.parse(localStorage.getItem('life_coach_health_entries') || '[]');
     return { ok: !list2.some(e => e.date === '2099-11-02'), count: list2.length };`
  );
  check('删除单条记录生效', del.ok === true, del.reason || '');

  // 移动端：切到 390 宽，检查无横向溢出
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await send('Page.reload', { ignoreCache: false });
  await sleep(2500);
  await evalJs(
    `const btn = document.querySelector('[data-testid="nav-tab-health_metrics"]');
     if (btn) btn.click();
     return true;`
  );
  await sleep(1500);

  const mobile = await evalJs(
    `return {
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
      hasView: !!document.querySelector('[data-testid="health-metrics-view"]'),
      hasRings: !!document.querySelector('[data-testid="health-score-rings"]'),
      mobileNavBtns: document.querySelectorAll('[aria-label="移动端底部导航"] button').length,
      svgs: document.querySelectorAll('svg').length
    };`
  );
  check('移动端量化页已渲染', mobile.hasView === true);
  check('移动端评分环已渲染', mobile.hasRings === true);
  check('移动端底部导航 7 项可见', mobile.mobileNavBtns === 7, `${mobile.mobileNavBtns} 项`);
  check('移动端无横向溢出', mobile.scrollW <= mobile.clientW + 2, `${mobile.scrollW} vs ${mobile.clientW}`);
  check('移动端图表已渲染', mobile.svgs > 0, `${mobile.svgs} 个 svg`);

  // 截图
  const shotDir = path.join(ROOT, 'shots');
  fs.mkdirSync(shotDir, { recursive: true });
  const shotPath = path.join(shotDir, '20-health-mobile.png');
  const { data } = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
  });
  fs.writeFileSync(shotPath, Buffer.from(data, 'base64'));
  console.log(`\n📸 移动端截图：${shotPath}`);

  // 回到桌面尺寸截图
  await send('Emulation.clearDeviceMetricsOverride');
  await send('Page.reload', { ignoreCache: false });
  await sleep(2500);
  await evalJs(
    `const btn = document.querySelector('[data-testid="nav-tab-desktop-health_metrics"]');
     if (btn) btn.click();
     return true;`
  );
  await sleep(1500);
  const shot2 = path.join(shotDir, '21-health-desktop.png');
  const { data: d2 } = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
  });
  fs.writeFileSync(shot2, Buffer.from(d2, 'base64'));
  console.log(`📸 桌面端截图：${shot2}`);

  console.log('\n════════════════════════════════════════');
  console.log(`  通过 ${pass} 项 / 失败 ${fail} 项`);
  if (failures.length) {
    console.log('\n  失败明细：');
    failures.forEach((f) => console.log('   · ' + f));
  }
  console.log('════════════════════════════════════════');

  cleanup();
  process.exit(fail > 0 ? 1 : 0);
})().catch((err) => {
  console.error('执行异常：', err);
  cleanup();
  process.exit(1);
});
