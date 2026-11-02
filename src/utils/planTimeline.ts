import { PlanNode, PlanCycle } from '../types';
import {
  periodStartDate,
  periodEndDate,
  getDayKey,
  getWeekKey,
  getMonthKey,
} from './planReconciliation';

/**
 * 计划时间线引擎
 * ----------------------------------------------------------------
 * 目标：把散落在「年 / 季 / 月 / 周 / 日」五个层级的计划节点，
 * 按**真实日期**摆到一条连续的时间轴上，让人一眼看到
 * "这周 / 这个月 / 今年，每个时间点要做什么"。
 *
 * 设计要点：
 * 1. 时间轴的刻度（granularity）由跨度自动决定 —— 天数少就按天，
 *    天数多就按周 / 按月。硬塞 365 个日刻度既卡又看不清。
 * 2. 节点按「周期起始日」归入对应刻度。所以一个月度节点会出现在
 *    该月 1 日那一格，周节点出现在周一那一格。
 * 3. 跨期节点（如一个覆盖整季的节点）额外进 ongoing 列表，
 *    在后续刻度上以淡色提示"进行中"，避免"看不见但在跑"。
 *
 * 这一层是纯函数，不依赖 React / DOM，可直接单元测试。
 */

export type TimelineGranularity = 'day' | 'week' | 'month';

/** 时间线可选的观察跨度 */
export type TimelineSpan = 'week' | 'month' | 'quarter' | 'year';

export const TIMELINE_SPAN_LABEL: Record<TimelineSpan, string> = {
  week: '本周',
  month: '本月',
  quarter: '本季',
  year: '今年',
};

export const TIMELINE_GRANULARITY_LABEL: Record<TimelineGranularity, string> = {
  day: '按天',
  week: '按周',
  month: '按月',
};

const WEEKDAY_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export interface TimelineRange {
  span: TimelineSpan;
  /** 锚点日期 YYYY-MM-DD（一般取自当前选中周期的起始日） */
  anchor: string;
  start: Date;
  end: Date;
  granularity: TimelineGranularity;
  /** 一句话描述这段跨度，如 "2026年11月" / "10月26日 — 11月1日" */
  label: string;
  /** 跨度包含的自然日总数 */
  dayCount: number;
}

export interface TimelineBucket {
  /** 唯一键，用于 React key 与展开态记录 */
  key: string;
  /** 主标题，如 "11月3日" / "第45周" / "11月" */
  label: string;
  /** 副标题，如 "周一" / "11/02 - 11/08" */
  sublabel: string;
  start: Date;
  end: Date;
  /** 该刻度对应的起始日期键（YYYY-MM-DD，用于跳转到日志） */
  startKey: string;
  /** 该刻度对应的周期键（按 cycle 归一，如 '2026-W45' / '2026-11'，用于新建计划） */
  periodKey: string;
  /** 该刻度对应的周期层级（随粒度变化） */
  cycle: PlanCycle;
  isToday: boolean;
  isPast: boolean;
  isFuture: boolean;
  /** 周期起始日落在本刻度内的节点（"从这个时间点开始要做"） */
  nodes: PlanNode[];
  /** 起始早于本刻度、但仍覆盖本刻度的上层节点（"还在进行"） */
  ongoing: PlanNode[];
  plannedHours: number;
  actualHours: number;
  progress: number;
  completedCount: number;
}

// ==========================================
// 日期小工具
// ==========================================

const DAY_MS = 86400000;

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** 相差的自然日数（用 round 规避夏令时/时区抖动） */
function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY_MS);
}

/** 中文星期 */
export function weekdayCN(d: Date): string {
  return WEEKDAY_CN[d.getDay()];
}

// ==========================================
// 跨度解析
// ==========================================

/**
 * 根据锚点日期与跨度，算出时间轴的起止与刻度。
 *
 * 刻度规则：
 *  - 跨度 ≤ 31 天  → 按天（周视图 7 格、月视图 30 格）
 *  - 跨度 ≤ 120 天 → 按周（季度视图约 13 格）
 *  - 更长         → 按月（年度视图 12 格）
 *
 * 这样无论切到哪个层级，格子数量都稳定在 7~31 之间，不会爆炸。
 */
