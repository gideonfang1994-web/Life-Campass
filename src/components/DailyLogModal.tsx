import React, { useState, useEffect, useRef } from 'react';
import { DailyLog, LifeProject, MoodType } from '../types';
import { MOOD_CONFIG } from '../utils/categories';
import { parseVoiceReflection } from '../services/api';
import {
  X,
  Calendar,
  BatteryCharging,
  Smile,
  Sparkles,
  Plus,
  Trash2,
  Mic,
  MicOff,
  Loader2,
  Wand2,
  Check,
  ArrowUpRight,
} from 'lucide-react';

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
  const [selectedProjectId, setSelectedProjectId] = useState<string>(projects[0]?.id || '');
  const [projectNote, setProjectNote] = useState('');
  const [projectProgressDelta, setProjectProgressDelta] = useState<number>(5);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [isParsingVoice, setIsParsingVoice] = useState(false);
  const [coachParsedTip, setCoachParsedTip] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    // Check speech recognition support
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'zh-CN';

      recognition.onresult = (event: any) => {
        let current = '';
        for (let i = 0; i < event.results.length; i++) {
          current += event.results[i][0].transcript;
        }
        setVoiceTranscript(current);
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsRecording(false);
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current = recognition;
    }
  }, []);

  if (!isOpen) return null;

  const toggleRecording = () => {
    if (!recognitionRef.current) {
      alert('当前浏览器未启用语音识别，请在下方文本框中直接输入，或使用 Chrome/Safari 浏览器。');
      return;
    }

    if (isRecording) {
      recognitionRef.current.stop();
      setIsRecording(false);
    } else {
      try {
        setVoiceTranscript('');
        recognitionRef.current.start();
        setIsRecording(true);
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleParseVoiceText = async () => {
    const textToParse = voiceTranscript.trim();
    if (!textToParse) return;

    setIsParsingVoice(true);
    try {
      const result = await parseVoiceReflection(textToParse);
      if (result.highlight) setHighlight(result.highlight);
      if (result.wins && result.wins.length > 0) setWins(result.wins);
      if (result.friction) setFriction(result.friction);
      if (result.energyLevel) setEnergyLevel(result.energyLevel);
      if (result.mood) setMood(result.mood);
      if (result.coachTip) setCoachParsedTip(result.coachTip);
    } catch (err) {
      console.error(err);
      if (!highlight) setHighlight(textToParse);
    } finally {
      setIsParsingVoice(false);
    }
  };

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
      projectUpdates,
      coachComment: coachParsedTip || undefined,
      createdAt: new Date().toISOString(),
    };

    onSaveLog(newLog, updatedProjectsList);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/60 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-200 dark:border-stone-800 shadow-2xl w-full max-w-xl my-6 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-stone-100 dark:border-stone-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300">
              <Sparkles className="w-4 h-4 text-emerald-600" />
            </span>
            <div>
              <h3 className="text-base font-bold text-stone-900 dark:text-white">
                日常数据监督与觉察打卡
              </h3>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                支持语音录音自述、AI一键提炼结构化战果与卡点
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Voice Input Section */}
          <div className="p-3.5 rounded-2xl bg-stone-50 dark:bg-stone-800/50 border border-stone-200/80 dark:border-stone-700/80 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-stone-800 dark:text-stone-200 flex items-center gap-1.5">
                <Mic className={`w-3.5 h-3.5 ${isRecording ? 'text-rose-500 animate-pulse' : 'text-stone-500'}`} />
                语音实时输入 (口述今日收获或困惑)
              </span>

              <button
                type="button"
                onClick={toggleRecording}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition ${
                  isRecording
                    ? 'bg-rose-500 text-white animate-pulse'
                    : 'bg-stone-900 text-white dark:bg-white dark:text-stone-950 hover:opacity-90'
                }`}
              >
                {isRecording ? (
                  <>
                    <MicOff className="w-3.5 h-3.5" /> 正在录音，点击结束
                  </>
                ) : (
                  <>
                    <Mic className="w-3.5 h-3.5" /> 点击开始语音输入
                  </>
                )}
              </button>
            </div>

            {/* Transcript Area */}
            <div className="relative">
              <textarea
                rows={2}
                value={voiceTranscript}
                onChange={(e) => setVoiceTranscript(e.target.value)}
                placeholder="按住语音或在此输入原话，例如：“今天完成了SaaS定价方案，早晨慢跑5公里，感觉心流很好但下午有一点点分心...”"
                className="w-full px-3 py-2 text-xs rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none"
              />

              {voiceTranscript.trim() && (
                <button
                  type="button"
                  onClick={handleParseVoiceText}
                  disabled={isParsingVoice}
                  className="mt-1 px-3 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold flex items-center gap-1 transition disabled:opacity-50"
                >
                  {isParsingVoice ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" /> AI提炼结构中...
                    </>
                  ) : (
                    <>
                      <Wand2 className="w-3 h-3" /> AI智能整理填入下方
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {coachParsedTip && (
            <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-900/60 text-xs text-emerald-900 dark:text-emerald-200 flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">教练即时反馈：</span>
                {coachParsedTip}
              </div>
            </div>
          )}

          {/* Date & Energy Level */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" /> 日期
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <BatteryCharging className="w-3.5 h-3.5 text-emerald-600" />
                  精力电量: {energyLevel}/5
                </span>
                <span className="text-stone-400 font-normal">
                  {energyLevel <= 2 ? '⚠️ 消耗透支' : energyLevel === 3 ? '⚖️ 平稳正常' : '⚡ 充沛满格'}
                </span>
              </label>
              <input
                type="range"
                min="1"
                max="5"
                step="1"
                value={energyLevel}
                onChange={(e) => setEnergyLevel(parseInt(e.target.value))}
                className="w-full h-1.5 bg-stone-200 dark:bg-stone-700 rounded-lg appearance-none cursor-pointer accent-emerald-600"
              />
            </div>
          </div>

          {/* Mood Selector */}
          <div>
            <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1.5 flex items-center gap-1">
              <Smile className="w-3.5 h-3.5" /> 主导心境
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
                    className={`p-2 rounded-xl border text-center transition flex flex-col items-center gap-0.5 ${
                      isSelected
                        ? 'border-stone-900 dark:border-white bg-stone-100 dark:bg-stone-800 font-bold'
                        : 'border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800/60'
                    }`}
                  >
                    <span className="text-base">{mInfo.emoji}</span>
                    <span className="text-[10px] text-stone-700 dark:text-stone-300">{mInfo.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Core Highlight */}
          <div>
            <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
              今日核心战果 / 最大高光 <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={highlight}
              onChange={(e) => setHighlight(e.target.value)}
              placeholder="例如：跑通了产品海外Stripe结账；晨跑5公里配速突破"
              className="w-full px-3 py-2 text-xs rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none"
            />
          </div>

          {/* Micro Wins */}
          <div>
            <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1 flex items-center justify-between">
              <span>确认微小胜利 (Micro-wins)</span>
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
                    placeholder={`小胜 ${idx + 1}`}
                    className="flex-1 px-3 py-1.5 text-xs rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none"
                  />
                  {wins.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveWin(idx)}
                      className="p-1 text-stone-400 hover:text-rose-500"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Friction / Obstacles */}
          <div>
            <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
              遇到的阻力、分心或卡点反思 (客观记录，无须自责)
            </label>
            <textarea
              rows={2}
              value={friction}
              onChange={(e) => setFriction(e.target.value)}
              placeholder="例如：下午精神有些涣散，看手机超过了30分钟；对某项任务产生了启动拖延"
              className="w-full px-3 py-2 text-xs rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none"
            />
          </div>

          {/* Link to specific Project */}
          {projects.length > 0 && (
            <div className="p-3 rounded-2xl bg-stone-50 dark:bg-stone-800/50 border border-stone-200/80 dark:border-stone-700/80 space-y-2 text-xs">
              <span className="font-semibold text-stone-800 dark:text-stone-200 flex items-center gap-1">
                <ArrowUpRight className="w-3.5 h-3.5 text-emerald-600" />
                关联项目打卡 (更新单项完成度)
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800"
                >
                  <option value="">不关联具体项目</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title} ({p.progress}%)
                    </option>
                  ))}
                </select>

                {selectedProjectId && (
                  <div className="flex items-center gap-1">
                    <span className="text-stone-500 text-[11px]">进度+</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="5"
                      value={projectProgressDelta}
                      onChange={(e) => setProjectProgressDelta(parseInt(e.target.value) || 0)}
                      className="w-16 px-2 py-1 text-xs rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-center"
                    />
                    <span className="text-stone-400">%</span>
                  </div>
                )}
              </div>

              {selectedProjectId && (
                <input
                  type="text"
                  value={projectNote}
                  onChange={(e) => setProjectNote(e.target.value)}
                  placeholder="针对该项目的具体进展产出..."
                  className="w-full px-2.5 py-1 text-xs rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800"
                />
              )}
            </div>
          )}

          {/* Footer Submit */}
          <div className="pt-3 border-t border-stone-100 dark:border-stone-800 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
            >
              取消
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-xs font-semibold bg-stone-900 text-white dark:bg-white dark:text-stone-950 hover:opacity-90 shadow-sm transition"
            >
              保存觉察打卡
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
