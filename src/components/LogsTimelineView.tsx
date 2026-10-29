import React, { useState } from 'react';
import { DailyLog, LifeProject } from '../types';
import { MOOD_CONFIG } from '../utils/categories';
import {
  Calendar,
  BatteryCharging,
  Trophy,
  AlertCircle,
  Plus,
  Trash2,
  Clock,
  Search,
  Sparkles,
} from 'lucide-react';

interface Props {
  logs: DailyLog[];
  projects: LifeProject[];
  onOpenNewLog: () => void;
  onDeleteLog: (id: string) => void;
}

export const LogsTimelineView: React.FC<Props> = ({
  logs,
  projects,
  onOpenNewLog,
  onDeleteLog,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredLogs = logs.filter(
    (l) =>
      l.highlight.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.friction.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.wins.some((w) => w.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Compute energy stats
  const averageEnergy =
    logs.length > 0
      ? (logs.reduce((acc, cur) => acc + cur.energyLevel, 0) / logs.length).toFixed(1)
      : '0';

  return (
    <div className="space-y-6">
      {/* Top Bar with summary cards & Search */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Metric 1 */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">累计觉察日志</div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
              {logs.length} <span className="text-xs font-normal text-slate-400">篇记录</span>
            </div>
          </div>
          <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600">
            <Calendar className="w-5 h-5" />
          </div>
        </div>

        {/* Metric 2 */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">平均精力充盈度</div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
              {averageEnergy} <span className="text-xs font-normal text-slate-400">/ 5.0</span>
            </div>
          </div>
          <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600">
            <BatteryCharging className="w-5 h-5" />
          </div>
        </div>

        {/* Metric 3 */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">微胜利累积</div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
              {logs.reduce((sum, l) => sum + (l.wins?.length || 0), 0)}{' '}
              <span className="text-xs font-normal text-slate-400">次小胜</span>
            </div>
          </div>
          <div className="p-3 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600">
            <Trophy className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="搜索战果高光、微胜利或反思卡点..."
            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <button
          type="button"
          onClick={onOpenNewLog}
          className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition flex items-center gap-1.5 shadow-sm"
        >
          <Plus className="w-4 h-4" />
          记录今日复盘与打卡
        </button>
      </div>

      {/* Logs Timeline */}
      <div className="space-y-4">
        {filteredLogs.length === 0 ? (
          <div className="py-16 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 text-center space-y-3">
            <Calendar className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
            <p className="text-xs text-slate-500">
              {searchTerm ? '没有找到符合条件的日志' : '暂无日志记录，开启你的第一篇日常复盘吧'}
            </p>
          </div>
        ) : (
          filteredLogs.map((log) => {
            const moodInfo = MOOD_CONFIG[log.mood] || MOOD_CONFIG.focused;
            return (
              <div
                key={log.id}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-sm space-y-3 relative group"
              >
                {/* Header info */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-slate-400" />
                      {log.date}
                    </span>
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center gap-1 font-medium">
                      <span>{moodInfo.emoji}</span>
                      <span>{moodInfo.label}</span>
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 font-medium">
                      ⚡ 精力电量 {log.energyLevel}/5
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (confirm('确定要删除这篇日志吗？')) {
                        onDeleteLog(log.id);
                      }
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-500 transition"
                    title="删除日志"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Highlight */}
                <div className="p-3 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/60">
                  <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300 block mb-0.5">
                    🎯 今日核心高光 / 最大战果：
                  </span>
                  <p className="text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-100">
                    {log.highlight}
                  </p>
                </div>

                {/* Micro Wins */}
                {log.wins && log.wins.length > 0 && (
                  <div>
                    <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 block mb-1">
                      🏆 确认的微小胜利 (Micro-wins)：
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {log.wins.map((w, i) => (
                        <span
                          key={i}
                          className="text-xs px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-700 text-slate-700 dark:text-slate-200"
                        >
                          ✓ {w}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Friction */}
                {log.friction && (
                  <div className="text-xs text-slate-600 dark:text-slate-400 flex items-start gap-1.5 pt-1">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                    <span>
                      <strong className="text-slate-700 dark:text-slate-300">阻抗与分心反思：</strong>
                      {log.friction}
                    </span>
                  </div>
                )}

                {/* Associated Project Checkin Updates */}
                {log.projectUpdates && log.projectUpdates.length > 0 && (
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block mb-1">
                      项目协同打卡
                    </span>
                    <div className="space-y-1">
                      {log.projectUpdates.map((pu, idx) => {
                        const targetProj = projects.find((p) => p.id === pu.projectId);
                        return (
                          <div
                            key={idx}
                            className="text-xs text-slate-700 dark:text-slate-300 flex items-center justify-between"
                          >
                            <span className="font-medium text-emerald-600 dark:text-emerald-400">
                              📌 {targetProj?.title || '指定项目'}
                            </span>
                            <span className="text-slate-500">{pu.note}</span>
                            {pu.progressDelta !== undefined && (
                              <span className="text-[11px] font-bold text-emerald-500">
                                +{pu.progressDelta}%
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Coach Comment if exists */}
                {log.coachComment && (
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/50 dark:border-slate-700/50 text-xs text-slate-600 dark:text-slate-300 flex items-start gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">教练批注：</span>
                      {log.coachComment}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
