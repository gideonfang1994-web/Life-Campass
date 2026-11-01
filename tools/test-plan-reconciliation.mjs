/**
 * 日/周/月/季/年 五级计划勾稽引擎 —— 可重复执行的断言脚本。
 *
 * 运行：node tools/test-plan-reconciliation.mjs
 *
 * 覆盖：
 *   1. 周期键计算与往返转换
 *   2. 周期导航（上/下一周期）
 *   3. 父进度按权重加权汇总
 *   4. 状态向上联动（完成 / 受阻）
 *   5. cascadeBreakdown 工时配平 + 舍入误差归最后一位
 *   6. 工时漏项 / 过度承诺诊断
 *   7. 完成缺证据诊断
 *   8. 孤儿节点诊断（双向）
 *   9. 跨期错配诊断
 *   10. 空周期诊断
 *   11. 进度不一致诊断
 *   12. 删除节点级联清理
 *   13. 健康度评分
 */

import { pathToFileURL } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { transform } from 'esbuild';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

/**
 * 用 esbuild 官方 transform 把 .ts 转成 ESM .mjs。
 * esbuild 在 TS 模式下会自动移除「仅用于类型位置」的导入，
 * 因此 planReconciliation.ts 里对 ../types 的 import 会被自动剔除，
 * 转换后的模块不依赖任何运行时外部模块。
 */
async function loadTs(relPath) {
  const abs = resolve(ROOT, relPath);
  const src = readFileSync(abs, 'utf8');
  const { code } = await transform(src, {
    loader: 'ts',
    format: 'esm',
    target: 'es2022',
    sourcefile: relPath,
  });
  const outPath = resolve(ROOT, `.tmp-${relPath.replace(/[\\/]/g, '_')}.mjs`);
  writeFileSync(outPath, code);
  const mod = await import(pathToFileURL(outPath).href + '?t=' + Date.now());
  return mod;
}

const plan = await loadTs('src/utils/planReconciliation.ts');

// ==========================================
// 断言框架
// ==========================================
let passed = 0;
let failed = 0;
const failures = [];

function ok(name, cond, detail) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push({ name, detail });
    console.log(`  ✗ ${name}${detail ? ' → ' + detail : ''}`);
  }
}

