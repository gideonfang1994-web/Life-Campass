/**
 * 计划时间线引擎 —— 可重复执行的断言脚本。
 *
 * 运行：node tools/test-plan-timeline.mjs
 *
 * 覆盖：
 *   1. 跨度解析（周/月/季/年）与刻度粒度自动降级
 *   2. 刻度数量稳定（不会因为跨年出现 365 格）
 *   3. 节点按"周期起始日"归入正确刻度
 *   4. 跨期上层节点进入 ongoing 提示
 *   5. 坏周期键不污染整条时间线
 *   6. 每格汇总：工时 / 完成数 / 加权进度
 *   7. 排序稳定性：进行中 → 未启动 → 已完成
 *   8. 空段折叠与展开往返
 *   9. 今天定位与过去/未来标记
 *  10. 层级 ↔ 跨度映射
 *  11. 周期键归一（时间线上点"+ "要落到正确的 cycle）
 */

import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

/**
 * 注意：这里必须用 esbuild 的 build({ bundle:true })，不能用 transform()。
 * transform 只转译单文件、不解析相对 import，遇到 './planReconciliation'
 * 会保留原样，运行时直接 ERR_MODULE_NOT_FOUND / ERR_UNKNOWN_FILE_EXTENSION。
 */
async function loadTs(relPath) {
  const outPath = resolve(ROOT, `.tmp-${relPath.replace(/[\\/]/g, '_')}.mjs`);
  await build({
    entryPoints: [resolve(ROOT, relPath)],
    outfile: outPath,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node18',
    loader: { '.ts': 'ts' },
    logLevel: 'silent',
  });
  const mod = await import(pathToFileURL(outPath).href + '?t=' + Date.now());
  return { mod, outPath };
}

const { mod: tl, outPath } = await loadTs('src/utils/planTimeline.ts');

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
  ok(
    name,
    Object.is(actual, expected) || JSON.stringify(actual) === JSON.stringify(expected),
    `期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`
  );
}

function section(title) {
  console.log(`\n── ${title} ──`);
}

function d(y, m, day) {
  return new Date(y, m - 1, day);
}

