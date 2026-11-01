import React, { useState, useMemo, useEffect } from 'react';
import {
  PlanNode,
  PlanCycle,
  PlanNodeStatus,
  ProjectCategory,
  LifeProject,
  AcceleratedGoal,
} from '../types';
import {
  CYCLE_ORDER,
  CYCLE_LABEL,
  getPeriodKey,
  getPeriodLabel,
  getWeekKey,
  shiftPeriodKey,
  nextCycle,
  prevCycle,
  reconcileTree,
  rollupCycle,
  diagnoseReconciliation,
  summarizeBoard,
  buildNodeMap,
  cascadeBreakdown,
  createPlanNode,
  deriveChildPeriodKeys,
} from '../utils/planReconciliation';
import { DIMENSIONS_CONFIG, CATEGORIES } from '../utils/categories';
import { requestSmartBreakdown } from '../services/api';
import {
  Layers,
  Target,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Plus,
  Trash2,
  AlertTriangle,
  Info,
  CheckCircle2,
  Clock,
  Sparkles,
  Loader2,
  Link2,
  Wand2,
  GitBranch,
  ShieldAlert,
  Trophy,
  X,
} from 'lucide-react';

interface Props {
  nodes: PlanNode[];
  projects: LifeProject[];
  acceleratedGoals: AcceleratedGoal[];
  onUpdateNodes: (nodes: PlanNode[]) => void;
  onOpenCoachChat?: (prompt?: string) => void;
}

// ==========================================
// 状态 / 严重度 展示配置
// ==========================================

const STATUS_META: Record<PlanNodeStatus, { label: string; badge: string; dot: string }> = {
  not_started: {
    label: '未启动',
    badge: 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400',
    dot: 'bg-stone-400',
  },
  in_progress: {
    label: '进行中',
    badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
    dot: 'bg-emerald-500',
  },
  completed: {
    label: '已完成',
    badge: 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900',
    dot: 'bg-zinc-900 dark:bg-white',
  },
  blocked: {
    label: '受阻',
    badge: 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
    dot: 'bg-rose-500',
  },
  dropped: {
    label: '已放弃',
    badge: 'bg-stone-100 text-stone-400 line-through dark:bg-stone-800',
    dot: 'bg-stone-300',
  },
};

const SEVERITY_META = {
  critical: {
    label: '严重',
    icon: ShieldAlert,
    wrap: 'bg-rose-50 border-rose-200/80 dark:bg-rose-950/40 dark:border-rose-900',
    text: 'text-rose-800 dark:text-rose-300',
  },
  warning: {
    label: '警告',
    icon: AlertTriangle,
    wrap: 'bg-amber-50 border-amber-200/80 dark:bg-amber-950/40 dark:border-amber-900',
    text: 'text-amber-800 dark:text-amber-300',
  },
  info: {
    label: '提示',
    icon: Info,
    wrap: 'bg-stone-50 border-stone-200 dark:bg-stone-900 dark:border-stone-800',
    text: 'text-stone-600 dark:text-stone-400',
  },
} as const;

// ==========================================
// 主视图
// ==========================================

