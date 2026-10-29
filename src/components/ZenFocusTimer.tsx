import React, { useState, useEffect } from 'react';
import { LifeProject } from '../types';
import { Play, Pause, RotateCcw, Check, Sparkles, X, Clock } from 'lucide-react';

interface Props {
  project: LifeProject | null;
  isOpen: boolean;
  onClose: () => void;
  onCompleteSession: (project: LifeProject, minutes: number) => void;
}

export const ZenFocusTimer: React.FC<Props> = ({
  project,
  isOpen,
  onClose,
  onCompleteSession,
}) => {
  const [targetMinutes, setTargetMinutes] = useState(25);
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    setSecondsLeft(targetMinutes * 60);
    setIsRunning(false);
  }, [targetMinutes, project]);

  useEffect(() => {
    let interval: any = null;
    if (isRunning && secondsLeft > 0) {
      interval = setInterval(() => {
        setSecondsLeft((s) => s - 1);
      }, 1000);
    } else if (secondsLeft === 0 && isRunning) {
      setIsRunning(false);
      if (project) {
        onCompleteSession(project, targetMinutes);
      }
    }
    return () => clearInterval(interval);
  }, [isRunning, secondsLeft, project, targetMinutes, onCompleteSession]);

  if (!isOpen || !project) return null;

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const progressPercent = ((targetMinutes * 60 - secondsLeft) / (targetMinutes * 60)) * 100;

  const handleFinishEarly = () => {
    const elapsedMinutes = Math.max(1, Math.round((targetMinutes * 60 - secondsLeft) / 60));
    onCompleteSession(project, elapsedMinutes);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/70 backdrop-blur-md">
      <div className="bg-stone-900 text-stone-100 rounded-3xl border border-stone-800 shadow-2xl w-full max-w-md p-8 text-center space-y-6 relative overflow-hidden">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-stone-400 hover:text-white rounded-full hover:bg-stone-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Project Context */}
        <div className="space-y-1">
          <span className="text-[11px] uppercase tracking-wider text-emerald-400 font-semibold flex items-center justify-center gap-1">
            <Sparkles className="w-3.5 h-3.5" />
            极简心流专注模式
          </span>
          <h3 className="text-base font-bold text-white truncate px-6">
            {project.title}
          </h3>
          <p className="text-xs text-stone-400 font-medium">
            🎯 当前微行动：{project.nextMicroAction || '全力专注推进第一步'}
          </p>
        </div>

        {/* Timer Display */}
        <div className="py-6 flex flex-col items-center justify-center">
          <div className="text-6xl font-light tracking-tight font-mono text-white">
            {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
          </div>

          <div className="w-48 bg-stone-800 rounded-full h-1 mt-6 overflow-hidden">
            <div
              className="bg-emerald-500 h-full transition-all duration-1000"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Preset Selector */}
        {!isRunning && secondsLeft === targetMinutes * 60 && (
          <div className="flex justify-center gap-2">
            {[10, 25, 45].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setTargetMinutes(m)}
                className={`px-3 py-1 rounded-xl text-xs font-medium transition ${
                  targetMinutes === m
                    ? 'bg-emerald-500 text-stone-950 font-bold'
                    : 'bg-stone-800 text-stone-300 hover:bg-stone-700'
                }`}
              >
                {m} 分钟
              </button>
            ))}
          </div>
        )}

        {/* Controls */}
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => setSecondsLeft(targetMinutes * 60)}
            className="p-3 rounded-2xl bg-stone-800 hover:bg-stone-700 text-stone-300 transition"
            title="重置计时"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setIsRunning(!isRunning)}
            className="px-8 py-3 rounded-2xl bg-white hover:bg-stone-200 text-stone-950 font-bold text-sm transition shadow-lg flex items-center gap-2"
          >
            {isRunning ? (
              <>
                <Pause className="w-4 h-4" /> 暂停心流
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" /> 开启专注
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleFinishEarly}
            className="p-3 rounded-2xl bg-stone-800 hover:bg-emerald-950 text-stone-300 hover:text-emerald-400 transition"
            title="完成本次专注并记录"
          >
            <Check className="w-4 h-4" />
          </button>
        </div>

        <p className="text-[11px] text-stone-500">
          心流心法：放下手机，关闭多余网页，只对眼前这一件事负全责。
        </p>
      </div>
    </div>
  );
};