export function resolveTimelineRange(
  anchor: Date,
  span: TimelineSpan
): TimelineRange {
  const base = startOfDay(anchor);
  let start: Date;
  let end: Date;
  let label: string;

  if (span === 'week') {
    const dow = base.getDay() || 7; // 周日算第 7 天
    start = addDays(base, 1 - dow); // 本周一
    end = addDays(start, 6); // 本周日
    label = `${start.getMonth() + 1}月${start.getDate()}日 — ${
      end.getMonth() + 1
    }月${end.getDate()}日`;
  } else if (span === 'month') {
    start = new Date(base.getFullYear(), base.getMonth(), 1);
    end = new Date(base.getFullYear(), base.getMonth() + 1, 0);
    label = `${base.getFullYear()}年${base.getMonth() + 1}月`;
  } else if (span === 'quarter') {
    const q = Math.floor(base.getMonth() / 3);
    start = new Date(base.getFullYear(), q * 3, 1);
    end = new Date(base.getFullYear(), q * 3 + 3, 0);
    label = `${base.getFullYear()}年 Q${q + 1}`;
  } else {
    start = new Date(base.getFullYear(), 0, 1);
    end = new Date(base.getFullYear(), 11, 31);
    label = `${base.getFullYear()}年`;
  }

  const dayCount = daysBetween(start, end) + 1;
  const granularity: TimelineGranularity =
    dayCount <= 31 ? 'day' : dayCount <= 120 ? 'week' : 'month';

  return {
    span,
    anchor: getDayKey(base),
    start,
    end,
    granularity,
    label,
    dayCount,
  };
}

/** 层级 → 默认跨度（日视图按周看，才有前后文） */
export function spanForCycle(cycle: PlanCycle): TimelineSpan {
  if (cycle === 'year') return 'year';
  if (cycle === 'quarter') return 'quarter';
  if (cycle === 'month') return 'month';
  return 'week';
}

/** 跨度 → 新节点应挂在哪个周期层级 */
export function cycleForSpan(span: TimelineSpan): PlanCycle {
  if (span === 'year') return 'year';
  if (span === 'quarter') return 'quarter';
  if (span === 'month') return 'month';
  return 'week';
}

// ==========================================
// 刻度生成
// ==========================================

function makeBucket(
  key: string,
  start: Date,
  end: Date,
  granularity: TimelineGranularity,
  todayKey: string
): TimelineBucket {
  const startKey = getDayKey(start);
  let label: string;
  let sublabel: string;
  let cycle: PlanCycle;
  let periodKey: string;

  if (granularity === 'day') {
    label = `${start.getMonth() + 1}月${start.getDate()}日`;
    sublabel = weekdayCN(start);
    cycle = 'day';
    periodKey = startKey;
  } else if (granularity === 'week') {
    const wk = getWeekKey(start);
    label = `第${Number(wk.split('-W')[1])}周`;
    sublabel = `${start.getMonth() + 1}/${start.getDate()} - ${
      end.getMonth() + 1
    }/${end.getDate()}`;
    cycle = 'week';
    periodKey = wk;
  } else {
    label = `${start.getMonth() + 1}月`;
    sublabel = `${start.getMonth() + 1}/${start.getDate()} - ${
      end.getMonth() + 1
    }/${end.getDate()}`;
    cycle = 'month';
    periodKey = getMonthKey(start);
  }

  const isToday =
    granularity === 'day'
      ? startKey === todayKey
      : todayKey >= getDayKey(start) && todayKey <= getDayKey(end);

  const todayDate = new Date(
    Number(todayKey.slice(0, 4)),
    Number(todayKey.slice(5, 7)) - 1,
    Number(todayKey.slice(8, 10))
  );

  return {
    key,
    label,
    sublabel,
    start,
    end,
    startKey,
    periodKey,
    cycle,
    isToday,
    isPast: end < todayDate,
    isFuture: start > todayDate,
    nodes: [],
    ongoing: [],
    plannedHours: 0,
    actualHours: 0,
    progress: 0,
    completedCount: 0,
  };
}