export const PlanBoardView: React.FC<Props> = ({
  nodes,
  projects,
  acceleratedGoals,
  onUpdateNodes,
  onOpenCoachChat,
}) => {
  const today = useMemo(() => new Date(), []);
  const [activeCycle, setActiveCycle] = useState<PlanCycle>('week');
  const [activePeriodKey, setActivePeriodKey] = useState<string>(() =>
    getPeriodKey(today, 'week')
  );
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set<string>()
  );
  const [editingNode, setEditingNode] = useState<PlanNode | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createParentId, setCreateParentId] = useState<string | undefined>();
  const [createCycle, setCreateCycle] = useState<PlanCycle>('day');
  const [showIssues, setShowIssues] = useState(false);
  const [breakingDownId, setBreakingDownId] = useState<string | null>(null);

  // 勾稽后的节点树（父节点进度由子节点加权汇总）
  const reconciled = useMemo(() => reconcileTree(nodes), [nodes]);
  const nodeMap = useMemo(() => buildNodeMap(reconciled), [reconciled]);
  const issues = useMemo(() => diagnoseReconciliation(nodes, reconciled), [nodes, reconciled]);
  const summary = useMemo(() => summarizeBoard(nodes, issues), [nodes, issues]);

  const rollup = useMemo(
    () => rollupCycle(nodes, activeCycle, activePeriodKey, reconciled),
    [nodes, activeCycle, activePeriodKey, reconciled]
  );

  // 当前层的直接节点
  const levelNodes = useMemo(
    () => reconciled.filter((n) => n.cycle === activeCycle && n.periodKey === activePeriodKey),
    [reconciled, activeCycle, activePeriodKey]
  );

  // 当前周期的子周期键（用于提示"该往哪拆"）
  const childPeriodKeys = useMemo(() => {
    const childCycle = nextCycle(activeCycle);
    if (childCycle === activeCycle) return [];
    return deriveChildPeriodKeys(activeCycle, activePeriodKey, childCycle);
  }, [activeCycle, activePeriodKey]);

  // 切换层级时同步周期键
  useEffect(() => {
    setActivePeriodKey(getPeriodKey(today, activeCycle));
  }, [activeCycle, today]);

  /**
   * 勾稽诊断面板的问题列表。
   *
   * 默认展示**全量**问题——徽章上写的是总数，面板却只显示当前层，
   * 会让"点开发现只有 1 项、但角标写着 7"的割裂感，体检就失去了意义。
   * 用户仍可切到"仅当前层"做聚焦排查。
   */
  const [issueScope, setIssueScope] = useState<'all' | 'current'>('all');

  const sortedIssues = useMemo(() => {
    const order = { critical: 0, warning: 1, info: 2 };
    return [...issues].sort((a, b) => {
      const bySev = order[a.severity] - order[b.severity];
      if (bySev !== 0) return bySev;
      return (a.cycle === b.cycle ? 0 : a.cycle === activeCycle ? -1 : 1);
    });
  }, [issues, activeCycle]);

  const visibleIssues = useMemo(
    () =>
      issueScope === 'all'
        ? sortedIssues
        : sortedIssues.filter((i) => i.cycle === activeCycle || i.severity === 'critical'),
    [sortedIssues, issueScope, activeCycle]
  );

  // ---------- 操作 ----------

  const handleToggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleNavigate = (delta: number) => {
    setActivePeriodKey((prev) => shiftPeriodKey(activeCycle, prev, delta));
  };

  const handleSaveNode = (updated: PlanNode) => {
    // 在原始 nodes 上保存，保留父节点的 declaredProgress 与登记进度留痕
    onUpdateNodes(nodes.map((n) => (n.id === updated.id ? updated : n)));
    setEditingNode(null);
  };

  const handleDeleteNode = (id: string) => {
    if (!confirm('确定删除该计划节点及其所有下级分解吗？')) return;
    const doomed = new Set<string>([id]);
    // 收集所有后代
    let changed = true;
    while (changed) {
      changed = false;
      for (const n of nodes) {
        if ((n.parentId && doomed.has(n.parentId)) && !doomed.has(n.id)) {
          doomed.add(n.id);
          changed = true;
        }
      }
    }
    const next = nodes
      .filter((n) => !doomed.has(n.id))
      .map((n) => ({
        ...n,
        children: (n.children || []).filter((c) => !doomed.has(c)),
      }));
    onUpdateNodes(next);
    setEditingNode(null);
  };

  /** 手动向下分解：生成下一层级的空子节点并配平工时 */
  const handleManualBreakdown = (node: PlanNode | undefined) => {
    if (!node) return;
    const childCycle = nextCycle(node.cycle);
    if (childCycle === node.cycle) return;
    const childPeriodKey = getParentPeriodKeyFor(node, childCycle);
    if (!childPeriodKey) return;

    const count = 3;
    const titles = [
      `${CYCLE_LABEL[childCycle]}关键动作一`,
      `${CYCLE_LABEL[childCycle]}关键动作二`,
      `${CYCLE_LABEL[childCycle]}关键动作三`,
    ];
    const { nodes: newNodes, parent } = cascadeBreakdown(
      node,
      count,
      titles,
      childCycle,
      childPeriodKey
    );
    onUpdateNodes([
      ...nodes.map((n) => (n.id === parent.id ? parent : n)),
      ...newNodes,
    ]);
    setExpandedIds((prev) => new Set([...prev, node.id]));
  };

  /** AI 拆解：复用 smart-breakdown 端点，把返回的里程碑挂到下一层级 */
  const handleAiBreakdown = async (node: PlanNode | undefined) => {
    if (!node) return;
    const childCycle = nextCycle(node.cycle);
    if (childCycle === node.cycle) return;
    const childPeriodKey = getParentPeriodKeyFor(node, childCycle);
    if (!childPeriodKey) return;

    setBreakingDownId(node.id);
    try {
      const result = await requestSmartBreakdown(
        node.title,
        DIMENSIONS_CONFIG[node.dimension]?.label || node.dimension,
        CYCLE_LABEL[activeCycle]
      );
      const milestones = (result?.milestones || []).filter(
        (m) => m && m.title && m.title.trim()
      );
      if (milestones.length === 0) throw new Error('AI 未返回有效的分解项');

      const { nodes: newNodes, parent } = cascadeBreakdown(
        node,
        milestones.length,
        milestones.map((m) => m.title),
        childCycle,
        childPeriodKey
      );
      onUpdateNodes([
        ...nodes.map((n) => (n.id === parent.id ? parent : n)),
        ...newNodes,
      ]);
      setExpandedIds((prev) => new Set([...prev, node.id]));
    } catch (err) {
      console.error('[计划板块] AI 拆解失败:', err);
      alert('AI 拆解失败，已保留原计划。可稍后重试或使用手动分解。');
    } finally {
      setBreakingDownId(null);
    }
  };

  // ---------- 渲染 ----------

  return (
    <div className="space-y-5">
      {/* ============ 顶部：标题 + 总览 ============ */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-stone-400 dark:text-stone-500 mb-1.5">
            <GitBranch className="w-3.5 h-3.5" />
            <span>目标分解与勾稽</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight text-stone-900 dark:text-white">
            日 / 周 / 月 / 季 / 年 计划板
          </h2>
          <p className="text-xs text-stone-500 dark:text-stone-400 mt-1.5 max-w-2xl leading-relaxed">
            上层承诺自动传导到下层，父级进度由子节点加权汇总。工时、时间、成果三本账必须对得上，
            否则诊断会直接把它挑出来。
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="plan-issue-toggle"
            onClick={() => setShowIssues((v) => !v)}
            className={`px-3 py-2 rounded-xl font-bold text-xs transition flex items-center gap-1.5 border ${
              showIssues
                ? 'bg-stone-900 text-white dark:bg-white dark:text-stone-900 border-stone-900 dark:border-white'
                : 'bg-white text-stone-700 dark:bg-stone-900 dark:text-stone-300 border-stone-200 dark:border-stone-700 hover:bg-stone-50'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            勾稽诊断
            {issues.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-black">
                {issues.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              setCreateParentId(undefined);
              setCreateCycle(activeCycle);
              setIsCreateOpen(true);
            }}
            className="px-3 py-2 rounded-xl bg-stone-900 text-white dark:bg-white dark:text-stone-900 font-bold text-xs transition flex items-center gap-1.5 shadow-sm hover:opacity-90"
          >
            <Plus className="w-3.5 h-3.5" />
            新建节点
          </button>
        </div>
      </div>

      {/* ============ 健康度总览 ============ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        <MetricCard
          icon={Trophy}
          label="总体进度"
          value={`${summary.overallProgress}%`}
          sub={`${summary.totalNodes} 个节点`}
          tone="emerald"
        />
        <MetricCard
          icon={Layers}
          label="计划健康度"
          value={`${summary.healthScore}`}
          sub="进度 + 无严重问题"
          tone={summary.healthScore >= 70 ? 'emerald' : summary.healthScore >= 40 ? 'amber' : 'rose'}
        />
        <MetricCard
          icon={Clock}
          label="工时勾稽"
          value={`${summary.totalPlannedHours}h`}
          sub={`实耗 ${summary.totalActualHours}h`}
          tone="indigo"
        />
        <MetricCard
          icon={ShieldAlert}
          label="严重问题"
          value={`${summary.criticalCount}`}
          sub={`警告 ${summary.warningCount} · 提示 ${summary.infoCount}`}
          tone={summary.criticalCount > 0 ? 'rose' : 'stone'}
        />
        <MetricCard
          icon={Target}
          label="本层节点"
          value={`${rollup.nodeCount}`}
          sub={`${CYCLE_LABEL[activeCycle]}层`}
          tone="stone"
        />
        <MetricCard
          icon={Link2}
          label="工时达成率"
          value={`${rollup.hourFulfillment}%`}
          sub={`${rollup.completedCount} 完成 · ${rollup.blockedCount} 受阻`}
          tone="amber"
        />
      </div>

      {/* ============ 层级导航 ============ */}
      <div className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-sm overflow-hidden">
        {/* 层级 Tab */}
        <div className="flex items-center gap-1 p-1.5 bg-stone-100/80 dark:bg-stone-800/60 border-b border-stone-200 dark:border-stone-800 overflow-x-auto">
          {CYCLE_ORDER.map((c) => {
            const isActive = activeCycle === c;
            const count = reconciled.filter((n) => n.cycle === c).length;
            return (
              <button
                key={c}
                type="button"
                data-testid="plan-cycle-tab"
                data-cycle={c}
                data-active={isActive ? 'true' : 'false'}
                onClick={() => setActiveCycle(c)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
                  isActive
                    ? 'bg-white dark:bg-stone-900 text-stone-900 dark:text-white shadow-sm'
                    : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white'
                }`}
              >
                {CYCLE_LABEL[c]}
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                    isActive
                      ? 'bg-stone-900 text-white dark:bg-white dark:text-stone-900'
                      : 'bg-stone-200 text-stone-500 dark:bg-stone-700 dark:text-stone-400'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* 周期导航 + 汇总条 */}
        <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleNavigate(-1)}
              className="p-1.5 rounded-lg border border-stone-200 dark:border-stone-700 text-stone-500 hover:bg-stone-50 dark:hover:bg-stone-800 transition"
              title="上一周期"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="min-w-[160px] text-center">
              <div className="text-sm font-extrabold text-stone-900 dark:text-white">
                {getPeriodLabel(activeCycle, activePeriodKey)}
              </div>
              <div className="text-[10px] text-stone-400 font-medium">
                {CYCLE_LABEL[activeCycle]} · {activePeriodKey}
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleNavigate(1)}
              className="p-1.5 rounded-lg border border-stone-200 dark:border-stone-700 text-stone-500 hover:bg-stone-50 dark:hover:bg-stone-800 transition"
              title="下一周期"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setActivePeriodKey(getPeriodKey(today, activeCycle))}
              className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-stone-500 hover:bg-stone-50 dark:hover:bg-stone-800 transition border border-stone-200 dark:border-stone-700"
            >
              回到今天
            </button>
          </div>

          {/* 本层汇总 */}
          <div className="flex items-center gap-3 sm:gap-4 text-xs">
            <div>
              <span className="text-stone-400 font-medium">本层进度</span>
              <span className="ml-1.5 font-extrabold text-stone-900 dark:text-white">
                {rollup.progress}%
              </span>
            </div>
            <div>
              <span className="text-stone-400 font-medium">计划/实耗</span>
              <span className="ml-1.5 font-extrabold text-stone-900 dark:text-white">
                {rollup.plannedHours}h / {rollup.actualHours}h
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-stone-400 font-medium">达成率</span>
              <div className="w-16 h-1.5 rounded-full bg-stone-200 dark:bg-stone-700 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    rollup.hourFulfillment >= 80
                      ? 'bg-emerald-500'
                      : rollup.hourFulfillment >= 50
                      ? 'bg-amber-500'
                      : 'bg-rose-500'
                  }`}
                  style={{ width: `${Math.min(100, rollup.hourFulfillment)}%` }}
                />
              </div>
              <span className="font-extrabold text-stone-900 dark:text-white">
                {rollup.hourFulfillment}%
              </span>
            </div>
          </div>
        </div>

        {/* 节点列表 */}
        <div className="px-3 sm:px-4 pb-4 space-y-2">
          {levelNodes.length === 0 && (
            <div className="py-10 text-center">
              <Layers className="w-8 h-8 mx-auto text-stone-300 dark:text-stone-700 mb-2" />
              <p className="text-xs text-stone-400 mb-1">
                该{CYCLE_LABEL[activeCycle]}周期还没有计划节点
              </p>
              <p className="text-[11px] text-stone-400 mb-3">
                {activeCycle !== 'year'
                  ? `建议先在上层（${CYCLE_LABEL[prevCycle(activeCycle)]}层）建立成果，再向下分解到${CYCLE_LABEL[activeCycle]}。`
                  : '从年度成果开始，向下拆到季、月、周、日。'}
              </p>
              <button
                type="button"
                onClick={() => {
                  setCreateParentId(undefined);
                  setCreateCycle(activeCycle);
                  setIsCreateOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-stone-900 text-white dark:bg-white dark:text-stone-900 text-xs font-bold transition hover:opacity-90"
              >
                <Plus className="w-3.5 h-3.5" />
                新建{CYCLE_LABEL[activeCycle]}节点
              </button>
            </div>
          )}

          {levelNodes.map((node) => (
            <PlanNodeCard
              key={node.id}
              node={node}
              nodeMap={nodeMap}
              expandedIds={expandedIds}
              onToggle={handleToggleExpand}
              onEdit={(id) => setEditingNode(nodeMap.get(id) || null)}
              onDelete={handleDeleteNode}
              onManualBreakdown={(id) => handleManualBreakdown(nodeMap.get(id))}
              onAiBreakdown={(id) => handleAiBreakdown(nodeMap.get(id))}
              onAddChild={(parentId, childCycle) => {
                setCreateParentId(parentId);
                setCreateCycle(childCycle);
                setIsCreateOpen(true);
              }}
              isBreakingDown={breakingDownId === node.id}
            />
          ))}
        </div>
      </div>

      {/* ============ 勾稽诊断面板 ============ */}
      {showIssues && (
        <div
          data-testid="plan-issue-panel"
          className="bg-white dark:bg-stone-900 rounded-2xl border border-stone-200 dark:border-stone-800 shadow-sm overflow-hidden"
        >
          <div className="px-4 py-3 border-b border-stone-100 dark:border-stone-800 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <h3 className="text-sm font-bold text-stone-900 dark:text-white shrink-0">勾稽诊断</h3>
              <span className="px-2 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800 text-[10px] font-black text-stone-500 shrink-0">
                {visibleIssues.length} / {issues.length} 项
              </span>
              {/* 范围切换：默认全量体检，可聚焦到当前层级 */}
              <div className="flex items-center gap-1 ml-1">
                {([
                  { key: 'all', label: '全部' },
                  { key: 'current', label: `仅${CYCLE_LABEL[activeCycle]}` },
                ] as const).map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setIssueScope(s.key)}
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition ${
                      issueScope === s.key
                        ? 'bg-stone-900 text-white dark:bg-white dark:text-stone-900'
                        : 'bg-stone-100 dark:bg-stone-800 text-stone-500 hover:bg-stone-200 dark:hover:bg-stone-700'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowIssues(false)}
              aria-label="关闭勾稽诊断"
              className="p-1 rounded-lg text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-3 sm:p-4 space-y-2 max-h-[480px] overflow-y-auto">
            {visibleIssues.length === 0 && (
              <div className="py-8 text-center">
                <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500 mb-2" />
                <p className="text-xs text-stone-500 font-medium">
                  勾稽全部通过，时间账与成果账都对得上。
                </p>
              </div>
            )}

            {visibleIssues.map((issue) => {
              const meta = SEVERITY_META[issue.severity];
              const Icon = meta.icon;
              return (
                <div
                  key={issue.id}
                  data-issue-type={issue.type}
                  data-issue-severity={issue.severity}
                  data-issue-node={issue.nodeId}
                  className={`rounded-xl border p-3 ${meta.wrap}`}
                >
                  <div className="flex items-start gap-2.5">
                    <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${meta.text}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-black ${meta.text} border border-current/20`}
                        >
                          {meta.label}
                        </span>
                        <span className="text-[10px] text-stone-400 font-medium">
                          {CYCLE_LABEL[issue.cycle]} · {issue.periodKey}
                        </span>
                      </div>
                      <p className={`text-xs font-semibold ${meta.text} leading-relaxed`}>
                        {issue.message}
                      </p>
                      <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-1 leading-relaxed">
                        💡 {issue.suggestion}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ============ 编辑弹窗 ============ */}
      {editingNode && (
        <PlanNodeEditor
          node={editingNode}
          projects={projects}
          acceleratedGoals={acceleratedGoals}
          onClose={() => setEditingNode(null)}
          onSave={handleSaveNode}
          onDelete={() => handleDeleteNode(editingNode.id)}
        />
      )}

      {/* ============ 新建弹窗 ============ */}
      {isCreateOpen && (
        <PlanNodeCreateModal
          cycle={createCycle}
          periodKey={
            createParentId
              ? getParentPeriodKeyFor(nodeMap.get(createParentId), createCycle) ||
                getPeriodKey(today, createCycle)
              : getPeriodKey(today, createCycle)
          }
          parentId={createParentId}
          parentTitle={
            createParentId ? nodeMap.get(createParentId)?.title || '' : ''
          }
          projects={projects}
          acceleratedGoals={acceleratedGoals}
          onClose={() => setIsCreateOpen(false)}
          onCreate={(node) => {
            if (createParentId) {
              const parent = nodeMap.get(createParentId);
              if (parent) {
                const updatedParent = {
                  ...parent,
                  children: [...(parent.children || []), node.id],
                  updatedAt: new Date().toISOString(),
                };
                onUpdateNodes([
                  ...nodes.map((n) => (n.id === parent.id ? updatedParent : n)),
                  node,
                ]);
              } else {
                onUpdateNodes([...nodes, node]);
              }
            } else {
              onUpdateNodes([...nodes, node]);
            }
            setIsCreateOpen(false);
            if (createParentId) setExpandedIds((prev) => new Set([...prev, createParentId]));
          }}
        />
      )}
    </div>
  );
};

