import {
  LifeProject,
  DailyLog,
  LifeWheelScores,
  RetrospectiveReport,
  AcceleratedGoal,
  PlanNode,
  HealthDailyEntry,
  HealthGoals,
} from '../types';
import {
  CYCLE_LABEL,
  CYCLE_ORDER,
  diagnoseReconciliation,
  reconcileTree,
  summarizeBoard,
} from './planReconciliation';
import { analyzeHealth, DEFAULT_HEALTH_GOALS } from './healthAnalytics';

const STATUS_LABEL: Record<string, string> = {
  not_started: '未开始',
  in_progress: '进行中',
  completed: '已完成',
  blocked: '受阻',
  dropped: '已放弃',
};

const SEVERITY_LABEL: Record<string, string> = {
  critical: '严重',
  warning: '警告',
  info: '提示',
};

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 生成「日 / 周 / 月 / 季 / 年 五级计划树」的独立 HTML 区块。
 * 直接复用运行时同一套勾稽引擎，保证导出结果与页面内看到的完全一致。
 */
function renderPlanSection(
  planNodes: PlanNode[],
  projects: LifeProject[] = [],
  acceleratedGoals: AcceleratedGoal[] = []
): string {
  if (!planNodes.length) {
    return `
    <div class="space-y-4">
      <h3 class="text-lg font-bold text-slate-900 flex items-center gap-2">
        <i data-lucide="git-branch" class="w-5 h-5 text-emerald-600"></i>
        日 / 周 / 月 / 季 / 年 五级计划板
      </h3>
      <p class="text-xs text-slate-500">暂无计划节点。</p>
    </div>`;
  }

  const reconciled = reconcileTree(planNodes);
  const issues = diagnoseReconciliation(planNodes);
  const summary = summarizeBoard(planNodes, issues);
  const nodeMap = new Map(reconciled.map((n) => [n.id, n]));
  const projectMap = new Map(projects.map((p) => [p.id, p]));
  const goalMap = new Map(acceleratedGoals.map((g) => [g.id, g]));

  // 按层级顺序组织：年 → 季 → 月 → 周 → 日
  const rootIds = reconciled
    .filter((n) => !n.parentId)
    .map((n) => n.id);

  const renderNode = (id: string, depth: number): string => {
    const n = nodeMap.get(id);
    if (!n) return '';
    const children = (n.children || [])
      .map((c) => renderNode(c, depth + 1))
      .join('');
    const hoursGap = (() => {
      const kids = (n.children || [])
        .map((c) => nodeMap.get(c))
        .filter((c): c is PlanNode => Boolean(c));
      if (!kids.length) return null;
      const sum = kids.reduce((s, c) => s + (c.plannedHours || 0), 0);
      const diff = (n.plannedHours || 0) - sum;
      return Math.abs(diff) > 0.01 ? diff : null;
    })();

    // 关联的 5X 目标 / 生命项目 —— 导出时给出真实名称，而不只是一个徽标
    const linkedGoal = n.goalId ? goalMap.get(n.goalId) : undefined;
    const linkedProject = n.projectId ? projectMap.get(n.projectId) : undefined;

    return `
      <div style="margin-left:${depth * 20}px">
        <div class="p-3 rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div class="flex items-start justify-between gap-3">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                  ${escapeHtml(CYCLE_LABEL[n.cycle] || n.cycle)} · ${escapeHtml(n.periodKey)}
                </span>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  n.status === 'completed'
                    ? 'bg-emerald-100 text-emerald-700'
                    : n.status === 'blocked'
                      ? 'bg-rose-100 text-rose-700'
                      : n.status === 'in_progress'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-slate-100 text-slate-600'
                }">${escapeHtml(STATUS_LABEL[n.status] || n.status)}</span>
                ${n.goalId ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">已关联 5X 目标</span>' : ''}
                ${n.projectId ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-100 text-violet-700">已关联生命项目</span>' : ''}
              </div>
              <h5 class="font-bold text-sm text-slate-900 mt-1.5">${escapeHtml(n.title)}</h5>
              ${linkedGoal ? `<p class="text-[11px] text-amber-700 mt-1">🎯 关联 5X 目标：${escapeHtml(linkedGoal.title)}（${escapeHtml(linkedGoal.oneYearTarget || '')}，进度 ${linkedGoal.progress ?? 0}%）</p>` : ''}
              ${linkedProject ? `<p class="text-[11px] text-violet-700 mt-1">📁 关联生命项目：${escapeHtml(linkedProject.title)}</p>` : ''}
              ${n.deliverable ? `<p class="text-[11px] text-slate-500 mt-1">交付物：${escapeHtml(n.deliverable)}</p>` : ''}
              ${n.successCriteria ? `<p class="text-[11px] text-slate-500">验收标准：${escapeHtml(n.successCriteria)}</p>` : ''}
              ${n.verificationProof ? `<p class="text-[11px] text-emerald-700 mt-1">✓ 证据：${escapeHtml(n.verificationProof)}</p>` : ''}
              ${n.note ? `<p class="text-[11px] text-slate-500 mt-1">备注：${escapeHtml(n.note)}</p>` : ''}
            </div>
            <div class="text-right shrink-0 space-y-1">
              <div class="text-lg font-bold text-emerald-600">${n.progress}%</div>
              <div class="text-[10px] text-slate-500">计划 ${n.plannedHours}h / 实耗 ${n.actualHours}h</div>
              ${hoursGap !== null ? `<div class="text-[10px] font-bold ${hoursGap > 0 ? 'text-amber-600' : 'text-rose-600'}">${hoursGap > 0 ? '缺口' : '超配'} ${Math.abs(hoursGap)}h</div>` : ''}
              <div class="text-[10px] text-slate-400">权重 ${n.weight}</div>
            </div>
          </div>
          <div class="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden mt-2">
            <div class="bg-emerald-600 h-full" style="width:${n.progress}%"></div>
          </div>
        </div>
        ${children ? `<div class="mt-2 space-y-2">${children}</div>` : ''}
      </div>`;
  };

  const treeHtml = rootIds.map((id) => renderNode(id, 0)).join('');

  // 各周期层统计
  const cycleStats = CYCLE_ORDER.map((cycle) => {
    const list = planNodes.filter((n) => n.cycle === cycle);
    const avg = list.length
      ? Math.round(list.reduce((s, n) => s + (n.progress || 0), 0) / list.length)
      : 0;
    const planned = list.reduce((s, n) => s + (n.plannedHours || 0), 0);
    return { cycle, label: CYCLE_LABEL[cycle], count: list.length, avg, planned };
  });

  const issueHtml = issues.length
    ? issues
        .map(
          (i) => `
      <div class="p-3 rounded-xl border border-slate-200 bg-white">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${
            i.severity === 'critical'
              ? 'bg-rose-100 text-rose-700'
              : i.severity === 'warning'
                ? 'bg-amber-100 text-amber-700'
                : 'bg-sky-100 text-sky-700'
          }">${escapeHtml(SEVERITY_LABEL[i.severity] || i.severity)}</span>
          <span class="text-[11px] font-bold text-slate-800">${escapeHtml(i.nodeTitle || i.type)}</span>
          <span class="text-[10px] text-slate-400">${escapeHtml(CYCLE_LABEL[i.cycle] || i.cycle)} · ${escapeHtml(i.periodKey)}</span>
        </div>
        <p class="text-[11px] text-slate-600 mt-1">${escapeHtml(i.message)}</p>
        ${i.suggestion ? `<p class="text-[11px] text-emerald-700 mt-1">💡 ${escapeHtml(i.suggestion)}</p>` : ''}
      </div>`
        )
        .join('')
    : '<p class="text-xs text-emerald-700">✓ 未发现勾稽问题</p>';

  return `
    <div class="space-y-4">
      <h3 class="text-lg font-bold text-slate-900 flex items-center gap-2">
        <i data-lucide="git-branch" class="w-5 h-5 text-emerald-600"></i>
        日 / 周 / 月 / 季 / 年 五级计划板（${planNodes.length} 个节点）
      </h3>

      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div class="p-3 rounded-2xl border border-slate-200 bg-white">
          <div class="text-[11px] text-slate-500">计划健康度</div>
          <div class="text-xl font-bold mt-1 ${
            summary.healthScore >= 80 ? 'text-emerald-600' : summary.healthScore >= 60 ? 'text-amber-600' : 'text-rose-600'
          }">${summary.healthScore}</div>
        </div>
        <div class="p-3 rounded-2xl border border-slate-200 bg-white">
          <div class="text-[11px] text-slate-500">严重问题</div>
          <div class="text-xl font-bold mt-1 text-rose-600">${summary.criticalCount}</div>
        </div>
        <div class="p-3 rounded-2xl border border-slate-200 bg-white">
          <div class="text-[11px] text-slate-500">警告</div>
          <div class="text-xl font-bold mt-1 text-amber-600">${summary.warningCount}</div>
        </div>
        <div class="p-3 rounded-2xl border border-slate-200 bg-white">
          <div class="text-[11px] text-slate-500">总体进度</div>
          <div class="text-xl font-bold mt-1 text-emerald-600">${summary.overallProgress}%</div>
        </div>
      </div>

      <div class="space-y-2">
        <h4 class="text-sm font-bold text-slate-800">各周期层进度</h4>
        <div class="grid grid-cols-2 sm:grid-cols-5 gap-3">
          ${cycleStats
            .map(
              (c) => `
            <div class="p-3 rounded-2xl border border-slate-200 bg-white">
              <div class="text-[11px] text-slate-500">${escapeHtml(c.label)}</div>
              <div class="text-lg font-bold mt-0.5 text-slate-900">${c.count} 项</div>
              <div class="text-[11px] text-slate-500">平均 ${c.avg}% · 计划 ${c.planned}h</div>
              <div class="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden mt-1.5">
                <div class="bg-emerald-600 h-full" style="width:${c.avg}%"></div>
              </div>
            </div>`
            )
            .join('')}
        </div>
      </div>

      <div class="space-y-2">
        <h4 class="text-sm font-bold text-slate-800">计划树（自上而下勾稽）</h4>
        <div class="space-y-2">${treeHtml}</div>
      </div>

      <div class="space-y-2">
        <h4 class="text-sm font-bold text-slate-800">勾稽诊断（${issues.length} 项）</h4>
        <div class="space-y-2">${issueHtml}</div>
      </div>
    </div>`;
}

