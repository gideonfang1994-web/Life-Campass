import { PlanNode } from '../types';
import { INITIAL_PLAN_NODES, PLAN_SEED_VERSION, PLAN_SEED_VERSION_KEY } from '../data/planSeedData';

/**
 * 计划数据版本迁移。
 *
 * ── 背景 ──────────────────────────────────────────────────────
 * 计划数据存在浏览器 localStorage（键 `life_coach_plan_nodes`）。
 * 代码里的种子改成了动态周期键，但**用户浏览器里的旧数据不会自动变**：
 * 里面躺着写死的 `2026-W44` 等历史周期键，计划板一片空白，
 * 用户只会觉得「数据丢了」。
 *
 * ── 关键区分：周期派生字段 vs 用户编辑字段 ──────────────────────
 * 种子的**标题里内嵌了周期标签**（"第 44 周：写完脚本…"、"10 月：…"）。
 * 所以「周期信息」同时存在于两个地方：
 *   - periodKey 字段（纯周期键）
 *   - title 里的周期前缀（"第 44 周：" / "10 月："）
 *
 * 这两类字段在迁移时**必须换成新周期的**（否则标题写着"第 44 周"、
 * 周期键却是 W45，内容自相矛盾）。
 * 而工时、进度、交付物、状态这些是**用户自己的数据**，必须保留。
 *
 * ── 迁移策略（三档） ──────────────────────────────────────────
 *   1. 没有本地数据        → 直接用新种子。
 *   2. 本地数据 = 纯旧种子 → 整体替换成新种子（用户没动过）。
 *   3. 本地数据被用户改过  → **保留用户的编辑**，只把周期派生字段
 *                            对齐到新种子。
 */

/**
 * 周期派生字段：迁移时一律换成新种子的值。
 *
 * 注意 title 不在此列 —— 见下方 replacePeriodPrefix()。
 * 种子标题形如「第 44 周：写完脚本…」，周期前缀与正文是**两件事**：
 * 前缀必须换新（否则标题写着旧周期），正文是用户可能改过的内容（必须保留）。
 */
const PERIOD_DERIVED_FIELDS: (keyof PlanNode)[] = ['periodKey', 'cycle'];

/**
 * 用户编辑字段：迁移时保留用户自己的值。
 * 这些是用户投入的心血，不能因为种子升级就抹掉。
 */
const USER_EDITABLE_FIELDS: (keyof PlanNode)[] = [
  'dimension',
  'projectId',
  'goalId',
  'plannedHours',
  'actualHours',
  'weight',
  'progress',
  'declaredProgress',
  'status',
  'deliverable',
  'successCriteria',
  'verificationProof',
  'note',
];

/**
 * 种子标题里周期前缀的形态：`前缀：正文`
 *
 * 前缀的可能形态（由 planSeedData 的 *_LABEL / md() 生成）：
 *   "第 4 季度冲刺："  "10 月："  "第 44 周："  "10-31 上午 09:00-11:00："  "2026 年："
 *
 * 迁移时要把旧前缀换成新前缀，正文原样保留。
 */
const TITLE_PREFIX_RE =
  /^((?:\d{4}\s*年|\d{4}\s*年第\s*\d+\s*周|第\s*\d+\s*周|第\s*\d+\s*季度|\d{1,2}\s*月|\d{1,2}-\d{1,2}\s)[^：]*：)/;

/**
 * 把旧标题的周期前缀换成新标题的前缀，正文保留。
 *
 * 若旧标题没有可识别的周期前缀（用户自己改写过整个标题），
 * 则**保留用户原文** —— 用户写的标题不该被种子覆盖。
 */
function replacePeriodPrefix(oldTitle: string, newTitle: string): string {
  const oldMatch = oldTitle.match(TITLE_PREFIX_RE);
  const newMatch = newTitle.match(TITLE_PREFIX_RE);
  if (!oldMatch || !newMatch) {
    // 用户重写过整个标题 → 尊重用户
    return oldTitle;
  }
  const oldBody = oldTitle.slice(oldMatch[1].length);
  const newPrefix = newMatch[1];
  return newPrefix + oldBody;
}

/**
 * 剥掉标题的周期前缀，只留正文。
 * 用于比对「用户是否改过标题正文」。
 */
function stripPeriodPrefix(title: string): string {
  const m = title.match(TITLE_PREFIX_RE);
  return m ? title.slice(m[1].length) : title;
}

/**
 * 判断一份本地数据是否「就是旧版种子、用户没动过」。
 *
 * 判据：节点 ID 集合与新种子一致，且**所有非周期字段**都与种子相同。
 * 只比非周期字段 —— 因为周期字段本来就该不同（旧数据是历史周期键），
 * 拿它们比会把「纯旧种子」误判成「用户改过」。
 */
