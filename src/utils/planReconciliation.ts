import {
  PlanNode,
  PlanCycle,
  CycleRollup,
  ReconciliationIssue,
  ReconciliationIssueType,
  ProjectCategory,
} from '../types';

// ==========================================
// 周期工具：年 / 季 / 月 / 周 / 日 的键计算与导航
// ==========================================

export const CYCLE_ORDER: PlanCycle[] = ['year', 'quarter', 'month', 'week', 'day'];

export const CYCLE_LABEL: Record<PlanCycle, string> = {
  year: '年度',
  quarter: '季度',
  month: '月度',
  week: '周',
  day: '日',
};

export const CYCLE_LABEL_EN: Record<PlanCycle, string> = {
  year: 'Year',
  quarter: 'Quarter',
  month: 'Month',
  week: 'Week',
  day: 'Day',
};

/** 层级深度：年=0 最上层 */
export const CYCLE_DEPTH: Record<PlanCycle, number> = {
  year: 0,
  quarter: 1,
  month: 2,
  week: 3,
  day: 4,
};

const pad = (n: number) => String(n).padStart(2, '0');

/** 取某日期所在周的 ISO 周键，如 2026-W43 */
export function getWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7; // 周一=1 ... 周日=7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // 移到本周周四
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${pad(week)}`;
}

export function getMonthKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

export function getQuarterKey(date: Date): string {
  return `${date.getFullYear()}-Q${Math.floor(date.getMonth() / 3) + 1}`;
}

export function getYearKey(date: Date): string {
  return `${date.getFullYear()}`;
}

export function getDayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 统一入口：给定日期与层级，返回周期键 */
export function getPeriodKey(date: Date, cycle: PlanCycle): string {
  switch (cycle) {
    case 'year':
      return getYearKey(date);
    case 'quarter':
      return getQuarterKey(date);
    case 'month':
      return getMonthKey(date);
    case 'week':
      return getWeekKey(date);
    case 'day':
      return getDayKey(date);
  }
}

/** 人类可读的周期标签 */
export function getPeriodLabel(cycle: PlanCycle, periodKey: string): string {
  if (cycle === 'year') return `${periodKey} 年`;
  if (cycle === 'quarter') return `${periodKey.replace('-', ' 第')} 季度`;
  if (cycle === 'month') {
    const [y, m] = periodKey.split('-');
    return `${y} 年 ${Number(m)} 月`;
  }
  if (cycle === 'week') return `${periodKey.replace('-W', ' 年第 ')} 周`;
  const [y, m, d] = periodKey.split('-');
  return `${y} 年 ${Number(m)} 月 ${Number(d)} 日`;
}

/** 周期在时间轴上的偏移，用于「上/下一周期」导航 */
export function shiftPeriodKey(cycle: PlanCycle, periodKey: string, delta: number): string {
  const base = new Date();
  if (cycle === 'day') {
    const [y, m, d] = periodKey.split('-').map(Number);
    base.setFullYear(y, m - 1, d);
    base.setDate(base.getDate() + delta);
    return getDayKey(base);
  }
  if (cycle === 'week') {
    // 以周一的 ISO 周为基准
    const [yStr, wStr] = periodKey.split('-W');
    const year = Number(yStr);
    const week = Number(wStr);
    const jan4 = new Date(year, 0, 4);
    const jan4Day = jan4.getDay() || 7;
    const week1Monday = new Date(year, 0, 4 - (jan4Day - 1));
    const monday = new Date(week1Monday);
    monday.setDate(week1Monday.getDate() + (week - 1) * 7 + delta * 7);
    return getWeekKey(monday);
  }
  if (cycle === 'month') {
    const [y, m] = periodKey.split('-').map(Number);
    base.setFullYear(y, m - 1, 1);
    base.setMonth(base.getMonth() + delta);
    return getMonthKey(base);
  }
  if (cycle === 'quarter') {
    const [yStr, qStr] = periodKey.split('-Q');
    const y = Number(yStr);
    const q = Number(qStr);
    const monthIdx = (q - 1) * 3;
    base.setFullYear(y, monthIdx, 1);
    base.setMonth(base.getMonth() + delta * 3);
    return getQuarterKey(base);
  }
  const y = Number(periodKey);
  return `${y + delta}`;
}

/** 当前周期所属的父周期键 */
export function getParentPeriodKey(cycle: PlanCycle, periodKey: string): string | null {
  if (cycle === 'year') return null;
  if (cycle === 'day') {
    const [y, m, d] = periodKey.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return getWeekKey(date);
  }
  if (cycle === 'week') {
    // 取该周的周四来定位月（ISO 周跨月时以周四为准）
    const [yStr, wStr] = periodKey.split('-W');
    const year = Number(yStr);
    const week = Number(wStr);
    const jan4 = new Date(year, 0, 4);
    const jan4Day = jan4.getDay() || 7;
    const week1Monday = new Date(year, 0, 4 - (jan4Day - 1));
    const thursday = new Date(week1Monday);
    thursday.setDate(week1Monday.getDate() + (week - 1) * 7 + 3);
    return getMonthKey(thursday);
  }
  if (cycle === 'month') {
    const [y, m] = periodKey.split('-').map(Number);
    return getQuarterKey(new Date(y, m - 1, 15));
  }
  if (cycle === 'quarter') {
    return periodKey.split('-Q')[0];
  }
  return null;
}

/** 从某周期键取出起始日期 */
export function periodKeyToDate(cycle: PlanCycle, periodKey: string): Date {
  if (cycle === 'day') {
    const [y, m, d] = periodKey.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  if (cycle === 'week') {
    const [yStr, wStr] = periodKey.split('-W');
    const year = Number(yStr);
    const week = Number(wStr);
    const jan4 = new Date(year, 0, 4);
    const jan4Day = jan4.getDay() || 7;
    const week1Monday = new Date(year, 0, 4 - (jan4Day - 1));
    const monday = new Date(week1Monday);
    monday.setDate(week1Monday.getDate() + (week - 1) * 7);
    return monday;
  }
  if (cycle === 'month') {
    const [y, m] = periodKey.split('-').map(Number);
    return new Date(y, m - 1, 1);
  }
  if (cycle === 'quarter') {
    const [yStr, qStr] = periodKey.split('-Q');
    return new Date(Number(yStr), (Number(qStr) - 1) * 3, 1);
  }
  return new Date(Number(periodKey), 0, 1);
}

/** 该周期包含的所有日子（用于把日节点归入周/月） */
export function daysInPeriod(cycle: PlanCycle, periodKey: string): string[] {
  if (cycle !== 'week' && cycle !== 'month') return [];
  if (cycle === 'week') {
    const monday = periodKeyToDate('week', periodKey);
    const out: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      out.push(getDayKey(d));
    }
    return out;
  }
  const first = periodKeyToDate('month', periodKey);
  const year = first.getFullYear();
  const month = first.getMonth();
  const count = new Date(year, month + 1, 0).getDate();
  const out: string[] = [];
  for (let i = 1; i <= count; i++) {
    out.push(getDayKey(new Date(year, month, i)));
  }
  return out;
}

// ==========================================
// 勾稽引擎：树形结构的建立、汇总与诊断
// ==========================================

export function buildNodeMap(nodes: PlanNode[]): Map<string, PlanNode> {
  const map = new Map<string, PlanNode>();
  for (const n of nodes) map.set(n.id, n);
  return map;
}

/** 取得某节点的所有后代 id（含孙级） */
export function getDescendantIds(node: PlanNode, nodeMap: Map<string, PlanNode>): string[] {
  const out: string[] = [];
  const stack = [...(node.children || [])];
  const guard = new Set<string>();
  while (stack.length) {
    const id = stack.pop()!;
    if (guard.has(id)) continue;
    guard.add(id);
    const child = nodeMap.get(id);
    if (!child) continue;
    out.push(id);
    stack.push(...(child.children || []));
  }
  return out;
}

/** 取得某节点的所有祖先 id（自近及远） */
export function getAncestorIds(node: PlanNode, nodeMap: Map<string, PlanNode>): string[] {
  const out: string[] = [];
  let cur = node.parentId ? nodeMap.get(node.parentId) : undefined;
  const guard = new Set<string>();
  while (cur && !guard.has(cur.id)) {
    guard.add(cur.id);
    out.push(cur.id);
    cur = cur.parentId ? nodeMap.get(cur.parentId) : undefined;
  }
  return out;
}

/**
 * 计算某节点的"自动进度"：
 * - 有子节点 → 按子节点 weight 加权平均（勾稽传导）
 * - 无子节点 → 用自身 progress
 */
export function computeAutoProgress(node: PlanNode, nodeMap: Map<string, PlanNode>): number {
  const children = (node.children || [])
    .map((id) => nodeMap.get(id))
    .filter(Boolean) as PlanNode[];

  if (children.length === 0) return Math.max(0, Math.min(100, node.progress || 0));

  const totalWeight = children.reduce((s, c) => s + (c.weight || 1), 0);
  if (totalWeight <= 0) {
    const avg = children.reduce((s, c) => s + (c.progress || 0), 0) / children.length;
    return Math.round(avg);
  }
  const weighted = children.reduce((s, c) => s + (c.progress || 0) * (c.weight || 1), 0);
  return Math.round(weighted / totalWeight);
}

/**
 * 递归自底向上重算整棵树的进度与状态。
 * 父节点的 progress 由子节点按 weight 加权汇总得到；
 * 父节点原本登记的 progress 被保留到 declaredProgress，供"进度不一致"诊断比对。
 * 返回新的节点数组（不修改入参）。
 */
export function reconcileTree(nodes: PlanNode[]): PlanNode[] {
  const nodeMap = buildNodeMap(nodes);

  // 自底向上：先处理深度最大的节点
  const byDepth = [...nodes].sort((a, b) => CYCLE_DEPTH[b.cycle] - CYCLE_DEPTH[a.cycle]);
  const updated = new Map<string, PlanNode>();
  for (const n of byDepth) updated.set(n.id, { ...n });

  for (const node of byDepth) {
    const children = (node.children || [])
      .map((id) => updated.get(id))
      .filter(Boolean) as PlanNode[];
    if (children.length === 0) continue;

    const auto = computeAutoProgress(node, updated);
    const next = updated.get(node.id)!;
    // 保留登记进度，供诊断比对（首次重算时以当前 progress 为登记值）
    if (next.declaredProgress === undefined) {
      next.declaredProgress = next.progress;
    }
    next.progress = auto;

    // 状态联动：有子节点全部完成 → 父节点完成；有子节点遇阻 → 父节点标记受阻
    const allDone = children.every(
      (c) => c.status === 'completed' || c.progress >= 100
    );
    const anyBlocked = children.some((c) => c.status === 'blocked');
    if (allDone) {
      next.status = 'completed';
    } else if (anyBlocked && next.status !== 'dropped') {
      next.status = 'blocked';
    } else if (next.status !== 'dropped' && next.status !== 'blocked') {
      next.status = auto > 0 ? 'in_progress' : 'not_started';
    }
    updated.set(node.id, next);
  }

  return nodes.map((n) => updated.get(n.id)!);
}

/**
 * 某层级的汇总：只统计该层直接节点（不重复计入子节点）。
 */
export function rollupCycle(
  nodes: PlanNode[],
  cycle: PlanCycle,
  periodKey: string,
  reconciled?: PlanNode[]
): CycleRollup {
  const src = reconciled || reconcileTree(nodes);
  const levelNodes = src.filter((n) => n.cycle === cycle && n.periodKey === periodKey);

  const plannedHours = levelNodes.reduce((s, n) => s + (n.plannedHours || 0), 0);
  const actualHours = levelNodes.reduce((s, n) => s + (n.actualHours || 0), 0);
  const totalWeight = levelNodes.reduce((s, n) => s + (n.weight || 1), 0);
  const progress =
    totalWeight > 0
      ? Math.round(levelNodes.reduce((s, n) => s + (n.progress || 0) * (n.weight || 1), 0) / totalWeight)
      : 0;

  return {
    cycle,
    periodKey,
    label: getPeriodLabel(cycle, periodKey),
    nodeCount: levelNodes.length,
    progress,
    plannedHours: Math.round(plannedHours * 10) / 10,
    actualHours: Math.round(actualHours * 10) / 10,
    hourFulfillment:
      plannedHours > 0 ? Math.round((actualHours / plannedHours) * 100) : 0,
    completedCount: levelNodes.filter((n) => n.status === 'completed').length,
    blockedCount: levelNodes.filter((n) => n.status === 'blocked').length,
    nodeIds: levelNodes.map((n) => n.id),
    issueCount: 0,
  };
}

/**
 * 取某周期的起始日期（年/季/月/周/日）
 */
export function periodStartDate(cycle: PlanCycle, periodKey: string): Date {
  if (cycle === 'day') return periodKeyToDate('day', periodKey);
  if (cycle === 'week') return periodKeyToDate('week', periodKey);
  if (cycle === 'month') return periodKeyToDate('month', periodKey);
  if (cycle === 'quarter') return periodKeyToDate('quarter', periodKey);
  return new Date(Number(periodKey), 0, 1);
}

/**
 * 取某周期的结束日期（含当日 23:59:59）
 */
export function periodEndDate(cycle: PlanCycle, periodKey: string): Date {
  if (cycle === 'day') {
    const d = periodKeyToDate('day', periodKey);
    d.setHours(23, 59, 59, 999);
    return d;
  }
  if (cycle === 'week') {
    const d = periodKeyToDate('week', periodKey);
    d.setDate(d.getDate() + 6);
    d.setHours(23, 59, 59, 999);
    return d;
  }
  if (cycle === 'month') {
    const first = periodKeyToDate('month', periodKey);
    const d = new Date(first.getFullYear(), first.getMonth() + 1, 0);
    d.setHours(23, 59, 59, 999);
    return d;
  }
  if (cycle === 'quarter') {
    const first = periodKeyToDate('quarter', periodKey);
    const d = new Date(first.getFullYear(), first.getMonth() + 3, 0);
    d.setHours(23, 59, 59, 999);
    return d;
  }
  const d = new Date(Number(periodKey), 11, 31);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * 取某周期在上一级（更粗粒度）所对应的周期键。
 * 例：'2026-10' → { cycle: 'quarter', periodKey: '2026-Q4' }
 */
export function coveringPeriod(
  cycle: PlanCycle,
  periodKey: string
): { cycle: PlanCycle; periodKey: string } | null {
  if (cycle === 'quarter') {
    return { cycle: 'year', periodKey: periodKey.split('-Q')[0] };
  }
  if (cycle === 'month') {
    const [y, m] = periodKey.split('-').map(Number);
    return { cycle: 'quarter', periodKey: getQuarterKey(new Date(y, m - 1, 15)) };
  }
  if (cycle === 'week') {
    const monday = periodKeyToDate('week', periodKey);
    const thursday = new Date(monday);
    thursday.setDate(monday.getDate() + 3);
    return { cycle: 'month', periodKey: getMonthKey(thursday) };
  }
  if (cycle === 'day') {
    const [y, m, d] = periodKey.split('-').map(Number);
    return { cycle: 'week', periodKey: getWeekKey(new Date(y, m - 1, d)) };
  }
  return null;
}

/**
 * 全量勾稽诊断。
 * 覆盖：孤儿节点 / 空叶子 / 工时漏项 / 过度承诺 / 工时超耗 / 进度不一致 /
 *       目标脱钩 / 中间层断链 / 跨期错配 / 空周期 / 完成缺证据
 */
export function diagnoseReconciliation(
  nodes: PlanNode[],
  reconciled?: PlanNode[]
): ReconciliationIssue[] {
  const issues: ReconciliationIssue[] = [];
  const src = reconciled || reconcileTree(nodes);
  const nodeMap = buildNodeMap(src);
  // 原始（未勾稽）节点映射：用于比对"登记进度"与"勾稽汇总进度"
  const rawMap = buildNodeMap(nodes);
  let seq = 0;
  const push = (issue: Omit<ReconciliationIssue, 'id'>) => {
    issues.push({ ...issue, id: `ri-${++seq}` });
  };

  const now = new Date();

  for (const node of src) {
    const children = (node.children || [])
      .map((id) => nodeMap.get(id))
      .filter(Boolean) as PlanNode[];

    // ① 孤儿节点：声明了子节点，但子节点的 parentId 不指回自己
    for (const cid of node.children || []) {
      const child = nodeMap.get(cid);
      if (!child) {
        push({
          type: 'orphan',
          severity: 'critical',
          cycle: node.cycle,
          nodeId: node.id,
          nodeTitle: node.title,
          periodKey: node.periodKey,
          message: `「${node.title}」引用了不存在的子节点 ${cid}`,
          suggestion: '该子节点已被删除，请移除引用或重新建立层级关系。',
        });
        continue;
      }
      if (child.parentId !== node.id) {
        push({
          type: 'orphan',
          severity: 'critical',
          cycle: node.cycle,
          nodeId: child.id,
          nodeTitle: child.title,
          periodKey: child.periodKey,
          message: `「${child.title}」被「${node.title}」引用，但其父级指向了别处，勾稽链在此断裂`,
          suggestion: '重新指定其归属父节点，确保年→季→月→周→日链路连贯。',
        });
      }
    }

    // ①-b 反向孤儿：声明了 parentId，但父节点的 children 里没有登记它
    if (node.parentId) {
      const parent = nodeMap.get(node.parentId);
      if (parent && !(parent.children || []).includes(node.id)) {
        push({
          type: 'orphan',
          severity: 'critical',
          cycle: node.cycle,
          nodeId: node.id,
          nodeTitle: node.title,
          periodKey: node.periodKey,
          message: `「${node.title}」声明归属「${parent.title}」，但没有被登记到它的下级清单里`,
          suggestion: '重新挂接或补登记，否则该节点永远不会计入父级汇总。',
        });
      }
    }

    // ② 叶子节点缺少交付物
    if (children.length === 0) {
      if (!node.deliverable || !node.deliverable.trim()) {
        push({
          type: 'leaf_without_output',
          severity: 'warning',
          cycle: node.cycle,
          nodeId: node.id,
          nodeTitle: node.title,
          periodKey: node.periodKey,
          message: `末级节点「${node.title}」没有写明交付物`,
          suggestion: '写下"完成后具体交付什么"，否则无法判定是否真的达成。',
        });
      }

      // ②-b 断链：非日层节点完全没有下级 —— 计划没有落到日常动作
      if (node.cycle !== 'day') {
        const ended = periodEndDate(node.cycle, node.periodKey).getTime() < now.getTime();
        push({
          type: 'no_descendant',
          severity: ended ? 'warning' : 'info',
          cycle: node.cycle,
          nodeId: node.id,
          nodeTitle: node.title,
          periodKey: node.periodKey,
          message: ended
            ? `「${node.title}」所在的${CYCLE_LABEL[node.cycle]}周期已结束，却没有向下分解出任何动作`
            : `「${node.title}」停在${CYCLE_LABEL[node.cycle]}层，还没有继续向下分解`,
          suggestion: `继续拆解到${CYCLE_LABEL[nextCycle(node.cycle)]}层，让成果真正落到日常动作。`,
        });
      }
    } else {
      // ③ 中间层断链：有子节点但没有更深一层
      const deeperExists = children.some(
        (c) => CYCLE_DEPTH[c.cycle] > CYCLE_DEPTH[node.cycle]
      );
      if (!deeperExists && node.cycle !== 'day') {
        push({
          type: 'no_descendant',
          severity: 'warning',
          cycle: node.cycle,
          nodeId: node.id,
          nodeTitle: node.title,
          periodKey: node.periodKey,
          message: `「${node.title}」的下级没有比${CYCLE_LABEL[node.cycle]}更细的层级`,
          suggestion: `继续拆解到${CYCLE_LABEL[nextCycle(node.cycle)]}层，让成果真正落到日常动作。`,
        });
      }
    }

    // ④ 工时勾稽：子节点承诺之和 vs 父节点承诺
    if (children.length > 0) {
      const childPlanned = children.reduce((s, c) => s + (c.plannedHours || 0), 0);
      const parentPlanned = node.plannedHours || 0;
      const diff = parentPlanned - childPlanned;

      if (parentPlanned > 0 && Math.abs(diff) > 0.01) {
        if (diff > 0) {
          push({
            type: 'unallocated_time',
            severity: 'warning',
            cycle: node.cycle,
            nodeId: node.id,
            nodeTitle: node.title,
            periodKey: node.periodKey,
            message: `「${node.title}」承诺 ${parentPlanned}h，但下级只分配了 ${Math.round(childPlanned * 10) / 10}h，缺口 ${Math.round(diff * 10) / 10}h`,
            suggestion: '要么补齐下级分解，要么下调本级承诺工时，让时间账本真正对得上。',
            metric: { parentPlanned, childPlanned, gap: Math.round(diff * 10) / 10 },
          });
        } else {
          push({
            type: 'overallocated_time',
            severity: 'warning',
            cycle: node.cycle,
            nodeId: node.id,
            nodeTitle: node.title,
            periodKey: node.periodKey,
            message: `「${node.title}」下级承诺合计 ${Math.round(childPlanned * 10) / 10}h，超出本级 ${parentPlanned}h 约 ${Math.round(-diff * 10) / 10}h`,
            suggestion: '时间超载是假努力的温床，请裁掉低杠杆分支或提高本级工时预算。',
            metric: { parentPlanned, childPlanned, overflow: Math.round(-diff * 10) / 10 },
          });
        }
      }
    }

    // ⑤ 实际工时超耗 / 严重闲置（仅对已经开始或已结束的周期判定）
    const planned = node.plannedHours || 0;
    const actual = node.actualHours || 0;
    const started = periodStartDate(node.cycle, node.periodKey).getTime() <= now.getTime();
    const ended = periodEndDate(node.cycle, node.periodKey).getTime() < now.getTime();
    if (planned > 0 && actual > 0 && started) {
      if (actual > planned * 1.3) {
        push({
          type: 'time_overrun',
          severity: 'warning',
          cycle: node.cycle,
          nodeId: node.id,
          nodeTitle: node.title,
          periodKey: node.periodKey,
          message: `「${node.title}」实际投入 ${actual}h，超出计划 ${planned}h 达 ${Math.round((actual / planned - 1) * 100)}%`,
          suggestion: '评估是计划低估了成本，还是陷入了低杠杆消耗。',
          metric: { planned, actual, overrunPct: Math.round((actual / planned - 1) * 100) },
        });
      } else if (ended && actual < planned * 0.5) {
        push({
          type: 'time_underuse',
          severity: 'warning',
          cycle: node.cycle,
          nodeId: node.id,
          nodeTitle: node.title,
          periodKey: node.periodKey,
          message: `「${node.title}」周期已结束，计划 ${planned}h 实际只用 ${actual}h，闲置 ${Math.round((planned - actual) * 10) / 10}h`,
          suggestion: '空出来的时间是否可以用在更高杠杆的事情上？',
          metric: { planned, actual, idle: Math.round((planned - actual) * 10) / 10 },
        });
      }
    }

    // ⑥ 目标脱钩：没有关联任何项目或 5X 目标
    if (!node.projectId && !node.goalId && !node.parentId) {
      push({
        type: 'goal_unlinked',
        severity: 'info',
        cycle: node.cycle,
        nodeId: node.id,
        nodeTitle: node.title,
        periodKey: node.periodKey,
        message: `「${node.title}」没有关联任何生命项目或 5X 目标`,
        suggestion: '挂到具体项目或目标上，避免计划成为无源之水。',
      });
    }

    // ⑦ 标记完成但没有交付证据
    if (node.status === 'completed' && (!node.verificationProof || !node.verificationProof.trim())) {
      push({
        type: 'completed_no_proof',
        severity: 'warning',
        cycle: node.cycle,
        nodeId: node.id,
        nodeTitle: node.title,
        periodKey: node.periodKey,
        message: `「${node.title}」已标记完成，但没有留下交付证据`,
        suggestion: '补一条硬证据（链接、截图、数据），拒绝虚假打勾。',
      });
    }

    // ⑧ 跨期错配：子节点的周期不在父节点周期区间内
    for (const child of children) {
      if (!isPeriodWithin(node.cycle, node.periodKey, child.cycle, child.periodKey)) {
        push({
          type: 'period_mismatch',
          severity: 'warning',
          cycle: child.cycle,
          nodeId: child.id,
          nodeTitle: child.title,
          periodKey: child.periodKey,
          message: `「${child.title}」属于${CYCLE_LABEL[child.cycle]}周期 ${child.periodKey}，却挂在「${node.title}」（${CYCLE_LABEL[node.cycle]}周期 ${node.periodKey}）之下`,
          suggestion: '跨期挂接会让工时与进度串账，请把子节点移到父周期真正覆盖的下级周期里。',
        });
      }
    }
  }

  // ⑨ 进度不一致：登记进度与子节点加权汇总偏差过大
  for (const node of src) {
    const children = (node.children || [])
      .map((id) => nodeMap.get(id))
      .filter(Boolean) as PlanNode[];
    if (children.length === 0) continue;
    const childAvg = computeAutoProgress(node, nodeMap);
    const raw = rawMap.get(node.id);
    const declared = raw?.declaredProgress ?? raw?.progress ?? node.progress ?? 0;
    const gap = Math.abs(declared - childAvg);
    if (gap > 25) {
      push({
        type: 'progress_inconsistent',
        severity: 'info',
        cycle: node.cycle,
        nodeId: node.id,
        nodeTitle: node.title,
        periodKey: node.periodKey,
        message: `「${node.title}」自评进度 ${declared}%，与下级加权汇总 ${childAvg}% 相差 ${gap} 个点`,
        suggestion: '进度以勾稽汇总为准，建议重新校准或先修正下级数据。',
        metric: { declared, computed: childAvg, gap },
      });
    }
  }

  // ⑩ 空周期：下层已有安排，但所属的上层周期里没有任何节点
  const periodExists = new Set<string>();
  for (const n of src) periodExists.add(`${n.cycle}|${n.periodKey}`);

  const required = new Map<string, Set<string>>();
  for (const n of src) {
    let cur: { cycle: PlanCycle; periodKey: string } | null = {
      cycle: n.cycle,
      periodKey: n.periodKey,
    };
    while (cur && cur.cycle !== 'year') {
      const up = coveringPeriod(cur.cycle, cur.periodKey);
      if (!up) break;
      if (!required.has(up.cycle)) required.set(up.cycle, new Set<string>());
      required.get(up.cycle)!.add(up.periodKey);
      cur = up;
    }
  }
  for (const [cycle, keys] of required) {
    for (const key of keys) {
      if (periodExists.has(`${cycle}|${key}`)) continue;
      push({
        type: 'empty_period',
        severity: 'warning',
        cycle: cycle as PlanCycle,
        periodKey: key,
        message: `${CYCLE_LABEL[cycle as PlanCycle]}周期 ${key} 没有任何计划节点，但下层周期已经排了安排`,
        suggestion: '补上这一层的承接节点，否则上层汇总会漏掉这部分工时与进度。',
      });
    }
  }

  return issues;
}

/** 取下一层级 */
export function nextCycle(cycle: PlanCycle): PlanCycle {
  const idx = CYCLE_ORDER.indexOf(cycle);
  if (idx < 0 || idx >= CYCLE_ORDER.length - 1) return cycle;
  return CYCLE_ORDER[idx + 1];
}

/** 取上一层级 */
export function prevCycle(cycle: PlanCycle): PlanCycle {
  const idx = CYCLE_ORDER.indexOf(cycle);
  if (idx <= 0) return cycle;
  return CYCLE_ORDER[idx - 1];
}

/**
 * 判断某个周期键是否落在父周期键的区间内。
 * 用于诊断"跨期错配"：子节点挂在某个父节点下，但其周期不在父节点周期范围内。
 */
export function isPeriodWithin(
  parentCycle: PlanCycle,
  parentPeriodKey: string,
  childCycle: PlanCycle,
  childPeriodKey: string
): boolean {
  if (CYCLE_DEPTH[childCycle] <= CYCLE_DEPTH[parentCycle]) return false;

  // 年 → 任意子层：同年即可
  if (parentCycle === 'year') {
    const py = Number(parentPeriodKey);
    if (!Number.isFinite(py)) return true;
    const cy = Number(childPeriodKey.slice(0, 4));
    return !Number.isFinite(cy) ? true : cy === py;
  }

  // 季 → 月：季度内 3 个月
  if (parentCycle === 'quarter') {
    const [py, pq] = parentPeriodKey.split('-Q');
    const [cy, cm] = childPeriodKey.split('-');
    if (Number(py) !== Number(cy)) return false;
    const month = Number(cm);
    const qStart = (Number(pq) - 1) * 3 + 1;
    return month >= qStart && month <= qStart + 2;
  }

  // 月 → 周：只要该周有任意一天落在该月即算合法（ISO 周可能跨月）
  if (parentCycle === 'month' && childCycle === 'week') {
    const [py, pm] = parentPeriodKey.split('-').map(Number);
    const weekDays = daysInPeriod('week', childPeriodKey);
    return weekDays.some((d) => {
      const [cy, cm] = d.split('-').map(Number);
      return cy === py && cm === pm;
    });
  }

  // 月 → 日
  if (parentCycle === 'month' && childCycle === 'day') {
    const [py, pm] = parentPeriodKey.split('-').map(Number);
    const [cy, cm] = childPeriodKey.split('-').map(Number);
    return cy === py && cm === pm;
  }

  // 周 → 日：日必须落在该周的 7 天内
  if (parentCycle === 'week' && childCycle === 'day') {
    return daysInPeriod('week', parentPeriodKey).includes(childPeriodKey);
  }

  // 其余组合（季→周、季→日、年→季/月 之外的直接跨级）不做严格判定
  return true;
}

/** 新建节点的默认工厂 */
export function createPlanNode(params: {
  title: string;
  cycle: PlanCycle;
  periodKey: string;
  dimension: ProjectCategory;
  parentId?: string;
  projectId?: string;
  goalId?: string;
  plannedHours?: number;
  deliverable?: string;
  successCriteria?: string;
  weight?: number;
}): PlanNode {
  const now = new Date().toISOString();
  return {
    id: `pn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: params.title.trim(),
    cycle: params.cycle,
    periodKey: params.periodKey,
    parentId: params.parentId,
    children: [],
    dimension: params.dimension,
    projectId: params.projectId,
    goalId: params.goalId,
    plannedHours: params.plannedHours ?? 0,
    actualHours: 0,
    weight: params.weight ?? 1,
    progress: 0,
    status: 'not_started',
    deliverable: params.deliverable ?? '',
    successCriteria: params.successCriteria ?? '',
    verificationProof: '',
    note: '',
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 一键把某个节点向下分解为下一层级，并自动配平工时。
 * 这是"形成勾稽关系"的核心动作：父节点工时按子节点数量或权重分配下去。
 */
