import React, { useState } from 'react';
import { LifeProject, DailyLog, PlanActualRecord, AcceleratedGoal } from '../types';
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
} from 'lucide-react';

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
      plannedOutput: theOneProject?.successCriteria || '按计划完成交付',
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

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* 1. Tranquil Header Quote & Date */}
      <div className="text-center space-y-2 py-4">
        <span className="text-xs font-semibold text-stone-400 uppercase tracking-widest">
          {new Date().toLocaleDateString('zh-CN', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'long',
          })}
        </span>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-stone-900 dark:text-white tracking-tight">
          今天，最重要的事只有一件
        </h1>
        <p className="text-sm sm:text-base text-stone-500 dark:text-stone-400 max-w-xl mx-auto leading-relaxed">
          “做哪一件最重要的事，能让其他事情变得更容易，或者不再重要？”
        </p>
      </div>

      {/* 2. Today's ONE Thing Main Focus Card (Large, serene, ultra-clear) */}
      <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-200/90 dark:border-stone-800 p-6 sm:p-8 shadow-sm space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-stone-100 dark:border-stone-800">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-2xl bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
              <Target className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-lg font-bold text-stone-900 dark:text-white">
                今日唯一多米诺首牌
              </h2>
              <span className="text-xs text-stone-400 font-medium">
                主线项目：{theOneProject?.title || '全盘生活演进'}
              </span>
            </div>
          </div>

          {theOneProject && (
            <button
              type="button"
              onClick={() => onOpenFocusTimer(theOneProject)}
              className="px-4 py-2 rounded-2xl bg-stone-900 text-white dark:bg-white dark:text-stone-950 font-bold text-xs sm:text-sm hover:opacity-90 transition flex items-center gap-2 shadow-sm"
            >
              <Play className="w-3.5 h-3.5 fill-current text-emerald-500" />
              开启 25 分钟专注心流
            </button>
          )}
        </div>

        {/* The Action Prompt */}
        <div className="p-5 rounded-2xl bg-stone-50 dark:bg-stone-800/40 border border-stone-200/60 dark:border-stone-700/60 space-y-2">
          <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
            <Zap className="w-4 h-4 fill-current" />
            ≤5分钟启动第一击 (消除拖延锚点)
          </span>
          <p className="text-base sm:text-lg font-bold text-stone-900 dark:text-stone-100 leading-snug">
            {theOneProject?.nextMicroAction || '在此写下今天能立刻启动的第一步动作'}
          </p>
        </div>

        {/* Quick Plan vs Actual Inline Logger */}
        <form onSubmit={handleQuickSaveRecord} className="space-y-4 pt-2">
          <div>
            <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1.5">
              🎯 确认今日核心推进目标：
            </label>
            <input
              type="text"
              value={oneThingInput}
              onChange={(e) => setOneThingInput(e.target.value)}
              placeholder="今天必须完成的核心交付是什么？"
              className="w-full px-4 py-2.5 text-sm sm:text-base rounded-2xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-stone-400 font-medium"
            />
          </div>

          {/* Toggle Accordion for detailed actuals */}
          <div>
            <button
              type="button"
              onClick={() => setIsRecordExpanded(!isRecordExpanded)}
              className="text-xs font-semibold text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 flex items-center gap-1 py-1"
            >
              {isRecordExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              <span>{isRecordExpanded ? '收起实绩对照详情' : '展开「计划工时 vs 实际交付」对照表'}</span>
            </button>

            {isRecordExpanded && (
              <div className="mt-3 p-4 rounded-2xl bg-stone-50 dark:bg-stone-800/50 border border-stone-200/70 dark:border-stone-700/70 space-y-3 text-xs sm:text-sm">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold mb-1">计划投入时间 (小时)</label>
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      max="12"
                      value={plannedHoursInput}
                      onChange={(e) => setPlannedHoursInput(parseFloat(e.target.value) || 1)}
                      className="w-full px-3 py-1.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold mb-1">实际耗时 (小时)</label>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      max="12"
                      value={actualHoursInput}
                      onChange={(e) => setActualHoursInput(parseFloat(e.target.value) || 1)}
                      className="w-full px-3 py-1.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold mb-1">实际完成了什么 / 交付产出：</label>
                  <input
                    type="text"
                    value={actualActionInput}
                    onChange={(e) => setActualActionInput(e.target.value)}
                    placeholder="例如：攻克了结账接口，跑通了端到端测试"
                    className="w-full px-3 py-1.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800"
                  />
                </div>

                <div>
                  <label className="block font-semibold mb-1">
                    达成吻合度：{fulfillmentRateInput}%
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={fulfillmentRateInput}
                    onChange={(e) => setFulfillmentRateInput(parseInt(e.target.value))}
                    className="w-full accent-emerald-600"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-stone-400">
              {isSavedRecently ? '✓ 已保存到本地实绩库' : todayRecord ? '已关联今日对照记录' : '尚未保存今日记录'}
            </span>

            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-stone-900 text-white dark:bg-white dark:text-stone-950 font-bold text-xs sm:text-sm hover:opacity-90 transition shadow-sm"
            >
              保存今日对照
            </button>
          </div>
        </form>
      </div>

      {/* 2.5 马斯克 5X 极速目标实现对齐卡片 (1年完成5年进度) */}
      <div className="bg-gradient-to-br from-stone-900 via-stone-850 to-stone-950 text-white rounded-3xl p-6 shadow-md border border-stone-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-800/80">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-xl bg-amber-500/20 text-amber-400">
              <Flame className="w-5 h-5 fill-amber-400 text-amber-400" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black tracking-tight text-white">
                  目标实现 · 5X 极限加速引擎
                </h3>
                <span className="text-[11px] px-2 py-0.5 rounded-full font-bold bg-amber-500 text-stone-950">
                  马斯克方法体系
                </span>
              </div>
              <p className="text-xs text-stone-400">
                运用第一性原理与算法五步法 · 倒逼1年完成5年进度
              </p>
            </div>
          </div>

          {onNavigateToGoalAcceleration && (
            <button
              type="button"
              onClick={onNavigateToGoalAcceleration}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs sm:text-sm font-extrabold transition shadow flex items-center gap-1.5 self-start sm:self-auto"
            >
              <span>查看全部 5X 目标与拆解</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>

        {acceleratedGoals.length > 0 ? (
          <div className="space-y-3">
            {acceleratedGoals.slice(0, 1).map((topGoal) => (
              <div key={topGoal.id} className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                  <div>
                    <span className="text-xs text-amber-400 font-bold uppercase tracking-wider">
                      核心战役 · 5X 速度 {topGoal.supervision?.velocityScore || 85}/100
                    </span>
                    <h4 className="text-base font-bold text-white mt-0.5">{topGoal.title}</h4>
                  </div>
                  <span className="text-xs text-stone-400 font-mono">
                    战役进度: {topGoal.progress}%
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-stone-800/60 border border-stone-700/60">
                    <span className="text-stone-400 font-semibold">原 5 年愿景:</span>
                    <p className="text-stone-300 mt-0.5 line-clamp-2">{topGoal.fiveYearVision}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-800/60">
                    <span className="text-amber-300 font-bold">倒逼 1 年极限完成指标:</span>
                    <p className="text-amber-100 mt-0.5 font-medium line-clamp-2">{topGoal.oneYearTarget}</p>
                  </div>
                </div>

                {topGoal.supervision?.muskDirective && (
                  <div className="p-3 rounded-xl bg-black/60 border border-stone-800 flex items-start gap-2.5 text-xs">
                    <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-amber-400 font-mono font-bold uppercase tracking-wide">
                        马斯克 24 小时硬核监督令:
                      </span>
                      <p className="text-stone-200 mt-0.5">{topGoal.supervision.muskDirective}</p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="py-4 text-center text-xs text-stone-400">
            暂无 5X 极限目标，点击上方按钮运用第一性原理创建你的第一个 1 年完成 5 年战役。
          </div>
        )}
      </div>

      {/* 3. Quick Daily Voice & Awareness Strip (Simple, un-cluttered) */}
      <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-200/90 dark:border-stone-800 p-5 sm:p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-stone-900 dark:text-white flex items-center gap-1.5">
              <BatteryCharging className="w-4 h-4 text-emerald-600" />
              日常数据觉察与精力监控
            </span>
            {latestLog && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-semibold">
                今日电量 {latestLog.energyLevel}/5格
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-stone-500 dark:text-stone-400">
            {latestLog ? `最新高光：“${latestLog.highlight}”` : '记录今日战果与微小胜利，支持语音输入'}
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenNewLog}
          className="px-4 py-2.5 rounded-2xl bg-stone-100 dark:bg-stone-800 hover:bg-stone-200 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 font-bold text-xs sm:text-sm transition flex items-center gap-2 shrink-0 self-start sm:self-auto"
        >
          <Mic className="w-4 h-4 text-rose-500" />
          <span>语音记一笔打卡</span>
        </button>
      </div>

      {/* 4. Quick Jump to 4 Core Dimensions & Coach */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
        <div
          onClick={onNavigateToDimensions}
          className="p-5 rounded-3xl bg-white dark:bg-stone-900 border border-stone-200/80 dark:border-stone-800 hover:border-stone-400 dark:hover:border-stone-600 transition cursor-pointer flex items-center justify-between group shadow-sm"
        >
          <div className="space-y-1">
            <span className="text-xs font-bold text-stone-400 uppercase tracking-wider">
              四大维度管理
            </span>
            <h3 className="text-base font-bold text-stone-900 dark:text-white group-hover:text-emerald-600 transition flex items-center gap-1.5">
              工作 · 健康 · 财富 · 认知
            </h3>
            <p className="text-xs text-stone-500">
              共 {activeProjects.length} 个进行中项目与阶梯里程碑
            </p>
          </div>
          <ArrowRight className="w-5 h-5 text-stone-400 group-hover:text-stone-900 dark:group-hover:text-white group-hover:translate-x-1 transition" />
        </div>

        <div
          onClick={() => onNavigateToCoach()}
          className="p-5 rounded-3xl bg-white dark:bg-stone-900 border border-stone-200/80 dark:border-stone-800 hover:border-stone-400 dark:hover:border-stone-600 transition cursor-pointer flex items-center justify-between group shadow-sm"
        >
          <div className="space-y-1">
            <span className="text-xs font-bold text-stone-400 uppercase tracking-wider">
              全天候教练研讨
            </span>
            <h3 className="text-base font-bold text-stone-900 dark:text-white group-hover:text-emerald-600 transition flex items-center gap-1.5">
              战略导师 · 斯多葛智者
            </h3>
            <p className="text-xs text-stone-500">
              随时提问卡点、识别假努力、请求路径纠偏
            </p>
          </div>
          <ArrowRight className="w-5 h-5 text-stone-400 group-hover:text-stone-900 dark:group-hover:text-white group-hover:translate-x-1 transition" />
        </div>
      </div>
    </div>
  );
};