/**
 * 生成「量化健康」的独立 HTML 区块。
 *
 * 关键点：直接调用运行时同一套分析引擎（analyzeHealth），
 * 保证导出结果与页面内看到的评分 / 洞察 / 相关性完全一致，
 * 而不是另写一套「导出专用算法」导致两边数字对不上。
 */
function renderHealthSection(
  healthEntries: HealthDailyEntry[] = [],
  healthGoals?: HealthGoals
): string {
  if (!healthEntries.length) {
    return `
    <div class="space-y-4">
      <h3 class="text-lg font-bold text-slate-900 flex items-center gap-2">
        <i data-lucide="heart-pulse" class="w-5 h-5 text-rose-500"></i>
        量化健康记录与分析
      </h3>
      <p class="text-xs text-slate-500">暂无健康记录。</p>
    </div>`;
  }

  const goals = healthGoals || DEFAULT_HEALTH_GOALS;
  const analysis = analyzeHealth(healthEntries, goals, 'week', 8);

  const scoreColor = (s: number) =>
    s >= 80 ? 'text-emerald-600' : s >= 60 ? 'text-amber-600' : 'text-rose-600';

  const rollupHtml = analysis.rollups
    .filter((r) => r.daysRecorded > 0)
    .map(
      (r) => `
      <div class="p-3 rounded-2xl border border-slate-200 bg-white">
        <div class="flex items-center justify-between">
          <span class="text-[11px] font-bold text-slate-600">${escapeHtml(r.label)}</span>
          <span class="text-lg font-bold ${scoreColor(r.score)}">${r.score}</span>
        </div>
        <div class="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden mt-1.5">
          <div class="bg-rose-500 h-full" style="width:${r.score}%"></div>
        </div>
        <div class="text-[10px] text-slate-500 mt-1.5 leading-relaxed">
          记录 ${r.daysRecorded} 天 · 睡眠 ${r.avgSleepHours.toFixed(1)}h ·
          运动 ${Math.round(r.avgExerciseMinutes)}min · 步数 ${Math.round(r.avgSteps)}<br/>
          摄入 ${Math.round(r.avgCaloriesIntake)}kcal / 消耗 ${Math.round(r.avgCaloriesBurned)}kcal ·
          体重 ${r.latestWeightKg.toFixed(1)}kg
          ${r.weightDeltaKg !== 0 ? `(${r.weightDeltaKg > 0 ? '+' : ''}${r.weightDeltaKg}kg)` : ''}
        </div>
      </div>`
    )
    .join('');

  const insightHtml = analysis.insights.length
    ? analysis.insights
        .map(
          (i) => `
      <div class="p-3 rounded-xl border border-slate-200 bg-white">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${
            i.severity === 'critical'
              ? 'bg-rose-100 text-rose-700'
              : i.severity === 'warning'
                ? 'bg-amber-100 text-amber-700'
                : 'bg-sky-100 text-sky-700'
          }">${escapeHtml(
            i.severity === 'critical' ? '严重' : i.severity === 'warning' ? '警告' : '提示'
          )}</span>
          <span class="text-[11px] font-bold text-slate-800">${escapeHtml(i.title)}</span>
        </div>
        <p class="text-[11px] text-slate-600 mt-1">${escapeHtml(i.detail)}</p>
        ${i.action ? `<p class="text-[11px] text-emerald-700 mt-1">💡 ${escapeHtml(i.action)}</p>` : ''}
      </div>`
        )
        .join('')
    : '<p class="text-xs text-slate-500">暂无洞察。</p>';

  const corrHtml = analysis.correlations.length
    ? analysis.correlations
        .slice(0, 12)
        .map(
          (c) => `
      <div class="p-2.5 rounded-xl border border-slate-200 bg-white flex items-center gap-2">
        <span class="text-[11px] font-bold text-slate-700 flex-1 min-w-0 truncate">${escapeHtml(
          c.xLabel
        )} × ${escapeHtml(c.yLabel)}</span>
        <span class="text-[11px] font-bold ${
          c.r >= 0 ? 'text-rose-600' : 'text-emerald-600'
        }">r = ${c.r.toFixed(2)}</span>
        <span class="text-[10px] text-slate-400">n=${c.n}</span>
      </div>`
        )
        .join('')
    : '<p class="text-xs text-slate-500">数据量不足，无法计算相关性。</p>';

  const anomalyHtml = analysis.anomalies.length
    ? analysis.anomalies
        .map(
          (a) => `
      <div class="p-3 rounded-xl border border-slate-200 bg-white">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${
            a.severity === 'critical'
              ? 'bg-rose-100 text-rose-700'
              : a.severity === 'warning'
                ? 'bg-amber-100 text-amber-700'
                : 'bg-sky-100 text-sky-700'
          }">${escapeHtml(
            a.severity === 'critical' ? '严重' : a.severity === 'warning' ? '警告' : '提示'
          )}</span>
          <span class="text-[11px] font-bold text-slate-800">${escapeHtml(a.title)}</span>
        </div>
        <p class="text-[11px] text-slate-600 mt-1">${escapeHtml(a.detail)}</p>
      </div>`
        )
        .join('')
    : '<p class="text-xs text-emerald-700">✓ 未发现明显异常</p>';

  // 最近 14 天明细
  const recent = [...healthEntries]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 14);
  const detailHtml = recent
    .map(
      (e) => `
      <tr class="border-b border-slate-100">
        <td class="px-2 py-1.5 font-semibold whitespace-nowrap">${escapeHtml(e.date)}</td>
        <td class="px-2 py-1.5">${e.sleepHours !== undefined ? e.sleepHours.toFixed(1) : '—'}</td>
        <td class="px-2 py-1.5">${e.exerciseMinutes !== undefined ? Math.round(e.exerciseMinutes) : '—'}</td>
        <td class="px-2 py-1.5">${e.steps !== undefined ? Math.round(e.steps) : '—'}</td>
        <td class="px-2 py-1.5">${e.caloriesIntake !== undefined ? Math.round(e.caloriesIntake) : '—'}</td>
        <td class="px-2 py-1.5">${e.waterMl !== undefined ? Math.round(e.waterMl) : '—'}</td>
        <td class="px-2 py-1.5">${e.weightKg !== undefined ? e.weightKg.toFixed(1) : '—'}</td>
        <td class="px-2 py-1.5">${e.restingHr !== undefined ? Math.round(e.restingHr) : '—'}</td>
      </tr>`
    )
    .join('');

  return `
    <div class="space-y-4">
      <h3 class="text-lg font-bold text-slate-900 flex items-center gap-2">
        <i data-lucide="heart-pulse" class="w-5 h-5 text-rose-500"></i>
        量化健康记录与分析（${healthEntries.length} 天）
      </h3>

      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div class="p-3 rounded-2xl border border-slate-200 bg-white">
          <div class="text-[11px] text-slate-500">健康评分</div>
          <div class="text-xl font-bold mt-1 ${scoreColor(analysis.overallScore)}">${analysis.overallScore}</div>
        </div>
        <div class="p-3 rounded-2xl border border-slate-200 bg-white">
          <div class="text-[11px] text-slate-500">记录覆盖率</div>
          <div class="text-xl font-bold mt-1 text-sky-600">${Math.round(analysis.coverage * 100)}%</div>
        </div>
        <div class="p-3 rounded-2xl border border-slate-200 bg-white">
          <div class="text-[11px] text-slate-500">记录天数</div>
          <div class="text-xl font-bold mt-1 text-slate-900">${analysis.totalDays}</div>
        </div>
        <div class="p-3 rounded-2xl border border-slate-200 bg-white">
          <div class="text-[11px] text-slate-500">异常提示</div>
          <div class="text-xl font-bold mt-1 ${
            analysis.anomalies.length ? 'text-amber-600' : 'text-emerald-600'
          }">${analysis.anomalies.length}</div>
        </div>
      </div>

      <div class="space-y-2">
        <h4 class="text-sm font-bold text-slate-800">周维度评分趋势</h4>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">${rollupHtml}</div>
      </div>

      <div class="space-y-2">
        <h4 class="text-sm font-bold text-slate-800">分析洞察（${analysis.insights.length}）</h4>
        <div class="space-y-2">${insightHtml}</div>
      </div>

      <div class="space-y-2">
        <h4 class="text-sm font-bold text-slate-800">指标相关性</h4>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">${corrHtml}</div>
      </div>

      <div class="space-y-2">
        <h4 class="text-sm font-bold text-slate-800">异常检测（${analysis.anomalies.length}）</h4>
        <div class="space-y-2">${anomalyHtml}</div>
      </div>

      <div class="space-y-2">
        <h4 class="text-sm font-bold text-slate-800">最近 14 天明细</h4>
        <div class="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table class="w-full text-[11px]">
            <thead class="bg-slate-50 text-slate-600">
              <tr>
                <th class="px-2 py-2 text-left">日期</th>
                <th class="px-2 py-2 text-left">睡眠(h)</th>
                <th class="px-2 py-2 text-left">运动(min)</th>
                <th class="px-2 py-2 text-left">步数</th>
                <th class="px-2 py-2 text-left">摄入(kcal)</th>
                <th class="px-2 py-2 text-left">饮水(ml)</th>
                <th class="px-2 py-2 text-left">体重(kg)</th>
                <th class="px-2 py-2 text-left">静息心率</th>
              </tr>
            </thead>
            <tbody>${detailHtml}</tbody>
          </table>
        </div>
      </div>
    </div>`;
}

