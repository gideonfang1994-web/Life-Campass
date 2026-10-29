import React, { useState } from 'react';
import { LifeProject, ProjectCategory, DailyLog } from '../types';
import { DIMENSIONS_CONFIG } from '../utils/categories';
import {
  Briefcase,
  Activity,
  TrendingUp,
  Brain,
  Sparkles,
  Plus,
  Play,
  CheckCircle2,
  Circle,
  Compass,
  ArrowRight,
  Clock,
  Zap,
  MoreVertical,
  Edit2,
  Trash2,
  Heart,
} from 'lucide-react';

interface Props {
  projects: LifeProject[];
  logs: DailyLog[];
  selectedCategory: ProjectCategory;
  onSelectCategory: (cat: ProjectCategory) => void;
  onUpdateProject: (updated: LifeProject) => void;
  onDeleteProject: (id: string) => void;
  onEditProject: (project: LifeProject) => void;
  onOpenNewProject: (defaultCategory?: ProjectCategory) => void;
  onOpenFocusTimer: (project: LifeProject) => void;
  onOpenCorrection: (project: LifeProject) => void;
  onOpenCoachChat: (project?: LifeProject) => void;
}

export const DimensionHubView: React.FC<Props> = ({
  projects,
  logs,
  selectedCategory,
  onSelectCategory,
  onUpdateProject,
  onDeleteProject,
  onEditProject,
  onOpenNewProject,
  onOpenFocusTimer,
  onOpenCorrection,
  onOpenCoachChat,
}) => {
  const currentDim = DIMENSIONS_CONFIG[selectedCategory] || DIMENSIONS_CONFIG.career;
  const dimensionProjects = projects.filter((p) => p.category === selectedCategory);

  const completedCount = dimensionProjects.filter((p) => p.status === 'completed').length;
  const activeCount = dimensionProjects.filter((p) => p.status !== 'completed').length;
  const avgProgress =
    dimensionProjects.length > 0
      ? Math.round(
          dimensionProjects.reduce((sum, p) => sum + p.progress, 0) / dimensionProjects.length
        )
      : 0;

  const totalWeeklyHours = dimensionProjects
    .filter((p) => p.status !== 'completed')
    .reduce((sum, p) => sum + (p.weeklyHours || 0), 0);

  const handleToggleMilestone = (project: LifeProject, milestoneId: string) => {
    const updatedMilestones = project.milestones.map((m) =>
      m.id === milestoneId ? { ...m, completed: !m.completed } : m
    );
    const completedMCount = updatedMilestones.filter((m) => m.completed).length;
    const newProgress =
      updatedMilestones.length > 0
        ? Math.round((completedMCount / updatedMilestones.length) * 100)
        : project.progress;

    onUpdateProject({
      ...project,
      milestones: updatedMilestones,
      progress: newProgress,
      status: newProgress >= 100 ? 'completed' : project.status === 'completed' ? 'on_track' : project.status,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleQuickProgress = (project: LifeProject, delta: number) => {
    const nextVal = Math.min(100, Math.max(0, project.progress + delta));
    onUpdateProject({
      ...project,
      progress: nextVal,
      status: nextVal === 100 ? 'completed' : project.status === 'completed' ? 'on_track' : project.status,
      updatedAt: new Date().toISOString(),
    });
  };

  // Primary 4 dimensions + 2 secondary
  const primaryKeys: ProjectCategory[] = ['career', 'health', 'wealth', 'mindset'];
  const secondaryKeys: ProjectCategory[] = ['relationship', 'creation'];

  const getDimensionIcon = (key: ProjectCategory) => {
    switch (key) {
      case 'career':
        return Briefcase;
      case 'health':
        return Activity;
      case 'wealth':
        return TrendingUp;
      case 'mindset':
        return Brain;
      case 'relationship':
        return Heart;
      case 'creation':
        return Sparkles;
      default:
        return Briefcase;
    }
  };

  return (
    <div className="space-y-6">
      {/* Dimension Switcher Tabs (Minimalist Segmented Control) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-200/80 dark:border-stone-800 pb-3">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          {primaryKeys.map((catKey) => {
            const meta = DIMENSIONS_CONFIG[catKey];
            const isSelected = selectedCategory === catKey;
            const Icon = getDimensionIcon(catKey);
            const pCount = projects.filter((p) => p.category === catKey).length;

            return (
              <button
                key={catKey}
                type="button"
                onClick={() => onSelectCategory(catKey)}
                className={`px-3.5 py-2 rounded-2xl text-xs font-semibold flex items-center gap-2 transition shrink-0 ${
                  isSelected
                    ? 'bg-stone-900 text-white dark:bg-white dark:text-stone-950 shadow-sm'
                    : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white hover:bg-stone-100 dark:hover:bg-stone-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{meta.label}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isSelected ? 'bg-white/20 text-white' : 'bg-stone-200/70 dark:bg-stone-800 text-stone-500'}`}>
                  {pCount}
                </span>
              </button>
            );
          })}

          <div className="h-4 w-px bg-stone-200 dark:bg-stone-700 mx-1 hidden sm:block" />

          {secondaryKeys.map((catKey) => {
            const meta = DIMENSIONS_CONFIG[catKey];
            const isSelected = selectedCategory === catKey;
            const Icon = getDimensionIcon(catKey);

            return (
              <button
                key={catKey}
                type="button"
                onClick={() => onSelectCategory(catKey)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition shrink-0 flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-stone-900 text-white dark:bg-white dark:text-stone-950'
                    : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
                }`}
              >
                <Icon className="w-3 h-3" />
                <span>{meta.label}</span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => onOpenNewProject(selectedCategory)}
          className="px-3.5 py-1.5 rounded-xl bg-stone-900 text-white dark:bg-white dark:text-stone-950 text-xs font-semibold flex items-center gap-1.5 hover:opacity-90 transition self-start sm:self-auto shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          构建本维度新目标
        </button>
      </div>

      {/* Dimension Hero Header: Mental Models & Coach Probing Question */}
      <div className="bg-stone-900 text-white rounded-3xl p-6 sm:p-7 space-y-4 border border-stone-800 shadow-sm relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-stone-400 font-medium mb-1">
              <span>{currentDim.enLabel}</span>
              <span>•</span>
              <span className="text-emerald-400">{currentDim.tagline}</span>
            </div>
            <h2 className="text-2xl font-bold tracking-tight">
              {currentDim.label} · 认知模型与任务拆解
            </h2>
          </div>

          {/* Quick Metrics */}
          <div className="flex items-center gap-4 text-xs bg-white/5 border border-white/10 px-4 py-2.5 rounded-2xl">
            <div>
              <span className="text-stone-400 block text-[10px]">推进中项目</span>
              <span className="text-base font-bold text-white">{activeCount}</span>
            </div>
            <div className="w-px h-6 bg-white/10" />
            <div>
              <span className="text-stone-400 block text-[10px]">平均完成度</span>
              <span className="text-base font-bold text-emerald-400">{avgProgress}%</span>
            </div>
            <div className="w-px h-6 bg-white/10" />
            <div>
              <span className="text-stone-400 block text-[10px]">每周预算工时</span>
              <span className="text-base font-bold text-amber-400">{totalWeeklyHours}h</span>
            </div>
          </div>
        </div>

        {/* Probing Coaching Question Card */}
        <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 text-xs text-stone-200 flex items-start gap-2.5">
          <Sparkles className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold text-emerald-300">人生教练灵魂提问：</span>
            <span className="italic ml-1">“{currentDim.northStarQuestion}”</span>
          </div>
          <button
            type="button"
            onClick={() => onOpenCoachChat()}
            className="text-[11px] font-semibold text-emerald-400 hover:underline flex items-center gap-0.5 shrink-0"
          >
            与教练研讨 <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        {/* Mental Models Pills */}
        <div className="flex items-center gap-1.5 flex-wrap pt-1 text-[11px]">
          <span className="text-stone-400 mr-1">推荐心法模型:</span>
          {currentDim.mentalModels.map((m, i) => (
            <span
              key={i}
              className="px-2.5 py-0.5 rounded-lg bg-white/10 text-stone-300 font-medium border border-white/5"
            >
              {m}
            </span>
          ))}
        </div>
      </div>

      {/* Projects List & Task Breakdown in this Dimension */}
      {dimensionProjects.length === 0 ? (
        <div className="py-16 text-center bg-white dark:bg-stone-900 rounded-3xl border border-stone-200 dark:border-stone-800 space-y-3">
          <Briefcase className="w-8 h-8 text-stone-300 dark:text-stone-700 mx-auto" />
          <p className="text-sm font-semibold text-stone-700 dark:text-stone-300">
            【{currentDim.label}】维度尚未构建任何单项工程
          </p>
          <p className="text-xs text-stone-400 max-w-sm mx-auto">
            点击下方按钮，定义你的北极星目标，由 AI 教练科学分解为阶梯任务与启动微行动。
          </p>
          <button
            type="button"
            onClick={() => onOpenNewProject(selectedCategory)}
            className="px-4 py-2 rounded-xl bg-stone-900 text-white dark:bg-white dark:text-stone-950 text-xs font-semibold hover:opacity-90 transition"
          >
            立即构建第一个目标
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {dimensionProjects.map((project) => {
            const completedMilestones = project.milestones.filter((m) => m.completed).length;
            const totalMilestones = project.milestones.length;

            return (
              <div
                key={project.id}
                className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-200/90 dark:border-stone-800 p-5 sm:p-6 shadow-sm space-y-4 transition hover:border-stone-300 dark:hover:border-stone-700"
              >
                {/* Project Header Bar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-stone-100 dark:border-stone-800/80">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300">
                        {project.priority === 'high' ? '🔴 高优主线' : '🟡 稳进支线'}
                      </span>
                      <span className="text-[11px] font-medium text-stone-500">
                        每周 {project.weeklyHours}h
                      </span>
                      {project.status === 'sprinting' && (
                        <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-full">
                          🔥 冲刺攻坚中
                        </span>
                      )}
                      {project.status === 'needs_attention' && (
                        <span className="text-[11px] font-semibold text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded-full">
                          ⚠️ 偏离需纠偏
                        </span>
                      )}
                    </div>
                    <h3 className="text-base font-bold text-stone-900 dark:text-white">
                      {project.title}
                    </h3>
                  </div>

                  {/* Top Action Buttons */}
                  <div className="flex items-center gap-1.5 self-end sm:self-auto">
                    <button
                      type="button"
                      onClick={() => onOpenFocusTimer(project)}
                      className="px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 text-xs font-semibold flex items-center gap-1 transition"
                      title="开启 25 分钟极简专注心流模式"
                    >
                      <Play className="w-3 h-3 fill-current text-emerald-600" />
                      心流专注
                    </button>

                    <button
                      type="button"
                      onClick={() => onOpenCorrection(project)}
                      className="px-3 py-1.5 rounded-xl border border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 text-xs font-semibold flex items-center gap-1 transition"
                      title="如果推进受阻，向教练申请诊断与路径重构"
                    >
                      <Compass className="w-3 h-3 text-amber-600" />
                      教练纠偏
                    </button>

                    <button
                      type="button"
                      onClick={() => onEditProject(project)}
                      className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`确定要移除「${project.title}」吗？`)) {
                          onDeleteProject(project.id);
                        }
                      }}
                      className="p-1.5 rounded-lg text-stone-400 hover:text-rose-600 hover:bg-rose-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Description & Criteria */}
                {project.description && (
                  <p className="text-xs text-stone-600 dark:text-stone-400 leading-relaxed">
                    {project.description}
                  </p>
                )}

                {/* Progress Bar & Quick Adjusters */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-medium text-stone-700 dark:text-stone-300">
                    <span className="flex items-center gap-1">
                      <span>推进完成度</span>
                      <span className="font-bold text-stone-900 dark:text-white">
                        {project.progress}%
                      </span>
                    </span>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleQuickProgress(project, -5)}
                        className="px-1.5 py-0.5 rounded text-[10px] bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-600"
                      >
                        -5%
                      </button>
                      <button
                        type="button"
                        onClick={() => handleQuickProgress(project, 5)}
                        className="px-1.5 py-0.5 rounded text-[10px] bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-600"
                      >
                        +5%
                      </button>
                    </div>
                  </div>

                  <div className="w-full bg-stone-100 dark:bg-stone-800 rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        project.progress >= 100
                          ? 'bg-emerald-600'
                          : project.status === 'sprinting'
                          ? 'bg-amber-600'
                          : 'bg-stone-900 dark:bg-stone-100'
                      }`}
                      style={{ width: `${project.progress}%` }}
                    />
                  </div>
                </div>

                {/* Anti-procrastination Micro Action */}
                <div className="p-3 rounded-2xl bg-stone-50 dark:bg-stone-800/50 border border-stone-200/80 dark:border-stone-700/80 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <Zap className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className="font-semibold text-stone-900 dark:text-stone-100 truncate">
                      当前最小第一击：{project.nextMicroAction || '点击编辑设定微小启动动作'}
                    </span>
                  </div>
                  <span className="text-[10px] font-medium text-stone-400 whitespace-nowrap ml-2">
                    ≤5分钟无痛启动
                  </span>
                </div>

                {/* Step-by-Step Task Breakdown / Milestones Checklist */}
                {totalMilestones > 0 && (
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center justify-between text-xs font-semibold text-stone-700 dark:text-stone-300">
                      <span>阶梯任务分解与里程碑 ({completedMilestones}/{totalMilestones})</span>
                    </div>

                    <div className="space-y-1.5">
                      {project.milestones.map((m) => (
                        <div
                          key={m.id}
                          onClick={() => handleToggleMilestone(project, m.id)}
                          className="flex items-start gap-2.5 p-2 rounded-xl hover:bg-stone-50 dark:hover:bg-stone-800/40 cursor-pointer text-xs transition"
                        >
                          {m.completed ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                          ) : (
                            <Circle className="w-4 h-4 text-stone-300 dark:text-stone-600 shrink-0 mt-0.5" />
                          )}
                          <span
                            className={`leading-relaxed ${
                              m.completed
                                ? 'line-through text-stone-400 dark:text-stone-500'
                                : 'text-stone-800 dark:text-stone-200 font-medium'
                            }`}
                          >
                            {m.title}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
