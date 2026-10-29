import React, { useState } from 'react';
import { LifeProject, ProjectStatus } from '../types';
import { CATEGORY_CONFIG, PRIORITY_CONFIG, STATUS_CONFIG, ENERGY_CONFIG } from '../utils/categories';
import {
  Calendar,
  Clock,
  CheckCircle2,
  Circle,
  Stethoscope,
  MessageSquareQuote,
  MoreVertical,
  Edit2,
  Trash2,
  ChevronDown,
  ChevronUp,
  Flame,
  Zap,
} from 'lucide-react';

interface Props {
  project: LifeProject;
  onUpdate: (updated: LifeProject) => void;
  onDelete: (id: string) => void;
  onDiagnose: (project: LifeProject) => void;
  onOpenCoachChat: (project: LifeProject) => void;
  onEdit: (project: LifeProject) => void;
}

export const ProjectCard: React.FC<Props> = ({
  project,
  onUpdate,
  onDelete,
  onDiagnose,
  onOpenCoachChat,
  onEdit,
}) => {
  const [showMilestones, setShowMilestones] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const cat = CATEGORY_CONFIG[project.category] || CATEGORY_CONFIG.career;
  const pri = PRIORITY_CONFIG[project.priority] || PRIORITY_CONFIG.medium;
  const sta = STATUS_CONFIG[project.status] || STATUS_CONFIG.on_track;
  const ene = ENERGY_CONFIG[project.energyCost] || ENERGY_CONFIG.recharging;

  const completedMilestones = project.milestones.filter((m) => m.completed).length;
  const totalMilestones = project.milestones.length;

  const handleToggleMilestone = (milestoneId: string) => {
    const updatedMilestones = project.milestones.map((m) => {
      if (m.id === milestoneId) {
        return {
          ...m,
          completed: !m.completed,
          completedAt: !m.completed ? new Date().toISOString().split('T')[0] : undefined,
        };
      }
      return m;
    });

    // Auto calculate progress suggestion based on milestones if milestones exist
    const newCompletedCount = updatedMilestones.filter((m) => m.completed).length;
    const calculatedProgress =
      totalMilestones > 0 ? Math.round((newCompletedCount / totalMilestones) * 100) : project.progress;

    onUpdate({
      ...project,
      milestones: updatedMilestones,
      progress: calculatedProgress,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleStatusChange = (newStatus: ProjectStatus) => {
    onUpdate({
      ...project,
      status: newStatus,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleProgressChange = (newProgress: number) => {
    const clamped = Math.max(0, Math.min(100, newProgress));
    onUpdate({
      ...project,
      progress: clamped,
      status: clamped === 100 ? 'completed' : project.status === 'completed' ? 'on_track' : project.status,
      updatedAt: new Date().toISOString(),
    });
  };

  return (
    <div
      className={`relative rounded-2xl border bg-white dark:bg-slate-900 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden flex flex-col justify-between ${
        project.status === 'sprinting'
          ? 'border-orange-300/80 dark:border-orange-900/60 ring-1 ring-orange-200 dark:ring-orange-950'
          : project.status === 'needs_attention'
          ? 'border-amber-300/80 dark:border-amber-900/60'
          : 'border-slate-200/80 dark:border-slate-800'
      }`}
    >
      {/* Top Accent Strip */}
      <div className={`h-1.5 w-full ${cat.accent}`} />

      <div className="p-5 flex-1 flex flex-col justify-between">
        {/* Header meta */}
        <div>
          <div className="flex items-start justify-between gap-2 mb-2.5">
            <div className="flex items-center flex-wrap gap-1.5">
              <span
                className={`text-[11px] font-medium px-2 py-0.5 rounded-full border flex items-center gap-1 ${cat.bgLight} ${cat.borderColor} ${cat.textColor}`}
              >
                {cat.label}
              </span>
              <span
                className={`text-[11px] font-medium px-2 py-0.5 rounded-full border flex items-center gap-1 ${pri.badgeClass}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${pri.dotClass}`} />
                {pri.label}
              </span>
              <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${ene.badge}`}>
                {ene.icon} {ene.label}
              </span>
            </div>

            {/* Actions Menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowMenu(!showMenu)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                <MoreVertical className="w-4 h-4" />
              </button>

              {showMenu && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setShowMenu(false)} />
                  <div className="absolute right-0 mt-1 w-36 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-100 dark:border-slate-700 py-1 z-30 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setShowMenu(false);
                        onEdit(project);
                      }}
                      className="w-full text-left px-3 py-2 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 flex items-center gap-2"
                    >
                      <Edit2 className="w-3.5 h-3.5" /> 编辑项目
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowMenu(false);
                        if (confirm(`确定要移除项目「${project.title}」吗？`)) {
                          onDelete(project.id);
                        }
                      }}
                      className="w-full text-left px-3 py-2 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center gap-2"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> 移除归档
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Title and Description */}
          <h4 className="text-base font-bold text-slate-900 dark:text-white leading-snug tracking-tight mb-1.5">
            {project.title}
          </h4>
          <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed mb-3">
            {project.description || '暂无详细描述'}
          </p>

          {/* Status & Weekly Commitment row */}
          <div className="flex items-center justify-between text-xs mb-3.5">
            <select
              value={project.status}
              onChange={(e) => handleStatusChange(e.target.value as ProjectStatus)}
              className={`text-xs font-semibold px-2.5 py-1 rounded-lg border cursor-pointer focus:outline-none transition ${sta.bg} ${sta.color}`}
            >
              <option value="sprinting">🔥 冲刺攻坚</option>
              <option value="on_track">🌿 稳步推进</option>
              <option value="needs_attention">⚠️ 遇阻卡点</option>
              <option value="paused">⏸️ 战略冻结</option>
              <option value="completed">🏆 圆满达成</option>
            </select>

            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>{project.weeklyHours}h/周</span>
              </span>
              {project.targetDate && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>{project.targetDate.slice(5)}</span>
                </span>
              )}
            </div>
          </div>

          {/* Progress bar and quick adjust */}
          <div className="mb-4">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-slate-500 dark:text-slate-400 font-medium">进展完成度</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleProgressChange(project.progress - 5)}
                  className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
                  title="递减 5%"
                >
                  -5%
                </button>
                <span className="font-bold text-slate-800 dark:text-slate-100 min-w-8 text-right">
                  {project.progress}%
                </span>
                <button
                  type="button"
                  onClick={() => handleProgressChange(project.progress + 5)}
                  className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
                  title="增加 5%"
                >
                  +5%
                </button>
              </div>
            </div>
            <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
              <div
                className={`h-full transition-all duration-300 rounded-full ${
                  project.progress >= 100
                    ? 'bg-emerald-500'
                    : project.status === 'sprinting'
                    ? 'bg-gradient-to-r from-amber-500 to-orange-500'
                    : 'bg-emerald-600'
                }`}
                style={{ width: `${project.progress}%` }}
              />
            </div>
          </div>

          {/* Next Micro-Action (Anti-procrastination anchor) */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800/80 mb-3">
            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <Zap className="w-3.5 h-3.5 fill-current" />
                下个最小可执行行动 (≤5分钟)
              </span>
            </div>
            <p className="text-xs text-slate-800 dark:text-slate-200 font-medium leading-relaxed">
              {project.nextMicroAction || '点击右上角编辑，设定一个无痛启动微动作'}
            </p>
          </div>

          {/* Milestones toggle button */}
          {totalMilestones > 0 && (
            <div className="mb-2">
              <button
                type="button"
                onClick={() => setShowMilestones(!showMilestones)}
                className="w-full flex items-center justify-between py-1.5 px-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition"
              >
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  里程碑 ({completedMilestones}/{totalMilestones})
                </span>
                {showMilestones ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>

              {showMilestones && (
                <div className="mt-1.5 space-y-1.5 pl-1 pr-1 border-t border-slate-100 dark:border-slate-800 pt-2">
                  {project.milestones.map((milestone) => (
                    <div
                      key={milestone.id}
                      onClick={() => handleToggleMilestone(milestone.id)}
                      className="flex items-start gap-2 p-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer text-xs transition"
                    >
                      {milestone.completed ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                      ) : (
                        <Circle className="w-4 h-4 text-slate-300 dark:text-slate-600 shrink-0 mt-0.5" />
                      )}
                      <span
                        className={`leading-tight ${
                          milestone.completed
                            ? 'line-through text-slate-400 dark:text-slate-500'
                            : 'text-slate-700 dark:text-slate-200 font-medium'
                        }`}
                      >
                        {milestone.title}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Coach AI Action Buttons */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2">
          <button
            type="button"
            onClick={() => onDiagnose(project)}
            className="flex-1 py-1.5 px-3 rounded-xl text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60 transition flex items-center justify-center gap-1.5"
          >
            <Stethoscope className="w-3.5 h-3.5" />
            AI深度诊断
          </button>
          <button
            type="button"
            onClick={() => onOpenCoachChat(project)}
            className="flex-1 py-1.5 px-3 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 transition flex items-center justify-center gap-1.5"
          >
            <MessageSquareQuote className="w-3.5 h-3.5" />
            教练研讨
          </button>
        </div>
      </div>
    </div>
  );
};
