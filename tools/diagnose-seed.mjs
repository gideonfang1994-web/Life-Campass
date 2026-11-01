/**
 * 种子数据体检脚本（一次性诊断工具）。
 *
 * 作用：用**真实勾稽引擎**跑 INITIAL_PLAN_NODES，列出全部诊断问题，
 *      并校验树结构自洽性（父子登记双向一致、无环、工时算术）。
 *
 * 关键：planSeedData.ts 真实 import 了 planReconciliation.ts，
 *      所以必须用 esbuild 的 build({ bundle: true })，
 *      transform() 只转译单个文件、不解析相对 import，会 ERR_MODULE_NOT_FOUND。
 *
 * 运行：node tools/diagnose-seed.mjs
 */
import { pathToFileURL } from 'node:url';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
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
const INITIAL_PLAN_NODES = seedMod.INITIAL_PLAN_NODES;
const plan = await loadTsModule('src/utils/planReconciliation.ts');

const nodes = INITIAL_PLAN_NODES;
const map = new Map(nodes.map((n) => [n.id, n]));

console.log('='.repeat(60));
console.log('种子节点数：', nodes.length);
console.log('周期键分布：');
for (const n of nodes) {
  console.log(`  ${n.id.padEnd(6)} ${n.cycle.padEnd(8)} ${n.periodKey.padEnd(10)} 父=${(n.parentId || '-').padEnd(6)} 子=[${(n.children || []).join(',')}]`);
}

console.log('\n--- 结构自洽 ---');
let structural = 0;
for (const n of nodes) {
  for (const cid of n.children || []) {
    const c = map.get(cid);
    if (!c) {
      console.log(`  ✗ ${n.id} 引用了不存在的子节点 ${cid}`);
      structural++;
    } else if (c.parentId !== n.id) {
      console.log(`  ✗ ${n.id} 引用 ${cid}，但 ${cid}.parentId=${c.parentId}`);
      structural++;
    }
  }
  if (n.parentId && !map.get(n.parentId)?.children?.includes(n.id)) {
    console.log(`  ✗ ${n.id} 声明 parentId=${n.parentId}，但父节点 children 未登记`);
    structural++;
  }
}
// 环检测
for (const n of nodes) {
  const seen = new Set();
  let cur = n;
  let hops = 0;
  while (cur && hops < 30) {
    if (seen.has(cur.id)) {
      console.log(`  ✗ 检测到环：${n.id}`);
      structural++;
      break;
    }
    seen.add(cur.id);
    cur = cur.parentId ? map.get(cur.parentId) : null;
    hops++;
  }
}
console.log(structural === 0 ? '  ✓ 结构自洽（无孤儿 / 无环）' : `  ✗ 结构问题 ${structural} 处`);

console.log('\n--- 勾稽诊断（真实引擎）---');
const issues = plan.diagnoseReconciliation(nodes);
const byType = {};
for (const i of issues) (byType[i.type] ||= []).push(i);
for (const [type, list] of Object.entries(byType)) {
  console.log(`\n[${type}] × ${list.length}`);
  for (const i of list) {
    console.log(`   · ${i.severity.padEnd(8)} ${i.nodeId.padEnd(6)} ${i.periodKey.padEnd(10)} ${i.message}`);
  }
}

console.log('\n--- 汇总 ---');
console.log('问题总数：', issues.length);
for (const t of ['orphan', 'period_mismatch', 'empty_period', 'progress_inconsistent']) {
  const n = (byType[t] || []).length;
  console.log(`  ${n === 0 ? '✓' : '✗'} ${t.padEnd(22)} ${n}`);
}
for (const t of ['unallocated_time', 'overallocated_time', 'no_descendant', 'completed_no_proof', 'time_underuse']) {
  const n = (byType[t] || []).length;
  console.log(`  ${n > 0 ? '✓' : '·'} ${t.padEnd(22)} ${n}`);
}

console.log('\n--- 期望命中的诊断（用于回归守护）---');
const EXPECT_HIT = ['unallocated_time', 'overallocated_time', 'no_descendant', 'completed_no_proof', 'time_underuse'];
const EXPECT_CLEAN = ['orphan', 'period_mismatch', 'empty_period', 'progress_inconsistent'];
let fail = 0;
for (const t of EXPECT_HIT) {
  const n = (byType[t] || []).length;
  if (n === 0) { console.log(`  ✗ 未命中 ${t}`); fail++; }
}
for (const t of EXPECT_CLEAN) {
  const n = (byType[t] || []).length;
  if (n > 0) { console.log(`  ✗ 误报 ${t} × ${n}`); fail++; }
}
console.log(fail === 0 ? '\n✓ 全部符合预期' : `\n✗ ${fail} 项不符合预期`);
