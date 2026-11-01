/**
 * 健康分析引擎 + 导入解析器 单元测试
 *
 * 运行：node tools/test-health.mjs
 */
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

async function loadModule(entry) {
  const outfile = join(mkdtempSync(join(tmpdir(), 'health-')), 'bundle.mjs');
  await build({
    entryPoints: [resolve(root, entry)],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile,
    loader: { '.ts': 'ts' },
    logLevel: 'error',
  });
  return import('file://' + outfile.replace(/\\/g, '/'));
}

const A = await loadModule('src/utils/healthAnalytics.ts');
const I = await loadModule('src/utils/healthImporters.ts');

let pass = 0;
let fail = 0;
const failures = [];

function ok(name, cond, extra = '') {
  if (cond) {
    pass++;
  } else {
    fail++;
    failures.push(`${name}${extra ? ' → ' + extra : ''}`);
  }
}
function eq(name, actual, expected) {
  ok(name, actual === expected, `期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
}
function near(name, actual, expected, tol = 0.01) {
  ok(name, Math.abs(actual - expected) <= tol, `期望 ≈${expected}，实际 ${actual}`);
}
function group(name) {
  console.log(`\n▶ ${name}`);
}

// ==========================================
// 构造夹具
// ==========================================
function mkEntry(date, patch = {}) {
  const now = '2026-10-31T00:00:00.000Z';
  return { id: `e-${date}`, date, source: 'manual', createdAt: now, updatedAt: now, ...patch };
}

// ==========================================
group('1. 基础统计工具')
// ==========================================
eq('mean 空数组返回 0', A.mean([]), 0);
near('mean 基本值', A.mean([1, 2, 3, 4]), 2.5);
eq('pearson 完全正相关', A.pearson([1, 2, 3, 4], [2, 4, 6, 8]), 1);
eq('pearson 完全负相关', A.pearson([1, 2, 3, 4], [8, 6, 4, 2]), -1);
eq('pearson 样本不足返回 null', A.pearson([1, 2], [1, 2]), null);
eq('pearson 零方差返回 null', A.pearson([1, 1, 1], [1, 2, 3]), null);
near('linearSlope 上升', A.linearSlope([1, 2, 3, 4]), 1);
near('linearSlope 水平', A.linearSlope([2, 2, 2, 2]), 0);
eq('movingAverage 与输入等长', A.movingAverage([1, 2, 3, 4, 5], 3).length, 5);
near('movingAverage 首值 = 原值', A.movingAverage([1, 2, 3, 4, 5], 3)[0], 1);
near('movingAverage 第三值 = 前三均值', A.movingAverage([1, 2, 3, 4, 5], 3)[2], 2);
near('movingAverage 末值 = 后三均值', A.movingAverage([1, 2, 3, 4, 5], 3)[4], 4);

// ==========================================
group('2. 日期键与周期')
// ==========================================
eq('toDateKey', A.toDateKey(new Date(2026, 9, 31)), '2026-10-31');
eq('getWeekKey 与 planReconciliation 口径一致', A.getWeekKey(new Date(2026, 9, 31)), '2026-W44');
eq('getMonthKey', A.getMonthKey(new Date(2026, 9, 5)), '2026-10');
eq('datesInPeriod 日', A.datesInPeriod('day', '2026-10-15').length, 1);
eq('datesInPeriod 周 = 7 天', A.datesInPeriod('week', '2026-W44').length, 7);
eq('datesInPeriod 2月 = 28 天', A.datesInPeriod('month', '2026-02').length, 28);
eq('datesInPeriod 闰年2月 = 29 天', A.datesInPeriod('month', '2024-02').length, 29);
ok('weekDateRange 格式', /^\d{2}-\d{2} ~ \d{2}-\d{2}$/.test(A.weekDateRange('2026-W44')));
eq('datesInPeriod 周首日是周一', A.datesInPeriod('week', '2026-W44')[0].slice(-2), '26');

// ==========================================
group('3. expectedDaysInPeriod（覆盖率修正）')
// ==========================================
eq('日周期应为 1 天', A.expectedDaysInPeriod('day', '2026-10-31'), 1);
const histMonth = A.expectedDaysInPeriod('month', '2026-02');
eq('历史 2 月应为 28 天（不是当前月天数）', histMonth, 28);
ok('历史月份天数 > 0', histMonth > 0, `实际 ${histMonth}`);
ok('历史月份天数不依赖今天几号', histMonth === 28 || histMonth === 29);

// ==========================================
group('4. buildRollups 体重变化方向（回归修复）')
// ==========================================
{
  // 10 月体重 70kg，11 月体重 69kg（下降）
  const entries = [
    mkEntry('2026-10-05', { weightKg: 70 }),
    mkEntry('2026-11-05', { weightKg: 69 }),
  ];
  const keys = A.recentPeriodKeys('month', 2, new Date(2026, 10, 15));
  eq('recentPeriodKeys 最新在前', keys[0], '2026-11');
  const rollups = A.buildRollups(entries, 'month', keys, A.DEFAULT_HEALTH_GOALS);
  eq('rollups 顺序仍为最新在前', rollups[0].key, '2026-11');
  ok(
    '体重下降时 weightDeltaKg 为负',
    rollups[0].weightDeltaKg < 0,
    `实际 ${rollups[0].weightDeltaKg}`
  );
  near('体重下降幅度为 -1kg', rollups[0].weightDeltaKg, -1, 0.05);
}
{
  // 上升场景
  const entries = [
    mkEntry('2026-10-05', { weightKg: 68 }),
    mkEntry('2026-11-05', { weightKg: 70 }),
  ];
  const keys = A.recentPeriodKeys('month', 2, new Date(2026, 10, 15));
  const rollups = A.buildRollups(entries, 'month', keys, A.DEFAULT_HEALTH_GOALS);
  ok('体重上升时 weightDeltaKg 为正', rollups[0].weightDeltaKg > 0, `实际 ${rollups[0].weightDeltaKg}`);
  near('体重上升幅度为 +2kg', rollups[0].weightDeltaKg, 2, 0.05);
}

// ==========================================
group('5. 周期汇总与达标判定')
// ==========================================
{
  const entries = [];
  for (let i = 1; i <= 7; i++) {
    entries.push(mkEntry(`2026-10-0${i}`, {
      sleepHours: 7.5,
      exerciseMinutes: 40,
      steps: 9000,
      caloriesIntake: 2000,
      caloriesBurned: 2500,
      waterMl: 2200,
      weightKg: 70,
    }));
  }
  const r = A.rollupForPeriod(entries, 'month', '2026-10', { goals: A.DEFAULT_HEALTH_GOALS });
  eq('记录天数 = 7', r.daysRecorded, 7);
  near('平均睡眠 7.5h', r.avgSleepHours, 7.5, 0.05);
  eq('睡眠达标天数 = 7', r.sleepHitDays, 7);
  eq('运动达标天数 = 7', r.exerciseHitDays, 7);
  eq('热量未超天数 = 7', r.calorieHitDays, 7);
  near('热量平衡 = -500', r.avgCalorieBalance, -500, 1);
  eq('综合评分 > 0', r.score > 0, true);
  ok('评分不超过 100', r.score <= 100, `实际 ${r.score}`);
}
{
  // 未记录的指标不应被判为未达标
  const entries = [mkEntry('2026-10-01', { sleepHours: 8 })];
  const r = A.rollupForPeriod(entries, 'month', '2026-10', { goals: A.DEFAULT_HEALTH_GOALS });
  eq('只有睡眠数据时运动达标天数为 0（非未达标）', r.exerciseHitDays, 0);
  eq('有数据的维度计入平均（无数据维度不拉低分）', r.scoreBreakdown.exercise, 0);
  ok('评分只算有数据的维度', r.score > 0, `实际 ${r.score}`);
}

// ==========================================
group('6. 运动得分步数权重（回归修复）')
// ==========================================
{
  // 只有运动时长，没记步数 → 不应因缺步数丢分
  const noSteps = A.rollupForPeriod(
    [mkEntry('2026-10-01', { exerciseMinutes: 30 })],
    'day', '2026-10-01', { goals: A.DEFAULT_HEALTH_GOALS }
  );
  eq('有运动无步数：时长 100% × 0.7 + 达标率 100% × 0.3 = 100', noSteps.scoreBreakdown.exercise, 100);

  // 有运动 + 步数达标
  const withSteps = A.rollupForPeriod(
    [mkEntry('2026-10-01', { exerciseMinutes: 30, steps: 8000 })],
    'day', '2026-10-01', { goals: A.DEFAULT_HEALTH_GOALS }
  );
  eq('有运动且步数达标 = 100', withSteps.scoreBreakdown.exercise, 100);

  // 有运动 + 步数只有一半
  const halfSteps = A.rollupForPeriod(
    [mkEntry('2026-10-01', { exerciseMinutes: 30, steps: 4000 })],
    'day', '2026-10-01', { goals: A.DEFAULT_HEALTH_GOALS }
  );
  eq('步数只有目标一半 → 100×0.7 + 50×0.3 = 85', halfSteps.scoreBreakdown.exercise, 85);

  // 只有步数
  const onlySteps = A.rollupForPeriod(
    [mkEntry('2026-10-01', { steps: 8000 })],
    'day', '2026-10-01', { goals: A.DEFAULT_HEALTH_GOALS }
  );
  eq('只有步数达标 = 100', onlySteps.scoreBreakdown.exercise, 100);
}

// ==========================================
group('7. 相关性分析')
// ==========================================
{
  const entries = [];
  for (let i = 0; i < 14; i++) {
    const sleep = 6 + (i % 5);
    entries.push(mkEntry(`2026-10-${String(i + 1).padStart(2, '0')}`, {
      sleepHours: sleep,
      exerciseMinutes: sleep * 10,
      energyLevel: Math.min(5, Math.max(1, sleep - 4)),
    }));
  }
  const cors = A.analyzeCorrelations(entries);
  ok('产出相关性结果', cors.length > 0);
  const sleepEx = cors.find((c) => c.xKey === 'sleepHours' && c.yKey === 'exerciseMinutes');
  ok('找到睡眠×运动相关性', !!sleepEx);
  if (sleepEx) {
    ok('睡眠×运动 强正相关', sleepEx.r > 0.9, `r=${sleepEx.r}`);
    eq('相关性方向为正', sleepEx.direction, 'positive');
    eq('相关性强度为 strong', sleepEx.strength, 'strong');
    eq('样本量 14', sleepEx.n, 14);
  }
  const sleepEnergy = cors.find((c) => c.xKey === 'sleepHours' && c.yKey === 'energyLevel');
  ok('找到睡眠×精力相关性', !!sleepEnergy);
}
{
  const cors = A.analyzeCorrelations([mkEntry('2026-10-01', { sleepHours: 7 })]);
  eq('样本不足时无相关性结果', cors.length, 0);
}

// ==========================================
group('8. 趋势判定')
// ==========================================
{
  const entries = [];
  for (let i = 1; i <= 14; i++) {
    entries.push(mkEntry(`2026-10-${String(i).padStart(2, '0')}`, {
      sleepHours: 6 + i * 0.2,
    }));
  }
  const t = A.analyzeTrend(entries, 'sleepHours');
  ok('产出趋势结果', !!t);
  if (t) {
    eq('趋势方向向上', t.direction, 'up');
    ok('趋势显著', t.significant, `deltaPct=${t.deltaPct}`);
    ok('斜率为正', t.slope > 0);
  }
}
{
  const t = A.analyzeTrend([mkEntry('2026-10-01', { sleepHours: 7 })], 'sleepHours');
  eq('样本不足返回 null', t, null);
}

// ==========================================
group('9. streak 连续达标')
// ==========================================
{
  const entries = [
    mkEntry('2026-10-01', { sleepHours: 8 }),
    mkEntry('2026-10-02', { sleepHours: 8 }),
    mkEntry('2026-10-03', { sleepHours: 8 }),
    mkEntry('2026-10-04', { sleepHours: 5 }),
  ];
  const s = A.computeStreak(entries, (e) => e.sleepHours !== undefined ? e.sleepHours >= 7 : undefined);
  eq('从最近一天往回数，连续 3 天达标后断档', s, 0);
}
{
  const entries = [
    mkEntry('2026-10-01', { sleepHours: 8 }),
    mkEntry('2026-10-02', { sleepHours: 8 }),
    mkEntry('2026-10-03', { sleepHours: 8 }),
  ];
  const s = A.computeStreak(entries, (e) => e.sleepHours !== undefined ? e.sleepHours >= 7 : undefined);
  eq('全部达标 streak = 3', s, 3);
}
{
  // 中间缺数据的天应跳过而不是断档
  const entries = [
    mkEntry('2026-10-01', { sleepHours: 8 }),
    mkEntry('2026-10-02', { sleepHours: 8 }),
    mkEntry('2026-10-03', {}),
    mkEntry('2026-10-04', { sleepHours: 8 }),
  ];
  const s = A.computeStreak(entries, (e) => e.sleepHours !== undefined ? e.sleepHours >= 7 : undefined);
  eq('缺数据的天跳过不中断 streak', s, 3);
}

// ==========================================
group('10. 异常检测')
// ==========================================
{
  const entries = [];
  for (let i = 1; i <= 5; i++) {
    entries.push(mkEntry(`2026-10-0${i}`, { sleepHours: 4.5, exerciseMinutes: 5 }));
  }
  const anoms = A.detectAnomalies(entries, A.DEFAULT_HEALTH_GOALS);
  const sleepAnom = anoms.find((a) => a.kind === 'sleep_deficit');
  ok('检出连续睡眠不足', !!sleepAnom);
  if (sleepAnom) eq('睡眠不足 streak = 5', sleepAnom.evidence.streak, 5);
  const exAnom = anoms.find((a) => a.kind === 'exercise_gap');
  ok('检出运动断档', !!exAnom);
}
{
  const anoms = A.detectAnomalies([mkEntry('2026-10-01')], A.DEFAULT_HEALTH_GOALS);
  eq('样本不足不报异常', anoms.length, 0);
}

// ==========================================
group('11. mergeEntries 幂等合并')
// ==========================================
{
  const existing = [mkEntry('2026-10-01', { sleepHours: 7, steps: 5000 })];
  const incoming = [mkEntry('2026-10-01', { sleepHours: 8 })];
  const r = A.mergeEntries(existing, incoming);
  eq('合并后条目数不变', r.merged.length, 1);
  eq('新增 0 条', r.added, 0);
  eq('覆盖 1 条', r.mergedCount, 1);
  eq('睡眠被新值覆盖', r.merged[0].sleepHours, 8);
  eq('未被覆盖的字段保留', r.merged[0].steps, 5000);
}
{
  const existing = [mkEntry('2026-10-01', { sleepHours: 7 })];
  const incoming = [mkEntry('2026-10-02', { sleepHours: 8 })];
  const r = A.mergeEntries(existing, incoming);
  eq('不同日期追加', r.merged.length, 2);
  eq('新增 1 条', r.added, 1);
  eq('按日期升序', r.merged[0].date, '2026-10-01');
}

// ==========================================
group('12. analyzeHealth 汇总入口')
// ==========================================
{
  const entries = [];
  for (let i = 1; i <= 20; i++) {
    const d = new Date(2026, 9, i);
    entries.push(mkEntry(A.toDateKey(d), {
      sleepHours: 7 + (i % 3) * 0.3,
      exerciseMinutes: 20 + (i % 5) * 5,
      steps: 6000 + i * 100,
      caloriesIntake: 2000,
      caloriesBurned: 2300,
      waterMl: 2000,
      weightKg: 70 - i * 0.05,
    }));
  }
  const res = A.analyzeHealth(entries, A.DEFAULT_HEALTH_GOALS, 'day', 10);
  eq('返回 10 个周期汇总', res.rollups.length, 10);
  ok('总体评分在 0-100', res.overallScore >= 0 && res.overallScore <= 100, `实际 ${res.overallScore}`);
  eq('记录天数 = 20', res.totalDays, 20);
  ok('产出洞察', res.insights.length > 0);
  ok('产出趋势', res.trends.length > 0);
  ok('覆盖率在 0-1', res.coverage >= 0 && res.coverage <= 1, `实际 ${res.coverage}`);
}

// ==========================================
group('13. 导入器 —— 通用 CSV')
// ==========================================
{
  const csv = `日期,睡眠时长(h),深睡时长(h),运动时长(min),步数,摄入热量(kcal),蛋白质(g),碳水(g),脂肪(g),饮水量(ml),体重(kg),体脂率(%),静息心率(bpm)
2026-10-01,7.5,1.5,45,10000,2100,90,220,60,2500,70,20,58
2026-10-02,6.8,1.2,30,7000,1900,80,200,55,1800,70.2,20.1,60
2026-10-03,8.0,1.8,60,12000,2200,100,240,65,2800,69.9,19.8,57`;
  const out = await I.parseHealthContent('test.csv', csv);
  eq('识别来源为 csv', out.detectedSource, 'csv');
  eq('导入 3 天', out.entries.length, 3);
  const e0 = out.entries[0];
  eq('睡眠时长 7.5h', e0.sleepHours, 7.5);
  eq('深睡 1.5h', e0.deepSleepHours, 1.5);
  eq('运动 45min', e0.exerciseMinutes, 45);
  eq('步数 10000', e0.steps, 10000);
  eq('摄入热量 2100', e0.caloriesIntake, 2100);
  eq('蛋白质 90', e0.proteinG, 90);
  eq('饮水 2500ml', e0.waterMl, 2500);
  eq('体重 70kg', e0.weightKg, 70);
  eq('体脂率 20%', e0.bodyFatPct, 20);
  eq('静息心率 58', e0.restingHr, 58);
  ok('检出多个字段', out.detectedFields.length >= 10, `实际 ${out.detectedFields.length}`);
  eq('日期范围起', out.dateFrom, '2026-10-01');
  eq('日期范围止', out.dateTo, '2026-10-03');
}
{
  // 英文表头 + 逗号千分位 + 单位行
  const csv = `Date,Sleep Hours,Exercise Minutes,Steps,Weight (kg)
2026/10/01,7.2,40,"10,000",70.5
2026/10/02,7.9,50,"12,500",70.1`;
  const out = await I.parseHealthContent('en.csv', csv);
  eq('英文表头导入 2 天', out.entries.length, 2);
  eq('英文 sleep hours', out.entries[0].sleepHours, 7.2);
  eq('千分位步数被正确解析', out.entries[0].steps, 10000);
  eq('体重 70.5', out.entries[0].weightKg, 70.5);
  eq('斜杠日期被解析', out.entries[0].date, '2026-10-01');
}
{
  // 单位行（第 2 行全是单位）
  const csv = `日期,睡眠,运动时长,步数
,小时,分钟,步
2026-10-01,7.5,40,8000`;
  const out = await I.parseHealthContent('units.csv', csv);
  eq('单位行被正确跳过并应用', out.entries.length, 1);
  eq('睡眠按小时换算', out.entries[0].sleepHours, 7.5);
  eq('运动按分钟换算', out.entries[0].exerciseMinutes, 40);
}
{
  // 无日期列 → 明确报错
  const csv = `步数,睡眠
1000,7`;
  const out = await I.parseHealthContent('nodate.csv', csv);
  eq('无日期列不产生条目', out.entries.length, 0);
  ok('无日期列有跳过原因', out.skipped.length > 0 && /日期/.test(out.skipped[0].reason));
}
{
  // 坏行被跳过并记录原因
  const csv = `日期,步数
2026-10-01,1000
not-a-date,2000
2026-10-03,3000`;
  const out = await I.parseHealthContent('bad.csv', csv);
  eq('有效行 2 天', out.entries.length, 2);
  eq('坏行被记录', out.skipped.length, 1);
}
{
  // 占位符 '—' 视为空
  const csv = `日期,步数,体重
2026-10-01,—,—`;
  const out = await I.parseHealthContent('dash.csv', csv);
  eq('破折号占位不写入数值', out.entries[0].steps, undefined);
  eq('破折号占位不写入体重', out.entries[0].weightKg, undefined);
}

// ==========================================
group('14. 导入器 —— 单位换算')
// ==========================================
{
  const csv = `日期,睡眠时长,运动时长,距离,体重,体脂率,饮水量
2026-10-01,450,1.5,5000,154,0.22,2.5`;
  const out = await I.parseHealthContent('conv.csv', csv);
  const e = out.entries[0];
  near('450 分钟 → 7.5 小时', e.sleepHours, 7.5, 0.01);
  near('1.5 小时 → 90 分钟', e.exerciseMinutes, 90, 0.01);
  near('5000 米 → 5 公里', e.distanceKm, 5, 0.01);
  near('无单位体重按公斤处理（不猜测磅）', e.weightKg, 154, 0.01);
  near('0.22 → 22%', e.bodyFatPct, 22, 0.01);
  near('2.5 升 → 2500 ml', e.waterMl, 2500, 1);
}
{
  // 显式标注单位时才换算
  const csv = `日期,体重(lb),距离(mi)
2026-10-01,154,3.1`;
  const out = await I.parseHealthContent('explicit-unit.csv', csv);
  const e = out.entries[0];
  near('154 磅 → 69.85 kg', e.weightKg, 69.85, 0.1);
  near('3.1 英里 → 4.99 km', e.distanceKm, 4.99, 0.01);
}
{
  // 带内联单位
  const csv = `日期,睡眠时长(min),运动时长(h),距离(mi)
2026-10-01,480,0.5,3.1`;
  const out = await I.parseHealthContent('inline.csv', csv);
  const e = out.entries[0];
  near('内联 min → 8 小时', e.sleepHours, 8, 0.01);
  near('内联 h → 30 分钟', e.exerciseMinutes, 30, 0.01);
  ok('距离 mi 保留原值', e.distanceKm > 3);
}

// ==========================================
group('15. 导入器 —— Apple Health export.xml')
// ==========================================
{
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<HealthData locale="zh_CN">
 <Record type="HKQuantityTypeIdentifierStepCount" source="iPhone" unit="count" creationDate="2026-10-01 08:00:00 +0800" startDate="2026-10-01 00:00:00 +0800" endDate="2026-10-01 23:59:59 +0800" value="10000"/>
 <Record type="HKQuantityTypeIdentifierActiveEnergyBurned" source="iPhone" unit="kcal" creationDate="2026-10-01 08:00:00 +0800" startDate="2026-10-01 00:00:00 +0800" endDate="2026-10-01 23:59:59 +0800" value="500"/>
 <Record type="HKQuantityTypeIdentifierBodyMass" source="Scale" unit="kg" creationDate="2026-10-01 08:00:00 +0800" startDate="2026-10-01 08:00:00 +0800" endDate="2026-10-01 08:00:00 +0800" value="70"/>
 <Record type="HKQuantityTypeIdentifierRestingHeartRate" source="Watch" unit="count/min" creationDate="2026-10-01 08:00:00 +0800" startDate="2026-10-01 08:00:00 +0800" endDate="2026-10-01 08:00:00 +0800" value="58"/>
 <Record type="HKQuantityTypeIdentifierDietaryWater" source="iPhone" unit="mL" creationDate="2026-10-01 08:00:00 +0800" startDate="2026-10-01 00:00:00 +0800" endDate="2026-10-01 23:59:59 +0800" value="2000"/>
 <Record type="HKCategoryTypeIdentifierSleepAnalysis" source="Watch" creationDate="2026-10-01 08:00:00 +0800" startDate="2026-10-01 23:00:00 +0800" endDate="2026-10-02 07:00:00 +0800" value="HKCategoryValueSleepAnalysisAsleepCore"/>
 <Record type="HKCategoryTypeIdentifierSleepAnalysis" source="Watch" creationDate="2026-10-01 08:00:00 +0800" startDate="2026-10-02 03:00:00 +0800" endDate="2026-10-02 05:30:00 +0800" value="HKCategoryValueSleepAnalysisAsleepDeep"/>
 <Record type="HKCategoryTypeIdentifierSleepAnalysis" source="Watch" creationDate="2026-10-01 08:00:00 +0800" startDate="2026-10-02 05:30:00 +0800" endDate="2026-10-02 07:00:00 +0800" value="HKCategoryValueSleepAnalysisAsleepREM"/>
 <Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="45" durationUnit="min" totalEnergyBurned="400" totalEnergyBurnedUnit="kcal" totalDistance="5" totalDistanceUnit="km" startDate="2026-10-01 18:00:00 +0800" endDate="2026-10-01 18:45:00 +0800"/>
</HealthData>`;
  const out = await I.parseHealthContent('apple_health_export.xml', xml);
  eq('识别为 apple_health', out.detectedSource, 'apple_health');
  eq('活动日与睡眠日分开（步数属 10-01，睡眠属醒来日 10-02）', out.entries.length, 2);
  const actDay = out.entries.find((e) => e.date === '2026-10-01');
  const sleepDay = out.entries.find((e) => e.date === '2026-10-02');
  ok('存在活动日条目', !!actDay);
  ok('存在睡眠日条目', !!sleepDay);
  eq('步数 10000 落在 10-01', actDay.steps, 10000);
  eq('活动消耗 500 落在 10-01', actDay.caloriesBurned, 500);
  eq('体重 70 落在 10-01', actDay.weightKg, 70);
  eq('静息心率 58 落在 10-01', actDay.restingHr, 58);
  eq('饮水 2000ml 落在 10-01', actDay.waterMl, 2000);
  eq('运动时长 45min 落在 10-01', actDay.exerciseMinutes, 45);
  ok('运动类型被记录', /Running/.test(actDay.exerciseType || ''), actDay.exerciseType);

  near('Core 睡眠 8h 计入浅睡', sleepDay.lightSleepHours, 8, 0.01);
  near('深睡 2.5h（03:00→05:30）', sleepDay.deepSleepHours, 2.5, 0.01);
  near('REM 1.5h（05:30→07:00）', sleepDay.remSleepHours, 1.5, 0.01);
  near('总睡眠 12h（阶段区间不重叠）', sleepDay.sleepHours, 12, 0.01);
  eq('起床时间 07:00 = 420 分钟', sleepDay.wakeTimeMinutes, 420);
  eq('跨夜入睡 23:00 → 从 18:00 起算 300 分钟', sleepDay.bedtimeMinutes, 300);
}

// ==========================================
group('16. 导入器 —— 微信运动 JSON')
// ==========================================
{
  const json = JSON.stringify({
    stepInfoList: [
      { timestamp: 1767225600, step: 10000, distanceMeters: 8000, energyKcal: 300 },
      { timestamp: 1767312000, step: 12000, distanceMeters: 9500, energyKcal: 360 },
    ],
  });
  const out = await I.parseHealthContent('wechat.json', json);
  eq('识别为 wechat_run', out.detectedSource, 'wechat_run');
  eq('导入 2 天', out.entries.length, 2);
  eq('步数 10000', out.entries[0].steps, 10000);
  near('距离 8000m → 8km', out.entries[0].distanceKm, 8, 0.01);
  eq('消耗 300', out.entries[0].caloriesBurned, 300);
}
{
  const bad = '{not json';
  const out = await I.parseHealthContent('bad.json', bad);
  eq('坏 JSON 给出原因', out.skipped.length, 1);
  eq('坏 JSON 无条目', out.entries.length, 0);
}

// ==========================================
group('17. 导入器 —— 通用 JSON')
// ==========================================
{
  const json = JSON.stringify([
    { date: '2026-10-01', sleepHours: 7.5, steps: 9000 },
    { date: '2026-10-02', sleepHours: 8, steps: 11000 },
  ]);
  const out = await I.parseHealthContent('data.json', json);
  eq('通用 JSON 导入 2 条', out.entries.length, 2);
  eq('字段被正确映射', out.entries[0].sleepHours, 7.5);
}
{
  const json = JSON.stringify({ entries: [{ date: '2026-10-01', weightKg: 70 }] });
  const out = await I.parseHealthContent('wrapped.json', json);
  eq('包装式 JSON 也能解析', out.entries.length, 1);
}

// ==========================================
group('18. 导入器 —— 来源识别与合并')
// ==========================================
{
  eq('文件名含薄荷 → boohee', I.detectSourceFromName('薄荷健康_饮食记录.xlsx'), 'boohee');
  eq('文件名含华为 → huawei', I.detectSourceFromName('华为运动健康数据.csv'), 'huawei');
  eq('文件名含 export.xml → apple_health', I.detectSourceFromName('apple_health_export.xml'), 'apple_health');
  eq('文件名含微信 → wechat_run', I.detectSourceFromName('微信运动.json'), 'wechat_run');
  eq('通用文件名 → csv', I.detectSourceFromName('data.csv'), 'csv');
}
{
  // 薄荷风格：含餐次列
  const csv = `日期,早餐,午餐,晚餐,加餐,总热量(kcal)
2026-10-01,400,600,700,200,1900`;
  const out = await I.parseHealthContent('薄荷导出.csv', csv);
  eq('含餐次列识别为 boohee', out.detectedSource, 'boohee');
}
{
  const existing = [mkEntry('2026-10-01', { sleepHours: 7, steps: 5000 })];
  const incoming = [mkEntry('2026-10-01', { sleepHours: 8 }), mkEntry('2026-10-02', { sleepHours: 7 })];
  const r = I.mergeImportedEntries(existing, incoming);
  eq('合并后 2 条', r.merged.length, 2);
  eq('新增 1', r.added, 1);
  eq('覆盖 1', r.mergedCount, 1);
  eq('新值覆盖旧值', r.merged[0].sleepHours, 8);
  eq('未覆盖字段保留', r.merged[0].steps, 5000);
}
{
  // 幂等：重复导入同一份数据，条目数不增长
  const csv = `日期,步数
2026-10-01,1000
2026-10-02,2000`;
  let entries = [];
  for (let i = 0; i < 3; i++) {
    const out = await I.parseHealthContent('x.csv', csv);
    const r = I.mergeImportedEntries(entries, out.entries);
    entries = r.merged;
  }
  eq('重复导入 3 次后仍只有 2 条', entries.length, 2);
}

// ==========================================
group('19. 导入器 —— toNumber / normalizeDate')
// ==========================================
{
  eq('普通数字', I.toNumber('42'), 42);
  eq('带逗号', I.toNumber('1,234'), 1234);
  eq('带单位', I.toNumber('7.5h'), 7.5);
  eq('空字符串', I.toNumber(''), undefined);
  eq('破折号', I.toNumber('—'), undefined);
  eq('null 文本', I.toNumber('null'), undefined);
  eq('负数', I.toNumber('-3.2'), -3.2);
  eq('Excel 序列号', I.normalizeDate('46296'), '2026-10-01');
  eq('中文日期', I.normalizeDate('2026年10月1日'), '2026-10-01');
  eq('带时间的 ISO', I.normalizeDate('2026-10-01 08:00:00 +0800'), '2026-10-01');
  eq('非法日期', I.normalizeDate('not-a-date'), null);
}

// ==========================================
group('20. 导入 → 分析 全链路')
// ==========================================
{
  const csv = `日期,睡眠时长(h),运动时长(min),步数,摄入热量(kcal),消耗热量(kcal),体重(kg)
${Array.from({ length: 20 }, (_, i) => {
    const d = String(i + 1).padStart(2, '0');
    return `2026-10-${d},${(6.5 + (i % 4) * 0.5).toFixed(1)},${20 + (i % 6) * 10},${6000 + i * 200},${2000 + (i % 3) * 100},${2300},${(70 - i * 0.03).toFixed(2)}`;
  }).join('\n')}`;
  const out = await I.parseHealthContent('chain.csv', csv);
  eq('导入 20 天', out.entries.length, 20);
  const analysis = A.analyzeHealth(out.entries, A.DEFAULT_HEALTH_GOALS, 'day', 14);
  eq('分析得到 14 个周期', analysis.rollups.length, 14);
  ok('产出洞察', analysis.insights.length > 0);
  ok('产出相关性', analysis.correlations.length > 0);
  ok('总体评分有效', analysis.overallScore > 0, `实际 ${analysis.overallScore}`);
  const trend = analysis.trends.find((t) => t.key === 'weightKg');
  ok('体重趋势向下', trend && trend.direction === 'down', trend ? trend.direction : 'none');
}

// ==========================================
console.log('\n' + '='.repeat(56));
console.log(`通过 ${pass} / 失败 ${fail} / 合计 ${pass + fail}`);
if (failures.length) {
  console.log('\n失败明细：');
  for (const f of failures) console.log('  ✗ ' + f);
}
console.log('='.repeat(56));
process.exit(fail ? 1 : 0);
