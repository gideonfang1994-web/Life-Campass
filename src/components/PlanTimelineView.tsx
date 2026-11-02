import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PlanNode, PlanCycle, ProjectCategory } from '../types';
import {
  CYCLE_LABEL,
  getPeriodKey,
  getDayKey,
} from '../utils/planReconciliation';
import {
  TimelineSpan,
  TIMELINE_SPAN_LABEL,
  TIMELINE_GRANULARITY_LABEL,
  resolveTimelineRange,
  buildTimeline,
  summarizeTimeline,
  collapseEmptyBuckets,
  spanForCycle,
  cycleForSpan,
  nodeTimelineTone,
  TimelineBucket,
} from '../utils/planTimeline';
import { DIMENSIONS_CONFIG } from '../utils/categories';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  CheckCircle2,
  Circle,
  AlertOctagon,
  ArrowRight,
  Layers,
  Sparkles,
} from 'lucide-react';

interface Props {
  /** 勾稽后的节点（进度已由子节点汇总） */
  nodes: PlanNode[];
  activeCycle: PlanCycle;
  onEditNode: (id: string) => void;
  onCreateAt: (cycle: PlanCycle, periodKey: string) => void;
  onJumpToDay?: (dateKey: string) => void;
}

const TONE_META: Record<
  ReturnType<typeof nodeTimelineTone>,
  { dot: string; card: string; label: string; icon: any }
> = {
  done: {
    dot: 'bg-zinc-900 dark:bg-white ring-zinc-200 dark:ring-stone-700',
    card: 'bg-zinc-50/80 dark:bg-stone-900/60 border-stone-200 dark:border-stone-800',
    label: '已完成',
    icon: CheckCircle2,
  },
  dropped: {
    dot: 'bg-stone-300 dark:bg-stone-600 ring-stone-100 dark:ring-stone-800',
    card: 'bg-stone-50/60 dark:bg-stone-900/40 border-stone-200/70 dark:border-stone-800/70',
    label: '已放弃',
    icon: Circle,
  },
  active: {
    dot: 'bg-emerald-500 ring-emerald-100 dark:ring-emerald-900/60',
    card: 'bg-white dark:bg-stone-900 border-emerald-200/90 dark:border-emerald-900/70',
    label: '进行中',
    icon: ArrowRight,
  },
  blocked: {
    dot: 'bg-rose-500 ring-rose-100 dark:ring-rose-900/60',
    card: 'bg-rose-50/60 dark:bg-rose-950/20 border-rose-200/80 dark:border-rose-900/60',
    label: '受阻',
    icon: AlertOctagon,
  },
  idle: {
    dot: 'bg-stone-300 dark:bg-stone-600 ring-stone-100 dark:ring-stone-800',
    card: 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-800',
    label: '未启动',
    icon: Circle,
  },
};

function shiftAnchor(anchor: string, span: TimelineSpan, delta: number): Date {
  const [y, m, d] = anchor.split('-').map(Number);
  const base = new Date(y, m - 1, d);
  if (span === 'week') base.setDate(base.getDate() + delta * 7);
  else if (span === 'month') base.setMonth(base.getMonth() + delta);
  else if (span === 'quarter') base.setMonth(base.getMonth() + delta * 3);
  else base.setFullYear(base.getFullYear() + delta);
  return base;
}

