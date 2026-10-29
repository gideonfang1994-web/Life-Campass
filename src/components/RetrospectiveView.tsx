import React, { useState } from 'react';
import { RetrospectiveReport, LifeProject, DailyLog, LifeWheelScores } from '../types';
import { requestRetrospective } from '../services/api';
import {
  Compass,
  Sparkles,
  Calendar,
  Loader2,
  Copy,
  Check,
  TrendingUp,
  Award,
  AlertTriangle,
  FileText,
  Clock,
  Printer,
} from 'lucide-react';

interface Props {
  projects: LifeProject[];
  logs: DailyLog[];
  wheelScores: LifeWheelScores;
  retrospectives: RetrospectiveReport[];
  onSaveRetrospective: (report: RetrospectiveReport) => void;
}

export const RetrospectiveView: React.FC<Props> = ({
  projects,
  logs,
  wheelScores,
  retrospectives,
  onSaveRetrospective,
}) => {
  const [period, setPeriod] = useState<'weekly' | 'monthly'>('weekly');
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedRetroId, setSelectedRetroId] = useState<string>(
    retrospectives[0]?.id || ''
  );
  const [copied, setCopied] = useState(false);

  const currentReport =
    retrospectives.find((r) => r.id === selectedRetroId) || retrospectives[0];

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const markdown = await requestRetrospective(period, projects, logs, wheelScores);
      const newReport: RetrospectiveReport = {
        id: 'retro-' + Date.now(),
        period,
        generatedAt: new Date().toISOString(),
        title: `${period === 'weekly' ? '周度' : '月度'}人生战略复盘简报 (${new Date().toLocaleDateString()})`,
        content: markdown,
      };

      onSaveRetrospective(newReport);
      setSelectedRetroId(newReport.id);
    } catch (err) {
      console.error(err);
      alert('复盘报告生成遇到了些阻碍，请稍后重试。');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = () => {
    if (currentReport?.content) {
      navigator.clipboard.writeText(currentReport.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const activeProjectsCount = projects.filter((p) => p.status !== 'completed').length;
  const recentLogsCount = logs.length;

  return (
    <div className="space-y-6">
      {/* Top Banner: Generate Call to Action */}
      <div className="bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-md relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-12 -translate-y-8 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-2xl">
          <div className="flex items-center gap-2 mb-2">
            <span className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-300">
              <Compass className="w-4 h-4" />
            </span>
            <span className="text-xs font-semibold tracking-wider uppercase text-emerald-300">
              战略闭环与认知升级
            </span>
          </div>

          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-2">
            人生周期性战略复盘引擎
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed mb-6">
            未经审视的人生不值得过。AI教练将统揽你的 {activeProjectsCount} 个推进中项目、
            {recentLogsCount} 条真实打卡与精力数据，穿透迷雾，提炼下个周期的三大不可妥协指令。
          </p>

          <div className="flex flex-wrap items-center gap-3">
            {/* Period selector */}
            <div className="bg-slate-800/80 p-1 rounded-xl border border-slate-700/80 flex items-center">
              <button
                type="button"
                onClick={() => setPeriod('weekly')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  period === 'weekly'
                    ? 'bg-emerald-600 text-white shadow'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                周度复盘 (Weekly)
              </button>
              <button
                type="button"
                onClick={() => setPeriod('monthly')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  period === 'monthly'
                    ? 'bg-emerald-600 text-white shadow'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                月度复盘 (Monthly)
              </button>
            </div>

            {/* Generate Button */}
            <button
              type="button"
              disabled={isGenerating}
              onClick={handleGenerate}
              className="px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs sm:text-sm transition flex items-center gap-2 shadow-lg disabled:opacity-50"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  AI教练深度推演复盘中...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  一键生成本周期深度复盘
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area: Sidebar of History + Active Report */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Past Reports List */}
        <div className="lg:col-span-4 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FileText className="w-4 h-4 text-emerald-600" />
              历史复盘档案 ({retrospectives.length})
            </h3>
          </div>

          {retrospectives.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              暂无历史复盘记录，点击上方按钮开启第一次复盘！
            </div>
          ) : (
            <div className="space-y-2 max-h-[560px] overflow-y-auto">
              {retrospectives.map((retro) => {
                const isSelected = retro.id === currentReport?.id;
                return (
                  <div
                    key={retro.id}
                    onClick={() => setSelectedRetroId(retro.id)}
                    className={`p-3 rounded-2xl border cursor-pointer transition ${
                      isSelected
                        ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/40 shadow-sm'
                        : 'border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-semibold text-slate-800 dark:text-slate-100 truncate pr-2">
                        {retro.title}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {retro.period === 'weekly' ? '周度' : '月度'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                      <Clock className="w-3 h-3" />
                      <span>{new Date(retro.generatedAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Selected Report Viewer */}
        <div className="lg:col-span-8 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-sm">
          {currentReport ? (
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800 gap-3 mb-6">
                <div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                    {currentReport.title}
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 flex items-center gap-2">
                    <span>生成时间：{new Date(currentReport.generatedAt).toLocaleString()}</span>
                  </p>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition flex items-center gap-1.5"
                  >
                    {copied ? (
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    {copied ? '已复制 Markdown' : '复制复盘文本'}
                  </button>

                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800"
                    title="打印或保存为PDF"
                  >
                    <Printer className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Rendered Markdown report */}
              <div className="prose prose-slate dark:prose-invert max-w-none text-xs sm:text-sm leading-relaxed whitespace-pre-wrap font-sans">
                {currentReport.content}
              </div>
            </div>
          ) : (
            <div className="py-16 text-center space-y-3">
              <Compass className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto" />
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">
                尚未生成任何复盘报告
              </p>
              <p className="text-xs text-slate-400">
                点击上方「一键生成本周期深度复盘」，AI人生教练将结合你的近期数据输出洞见。
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
