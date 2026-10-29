import React, { useState, useEffect } from 'react';
import { LifeProject, ProjectCategory, ProjectPriority, ProjectStatus, EnergyCost, Milestone } from '../types';
import { requestSmartBreakdown } from '../services/api';
import { X, Sparkles, Plus, Trash2, Loader2, Lightbulb } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: (project: LifeProject) => void;
  initialProject?: LifeProject | null;
  defaultCategory?: ProjectCategory;
}

export const ProjectModal: React.FC<Props> = ({ isOpen, onClose, onSave, initialProject, defaultCategory }) => {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<ProjectCategory>(defaultCategory || 'career');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<ProjectPriority>('high');
  const [status, setStatus] = useState<ProjectStatus>('on_track');
  const [energyCost, setEnergyCost] = useState<EnergyCost>('recharging');
  const [weeklyHours, setWeeklyHours] = useState<number>(3);
  const [targetDate, setTargetDate] = useState('');
  const [mentalModel, setMentalModel] = useState('');
  const [successCriteria, setSuccessCriteria] = useState('');
  const [nextMicroAction, setNextMicroAction] = useState('');
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [newMilestoneText, setNewMilestoneText] = useState('');
  const [isAiBreakingDown, setIsAiBreakingDown] = useState(false);
  const [coachTip, setCoachTip] = useState<string | null>(null);

  useEffect(() => {
    if (initialProject) {
      setTitle(initialProject.title);
      setCategory(initialProject.category);
      setDescription(initialProject.description);
      setPriority(initialProject.priority);
      setStatus(initialProject.status);
      setEnergyCost(initialProject.energyCost);
      setWeeklyHours(initialProject.weeklyHours || 3);
      setTargetDate(initialProject.targetDate || '');
      setMentalModel(initialProject.mentalModel || '');
      setSuccessCriteria(initialProject.successCriteria || '');
      setNextMicroAction(initialProject.nextMicroAction || '');
      setMilestones(initialProject.milestones || []);
      setCoachTip(null);
    } else {
      setTitle('');
      setCategory(defaultCategory || 'career');
      setDescription('');
      setPriority('high');
      setStatus('on_track');
      setEnergyCost('recharging');
      setWeeklyHours(3);
      setTargetDate('');
      setMentalModel('');
      setSuccessCriteria('');
      setNextMicroAction('');
      setMilestones([]);
      setCoachTip(null);
    }
  }, [initialProject, defaultCategory, isOpen]);

  if (!isOpen) return null;

  const handleAddMilestone = () => {
    if (!newMilestoneText.trim()) return;
    setMilestones([
      ...milestones,
      {
        id: 'm-' + Date.now(),
        title: newMilestoneText.trim(),
        completed: false,
      },
    ]);
    setNewMilestoneText('');
  };

  const handleRemoveMilestone = (id: string) => {
    setMilestones(milestones.filter((m) => m.id !== id));
  };

  const handleAiBreakdown = async () => {
    if (!title.trim()) {
      alert('请先输入项目/目标名称，便于AI教练进行精准拆解');
      return;
    }

    setIsAiBreakingDown(true);
    try {
      const data = await requestSmartBreakdown(title, category, description);
      if (data.milestones && data.milestones.length > 0) {
        setMilestones(
          data.milestones.map((m, idx) => ({
            id: `m-ai-${Date.now()}-${idx}`,
            title: m.title,
            completed: false,
            targetDays: m.targetDays,
          }))
        );
      }
      if (data.nextMicroAction) {
        setNextMicroAction(data.nextMicroAction);
      }
      if (data.coachTip) {
        setCoachTip(data.coachTip);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsAiBreakingDown(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const completedCount = milestones.filter((m) => m.completed).length;
    const initialProgress =
      initialProject?.progress !== undefined
        ? initialProject.progress
        : milestones.length > 0
        ? Math.round((completedCount / milestones.length) * 100)
        : 0;

    const project: LifeProject = {
      id: initialProject?.id || 'proj-' + Date.now(),
      title: title.trim(),
      category,
      description: description.trim(),
      priority,
      status,
      progress: initialProgress,
      energyCost,
      weeklyHours: Number(weeklyHours) || 1,
      targetDate: targetDate || undefined,
      mentalModel: mentalModel.trim() || undefined,
      successCriteria: successCriteria.trim() || undefined,
      nextMicroAction: nextMicroAction.trim(),
      milestones,
      checkins: initialProject?.checkins || [],
      createdAt: initialProject?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onSave(project);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-2xl my-8 overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
              <Sparkles className="w-5 h-5" />
            </span>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {initialProject ? '编辑人生项目' : '开启新的人生项目 / 进化愿景'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                定义清晰的北极星指标、里程碑梯度与防拖延微行动
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              项目名称 <span className="text-rose-500">*</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例如：上线独立SaaS产品、半马1h55m完赛、建立资产定投系统"
                className="flex-1 px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                type="button"
                onClick={handleAiBreakdown}
                disabled={isAiBreakingDown || !title.trim()}
                className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:opacity-90 disabled:opacity-50 transition flex items-center gap-1.5 shrink-0"
              >
                {isAiBreakingDown ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    拆解中...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    AI拆解里程碑
                  </>
                )}
              </button>
            </div>
          </div>

          {coachTip && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-200 flex items-start gap-2">
              <Lightbulb className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">教练提示：</span>
                {coachTip}
              </div>
            </div>
          )}

          {/* Category & Priority Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                生命维度分类
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ProjectCategory)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="career">💼 事业与技能</option>
                <option value="health">🏃 身体与健康</option>
                <option value="wealth">💰 财富与自由</option>
                <option value="mindset">🧠 心智与认知</option>
                <option value="relationship">❤️ 关系与家庭</option>
                <option value="creation">🎨 创造与热爱</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                战略优先级
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as ProjectPriority)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="high">🔴 高优主线 (聚焦攻坚)</option>
                <option value="medium">🟡 稳进支线 (按部就班)</option>
                <option value="low">⚪ 低频探索 (弹性体验)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                能量属性
              </label>
              <select
                value={energyCost}
                onChange={(e) => setEnergyCost(e.target.value as EnergyCost)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="recharging">🔋 充电滋养 (做完心流愉悦)</option>
                <option value="balanced">⚖️ 平衡中性 (正常精力支出)</option>
                <option value="draining">⚡ 高负荷消耗 (需要高心力)</option>
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              单项工程愿景与目标定位
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="为什么要做这件事？完成后会给生活带来什么实质性的改变？"
              className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Mental Model & Success Criteria */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                指导心法 / 认知模型 (可选)
              </label>
              <input
                type="text"
                value={mentalModel}
                onChange={(e) => setMentalModel(e.target.value)}
                placeholder="例如：深度工作法、MAF180、费曼学习法、被动定投"
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                成功交付与验收标准 (DoD)
              </label>
              <input
                type="text"
                value={successCriteria}
                onChange={(e) => setSuccessCriteria(e.target.value)}
                placeholder="例如：完赛净成绩进1h55m；首月MRR突破1000美元"
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Time & Target Date */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                每周计划投入 (小时)
              </label>
              <input
                type="number"
                min="0.5"
                max="80"
                step="0.5"
                value={weeklyHours}
                onChange={(e) => setWeeklyHours(parseFloat(e.target.value))}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                目标达成日期 (可选)
              </label>
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                推进状态
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ProjectStatus)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="sprinting">🔥 冲刺攻坚</option>
                <option value="on_track">🌿 稳步推进</option>
                <option value="needs_attention">⚠️ 遇阻卡点</option>
                <option value="paused">⏸️ 战略冻结</option>
                <option value="completed">🏆 圆满达成</option>
              </select>
            </div>
          </div>

          {/* Next Micro-Action */}
          <div>
            <label className="block text-xs font-semibold text-emerald-700 dark:text-emerald-400 mb-1">
              ⚡ 当前最小可执行行动 (≤5分钟，消除启动阻抗)
            </label>
            <input
              type="text"
              value={nextMicroAction}
              onChange={(e) => setNextMicroAction(e.target.value)}
              placeholder="例如：打开跑鞋柜、创建代码仓库、读第一页书、发微信确认时间"
              className="w-full px-3.5 py-2 text-xs rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/20 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
            />
          </div>

          {/* Milestones list */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              阶段性里程碑阶梯 ({milestones.length})
            </label>
            <div className="space-y-1.5 mb-2">
              {milestones.map((milestone, idx) => (
                <div
                  key={milestone.id}
                  className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 text-xs"
                >
                  <span className="flex items-center gap-2 text-slate-800 dark:text-slate-200 font-medium">
                    <span className="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 flex items-center justify-center text-[10px] font-bold">
                      {idx + 1}
                    </span>
                    <span>{milestone.title}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveMilestone(milestone.id)}
                    className="text-slate-400 hover:text-rose-500 p-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Add new milestone */}
            <div className="flex gap-2">
              <input
                type="text"
                value={newMilestoneText}
                onChange={(e) => setNewMilestoneText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddMilestone();
                  }
                }}
                placeholder="添加具体里程碑..."
                className="flex-1 px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                type="button"
                onClick={handleAddMilestone}
                className="px-3 py-1.5 text-xs rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 font-medium flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> 添加
              </button>
            </div>
          </div>

          {/* Form Actions */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              取消
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition"
            >
              {initialProject ? '保存更新' : '立即创建项目'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
