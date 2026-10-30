import {
  LifeProject,
  DailyLog,
  LifeWheelScores,
  CoachPersona,
  ChatMessage,
  AcceleratedGoal,
  GoalOptimalArrangement,
} from '../types';

export interface MilestoneBreakdownResponse {
  milestones: { title: string; targetDays?: number }[];
  nextMicroAction: string;
  coachTip: string;
}

export async function streamCoachChat(
  messages: ChatMessage[],
  persona: CoachPersona,
  contextData: {
    projects: any[];
    recentLogs: DailyLog[];
    wheelScores: LifeWheelScores;
    activeTargetProject?: any;
  },
  onChunk: (text: string) => void,
  onComplete: () => void,
  onError: (err: any) => void
) {
  try {
    const response = await fetch('/api/coach/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages,
        persona,
        contextData,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    if (!response.body) {
      throw new Error('ReadableStream not supported in this browser.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ')) {
          const dataStr = trimmed.slice(6);
          if (dataStr === '[DONE]') {
            onComplete();
            return;
          }
          try {
            const parsed = JSON.parse(dataStr);
            if (parsed.text) {
              onChunk(parsed.text);
            }
          } catch (e) {
            // Ignore parse errors on partial chunks
          }
        }
      }
    }
    onComplete();
  } catch (err) {
    console.error('Chat stream error:', err);
    onError(err);
  }
}

export async function requestProjectDiagnosis(
  project: LifeProject,
  userLogs: DailyLog[]
): Promise<string> {
  const response = await fetch('/api/coach/analyze-project', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project, userLogs }),
  });

  if (!response.ok) {
    throw new Error('Diagnosis request failed');
  }

  const data = await response.json();
  return data.diagnosis || data.fallback || '诊断生成中...';
}

export async function requestRetrospective(
  period: 'weekly' | 'monthly',
  projects: LifeProject[],
  logs: DailyLog[],
  wheelScores: LifeWheelScores
): Promise<string> {
  const response = await fetch('/api/coach/review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ period, projects, logs, wheelScores }),
  });

  if (!response.ok) {
    throw new Error('Retrospective generation failed');
  }

  const data = await response.json();
  return data.report || '复盘生成中...';
}

export async function requestSmartBreakdown(
  goalTitle: string,
  category: string,
  currentLevel?: string
): Promise<MilestoneBreakdownResponse> {
  const response = await fetch('/api/coach/smart-breakdown', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ goalTitle, category, currentLevel }),
  });

  if (!response.ok) {
    throw new Error('Breakdown request failed');
  }

  return response.json();
}

export async function requestCourseCorrection(
  dimension: string,
  title: string,
  progress: number,
  bottleneck?: string,
  tasks?: any[]
): Promise<string> {
  const response = await fetch('/api/coach/course-correction', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dimension, title, progress, bottleneck, tasks }),
  });

  if (!response.ok) {
    throw new Error('Course correction request failed');
  }

  const data = await response.json();
  return data.correction || '暂无法获取纠偏方案';
}

export interface ParsedReflection {
  highlight: string;
  wins: string[];
  friction: string;
  energyLevel: number;
  mood: 'thriving' | 'calm' | 'focused' | 'tired' | 'anxious';
  coachTip?: string;
}

export async function parseVoiceReflection(rawText: string): Promise<ParsedReflection> {
  const response = await fetch('/api/coach/parse-reflection', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rawText }),
  });

  if (!response.ok) {
    throw new Error('Failed to parse voice reflection');
  }

  return response.json();
}

export interface MuskBreakdownResponse {
  oneYearTarget: string;
  fundamentalTruth: string;
  deletedProcesses: string[];
  coreBottleneck: string;
  unconventionalPath: string;
  milestones: {
    id: string;
    phase: 'Q1' | 'Q2' | 'Q3' | 'Q4';
    title: string;
    targetDays?: number;
    verificationProof: string;
  }[];
  muskDirective: string;
}

export async function generateMuskBreakdown(payload: {
  title: string;
  category: string;
  fiveYearVision: string;
  context?: string;
}): Promise<MuskBreakdownResponse> {
  const response = await fetch('/api/coach/musk-breakdown', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error('Musk breakdown request failed');
  }

  return response.json();
}

export interface MuskSupervisionResponse {
  velocityScore: number;
  paceEvaluation: 'ahead_of_5x' | 'on_pace_5x' | 'lagging_risk' | 'linear_trap';
  blockerAlert: string;
  ruthlessAudit: string;
  muskDirective: string;
}

export async function auditMuskGoalSupervision(payload: {
  goalTitle: string;
  oneYearTarget: string;
  currentProgress: number;
  actualWork?: string;
  recentLogs?: any[];
}): Promise<MuskSupervisionResponse> {
  const response = await fetch('/api/coach/musk-supervision', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error('Musk supervision request failed');
  }

  return response.json();
}

// 目标实现：AI 教练深度诊断与排期交流 (Streaming SSE)
export async function streamGoalConsultationChat(
  goal: AcceleratedGoal,
  messages: { role: string; content: string }[],
  contextData: any,
  onChunk: (text: string) => void,
  onComplete: () => void,
  onError: (err: any) => void
) {
  try {
    const response = await fetch('/api/coach/goal-consultation-chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        goal,
        messages,
        contextData,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    if (!response.body) {
      throw new Error('ReadableStream not supported');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ')) {
          const dataStr = trimmed.slice(6);
          if (dataStr === '[DONE]') {
            onComplete();
            return;
          }
          try {
            const parsed = JSON.parse(dataStr);
            if (parsed.text) {
              onChunk(parsed.text);
            }
          } catch (e) {
            // Ignore parse errors on partial chunks
          }
        }
      }
    }
    onComplete();
  } catch (err) {
    console.error('Goal consultation stream error:', err);
    onError(err);
  }
}

// 目标实现：AI 教练为目标生成【最优重排方案】
export async function requestGoalOptimalArrangement(
  goal: AcceleratedGoal,
  dialogueHistory: { role: string; content: string }[],
  constraints?: string
): Promise<GoalOptimalArrangement> {
  const response = await fetch('/api/coach/goal-optimize-arrangement', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      goal,
      dialogueHistory,
      constraints,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to generate optimal goal arrangement');
  }

  const data = await response.json();
  return {
    ...data,
    generatedAt: new Date().toISOString(),
  };
}

// 通用全模块 AI 自动填充服务
export async function requestAiAutofill(
  type: 'goal' | 'project' | 'today_plan' | 'daily_log',
  context?: Record<string, any>
): Promise<any> {
  const response = await fetch('/api/ai/autofill', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, context }),
  });

  if (!response.ok) {
    throw new Error('AI autofill failed');
  }

  return response.json();
}


