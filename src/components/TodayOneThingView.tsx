import React, { useState } from 'react';
import { LifeProject, DailyLog, PlanActualRecord, AcceleratedGoal } from '../types';
import { DIMENSIONS_CONFIG } from '../utils/categories';
import {
  Target,
  Play,
  CheckCircle2,
  Circle,
  Plus,
  Clock,
  Sparkles,
  Mic,
  BatteryCharging,
  Zap,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Flame,
  ShieldAlert,
  Cpu,
  Layers,
  TrendingUp,
  Briefcase,
  Activity,
  Brain,
  Check,
  Trash2,
  RefreshCw,
} from 'lucide-react';
import { requestAiAutofill } from '../services/api';

interface Props {
  projects: LifeProject[];
  logs: DailyLog[];
  planActualRecords: PlanActualRecord[];
  acceleratedGoals?: AcceleratedGoal[];
  onAddPlanActual: (rec: PlanActualRecord) => void;
  onUpdatePlanActual: (rec: PlanActualRecord) => void;
  onOpenNewLog: () => void;
  onOpenFocusTimer: (project: LifeProject) => void;
  onNavigateToDimensions: () => void;
  onNavigateToGoalAcceleration?: () => void;
  onNavigateToCoach: (prompt?: string) => void;
}

export const TodayOneThingView: React.FC<Props> = ({
  projects,
  logs,
  planActualRecords,
  acceleratedGoals = [],
  onAddPlanActual,
  onUpdatePlanActual,
  onOpenNewLog,
  onOpenFocusTimer,
  onNavigateToDimensions,
  onNavigateToGoalAcceleration,
  onNavigateToCoach,
}) => {
  const todayStr = new Date().toISOString().split('T')[0];

  // The primary active project (the highest priority sprinting or on_track project)
  const activeProjects = projects.filter((p) => p.status !== 'completed');
  const theOneProject =
    activeProjects.find((p) => p.status === 'sprinting') ||
    activeProjects.find((p) => p.priority === 'high') ||
    activeProjects[0];

  // Today's plan actual record if exists
  const todayRecord = planActualRecords.find((r) => r.date === todayStr);

  // Quick inputs for inline plan vs actual
  const [oneThingInput, setOneThingInput] = useState(todayRecord?.oneThingGoal || theOneProject?.nextMicroAction || '');
  const [plannedHoursInput, setPlannedHoursInput] = useState<number>(todayRecord?.plannedHours || 3.0);
  const [actualActionInput, setActualActionInput] = useState(todayRecord?.actualAction || '');
  const [actualHoursInput, setActualHoursInput] = useState<number>(todayRecord?.actualHours || 3.0);
  const [fulfillmentRateInput, setFulfillmentRateInput] = useState<number>(todayRecord?.fulfillmentRate || 85);
  const [isSavedRecently, setIsSavedRecently] = useState(false);
  const [isRecordExpanded, setIsRecordExpanded] = useState(false);
  const [isAiAutofilling, setIsAiAutofilling] = useState(false);

  // Clear Today's input fields
  const handleClearTodayForm = () => {
    setOneThingInput('');
    setActualActionInput('');
    setPlannedHoursInput(2.5);
    setActualHoursInput(2.5);
    setFulfillmentRateInput(85);
  };

  // AI Autofill Today's ONE Thing & plan
  const handleAutofillTodayPlan = async () => {
    setIsAiAutofilling(true);
    try {
      const data = await requestAiAutofill('today_plan', {
        theOneProject: theOneProject ? { title: theOneProject.title, category: theOneProject.category, successCriteria: theOneProject.successCriteria } : null,
        topGoal: topGoal ? { title: topGoal.title, oneYearTarget: topGoal.oneYearTarget, coreBottleneck: topGoal.firstPrinciples?.coreBottleneck } : null,
      });

      if (data.oneThingGoal) setOneThingInput(data.oneThingGoal);
      if (data.plannedHours) setPlannedHoursInput(data.plannedHours);
      if (data.actualAction) setActualActionInput(data.actualAction);
      if (data.actualHours) setActualHoursInput(data.actualHours);
      if (data.fulfillmentRate) setFulfillmentRateInput(data.fulfillmentRate);
    } catch (err) {
      console.error(err);
    } finally {
      setIsAiAutofilling(false);
    }
  };

  const handleQuickSaveRecord = (e: React.FormEvent) => {
    e.preventDefault();
    if (!oneThingInput.trim()) return;

    const newRecord: PlanActualRecord = {
      id: todayRecord?.id || 'pa-' + Date.now(),
      date: todayStr,
      dimension: theOneProject?.category || 'career',
      projectId: theOneProject?.id,
      oneThingGoal: oneThingInput.trim(),
      plannedHours: Number(plannedHoursInput) || 2,
      plannedOutput: theOneProject?.successCriteria || '按计划完成核心交付',
      actualAction: actualActionInput.trim() || oneThingInput.trim(),
      actualHours: Number(actualHoursInput) || Number(plannedHoursInput) || 2,
      actualOutput: actualActionInput.trim() ? `已交付：${actualActionInput.trim()}` : '推进中',
      fulfillmentRate: Number(fulfillmentRateInput),
      deviationReason: Number(fulfillmentRateInput) < 80 ? '存在部分注意力分散或外部打断' : '执行良好',
      leverageType: 'high_leverage',
      coachTip: '持续守护早晨的深度工作块，让每一天都在推倒核心多米诺骨牌。',
      createdAt: todayRecord?.createdAt || new Date().toISOString(),
    };

    if (todayRecord) {
      onUpdatePlanActual(newRecord);
    } else {
      onAddPlanActual(newRecord);
    }

    setIsSavedRecently(true);
    setTimeout(() => setIsSavedRecently(false), 2500);
  };

  const latestLog = logs[0];
  const topGoal = acceleratedGoals[0];

  const dimensionCategories = [
    { key: 'career', label: '工作', icon: Briefcase, color: 'text-blue-500' },
    { key: 'health', label: '健康', icon: Activity, color: 'text-emerald-500' },
    { key: 'wealth', label: '财富', icon: TrendingUp, color: 'text-amber-500' },
    { key: 'mindset', label: '认知', icon: Brain, color: 'text-purple-500' },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* 1. Date & Philosophical Anchor Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-stone-200/70 dark:border-stone-800">
        <div>
          <span className="text-xs font-mono font-bold text-stone-400 uppercase tracking-widest">
            {new Date().toLocaleDateString('zh-CN', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              weekday: 'long',
            })}
          </span>
          <h1 className="text-2xl sm:text-3xl font-black text-stone-900 dark:text-white tracking-tight mt-0.5">
            今日唯一核心焦点
          </h1>
        </div>

        <div className="text-xs sm:text-right text-stone-500 dark:text-stone-400 italic max-w-md">
          “做哪一件最重要的事，能让其他事情变得更容易，或者不再重要？”
        </div>
      </div>

      {/* 2. Primary The ONE Thing Hero Banner */}
      <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-200 dark:border-stone-800 p-6 sm:p-8 shadow-sm space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-2 max-w-2xl">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <Target className="w-4 h-4" />
              </span>
              <span className="text-xs font-bold text-stone-400 uppercase tracking-wider">
                今日唯一多米诺首牌 · {theOneProject ? theOneProject.title : '全盘生活演进'}
              </span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-black text-stone-900 dark:text-white leading-tight">
              {oneThingInput || theOneProject?.nextMicroAction || '在此确立今天的第一核心突破动作'}
            </h2>

            <div className="flex items-center gap-2 text-xs text-stone-500 dark:text-stone-400">
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold">
                <Zap className="w-3.5 h-3.5 fill-current" />
                ≤5分钟启动第一击
              </span>
              <span>·</span>
              <span>消除拖延与伪努力</span>
              <span>·</span>
              <span>计划耗时 {plannedHoursInput} 小时</span>
            </div>
          </div>

          {/* Action Trigger Buttons */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3 shrink-0 w-full sm:w-auto">
            {theOneProject && (
              <button
                type="button"
                onClick={() => onOpenFocusTimer(theOneProject)}
                className="w-full sm:w-auto justify-center px-5 py-3 rounded-2xl bg-stone-950 text-white dark:bg-white dark:text-stone-950 font-black text-xs sm:text-sm hover:opacity-90 transition flex items-center gap-2 shadow-md min-h-[44px]"
              >
                <Play className="w-4 h-4 fill-emerald-400 text-emerald-400" />
                <span>开启 25 分钟心流专注</span>
              </button>
            )}

            <button
              type="button"
              onClick={onOpenNewLog}
              className="w-full sm:w-auto justify-center px-4 py-3 rounded-2xl bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 font-bold text-xs sm:text-sm transition flex items-center gap-2 min-h-[44px]"
            >
              <Mic className="w-4 h-4 text-rose-500" />
              <span>语音打卡 / 觉察记录</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. High Efficiency 2-Column Dashboard Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Today's Plan vs Actual Execution (7 Cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Quick Plan vs Actual Inline Logger */}
          <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-200 dark:border-stone-800 p-5 sm:p-6 shadow-sm space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-stone-100 dark:border-stone-800 gap-2.5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold text-xs">
                  ⚖️
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-extrabold text-stone-900 dark:text-white">
                    今日计划工时 vs 实际交付产出
                  </h3>
                  <span className="text-xs text-stone-400">杜绝“看起来很忙却零产出”的认知陷阱</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={handleAutofillTodayPlan}
                  disabled={isAiAutofilling}
                  className="px-3 py-2 sm:py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-extrabold text-xs transition shadow-sm flex items-center gap-1.5 disabled:opacity-50 min-h-[38px]"
                  title="根据正在推进的项目与5X目标，由AI智能推演今日最高杠杆要事与工时"
                >
                  {isAiAutofilling ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>推演中...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5 text-stone-950" />
                      <span>AI 智能填充</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleClearTodayForm}
                  className="px-2.5 py-2 sm:py-1.5 rounded-xl text-stone-500 hover:text-red-500 hover:bg-stone-100 dark:hover:bg-stone-800 transition min-h-[38px] flex items-center gap-1 border border-stone-200/60 dark:border-stone-700 text-xs font-semibold"
                  title="一键清空输入框内容"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span className="inline sm:hidden">清空</span>
                </button>

                {todayRecord && (
                  <span className="text-[11px] font-mono px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 font-bold">
                    吻合度 {todayRecord.fulfillmentRate}%
                  </span>
                )}
              </div>
            </div>

            <form onSubmit={handleQuickSaveRecord} className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-stone-600 dark:text-stone-300">
                    今日锁定交付动作：
                  </label>
                  {oneThingInput && (
                    <button
                      type="button"
                      onClick={() => setOneThingInput('')}
                      className="text-[11px] text-stone-400 hover:text-red-500"
                    >
                      清空
                    </button>
                  )}
                </div>
                <div className="relative">
                  <input
                    type="text"
                    value={oneThingInput}
                    onChange={(e) => setOneThingInput(e.target.value)}
                    placeholder="今天必须完成的核心交付是什么？"
                    className="w-full px-4 py-2.5 pr-8 text-xs sm:text-sm rounded-2xl border border-stone-200 dark:border-stone-700 bg-stone-50/60 dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-stone-400 font-medium"
                  />
                  {oneThingInput && (
                    <button
                      type="button"
                      onClick={() => setOneThingInput('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 p-0.5 text-xs font-bold"
                      title="清除此项"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              {/* Time Blocks Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 rounded-2xl bg-stone-50 dark:bg-stone-850 border border-stone-200/60 dark:border-stone-800 space-y-1">
                  <div className="text-[11px] text-stone-400 font-semibold flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    计划时间 (小时)
                  </div>
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    max="14"
                    value={plannedHoursInput}
                    onChange={(e) => setPlannedHoursInput(parseFloat(e.target.value) || 1)}
                    className="w-full text-base sm:text-lg font-black bg-transparent text-stone-900 dark:text-white outline-none"
                  />
                </div>

                <div className="p-3.5 rounded-2xl bg-stone-50 dark:bg-stone-850 border border-stone-200/60 dark:border-stone-800 space-y-1">
                  <div className="text-[11px] text-stone-400 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                    实际耗时 (小时)
                  </div>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max="14"
                    value={actualHoursInput}
                    onChange={(e) => setActualHoursInput(parseFloat(e.target.value) || 1)}
                    className="w-full text-base sm:text-lg font-black bg-transparent text-stone-900 dark:text-white outline-none"
                  />
                </div>
              </div>

              {/* Actual Delivery */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-stone-600 dark:text-stone-300">
                    实际交付结果 / 战果：
                  </label>
                  {actualActionInput && (
                    <button
                      type="button"
                      onClick={() => setActualActionInput('')}
                      className="text-[11px] text-stone-400 hover:text-red-500"
                    >
                      清空
                    </button>
                  )}
                </div>
                <div className="relative">
                  <input
                    type="text"
                    value={actualActionInput}
                    onChange={(e) => setActualActionInput(e.target.value)}
                    placeholder="例如：攻克了核心难点，输出了可运行原型"
                    className="w-full px-4 py-2.5 pr-8 text-xs sm:text-sm rounded-2xl border border-stone-200 dark:border-stone-700 bg-stone-50/60 dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-stone-400"
                  />
                  {actualActionInput && (
                    <button
                      type="button"
                      onClick={() => setActualActionInput('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 p-0.5 text-xs font-bold"
                      title="清除此项"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              {/* Fulfillment Range */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-stone-600 dark:text-stone-300">达成吻合度</span>
                  <span className="font-mono text-emerald-600 dark:text-emerald-400 font-extrabold text-sm">
                    {fulfillmentRateInput}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={fulfillmentRateInput}
                  onChange={(e) => setFulfillmentRateInput(parseInt(e.target.value))}
                  className="w-full accent-stone-900 dark:accent-emerald-400 h-2 bg-stone-200 dark:bg-stone-700 rounded-lg cursor-pointer"
                />
              </div>

              {/* Actions Footer */}
              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleClearTodayForm}
                    className="text-xs text-stone-400 hover:text-red-600 font-semibold flex items-center gap-1 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>清空重置</span>
                  </button>
                  <span className="text-xs text-stone-400 font-medium">
                    {isSavedRecently ? (
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" /> 已成功同步到实绩库
                      </span>
                    ) : todayRecord ? (
                      '已录入今日对照'
                    ) : (
                      '今日尚未保存实绩'
                    )}
                  </span>
                </div>

                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-2xl bg-stone-900 hover:bg-stone-800 text-white dark:bg-white dark:text-stone-950 font-black text-xs sm:text-sm transition shadow-sm"
                >
                  保存今日实绩
                </button>
              </div>
            </form>
          </div>

          {/* Daily Awareness & Energy Status */}
          <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-200 dark:border-stone-800 p-5 sm:p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <BatteryCharging className="w-4 h-4 text-emerald-500" />
                <h4 className="text-xs sm:text-sm font-bold text-stone-900 dark:text-white">
                  日常数据觉察与精力监控
                </h4>
                {latestLog && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-bold">
                    精力: {latestLog.energyLevel}/5格
                  </span>
                )}
              </div>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                {latestLog ? `最新高光：“${latestLog.highlight}”` : '随时记录微小胜利与觉察，支持高精度语音识别'}
              </p>
            </div>

            <button
              type="button"
              onClick={onOpenNewLog}
              className="px-4 py-2.5 rounded-2xl bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 font-bold text-xs sm:text-sm transition flex items-center gap-2 shrink-0 self-start sm:self-auto"
            >
              <Mic className="w-4 h-4 text-rose-500" />
              <span>语音记一笔觉察</span>
            </button>
          </div>
        </div>

        {/* Right Column: 5X Musk Goal & 4 Dimensions (5 Cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* 5X Musk Accelerated Goal Card */}
          <div className="bg-gradient-to-br from-stone-900 via-stone-850 to-stone-950 text-white rounded-3xl p-6 shadow-md border border-stone-800 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-stone-800">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-xl bg-amber-500/20 text-amber-400">
                  <Flame className="w-4 h-4 fill-amber-400 text-amber-400" />
                </span>
                <div>
                  <h3 className="text-sm sm:text-base font-black text-white">
                    目标实现 · 5X 极限加速引擎
                  </h3>
                  <span className="text-[11px] text-stone-400">马斯克体系：1年倒逼5年进度</span>
                </div>
              </div>

              {onNavigateToGoalAcceleration && (
                <button
                  type="button"
                  onClick={onNavigateToGoalAcceleration}
                  className="text-xs font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1 transition"
                >
                  <span>全部战役</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {topGoal ? (
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                      核心战役 · 航向评分 {topGoal.supervision?.velocityScore || 85}/100
                    </span>
                    <span className="text-xs font-mono text-stone-400 font-bold">
                      进度 {topGoal.progress}%
                    </span>
                  </div>
                  <h4 className="text-base font-extrabold text-white mt-1 leading-snug">
                    {topGoal.title}
                  </h4>
                </div>

                {/* Vision vs Extreme Target */}
                <div className="space-y-2 text-xs">
                  <div className="p-3 rounded-2xl bg-stone-800/60 border border-stone-700/60">
                    <span className="text-stone-400 font-semibold">原 5 年愿景：</span>
                    <p className="text-stone-300 mt-0.5 line-clamp-2">{topGoal.fiveYearVision}</p>
                  </div>
                  <div className="p-3 rounded-2xl bg-amber-950/40 border border-amber-800/60">
                    <span className="text-amber-300 font-bold">倒逼 1 年极限指标：</span>
                    <p className="text-amber-100 mt-0.5 font-semibold line-clamp-2">{topGoal.oneYearTarget}</p>
                  </div>
                </div>

                {/* Musk Directive or Key Focus */}
                {topGoal.lastOptimalArrangement ? (
                  <div className="p-3 rounded-2xl bg-indigo-950/40 border border-indigo-800/60 space-y-1 text-xs">
                    <div className="flex items-center gap-1.5 text-indigo-300 font-bold">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                      <span>未来 48 小时单点破局点 (已生效最优安排)</span>
                    </div>
                    <p className="text-indigo-100 font-medium">
                      {topGoal.lastOptimalArrangement.coreFocusImmediate}
                    </p>
                  </div>
                ) : topGoal.supervision?.muskDirective ? (
                  <div className="p-3 rounded-2xl bg-black/60 border border-stone-800 flex items-start gap-2.5 text-xs">
                    <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-amber-400 font-mono font-bold uppercase tracking-wide">
                        马斯克 24 小时硬核监督令:
                      </span>
                      <p className="text-stone-200 mt-0.5">{topGoal.supervision.muskDirective}</p>
                    </div>
                  </div>
                ) : null}

                {/* Navigate Button */}
                {onNavigateToGoalAcceleration && (
                  <button
                    type="button"
                    onClick={onNavigateToGoalAcceleration}
                    className="w-full py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-xs transition flex items-center justify-center gap-1.5 shadow"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>进入 5X 目标拆解与 AI 诊断室</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="py-6 text-center text-xs text-stone-400 space-y-3">
                <p>暂无 5X 极限目标，建立战役将 5 年愿景压缩在 1 年内爆发突破！</p>
                {onNavigateToGoalAcceleration && (
                  <button
                    type="button"
                    onClick={onNavigateToGoalAcceleration}
                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs"
                  >
                    建立首个 5X 极限目标
                  </button>
                )}
              </div>
            )}
          </div>

          {/* 4 Core Dimensions Overview Quick Bar */}
          <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-200 dark:border-stone-800 p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-stone-100 dark:border-stone-800">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-stone-400" />
                <h4 className="text-xs sm:text-sm font-bold text-stone-900 dark:text-white">
                  四大维度通盘掌控
                </h4>
              </div>
              <button
                type="button"
                onClick={onNavigateToDimensions}
                className="text-xs font-bold text-stone-500 hover:text-stone-900 dark:hover:text-white flex items-center gap-0.5"
              >
                <span>进入详情</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {dimensionCategories.map((dim) => {
                const count = projects.filter((p) => p.category === dim.key && p.status !== 'completed').length;
                const Icon = dim.icon;
                return (
                  <div
                    key={dim.key}
                    onClick={onNavigateToDimensions}
                    className="p-3.5 rounded-2xl bg-stone-50 dark:bg-stone-850 border border-stone-200/60 dark:border-stone-800 hover:border-stone-400 dark:hover:border-stone-600 transition cursor-pointer space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <Icon className={`w-4 h-4 ${dim.color}`} />
                      <span className="text-xs font-mono font-bold text-stone-400">{count} 项进行中</span>
                    </div>
                    <div className="text-xs font-bold text-stone-900 dark:text-white mt-1">
                      {dim.label}维度
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
