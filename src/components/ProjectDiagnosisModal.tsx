import React, { useState, useEffect } from 'react';
import { LifeProject, DailyLog } from '../types';
import { requestProjectDiagnosis } from '../services/api';
import { Stethoscope, X, Loader2, Copy, Check, MessageSquareQuote, Sparkles } from 'lucide-react';

interface Props {
  project: LifeProject | null;
  userLogs: DailyLog[];
  onClose: () => void;
  onOpenCoachChat: (project: LifeProject, initialMessage?: string) => void;
}

export const ProjectDiagnosisModal: React.FC<Props> = ({
  project,
  userLogs,
  onClose,
  onOpenCoachChat,
}) => {
  const [loading, setLoading] = useState(false);
  const [diagnosis, setDiagnosis] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (project) {
      setLoading(true);
      setDiagnosis(null);
      requestProjectDiagnosis(project, userLogs)
        .then((res) => setDiagnosis(res))
        .catch((err) => {
          console.error(err);
          setDiagnosis('诊断遇到小问题，请稍后重试。');
        })
        .finally(() => setLoading(false));
    }
  }, [project]);

  if (!project) return null;

  const handleCopy = () => {
    if (diagnosis) {
      navigator.clipboard.writeText(diagnosis);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-2xl my-8 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/60 dark:bg-slate-800/40">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              <Stethoscope className="w-5 h-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  项目深度AI诊断报告
                </h3>
                <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800">
                  {project.title}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                基于系统动态、心理阻抗与投入产出比的高阶分析
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

        {/* Content */}
        <div className="p-6 max-h-[70vh] overflow-y-auto">
          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center text-center space-y-3">
              <div className="relative">
                <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
                <Sparkles className="w-4 h-4 text-amber-500 absolute -top-1 -right-1 animate-pulse" />
              </div>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                人生教练正在对项目「{project.title}」进行全盘体检...
              </p>
              <p className="text-xs text-slate-400 max-w-sm">
                正在分析进度阻力、能量泄漏点、假努力风险与破局杠杆
              </p>
            </div>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
              {diagnosis}
            </div>
          )}
        </div>

        {/* Footer */}
        {!loading && diagnosis && (
          <div className="px-6 py-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 flex items-center justify-between">
            <button
              type="button"
              onClick={handleCopy}
              className="text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
              {copied ? '已复制报告' : '复制诊断结论'}
            </button>

            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenCoachChat(
                  project,
                  `教练，我刚看了你关于「${project.title}」的诊断报告，我想进一步针对报告里的破局方案进行深入研讨，该如何具体落地？`
                );
              }}
              className="text-xs font-semibold px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm flex items-center gap-1.5 transition"
            >
              <MessageSquareQuote className="w-4 h-4" />
              进入专属教练室深聊
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
