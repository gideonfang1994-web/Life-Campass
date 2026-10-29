import React, { useState, useEffect } from 'react';
import { LifeProject } from '../types';
import { requestCourseCorrection } from '../services/api';
import { DIMENSIONS_CONFIG } from '../utils/categories';
import { Compass, X, Loader2, Sparkles, Check, ArrowRight, Zap, AlertTriangle } from 'lucide-react';

interface Props {
  project: LifeProject | null;
  onClose: () => void;
  onApplyCorrection: (projectId: string, newMicroAction: string, note?: string) => void;
}

export const CourseCorrectionModal: React.FC<Props> = ({
  project,
  onClose,
  onApplyCorrection,
}) => {
  const [loading, setLoading] = useState(false);
  const [bottleneckInput, setBottleneckInput] = useState('');
  const [correctionReport, setCorrectionReport] = useState<string | null>(null);
  const [recommendedAction, setRecommendedAction] = useState<string>('');

  useEffect(() => {
    if (project) {
      setBottleneckInput(project.status === 'needs_attention' ? '推进卡点，缺乏动力或被繁琐细节拖延' : '');
      setCorrectionReport(null);
      setRecommendedAction('');
      fetchCorrection();
    }
  }, [project]);

  const fetchCorrection = async () => {
    if (!project) return;
    setLoading(true);
    try {
      const dimLabel = DIMENSIONS_CONFIG[project.category]?.label || project.category;
      const res = await requestCourseCorrection(
        dimLabel,
        project.title,
        project.progress,
        bottleneckInput || '感到执行停滞、阻抗或偏离原定计划',
        project.milestones
      );
      setCorrectionReport(res);

      // Attempt to extract a suggested action if formatted
      const match = res.match(/⚡\s*\*\*今日第一击\*\*[：:]\s*([^\n\r]+)/);
      if (match && match[1]) {
        setRecommendedAction(match[1].trim());
      } else {
        setRecommendedAction('设定10分钟无干扰番茄钟，仅完成最简单的一个动作');
      }
    } catch (err) {
      console.error(err);
      setCorrectionReport('诊断获取受阻，请稍后重试。');
    } finally {
      setLoading(false);
    }
  };

  if (!project) return null;

  const dimInfo = DIMENSIONS_CONFIG[project.category];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-200 dark:border-stone-800 shadow-2xl w-full max-w-2xl overflow-hidden my-6">
        {/* Header */}
        <div className="px-6 py-4 border-b border-stone-100 dark:border-stone-800 flex items-center justify-between bg-stone-50/50 dark:bg-stone-800/30">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Compass className="w-5 h-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-stone-900 dark:text-white">
                  人生教练 · 维度纠偏与路径重构
                </h3>
                <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300">
                  {dimInfo?.label}
                </span>
              </div>
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                项目：{project.title} (完成度 {project.progress}%)
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 max-h-[72vh] overflow-y-auto space-y-4">
          {/* Custom bottleneck input */}
          <div className="p-3.5 rounded-2xl bg-stone-50 dark:bg-stone-800/50 border border-stone-200/80 dark:border-stone-700/80">
            <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1.5 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
              当前遇到的具体偏离或心理阻抗 (可补充)：
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={bottleneckInput}
                onChange={(e) => setBottleneckInput(e.target.value)}
                placeholder="例如：拖延了3天没动笔、任务太大不知道从哪下手、精力透支..."
                className="flex-1 px-3 py-1.5 text-xs rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-stone-400"
              />
              <button
                type="button"
                onClick={fetchCorrection}
                disabled={loading}
                className="px-3 py-1.5 rounded-xl bg-stone-900 text-white dark:bg-white dark:text-stone-900 text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition"
              >
                {loading ? '分析中...' : '重新诊断'}
              </button>
            </div>
          </div>

          {/* Coach Report */}
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-2.5">
              <Loader2 className="w-6 h-6 text-stone-500 animate-spin" />
              <p className="text-xs font-medium text-stone-600 dark:text-stone-300">
                教练正在审视当前路径偏差，设计减负与断舍离纠偏令...
              </p>
            </div>
          ) : (
            correctionReport && (
              <div className="prose prose-sm dark:prose-invert max-w-none text-xs sm:text-sm text-stone-800 dark:text-stone-200 whitespace-pre-wrap leading-relaxed font-sans">
                {correctionReport}
              </div>
            )
          )}
        </div>

        {/* Action Footer */}
        {!loading && correctionReport && (
          <div className="px-6 py-4 border-t border-stone-100 dark:border-stone-800 bg-stone-50/50 dark:bg-stone-800/30 flex flex-col sm:flex-row items-center justify-between gap-3">
            <span className="text-xs text-stone-500">
              纠偏核心：放下全盘焦虑，先在24小时内重启微小闭环。
            </span>

            <button
              type="button"
              onClick={() => {
                onApplyCorrection(
                  project.id,
                  recommendedAction || project.nextMicroAction,
                  '已由教练纠偏校准'
                );
                onClose();
              }}
              className="w-full sm:w-auto px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm transition"
            >
              <Zap className="w-3.5 h-3.5 fill-current" />
              采纳纠偏行动令，重置项目第一步
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
