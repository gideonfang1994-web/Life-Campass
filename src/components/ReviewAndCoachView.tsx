import React, { useState } from 'react';
import { RetrospectiveReport, LifeProject, DailyLog, LifeWheelScores, CoachPersona } from '../types';
import { RetrospectiveView } from './RetrospectiveView';
import { CoachChatView } from './CoachChatView';
import { LifeWheelRadar } from './LifeWheelRadar';
import {
  Compass,
  MessageSquareQuote,
  TrendingUp,
  Sparkles,
  Scale,
} from 'lucide-react';

interface Props {
  projects: LifeProject[];
  logs: DailyLog[];
  wheelScores: LifeWheelScores;
  retrospectives: RetrospectiveReport[];
  onSaveRetrospective: (report: RetrospectiveReport) => void;
  onUpdateWheelScores: (scores: LifeWheelScores) => void;
  activeProject?: LifeProject | null;
  onClearActiveProject?: () => void;
  defaultSubTab?: 'review' | 'chat';
}

export const ReviewAndCoachView: React.FC<Props> = ({
  projects,
  logs,
  wheelScores,
  retrospectives,
  onSaveRetrospective,
  onUpdateWheelScores,
  activeProject,
  onClearActiveProject,
  defaultSubTab = 'review',
}) => {
  const [subTab, setSubTab] = useState<'review' | 'chat'>(defaultSubTab);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Sub-navigation Switcher: Review vs Coach */}
      <div className="flex items-center justify-between border-b border-stone-200/80 dark:border-stone-800 pb-3">
        <div className="flex items-center gap-2 bg-stone-100 dark:bg-stone-800/80 p-1 rounded-2xl">
          <button
            type="button"
            onClick={() => setSubTab('review')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition ${
              subTab === 'review'
                ? 'bg-white dark:bg-stone-900 text-stone-950 dark:text-white shadow-sm'
                : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white'
            }`}
          >
            <TrendingUp className="w-4 h-4 text-emerald-600" />
            <span>周期战略复盘与生命之轮</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('chat')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition ${
              subTab === 'chat'
                ? 'bg-white dark:bg-stone-900 text-stone-950 dark:text-white shadow-sm'
                : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white'
            }`}
          >
            <MessageSquareQuote className="w-4 h-4 text-emerald-600" />
            <span>AI 人生教练专属研讨室</span>
          </button>
        </div>

        <span className="text-xs text-stone-400 hidden sm:block">
          未经审视的人生不值得过 · 持续迭代底层认知
        </span>
      </div>

      {/* View 1: Retrospective & Life Wheel */}
      {subTab === 'review' && (
        <div className="space-y-8">
          {/* Life Wheel Section */}
          <LifeWheelRadar scores={wheelScores} onChange={onUpdateWheelScores} />

          {/* Retrospective Section */}
          <RetrospectiveView
            projects={projects}
            logs={logs}
            wheelScores={wheelScores}
            retrospectives={retrospectives}
            onSaveRetrospective={onSaveRetrospective}
          />
        </div>
      )}

      {/* View 2: Coach Studio */}
      {subTab === 'chat' && (
        <CoachChatView
          projects={projects}
          recentLogs={logs}
          wheelScores={wheelScores}
          activeProject={activeProject}
          onClearActiveProject={onClearActiveProject}
        />
      )}
    </div>
  );
};
