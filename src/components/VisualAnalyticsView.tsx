import React from 'react';
import { LifeProject, DailyLog, LifeWheelScores } from '../types';
import { DIMENSIONS_CONFIG } from '../utils/categories';
import {
  TrendingUp,
  BatteryCharging,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Target,
  ArrowUpRight,
  Flame,
  ShieldCheck,
} from 'lucide-react';

interface Props {
  projects: LifeProject[];
  logs: DailyLog[];
  wheelScores: LifeWheelScores;
  onOpenCoachChat: (project?: LifeProject) => void;
  onOpenCorrection: (project: LifeProject) => void;
}

export const VisualAnalyticsView: React.FC<Props> = ({
  projects,
  logs,
  wheelScores,
  onOpenCoachChat,
  onOpenCorrection,
}) => {
  // 1. Calculate 7-day energy trend
  const last7DaysLogs = [...logs].slice(0, 7).reverse();
  const avgEnergy =
    logs.length > 0
      ? (logs.reduce((sum, l) => sum + l.energyLevel, 0) / logs.length).toFixed(1)
      : '4.0';

  // 2. Dimension breakdown
  const dimensions = ['career', 'health', 'wealth', 'mindset'] as const;
  const dimensionStats = dimensions.map((dimKey) => {
    const dimProjects = projects.filter((p) => p.category === dimKey);
    const totalHours = dimProjects.reduce((sum, p) => sum + (p.weeklyHours || 0), 0);
    const avgProg =
      dimProjects.length > 0
        ? Math.round(dimProjects.reduce((sum, p) => sum + p.progress, 0) / dimProjects.length)
        : 0;
    const stalledCount = dimProjects.filter((p) => p.status === 'needs_attention').length;

    return {
      key: dimKey,
      meta: DIMENSIONS_CONFIG[dimKey],
      projectsCount: dimProjects.length,
      totalHours,
      avgProgress: avgProg,
      stalledCount,
      wheelScore: wheelScores[dimKey as keyof LifeWheelScores] || 7,
    };
  });

  // 3. Supervision Alert Watchlist (Projects needing supervision)
  const attentionProjects = projects.filter(
    (p) => p.status === 'needs_attention' || (p.progress < 40 && p.priority === 'high')
  );

  // 4. Coach Intelligence Rule-based + Contextual Advice
  const lowestDimension = [...dimensionStats].sort((a, b) => a.wheelScore - b.wheelScore)[0];
  const totalWeeklyHours = projects
    .filter((p) => p.status !== 'completed')
    .reduce((sum, p) => sum + (p.weeklyHours || 0), 0);

  return (
    <div className="space-y-6">
      {/* Top Banner: Coach Daily Intelligence Nudge */}
      <div className="bg-stone-900 text-white rounded-3xl p-6 sm:p-7 border border-stone-800 shadow-sm relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-xl">
            <div className="flex items-center gap-2">
              <span className="p-1 rounded-lg bg-emerald-500/20 text-emerald-400">
                <Sparkles className="w-3.5 h-3.5" />
              </span>
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                全景数据监督与教练智能研判
              </span>
            </div>
            <h3 className="text-xl font-bold tracking-tight">
              当前系统负荷：每周 {totalWeeklyHours} 工时 · 平均精力 {avgEnergy}/5
            </h3>
            <p className="text-xs text-stone-300 leading-relaxed">
              数据透视显示：你当前【{lowestDimension.meta.label}】自评分仅 {lowestDimension.wheelScore} 分，
              注意警惕“局部维度过度冲刺导致短板维度能量流失”。建议今日优先守护睡眠与微习惯。
            </p>
          </div>

          <button
            type="button"
            onClick={() => onOpenCoachChat()}
            className="px-4 py-2 rounded-2xl bg-white text-stone-950 font-bold text-xs hover:bg-stone-100 transition flex items-center gap-1.5 shrink-0 self-start md:self-auto shadow-sm"
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
            向教练申请深度研判
          </button>
        </div>
      </div>

      {/* Grid: 7-Day Energy Chart & 4-Dimension Balance */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: 7-Day Energy Trend Line/Bars */}
        <div className="lg:col-span-6 bg-white dark:bg-stone-900 rounded-3xl border border-stone-200/90 dark:border-stone-800 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-stone-100 dark:border-stone-800">
            <div>
              <h4 className="text-xs font-bold text-stone-900 dark:text-white flex items-center gap-1.5">
                <BatteryCharging className="w-4 h-4 text-emerald-600" />
                近期精力电量走势 (1-5格)
              </h4>
              <p className="text-[11px] text-stone-500">生理能量是意志力与专注产出的底层支柱</p>
            </div>
            <span className="text-xs font-bold text-stone-900 dark:text-white">
              7日均值 {avgEnergy}
            </span>
          </div>

          {/* Simple Clean Bar Chart */}
          <div className="h-40 flex items-end justify-between gap-2 pt-4 px-2">
            {last7DaysLogs.length === 0 ? (
              <div className="w-full text-center text-xs text-stone-400 py-12">
                暂无近期打卡记录，完成几次日常觉察后自动生成趋势
              </div>
            ) : (
              last7DaysLogs.map((log) => {
                const heightPercent = (log.energyLevel / 5) * 100;
                return (
                  <div key={log.id} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                    <span className="text-[10px] font-bold text-stone-600 dark:text-stone-300">
                      {log.energyLevel}
                    </span>
                    <div className="w-full max-w-[28px] bg-stone-100 dark:bg-stone-800 rounded-t-lg h-28 flex items-end overflow-hidden">
                      <div
                        className={`w-full rounded-t-lg transition-all duration-500 ${
                          log.energyLevel >= 4
                            ? 'bg-emerald-600'
                            : log.energyLevel === 3
                            ? 'bg-amber-500'
                            : 'bg-rose-500'
                        }`}
                        style={{ height: `${heightPercent}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-stone-400 whitespace-nowrap">
                      {log.date.slice(5)}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Four Core Dimensions Balance Overview */}
        <div className="lg:col-span-6 bg-white dark:bg-stone-900 rounded-3xl border border-stone-200/90 dark:border-stone-800 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-stone-100 dark:border-stone-800">
            <div>
              <h4 className="text-xs font-bold text-stone-900 dark:text-white flex items-center gap-1.5">
                <Target className="w-4 h-4 text-emerald-600" />
                四大维度推进均衡度与工时投入
              </h4>
              <p className="text-[11px] text-stone-500">工作 · 健康 · 财富 · 认知 四轮匀速驱动</p>
            </div>
          </div>

          <div className="space-y-3 pt-1">
            {dimensionStats.map((dim) => (
              <div key={dim.key} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-stone-800 dark:text-stone-200 flex items-center gap-1.5">
                    <span>{dim.meta.label}</span>
                    <span className="text-[10px] text-stone-400">({dim.projectsCount}个项目)</span>
                  </span>
                  <div className="flex items-center gap-2 text-stone-500 text-[11px]">
                    <span>{dim.totalHours}h/周</span>
                    <span className="font-bold text-stone-900 dark:text-white">{dim.avgProgress}%</span>
                  </div>
                </div>

                <div className="w-full bg-stone-100 dark:bg-stone-800 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-stone-900 dark:bg-stone-100 h-full rounded-full transition-all duration-300"
                    style={{ width: `${dim.avgProgress}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Execution Supervision Watchlist (确保能够完成机制) */}
      <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-200/90 dark:border-stone-800 p-5 sm:p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-stone-100 dark:border-stone-800">
          <div>
            <h4 className="text-sm font-bold text-stone-900 dark:text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              闭环监督台：确保关键目标不脱轨 ({attentionProjects.length})
            </h4>
            <p className="text-xs text-stone-500 mt-0.5">
              系统实时扫描停滞风险、假努力隐患与启动阻抗，防患于未然
            </p>
          </div>
        </div>

        {attentionProjects.length === 0 ? (
          <div className="py-6 text-center text-xs text-emerald-700 dark:text-emerald-400 flex items-center justify-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            所有高优项目与主线任务均在良性轨道推进中，动能良好！
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {attentionProjects.map((p) => (
              <div
                key={p.id}
                className="p-3.5 rounded-2xl border border-stone-200/90 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-800/40 flex items-start justify-between gap-3 text-xs"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-stone-900 dark:text-white truncate">
                      {p.title}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-semibold whitespace-nowrap">
                      {p.status === 'needs_attention' ? '遇阻停滞' : '进度偏低'}
                    </span>
                  </div>
                  <p className="text-stone-500 line-clamp-1">
                    当前最小第一击：{p.nextMicroAction || '未定义'}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => onOpenCorrection(p)}
                  className="px-3 py-1 rounded-xl bg-stone-900 text-white dark:bg-white dark:text-stone-950 text-[11px] font-semibold flex items-center gap-1 shrink-0 hover:opacity-90"
                >
                  教练纠偏
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