export function buildStandaloneHtml(
  projects: LifeProject[],
  logs: DailyLog[],
  wheelScores: LifeWheelScores,
  retrospectives: RetrospectiveReport[],
  acceleratedGoals?: AcceleratedGoal[],
  planNodes?: PlanNode[],
  healthEntries?: HealthDailyEntry[],
  healthGoals?: HealthGoals
): string {
  const serializedProjects = JSON.stringify(projects, null, 2);
  const serializedLogs = JSON.stringify(logs, null, 2);
  const serializedWheel = JSON.stringify(wheelScores, null, 2);
  const serializedRetro = JSON.stringify(retrospectives, null, 2);
  const serializedMusk = JSON.stringify(acceleratedGoals || [], null, 2);
  const serializedPlan = JSON.stringify(planNodes || [], null, 2);

  const planSection = renderPlanSection(planNodes || [], projects, acceleratedGoals || []);
  const healthSection = renderHealthSection(healthEntries || [], healthGoals);

  const htmlContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LifeCompass · 人生教练 | 个人全景备份网页</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/lucide@latest"></script>
  <style>
    @media print {
      .no-print { display: none !important; }
      body { background: white !important; }
    }
  </style>
</head>
<body class="bg-slate-50 text-slate-900 font-sans min-h-screen flex flex-col antialiased">
  <header class="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200">
    <div class="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
      <div class="flex items-center gap-2.5">
        <div class="w-8 h-8 rounded-xl bg-emerald-600 flex items-center justify-center text-white">
          <i data-lucide="compass" class="w-5 h-5"></i>
        </div>
        <div>
          <span class="font-extrabold text-base text-slate-900 flex items-center gap-1.5">
            LifeCompass · 人生教练
            <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold">已导出独立网页</span>
          </span>
          <span class="text-[10px] text-slate-400">导出时间：${new Date().toLocaleString()}</span>
        </div>
      </div>
      <button onclick="window.print()" class="no-print px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-100 flex items-center gap-1.5">
        <i data-lucide="printer" class="w-3.5 h-3.5"></i> 打印或存为PDF
      </button>
    </div>
  </header>

  <main class="max-w-6xl mx-auto px-4 py-8 space-y-8 flex-1 w-full">
    <!-- Summary Top -->
    <div class="bg-slate-900 text-white rounded-3xl p-6 sm:p-8">
      <h2 class="text-2xl font-bold mb-2">人生项目全盘监督概览</h2>
      <p class="text-xs sm:text-sm text-slate-300 mb-6">本网页为你的本地独立备份，包含 ${projects.length} 个生命项目、${logs.length} 篇觉察日志、${(planNodes || []).length} 个计划节点、${(healthEntries || []).length} 天健康记录与全套复盘体系。</p>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div class="p-3 rounded-2xl bg-white/5 border border-white/10">
          <div class="text-[11px] text-slate-400">监督项目数</div>
          <div class="text-xl font-bold mt-1 text-emerald-400">${projects.length}</div>
        </div>
        <div class="p-3 rounded-2xl bg-white/5 border border-white/10">
          <div class="text-[11px] text-slate-400">高优/冲刺主线</div>
          <div class="text-xl font-bold mt-1 text-orange-400">${projects.filter(p => p.priority === 'high' || p.status === 'sprinting').length}</div>
        </div>
        <div class="p-3 rounded-2xl bg-white/5 border border-white/10">
          <div class="text-[11px] text-slate-400">觉察打卡记录</div>
          <div class="text-xl font-bold mt-1 text-blue-400">${logs.length}</div>
        </div>
        <div class="p-3 rounded-2xl bg-white/5 border border-white/10">
          <div class="text-[11px] text-slate-400">复盘报告数</div>
          <div class="text-xl font-bold mt-1 text-purple-400">${retrospectives.length}</div>
        </div>
      </div>
    </div>

    <!-- Section 1: Life Projects -->
    <div class="space-y-4">
      <h3 class="text-lg font-bold text-slate-900 flex items-center gap-2">
        <i data-lucide="folder-kanban" class="w-5 h-5 text-emerald-600"></i>
        生命项目监督矩阵 (${projects.length})
      </h3>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        ${projects.map(p => `
          <div class="p-4 rounded-2xl border border-slate-200 bg-white shadow-sm space-y-3">
            <div class="flex items-center justify-between text-[11px]">
              <span class="px-2 py-0.5 rounded-full font-bold bg-slate-100 text-slate-700">${p.category}</span>
              <span class="font-bold text-emerald-600">${p.status}</span>
            </div>
            <h4 class="font-bold text-sm text-slate-900">${p.title}</h4>
            <p class="text-xs text-slate-500 leading-relaxed">${p.description || ''}</p>
            <div class="space-y-1.5">
              <div class="flex justify-between text-xs font-semibold">
                <span>进度</span><span>${p.progress}%</span>
              </div>
              <div class="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                <div class="bg-emerald-600 h-full" style="width: ${p.progress}%"></div>
              </div>
            </div>
            ${p.nextMicroAction ? `
              <div class="p-2 rounded-xl bg-emerald-50 text-[11px] font-medium text-emerald-800">
                ⚡ 最小第一击: ${p.nextMicroAction}
              </div>
            ` : ''}
          </div>
        `).join('')}
      </div>
    </div>

    <!-- Section 2: Logs -->
    <div class="space-y-4">
      <h3 class="text-lg font-bold text-slate-900 flex items-center gap-2">
        <i data-lucide="calendar" class="w-5 h-5 text-emerald-600"></i>
        近期觉察与打卡明细 (${logs.length})
      </h3>
      <div class="space-y-3">
        ${logs.map(l => `
          <div class="p-4 rounded-2xl border border-slate-200 bg-white text-xs space-y-2">
            <div class="flex justify-between items-center font-bold">
              <span>${l.date}</span>
              <span class="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">⚡ 精力 ${l.energyLevel}/5</span>
            </div>
            <div class="p-2.5 rounded-xl bg-emerald-50/60 font-semibold text-emerald-900">
              🎯 战果高光：${l.highlight}
            </div>
            ${l.wins && l.wins.length > 0 ? `<div class="text-slate-700 font-medium">🏆 确认小胜：${l.wins.join('；')}</div>` : ''}
            ${l.friction ? `<div class="text-slate-500">⚠️ 反思阻抗：${l.friction}</div>` : ''}
          </div>
        `).join('')}
      </div>
    </div>

    <!-- Section 3: Retrospective Reports -->
    ${retrospectives.length > 0 ? `
      <div class="space-y-4">
        <h3 class="text-lg font-bold text-slate-900 flex items-center gap-2">
          <i data-lucide="trending-up" class="w-5 h-5 text-emerald-600"></i>
          战略复盘简报
        </h3>
        ${retrospectives.map(r => `
          <div class="p-6 rounded-3xl border border-slate-200 bg-white shadow-sm space-y-4">
            <h4 class="font-bold text-base text-slate-900">${r.title}</h4>
            <div class="prose text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">${r.content}</div>
          </div>
        `).join('')}
      </div>
    ` : ''}

    <!-- Section 4: 五级计划板 -->
    ${planSection}

    <!-- Section 5: 量化健康 -->
    ${healthSection}
  </main>

  <footer class="border-t border-slate-200 py-6 text-center text-xs text-slate-400 no-print">
    LifeCompass · 人生教练 | 个人全景备份网页
  </footer>

  <script>lucide.createIcons();</script>
</body>
</html>`;

  return htmlContent;
}

export function exportStandaloneHtmlFile(
  projects: LifeProject[],
  logs: DailyLog[],
  wheelScores: LifeWheelScores,
  retrospectives: RetrospectiveReport[],
  acceleratedGoals?: AcceleratedGoal[],
  planNodes?: PlanNode[],
  healthEntries?: HealthDailyEntry[],
  healthGoals?: HealthGoals
) {
  const htmlContent = buildStandaloneHtml(
    projects,
    logs,
    wheelScores,
    retrospectives,
    acceleratedGoals,
    planNodes,
    healthEntries,
    healthGoals
  );

  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `lifecompass_report_${new Date().toISOString().split('T')[0]}.html`;
  a.click();
  URL.revokeObjectURL(url);
}
