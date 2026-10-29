import React, { useState } from 'react';
import { LifeProject, DailyLog, LifeWheelScores } from '../types';
import { ProjectCard } from './ProjectCard';
import { LifeWheelRadar } from './LifeWheelRadar';
import { VisualAnalyticsView } from './VisualAnalyticsView';
import { DIMENSIONS_CONFIG } from '../utils/categories';
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
  Briefcase,
  Activity,
  Brain,
  ShieldCheck,
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
  onOpenCorrection?: (project: LifeProject) => void;
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
  onOpenCorrection,
  onUpdateWheelScores,
  onNavigateToProjects,
  onNavigateToReview,
}) => {
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

  const completedProjectsCount = projects.filter((p) => p.status === 'completed').length;
  const activeProjectsCount = projects.filter((p) => p.status !== 'completed').length;

  const coreDims = ['career', 'health', 'wealth', 'mindset'] as const;

  return (
    <div className="space-y-6">
      {/* 4 Core Dimensions Fast-Glance Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {coreDims.map((dimKey) => {
          const cfg = DIMENSIONS_CONFIG[dimKey];
          const dimProjs = projects.filter((p) => p.category === dimKey);
          const avg =
            dimProjs.length > 0
              ? Math.round(dimProjs.reduce((s, p) => s + p.progress, 0) / dimProjs.length)
              : 0;

          return (
            <div
              key={dimKey}
              onClick={onNavigateToProjects}
              className="p-4 rounded-3xl bg-white dark:bg-stone-900 border border-stone-200/90 dark:border-stone-800 shadow-sm cursor-pointer hover:border-stone-400 dark:hover:border-stone-600 transition flex flex-col justify-between space-y-2 group"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-stone-900 dark:text-white group-hover:text-emerald-600 transition">
                  {cfg.label}
                </span>
                <span className="text-[10px] text-stone-400 font-medium">
                  {dimProjs.length}个项目
                </span>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-stone-500">
                  <span>均进展</span>
                  <span className="font-bold text-stone-800 dark:text-stone-200">{avg}%</span>
                </div>
                <div className="w-full bg-stone-100 dark:bg-stone-800 rounded-full h-1 overflow-hidden">
                  <div
                    className="bg-stone-900 dark:bg-stone-100 h-full rounded-full transition-all"
                    style={{ width: `${avg}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Visual Analytics & Execution Supervision */}
      <VisualAnalyticsView
        projects={projects}
        logs={logs}
        wheelScores={wheelScores}
        onOpenCoachChat={onOpenCoachChat}
        onOpenCorrection={onOpenCorrection || onDiagnoseProject}
      />

      {/* Two-Column: Anti-procrastination micro-actions & Life Wheel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Anti-procrastination Micro-Action Checklist */}
        <div className="lg:col-span-5 bg-white dark:bg-stone-900 rounded-3xl border border-stone-200/90 dark:border-stone-800 p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-stone-100 dark:border-stone-800">
            <h4 className="text-xs font-bold text-stone-900 dark:text-white flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-emerald-600 fill-current" />
              今日防拖延微行动锚点 (≤5分钟无痛启动)
            </h4>
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
                        ? 'bg-stone-50 dark:bg-stone-800/40 border-stone-200 dark:border-stone-800 opacity-60'
                        : 'bg-stone-50/70 dark:bg-stone-800/50 border-stone-200/80 dark:border-stone-700/80 hover:shadow-sm'
                    }`}
                  >
                    {isChecked ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <Circle className="w-4 h-4 text-stone-400 dark:text-stone-500 shrink-0 mt-0.5" />
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-stone-800 dark:text-stone-200 flex items-center justify-between">
                        <span className="truncate pr-1">{project.title}</span>
                        <span className="text-[10px] text-stone-400 whitespace-nowrap">
                          {project.progress}%
                        </span>
                      </div>
                      <p
                        className={`text-xs mt-0.5 leading-relaxed ${
                          isChecked
                            ? 'line-through text-stone-400'
                            : 'text-stone-700 dark:text-stone-300 font-medium'
                        }`}
                      >
                        {project.nextMicroAction}
                      </p>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        {/* Right: Life Wheel Radar */}
        <div className="lg:col-span-7">
          <LifeWheelRadar scores={wheelScores} onChange={onUpdateWheelScores} />
        </div>
      </div>

      {/* Focus Sprints Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-stone-900 dark:text-white flex items-center gap-2">
              <Target className="w-4 h-4 text-emerald-600" />
              冲刺攻坚主线项目 ({displayProjects.length})
            </h3>
            <p className="text-xs text-stone-500">高优先级或冲刺攻坚中的关键交付物</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenNewProject}
              className="px-3 py-1.5 rounded-xl bg-stone-900 text-white dark:bg-white dark:text-stone-950 font-semibold text-xs transition flex items-center gap-1 shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              新建目标
            </button>
            <button
              type="button"
              onClick={onNavigateToProjects}
              className="px-3 py-1.5 rounded-xl border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300 text-xs hover:bg-stone-50 dark:hover:bg-stone-800 transition flex items-center gap-1"
            >
              四大维度分解 &rarr;
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