function isPristineSeed(nodes: PlanNode[]): boolean {
  if (!Array.isArray(nodes) || nodes.length === 0) return false;

  const seedIds = new Set(INITIAL_PLAN_NODES.map((n) => n.id));
  for (const n of nodes) {
    if (!seedIds.has(n.id)) return false;
  }

  const seedById = new Map(INITIAL_PLAN_NODES.map((n) => [n.id, n]));
  for (const n of nodes) {
    const seed = seedById.get(n.id);
    if (!seed) return false;

    // 周期字段不比（旧数据必然不同）；其余字段必须完全一致
    for (const field of USER_EDITABLE_FIELDS) {
      const oldValue = n[field];
      const seedValue = seed[field];
      if (oldValue === undefined && seedValue === undefined) continue;
      if (oldValue !== seedValue) return false;
    }

    // 标题：只比正文（周期前缀本就不同，比整体会把纯旧种子误判成用户改过）
    const oldBody = stripPeriodPrefix(n.title || '');
    const seedBody = stripPeriodPrefix(seed.title || '');
    if (oldBody !== seedBody) return false;
  }

  return true;
}

/**
 * 把用户改过的旧数据合并到新种子上。
 *
 * 原则：
 * - **用户的编辑永远优先**（工时/进度/交付物/状态等）
 * - **周期派生字段用新的**（标题周期前缀、周期键、层级）
 * - 拓扑（parentId / children）用新的 —— 跨季时父节点可能变了
 * - 用户自己新建的节点 → 原样保留
 */
function mergeUserEdits(oldNodes: PlanNode[]): PlanNode[] {
  const oldById = new Map(oldNodes.map((n) => [n.id, n]));
  const result: PlanNode[] = [];

  for (const seed of INITIAL_PLAN_NODES) {
    const old = oldById.get(seed.id);
    if (!old) {
      // 种子新增的节点（跨季/跨年承接节点）→ 直接并入
      result.push(seed);
      continue;
    }

    const merged: PlanNode = { ...seed };

    // 周期派生字段：明确用种子的
    for (const field of PERIOD_DERIVED_FIELDS) {
      if (field === 'periodKey') merged.periodKey = seed.periodKey;
      else merged.cycle = seed.cycle;
    }

    // 标题：只换周期前缀，正文保留用户的
    merged.title = replacePeriodPrefix(old.title || seed.title, seed.title);

    // 用户编辑字段：保留用户的
    for (const field of USER_EDITABLE_FIELDS) {
      const oldValue = old[field];
      if (oldValue === undefined) continue;
      (merged as any)[field] = oldValue;
    }

    // 拓扑用新的（跨季时父节点会变）
    merged.parentId = seed.parentId;
    merged.children = seed.children;

    result.push(merged);
  }

  // 用户自己新建的节点（种子里没有的）→ 原样保留
  const seedIds = new Set(INITIAL_PLAN_NODES.map((n) => n.id));
  for (const old of oldNodes) {
    if (!seedIds.has(old.id)) {
      result.push(old);
    }
  }

  return result;
}

export interface MigrationResult {
  nodes: PlanNode[];
  migrated: boolean;
  reason: 'no-data' | 'fresh' | 'pristine-old-seed' | 'merged-user-edits';
}

/**
 * 执行迁移。返回迁移后的节点与迁移说明。
 *
 * 幂等：连续调用两次，第二次返回 reason='fresh'，数据不变。
 */
export function migratePlanNodes(
  raw: string | null | undefined,
  storedVersion: string | null | undefined
): MigrationResult {
  // 情况 1：从来没存过数据
  if (!raw) {
    return { nodes: INITIAL_PLAN_NODES, migrated: true, reason: 'no-data' };
  }

  let parsed: PlanNode[];
  try {
    parsed = JSON.parse(raw);
  } catch {
    // 情况 2：数据损坏 → 用新种子兜底
    return { nodes: INITIAL_PLAN_NODES, migrated: true, reason: 'fresh' };
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return { nodes: INITIAL_PLAN_NODES, migrated: true, reason: 'fresh' };
  }

  // 情况 3：版本号已是最新 → 不动
  if (storedVersion === String(PLAN_SEED_VERSION)) {
    return { nodes: parsed, migrated: false, reason: 'fresh' };
  }

  // 情况 4：旧数据，但除周期外与种子完全一致 → 整体替换
  if (isPristineSeed(parsed)) {
    return { nodes: INITIAL_PLAN_NODES, migrated: true, reason: 'pristine-old-seed' };
  }

  // 情况 5：旧数据且用户改过 → 合并
  return { nodes: mergeUserEdits(parsed), migrated: true, reason: 'merged-user-edits' };
}

/**
 * 迁移完成后写回版本号。
 * 单独抽出来，方便在 App 的初始化里调用，也方便测试断言。
 */
export function persistPlanSeedVersion(): void {
  try {
    localStorage.setItem(PLAN_SEED_VERSION_KEY, String(PLAN_SEED_VERSION));
  } catch {
    // 隐私模式下 localStorage 可能不可写，忽略即可
  }
}