/**
 * 生成时间轴刻度，并把节点摆进去。
 *
 * @param range  由 resolveTimelineRange 得到的跨度
 * @param nodes  全部计划节点（建议传勾稽后的 reconciled 版本）
 * @param today  今天，默认 new Date()；显式传入便于测试
 */
export function buildTimeline(
  range: TimelineRange,
  nodes: PlanNode[],
  today: Date = new Date()
): TimelineBucket[] {
  const todayKey = getDayKey(today);
  const buckets: TimelineBucket[] = [];

  if (range.granularity === 'day') {
    let cur = new Date(range.start);
    while (cur <= range.end) {
      buckets.push(makeBucket(getDayKey(cur), cur, cur, 'day', todayKey));
      cur = addDays(cur, 1);
    }
  } else if (range.granularity === 'week') {
    let cur = new Date(range.start);
    const dow = cur.getDay() || 7;
    cur = addDays(cur, 1 - dow); // 对齐到周一
    let guard = 0;
    while (cur <= range.end && guard < 60) {
      const bEnd = addDays(cur, 6);
      if (bEnd >= range.start) {
        buckets.push(
          makeBucket(`W${getWeekKey(cur)}`, cur, bEnd, 'week', todayKey)
        );
      }
      cur = addDays(cur, 7);
      guard++;
    }
  } else {
    let y = range.start.getFullYear();
    let m = range.start.getMonth();
    let guard = 0;
    while (guard < 36) {
      const bStart = new Date(y, m, 1);
      if (bStart > range.end) break;
      const bEnd = new Date(y, m + 1, 0);
      buckets.push(
        makeBucket(`M${getMonthKey(bStart)}`, bStart, bEnd, 'month', todayKey)
      );
      m++;
      if (m > 11) {
        m = 0;
        y++;
      }
      guard++;
    }
  }

  if (buckets.length === 0) return buckets;

  // ---- 把节点摆进刻度 ----
  for (const node of nodes) {
    let startDate: Date;
    let endDate: Date;
    try {
      startDate = startOfDay(periodStartDate(node.cycle, node.periodKey));
      endDate = periodEndDate(node.cycle, node.periodKey);
    } catch {
      continue; // 周期键损坏时跳过，不让一条坏数据毁掉整条时间线
    }
    if (isNaN(startDate.getTime())) continue;

    // 1) 周期起始日落在跨度内 → 归入对应刻度
    if (startDate >= range.start && startDate <= range.end) {
      const host = buckets.find(
        (b) => startDate >= b.start && startDate <= b.end
      );
      if (host) {
        host.nodes.push(node);
        continue;
      }
    }

    // 2) 起始早于跨度、但周期仍覆盖跨度 → 作为「进行中」提示
    //    只对月/季/年这类粗粒度节点做提示，否则日节点会刷屏
    const coarse = node.cycle === 'month' || node.cycle === 'quarter' || node.cycle === 'year';
    if (coarse && startDate < range.start && endDate >= range.start) {
      const first = buckets.find((b) => endDate >= b.start);
      if (first && first.ongoing.length < 2) first.ongoing.push(node);
    }
  }

  // ---- 汇总每格数据 ----
  for (const b of buckets) {
    let wSum = 0;
    let wTotal = 0;
    for (const n of b.nodes) {
      b.plannedHours += n.plannedHours || 0;
      b.actualHours += n.actualHours || 0;
      if (n.status === 'completed') b.completedCount++;
      const w = n.weight || 1;
      wSum += (n.progress || 0) * w;
      wTotal += w;
    }
    b.plannedHours = Math.round(b.plannedHours * 10) / 10;
    b.actualHours = Math.round(b.actualHours * 10) / 10;
    b.progress = wTotal > 0 ? Math.round(wSum / wTotal) : 0;
    // 稳定排序：进行中 → 受阻 → 未启动 → 已完成；同组按计划工时降序
    // 受阻排在未启动之前，是因为"卡住的事"需要人立刻看到并处理，
    // 而"还没开始"只是待办，可以往后放。
    b.nodes.sort((x, y) => {
      const rank = (n: PlanNode) => {
        if (n.status === 'in_progress') return 0;
        if (n.status === 'blocked') return 1;
        if (n.status === 'completed' || n.status === 'dropped') return 3;
        return 2;
      };
      const d = rank(x) - rank(y);
      if (d !== 0) return d;
      return (y.plannedHours || 0) - (x.plannedHours || 0);
    });
  }

  return buckets;
}

