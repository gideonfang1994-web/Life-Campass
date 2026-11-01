/**
 * 种子数据「任意日期」回归模拟器。
 *
 * 目的：planSeedData.ts 的周期键全部相对「今天」动态派生，
 *      必须验证在一年中的**每一天**打开，五类演示问题都能命中、
 *      且四类误报都不会出现。
 *
 * 手法：用 MockDate 冻结全局 Date，让种子模块在模块初始化时
 *      按指定日期重新计算一遍周期键（真实代码路径，不是另写一套逻辑）。
 *      esbuild 只打一次包，之后用不同的 ?t= 查询串强制重新求值模块。
 *
 * 运行：node tools/simulate-seed-dates.mjs [起始ISO日期] [天数]
 */
import { pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { build } from 'esbuild';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUT_DIR = resolve(ROOT, '.tmp-seed');
mkdirSync(OUT_DIR, { recursive: true });

const START = process.argv[2] || '2026-01-01';
const DAYS = Number(process.argv[3] || 730);

// ---------- 打包 ----------
const SEED_OUT = resolve(OUT_DIR, 'sim_seed.mjs');
await build({
  entryPoints: [resolve(ROOT, 'src/data/planSeedData.ts')],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  platform: 'node',
  outfile: SEED_OUT,
  loader: { '.ts': 'ts' },
});
const PLAN_OUT = resolve(OUT_DIR, 'sim_plan.mjs');
await build({
  entryPoints: [resolve(ROOT, 'src/utils/planReconciliation.ts')],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  platform: 'node',
  outfile: PLAN_OUT,
  loader: { '.ts': 'ts' },
});

const plan = await import(pathToFileURL(PLAN_OUT).href);
const SEED_URL = pathToFileURL(SEED_OUT).href;

// ---------- MockDate ----------
const RealDate = Date;
function installMockDate(fixed) {
  class MockDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(fixed.getTime());
      else super(...args);
    }
    static now() {
      return fixed.getTime();
    }
  }
  globalThis.Date = MockDate;
}
function restoreDate() {
  globalThis.Date = RealDate;
}

// ---------- 契约 ----------
const REQUIRED = [
  'unallocated_time',
  'overallocated_time',
  'no_descendant',
  'completed_no_proof',
  'time_underuse',
];
const FORBIDDEN = [
  'orphan',
  'period_mismatch',
  'empty_period',
  'progress_inconsistent',
];

// ---------- 逐日模拟 ----------
const failures = [];
const start = new RealDate(START + 'T12:00:00');
let seq = 0;

for (let i = 0; i < DAYS; i++) {
  const d = new RealDate(start.getTime());
  d.setDate(d.getDate() + i);

  installMockDate(d);
  try {
    // 强制重新求值种子模块（模块作用域里 new Date() 会被 mock 拦截）
    const seedMod = await import(SEED_URL + '?t=' + (++seq));
    const nodes = seedMod.INITIAL_PLAN_NODES;

    const reconciled = plan.reconcileTree(nodes);
    const issues = plan.diagnoseReconciliation(nodes, reconciled);
    const kinds = new Set(issues.map((x) => x.type));

    const missing = REQUIRED.filter((k) => !kinds.has(k));
    const spurious = FORBIDDEN.filter((k) => kinds.has(k));

    if (missing.length || spurious.length) {
      failures.push({
        date: d.toISOString().slice(0, 10),
        missing,
        spurious,
        kinds: [...kinds],
      });
    }
  } catch (e) {
    failures.push({ date: d.toISOString().slice(0, 10), error: String(e && e.message) });
  } finally {
    restoreDate();
  }
}

console.log(`模拟区间：${START} 起共 ${DAYS} 天`);
console.log(`失败天数：${failures.length}`);
if (failures.length) {
  console.log('--- 前 20 条 ---');
  for (const f of failures.slice(0, 20)) {
    console.log(
      `${f.date}  缺=[${(f.missing || []).join(',')}]  误报=[${(f.spurious || []).join(',')}]` +
      (f.error ? `  异常=${f.error}` : '')
    );
  }
  // 按季度边界聚类
  const byMonth = {};
  for (const f of failures) {
    const m = f.date.slice(0, 7);
    byMonth[m] = (byMonth[m] || 0) + 1;
  }
  console.log('--- 按月分布 ---');
  for (const [m, c] of Object.entries(byMonth)) console.log(`  ${m}: ${c} 天`);
  process.exit(1);
}
console.log('✅ 所有日期均满足：五类演示问题全部命中，四类误报全部为零');
