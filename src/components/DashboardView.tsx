import React, { useState } from 'react';
import { LifeProject, DailyLog, LifeWheelScores } from '../types';
import { ProjectCard } from './ProjectCard';
import { LifeWheelRadar } from './LifeWheelRadar';
import {
  Sparkles,
  Zap,
  Flame,
  CheckCircle2,
  Circle,
  Plus,
  Battery,
  Clock,
  ArrowRight,
  TrendingUp,
  Target,
} from 'lucide-react';

interface Props {
  projects: LifeProject[];
  logs: DailyLog[];
  wheelScores: LifeWheelScores;
  onUpdateProject: (updated: LifeProject) => void;
  onDeleteProject: (id: string) => void;
  onDiagnoseProject: (project: LifeProject) => void;
  onOpenCoachChat: (project?: LifeProject) => void;
  onEditProject: (project: LifeProject) => void;
  onOpenNewProject: () => void;
  onOpenNewLog: () => void;
  onUpdateWheelScores: (scores: LifeWheelScores) => void;
  onNavigateToProjects: () => void;
  onNavigateToReview: () => void;
}

export const DashboardView: React.FC<Props> = ({
  projects,
  logs,
  wheelScores,
  onUpdateProject,
  onDeleteProject,
  onDiagnoseProject,
  onOpenCoachChat,
  onEditProject,
  onOpenNewProject,
  onOpenNewLog,
  onUpdateWheelScores,
  onNavigateToProjects,
  onNavigateToReview,
}) => {
  // Completed micro actions tracked locally
  const [completedActions, setCompletedActions] = useState<Record<string, boolean>>({});

  const toggleMicroAction = (projectId: string) => {
    setCompletedActions((prev) => ({
      ...prev,
      [projectId]: !prev[projectId],
    }));
  };

  const sprintingProjects = projects.filter((p) => p.status === 'sprinting');
  const highPriorityProjects = projects.filter((p) => p.priority === 'high' && p.status !== 'completed');
  const displayProjects = sprintingProjects.length > 0 ? sprintingProjects : highPriorityProjects.slice(0, 3);

  const totalWeeklyHours = projects
    .filter((p) => p.status !== 'completed' && p.status !== 'paused')
    .reduce((sum, p) => sum + (p.weeklyHours || 0), 0);

  const completedProjectsCount = projects.filter((p) => p.status === 'completed').length;
  const activeProjectsCount = projects.filter((p) => p.status !== 'completed').length;

  const latestLog = logs[0];

  return (
    <div className="space-y-6">
      {/* Hero Coach Motivation & Daily High-Leverage Nudge */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 text-white rounded-3xl p-6 sm:p-8 shadow-sm relative overflow-hidden border border-slate-800">
        <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 w-72 h-72 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          <div className="lg:col-span-8 space-y-3">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                全景生命监督与教练中枢
              </span>
              <span className="text-xs text-slate-400">
                {new Date().toLocaleDateString('zh-CN', {
                  month: 'long',
                  day: 'numeric',
                  weekday: 'long',
                })}
              </span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              把有限的心力，聚焦在不可妥协的进化上
            </h2>

            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-xl">
              当前监督中的 <strong className="text-emerald-400 font-bold">{activeProjectsCount}</strong> 个活跃项目中，有{' '}
              <strong className="text-orange-400 font-bold">{sprintingProjects.length}</strong> 个处于高烈度冲刺阶段。
              每周预估投入 {totalWeeklyHours} 小时。保护好你的睡眠与晨间第一专注块。
            </p>

            <div className="pt-2 flex flex-wrap gap-2.5">
              <button
                type="button"
                onClick={onOpenNewLog}
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition flex items-center gap-1.5 shadow"
              >
                <Plus className="w-4 h-4" />
                今日觉察与打卡
              </button>

              <button
                type="button"
                onClick={() => onOpenCoachChat()}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium text-xs transition flex items-center gap-1.5 border border-white/10"
              >
                <Sparkles className="w-4 h-4 text-emerald-400" />
                唤起全天候教练研讨
              </button>

              <button
                type="button"
                onClick={onNavigateToReview}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-medium text-xs transition flex items-center gap-1.5 border border-white/10"
              >
                <TrendingUp className="w-4 h-4 text-amber-400" />
                查看复盘报告
              </button>
            </div>
          </div>

          {/* Quick Snapshot Counter Cards */}
          <div className="lg:col-span-4 grid grid-cols-2 gap-3">
            <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10">
              <div className="text-[11px] text-slate-400">正在冲刺项目</div>
              <div className="text-xl font-bold text-white mt-1 flex items-center gap-1.5">
                <Flame className="w-5 h-5 text-orange-400" />
                <span>{sprintingProjects.length}</span>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10">
              <div className="text-[11px] text-slate-400">已圆满达成</div>
              <div className="text-xl font-bold text-white mt-1 flex items-center gap-1.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <span>{completedProjectsCount}</span>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10">
              <div className="text-[11px] text-slate-400">每周投入预算</div>
              <div className="text-xl font-bold text-white mt-1 flex items-center gap-1.5">
                <Clock className="w-5 h-5 text-blue-400" />
                <span>{totalWeeklyHours}h</span>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10">
              <div className="text-[11px] text-slate-400">最近精力指数</div>
              <div className="text-xl font-bold text-white mt-1 flex items-center gap-1.5">
                <Battery className="w-5 h-5 text-amber-400" />
                <span>{latestLog ? `${latestLog.energyLevel}/5` : '充沛'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Two-Column Layout: Anti-Procrastination Actions & Life Wheel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Today's High-Leverage Micro-Actions Checklist */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-emerald-500 fill-current" />
                防拖延微行动锚点 (≤5分钟启动)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                每个关键项目的最小第一击，点击可直接勾选完成
              </p>
            </div>
          </div>

          <div className="space-y-2">
            {projects
              .filter((p) => p.status !== 'completed' && p.status !== 'paused' && p.nextMicroAction)
              .map((project) => {
                const isChecked = !!completedActions[project.id];
                return (
                  <div
                    key={project.id}
                    onClick={() => toggleMicroAction(project.id)}
                    className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-start gap-2.5 ${
                      isChecked
                        ? 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 opacity-60'
                        : 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200/80 dark:border-emerald-800/60 hover:shadow-sm'
                    }`}
                  >
                    {isChecked ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <Circle className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0 mt-0.5" />
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                        <span className="truncate pr-1">{project.title}</span>
                        <span className="text-[10px] text-slate-400 whitespace-nowrap">
                          {project.progress}%
                        </span>
                      </div>
                      <p
                        className={`text-xs mt-0.5 leading-relaxed ${
                          isChecked
                            ? 'line-through text-slate-400'
                            : 'text-slate-700 dark:text-slate-300 font-medium'
                        }`}
                      >
                        {project.nextMicroAction}
                      </p>
                    </div>
                  </div>
                );
              })}
          </div>

          {latestLog && (
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
              <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                最近觉察记录 ({latestLog.date})
              </div>
              <p className="text-xs text-slate-700 dark:text-slate-300 italic">
                “{latestLog.highlight}”
              </p>
            </div>
          )}
        </div>

        {/* Right: Life Wheel Radar */}
        <div className="lg:col-span-7">
          <LifeWheelRadar scores={wheelScores} onChange={onUpdateWheelScores} />
        </div>
      </div>

      {/* Focus Projects Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <Target className="w-5 h-5 text-emerald-600" />
              当前聚焦攻坚项目 ({displayProjects.length})
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              高优先级或冲刺阶段的生命主线任务
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenNewProject}
              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition flex items-center gap-1 shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              开启新项目
            </button>
            <button
              type="button"
              onClick={onNavigateToProjects}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium text-xs hover:bg-slate-50 dark:hover:bg-slate-800 transition flex items-center gap-1"
            >
              查看全盘 ({projects.length})
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {displayProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onUpdate={onUpdateProject}
              onDelete={onDeleteProject}
              onDiagnose={onDiagnoseProject}
              onOpenCoachChat={onOpenCoachChat}
              onEdit={onEditProject}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
