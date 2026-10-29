import React, { useState } from 'react';
import { PlanActualRecord, LifeProject, ProjectCategory } from '../types';
import { DIMENSIONS_CONFIG } from '../utils/categories';
import {
  Target,
  ArrowRight,
  TrendingUp,
  Clock,
  Plus,
  Trash2,
  Edit2,
  Sparkles,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Scale,
  Brain,
  Layers,
  ChevronRight,
} from 'lucide-react';

interface Props {
  records: PlanActualRecord[];
  projects: LifeProject[];
  onAddRecord: (record: PlanActualRecord) => void;
  onUpdateRecord: (record: PlanActualRecord) => void;
  onDeleteRecord: (id: string) => void;
  onOpenCoachChat: (prompt?: string) => void;
}

export const PlanVsActualView: React.FC<Props> = ({
  records,
  projects,
  onAddRecord,
  onUpdateRecord,
  onDeleteRecord,
  onOpenCoachChat,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<PlanActualRecord | null>(null);

  // Form states
  const todayStr = new Date().toISOString().split('T')[0];
  const [date, setDate] = useState(todayStr);
  const [dimension, setDimension] = useState<ProjectCategory>('career');
  const [projectId, setProjectId] = useState<string>('');
  const [oneThingGoal, setOneThingGoal] = useState('');
  const [plannedHours, setPlannedHours] = useState<number>(3.0);
  const [plannedOutput, setPlannedOutput] = useState('');
  const [actualAction, setActualAction] = useState('');
  const [actualHours, setActualHours] = useState<number>(3.0);
  const [actualOutput, setActualOutput] = useState('');
  const [fulfillmentRate, setFulfillmentRate] = useState<number>(90);
  const [deviationReason, setDeviationReason] = useState('');
  const [leverageType, setLeverageType] = useState<'high_leverage' | 'neutral' | 'low_leverage'>('high_leverage');

  // Stats
  const avgFulfillment =
    records.length > 0
      ? Math.round(records.reduce((s, r) => s + r.fulfillmentRate, 0) / records.length)
      : 0;

  const totalActualHours = records.reduce((s, r) => s + r.actualHours, 0);
  const highLeverageCount = records.filter((r) => r.leverageType === 'high_leverage').length;
  const highLeverageRate = records.length > 0 ? Math.round((highLeverageCount / records.length) * 100) : 0;

  const handleOpenAdd = () => {
    setEditingRecord(null);
    setDate(todayStr);
    setDimension('career');
    setProjectId(projects[0]?.id || '');
    setOneThingGoal('');
    setPlannedHours(3.0);
    setPlannedOutput('');
    setActualAction('');
    setActualHours(3.0);
    setActualOutput('');
    setFulfillmentRate(85);
    setDeviationReason('');
    setLeverageType('high_leverage');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (rec: PlanActualRecord) => {
    setEditingRecord(rec);
    setDate(rec.date);
    setDimension(rec.dimension);
    setProjectId(rec.projectId || '');
    setOneThingGoal(rec.oneThingGoal);
    setPlannedHours(rec.plannedHours);
    setPlannedOutput(rec.plannedOutput);
    setActualAction(rec.actualAction);
    setActualHours(rec.actualHours);
    setActualOutput(rec.actualOutput);
    setFulfillmentRate(rec.fulfillmentRate);
    setDeviationReason(rec.deviationReason || '');
    setLeverageType(rec.leverageType);
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!oneThingGoal.trim()) return;

    const record: PlanActualRecord = {
      id: editingRecord?.id || 'pa-' + Date.now(),
      date,
      dimension,
      projectId: projectId || undefined,
      oneThingGoal: oneThingGoal.trim(),
      plannedHours: Number(plannedHours) || 1,
      plannedOutput: plannedOutput.trim(),
      actualAction: actualAction.trim() || '按计划执行',
      actualHours: Number(actualHours) || Number(plannedHours) || 1,
      actualOutput: actualOutput.trim() || plannedOutput.trim(),
      fulfillmentRate: Number(fulfillmentRate),
      deviationReason: deviationReason.trim(),
      leverageType,
      coachTip: editingRecord?.coachTip || (leverageType === 'high_leverage' ? '专注高杠杆多米诺骨牌，持续保持！' : '警惕低杠杆伪努力，重置时间块。'),
      createdAt: editingRecord?.createdAt || new Date().toISOString(),
    };

    if (editingRecord) {
      onUpdateRecord(record);
    } else {
      onAddRecord(record);
    }

    setIsModalOpen(false);
  };

  return (
    <div className="space-y-8">
      {/* Mental Models Wisdom Banner: The ONE Thing & Naval Ravikant */}
      <div className="bg-stone-900 text-white rounded-3xl p-7 sm:p-9 border border-stone-800 shadow-sm relative overflow-hidden">
        <div className="max-w-3xl space-y-3 relative z-10">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 font-bold text-xs uppercase tracking-wider flex items-center gap-1.5">
              <Target className="w-4 h-4" />
              《最重要的事只有一件》 × 《纳瓦尔宝典》实绩对照法则
            </span>
          </div>

          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            聚焦唯一核心事项 · 审查真实交付与杠杆
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 text-xs sm:text-sm text-stone-300 leading-relaxed">
            <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-1">
              <span className="font-bold text-emerald-400 block text-xs">🎯 The ONE Thing 聚焦提问：</span>
              <p className="italic">
                “做哪一件最重要的事，能让其他事情变得更容易，或者不再重要？”
              </p>
            </div>
            <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 space-y-1">
              <span className="font-bold text-amber-400 block text-xs">⚖️ 纳瓦尔判断力法则：</span>
              <p className="italic">
                “努力的程度远远不如选择的方向重要。审查你的工作是否正在构建无许可资产。”
              </p>
            </div>
          </div>

          <div className="pt-2 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleOpenAdd}
              className="px-5 py-2.5 rounded-2xl bg-white text-stone-950 font-bold text-sm hover:bg-stone-100 transition flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              记录今日「计划 vs 实际实绩」
            </button>

            <button
              type="button"
              onClick={() => onOpenCoachChat('教练，我想基于《最重要的事只有一件》和《纳瓦尔宝典》，对我的计划与实际工作做一次深度偏差审查，帮我识别假努力与低杠杆陷阱。')}
              className="px-4 py-2.5 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-medium text-xs sm:text-sm border border-white/10 transition flex items-center gap-1.5"
            >
              <Sparkles className="w-4 h-4 text-emerald-400" />
              向人生教练申请实绩审查
            </button>
          </div>
        </div>
      </div>

      {/* Top Level Summary Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-stone-900 p-5 rounded-3xl border border-stone-200/90 dark:border-stone-800 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
              计划达成吻合度
            </span>
            <div className="text-2xl font-extrabold text-stone-900 dark:text-white mt-1">
              {avgFulfillment}%
            </div>
            <span className="text-[11px] text-stone-400">计划意图与实际落地匹配率</span>
          </div>
          <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600">
            <Scale className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-stone-900 p-5 rounded-3xl border border-stone-200/90 dark:border-stone-800 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
              高杠杆工时占比
            </span>
            <div className="text-2xl font-extrabold text-stone-900 dark:text-white mt-1">
              {highLeverageRate}%
            </div>
            <span className="text-[11px] text-stone-400">纳瓦尔代码/媒体/自动化资产</span>
          </div>
          <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/60 text-amber-600">
            <Zap className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white dark:bg-stone-900 p-5 rounded-3xl border border-stone-200/90 dark:border-stone-800 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
              累计深度工时
            </span>
            <div className="text-2xl font-extrabold text-stone-900 dark:text-white mt-1">
              {totalActualHours}h
            </div>
            <span className="text-[11px] text-stone-400">已保护并沉淀的专注时间块</span>
          </div>
          <div className="p-3 rounded-2xl bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300">
            <Clock className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Plan vs Actual Comparison Records Feed */}
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-stone-900 dark:text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-emerald-600" />
              计划与实绩对照档案 ({records.length})
            </h3>
            <p className="text-xs text-stone-500 mt-0.5">
              对比“初衷计划”与“实际交付”，识别注意力的真实去向与偏差阻力
            </p>
          </div>

          <button
            type="button"
            onClick={handleOpenAdd}
            className="px-4 py-2 rounded-xl bg-stone-900 text-white dark:bg-white dark:text-stone-950 text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            新建对照记录
          </button>
        </div>

        {records.length === 0 ? (
          <div className="py-20 text-center bg-white dark:bg-stone-900 rounded-3xl border border-stone-200 dark:border-stone-800 space-y-3">
            <Scale className="w-10 h-10 text-stone-300 dark:text-stone-700 mx-auto" />
            <p className="text-sm font-semibold text-stone-700 dark:text-stone-300">
              暂无计划与实绩对照记录
            </p>
            <p className="text-xs text-stone-400 max-w-sm mx-auto">
              每天开启工作前先写下唯一最重要的事，收工时对照实际交付，逐步杜绝假努力。
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {records.map((rec) => {
              const dimCfg = DIMENSIONS_CONFIG[rec.dimension] || DIMENSIONS_CONFIG.career;
              const relatedProject = projects.find((p) => p.id === rec.projectId);

              return (
                <div
                  key={rec.id}
                  className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-200/90 dark:border-stone-800 p-6 shadow-sm space-y-5 transition hover:border-stone-300 dark:hover:border-stone-700"
                >
                  {/* Card Meta Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-stone-100 dark:border-stone-800">
                    <div className="flex items-center flex-wrap gap-2">
                      <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-800 dark:text-stone-200">
                        {rec.date}
                      </span>
                      <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60">
                        {dimCfg.label}
                      </span>
                      {relatedProject && (
                        <span className="text-xs text-stone-500 font-medium truncate max-w-xs">
                          关联：{relatedProject.title}
                        </span>
                      )}
                      <span
                        className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${
                          rec.leverageType === 'high_leverage'
                            ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300'
                            : 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400'
                        }`}
                      >
                        {rec.leverageType === 'high_leverage' ? '⚡ 纳瓦尔高杠杆' : '低边际杠杆'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      <span className="text-xs font-extrabold text-stone-900 dark:text-white">
                        达成率：{rec.fulfillmentRate}%
                      </span>
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(rec)}
                        className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
                        title="编辑记录"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm('确定删除该条实绩记录吗？')) {
                            onDeleteRecord(rec.id);
                          }
                        }}
                        className="p-1.5 rounded-lg text-stone-400 hover:text-rose-600"
                        title="删除记录"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Core Goal: The ONE Thing */}
                  <div className="space-y-1">
                    <span className="text-[11px] font-bold text-stone-400 uppercase tracking-wider flex items-center gap-1">
                      <Target className="w-3.5 h-3.5 text-emerald-600" />
                      The ONE Thing 核心事项
                    </span>
                    <h4 className="text-base sm:text-lg font-bold text-stone-900 dark:text-white">
                      {rec.oneThingGoal}
                    </h4>
                  </div>

                  {/* Plan vs Actual Split Columns */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Planned */}
                    <div className="p-4 rounded-2xl bg-stone-50 dark:bg-stone-800/50 border border-stone-200/80 dark:border-stone-700/80 space-y-2 text-xs">
                      <div className="flex items-center justify-between font-bold text-stone-700 dark:text-stone-300">
                        <span>🎯 计划意图 (Plan)</span>
                        <span className="text-stone-500">预估 {rec.plannedHours}h</span>
                      </div>
                      <div>
                        <span className="text-stone-400 block text-[11px]">预期交付成果：</span>
                        <p className="font-medium text-stone-800 dark:text-stone-200 mt-0.5 leading-relaxed">
                          {rec.plannedOutput || '按预定标准交付'}
                        </p>
                      </div>
                    </div>

                    {/* Actual */}
                    <div className="p-4 rounded-2xl bg-emerald-50/40 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-900/60 space-y-2 text-xs">
                      <div className="flex items-center justify-between font-bold text-emerald-900 dark:text-emerald-300">
                        <span>⚡ 实际执行 (Actual)</span>
                        <span className="text-emerald-700 dark:text-emerald-400">实耗 {rec.actualHours}h</span>
                      </div>
                      <div>
                        <span className="text-stone-400 block text-[11px]">实际行动与交付：</span>
                        <p className="font-medium text-stone-900 dark:text-stone-100 mt-0.5 leading-relaxed">
                          {rec.actualAction}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Deviation & Coach Reflection */}
                  <div className="space-y-2 pt-1 text-xs">
                    {rec.deviationReason && (
                      <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-900/60 text-amber-900 dark:text-amber-200 flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <strong className="font-bold">偏差与注意力流失原因：</strong>
                          <span className="ml-1">{rec.deviationReason}</span>
                        </div>
                      </div>
                    )}

                    {rec.coachTip && (
                      <div className="p-3 rounded-xl bg-stone-50 dark:bg-stone-800/70 border border-stone-200/60 dark:border-stone-700/60 text-stone-700 dark:text-stone-300 flex items-start gap-2">
                        <Sparkles className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        <div>
                          <strong className="font-bold text-stone-900 dark:text-stone-100">
                            教练复盘建议：
                          </strong>
                          <span className="ml-1">{rec.coachTip}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal: New / Edit Record */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-200 dark:border-stone-800 shadow-2xl w-full max-w-xl my-6 overflow-hidden">
            <div className="px-6 py-4 border-b border-stone-100 dark:border-stone-800 flex items-center justify-between">
              <h3 className="text-base font-bold text-stone-900 dark:text-white">
                {editingRecord ? '编辑计划与实绩记录' : '新增「计划 vs 实际」对照实绩'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 text-lg font-bold"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto text-xs">
              {/* Date & Dimension */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">日期</label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">生命维度</label>
                  <select
                    value={dimension}
                    onChange={(e) => setDimension(e.target.value as ProjectCategory)}
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800"
                  >
                    <option value="career">💼 工作与事业 (杠杆交付)</option>
                    <option value="health">🏃 身体与健康 (能量基石)</option>
                    <option value="wealth">💰 财富与自由 (复利资产)</option>
                    <option value="mindset">🧠 认知与心智 (第一性原理)</option>
                  </select>
                </div>
              </div>

              {/* The ONE Thing */}
              <div>
                <label className="block font-bold text-stone-900 dark:text-white mb-1">
                  🎯 The ONE Thing: 今天最重要的一件事是什么？ *
                </label>
                <input
                  type="text"
                  required
                  value={oneThingGoal}
                  onChange={(e) => setOneThingGoal(e.target.value)}
                  placeholder="例如：攻坚SaaS海外支付代码；完成14K长距离配速跑"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 font-medium"
                />
              </div>

              {/* Planned Section */}
              <div className="p-3.5 rounded-2xl bg-stone-50 dark:bg-stone-800/50 border border-stone-200/80 dark:border-stone-700 space-y-2.5">
                <span className="font-bold text-stone-700 dark:text-stone-300 block">
                  1. 初衷计划 (Plan)
                </span>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-1">
                    <label className="block text-[11px] text-stone-500 mb-1">预计工时 (h)</label>
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      max="16"
                      value={plannedHours}
                      onChange={(e) => setPlannedHours(parseFloat(e.target.value))}
                      className="w-full px-3 py-1.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[11px] text-stone-500 mb-1">计划关键交付物</label>
                    <input
                      type="text"
                      value={plannedOutput}
                      onChange={(e) => setPlannedOutput(e.target.value)}
                      placeholder="完成后具体交付什么？"
                      className="w-full px-3 py-1.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800"
                    />
                  </div>
                </div>
              </div>

              {/* Actual Section */}
              <div className="p-3.5 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-900/60 space-y-2.5">
                <span className="font-bold text-emerald-900 dark:text-emerald-300 block">
                  2. 实际落地与执行 (Actual)
                </span>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-1">
                    <label className="block text-[11px] text-stone-500 mb-1">实际耗时 (h)</label>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      max="16"
                      value={actualHours}
                      onChange={(e) => setActualHours(parseFloat(e.target.value))}
                      className="w-full px-3 py-1.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[11px] text-stone-500 mb-1">实际成果交付</label>
                    <input
                      type="text"
                      value={actualOutput}
                      onChange={(e) => setActualOutput(e.target.value)}
                      placeholder="实际上做成了什么？"
                      className="w-full px-3 py-1.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-stone-500 mb-1">实际执行动作描述</label>
                  <input
                    type="text"
                    value={actualAction}
                    onChange={(e) => setActualAction(e.target.value)}
                    placeholder="今天实际把精力花在什么动作上？"
                    className="w-full px-3 py-1.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800"
                  />
                </div>
              </div>

              {/* Variance & Leverage */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold mb-1">
                    达成率：{fulfillmentRate}%
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={fulfillmentRate}
                    onChange={(e) => setFulfillmentRate(parseInt(e.target.value))}
                    className="w-full accent-emerald-600"
                  />
                </div>

                <div>
                  <label className="block font-semibold mb-1">纳瓦尔杠杆评估</label>
                  <select
                    value={leverageType}
                    onChange={(e) => setLeverageType(e.target.value as any)}
                    className="w-full px-3 py-1.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800"
                  >
                    <option value="high_leverage">⚡ 高杠杆资产 (代码/媒体/体系)</option>
                    <option value="neutral">⚖️ 中性必要维护</option>
                    <option value="low_leverage">⚠️ 低杠杆纯体力消耗</option>
                  </select>
                </div>
              </div>

              {/* Deviation reflection */}
              <div>
                <label className="block font-semibold mb-1">
                  偏差原因剖析 (为什么计划与实际有出入？是否遭遇假努力或多任务陷阱？)
                </label>
                <textarea
                  rows={2}
                  value={deviationReason}
                  onChange={(e) => setDeviationReason(e.target.value)}
                  placeholder="例如：原定2小时写代码，但中途回复即时通讯导致切换损耗，属于多任务陷阱..."
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800"
                />
              </div>

              <div className="pt-3 border-t border-stone-100 dark:border-stone-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-stone-600 dark:text-stone-300 hover:bg-stone-100"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-stone-900 text-white dark:bg-white dark:text-stone-950 font-bold hover:opacity-90"
                >
                  保存对照记录
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
