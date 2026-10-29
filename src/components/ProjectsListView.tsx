import React, { useState } from 'react';
import { LifeProject, ProjectCategory, ProjectStatus } from '../types';
import { ProjectCard } from './ProjectCard';
import { CATEGORY_CONFIG } from '../utils/categories';
import {
  FolderKanban,
  Plus,
  Search,
  SlidersHorizontal,
  Flame,
  CheckCircle2,
  Clock,
  Sparkles,
} from 'lucide-react';

interface Props {
  projects: LifeProject[];
  onUpdateProject: (updated: LifeProject) => void;
  onDeleteProject: (id: string) => void;
  onDiagnoseProject: (project: LifeProject) => void;
  onOpenCoachChat: (project?: LifeProject) => void;
  onEditProject: (project: LifeProject) => void;
  onOpenNewProject: () => void;
}

export const ProjectsListView: React.FC<Props> = ({
  projects,
  onUpdateProject,
  onDeleteProject,
  onDiagnoseProject,
  onOpenCoachChat,
  onEditProject,
  onOpenNewProject,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'priority' | 'progress' | 'targetDate'>('priority');

  const filtered = projects.filter((p) => {
    if (selectedCategory !== 'all' && p.category !== selectedCategory) return false;
    if (selectedStatus !== 'all' && p.status !== selectedStatus) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        p.title.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.nextMicroAction.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'priority') {
      const weight = { high: 3, medium: 2, low: 1 };
      return weight[b.priority] - weight[a.priority];
    }
    if (sortBy === 'progress') {
      return b.progress - a.progress;
    }
    if (sortBy === 'targetDate') {
      if (!a.targetDate) return 1;
      if (!b.targetDate) return -1;
      return a.targetDate.localeCompare(b.targetDate);
    }
    return 0;
  });

  return (
    <div className="space-y-6">
      {/* Top Banner & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <FolderKanban className="w-6 h-6 text-emerald-600" />
            人生项目监督矩阵
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            横跨六大生命维度，设定阶梯里程碑，拒绝假努力，实时追踪突破动能
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenNewProject}
          className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm transition flex items-center gap-2 shadow-sm self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          开启新的人生项目
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
        {/* Category Pill Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
          <button
            type="button"
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1.5 rounded-xl font-semibold transition shrink-0 ${
              selectedCategory === 'all'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            全部分类 ({projects.length})
          </button>

          {(Object.keys(CATEGORY_CONFIG) as ProjectCategory[]).map((cKey) => {
            const count = projects.filter((p) => p.category === cKey).length;
            const isSelected = selectedCategory === cKey;
            const cInfo = CATEGORY_CONFIG[cKey];
            return (
              <button
                key={cKey}
                type="button"
                onClick={() => setSelectedCategory(cKey)}
                className={`px-3 py-1.5 rounded-xl font-semibold transition shrink-0 flex items-center gap-1.5 border ${
                  isSelected
                    ? `${cInfo.bgLight} ${cInfo.borderColor} ${cInfo.textColor} ring-1 ring-current`
                    : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                }`}
              >
                <span>{cInfo.label}</span>
                <span className="text-[10px] opacity-75">({count})</span>
              </button>
            );
          })}
        </div>

        {/* Search, Status & Sorting Bar */}
        <div className="flex flex-col sm:flex-row items-center gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索项目名称、愿景描述或最小行动..."
              className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {/* Status Filter */}
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none flex-1 sm:flex-initial"
            >
              <option value="all">全部推进状态</option>
              <option value="sprinting">🔥 冲刺攻坚</option>
              <option value="on_track">🌿 稳步推进</option>
              <option value="needs_attention">⚠️ 遇阻卡点</option>
              <option value="paused">⏸️ 战略冻结</option>
              <option value="completed">🏆 圆满达成</option>
            </select>

            {/* Sort Select */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none flex-1 sm:flex-initial"
            >
              <option value="priority">按战略优先级</option>
              <option value="progress">按完成度进度</option>
              <option value="targetDate">按截止日期</option>
            </select>
          </div>
        </div>
      </div>

      {/* Projects Grid */}
      {sorted.length === 0 ? (
        <div className="py-20 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 text-center space-y-3">
          <FolderKanban className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto" />
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
            没有找到匹配的人生项目
          </p>
          <p className="text-xs text-slate-400">
            尝试更换筛选条件，或者点击上方按钮创建新项目
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {sorted.map((project) => (
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
      )}
    </div>
  );
};