/** 构造测试节点 */
function node(over) {
  return {
    id: over.id || 'x',
    title: over.title || '测试节点',
    cycle: over.cycle || 'day',
    periodKey: over.periodKey || '2026-11-03',
    parentId: over.parentId,
    children: [],
    dimension: over.dimension || 'career',
    plannedHours: over.plannedHours ?? 0,
    actualHours: over.actualHours ?? 0,
    weight: over.weight ?? 1,
    progress: over.progress ?? 0,
    status: over.status || 'not_started',
    deliverable: over.deliverable || '',
    successCriteria: '',
    note: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

// ==========================================
// 1. 跨度解析与粒度降级
// ==========================================
section('1. 跨度解析与粒度自动降级');

const rWeek = tl.resolveTimelineRange(d(2026, 11, 3), 'week');
eq('周跨度天数 = 7', rWeek.dayCount, 7);
eq('周跨度粒度 = 按天', rWeek.granularity, 'day');
eq('周跨度从周一 11/02 起', rWeek.start.getDate(), 2);
eq('周跨度到周日 11/08 止', rWeek.end.getDate(), 8);
ok('周跨度标签含起止', /11月2日\s*—\s*11月8日/.test(rWeek.label), rWeek.label);

const rMonth = tl.resolveTimelineRange(d(2026, 11, 3), 'month');
eq('月跨度天数 = 30（11月）', rMonth.dayCount, 30);
eq('月跨度粒度 = 按天', rMonth.granularity, 'day');
eq('月跨度标签 = 2026年11月', rMonth.label, '2026年11月');

const rQuarter = tl.resolveTimelineRange(d(2026, 11, 3), 'quarter');
eq('Q4 天数 = 92（10/1 - 12/31）', rQuarter.dayCount, 92);
eq('季跨度粒度 = 按周', rQuarter.granularity, 'week');
eq('季跨度标签 = 2026年 Q4', rQuarter.label, '2026年 Q4');

const rYear = tl.resolveTimelineRange(d(2026, 11, 3), 'year');
eq('2026 年天数 = 365', rYear.dayCount, 365);
eq('年跨度粒度 = 按月', rYear.granularity, 'month');
eq('年跨度标签 = 2026年', rYear.label, '2026年');

// 闰年必须被正确识别（2028 是闰年）
const rLeap = tl.resolveTimelineRange(d(2028, 6, 15), 'year');
eq('2028 闰年天数 = 366', rLeap.dayCount, 366);

// ==========================================
// 2. 刻度数量稳定
// ==========================================
section('2. 刻度数量稳定（不爆炸）');

const noNodes = [];
const bWeek = tl.buildTimeline(rWeek, noNodes, d(2026, 11, 3));
eq('周视图 7 格', bWeek.length, 7);
const bMonth = tl.buildTimeline(rMonth, noNodes, d(2026, 11, 3));
eq('月视图 30 格', bMonth.length, 30);
const bQuarter = tl.buildTimeline(rQuarter, noNodes, d(2026, 11, 3));
ok('季视图 ≈ 13-14 格（按周）', bQuarter.length >= 13 && bQuarter.length <= 15, `${bQuarter.length} 格`);
const bYear = tl.buildTimeline(rYear, noNodes, d(2026, 11, 3));
eq('年视图 12 格（按月）', bYear.length, 12);

// 所有粒度下格子数都落在 7~31，UI 不会卡
for (const [name, buckets] of [
  ['周', bWeek],
  ['月', bMonth],
  ['季', bQuarter],
  ['年', bYear],
]) {
  ok(`${name}视图格数在 7-31 区间`, buckets.length >= 7 && buckets.length <= 31, `${buckets.length}`);
}

// ==========================================
// 3. 节点按周期起始日归入正确刻度
// ==========================================
section('3. 节点归入正确刻度');

const nodes3 = [
  node({ id: 'day-06', cycle: 'day', periodKey: '2026-11-06', plannedHours: 3 }),
  node({ id: 'week-this', cycle: 'week', periodKey: '2026-W45', plannedHours: 20 }),
  node({ id: 'month-this', cycle: 'month', periodKey: '2026-11', plannedHours: 80 }),
  node({ id: 'day-out', cycle: 'day', periodKey: '2026-12-25', plannedHours: 5 }),
];
const b3 = tl.buildTimeline(rWeek, nodes3, d(2026, 11, 3));

// 11/06 落在 11/06 那一格
const b1106 = b3.find((b) => b.startKey === '2026-11-06');
ok('日节点落在自己的日期格', !!b1106 && b1106.nodes.some((n) => n.id === 'day-06'), `${b1106?.nodes.map((n) => n.id)}`);

// 周节点 W45 起始 = 11/02（周一），落在 11/02 格
const w45 = tl.resolveTimelineRange(d(2026, 11, 3), 'week');
const w45StartKey = b3[0].startKey;
eq('周视图第一格 = 周一 11/02', w45StartKey, '2026-11-02');
ok(
  '周节点落在周一那一格',
  b3[0].nodes.some((n) => n.id === 'week-this'),
  `${b3[0].nodes.map((n) => n.id)}`
);

// 月节点起始 11/01 早于跨度起点(11/02)，且周期覆盖跨度 → 进 ongoing
ok(
  '月节点起始早于跨度 → 作为持续进行提示',
  b3[0].ongoing.some((n) => n.id === 'month-this'),
  JSON.stringify(b3[0].ongoing.map((n) => n.id))
);

// 跨度外的日节点不进任何格
const allIds = b3.flatMap((b) => b.nodes.map((n) => n.id));
ok('跨度外节点不进时间线', !allIds.includes('day-out'), allIds.join(','));
ok('跨度外节点也不进 ongoing', !b3.some((b) => b.ongoing.some((n) => n.id === 'day-out')));

// ==========================================
// 4. 跨期 ongoing 只收粗粒度节点、且有上限
// ==========================================
section('4. ongoing 只收粗粒度 + 有上限');

const nodes4 = [
  node({ id: 'y', cycle: 'year', periodKey: '2026', plannedHours: 100 }),
  node({ id: 'q', cycle: 'quarter', periodKey: '2026-Q4', plannedHours: 60 }),
  node({ id: 'm', cycle: 'month', periodKey: '2026-11', plannedHours: 30 }),
  node({ id: 'm2', cycle: 'month', periodKey: '2026-10', plannedHours: 30 }),
  node({ id: 'm3', cycle: 'month', periodKey: '2026-09', plannedHours: 30 }),
  // 日节点起始早于跨度但不在跨度内 —— 不该进 ongoing
  node({ id: 'dOld', cycle: 'day', periodKey: '2026-10-15', plannedHours: 2 }),
];
const b4 = tl.buildTimeline(rWeek, nodes4, d(2026, 11, 3));
const ongoingAll = b4.flatMap((b) => b.ongoing.map((n) => n.id));
ok('粗粒度跨期节点进入 ongoing', ['y', 'q'].every((id) => ongoingAll.includes(id)), ongoingAll.join(','));
ok('日节点不进 ongoing（避免刷屏）', !ongoingAll.includes('dOld'));
ok('单格 ongoing 最多 2 条', b4.every((b) => b.ongoing.length <= 2), JSON.stringify(b4.map((b) => b.ongoing.length)));

// ==========================================
// 5. 坏周期键不污染整条时间线
// ==========================================
section('5. 坏周期键容错');

const nodes5 = [
  node({ id: 'good', cycle: 'day', periodKey: '2026-11-04', plannedHours: 2 }),
  node({ id: 'bad1', cycle: 'day', periodKey: 'not-a-date', plannedHours: 9 }),
  node({ id: 'bad2', cycle: 'week', periodKey: '2026-W99', plannedHours: 9 }),
];
let threw = false;
let b5 = [];
try {
  b5 = tl.buildTimeline(rWeek, nodes5, d(2026, 11, 3));
} catch (e) {
  threw = true;
}
ok('坏周期键不抛异常', threw === false);
ok('好节点仍正常渲染', b5.flatMap((b) => b.nodes.map((n) => n.id)).includes('good'));
ok('坏节点被跳过', !b5.flatMap((b) => b.nodes.map((n) => n.id)).includes('bad1'));

// ==========================================
// 6. 每格汇总
// ==========================================
section('6. 每格汇总：工时 / 完成数 / 加权进度');

const nodes6 = [
  node({ id: 'a', cycle: 'day', periodKey: '2026-11-04', plannedHours: 4, actualHours: 2, progress: 50, weight: 1, status: 'in_progress' }),
  node({ id: 'b', cycle: 'day', periodKey: '2026-11-04', plannedHours: 6, actualHours: 6, progress: 100, weight: 3, status: 'completed' }),
];
const b6 = tl.buildTimeline(rWeek, nodes6, d(2026, 11, 3));
const cell6 = b6.find((b) => b.startKey === '2026-11-04');
eq('当日计划工时合计', cell6.plannedHours, 10);
eq('当日实耗工时合计', cell6.actualHours, 8);
eq('当日完成数', cell6.completedCount, 1);
// 加权：(50*1 + 100*3) / 4 = 350/4 = 87.5 → round 88
eq('当日加权进度（权重生效）', cell6.progress, 88);
ok('权重影响结果（不等于简单平均 75）', cell6.progress !== 75, `实际 ${cell6.progress}`);

// ==========================================
// 7. 排序稳定性
// ==========================================
section('7. 排序：进行中 → 受阻 → 未启动 → 已完成/已放弃');

const nodes7 = [
  node({ id: 'done', cycle: 'day', periodKey: '2026-11-05', status: 'completed', plannedHours: 9 }),
  node({ id: 'idle', cycle: 'day', periodKey: '2026-11-05', status: 'not_started', plannedHours: 8 }),
  node({ id: 'run', cycle: 'day', periodKey: '2026-11-05', status: 'in_progress', plannedHours: 1 }),
  node({ id: 'blocked', cycle: 'day', periodKey: '2026-11-05', status: 'blocked', plannedHours: 2 }),
  node({ id: 'dropped', cycle: 'day', periodKey: '2026-11-05', status: 'dropped', plannedHours: 6 }),
];
const b7 = tl.buildTimeline(rWeek, nodes7, d(2026, 11, 3));
const cell7 = b7.find((b) => b.startKey === '2026-11-05');
eq('进行中排最前', cell7.nodes[0].id, 'run');
// 受阻必须排在未启动之前：卡住的事要立刻被看见，工时才 2h 也要上来
eq('受阻排在未启动之前（不受工时影响）', cell7.nodes[1].id, 'blocked');
eq('未启动排第三', cell7.nodes[2].id, 'idle');
ok(
  '已完成/已放弃沉到末尾',
  ['done', 'dropped'].includes(cell7.nodes[3].id) && ['done', 'dropped'].includes(cell7.nodes[4].id),
  cell7.nodes.map((n) => n.id).join(' > ')
);

// 反证：把受阻工时调到最小，它仍应排在未启动之前
const nodes7b = [
  node({ id: 'idle', cycle: 'day', periodKey: '2026-11-05', status: 'not_started', plannedHours: 99 }),
  node({ id: 'blocked', cycle: 'day', periodKey: '2026-11-05', status: 'blocked', plannedHours: 0.5 }),
];
const cell7b = tl
  .buildTimeline(rWeek, nodes7b, d(2026, 11, 3))
  .find((b) => b.startKey === '2026-11-05');
eq('反证：0.5h 的受阻仍压过 99h 的未启动', cell7b.nodes[0].id, 'blocked');

// ==========================================
// 8. 空段折叠往返
// ==========================================
section('8. 空段折叠');

const nodes8 = [
  node({ id: 'first', cycle: 'day', periodKey: '2026-11-02', plannedHours: 2 }),
  node({ id: 'last', cycle: 'day', periodKey: '2026-11-08', plannedHours: 2 }),
];
const b8 = tl.buildTimeline(rWeek, nodes8, d(2026, 11, 3));
// 11/03 是今天，不能被折叠掉
const rows8 = tl.collapseEmptyBuckets(b8, 3);
const gapRows = rows8.filter((r) => r.kind === 'gap');
ok('中间空白被折叠成 gap 行', gapRows.length >= 1, JSON.stringify(rows8.map((r) => (r.kind === 'gap' ? `gap(${r.count})` : r.bucket.label))));

const todayRow8 = rows8.find((r) => r.kind === 'bucket' && r.bucket.isToday);
ok('今天所在格不被折叠', !!todayRow8, '今天的格子必须始终可见');

const expanded8 = tl.collapseEmptyBuckets(b8, 9999);
eq('取消折叠后恢复全部 7 格', expanded8.filter((r) => r.kind === 'bucket').length, 7);

const sumFold = tl.summarizeTimeline(b8);
eq('折叠前后节点总数一致', sumFold.nodeCount, 2);
eq('活跃格数 = 2', sumFold.activeBucketCount, 2);
eq('空白格数 = 5', sumFold.emptyBucketCount, 5);
eq('首个活跃格下标 = 0', sumFold.firstActiveIndex, 0);
eq('今天下标 = 1（11/03）', sumFold.todayIndex, 1);

// ==========================================
// 9. 过去 / 未来 / 今天标记
// ==========================================
section('9. 今天 / 过去 / 未来标记');

const b9 = tl.buildTimeline(rWeek, [], d(2026, 11, 3));
eq('11/03 标记为今天', b9.find((b) => b.startKey === '2026-11-03')?.isToday, true);
eq('11/02 标记为过去', b9.find((b) => b.startKey === '2026-11-02')?.isPast, true);
eq('11/04 标记为未来', b9.find((b) => b.startKey === '2026-11-04')?.isFuture, true);
eq('今天既非过去也非未来', b9.find((b) => b.startKey === '2026-11-03')?.isPast, false);

// 周粒度下，今天落在整周区间内 → 整周算 today
const bq9 = tl.buildTimeline(rQuarter, [], d(2026, 11, 3));
const todayWeekCell = bq9.find((b) => b.isToday);
ok('周粒度下今天所在周被标记', !!todayWeekCell, JSON.stringify(bq9.map((b) => b.isToday)));
ok('周粒度下只有一格是今天', bq9.filter((b) => b.isToday).length === 1);

// ==========================================
// 10. 层级 ↔ 跨度映射
// ==========================================
section('10. 层级 ↔ 跨度映射');

eq('日层 → 周跨度（有前后文）', tl.spanForCycle('day'), 'week');
eq('周层 → 周跨度', tl.spanForCycle('week'), 'week');
eq('月层 → 月跨度', tl.spanForCycle('month'), 'month');
eq('季层 → 季跨度', tl.spanForCycle('quarter'), 'quarter');
eq('年层 → 年跨度', tl.spanForCycle('year'), 'year');

eq('周跨度 → 新建周节点', tl.cycleForSpan('week'), 'week');
eq('月跨度 → 新建月节点', tl.cycleForSpan('month'), 'month');
eq('季跨度 → 新建季节点', tl.cycleForSpan('quarter'), 'quarter');
eq('年跨度 → 新建年节点', tl.cycleForSpan('year'), 'year');

// ==========================================
// 11. 周期键归一
// ==========================================
section('11. 刻度周期键归一');

const b11day = tl.buildTimeline(rWeek, [], d(2026, 11, 3));
eq('按天粒度 cycle=day', b11day[0].cycle, 'day');
eq('按天粒度 periodKey=日期', b11day[0].periodKey, '2026-11-02');

const b11week = tl.buildTimeline(rQuarter, [], d(2026, 11, 3));
ok('按周粒度 cycle=week', b11week.every((b) => b.cycle === 'week'));
ok('按周粒度 periodKey 是 W 格式', b11week.every((b) => /^\d{4}-W\d{2}$/.test(b.periodKey)), b11week[0]?.periodKey);

const b11month = tl.buildTimeline(rYear, [], d(2026, 11, 3));
eq('按月粒度 cycle=month', b11month[0].cycle, 'month');
eq('按月粒度 periodKey=YYYY-MM', b11month[0].periodKey, '2026-01');
eq('按月粒度首格 = 1月', b11month[0].label, '1月');
eq('按月粒度末格 = 12月', b11month[b11month.length - 1].label, '12月');
ok('periodKey 全部可被周期引擎解析', b11month.every((b) => b.periodKey.length === 7));

// startKey 始终是 YYYY-MM-DD，可直接用于跳日志
ok('所有刻度 startKey 都是日期格式', [...b11day, ...b11week, ...b11month].every((b) => /^\d{4}-\d{2}-\d{2}$/.test(b.startKey)));

// ==========================================
// 12. 跨年边界
// ==========================================
section('12. 跨年边界');

const rCross = tl.resolveTimelineRange(d(2026, 12, 31), 'week');
const bCross = tl.buildTimeline(rCross, [], d(2026, 12, 31));
eq('年末周 7 格', bCross.length, 7);
ok('跨年周包含 2027 年日期', bCross.some((b) => b.startKey.startsWith('2027')), JSON.stringify(bCross.map((b) => b.startKey)));
ok('跨年周每格 startKey 唯一（无重复/错位）', new Set(bCross.map((b) => b.startKey)).size === 7);

const rQ4 = tl.resolveTimelineRange(d(2026, 12, 31), 'quarter');
const bQ4 = tl.buildTimeline(rQ4, [], d(2026, 12, 31));
ok('Q4 周刻度不越过 12/31 太多', bQ4[bQ4.length - 1].start <= rQ4.end, `末格起 ${bQ4[bQ4.length - 1].startKey}`);

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

// 清理临时构建产物
try {
  rmSync(outPath, { force: true });
} catch {}

process.exit(failed > 0 ? 1 : 0);
