/**
 * 计划数据版本迁移的单元测试。
 *
 * 覆盖三档策略：
 *   1. 无本地数据        → 用新种子
 *   2. 旧种子（未改动）  → 整体替换成新种子
 *   3. 旧数据（用户改过）→ 保留用户编辑，周期键换成新的
 *   4. 版本号已是最新    → 不动（幂等）
 */
import * as esbuild from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let pass = 0;
let fail = 0;
const failures = [];

function check(name, cond, detail = '') {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    failures.push(`${name}${detail ? ' — ' + detail : ''}`);
    console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`);
  }
}

/** 打包 TS 模块并动态导入（transform() 不解析相对 import，必须 bundle） */
async function loadModule(entry) {
  const out = await esbuild.build({
    entryPoints: [path.join(__dirname, '..', entry)],
    bundle: true,
    format: 'esm',
    write: false,
    loader: { '.ts': 'ts' },
    platform: 'node',
    define: { 'process.env.NODE_ENV': '"test"' },
  });
  const code = out.outputFiles[0].text;
  const dataUrl = 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
  return import(dataUrl);
}

async function main() {
  console.log('\n════════ 计划数据版本迁移测试 ════════\n');

  const seedMod = await loadModule('src/data/planSeedData.ts');
  const migMod = await loadModule('src/utils/planSeedMigration.ts');

  const { INITIAL_PLAN_NODES, PLAN_SEED_VERSION, PLAN_SEED_VERSION_KEY } = seedMod;
  const { migratePlanNodes } = migMod;

  console.log('── 组 1/5：基础契约 ──');
  check('种子版本号已定义', typeof PLAN_SEED_VERSION === 'number' && PLAN_SEED_VERSION > 0, `v${PLAN_SEED_VERSION}`);
  check('版本号存储键已定义', typeof PLAN_SEED_VERSION_KEY === 'string' && PLAN_SEED_VERSION_KEY.length > 0);
  check('种子节点数 > 0', INITIAL_PLAN_NODES.length > 0, `${INITIAL_PLAN_NODES.length} 个`);

  console.log('\n── 组 2/5：无本地数据 ──');
  const r1 = migratePlanNodes(null, null);
  check('返回新种子', JSON.stringify(r1.nodes) === JSON.stringify(INITIAL_PLAN_NODES));
  check('标记为已迁移', r1.migrated === true);
  check('原因为 no-data', r1.reason === 'no-data', r1.reason);

  const r1b = migratePlanNodes('', null);
  check('空字符串也走 no-data', r1b.reason === 'no-data', r1b.reason);

  const r1c = migratePlanNodes('这不是JSON', null);
  check(
    '损坏数据兜底为新种子',
    JSON.stringify(r1c.nodes) === JSON.stringify(INITIAL_PLAN_NODES) && r1c.reason === 'fresh',
    r1c.reason
  );

  console.log('\n── 组 3/5：旧种子（用户未改动）──');
  // 构造一份「旧种子」：形态与上一版一致 —— 周期令牌是历史写死值，
  // 标题只把**周期令牌**换成旧的，其余（时间、正文）保持原样。
  //
  // 关键：周期键必须选一组**今天的新种子里不存在**的（陈旧的），
  // 否则「陈旧键残留」这条断言会永远 vacuous（空集合）而失去意义。
  // 注意旧版本真实写死过的是 2026-W44/2026-10/2026-Q4/2026-10-31 ——
  // 但今天(11/02)的新种子恰好包含它们（闲置周所在月/季/日），
  // 所以这里用一组更早的历史键来稳定地制造「陈旧」场景。
  const STALE_PERIOD = {
    year: '2025',
    quarter: '2026-Q2',
    month: '2026-06',
    week: '2026-W30',
    day: '2026-06-15',
  };
  const toOldTitle = (n) => {
    if (n.cycle === 'month') return n.title.replace(/^\d{1,2}\s*月：/, '6 月：');
    if (n.cycle === 'day') return n.title.replace(/^(\d{1,2}-\d{1,2})/, '6-15');
    if (n.cycle === 'week') return n.title.replace(/^第\s*\d+\s*周：/, '第 30 周：');
    if (n.cycle === 'quarter') return n.title.replace(/^第\s*\d+\s*季度/, '第 2 季度');
    return n.title;
  };
  const oldSeed = INITIAL_PLAN_NODES.map((n) => ({
    ...n,
    title: toOldTitle(n),
    periodKey: STALE_PERIOD[n.cycle] ?? n.periodKey,
  }));

  const r2 = migratePlanNodes(JSON.stringify(oldSeed), '1');
  check('识别为旧种子', r2.reason === 'pristine-old-seed', r2.reason);
  check('整体替换成新种子', JSON.stringify(r2.nodes) === JSON.stringify(INITIAL_PLAN_NODES));
  check('标记为已迁移', r2.migrated === true);

  // 注意：不能笼统查 "2026-W44" 是否消失 —— 今天(11/02)的新种子闲置周
  // 恰好就是 2026-W44，这是正确结果。
  // 正确判据：**迁移后每个节点的周期键必须与新种子完全一致**。
  check(
    '迁移后周期键与新种子完全一致',
    INITIAL_PLAN_NODES.every((seed) => {
      const got = r2.nodes.find((n) => n.id === seed.id);
      return got && got.periodKey === seed.periodKey && got.cycle === seed.cycle;
    }),
    r2.nodes.filter((n) => {
      const seed = INITIAL_PLAN_NODES.find((s) => s.id === n.id);
      return seed && seed.periodKey !== n.periodKey;
    }).length + ' 个不一致'
  );

  // 通用判据：凡「旧种子有、当前种子没有」的周期键，都不该残留在迁移结果里。
  // 注意不能硬编码「2026-10 必须消失」——今天(11/02)的新种子合法含 2026-10（闲置周所在月）。
  const currentKeys = new Set(INITIAL_PLAN_NODES.map((n) => n.periodKey));
  const staleKeys = [...new Set(oldSeed.map((n) => n.periodKey))].filter(
    (k) => !currentKeys.has(k)
  );
  check('能识别出陈旧周期键（测试前提）', staleKeys.length > 0, staleKeys.join(', '));
  check(
    '迁移结果无陈旧周期键残留',
    r2.nodes.every((n) => !staleKeys.includes(n.periodKey)),
    r2.nodes.filter((n) => staleKeys.includes(n.periodKey)).length + ' 个残留'
  );

  console.log('\n── 组 4/5：旧数据 + 用户改过 ──');
  const edited = oldSeed.map((n) => {
    if (n.id === 'pn-m1') {
      return { ...n, title: '我自己写的目标', plannedHours: 99, progress: 42, declaredProgress: 42 };
    }
    return n;
  });
  edited.push({
    ...oldSeed[0],
    id: 'pn-custom-1',
    title: '我自己加的节点',
    cycle: 'day',
    periodKey: '2026-11-03',
    parentId: undefined,
    children: [],
  });

  const r3 = migratePlanNodes(JSON.stringify(edited), '1');
  check('识别为用户改过', r3.reason === 'merged-user-edits', r3.reason);
  check('标记为已迁移', r3.migrated === true);

  const m1 = r3.nodes.find((n) => n.id === 'pn-m1');
  // 用户把整个标题重写了（没有周期前缀）→ 尊重用户原文
  check('用户重写的标题完整保留', m1?.title === '我自己写的目标', m1?.title);
  check('保留用户改的工时', m1?.plannedHours === 99, String(m1?.plannedHours));
  check('保留用户改的进度', m1?.progress === 42, String(m1?.progress));

  // 另一个节点：用户只改了正文，周期前缀应换成新的
  const edited2 = oldSeed.map((n) =>
    n.id === 'pn-m4' ? { ...n, title: '6 月：我自己改的正文' } : n
  );
  const r3b = migratePlanNodes(JSON.stringify(edited2), '1');
  const m4 = r3b.nodes.find((n) => n.id === 'pn-m4');
  check('标题正文保留用户改的内容', m4?.title.includes('我自己改的正文'), m4?.title);
  check(
    '标题周期前缀已换成新的',
    !m4?.title.startsWith('6 月：') && m4?.title.includes('月：'),
    m4?.title
  );

  const custom = r3.nodes.find((n) => n.id === 'pn-custom-1');
  check('保留用户自建节点', !!custom, custom?.title);
  check('自建节点未丢失', r3.nodes.length === INITIAL_PLAN_NODES.length + 1, `${r3.nodes.length} 个`);

  check(
    '所有种子节点的周期键已换成新的',
    INITIAL_PLAN_NODES.every((seed) => {
      const got = r3.nodes.find((n) => n.id === seed.id);
      return got && got.periodKey === seed.periodKey && got.cycle === seed.cycle;
    })
  );

  check(
    '合并结果无陈旧周期键残留',
    r3.nodes.every((n) => !staleKeys.includes(n.periodKey)),
    r3.nodes.filter((n) => staleKeys.includes(n.periodKey)).length + ' 个残留'
  );

  // 标题里的周期前缀也必须换新（标题写着"6 月："但周期键是 2026-11 就是自相矛盾）。
  //
  // 例外：用户把**整个标题**重写过（pn-m1 → "我自己写的目标"，无周期前缀）。
  // 这时「保留用户原文」和「前缀等于种子前缀」不可能同时成立 —— 尊重用户是更高优先级。
  // 判据：迁移后标题若**逐字等于用户原文**，说明是用户整体重写 → 跳过前缀比对；
  //       否则前缀必须与种子一致。
  const prefixOf = (t) => (t.match(/^[^：]*：/) || [''])[0];
  const userTitleById = new Map(edited.map((n) => [n.id, n.title]));
  const prefixMismatch = INITIAL_PLAN_NODES.filter((seed) => {
    const got = r3.nodes.find((n) => n.id === seed.id);
    if (!got) return false;
    // 用户整体重写了标题 → 逐字保留，跳过
    if (got.title === userTitleById.get(seed.id)) return false;
    const seedPrefix = prefixOf(seed.title);
    const gotPrefix = prefixOf(got.title);
    // 新种子标题有前缀、迁移后却丢了 → 失败
    if (seedPrefix && !gotPrefix) return true;
    // 两边都有前缀但不一致 → 失败（周期标签没换新）
    if (seedPrefix && gotPrefix && seedPrefix !== gotPrefix) return true;
    return false;
  });
  check(
    '标题周期前缀已换成新的',
    prefixMismatch.length === 0,
    prefixMismatch.map((s) => s.id).join(', ')
  );

  console.log('\n── 组 5/5：幂等与版本号 ──');
  const r4 = migratePlanNodes(JSON.stringify(r3.nodes), String(PLAN_SEED_VERSION));
  check('版本号最新时不迁移', r4.migrated === false && r4.reason === 'fresh', r4.reason);
  check('数据原样返回', JSON.stringify(r4.nodes) === JSON.stringify(r3.nodes));

  const r5 = migratePlanNodes(JSON.stringify(r3.nodes), '1');
  check('重复迁移结果稳定', JSON.stringify(r5.nodes) === JSON.stringify(r3.nodes));
  check('重复迁移仍标记已迁移', r5.migrated === true, r5.reason);

  console.log('\n════════ 结果 ════════');
  console.log(`通过 ${pass} 项，失败 ${fail} 项`);
  if (fail > 0) {
    console.log('\n失败明细：');
    failures.forEach((f) => console.log('  - ' + f));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