export const PlanTimelineView: React.FC<Props> = ({
  nodes,
  activeCycle,
  onEditNode,
  onCreateAt,
  onJumpToDay,
}) => {
  const todayKey = useMemo(() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(
      t.getDate()
    ).padStart(2, '0')}`;
  }, []);

  const [span, setSpan] = useState<TimelineSpan>(() => spanForCycle(activeCycle));
  const [anchor, setAnchor] = useState<string>(todayKey);

  /**
   * 是否折叠连续空白刻度。
   *
   * 默认 **不折叠** —— 时间线的价值就在于"连续"，把中间空白压成
   * "还有 5 段空白"，等于把时间轴截断了，反而看不出空档有多长。
   * 但年度视图 12 个月里常常只有两三个月有安排，全展开会很长，
   * 所以保留手动折叠入口，由用户决定。
   */
  const [collapseEmpty, setCollapseEmpty] = useState(false);

  /**
   * 层级 Tab 与跨度是同一件事的两种表达：点「月」就该看到整月，点「年」就该看到整年。
   * 但用户手动在时间线上切过跨度后，再点同一个层级不应把跨度"弹回去"——
   * 用 ref 记住上一次的 activeCycle，只在它真正变化时才同步跨度。
   */
  const lastCycleRef = useRef<PlanCycle>(activeCycle);
  useEffect(() => {
    if (lastCycleRef.current !== activeCycle) {
      lastCycleRef.current = activeCycle;
      setSpan(spanForCycle(activeCycle));
      setAnchor(todayKey);
    }
  }, [activeCycle, todayKey]);

  const range = useMemo(() => {
    const [y, m, d] = anchor.split('-').map(Number);
    return resolveTimelineRange(new Date(y, m - 1, d), span);
  }, [anchor, span]);

  const buckets = useMemo(
    () => buildTimeline(range, nodes, new Date()),
    [range, nodes]
  );
  const summary = useMemo(() => summarizeTimeline(buckets), [buckets]);
  const rows = useMemo(
    () => collapseEmptyBuckets(buckets, collapseEmpty ? 2 : 9999),
    [buckets, collapseEmpty]
  );

  const handleNav = (delta: number) => {
    const nd = shiftAnchor(anchor, span, delta);
    setAnchor(
      `${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, '0')}-${String(
        nd.getDate()
      ).padStart(2, '0')}`
    );
  };

  const jumpToday = () => setAnchor(todayKey);

  /**
   * 切到「今年」这类长跨度时，"今天"那一格往往在首屏之外，
   * 用户第一眼看到的全是过去月份，这与"一眼看到要做什么"的诉求相反。
   * 所以跨度变化后，如果今天格不在视口内就把它滚进来。
   */
  const bodyRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const host = bodyRef.current;
    if (!host) return;
    const el = host.querySelector('[data-bucket-today="true"]') as HTMLElement | null;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vh = window.innerHeight || 800;
    if (rect.top < 120 || rect.bottom > vh - 80) {
      el.scrollIntoView({ block: 'center' });
    }
  }, [range.label, range.granularity, collapseEmpty]);

  return (
    <div
      data-testid="plan-timeline"
      data-span={span}
      data-granularity={range.granularity}
      data-bucket-count={summary.bucketCount}
      data-node-count={summary.nodeCount}
      data-today-index={summary.todayIndex}
      data-range-label={range.label}
      data-range-start={getDayKey(range.start)}
      data-range-end={getDayKey(range.end)}
    >
      {/* ============ 控制条 ============ */}
      <div className="px-3 sm:px-4 py-3 border-b border-stone-100 dark:border-stone-800 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* 跨度切换 */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-stone-100/80 dark:bg-stone-800/60">
            {(['week', 'month', 'quarter', 'year'] as TimelineSpan[]).map((s) => (
              <button
                key={s}
                type="button"
                data-testid="timeline-span-tab"
                data-span={s}
                data-active={span === s ? 'true' : 'false'}
                onClick={() => setSpan(s)}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition whitespace-nowrap ${
                  span === s
                    ? 'bg-white dark:bg-stone-900 text-stone-900 dark:text-white shadow-sm'
                    : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
                }`}
              >
                {TIMELINE_SPAN_LABEL[s]}
              </button>
            ))}
          </div>

          {/* 前后翻页 */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleNav(-1)}
              data-testid="timeline-prev"
              className="p-1.5 rounded-lg border border-stone-200 dark:border-stone-700 text-stone-500 hover:bg-stone-50 dark:hover:bg-stone-800 transition"
              title="上一段"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <div className="min-w-[130px] text-center">
              <div className="text-xs font-extrabold text-stone-900 dark:text-white">
                {range.label}
              </div>
              <div className="text-[10px] text-stone-400 font-medium">
                {TIMELINE_GRANULARITY_LABEL[range.granularity]} · {summary.bucketCount} 格
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleNav(1)}
              data-testid="timeline-next"
              className="p-1.5 rounded-lg border border-stone-200 dark:border-stone-700 text-stone-500 hover:bg-stone-50 dark:hover:bg-stone-800 transition"
              title="下一段"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={jumpToday}
              data-testid="timeline-today"
              className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-stone-500 hover:bg-stone-50 dark:hover:bg-stone-800 transition border border-stone-200 dark:border-stone-700"
            >
              回到今天
            </button>
          </div>
        </div>

        {/* 汇总条 */}
        <div
          data-testid="timeline-summary"
          data-node-count={summary.nodeCount}
          className="flex items-center gap-3 sm:gap-5 flex-wrap text-[11px]"
        >
          <span className="flex items-center gap-1.5 text-stone-500 dark:text-stone-400">
            <Layers className="w-3 h-3" />
            <strong className="text-stone-900 dark:text-white font-extrabold">
              {summary.nodeCount}
            </strong>
            个计划
          </span>
          <span className="flex items-center gap-1.5 text-stone-500 dark:text-stone-400">
            <CheckCircle2 className="w-3 h-3" />
            完成
            <strong className="text-stone-900 dark:text-white font-extrabold">
              {summary.completedCount}
            </strong>
          </span>
          <span className="flex items-center gap-1.5 text-stone-500 dark:text-stone-400">
            <Clock className="w-3 h-3" />
            {summary.plannedHours}h
            <span className="text-stone-400">/ 实耗 {summary.actualHours}h</span>
          </span>
          <span className="flex items-center gap-1.5 text-stone-500 dark:text-stone-400">
            总进度
            <strong className="text-stone-900 dark:text-white font-extrabold">
              {summary.progress}%
            </strong>
          </span>
          {summary.emptyBucketCount > 0 && (
            <button
              type="button"
              data-testid="timeline-collapse-toggle"
              data-empty-count={summary.emptyBucketCount}
              data-collapsed={collapseEmpty ? 'true' : 'false'}
              onClick={() => setCollapseEmpty((v) => !v)}
              className="ml-auto text-[10px] font-bold text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 underline decoration-dotted underline-offset-2"
            >
              {collapseEmpty
                ? `展开全部 ${summary.bucketCount} 格`
                : `折叠 ${summary.emptyBucketCount} 个空白时段`}
            </button>
          )}
        </div>
      </div>

      {/* ============ 时间轴主体 ============ */}
      <div className="px-3 sm:px-5 py-4" data-testid="timeline-body" ref={bodyRef}>
        {summary.nodeCount === 0 && (
          <div className="py-12 text-center">
            <CalendarDays className="w-9 h-9 mx-auto text-stone-300 dark:text-stone-700 mb-2.5" />
            <p className="text-xs font-semibold text-stone-500 dark:text-stone-400 mb-1">
              {range.label}还没有任何计划
            </p>
            <p className="text-[11px] text-stone-400 mb-4 max-w-md mx-auto leading-relaxed">
              点时间轴上任意一格右侧的 <Plus className="w-3 h-3 inline" />，就能把计划直接挂到那个时间点。
            </p>
          </div>
        )}

        <ol className="relative" data-testid="timeline-list">
          {rows.map((row) => {
            if (row.kind === 'gap') {
              return (
                <li
                  key={`gap-${row.startIndex}`}
                  data-testid="timeline-gap"
                  data-gap-count={row.count}
                  className="relative pl-9 py-1"
                >
                  {/* 轴线（虚线段） */}
                  <span className="absolute left-[13px] top-0 bottom-0 w-px border-l border-dashed border-stone-200 dark:border-stone-800" />
                  <button
                    type="button"
                    onClick={() => setCollapseEmpty(false)}
                    className="w-full text-left py-1.5 text-[10px] font-semibold text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 transition"
                  >
                    中间 {row.count} 段空白 · {row.label}（无安排）
                  </button>
                </li>
              );
            }

            return (
              <TimelineBucketRow
                key={row.bucket.key}
                bucket={row.bucket}
                isFirst={row.index === 0}
                isLast={row.index === buckets.length - 1}
                onEditNode={onEditNode}
                onCreateAt={onCreateAt}
                onJumpToDay={onJumpToDay}
              />
            );
          })}
        </ol>
      </div>
    </div>
  );
};