export function cascadeBreakdown(
  node: PlanNode,
  count: number,
  titles: string[],
  childCycle: PlanCycle,
  childPeriodKey: string
): { nodes: PlanNode[]; parent: PlanNode } {
  const totalWeight = titles.map(() => 1).reduce((s, w) => s + w, 0) || 1;
  // 工时按权重均分，保留一位小数，最后一个补齐差额避免总额漂移
  const perChild = Math.round(((node.plannedHours || 0) / totalWeight) * 10) / 10;

  const children: PlanNode[] = titles.map((title, i) => {
    const child = createPlanNode({
      title,
      cycle: childCycle,
      periodKey: childPeriodKey,
      dimension: node.dimension,
      parentId: node.id,
      projectId: node.projectId,
      goalId: node.goalId,
      plannedHours: perChild,
      deliverable: node.deliverable,
      successCriteria: node.successCriteria,
    });
    child.weight = 1;
    // 最后一个节点吸收取整误差
    if (i === titles.length - 1) {
      const allocated = perChild * (titles.length - 1);
      child.plannedHours =
        Math.round(((node.plannedHours || 0) - allocated) * 10) / 10;
    }
    return child;
  });

  const parent: PlanNode = {
    ...node,
    children: [...(node.children || []), ...children.map((c) => c.id)],
    // 保留父节点登记进度的留痕，供"进度不一致"诊断比对
    declaredProgress: node.declaredProgress ?? node.progress,
    updatedAt: new Date().toISOString(),
  };

  return { nodes: children, parent };
}