// ==========================================
// 汇总
// ==========================================

export interface TimelineSummary {
  bucketCount: number;
  /** 有计划的刻度数 */
  activeBucketCount: number;
  /** 完全空白的刻度数 */
  emptyBucketCount: number;
  nodeCount: number;
  plannedHours: number;
  actualHours: number;
  completedCount: number;
  /** 加权进度 0-100 */
  progress: number;
  /** 第一个有计划的刻度下标，用于自动滚动定位 */
  firstActiveIndex: number;
  /** 今天所在刻度下标，找不到为 -1 */
  todayIndex: number;
}

export function summarizeTimeline(buckets: TimelineBucket[]): TimelineSummary {
  let nodeCount = 0;
  let planned = 0;
  let actual = 0;
  let done = 0;
  let wSum = 0;
  let wTotal = 0;
  let active = 0;
  let firstActiveIndex = -1;

  buckets.forEach((b, i) => {
    if (b.nodes.length > 0) {
      active++;
      if (firstActiveIndex === -1) firstActiveIndex = i;
    }
    nodeCount += b.nodes.length;
    planned += b.plannedHours;
    actual += b.actualHours;
    done += b.completedCount;
    for (const n of b.nodes) {
      const w = n.weight || 1;
      wSum += (n.progress || 0) * w;
      wTotal += w;
    }
  });

  return {
    bucketCount: buckets.length,
    activeBucketCount: active,
    emptyBucketCount: buckets.length - active,
    nodeCount,
    plannedHours: Math.round(planned * 10) / 10,
    actualHours: Math.round(actual * 10) / 10,
    completedCount: done,
    progress: wTotal > 0 ? Math.round(wSum / wTotal) : 0,
    firstActiveIndex,
    todayIndex: buckets.findIndex((b) => b.isToday),
  };
}

/**
 * 把一段连续的空刻度压成一行提示，避免长跨度下大面积留白。
 * 返回「可见行」序列：bucket 行 或 空段汇总行。
 */
export type TimelineRow =
  | { kind: 'bucket'; bucket: TimelineBucket; index: number }
  | {
      kind: 'gap';
      startIndex: number;
      endIndex: number;
      label: string;
      count: number;
    };

export function collapseEmptyBuckets(
  buckets: TimelineBucket[],
  /** 连续多少个空刻度才折叠 */
  minRun = 3
): TimelineRow[] {
  const rows: TimelineRow[] = [];
  let i = 0;
  while (i < buckets.length) {
    const b = buckets[i];
    if (b.nodes.length > 0 || b.isToday) {
      rows.push({ kind: 'bucket', bucket: b, index: i });
      i++;
      continue;
    }
    // 往后数连续空白
    let j = i;
    while (j < buckets.length && buckets[j].nodes.length === 0 && !buckets[j].isToday) {
      j++;
    }
    const count = j - i;
    if (count >= minRun) {
      const first = buckets[i];
      const last = buckets[j - 1];
      rows.push({
        kind: 'gap',
        startIndex: i,
        endIndex: j - 1,
        label: `${first.label} — ${last.label}`,
        count,
      });
    } else {
      for (let k = i; k < j; k++) {
        rows.push({ kind: 'bucket', bucket: buckets[k], index: k });
      }
    }
    i = j;
  }
  return rows;
}

/** 某个节点在时间线上属于哪种视觉优先级（供 UI 着色） */
export function nodeTimelineTone(
  node: PlanNode
): 'done' | 'dropped' | 'active' | 'blocked' | 'idle' {
  if (node.status === 'completed') return 'done';
  if (node.status === 'dropped') return 'dropped';
  if (node.status === 'blocked') return 'blocked';
  if (node.status === 'in_progress') return 'active';
  return 'idle';
}
