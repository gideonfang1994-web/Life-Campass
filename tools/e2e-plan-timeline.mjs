/**
 * 计划时间线（Timeline）—— 端到端验证
 *
 * 验证的是「一眼看到什么时候要做什么」这件事是否真的成立：
 *   1. 进计划板默认就是时间线，而不是先看到一棵树；
 *   2. 切换跨度（本周/本月/本季/今年）时，刻度粒度会自适应，格子数不会爆炸；
 *   3. 时间格上点「+」新建，节点会精确落到那个时间点，而不是落到今天；
 *   4. 空白时段能折叠，但「今天」那一格永远不被折叠。
 *
 * 走 CDP 直连无头 Edge，真实渲染单文件 HTML，只读真实 DOM 的 data-* 契约。
 *
 * 运行：node tools/e2e-plan-timeline.mjs ..
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

function findBrowser() {
  const cands = [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  ];
  for (const c of cands) if (fs.existsSync(c)) return c;
  return null;
}

const BROWSER = findBrowser();
if (!BROWSER) {
  console.error('未找到 Edge/Chrome');
  process.exit(1);
}

// ---------- CDP ----------
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

const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-tl-'));
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

/** 进入计划板（从导航点「日周月年」） */
const ENTER_BOARD = `
  const navs = Array.from(document.querySelectorAll('nav'));
  const mobile = navs.find(n => (n.getAttribute('aria-label') || '').includes('移动端'));
  const desktop = navs.find(n => n !== mobile);
  const btns = desktop ? Array.from(desktop.querySelectorAll('button')) : [];
  const target = btns.find(b => b.innerText.includes('日周月年') || b.innerText.includes('计划板'));
  if (!target) return { ok: false, labels: btns.map(b => b.innerText) };
  target.click();
  await new Promise(r => setTimeout(r, 900));
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
  await send('Page.navigate', { url: 'file:///' + HTML.replace(/\\/g, '/') });

  let mounted = false;
  for (let i = 0; i < 120; i++) {
    const r = await evalJs(
      `return { tabs: document.querySelectorAll('nav button').length,
        body: document.body ? document.body.innerText.length : 0,
        ready: document.readyState };`
    );
    if (r && !r.__err && r.tabs >= 12 && r.body > 500) { mounted = true; break; }
    await new Promise((r) => setTimeout(r, 250));
  }
  check('页面挂载完成', mounted);
  if (!mounted) { console.log('\n挂载失败，退出'); process.exit(1); }

  // ============ 组 1：默认进入即时间线 ============
  console.log('\n════════ 组 1/7：默认视图 ════════');
  const entered = await evalJs(ENTER_BOARD);
  check('可从导航进入计划板', entered.ok === true, JSON.stringify(entered).slice(0, 160));

  const defaultView = await evalJs(
    `const sw = document.querySelector('[data-testid="plan-view-switch"]');
     const tl = document.querySelector('[data-testid="plan-timeline"]');
     const listBtn = document.querySelector('[data-testid="plan-view-list"]');
     return {
       view: sw ? sw.getAttribute('data-view') : null,
       timelineMounted: !!tl,
       listActive: listBtn ? listBtn.getAttribute('data-active') : null,
       span: tl ? tl.getAttribute('data-span') : null,
       granularity: tl ? tl.getAttribute('data-granularity') : null,
       hasAxisDots: document.querySelectorAll('[data-testid="timeline-bucket"]').length,
       // 层级 Tab 在两种视图下都必须存在，否则用户切不回树
       cycleTabs: document.querySelectorAll('[data-testid="plan-cycle-tab"]').length
     };`
  );
  check('默认视图是时间线', defaultView.view === 'timeline', `data-view=${defaultView.view}`);
  check('时间线已挂载', defaultView.timelineMounted === true);
  check('层级树未被激活', defaultView.listActive === 'false', `data-active=${defaultView.listActive}`);
  check('时间线渲染出刻度', defaultView.hasAxisDots > 0, `${defaultView.hasAxisDots} 格`);
  check('层级 Tab 在时间线下仍可见', defaultView.cycleTabs === 5, `${defaultView.cycleTabs} 个`);

  // ============ 组 2：跨度切换 + 粒度自适应 ============
  console.log('\n════════ 组 2/7：跨度与粒度 ════════');
  const spanSweep = await evalJs(
    `const out = {};
     for (const s of ['week','month','quarter','year']) {
       const tab = document.querySelector('[data-testid="timeline-span-tab"][data-span="' + s + '"]');
       if (!tab) { out[s] = { err: 'no tab' }; continue; }
       tab.click();
       await new Promise(r => setTimeout(r, 500));
       const tl = document.querySelector('[data-testid="plan-timeline"]');
       const buckets = document.querySelectorAll('[data-testid="timeline-bucket"]');
       // 折叠空白后 DOM 里的 bucket 数会少于真实格数，
       // 真实格数必须读 data-bucket-count（由引擎 summary.bucketCount 下发）
       out[s] = {
         active: document.querySelector('[data-testid="timeline-span-tab"][data-active="true"]').getAttribute('data-span'),
         granularity: tl ? tl.getAttribute('data-granularity') : null,
         domBuckets: buckets.length,
         summaryBuckets: tl ? tl.getAttribute('data-bucket-count') : null,
         todayIndex: tl ? tl.getAttribute('data-today-index') : null
       };
     }
     return out;`
  );
  check('可切换到本周', spanSweep.week?.active === 'week', JSON.stringify(spanSweep.week));
  check('可切换到本月', spanSweep.month?.active === 'month');
  check('可切换到本季', spanSweep.quarter?.active === 'quarter');
  check('可切换到今年', spanSweep.year?.active === 'year');

  check('本周按天展开', spanSweep.week?.granularity === 'day', `粒度 ${spanSweep.week?.granularity}`);
  check('本月按天展开', spanSweep.month?.granularity === 'day', `粒度 ${spanSweep.month?.granularity}`);
  check('本季自动降级为按周', spanSweep.quarter?.granularity === 'week', `粒度 ${spanSweep.quarter?.granularity}`);
  check('今年自动降级为按月', spanSweep.year?.granularity === 'month', `粒度 ${spanSweep.year?.granularity}`);
  check(
    '本周格子数 = 7',
    Number(spanSweep.week?.summaryBuckets) === 7,
    `实际 ${spanSweep.week?.summaryBuckets}`
  );
  check(
    '本月格子数在 28-31 之间',
    Number(spanSweep.month?.summaryBuckets) >= 28 && Number(spanSweep.month?.summaryBuckets) <= 31,
    `实际 ${spanSweep.month?.summaryBuckets}`
  );
  check(
    '本季格子数在 13-15 之间',
    Number(spanSweep.quarter?.summaryBuckets) >= 13 && Number(spanSweep.quarter?.summaryBuckets) <= 15,
    `实际 ${spanSweep.quarter?.summaryBuckets}`
  );
  check(
    '今年格子数 = 12（不会退化成 365 格）',
    Number(spanSweep.year?.summaryBuckets) === 12,
    `实际 ${spanSweep.year?.summaryBuckets}`
  );

  // ============ 组 3：回到今天 + 翻页 ============
  console.log('\n════════ 组 3/7：定位与翻页 ════════');
  const navRes = await evalJs(
    `// 读承载了跨度标签的 data-range-* 属性，不要靠 innerText 猜行号
     const readLabel = () => {
       const tl = document.querySelector('[data-testid="plan-timeline"]');
       return tl ? tl.getAttribute('data-range-label') + '@' + tl.getAttribute('data-range-start') : '';
     };
     // 先固定到本周
     document.querySelector('[data-testid="timeline-span-tab"][data-span="week"]').click();
     await new Promise(r => setTimeout(r, 500));

     const before = readLabel();
     const todayCountBefore = document.querySelectorAll('[data-bucket-today="true"]').length;

     document.querySelector('[data-testid="timeline-next"]').click();
     await new Promise(r => setTimeout(r, 500));
     const afterNext = readLabel();
     const todayCountAfterNext = document.querySelectorAll('[data-bucket-today="true"]').length;

     document.querySelector('[data-testid="timeline-today"]').click();
     await new Promise(r => setTimeout(r, 500));
     const afterBack = readLabel();
     const todayCountAfterBack = document.querySelectorAll('[data-bucket-today="true"]').length;

     return { before, afterNext, afterBack, todayCountBefore, todayCountAfterNext, todayCountAfterBack,
       nextMoved: before !== afterNext, backRestored: before === afterBack };`
  );
  check('下一段按钮会移动时间窗口', navRes.nextMoved === true, `${navRes.before} → ${navRes.afterNext}`);
  check('回到今天可一键复位', navRes.backRestored === true, `${navRes.afterNext} → ${navRes.afterBack}`);
  check('本周视图有且仅有一个「今天」格', navRes.todayCountBefore === 1, `${navRes.todayCountBefore} 个`);
  check('翻到别的周后不再有今天格', navRes.todayCountAfterNext === 0, `${navRes.todayCountAfterNext} 个`);
  check('回到今天后今天格复现', navRes.todayCountAfterBack === 1, `${navRes.todayCountAfterBack} 个`);

  // ============ 组 4：空段折叠与展开 ============
  console.log('\n════════ 组 4/7：空白折叠 ════════');
  const gapRes = await evalJs(
    `// 切到今年，12 个月里必然有连续空白段
     document.querySelector('[data-testid="timeline-span-tab"][data-span="year"]').click();
     await new Promise(r => setTimeout(r, 600));

     const bucketAll = () => document.querySelectorAll('[data-testid="timeline-bucket"]').length;
     const gapAll = () => document.querySelectorAll('[data-testid="timeline-gap"]').length;
     const toggleEl = () => document.querySelector('[data-testid="timeline-collapse-toggle"]');
     const todayEl = () => document.querySelector('[data-bucket-today="true"]');

     // 默认是「展开全部」：12 个月都在，没有空白折叠行
     const defaultBuckets = bucketAll();
     const defaultGaps = gapAll();
     const defaultCollapsed = toggleEl()?.getAttribute('data-collapsed');

     // 手动折叠：空白段被压成 gap 行
     const t1 = toggleEl();
     if (t1) { t1.click(); await new Promise(r => setTimeout(r, 600)); }
     const collapsedBuckets = bucketAll();
     const collapsedGaps = gapAll();
     const emptyCount = Number(toggleEl()?.getAttribute('data-empty-count') || 0);

     // 再展开回来
     const t2 = toggleEl();
     if (t2) { t2.click(); await new Promise(r => setTimeout(r, 600)); }
     const restoredBuckets = bucketAll();
     const restoredGaps = gapAll();

     const t = todayEl();
     return {
       defaultBuckets, defaultGaps, defaultCollapsed,
       collapsedBuckets, collapsedGaps, emptyCount, restoredBuckets, restoredGaps,
       todayPresent: !!t,
       todayHasLabel: t ? t.innerText.includes('今天') : false
     };`
  );
  check(
    '默认展开：长跨度下没有空白折叠行',
    gapRes.defaultGaps === 0,
    `${gapRes.defaultGaps} 行 / ${gapRes.defaultBuckets} 格`
  );
  check('默认折叠开关为关闭态', gapRes.defaultCollapsed === 'false', `data-collapsed=${gapRes.defaultCollapsed}`);
  check(
    '手动折叠后出现空白折叠行',
    gapRes.collapsedGaps > 0,
    `${gapRes.collapsedGaps} 行 / 压掉 ${gapRes.emptyCount} 格`
  );
  check(
    '手动折叠后格子数变少',
    gapRes.collapsedBuckets < gapRes.defaultBuckets,
    `${gapRes.defaultBuckets} → ${gapRes.collapsedBuckets}`
  );
  check(
    '展开后恢复全部真实格子',
    gapRes.restoredBuckets === gapRes.defaultBuckets && gapRes.restoredGaps === 0,
    `${gapRes.collapsedBuckets} → ${gapRes.restoredBuckets}，空白行 ${gapRes.restoredGaps}`
  );
  check('今天格不会被折叠掉', gapRes.todayPresent === true);
  check('今天格带「今天」标记', gapRes.todayHasLabel === true);

  // ============ 组 5：在时间线上加计划 ============
  console.log('\n════════ 组 5/7：时间线上新建 ════════');
  const createRes = await evalJs(
    `// 回到本月，按天粒度
     document.querySelector('[data-testid="timeline-span-tab"][data-span="month"]').click();
     await new Promise(r => setTimeout(r, 600));

     // 默认就是展开态（折叠是手动开启的），但为防前序测试残留折叠态，
     // 这里显式确认一次：若已折叠就先展开，否则格子不在 DOM 里挑不到。
     const toggle = document.querySelector('[data-testid="timeline-collapse-toggle"]');
     if (toggle && toggle.getAttribute('data-collapsed') === 'true') {
       toggle.click();
       await new Promise(r => setTimeout(r, 600));
     }

     const buckets = Array.from(document.querySelectorAll('[data-testid="timeline-bucket"]'));
     // 优先选「未来且非今天的空格」，这样语义最贴近真实用法：往以后的某天排计划
     const emptyOnes = buckets.filter(b =>
       b.getAttribute('data-bucket-today') !== 'true' &&
       b.getAttribute('data-bucket-count') === '0');
     const host = emptyOnes.find(b => b.getAttribute('data-bucket-state') === 'future') || emptyOnes[0];
     if (!host) return { err: 'no empty bucket to create into',
       sample: buckets.map(b => b.getAttribute('data-bucket-key') + '/' + b.getAttribute('data-bucket-count')) };

     const hostKey = host.getAttribute('data-bucket-key');

     // 「+」按钮上带着它要新建到哪个周期（data-add-cycle / -add-period）；
     // 这两个属性在按钮上，不在外层 li 上，别读错元素。
     const addBtn = host.querySelector('[data-testid="timeline-add"]');
     if (!addBtn) return { err: 'no add button in bucket', hostKey };
     const hostPeriod = addBtn.getAttribute('data-add-period');
     const hostCycle = addBtn.getAttribute('data-add-cycle');

     addBtn.click();
     await new Promise(r => setTimeout(r, 700));

     const modal = document.querySelector('[data-testid="plan-create-modal"]');
     if (!modal) return { err: 'modal not open', hostKey };
     const modalPeriod = modal.getAttribute('data-create-period');
     const modalCycle = modal.getAttribute('data-create-cycle');
     const titleInput = modal.querySelector('[data-testid="plan-create-title"]');
     const probeTitle = '时间线探针 ' + Date.now();

     // React 受控输入：必须用原生 setter 触发 onChange，直接赋 value 不生效
     const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
     setter.call(titleInput, probeTitle);
     titleInput.dispatchEvent(new Event('input', { bubbles: true }));
     await new Promise(r => setTimeout(r, 200));

     const submit = modal.querySelector('[data-testid="plan-create-submit"]');
     if (!submit) return { err: 'no submit' };
     submit.click();
     await new Promise(r => setTimeout(r, 900));

     const afterBuckets = Array.from(document.querySelectorAll('[data-testid="timeline-bucket"]'));
     const target = afterBuckets.find(b => b.getAttribute('data-bucket-key') === hostKey);
     const inTarget = target
       ? Array.from(target.querySelectorAll('[data-testid="timeline-node"]'))
           .map(n => n.getAttribute('data-node-id'))
       : [];
     const allNodes = Array.from(document.querySelectorAll('[data-testid="timeline-node"]'));
     const probeNode = allNodes.find(n => (n.innerText || '').includes('时间线探针'));
     const stored = JSON.parse(localStorage.getItem('life_coach_plan_nodes') || '[]')
       .filter(n => (n.title || '').startsWith('时间线探针'));

     return {
       hostKey, hostPeriod, hostCycle, modalPeriod, modalCycle, probeTitle,
       modalClosed: !document.querySelector('[data-testid="plan-create-modal"]'),
       targetCount: target ? target.getAttribute('data-bucket-count') : null,
       probeInTarget: probeNode ? inTarget.includes(probeNode.getAttribute('data-node-id')) : false,
       probeNodeId: probeNode ? probeNode.getAttribute('data-node-id') : null,
       probeCycle: probeNode ? probeNode.getAttribute('data-node-cycle') : null,
       stored: stored.map(s => ({ cycle: s.cycle, periodKey: s.periodKey, title: s.title }))
     };`
  );

  if (createRes.err) {
    check('可在时间格上点「+」新建', false, JSON.stringify(createRes).slice(0, 240));
  } else {
    check('可在时间格上点「+」新建', createRes.modalCycle !== null, `弹窗周期 ${createRes.modalCycle} / ${createRes.modalPeriod}`);
    check(
      '弹窗继承被点击那格的周期键（不是今天）',
      createRes.modalPeriod === createRes.hostPeriod,
      `格 ${createRes.hostPeriod} vs 弹窗 ${createRes.modalPeriod}`
    );
    check('创建后弹窗自动关闭', createRes.modalClosed === true);
    check(
      '新节点落到被点击的那一格',
      createRes.probeInTarget === true,
      `格子 ${createRes.hostKey} 内 ${createRes.targetCount} 项`
    );
    check(
      '存储中的周期键与格子一致',
      createRes.stored.length === 1 &&
        createRes.stored[0].periodKey === createRes.hostPeriod &&
        createRes.stored[0].cycle === createRes.hostCycle,
      JSON.stringify(createRes.stored)
    );
  }

  // ============ 组 6：标签点开可编辑 ============
  console.log('\n════════ 组 6/7：卡片交互 ════════');
  const clickNode = await evalJs(
    `const nodes = Array.from(document.querySelectorAll('[data-testid="timeline-node"]'));
     if (!nodes.length) return { err: 'no timeline node rendered' };
     const n = nodes.find(x => (x.innerText || '').includes('时间线探针')) || nodes[0];
     const id = n.getAttribute('data-node-id');
     n.click();
     await new Promise(r => setTimeout(r, 700));
     const createModal = document.querySelector('[data-testid="plan-create-modal"]');
     const editModal = document.querySelector('[data-testid="plan-edit-modal"]');
     return {
       id,
       opened: !!(createModal || editModal),
       isCreate: !!createModal,
       editNodeId: editModal ? editModal.getAttribute('data-edit-node-id') : null,
       // 编辑弹窗是受控输入，标题会作为 input.value 出现，不在 innerText 里
       titleValue: editModal
         ? (editModal.querySelector('input[type="text"]')?.value || '')
         : null
     };`
  );
  check('时间线卡片可点击', !clickNode.err, clickNode.err || '');
  check(
    '点击卡片打开的是编辑弹窗而不是新建弹窗',
    clickNode.opened === true && clickNode.isCreate === false,
    JSON.stringify({ opened: clickNode.opened, isCreate: clickNode.isCreate })
  );
  check(
    '编辑弹窗绑定的是被点击的那个节点',
    clickNode.editNodeId === clickNode.id,
    `点击 ${clickNode.id} vs 弹窗 ${clickNode.editNodeId}`
  );
  check(
    '编辑弹窗带出该节点标题',
    typeof clickNode.titleValue === 'string' && clickNode.titleValue.trim().length > 0,
    `标题输入框内容「${clickNode.titleValue}」`
  );

  // 关掉编辑弹窗，避免影响后续
  const closed = await evalJs(
    `const editModal = document.querySelector('[data-testid="plan-edit-modal"]');
     if (editModal) {
       const cancel = Array.from(editModal.querySelectorAll('button'))
         .find(b => b.innerText.trim() === '取消');
       if (cancel) cancel.click();
     }
     await new Promise(r => setTimeout(r, 500));
     return { stillOpen: !!document.querySelector('[data-testid="plan-edit-modal"]') };`
  );
  check('编辑弹窗可取消关闭', closed.stillOpen === false);

  // ============ 组 7：切回层级树再切回时间线 ============
  console.log('\n════════ 组 7/7：视图互不破坏 ════════');
  const toggleRes = await evalJs(
    `document.querySelector('[data-testid="plan-view-list"]').click();
     await new Promise(r => setTimeout(r, 800));
     const listState = {
       view: document.querySelector('[data-testid="plan-view-switch"]').getAttribute('data-view'),
       timelineGone: !document.querySelector('[data-testid="plan-timeline"]'),
       nodes: document.querySelectorAll('[data-testid="plan-node"]').length,
       cycleTabs: document.querySelectorAll('[data-testid="plan-cycle-tab"]').length
     };

     document.querySelector('[data-testid="plan-view-timeline"]').click();
     await new Promise(r => setTimeout(r, 800));

     // 视图切换会卸载时间线，跨度回到默认值（=当前层级）。
     // 探针节点建在本月的某一天，未必落在本周，所以先切到本月再看。
     document.querySelector('[data-testid="timeline-span-tab"][data-span="month"]').click();
     await new Promise(r => setTimeout(r, 700));
     const toggle = document.querySelector('[data-testid="timeline-collapse-toggle"]');
     if (toggle && toggle.getAttribute('data-collapsed') === 'true') {
       toggle.click();
       await new Promise(r => setTimeout(r, 600));
     }

     const tlState = {
       view: document.querySelector('[data-testid="plan-view-switch"]').getAttribute('data-view'),
       timelineBack: !!document.querySelector('[data-testid="plan-timeline"]'),
       buckets: document.querySelectorAll('[data-testid="timeline-bucket"]').length,
       hasProbe: Array.from(document.querySelectorAll('[data-testid="timeline-node"]'))
         .some(n => (n.innerText || '').includes('时间线探针')),
       probeIds: Array.from(document.querySelectorAll('[data-testid="timeline-node"]'))
         .filter(n => (n.innerText || '').includes('时间线探针'))
         .map(n => n.getAttribute('data-node-id'))
     };
     return { listState, tlState };`
  );
  check('可切到层级树', toggleRes.listState?.view === 'list', JSON.stringify(toggleRes.listState));
  check('层级树下时间线被卸载', toggleRes.listState?.timelineGone === true);
  check('层级树渲染出节点', toggleRes.listState?.nodes > 0, `${toggleRes.listState?.nodes} 个`);
  check('层级树下层级 Tab 仍在', toggleRes.listState?.cycleTabs === 5);
  check('可切回时间线', toggleRes.tlState?.view === 'timeline' && toggleRes.tlState?.timelineBack === true);
  check('切回后刻度正常重建', toggleRes.tlState?.buckets > 0, `${toggleRes.tlState?.buckets} 格`);
  check('切回后新建的节点仍在时间线上', toggleRes.tlState?.hasProbe === true);

  // ============ 截图 ============
  const shotDir = path.join(ROOT, 'shots');
  fs.mkdirSync(shotDir, { recursive: true });
  for (const s of ['week', 'month', 'year']) {
    await evalJs(
      `document.querySelector('[data-testid="timeline-span-tab"][data-span="${s}"]').click();
       await new Promise(r => setTimeout(r, 700));
       window.scrollTo(0, 0);
       return { ok: true };`
    );
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    const p = path.join(shotDir, `16-timeline-${s}.png`);
    fs.writeFileSync(p, Buffer.from(data, 'base64'));
    console.log(`\n📸 截图：${p}`);
  }

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