// ==========================================
// 单个时间格
// ==========================================

const TimelineBucketRow: React.FC<{
  bucket: TimelineBucket;
  isFirst: boolean;
  isLast: boolean;
  onEditNode: (id: string) => void;
  onCreateAt: (cycle: PlanCycle, periodKey: string) => void;
  onJumpToDay?: (dateKey: string) => void;
}> = ({ bucket, isFirst, isLast, onEditNode, onCreateAt, onJumpToDay }) => {
  const isEmpty = bucket.nodes.length === 0;

  return (
    <li
      data-testid="timeline-bucket"
      data-bucket-key={bucket.key}
      data-bucket-cycle={bucket.cycle}
      data-bucket-start={bucket.startKey}
      data-bucket-count={bucket.nodes.length}
      data-bucket-today={bucket.isToday ? 'true' : 'false'}
      data-bucket-state={
        bucket.isToday ? 'today' : bucket.isPast ? 'past' : 'future'
      }
      className="relative pl-9 pb-3"
    >
      {/* 轴线 */}
      <span
        className={`absolute left-[13px] w-px bg-stone-200 dark:bg-stone-800 ${
          isFirst ? 'top-2' : 'top-0'
        } ${isLast ? 'bottom-auto h-4' : 'bottom-0'}`}
      />

      {/* 轴上的点 */}
      <span
        className={`absolute left-[10px] top-1.5 w-2 h-2 rounded-full ring-2 z-10 ${
          bucket.isToday
            ? 'bg-emerald-500 ring-emerald-100 dark:ring-emerald-900/70'
            : bucket.isPast
            ? 'bg-stone-300 dark:bg-stone-600 ring-white dark:ring-stone-900'
            : 'bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-600 ring-white dark:ring-stone-900'
        }`}
      />

      {/* 时间标签 + 新建按钮 */}
      <div className="flex items-center gap-2 flex-wrap mb-1.5">
        <button
          type="button"
          onClick={() => onJumpToDay?.(bucket.startKey)}
          className={`text-left group ${onJumpToDay ? 'cursor-pointer' : 'cursor-default'}`}
          title={onJumpToDay ? '跳到这一天的日志' : undefined}
        >
          <span
            className={`text-xs font-extrabold ${
              bucket.isToday
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-stone-900 dark:text-white'
            }`}
          >
            {bucket.label}
          </span>
          <span className="ml-1.5 text-[10px] font-medium text-stone-400">
            {bucket.sublabel}
          </span>
        </button>

        {bucket.isToday && (
          <span className="px-1.5 py-0.5 rounded-full bg-emerald-500 text-white text-[9px] font-black">
            今天
          </span>
        )}

        {!isEmpty && (
          <span className="text-[10px] font-semibold text-stone-400">
            {bucket.nodes.length} 项 · {bucket.plannedHours}h · 完成{' '}
            {bucket.completedCount}/{bucket.nodes.length}
          </span>
        )}

        <button
          type="button"
          onClick={() => onCreateAt(bucket.cycle, bucket.periodKey)}
          data-testid="timeline-add"
          data-add-cycle={bucket.cycle}
          data-add-period={bucket.periodKey}
          className="ml-auto shrink-0 p-1 rounded-lg text-stone-300 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition"
          title={`在 ${bucket.label} 新建${CYCLE_LABEL[bucket.cycle]}计划`}
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 计划卡片 */}
      {!isEmpty && (
        <div className="space-y-1.5">
          {bucket.nodes.map((node) => (
            <TimelineNodeCard
              key={node.id}
              node={node}
              onEdit={() => onEditNode(node.id)}
            />
          ))}
        </div>
      )}

      {isEmpty && (
        <button
          type="button"
          onClick={() => onCreateAt(bucket.cycle, bucket.periodKey)}
          className="w-full text-left py-2 px-2.5 rounded-xl border border-dashed border-stone-200 dark:border-stone-800 text-[10px] text-stone-400 hover:border-stone-300 dark:hover:border-stone-700 hover:text-stone-600 dark:hover:text-stone-300 transition"
        >
          + 空白，点这里加计划
        </button>
      )}

      {/* 跨期进行中的上层计划 */}
      {bucket.ongoing.length > 0 && (
        <div className="mt-1.5 space-y-1">
          {bucket.ongoing.map((node) => (
            <div
              key={`ongoing-${node.id}`}
              className="flex items-center gap-1.5 text-[10px] text-stone-400 dark:text-stone-500 leading-relaxed"
            >
              <ArrowRight className="w-2.5 h-2.5 shrink-0" />
              <span className="truncate">
                持续进行：{node.title}（{CYCLE_LABEL[node.cycle]} · {node.progress}%）
              </span>
            </div>
          ))}
        </div>
      )}
    </li>
  );
};

