import { LifeProject, DailyLog, LifeWheelScores, CoachPersona, ChatMessage } from '../types';

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
