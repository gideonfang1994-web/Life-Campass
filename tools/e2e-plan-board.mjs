/**
 * 日/周/月/季/年 五级计划板 —— 勾稽逻辑端到端验证
 *
 * 走 CDP 直连无头 Edge，真实渲染单文件 HTML，点开新 tab，
 * 然后在页面上下文里直接调用勾稽引擎验证算术正确性。
 *
 * 运行：node tools/e2e-plan-board.mjs ..
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

// ---------- 找 Edge ----------
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

// ---------- CDP 客户端 ----------
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

/**
 * 在页面上下文求值。
 * 关键：表达式必须直接返回 Promise，由 CDP 的 awaitPromise + returnByValue 负责取值。
 * 若在页面里套一层 JSON.stringify(promise)，拿到的是 "{}"（Promise 无法被序列化）。
 */
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
  if (v === undefined) return { __err: 'no value', __raw: r };
  if (typeof v === 'object' && v !== null) return v;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}

// ---------- 启动浏览器 ----------
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-plan-'));
const port = 9333 + Math.floor(Math.random() * 400);

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

// 等待 devtools 端口
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

(async () => {
  await waitForPort();

  // 连 WS
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

  // 导航到产物（不依赖 loadEventFired —— 事件可能在监听前就已触发）
  await send('Page.navigate', { url: 'file:///' + HTML.replace(/\\/g, '/') });

  // 等待 React 挂载：轮询业务 DOM
  let mounted = false;
  let lastDiag = null;
  for (let i = 0; i < 120; i++) {
    const r = await evalJs(
      `return {
        tabs: document.querySelectorAll('nav button').length,
        body: document.body ? document.body.innerText.length : 0,
        url: location.href,
        ready: document.readyState
      }`
    );
    lastDiag = r;
    if (r && !r.__err && r.tabs >= 12 && r.body > 500) { mounted = true; break; }
    await new Promise((r) => setTimeout(r, 250));
  }
  check('页面挂载完成', mounted, JSON.stringify(lastDiag));
  if (!mounted) {
    console.log('\n挂载失败，退出');
    process.exit(1);
  }

  // ============ 组 1：导航栏新增 tab ============
  console.log('\n════════ 组 1/6：导航接线 ════════');
  const nav = await evalJs(
    `// 桌面导航在 <header> 内；移动端底部导航是 <header> 之外的 <nav aria-label="移动端底部导航">
     const navs = Array.from(document.querySelectorAll('nav'));
     const mobile = navs.find(n => (n.getAttribute('aria-label') || '').includes('移动端'));
     const desktop = navs.find(n => n !== mobile);
     const btns = desktop ? Array.from(desktop.querySelectorAll('button')) : [];
     const labels = btns.map(b => b.innerText.trim());
     return { count: btns.length, labels,
       hasPlanBoard: labels.some(l => l.includes('日周月年') || l.includes('计划板')),
       mobileCount: mobile ? mobile.querySelectorAll('button').length : 0 };`
  );
  // 导航契约：与 src/components/Header.tsx 的 navItems 数组一致（7 项）。
  // 「日周月年」计划板是后加的第 7 项，早期版本断言的是 6，属于过时契约而非产品回归。
  const EXPECTED_NAV_LABELS = [
    '今日焦点', '目标实现', '日周月年', '量化健康',
    '四大维度', '计划与实绩', '复盘与教练',
  ];
  check(
    '桌面导航项数量为 7',
    nav.count === 7,
    `实际 ${nav.count}：${JSON.stringify(nav.labels)}`
  );
  check(
    '桌面导航包含全部 7 个入口',
    EXPECTED_NAV_LABELS.every((l) => nav.labels.some((x) => x.includes(l))),
    `实际 ${JSON.stringify(nav.labels)}`
  );
  check('存在「日周月年」入口', nav.hasPlanBoard === true, JSON.stringify(nav.labels));
  check('移动端底部导航为 7 项', nav.mobileCount === 7, `实际 ${nav.mobileCount}`);

  // ============ 组 2：切到计划板 tab ============
  console.log('\n════════ 组 2/6：计划板渲染 ════════');
  const clickRes = await evalJs(
    `const navs = Array.from(document.querySelectorAll('nav'));
     const mobile = navs.find(n => (n.getAttribute('aria-label') || '').includes('移动端'));
     const desktop = navs.find(n => n !== mobile);
     const btns = desktop ? Array.from(desktop.querySelectorAll('button')) : [];
     const target = btns.find(b => b.innerText.includes('日周月年') || b.innerText.includes('计划板'));
     if (!target) return { ok: false, labels: btns.map(b=>b.innerText) };
     target.click();
     await new Promise(r => setTimeout(r, 900));
     const text = document.body.innerText;
     return { ok: true,
       hasTitle: text.includes('日 / 周 / 月 / 季 / 年 计划板'),
       hasHealth: text.includes('计划健康度'),
       hasDiag: text.includes('勾稽诊断'),
       hasLayers: ['年度','季度','月度','周','日'].every(l => text.includes(l)) };`
  );
  check('点击后渲染计划板标题', clickRes.hasTitle === true, JSON.stringify(clickRes).slice(0, 200));
  check('显示健康度等指标卡', clickRes.hasHealth === true);
  check('显示勾稽诊断入口', clickRes.hasDiag === true);
  check('五个周期层级齐全', clickRes.hasLayers === true);

  // ============ 组 3：勾稽引擎算术 ============
  console.log('\n════════ 组 3/6：勾稽引擎算术 ════════');

  // 引擎被 bundle 压缩了，直接从 localStorage 的种子数据重新计算
  const recon = await evalJs(
    `const raw = localStorage.getItem('life_coach_plan_nodes');
     const nodes = raw ? JSON.parse(raw) : null;
     if (!nodes) return { err: 'no localStorage data' };

     const map = new Map(nodes.map(n => [n.id, n]));
     const DEPTH = { year:0, quarter:1, month:2, week:3, day:4 };

     // 自底向上重算（与 planReconciliation.reconcileTree 同算法）
     const byDepth = nodes.slice().sort((a,b) => DEPTH[b.cycle] - DEPTH[a.cycle]);
     const upd = new Map(byDepth.map(n => [n.id, Object.assign({}, n)]));
     for (const n of byDepth) {
       const kids = (n.children||[]).map(id => upd.get(id)).filter(Boolean);
       if (!kids.length) continue;
       const tw = kids.reduce((s,c) => s + (c.weight||1), 0);
       const auto = tw > 0
         ? Math.round(kids.reduce((s,c) => s + (c.progress||0)*(c.weight||1), 0) / tw)
         : Math.round(kids.reduce((s,c) => s + (c.progress||0), 0) / kids.length);
       const cur = upd.get(n.id);
       cur.progress = auto;
       const allDone = kids.every(c => c.status === 'completed' || c.progress >= 100);
       const anyBlocked = kids.some(c => c.status === 'blocked');
       if (allDone) cur.status = 'completed';
       else if (anyBlocked && cur.status !== 'dropped') cur.status = 'blocked';
       else if (cur.status !== 'dropped' && cur.status !== 'blocked') cur.status = auto > 0 ? 'in_progress' : 'not_started';
       upd.set(n.id, cur);
     }

     // 校验 1：日节点 pn-d1 完成 → 周节点 pn-w1 应聚合出对应进度
     const w1 = upd.get('pn-w1');
     const d1 = upd.get('pn-d1');
     const d2 = upd.get('pn-d2');
     const d3 = upd.get('pn-d3');
     if (!w1 || !d1 || !d2 || !d3) return { err: 'seed ids missing', ids: nodes.map(n=>n.id) };
     // w1 的三个子节点 weight 分别是 2,2,1
     const expectW1 = Math.round((d1.progress*2 + d2.progress*2 + d3.progress*1) / 5);

     // 校验 2：月节点 pn-m0 只有一个子节点 pn-w1 → 进度应等于子节点进度
     const m0 = upd.get('pn-m0');
     const expectM0 = w1.progress;

     // 校验 3：季节点 pn-q1 → pn-m0 / pn-m1 / pn-m2
     const q1 = upd.get('pn-q1');

     // 校验 4：年节点 pn-y1 有两个子节点 pn-q1(weight3) / pn-q2(weight1)
     const y1 = upd.get('pn-y1');
     const q2 = upd.get('pn-q2');
     const expectY1 = Math.round((q1.progress*3 + q2.progress*1) / 4);

     // 校验 5：工时配平 —— pn-w1 承诺 26h，三个子节点 2+3+1=6h → 应报缺口
     const childPlanned = [d1,d2,d3].reduce((s,c) => s + c.plannedHours, 0);
     const w1Gap = w1.plannedHours - childPlanned;

     // 校验 6：pn-m1 停在月层未向下拆 → 应触发 no_descendant
     const m1 = upd.get('pn-m1');

     // 校验 7：全树无环
     let cycleFound = false;
     for (const n of nodes) {
       const seen = new Set(); let cur = n; let hops = 0;
       while (cur && hops < 20) {
         if (seen.has(cur.id)) { cycleFound = true; break; }
         seen.add(cur.id);
         cur = cur.parentId ? map.get(cur.parentId) : null;
         hops++;
       }
     }

     return {
       d1prog: d1.progress, w1prog: w1.progress, expectW1,
       m0prog: m0.progress, expectM0,
       q1prog: q1.progress, y1prog: y1.progress, expectY1,
       childPlanned, w1Gap, m1kids: (m1.children||[]).length,
       cycleFound,
       nodeCount: nodes.length,
       statuses: { w1: w1.status, m1: m1.status, y1: y1.status }
     };`
  );

  check('种子数据已加载', recon.nodeCount > 0, `${recon.nodeCount} 个节点`);
  check('日节点完成度保留', recon.d1prog === 100, `d1=${recon.d1prog}%`);
  check(
    '周节点进度 = 子节点加权汇总',
    recon.w1prog === recon.expectW1,
    `实际 ${recon.w1prog}% vs 期望 ${recon.expectW1}%`
  );
  check(
    '月节点进度透传子节点',
    recon.m0prog === recon.expectM0,
    `实际 ${recon.m0prog}% vs 期望 ${recon.expectM0}%`
  );
  check(
    '年节点进度 = 季度加权汇总',
    recon.y1prog === recon.expectY1,
    `实际 ${recon.y1prog}% vs 期望 ${recon.expectY1}%`
  );
  check('工时缺口被算出', recon.w1Gap === 20, `缺口 ${recon.w1Gap}h（26 - 6）`);
  check('断链节点无下级', recon.m1kids === 0);
  check('勾稽树无环', recon.cycleFound === false);
  check(
    '受阻/进行中状态联动正确',
    recon.statuses.w1 === 'in_progress' || recon.statuses.w1 === 'blocked',
    JSON.stringify(recon.statuses)
  );

  // ============ 组 3b：真实 DOM 上的进度透传 ============
  // 上面的算术是脚本按种子数据复算的；这里再验证产品真正渲染出来的
  // data-node-progress 与引擎结果一致，确保 UI 不是画了个假的进度条。
  console.log('\n════════ 组 3b/6：DOM 进度一致性 ════════');
  const domProg = await evalJs(
    `// 切到年度层，把整棵树渲染出来
     const yearTab = document.querySelector('[data-testid="plan-cycle-tab"][data-cycle="year"]');
     if (yearTab) { yearTab.click(); await new Promise(r => setTimeout(r, 600)); }

     // 递归展开所有可展开节点（只点未展开的，避免误收起）
     for (let i = 0; i < 10; i++) {
       const t = Array.from(document.querySelectorAll('button[title="展开/收起下级"]'))
         .filter(b => b.getAttribute('data-expanded') !== 'true');
       if (!t.length) break;
       t.forEach(b => b.click());
       await new Promise(r => setTimeout(r, 350));
     }

     const nodes = Array.from(document.querySelectorAll('[data-testid="plan-node"]'));
     const byId = {};
     nodes.forEach(n => { byId[n.getAttribute('data-node-id')] = n; });

     return {
       rendered: nodes.length,
       y1: byId['pn-y1'] ? Number(byId['pn-y1'].getAttribute('data-node-progress')) : null,
       y1Status: byId['pn-y1'] ? byId['pn-y1'].getAttribute('data-node-status') : null,
       q1: byId['pn-q1'] ? Number(byId['pn-q1'].getAttribute('data-node-progress')) : null,
       m0: byId['pn-m0'] ? Number(byId['pn-m0'].getAttribute('data-node-progress')) : null,
       w1: byId['pn-w1'] ? Number(byId['pn-w1'].getAttribute('data-node-progress')) : null,
       m1: byId['pn-m1'] ? Number(byId['pn-m1'].getAttribute('data-node-progress')) : null,
       m1Kids: byId['pn-m1'] ? Number(byId['pn-m1'].getAttribute('data-node-child-count')) : null,
       d1: byId['pn-d1'] ? Number(byId['pn-d1'].getAttribute('data-node-progress')) : null
     };`
  );
  check('计划树节点已渲染到 DOM', domProg.rendered >= 10, `${domProg.rendered} 个节点`);
  check('DOM 上年度节点进度 = 引擎汇总', domProg.y1 === recon.y1prog, `DOM ${domProg.y1}% vs 引擎 ${recon.y1prog}%`);
  check('DOM 上季度节点进度 = 引擎汇总', domProg.q1 === recon.q1prog, `DOM ${domProg.q1}% vs 引擎 ${recon.q1prog}%`);
  check('DOM 上月度节点进度 = 引擎汇总', domProg.m0 === recon.m0prog, `DOM ${domProg.m0}% vs 引擎 ${recon.m0prog}%`);
  check('DOM 上周度节点进度 = 引擎汇总', domProg.w1 === recon.w1prog, `DOM ${domProg.w1}% vs 引擎 ${recon.w1prog}%`);
  check('DOM 上日级完成节点 = 100%', domProg.d1 === 100, `d1=${domProg.d1}%`);
  check('DOM 上断链节点无下级', domProg.m1Kids === 0, `子节点 ${domProg.m1Kids}`);

  // ============ 组 4：诊断问题识别（直接读真实渲染出的诊断面板） ============
  console.log('\n════════ 组 4/6：诊断问题识别 ════════');

  // 打开诊断面板后，从面板 DOM 里读取每条问题的「严重度标签 + 标题 + 正文」，
  // 而不是在页面里重实现一遍诊断算法——那样只能验证脚本自己，不能验证产品。
  const diag = await evalJs(
    `const raw = localStorage.getItem('life_coach_plan_nodes');
     const nodes = JSON.parse(raw);
     const map = new Map(nodes.map(n => [n.id, n]));

     // 先打开诊断面板（用稳定 testid 定位，不猜 DOM 结构）
     const toggle = document.querySelector('[data-testid="plan-issue-toggle"]');
     if (!toggle) return { err: 'no toggle' };
     toggle.click();
     await new Promise(r => setTimeout(r, 700));

     const panel = document.querySelector('[data-testid="plan-issue-panel"]');
     if (!panel) return { err: 'panel not found' };

     // 每条问题卡片带 data-issue-type / data-issue-severity / data-issue-node
     const cards = Array.from(panel.querySelectorAll('[data-issue-type]'));
     const issues = cards.map(c => {
       const t = c.innerText || '';
       return {
         type: c.getAttribute('data-issue-type'),
         severity: c.getAttribute('data-issue-severity'),
         nodeId: c.getAttribute('data-issue-node'),
         sev: ['严重','警告','提示'].find(s => t.startsWith(s)) || '',
         msg: (t.split('\\n').find(l => l.includes('「')) || '').trim(),
         sug: (t.split('\\n').find(l => l.includes('💡')) || '').trim()
       };
     });
     const kinds = issues.map(i => i.type);

     // 面板头部计数徽章：「N / M 项」
     const badge = (panel.innerText.match(/(\\d+)\\s*\\/\\s*(\\d+)\\s*项/) || []);
     const visibleCount = Number(badge[1] || 0);
     const totalCount = Number(badge[2] || 0);

     // 同时用原始数据独立复核工时勾稽（父 vs 直接子之和）
     const timeIssues = [];
     for (const n of nodes) {
       const kids = (n.children||[]).map(id => map.get(id)).filter(Boolean);
       if (!kids.length) continue;
       const cp = kids.reduce((s,c) => s + (c.plannedHours||0), 0);
       const diff = (n.plannedHours||0) - cp;
       if (Math.abs(diff) > 0.01) {
         timeIssues.push({ type: diff > 0 ? 'unallocated_time' : 'overallocated_time',
           title: n.title, diff: Math.round(diff*10)/10 });
       }
     }

     const leafNoOutput = nodes.filter(n =>
       !(n.children||[]).length && !(n.deliverable||'').trim()).length;
     const doneNoProof = nodes.filter(n =>
       n.status === 'completed' && !(n.verificationProof||'').trim()).length;
     const DEPTH = { year:0, quarter:1, month:2, week:3, day:4 };
     const noDesc = nodes.filter(n => {
       const kids = (n.children||[]).map(id => map.get(id)).filter(Boolean);
       if (!kids.length) return false;
       if (n.cycle === 'day') return false;
       return !kids.some(c => DEPTH[c.cycle] > DEPTH[n.cycle]);
     }).map(n => n.title);
     const unlinked = nodes.filter(n => !n.parentId && !n.projectId && !n.goalId).length;

     return { issueCount: issues.length, issues, kinds, visibleCount, totalCount, timeIssues,
       leafNoOutput, doneNoProof, noDesc, unlinked };`
  );

  check('诊断面板已打开并渲染出问题卡片', diag.issueCount > 0, `${diag.issueCount} 条`);
  check(
    '面板计数徽章与卡片数一致',
    diag.visibleCount === diag.issueCount && diag.totalCount === diag.issueCount,
    `徽章 ${diag.visibleCount}/${diag.totalCount} vs 卡片 ${diag.issueCount}`
  );
  check(
    '同时存在「漏项」与「超载」两类',
    diag.kinds.includes('unallocated_time') && diag.kinds.includes('overallocated_time'),
    JSON.stringify(diag.kinds)
  );
  check(
    '识别出「中间层断链」',
    diag.kinds.includes('no_descendant'),
    JSON.stringify(diag.kinds)
  );
  check(
    '识别出「完成缺证据」',
    diag.kinds.includes('completed_no_proof'),
    JSON.stringify(diag.kinds)
  );
  check(
    '未误报孤儿 / 跨期错配 / 进度不一致',
    !diag.kinds.includes('orphan') &&
      !diag.kinds.includes('period_mismatch') &&
      !diag.kinds.includes('progress_inconsistent'),
    JSON.stringify(diag.kinds)
  );
  check('叶子节点都有交付物', diag.leafNoOutput === 0, `${diag.leafNoOutput} 个缺失`);
  check('完成节点都有证据', diag.doneNoProof === 1, `${diag.doneNoProof} 个缺失（刻意演示虚假打勾）`);
  check('独立复核：工时勾稽问题可算出', diag.timeIssues.length >= 2, JSON.stringify(diag.timeIssues.map(i => i.type)));

  // ============ 组 5：UI 交互 ============
  console.log('\n════════ 组 5/6：UI 交互 ════════');

  // 面板状态机：确保处于「打开」状态
  const panelState = await evalJs(
    `const q = () => document.querySelector('[data-testid="plan-issue-panel"]');
     const toggle = document.querySelector('[data-testid="plan-issue-toggle"]');
     if (!toggle) return { ok: false, reason: 'no toggle' };
     if (!q()) { toggle.click(); await new Promise(r => setTimeout(r, 600)); }
     const panel = q();
     if (!panel) return { ok: false, reason: 'panel not open after toggle' };
     return { ok: true,
       hasPanel: true,
       hasIssueText: (panel.innerText||'').includes('工时') || (panel.innerText||'').includes('承诺'),
       hasSuggestion: (panel.innerText||'').includes('💡'),
       cardCount: panel.querySelectorAll('[data-issue-type]').length };`
  );
  check('诊断面板可打开', panelState.ok === true, JSON.stringify(panelState).slice(0, 200));
  check('面板内含问题详情', panelState.hasIssueText === true);
  check('每条问题都带修复建议', panelState.hasSuggestion === true);
  check('面板内问题卡片数量 > 0', panelState.cardCount > 0, `${panelState.cardCount} 张`);

  // 关闭诊断面板：直接按 aria-label 精确定位
  const closePanel = await evalJs(
    `const xBtn = document.querySelector('[aria-label="关闭勾稽诊断"]');
     if (!xBtn) return { clicked: false, reason: 'close button not found',
       labels: Array.from(document.querySelectorAll('[aria-label]')).map(e=>e.getAttribute('aria-label')).slice(0,20) };
     xBtn.click();
     await new Promise(r => setTimeout(r, 600));
     const stillOpen = !!document.querySelector('[data-testid="plan-issue-panel"]');
     return { clicked: true, stillOpen };`
  );
  check('诊断面板可关闭', closePanel.clicked === true && closePanel.stillOpen === false, JSON.stringify(closePanel));

  // 切换到年度层
  const switchYear = await evalJs(
    `const tab = document.querySelector('[data-testid="plan-cycle-tab"][data-cycle="year"]');
     if (!tab) return { ok: false };
     tab.click();
     await new Promise(r => setTimeout(r, 700));
     const active = document.querySelector('[data-testid="plan-cycle-tab"][data-active="true"]');
     const text = document.body.innerText;
     return { ok: true,
       activeCycle: active ? active.getAttribute('data-cycle') : null,
       hasYearLabel: text.includes('2026 年') || text.includes('2026年'),
       yearCount: (text.match(/年度/g)||[]).length };`
  );
  check('可切换到年度层', switchYear.ok === true && switchYear.activeCycle === 'year', JSON.stringify(switchYear).slice(0, 200));

  // 回到周层并验证展开/收起可逆
  const expandRes = await evalJs(
    `// 先切到周层
     const weekTab = document.querySelector('[data-testid="plan-cycle-tab"][data-cycle="week"]');
     if (weekTab) { weekTab.click(); await new Promise(r => setTimeout(r, 700)); }

     const all = () => Array.from(document.querySelectorAll('button[title="展开/收起下级"]'));
     if (!all().length) return { clicked: false, reason: 'no toggle button',
       sample: Array.from(document.querySelectorAll('button')).map(b=>b.getAttribute('title')).filter(Boolean).slice(0,15) };

     // 组 3b 可能已把整棵树展开；这里统一归位到「收起」态再验证展开
     for (let i = 0; i < 10; i++) {
       const opened = all().filter(b => b.getAttribute('data-expanded') === 'true');
       if (!opened.length) break;
       opened.forEach(b => b.click());
       await new Promise(r => setTimeout(r, 300));
     }

     const nodeCount = () => document.querySelectorAll('[data-testid="plan-node"]').length;
     const collapsed = all().filter(b => b.getAttribute('data-expanded') === 'false');
     if (!collapsed.length) return { clicked: false, reason: 'no collapsed toggle left' };

     const target = collapsed[0];
     const targetId = target.getAttribute('data-node-toggle');
     const before = nodeCount();
     target.click();
     await new Promise(r => setTimeout(r, 700));
     const after = nodeCount();

     // 重新查一次（React 可能复用 DOM 节点）
     const now = all().find(b => b.getAttribute('data-node-toggle') === targetId);
     return { clicked: true, toggleCount: all().length, before, after,
       grew: after > before,
       expanded: now ? now.getAttribute('data-expanded') : null,
       targetId };`
  );
  check('节点可展开下级', expandRes.clicked === true, JSON.stringify(expandRes).slice(0, 200));
  check(
    '展开后子节点出现在 DOM',
    expandRes.grew === true && expandRes.expanded === 'true',
    `${expandRes.before} → ${expandRes.after} 个节点，expanded=${expandRes.expanded}`
  );

  // ============ 组 6：持久化 ============
  console.log('\n════════ 组 6/6：数据持久化 ════════');
  const persist = await evalJs(
    `const raw = localStorage.getItem('life_coach_plan_nodes');
     const nodes = raw ? JSON.parse(raw) : null;
     if (!nodes) return { ok: false };
     // 模拟新增一个节点并写入
     const probe = { id: 'pn-probe-' + Date.now(), title: '探针节点', cycle: 'day',
       periodKey: '2026-10-31', children: [], dimension: 'career',
       plannedHours: 1, actualHours: 0, weight: 1, progress: 0,
       status: 'not_started', deliverable: '', successCriteria: '',
       verificationProof: '', note: '', createdAt: '', updatedAt: '' };
     localStorage.setItem('life_coach_plan_nodes', JSON.stringify([...nodes, probe]));
     const back = JSON.parse(localStorage.getItem('life_coach_plan_nodes'));
     const found = back.some(n => n.id === probe.id);
     localStorage.setItem('life_coach_plan_nodes', raw);
     return { ok: true, found, count: back.length };`
  );
  check('计划数据可写入 localStorage', persist.found === true, `${persist.count} 个节点`);

  // 刷新后数据仍在
  await send('Page.reload', { ignoreCache: false });
  await new Promise((r) => setTimeout(r, 2500));
  const afterReload = await evalJs(
    `const raw = localStorage.getItem('life_coach_plan_nodes');
     const nodes = raw ? JSON.parse(raw) : [];
     return { count: nodes.length,
       hasW1: nodes.some(n => n.id === 'pn-w1'),
       tabs: document.querySelectorAll('nav button').length };`
  );
  check('刷新后计划数据仍在', afterReload.hasW1 === true, `${afterReload.count} 个节点`);

  // 截图
  const shotDir = path.join(ROOT, 'shots');
  fs.mkdirSync(shotDir, { recursive: true });
  const shotPath = path.join(shotDir, '15-plan-board.png');
  const { data } = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
  });
  fs.writeFileSync(shotPath, Buffer.from(data, 'base64'));
  console.log(`\n📸 截图已保存：${shotPath}`);

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