// ==========================================
// 时间线上的计划卡片
// ==========================================

const TimelineNodeCard: React.FC<{
  node: PlanNode;
  onEdit: () => void;
}> = ({ node, onEdit }) => {
  const tone = nodeTimelineTone(node);
  const meta = TONE_META[tone];
  const Icon = meta.icon;
  const dim = DIMENSIONS_CONFIG[node.dimension as ProjectCategory];

  return (
    <button
      type="button"
      onClick={onEdit}
      data-testid="timeline-node"
      data-node-id={node.id}
      data-node-cycle={node.cycle}
      data-node-status={node.status}
      data-node-progress={node.progress}
      data-tone={tone}
      className={`w-full text-left rounded-xl border px-2.5 py-2 transition hover:shadow-sm ${meta.card} ${
        tone === 'done' || tone === 'dropped' ? 'opacity-75' : ''
      }`}
    >
      <div className="flex items-start gap-2">
        <Icon
          className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${
            tone === 'done' || tone === 'dropped'
              ? 'text-stone-400'
              : tone === 'active'
              ? 'text-emerald-500'
              : tone === 'blocked'
              ? 'text-rose-500'
              : 'text-stone-300 dark:text-stone-600'
          }`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <span
              className={`text-[11.5px] font-bold leading-snug break-words ${
                tone === 'done' || tone === 'dropped'
                  ? 'text-stone-500 dark:text-stone-400 line-through'
                  : 'text-stone-900 dark:text-white'
              }`}
            >
              {node.title}
            </span>
            <span className="shrink-0 text-[10px] font-black text-stone-500 dark:text-stone-400">
              {node.progress}%
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap mt-1 text-[9.5px] text-stone-400 font-medium">
            <span className="px-1 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400">
              {CYCLE_LABEL[node.cycle]}
            </span>
            {dim && <span>{dim.label}</span>}
            {node.plannedHours > 0 && (
              <span className="flex items-center gap-0.5">
                <Clock className="w-2.5 h-2.5" />
                {node.plannedHours}h
              </span>
            )}
            {node.actualHours > 0 && <span>实耗 {node.actualHours}h</span>}
          </div>

          {node.deliverable && (
            <div className="mt-1 text-[10px] text-stone-500 dark:text-stone-400 leading-relaxed line-clamp-2">
              {node.deliverable}
            </div>
          )}
        </div>
      </div>
    </button>
  );
};

// ==========================================
// 空状态提示（供外层使用）
// ==========================================

export const TimelineHint: React.FC<{ activeCycle: PlanCycle }> = ({ activeCycle }) => (
  <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200/70 dark:border-indigo-900/60">
    <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 mt-0.5 shrink-0" />
    <p className="text-[10.5px] text-indigo-800 dark:text-indigo-300 leading-relaxed">
      时间线按真实日期排列：日节点落在当天，周节点落在周一，月节点落在 1 号。
      当前从「{CYCLE_LABEL[activeCycle]}」层进入，可自由切换到本周 / 本月 / 本季 / 今年。
    </p>
  </div>
);