/**
 * 从上层节点反向推导下层周期键：
 * 给定父节点周期与周期键，生成下一层的周期键集合。
 */
export function deriveChildPeriodKeys(
  parentCycle: PlanCycle,
  parentPeriodKey: string,
  childCycle: PlanCycle
): string[] {
  if (childCycle === 'day') {
    const days = daysInPeriod('week', parentPeriodKey);
    return days.length ? days : [];
  }
  if (childCycle === 'week') {
    // 周 → 该月内包含的所有周
    const monthDays = daysInPeriod('month', parentPeriodKey);
    const weeks: string[] = [];
    for (const d of monthDays) {
      const [y, m, dd] = d.split('-').map(Number);
      const wk = getWeekKey(new Date(y, m - 1, dd));
      if (!weeks.includes(wk)) weeks.push(wk);
    }
    return weeks;
  }
  if (childCycle === 'month') {
    // 季 → 该季 3 个月
    const [yStr, qStr] = parentPeriodKey.split('-Q');
    const y = Number(yStr);
    const q = Number(qStr);
    return [0, 1, 2].map((i) => `${y}-${pad((q - 1) * 3 + i + 1)}`);
  }
  if (childCycle === 'quarter') {
    return [1, 2, 3, 4].map((q) => `${parentPeriodKey}-Q${q}`);
  }
  return [];
}

