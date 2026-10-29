export type ProjectCategory = 
  | 'career'        // 事业与技能
  | 'health'        // 身体与健康
  | 'wealth'        // 财富与自由
  | 'mindset'       // 心智与认知
  | 'relationship'  // 关系与家庭
  | 'creation';     // 创造与热爱

export type ProjectPriority = 'high' | 'medium' | 'low';

export type ProjectStatus = 
  | 'on_track'         // 稳步推进
  | 'needs_attention'  // 遇阻卡点
  | 'sprinting'        // 重点冲刺
  | 'paused'           // 暂时冻结
  | 'completed';       // 圆满达成

export type EnergyCost = 'recharging' | 'balanced' | 'draining';

export interface Milestone {
  id: string;
  title: string;
  completed: boolean;
  targetDays?: number;
  completedAt?: string;
}

export interface CheckInLog {
  id: string;
  date: string;
  note: string;
  progressDelta?: number;
}

export interface LifeProject {
  id: string;
  title: string;
  category: ProjectCategory;
  description: string;
  priority: ProjectPriority;
  status: ProjectStatus;
  progress: number; // 0 - 100
  targetDate?: string;
  energyCost: EnergyCost; // 充电型、平衡型、消耗型
  weeklyHours: number;    // 每周计划投入小时
  nextMicroAction: string;// 最小可执行行动 (<= 5分钟)
  mentalModel?: string;   // 核心心智模型/指导心法
  successCriteria?: string; // 交付与成功标准
  correctionNotes?: string; // 教练纠偏记录
  milestones: Milestone[];
  checkins: CheckInLog[];
  createdAt: string;
  updatedAt: string;
}

export type MoodType = 'thriving' | 'calm' | 'focused' | 'tired' | 'anxious';

export interface DailyLog {
  id: string;
  date: string; // YYYY-MM-DD
  energyLevel: number; // 1-5
  mood: MoodType;
  highlight: string;
  wins: string[];
  friction: string;
  timeSpentHours?: number;
  projectUpdates?: {
    projectId: string;
    note: string;
    progressAfter?: number;
    progressDelta?: number;
  }[];
  coachComment?: string;
  createdAt: string;
}

export interface LifeWheelScores {
  career: number;       // 事业技能
  health: number;       // 身体健康
  wealth: number;       // 财务自由
  mindset: number;      // 思维心智
  relationship: number; // 亲密关系
  family: number;       // 家庭亲情
  creation: number;     // 创造爱好
  peace: number;        // 精神宁静
}

export type CoachPersona = 'strategic' | 'mindful' | 'accountability' | 'stoic';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  relatedProjectId?: string;
}

export interface RetrospectiveReport {
  id: string;
  period: 'weekly' | 'monthly';
  generatedAt: string;
  title: string;
  content: string; // markdown report from coach
}
