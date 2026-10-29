import React, { useState } from 'react';
import { DailyLog, LifeProject, MoodType } from '../types';
import { MOOD_CONFIG } from '../utils/categories';
import { X, Calendar, BatteryCharging, Smile, Sparkles, Plus, Trash2, ArrowUpRight } from 'lucide-react';

interface Props {
  isOpen: boolean;
  projects: LifeProject[];
  onClose: () => void;
  onSaveLog: (log: DailyLog, updatedProjects?: LifeProject[]) => void;
}

export const DailyLogModal: React.FC<Props> = ({
  isOpen,
  projects,
  onClose,
  onSaveLog,
}) => {
  const todayStr = new Date().toISOString().split('T')[0];
  const [date, setDate] = useState(todayStr);
  const [energyLevel, setEnergyLevel] = useState<number>(4);
  const [mood, setMood] = useState<MoodType>('focused');
  const [highlight, setHighlight] = useState('');
  const [wins, setWins] = useState<string[]>(['']);
  const [friction, setFriction] = useState('');
  const [timeSpentHours, setTimeSpentHours] = useState<number>(3);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(projects[0]?.id || '');
  const [projectNote, setProjectNote] = useState('');
  const [projectProgressDelta, setProjectProgressDelta] = useState<number>(5);

  if (!isOpen) return null;

  const handleWinChange = (index: number, val: string) => {
    const updated = [...wins];
    updated[index] = val;
    setWins(updated);
  };

  const handleAddWin = () => {
    setWins([...wins, '']);
  };

  const handleRemoveWin = (index: number) => {
    setWins(wins.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!highlight.trim()) return;

    const cleanedWins = wins.map((w) => w.trim()).filter(Boolean);

    let updatedProjectsList: LifeProject[] | undefined;
    const projectUpdates = [];

    if (selectedProjectId && projectNote.trim()) {
      projectUpdates.push({
        projectId: selectedProjectId,
        note: projectNote.trim(),
        progressDelta: projectProgressDelta,
      });

      // Update the targeted project's checkin log and progress
      updatedProjectsList = projects.map((p) => {
        if (p.id === selectedProjectId) {
          const newProgress = Math.min(100, Math.max(0, p.progress + projectProgressDelta));
          return {
            ...p,
            progress: newProgress,
            status: newProgress >= 100 ? 'completed' : p.status,
            checkins: [
              ...(p.checkins || []),
              {
                id: 'chk-' + Date.now(),
                date,
                note: projectNote.trim(),
                progressDelta: projectProgressDelta,
              },
            ],
            updatedAt: new Date().toISOString(),
          };
        }
        return p;
      });
    }

    const newLog: DailyLog = {
      id: 'log-' + Date.now(),
      date,
      energyLevel,
      mood,
      highlight: highlight.trim(),
      wins: cleanedWins,
      friction: friction.trim(),
      timeSpentHours: Number(timeSpentHours) || 0,
      projectUpdates,
      createdAt: new Date().toISOString(),
    };

    onSaveLog(newLog, updatedProjectsList);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-xl my-8 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
              <Sparkles className="w-5 h-5" />
            </span>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                今日觉察与项目打卡日志
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                捕捉能量流转、确认微小胜利、锚定明日动量
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Date & Energy level */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                记录日期
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <BatteryCharging className="w-3.5 h-3.5 text-emerald-500" />
                  精力电量：{energyLevel} / 5
                </span>
                <span className="text-slate-400 font-normal">
                  {energyLevel <= 2 ? '⚠️ 低电透支' : energyLevel === 3 ? '⚖️ 适度平稳' : '⚡ 充沛饱满'}
                </span>
              </label>
              <input
                type="range"
                min="1"
                max="5"
                step="1"
                value={energyLevel}
                onChange={(e) => setEnergyLevel(parseInt(e.target.value))}
                className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-600"
              />
            </div>
          </div>

          {/* Mood Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1">
              <Smile className="w-3.5 h-3.5" />
              主导心境感受
            </label>
            <div className="grid grid-cols-5 gap-2">
              {(Object.keys(MOOD_CONFIG) as MoodType[]).map((mKey) => {
                const isSelected = mood === mKey;
                const mInfo = MOOD_CONFIG[mKey];
                return (
                  <button
                    key={mKey}
                    type="button"
                    onClick={() => setMood(mKey)}
                    className={`p-2 rounded-xl border text-center transition flex flex-col items-center gap-1 ${
                      isSelected
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/60 font-bold'
                        : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span className="text-lg">{mInfo.emoji}</span>
                    <span className="text-[11px] text-slate-700 dark:text-slate-300">{mInfo.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Today's Highlight */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              今日核心战果 / 最大高光时刻 <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={highlight}
              onChange={(e) => setHighlight(e.target.value)}
              placeholder="例如：完成SaaS计费链路联调；晨跑5公里配速突破5分30"
              className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Micro-Wins list */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
              <span>值得嘉奖的微小胜利 (Micro-wins)</span>
              <button
                type="button"
                onClick={handleAddWin}
                className="text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-0.5"
              >
                <Plus className="w-3 h-3" /> 增加一项
              </button>
            </label>
            <div className="space-y-1.5">
              {wins.map((w, idx) => (
                <div key={idx} className="flex gap-2">
                  <input
                    type="text"
                    value={w}
                    onChange={(e) => handleWinChange(idx, e.target.value)}
                    placeholder={`微小胜利 ${idx + 1}：例如拒绝了无意识刷手机30分钟`}
                    className="flex-1 px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  {wins.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveWin(idx)}
                      className="p-1 text-slate-400 hover:text-rose-500"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Friction / Distractions */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              遇到的阻力、分心或能量泄漏点 (无需自责，客观记录)
            </label>
            <textarea
              rows={2}
              value={friction}
              onChange={(e) => setFriction(e.target.value)}
              placeholder="例如：下午临近3点注意力涣散，开了一个低效率会议；对复杂任务产生了拖延抗拒"
              className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Link to specific Project (Optional Checkin) */}
          {projects.length > 0 && (
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 space-y-2.5">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-800 dark:text-slate-200">
                <span className="flex items-center gap-1.5">
                  <ArrowUpRight className="w-3.5 h-3.5 text-emerald-600" />
                  关联项目打卡 (更新进度与交付记录)
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none"
                >
                  <option value="">不关联特定项目</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title} (当前: {p.progress}%)
                    </option>
                  ))}
                </select>

                {selectedProjectId && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 whitespace-nowrap">进度增加:</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="5"
                      value={projectProgressDelta}
                      onChange={(e) => setProjectProgressDelta(parseInt(e.target.value) || 0)}
                      className="w-20 px-2.5 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none"
                    />
                    <span className="text-xs text-slate-400">%</span>
                  </div>
                )}
              </div>

              {selectedProjectId && (
                <input
                  type="text"
                  value={projectNote}
                  onChange={(e) => setProjectNote(e.target.value)}
                  placeholder="针对该项目的具体产出成果或卡点备注..."
                  className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none"
                />
              )}
            </div>
          )}

          {/* Submit */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
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
              保存今日复盘与打卡
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