/** 汇总统计：整个计划体系的健康度 */
export function summarizeBoard(
  nodes: PlanNode[],
  issues: ReconciliationIssue[]
): {
  totalNodes: number;
  byCycle: Record<PlanCycle, number>;
  overallProgress: number;
  totalPlannedHours: number;
  totalActualHours: number;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  healthScore: number;
} {
  const reconciled = reconcileTree(nodes);
  const byCycle: Record<PlanCycle, number> = { year: 0, quarter: 0, month: 0, week: 0, day: 0 };
  for (const n of reconciled) byCycle[n.cycle] += 1;

  const topLevel = reconciled.filter((n) => !n.parentId);
  const totalWeight = topLevel.reduce((s, n) => s + (n.weight || 1), 0);
  const overallProgress =
    totalWeight > 0
      ? Math.round(topLevel.reduce((s, n) => s + (n.progress || 0) * (n.weight || 1), 0) / totalWeight)
      : 0;

  const criticalCount = issues.filter((i) => i.severity === 'critical').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;
  const infoCount = issues.filter((i) => i.severity === 'info').length;

  // 健康度 = 进度 60% + 无严重问题 40%
  const penalty = criticalCount * 12 + warningCount * 4;
  const healthScore = Math.max(0, Math.min(100, Math.round(overallProgress * 0.6 + 40 - penalty)));

  return {
    totalNodes: reconciled.length,
    byCycle,
    overallProgress,
    totalPlannedHours:
      Math.round(reconciled.reduce((s, n) => s + (n.plannedHours || 0), 0) * 10) / 10,
    totalActualHours:
      Math.round(reconciled.reduce((s, n) => s + (n.actualHours || 0), 0) * 10) / 10,
    criticalCount,
    warningCount,
    infoCount,
    healthScore,
  };
}