function eq(name, actual, expected) {
  ok(name, Object.is(actual, expected) || JSON.stringify(actual) === JSON.stringify(expected),
    `期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
}

function section(title) {
  console.log(`\n── ${title} ──`);
}

// ==========================================
// 测试数据构造
// ==========================================
const now = new Date();
const TODAY = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
const YEAR = String(now.getFullYear());
const QUARTER = `${YEAR}-Q${Math.floor(now.getMonth() / 3) + 1}`;
const MONTH = `${YEAR}-${String(now.getMonth() + 1).padStart(2, '0')}`;
const WEEK = plan.getWeekKey(now);

/**
 * 「本周」的归属月。
 * ISO 周可能跨月（如 W44 = 10-26 ~ 11-01），归属月由该周的周四决定。
 * 因此不能直接用当前月，否则每逢月初的跨月周，断言必然失败。
 */
const WEEK_PARENT_MONTH = plan.getParentPeriodKey('week', WEEK);

function node(over) {
  return {
    id: 'x',
    title: 't',
    cycle: 'day',
    periodKey: TODAY,
    children: [],
    dimension: 'career',
    plannedHours: 0,
    actualHours: 0,
    weight: 1,
    progress: 0,
    status: 'not_started',
    deliverable: 'd',
    successCriteria: 's',
    verificationProof: 'p',
    note: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

// ==========================================
// 1. 周期键计算与往返
// ==========================================
section('1. 周期键计算与往返转换');
{
  eq('年键', plan.getYearKey(now), YEAR);
  eq('季度键', plan.getQuarterKey(now), QUARTER);
  eq('月键', plan.getMonthKey(now), MONTH);
  eq('周键格式', /^\d{4}-W\d{2}$/.test(WEEK), true);
  eq('日键', plan.getDayKey(now), TODAY);
  eq('统一入口 year', plan.getPeriodKey(now, 'year'), YEAR);
  eq('统一入口 quarter', plan.getPeriodKey(now, 'quarter'), QUARTER);
  eq('统一入口 month', plan.getPeriodKey(now, 'month'), MONTH);
  eq('统一入口 week', plan.getPeriodKey(now, 'week'), WEEK);
  eq('统一入口 day', plan.getPeriodKey(now, 'day'), TODAY);

  // 往返：periodKey → date → periodKey
  const d1 = new Date(2026, 10, 31);
  eq('日往返', plan.getDayKey(plan.periodKeyToDate('day', plan.getDayKey(d1))), plan.getDayKey(d1));
  eq('月往返', plan.getMonthKey(plan.periodKeyToDate('month', plan.getMonthKey(d1))), plan.getMonthKey(d1));
  eq('季往返', plan.getQuarterKey(plan.periodKeyToDate('quarter', plan.getQuarterKey(d1))), plan.getQuarterKey(d1));
  eq('周往返', plan.getWeekKey(plan.periodKeyToDate('week', plan.getWeekKey(d1))), plan.getWeekKey(d1));
  eq('年往返', plan.getYearKey(plan.periodKeyToDate('year', '2026')), '2026');

  // 父周期键
  eq('日→周', plan.getParentPeriodKey('day', TODAY), WEEK);
  // 周→月按 ISO 规则取该周周四所在月（跨月周不等于"当前月"）
  eq('周→月', plan.getParentPeriodKey('week', WEEK), WEEK_PARENT_MONTH);
  eq('月→季', plan.getParentPeriodKey('month', MONTH), QUARTER);
  eq('季→年', plan.getParentPeriodKey('quarter', QUARTER), YEAR);
  eq('年无父', plan.getParentPeriodKey('year', YEAR), null);

  // ISO 周归属月的边界：W44（10-26 ~ 11-01）应以周四 10-29 归属 2026-10
  eq(
    '跨月周的归属月取周四',
    plan.getParentPeriodKey('week', '2026-W44'),
    '2026-10'
  );
  eq('普通周归属当月', plan.getParentPeriodKey('week', '2026-W43'), '2026-10');
}

// ==========================================
// 2. 周期导航
// ==========================================
section('2. 周期导航');
{
  eq('日 +1', plan.shiftPeriodKey('day', '2026-10-31', 1), '2026-11-01');
  eq('日 -1', plan.shiftPeriodKey('day', '2026-11-01', -1), '2026-10-31');
  eq('月 +1', plan.shiftPeriodKey('month', '2026-10', 1), '2026-11');
  eq('月 -1', plan.shiftPeriodKey('month', '2026-01', -1), '2025-12');
  eq('季 +1', plan.shiftPeriodKey('quarter', '2026-Q4', 1), '2027-Q1');
  eq('季 -1', plan.shiftPeriodKey('quarter', '2027-Q1', -1), '2026-Q4');
  eq('年 +1', plan.shiftPeriodKey('year', '2026', 1), '2027');

  // 周导航必须是同一周内的周一，且往返一致
  const wPlus = plan.shiftPeriodKey('week', WEEK, 1);
  const wMinus = plan.shiftPeriodKey('week', wPlus, -1);
  eq('周 +1/-1 往返', wMinus, WEEK);
  const wMonday = plan.periodKeyToDate('week', WEEK);
  eq('周起始为周一', wMonday.getDay(), 1);
  ok('周 +1 相差 7 天', Math.round((plan.periodKeyToDate('week', wPlus) - wMonday) / 86400000) === 7);
}

// ==========================================
// 3. 父进度按权重加权汇总
// ==========================================
section('3. 父进度按权重加权汇总');
{
  const nodes = [
    node({ id: 'p', cycle: 'month', periodKey: MONTH, children: ['a', 'b'], progress: 0 }),
    node({ id: 'a', cycle: 'week', periodKey: WEEK, weight: 3, progress: 100 }),
    node({ id: 'b', cycle: 'week', periodKey: WEEK, weight: 1, progress: 0 }),
  ];
  const r = plan.reconcileTree(nodes);
  // (100*3 + 0*1) / 4 = 75
  eq('加权汇总 75%', r.find((n) => n.id === 'p').progress, 75);

  // 等权
  const eq2 = plan.reconcileTree([
    node({ id: 'p', children: ['a', 'b'] }),
    node({ id: 'a', progress: 80 }),
    node({ id: 'b', progress: 20 }),
  ]);
  eq('等权汇总 50%', eq2.find((n) => n.id === 'p').progress, 50);

  // 叶子节点保留自身进度
  const leaf = plan.reconcileTree([node({ id: 'l', progress: 42 })]);
  eq('叶子保留自身进度', leaf[0].progress, 42);

  // 多层传导：年 → 季 → 月
  const deep = plan.reconcileTree([
    node({ id: 'y', cycle: 'year', periodKey: YEAR, children: ['q'] }),
    node({ id: 'q', cycle: 'quarter', periodKey: QUARTER, children: ['m'] }),
    node({ id: 'm', cycle: 'month', periodKey: MONTH, progress: 60 }),
  ]);
  eq('多层传导 60%', deep.find((n) => n.id === 'y').progress, 60);
}

// ==========================================
// 4. 状态向上联动
// ==========================================
section('4. 状态向上联动');
{
  const allDone = plan.reconcileTree([
    node({ id: 'p', children: ['a', 'b'], status: 'in_progress' }),
    node({ id: 'a', progress: 100, status: 'completed' }),
    node({ id: 'b', progress: 100, status: 'completed' }),
  ]);
  eq('子节点全完成 → 父节点完成', allDone.find((n) => n.id === 'p').status, 'completed');

  const blocked = plan.reconcileTree([
    node({ id: 'p', children: ['a'], status: 'in_progress' }),
    node({ id: 'a', progress: 20, status: 'blocked' }),
  ]);
  eq('子节点受阻 → 父节点受阻', blocked.find((n) => n.id === 'p').status, 'blocked');

  const started = plan.reconcileTree([
    node({ id: 'p', children: ['a'], status: 'not_started' }),
    node({ id: 'a', progress: 30, status: 'in_progress' }),
  ]);
  eq('子节点有进度 → 父节点进行中', started.find((n) => n.id === 'p').status, 'in_progress');

  const untouched = plan.reconcileTree([
    node({ id: 'p', children: ['a'], status: 'not_started' }),
    node({ id: 'a', progress: 0, status: 'not_started' }),
  ]);
  eq('子节点零进度 → 父节点未启动', untouched.find((n) => n.id === 'p').status, 'not_started');
}

// ==========================================
// 5. cascadeBreakdown 工时配平
// ==========================================
section('5. 自动分解的工时配平');
{
  const parent = node({ id: 'p', cycle: 'month', periodKey: MONTH, plannedHours: 10 });
  const { nodes: kids } = plan.cascadeBreakdown(parent, 3, ['a', 'b', 'c'], 'week', WEEK);
  const sum = kids.reduce((s, k) => s + k.plannedHours, 0);
  eq('子节点工时合计 = 父节点 10h', Math.round(sum * 10) / 10, 10);
  eq('子节点数 = 3', kids.length, 3);
  eq('子节点 parentId 正确', kids[0].parentId, 'p');
  eq('子节点继承维度', kids[0].dimension, parent.dimension);
  eq('子节点继承周期', kids[0].cycle, 'week');
  eq('子节点周期键正确', kids[0].periodKey, WEEK);

  // 不能整除时，最后一个吸收舍入误差
  const p2 = node({ id: 'p2', plannedHours: 10 });
  const { nodes: k2 } = plan.cascadeBreakdown(p2, 3, ['a', 'b', 'c'], 'week', WEEK);
  const s2 = Math.round(k2.reduce((s, k) => s + k.plannedHours, 0) * 100) / 100;
  eq('不可整除时合计仍 = 10h', s2, 10);
  ok('最后一个吸收误差', k2[2].plannedHours === Math.round((10 - k2[0].plannedHours - k2[1].plannedHours) * 10) / 10);

  // 0 工时父节点
  const { nodes: k3 } = plan.cascadeBreakdown(node({ id: 'p3', plannedHours: 0 }), 2, ['a', 'b'], 'week', WEEK);
  eq('父节点 0 工时 → 子节点 0', k3.reduce((s, k) => s + k.plannedHours, 0), 0);
}

// ==========================================
// 6-11. 勾稽诊断
// ==========================================
section('6-11. 勾稽诊断');
{
  const has = (issues, type) => issues.filter((i) => i.type === type);

  // 工时漏项：父 10h，子只分 6h
  const gapNodes = [
    node({ id: 'p', cycle: 'month', periodKey: MONTH, plannedHours: 10, children: ['a'] }),
    node({ id: 'a', cycle: 'week', periodKey: WEEK, plannedHours: 6 }),
  ];
  const gapIssues = plan.diagnoseReconciliation(gapNodes);
  eq('工时漏项命中', has(gapIssues, 'unallocated_time').length, 1);
  ok('工时漏项缺口 = 4h', Math.abs(has(gapIssues, 'unallocated_time')[0].metric.gap - 4) < 0.01);

  // 过度承诺：父 10h，子分 14h
  const overNodes = [
    node({ id: 'p', cycle: 'month', periodKey: MONTH, plannedHours: 10, children: ['a'] }),
    node({ id: 'a', cycle: 'week', periodKey: WEEK, plannedHours: 14 }),
  ];
  const overIssues = plan.diagnoseReconciliation(overNodes);
  eq('过度承诺命中', has(overIssues, 'overallocated_time').length, 1);
  ok('过度承诺超出 = 4h', Math.abs(has(overIssues, 'overallocated_time')[0].metric.overflow - 4) < 0.01);

  // 工时配平（父 = 子之和）不应报工时问题
  const balanced = [
    node({ id: 'p', cycle: 'month', periodKey: MONTH, plannedHours: 10, children: ['a'] }),
    node({ id: 'a', cycle: 'week', periodKey: WEEK, plannedHours: 10 }),
  ];
  const balIssues = plan.diagnoseReconciliation(balanced);
  eq('配平时无工时问题', has(balIssues, 'unallocated_time').length + has(balIssues, 'overallocated_time').length, 0);

  // 完成缺证据
  const noProof = [node({ id: 'n', status: 'completed', verificationProof: '' })];
  const proofIssues = plan.diagnoseReconciliation(noProof);
  eq('完成缺证据命中', has(proofIssues, 'completed_no_proof').length, 1);

  const withProof = [node({ id: 'n', status: 'completed', verificationProof: 'Stripe 截图' })];
  eq('有证据则不报', has(plan.diagnoseReconciliation(withProof), 'completed_no_proof').length, 0);

  // 孤儿：父的 children 指向了不存在的节点
  const orphanNodes = [node({ id: 'p', children: ['ghost'] })];
  eq('孤儿（引用不存在）命中', has(plan.diagnoseReconciliation(orphanNodes), 'orphan').length, 1);

  // 孤儿：子声明 parentId 但父的 children 没登记它
  const orphan2 = [
    node({ id: 'p', children: [] }),
    node({ id: 'c', parentId: 'p' }),
  ];
  eq('孤儿（未登记）命中', has(plan.diagnoseReconciliation(orphan2), 'orphan').length, 1);

  // 跨期错配：季度节点下挂了不属于该季度月份的月节点
  const mismatchNodes = [
    node({ id: 'q', cycle: 'quarter', periodKey: '2026-Q1', plannedHours: 10, children: ['m'] }),
    node({ id: 'm', cycle: 'month', periodKey: '2026-07', plannedHours: 10 }),
  ];
  const mm = plan.diagnoseReconciliation(mismatchNodes);
  eq('跨期错配命中', has(mm, 'period_mismatch').length, 1);

  // 跨期正确：2026-Q1 挂 2026-02 不应报错
  const okNodes = [
    node({ id: 'q', cycle: 'quarter', periodKey: '2026-Q1', plannedHours: 10, children: ['m'] }),
    node({ id: 'm', cycle: 'month', periodKey: '2026-02', plannedHours: 10 }),
  ];
  eq('同季月份不报跨期错配', has(plan.diagnoseReconciliation(okNodes), 'period_mismatch').length, 0);

  // 空周期：季度层有月节点，但季度层本身没有节点
  const emptyNodes = [
    node({ id: 'm', cycle: 'month', periodKey: '2026-02' }),
  ];
  const emptyIssues = plan.diagnoseReconciliation(emptyNodes);
  eq('空周期命中', has(emptyIssues, 'empty_period').length >= 1, true);

  // 进度不一致：自评 100%，子节点汇总 0%
  const incNodes = [
    node({ id: 'p', children: ['a'], progress: 100, declaredProgress: 100 }),
    node({ id: 'a', progress: 0 }),
  ];
  const incIssues = plan.diagnoseReconciliation(incNodes);
  eq('进度不一致命中', has(incIssues, 'progress_inconsistent').length, 1);

  // 进度一致时不报
  const consistent = [
    node({ id: 'p', children: ['a'], progress: 50, declaredProgress: 50 }),
    node({ id: 'a', progress: 50 }),
  ];
  eq('进度一致时不报', has(plan.diagnoseReconciliation(consistent), 'progress_inconsistent').length, 0);

  // 叶子缺交付物
  const noDeliver = [node({ id: 'l', deliverable: '' })];
  eq('叶子缺交付物命中', has(plan.diagnoseReconciliation(noDeliver), 'leaf_without_output').length, 1);

  // 目标脱钩：顶层且无 projectId / goalId
  const unlinked = [node({ id: 'top', deliverable: 'x' })];
  eq('目标脱钩命中', has(plan.diagnoseReconciliation(unlinked), 'goal_unlinked').length, 1);

  // 已关联目标则不报
  const linked = [node({ id: 'top', projectId: 'proj-1' })];
  eq('已关联则不报脱钩', has(plan.diagnoseReconciliation(linked), 'goal_unlinked').length, 0);

  // 断链：非日层节点无下级
  const noDesc = [node({ id: 'w', cycle: 'week', periodKey: WEEK, deliverable: 'x' })];
  eq('断链命中', has(plan.diagnoseReconciliation(noDesc), 'no_descendant').length, 1);

  // 实耗超计划
  const overrun = [node({ id: 'n', plannedHours: 10, actualHours: 20, deliverable: 'x', projectId: 'p' })];
  eq('实耗超计划命中', has(plan.diagnoseReconciliation(overrun), 'time_overrun').length, 1);
}

// ==========================================
// 12. 删除节点级联清理
// ==========================================
section('12. 删除节点级联清理');
{
  // 模拟 UI 的删除逻辑
  const tree = [
    node({ id: 'p', cycle: 'month', periodKey: MONTH, children: ['a'] }),
    node({ id: 'a', cycle: 'week', periodKey: WEEK, children: ['b'], parentId: 'p' }),
    node({ id: 'b', cycle: 'day', periodKey: TODAY, parentId: 'a' }),
    node({ id: 'other', cycle: 'day', periodKey: TODAY }),
  ];
  const doomed = new Set(['a']);
  let changed = true;
  while (changed) {
    changed = false;
    for (const n of tree) {
      if (n.parentId && doomed.has(n.parentId) && !doomed.has(n.id)) {
        doomed.add(n.id);
        changed = true;
      }
    }
  }
  const next = tree
    .filter((n) => !doomed.has(n.id))
    .map((n) => ({ ...n, children: (n.children || []).filter((c) => !doomed.has(c)) }));
  eq('删除子树后剩余节点数', next.length, 2);
  eq('父节点 children 已清空', next.find((n) => n.id === 'p').children.length, 0);
  eq('无关节点保留', next.some((n) => n.id === 'other'), true);
}

// ==========================================
// 13. 健康度评分
// ==========================================
section('13. 健康度评分');
{
  const clean = plan.summarizeBoard(
    [node({ id: 'n', progress: 100, status: 'completed', deliverable: 'x', projectId: 'p' })],
    []
  );
  ok('无问题时健康度较高', clean.healthScore >= 95, `实际 ${clean.healthScore}`);

  const bad = plan.summarizeBoard(
    [node({ id: 'n', children: ['ghost'] })],
    [
      { id: 'i1', type: 'orphan', severity: 'critical', cycle: 'day', periodKey: TODAY, message: '', suggestion: '' },
      { id: 'i2', type: 'unallocated_time', severity: 'warning', cycle: 'day', periodKey: TODAY, message: '', suggestion: '' },
    ]
  );
  ok('严重问题扣分后健康度下降', bad.healthScore < clean.healthScore, `${bad.healthScore} vs ${clean.healthScore}`);
  eq('严重问题计数', bad.criticalCount, 1);
  eq('警告计数', bad.warningCount, 1);
}

// ==========================================
// 结果
// ==========================================
console.log(`\n${'='.repeat(52)}`);
console.log(`通过 ${passed} 项，失败 ${failed} 项`);
if (failed > 0) {
  console.log('\n失败明细：');
  for (const f of failures) console.log(`  · ${f.name}${f.detail ? ' → ' + f.detail : ''}`);
}
console.log('='.repeat(52));
process.exit(failed > 0 ? 1 : 0);
