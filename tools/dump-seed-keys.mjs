/**
 * 临时诊断：dump 种子节点的实际 cycle/periodKey 与树结构。
 * 目的：验证默认周层（activeCycle='week'）过滤能否命中节点。
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

async function loadTsModule(relPath) {
  const outPath = resolve(OUT_DIR, relPath.replace(/[\\/]/g, '_') + '.mjs');
  await build({
    entryPoints: [resolve(ROOT, relPath)],
    bundle: true,
    format: 'esm',
    target: 'es2022',
    platform: 'node',
    outfile: outPath,
    loader: { '.ts': 'ts' },
  });
  const mod = await import(pathToFileURL(outPath).href + '?t=' + Date.now());
  return mod;
}

const seedMod = await loadTsModule('src/data/planSeedData.ts');
const plan = await loadTsModule('src/utils/planReconciliation.ts');
const NODES = seedMod.INITIAL_PLAN_NODES;

const today = new Date();
const todayWeekKey = plan.getPeriodKey(today, 'week');
const todayMonthKey = plan.getPeriodKey(today, 'month');
const todayQuarterKey = plan.getPeriodKey(today, 'quarter');
const todayYearKey = plan.getPeriodKey(today, 'year');

console.log('today =', today.toDateString());
console.log('weekKey =', todayWeekKey, '| monthKey =', todayMonthKey,
  '| quarterKey =', todayQuarterKey, '| yearKey =', todayYearKey);
console.log('--- 种子节点周期键 ---');
for (const n of NODES) {
  console.log(
    `${n.id.padEnd(6)} ${n.cycle.padEnd(8)} ${String(n.periodKey).padEnd(12)} ` +
    `parent=${String(n.parentId).padEnd(7)} kids=[${n.children.join(',')}]`
  );
}

console.log('--- 各层按「今天」过滤命中数 ---');
for (const c of ['day', 'week', 'month', 'quarter', 'year']) {
  const key = plan.getPeriodKey(today, c);
  const hit = NODES.filter((n) => n.cycle === c && n.periodKey === key);
  console.log(`${c.padEnd(8)} key=${String(key).padEnd(12)} 命中 ${hit.length} 个: ${hit.map((n) => n.id).join(',')}`);
}

console.log('--- 父子双向核对 ---');
const byId = Object.fromEntries(NODES.map((n) => [n.id, n]));
let bad = 0;
for (const n of NODES) {
  if (!n.parentId) continue;
  const p = byId[n.parentId];
  if (!p) { console.log(`  !! ${n.id} 的 parent ${n.parentId} 不存在`); bad++; continue; }
  if (!p.children.includes(n.id)) { console.log(`  !! ${n.id} 未登记到 ${p.id}.children`); bad++; }
}
for (const n of NODES) {
  for (const c of n.children) {
    if (!byId[c]) { console.log(`  !! ${n.id}.children 含不存在的 ${c}`); bad++; }
  }
}
console.log(bad === 0 ? '  父子登记一致，无孤儿' : `  存在 ${bad} 处问题`);