// ==========================================
// 辅助：确定子节点的周期键
// ==========================================

function getParentPeriodKeyFor(
  node: PlanNode | undefined,
  childCycle: PlanCycle
): string | null {
  if (!node) return null;
  const pk = node.periodKey;

  if (node.cycle === 'year') {
    // 年 → 季：取该年的第 1 季度
    if (childCycle === 'quarter') return `${pk}-Q1`;
    // 年 → 月：取该年的 1 月
    if (childCycle === 'month') return `${pk}-01`;
    // 年 → 周：取该年的第 1 周
    if (childCycle === 'week') return getWeekKey(new Date(Number(pk), 0, 4));
    // 年 → 日：取该年的 1 月 1 日
    if (childCycle === 'day') return `${pk}-01-01`;
    return null;
  }

  if (node.cycle === 'quarter') {
    // 季 → 月：取该季度的第 1 个月
    if (childCycle === 'month') {
      const [y, q] = pk.split('-Q');
      return `${y}-${String((Number(q) - 1) * 3 + 1).padStart(2, '0')}`;
    }
    // 季 → 周：取该季度的第 1 周
    if (childCycle === 'week') {
      const [y, q] = pk.split('-Q');
      return getWeekKey(new Date(Number(y), (Number(q) - 1) * 3, 1));
    }
    // 季 → 日：取该季度的第 1 天
    if (childCycle === 'day') {
      const [y, q] = pk.split('-Q');
      return `${y}-${String((Number(q) - 1) * 3 + 1).padStart(2, '0')}-01`;
    }
    return null;
  }

  if (node.cycle === 'month') {
    // 月 → 周：取该月的第 1 周
    if (childCycle === 'week') {
      const [y, m] = pk.split('-').map(Number);
      return getWeekKey(new Date(y, m - 1, 1));
    }
    // 月 → 日：取该月的第 1 天
    if (childCycle === 'day') {
      const [y, m] = pk.split('-').map(Number);
      return `${y}-${String(m).padStart(2, '0')}-01`;
    }
    return null;
  }
  if (node.cycle === 'week') {
    if (childCycle === 'day') {
      // 周一
      const [yStr, wStr] = node.periodKey.split('-W');
      const year = Number(yStr);
      const week = Number(wStr);
      const jan4 = new Date(year, 0, 4);
      const jan4Day = jan4.getDay() || 7;
      const week1Monday = new Date(year, 0, 4 - (jan4Day - 1));
      const monday = new Date(week1Monday);
      monday.setDate(week1Monday.getDate() + (week - 1) * 7);
      return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(
        monday.getDate()
      ).padStart(2, '0')}`;
    }
  }
  return null;
}

// ==========================================
// 指标卡
// ==========================================

const MetricCard: React.FC<{
  icon: any;
  label: string;
  value: string;
  sub: string;
  tone: 'emerald' | 'amber' | 'rose' | 'indigo' | 'stone';
}> = ({ icon: Icon, label, value, sub, tone }) => {
  const tones = {
    emerald: 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200/70 dark:border-emerald-900/60 text-emerald-700 dark:text-emerald-300',
    amber: 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-200/70 dark:border-amber-900/60 text-amber-700 dark:text-amber-300',
    rose: 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-200/70 dark:border-rose-900/60 text-rose-700 dark:text-rose-300',
    indigo: 'bg-indigo-50/70 dark:bg-indigo-950/30 border-indigo-200/70 dark:border-indigo-900/60 text-indigo-700 dark:text-indigo-300',
    stone: 'bg-stone-50 dark:bg-stone-900 border-stone-200 dark:border-stone-800 text-stone-700 dark:text-stone-300',
  };
  return (
    <div className={`rounded-2xl border p-3 ${tones[tone]}`}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className="w-3.5 h-3.5" />
        <span className="text-[10px] font-bold opacity-75">{label}</span>
      </div>
      <div className="text-lg sm:text-xl font-black tracking-tight leading-none">{value}</div>
      <div className="text-[10px] opacity-65 mt-1 font-medium">{sub}</div>
    </div>
  );
};

// ==========================================
// 节点卡片（递归渲染子节点）
// ==========================================

const PlanNodeCard: React.FC<{
  node: PlanNode;
  nodeMap: Map<string, PlanNode>;
  expandedIds: Set<string>;
  isBreakingDown: boolean;
  onToggle: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onManualBreakdown: (id: string) => void;
  onAiBreakdown: (id: string) => void;
  onAddChild: (parentId: string, childCycle: PlanCycle) => void;
}> = ({
  node,
  nodeMap,
  expandedIds,
  isBreakingDown,
  onToggle,
  onEdit,
  onDelete,
  onManualBreakdown,
  onAiBreakdown,
  onAddChild,
}) => {
  const childCycle = nextCycle(node.cycle);
  const hasChildCycle = childCycle !== node.cycle;
  const children = (node.children || [])
    .map((id) => nodeMap.get(id))
    .filter(Boolean) as PlanNode[];
  const statusMeta = STATUS_META[node.status] || STATUS_META.not_started;
  const dim = DIMENSIONS_CONFIG[node.dimension];
  const childPlanned = children.reduce((s, c) => s + (c.plannedHours || 0), 0);
  const timeDiff = (node.plannedHours || 0) - childPlanned;
  const hasGaps = children.length > 0 && Math.abs(timeDiff) > 0.01;
  const expanded = expandedIds.has(node.id);

  return (
    <div
      data-testid="plan-node"
      data-node-id={node.id}
      data-node-cycle={node.cycle}
      data-node-status={node.status}
      data-node-progress={node.progress}
      data-node-child-count={children.length}
      className={`rounded-2xl border transition ${
        node.status === 'completed'
          ? 'bg-zinc-50/60 dark:bg-stone-900/50 border-stone-200 dark:border-stone-800'
          : 'bg-white dark:bg-stone-900 border-stone-200 dark:border-stone-800'
      }`}
    >
      <div className="p-3 sm:p-3.5">
        <div className="flex items-start gap-2.5">
          {/* 状态圆点 + 展开按钮 */}
          <button
            type="button"
            onClick={() => onToggle(node.id)}
            data-expanded={expanded ? 'true' : 'false'}
            data-node-toggle={node.id}
            className="mt-0.5 shrink-0 flex items-center gap-1"
            title={children.length > 0 ? '展开/收起下级' : '无下级'}
          >
            <span className={`w-2 h-2 rounded-full ${statusMeta.dot}`} />
            {children.length > 0 && (
              <ChevronDown
                className={`w-3.5 h-3.5 text-stone-400 transition-transform ${
                  expanded ? 'rotate-180' : ''
                }`}
              />
            )}
          </button>

          {/* 主体 */}
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap mb-1">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${statusMeta.badge}`}
                  >
                    {statusMeta.label}
                  </span>
                  {dim && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400">
                      {dim.label}
                    </span>
                  )}
                  {node.goalId && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300">
                      5X 目标
                    </span>
                  )}
                  {node.weight > 1 && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300">
                      权重 {node.weight}
                    </span>
                  )}
                  {hasGaps && (
                    <span
                      className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300"
                      title={`下级承诺 ${childPlanned}h，本级承诺 ${node.plannedHours}h`}
                    >
                      工时对不上
                    </span>
                  )}
                </div>
                <h4 className="text-sm font-bold text-stone-900 dark:text-white leading-snug break-words">
                  {node.title}
                </h4>
              </div>

              {/* 进度环 */}
              <div className="shrink-0 text-right">
                <div className="text-base font-black text-stone-900 dark:text-white leading-none">
                  {node.progress}%
                </div>
                <div className="w-14 h-1 rounded-full bg-stone-200 dark:bg-stone-700 mt-1 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      node.progress >= 100
                        ? 'bg-zinc-900 dark:bg-white'
                        : node.progress > 0
                        ? 'bg-emerald-500'
                        : 'bg-stone-300'
                    }`}
                    style={{ width: `${node.progress}%` }}
                  />
                </div>
              </div>
            </div>

            {/* 交付物 / 验收标准 */}
            {node.deliverable && (
              <div className="text-[11px] text-stone-600 dark:text-stone-400 leading-relaxed mb-1">
                <span className="font-bold text-stone-500 dark:text-stone-500">交付物：</span>
                {node.deliverable}
              </div>
            )}
            {node.successCriteria && (
              <div className="text-[11px] text-stone-600 dark:text-stone-400 leading-relaxed mb-1">
                <span className="font-bold text-stone-500">验收：</span>
                {node.successCriteria}
              </div>
            )}
            {node.verificationProof && (
              <div className="text-[11px] text-emerald-700 dark:text-emerald-400 leading-relaxed mb-1">
                <span className="font-bold">证据：</span>
                {node.verificationProof}
              </div>
            )}

            {/* 工时条 */}
            <div className="flex items-center gap-3 flex-wrap text-[11px] text-stone-500 dark:text-stone-400 mt-1.5">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                计划 {node.plannedHours}h
              </span>
              <span className="flex items-center gap-1">
                实耗 <strong className="text-stone-700 dark:text-stone-300">{node.actualHours}h</strong>
              </span>
              {children.length > 0 && (
                <span className="flex items-center gap-1">
                  下级合计 {Math.round(childPlanned * 10) / 10}h
                </span>
              )}
              {node.children && node.children.length > 0 && (
                <span className="flex items-center gap-1 text-stone-400">
                  <Link2 className="w-3 h-3" />
                  {node.children.length} 个下级
                </span>
              )}
            </div>

            {/* 操作按钮 */}
            <div className="flex items-center gap-1.5 flex-wrap mt-2.5 pt-2.5 border-t border-stone-100 dark:border-stone-800">
              <button
                type="button"
                onClick={() => onEdit(node.id)}
                className="px-2 py-1 rounded-lg text-[11px] font-semibold text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition"
              >
                编辑
              </button>
              {hasChildCycle && (
                <>
                  <button
                    type="button"
                    onClick={() => onAiBreakdown(node.id)}
                    disabled={isBreakingDown}
                    className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition flex items-center gap-1 disabled:opacity-50"
                    title={`AI 拆解到${CYCLE_LABEL[childCycle]}层`}
                  >
                    {isBreakingDown ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Wand2 className="w-3 h-3" />
                    )}
                    AI 拆解到{CYCLE_LABEL[childCycle]}
                  </button>
                  <button
                    type="button"
                    onClick={() => onManualBreakdown(node.id)}
                    className="px-2 py-1 rounded-lg text-[11px] font-semibold text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition"
                    title={`手动生成${CYCLE_LABEL[childCycle]}层子节点`}
                  >
                    手动分解
                  </button>
                </>
              )}
              {hasChildCycle && (
                <button
                  type="button"
                  onClick={() => onAddChild(node.id, childCycle)}
                  className="px-2 py-1 rounded-lg text-[11px] font-semibold text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  添加{CYCLE_LABEL[childCycle]}节点
                </button>
              )}
              <button
                type="button"
                onClick={() => onDelete(node.id)}
                className="px-2 py-1 rounded-lg text-[11px] font-semibold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition ml-auto flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" />
                删除
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 子节点（递归） */}
      {expanded && children.length > 0 && (
        <div className="px-3 sm:px-4 pb-3 space-y-2 border-t border-stone-100 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-950/30">
          {children.map((child) => (
            <PlanNodeCard
              key={child.id}
              node={child}
              nodeMap={nodeMap}
              expandedIds={expandedIds}
              isBreakingDown={false}
              onToggle={onToggle}
              onEdit={() => onEdit(child.id)}
              onDelete={() => onDelete(child.id)}
              onManualBreakdown={() => onManualBreakdown(child.id)}
              onAiBreakdown={() => onAiBreakdown(child.id)}
              onAddChild={(_parentId, cc) => onAddChild(child.id, cc)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ==========================================
// 编辑弹窗
// ==========================================

const PlanNodeEditor: React.FC<{
  node: PlanNode;
  projects: LifeProject[];
  acceleratedGoals: AcceleratedGoal[];
  onClose: () => void;
  onSave: (node: PlanNode) => void;
  onDelete: () => void;
}> = ({ node, projects, acceleratedGoals, onClose, onSave, onDelete }) => {
  const [title, setTitle] = useState(node.title);
  const [dimension, setDimension] = useState<ProjectCategory>(node.dimension);
  const [plannedHours, setPlannedHours] = useState<string>(String(node.plannedHours || 0));
  const [actualHours, setActualHours] = useState<string>(String(node.actualHours || 0));
  const [weight, setWeight] = useState<string>(String(node.weight || 1));
  const [progress, setProgress] = useState<string>(String(node.progress || 0));
  const [status, setStatus] = useState<PlanNodeStatus>(node.status);
  const [deliverable, setDeliverable] = useState(node.deliverable || '');
  const [successCriteria, setSuccessCriteria] = useState(node.successCriteria || '');
  const [verificationProof, setVerificationProof] = useState(node.verificationProof || '');
  const [note, setNote] = useState(node.note || '');
  const [projectId, setProjectId] = useState(node.projectId || '');
  const [goalId, setGoalId] = useState(node.goalId || '');

  const handleSave = () => {
    if (!title.trim()) {
      alert('请填写节点标题');
      return;
    }
    const nextProgress = Math.max(0, Math.min(100, Number(progress) || 0));
    onSave({
      ...node,
      title: title.trim(),
      dimension,
      plannedHours: Number(plannedHours) || 0,
      actualHours: Number(actualHours) || 0,
      weight: Math.max(1, Number(weight) || 1),
      progress: nextProgress,
      // 用户手动登记的进度单独留痕，用于与子节点勾稽汇总比对
      declaredProgress: nextProgress,
      status,
      deliverable: deliverable.trim(),
      successCriteria: successCriteria.trim(),
      verificationProof: verificationProof.trim(),
      note: note.trim(),
      projectId: projectId || undefined,
      goalId: goalId || undefined,
      updatedAt: new Date().toISOString(),
    });
  };

  const inputCls =
    'w-full px-3 py-2 text-xs rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none focus:border-stone-400 dark:focus:border-stone-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/60 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-200 dark:border-stone-800 shadow-2xl w-full max-w-2xl overflow-hidden my-8">
        <div className="px-6 py-4 border-b border-stone-100 dark:border-stone-800 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Target className="w-4 h-4 text-emerald-600 shrink-0" />
            <h3 className="text-base font-bold text-stone-900 dark:text-white truncate">
              编辑 · {CYCLE_LABEL[node.cycle]}节点
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 text-xs sm:text-sm max-h-[70vh] overflow-y-auto">
          <div>
            <label className="font-bold text-stone-900 dark:text-white mb-1 block">
              节点标题（写成果，不写待办）
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={inputCls}
              placeholder="例：完成推介视频并在 3 个平台发布，拿到前 10 位付费用户"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="font-bold text-stone-900 dark:text-white mb-1 block">
                生命维度
              </label>
              <select
                value={dimension}
                onChange={(e) => setDimension(e.target.value as ProjectCategory)}
                className={inputCls}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="font-bold text-stone-900 dark:text-white mb-1 block">状态</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as PlanNodeStatus)}
                className={inputCls}
              >
                {Object.entries(STATUS_META).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="font-bold text-stone-900 dark:text-white mb-1 block">
                计划工时 (h)
              </label>
              <input
                type="number"
                step="0.5"
                min="0"
                value={plannedHours}
                onChange={(e) => setPlannedHours(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className="font-bold text-stone-900 dark:text-white mb-1 block">
                实际工时 (h)
              </label>
              <input
                type="number"
                step="0.5"
                min="0"
                value={actualHours}
                onChange={(e) => setActualHours(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-stone-900 dark:text-white mb-1 block">
                进度 (%)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                value={progress}
                onChange={(e) => setProgress(e.target.value)}
                className={inputCls}
              />
              <p className="text-[10px] text-stone-400 mt-1">
                有下级时该值会被勾稽汇总自动覆盖
              </p>
            </div>
            <div>
              <label className="font-bold text-stone-900 dark:text-white mb-1 block">
                权重
              </label>
              <input
                type="number"
                min="1"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                className={inputCls}
              />
              <p className="text-[10px] text-stone-400 mt-1">同级内相对重要性，默认 1</p>
            </div>
          </div>

          <div>
            <label className="font-bold text-stone-900 dark:text-white mb-1 block">
              交付物（完成后具体交付什么）
            </label>
            <input
              type="text"
              value={deliverable}
              onChange={(e) => setDeliverable(e.target.value)}
              className={inputCls}
              placeholder="例：成片视频 + 3 个平台发布记录 + 50 条用户反馈"
            />
          </div>

          <div>
            <label className="font-bold text-stone-900 dark:text-white mb-1 block">
              验收标准（可量化的硬标准）
            </label>
            <input
              type="text"
              value={successCriteria}
              onChange={(e) => setSuccessCriteria(e.target.value)}
              className={inputCls}
              placeholder="例：播放量破 5000，反馈中出现「愿意付费」≥ 10 条"
            />
          </div>

          <div>
            <label className="font-bold text-stone-900 dark:text-white mb-1 block">
              交付证据（拒绝虚假打勾）
            </label>
            <input
              type="text"
              value={verificationProof}
              onChange={(e) => setVerificationProof(e.target.value)}
              className={inputCls}
              placeholder="例：Stripe 后台收入截图 / Garmin 训练日志"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-stone-900 dark:text-white mb-1 block">
                关联生命项目
              </label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className={inputCls}
              >
                <option value="">不关联</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="font-bold text-stone-900 dark:text-white mb-1 block">
                关联 5X 目标
              </label>
              <select
                value={goalId}
                onChange={(e) => setGoalId(e.target.value)}
                className={inputCls}
              >
                <option value="">不关联</option>
                {acceleratedGoals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="font-bold text-stone-900 dark:text-white mb-1 block">
              进度备注 / 偏差原因
            </label>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={inputCls}
              placeholder="为什么没做到？瓶颈在哪？"
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-stone-100 dark:border-stone-800 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onDelete}
            className="px-3 py-2 rounded-xl bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 text-xs font-bold transition hover:bg-rose-100 flex items-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            删除
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-stone-600 dark:text-stone-400 text-xs font-bold transition hover:bg-stone-50 dark:hover:bg-stone-800"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-2 rounded-xl bg-stone-900 text-white dark:bg-white dark:text-stone-900 text-xs font-bold transition hover:opacity-90 shadow-sm"
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 新建弹窗
// ==========================================

const PlanNodeCreateModal: React.FC<{
  cycle: PlanCycle;
  periodKey: string;
  parentId?: string;
  parentTitle: string;
  projects: LifeProject[];
  acceleratedGoals: AcceleratedGoal[];
  onClose: () => void;
  onCreate: (node: PlanNode) => void;
}> = ({ cycle, periodKey, parentId, parentTitle, projects, acceleratedGoals, onClose, onCreate }) => {
  const [title, setTitle] = useState('');
  const [dimension, setDimension] = useState<ProjectCategory>('career');
  const [plannedHours, setPlannedHours] = useState('8');
  const [deliverable, setDeliverable] = useState('');
  const [successCriteria, setSuccessCriteria] = useState('');
  const [projectId, setProjectId] = useState('');
  const [goalId, setGoalId] = useState('');
  const [isAiBreaking, setIsAiBreaking] = useState(false);

  const inputCls =
    'w-full px-3 py-2 text-xs rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none focus:border-stone-400';

  const handleAiSuggest = async () => {
    if (!title.trim()) {
      alert('请先填写节点标题，AI 需要知道要拆解什么');
      return;
    }
    setIsAiBreaking(true);
    try {
      const result = await requestSmartBreakdown(
        title.trim(),
        DIMENSIONS_CONFIG[dimension]?.label || dimension,
        CYCLE_LABEL[cycle]
      );
      if (result?.nextMicroAction) {
        setDeliverable((prev) => prev || result.nextMicroAction);
      }
      if (result?.coachTip) {
        setSuccessCriteria((prev) => prev || result.coachTip);
      }
    } catch (err) {
      console.error('[计划板块] AI 建议失败:', err);
      alert('AI 建议失败，请手动填写交付物与验收标准');
    } finally {
      setIsAiBreaking(false);
    }
  };

  const handleCreate = () => {
    if (!title.trim()) {
      alert('请填写节点标题');
      return;
    }
    onCreate(
      createPlanNode({
        title: title.trim(),
        cycle,
        periodKey,
        parentId,
        dimension,
        projectId: projectId || undefined,
        goalId: goalId || undefined,
        plannedHours: Number(plannedHours) || 0,
        deliverable: deliverable.trim(),
        successCriteria: successCriteria.trim(),
      })
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/60 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-200 dark:border-stone-800 shadow-2xl w-full max-w-xl overflow-hidden my-8">
        <div className="px-6 py-4 border-b border-stone-100 dark:border-stone-800 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Plus className="w-4 h-4 text-emerald-600 shrink-0" />
            <h3 className="text-base font-bold text-stone-900 dark:text-white truncate">
              新建 · {CYCLE_LABEL[cycle]}节点
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 text-xs sm:text-sm">
          {parentTitle && (
            <div className="px-3 py-2 rounded-xl bg-stone-50 dark:bg-stone-800/60 text-[11px] text-stone-500 dark:text-stone-400 flex items-center gap-1.5">
              <Link2 className="w-3 h-3 shrink-0" />
              <span className="truncate">挂到「{parentTitle}」之下</span>
            </div>
          )}

          <div>
            <label className="font-bold text-stone-900 dark:text-white mb-1 block">
              节点标题（写成果，不写待办）
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={inputCls}
              autoFocus
              placeholder="例：完成推介视频成片并在 3 个平台发布"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-stone-900 dark:text-white mb-1 block">
                生命维度
              </label>
              <select
                value={dimension}
                onChange={(e) => setDimension(e.target.value as ProjectCategory)}
                className={inputCls}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="font-bold text-stone-900 dark:text-white mb-1 block">
                计划工时 (h)
              </label>
              <input
                type="number"
                step="0.5"
                min="0"
                value={plannedHours}
                onChange={(e) => setPlannedHours(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-bold text-stone-900 dark:text-white">
                交付物
              </label>
              <button
                type="button"
                onClick={handleAiSuggest}
                disabled={isAiBreaking}
                className="px-2 py-1 rounded-lg text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition flex items-center gap-1 disabled:opacity-50"
              >
                {isAiBreaking ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Sparkles className="w-3 h-3" />
                )}
                AI 建议
              </button>
            </div>
            <input
              type="text"
              value={deliverable}
              onChange={(e) => setDeliverable(e.target.value)}
              className={inputCls}
              placeholder="完成后具体交付什么"
            />
          </div>

          <div>
            <label className="font-bold text-stone-900 dark:text-white mb-1 block">
              验收标准
            </label>
            <input
              type="text"
              value={successCriteria}
              onChange={(e) => setSuccessCriteria(e.target.value)}
              className={inputCls}
              placeholder="可量化的硬标准"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="font-bold text-stone-900 dark:text-white mb-1 block">
                关联生命项目
              </label>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className={inputCls}
              >
                <option value="">不关联</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="font-bold text-stone-900 dark:text-white mb-1 block">
                关联 5X 目标
              </label>
              <select
                value={goalId}
                onChange={(e) => setGoalId(e.target.value)}
                className={inputCls}
              >
                <option value="">不关联</option>
                {acceleratedGoals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="px-3 py-2 rounded-xl bg-stone-50 dark:bg-stone-800/60 text-[11px] text-stone-500 dark:text-stone-400">
            周期：<span className="font-bold text-stone-700 dark:text-stone-300">
              {getPeriodLabel(cycle, periodKey)}
            </span>
            　权重：<span className="font-bold text-stone-700 dark:text-stone-300">1</span>
            　进度：<span className="font-bold text-stone-700 dark:text-stone-300">0%</span>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-stone-100 dark:border-stone-800 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-stone-600 dark:text-stone-400 text-xs font-bold transition hover:bg-stone-50 dark:hover:bg-stone-800"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleCreate}
            className="px-4 py-2 rounded-xl bg-stone-900 text-white dark:bg-white dark:text-stone-900 text-xs font-bold transition hover:opacity-90 shadow-sm"
          >
            创建节点
          </button>
        </div>
      </div>
    </div>
  );
};
