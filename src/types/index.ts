export type ProjectCategory = 
  | 'career'        // 事业与技能 (工作)
  | 'health'        // 身体与健康 (健康)
  | 'wealth'        // 财富与自由 (财富)
  | 'mindset'       // 认知与心智 (认知)
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
  nextMicroAction: string;// 最小可执行行动 (<= 5分钟多米诺骨牌)
  mentalModel?: string;   // 核心心智模型 (如: 唯一真理、代码与媒体杠杆、专长复利)
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

// 《最重要的事只有一件》+《纳瓦尔宝典》：计划与实际工作实绩对照记录
export interface PlanActualRecord {
  id: string;
  date: string;
  dimension: ProjectCategory;
  projectId?: string;
  oneThingGoal: string;        // The ONE Thing 唯一核心事项
  plannedHours: number;        // 计划投入工时
  plannedOutput: string;       // 计划核心交付物
  actualAction: string;        // 实际执行工作
  actualHours: number;         // 实际耗时
  actualOutput: string;        // 实际产出成果
  fulfillmentRate: number;     // 达成率 0 - 100%
  deviationReason: string;     // 偏离原因剖析 (假努力、外部打断、认知偏差)
  leverageType: 'high_leverage' | 'neutral' | 'low_leverage'; // 纳瓦尔杠杆属性
  coachTip?: string;           // 教练箴言
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
  content: string;
}

// ==========================================
// 马斯克 5X 极速目标实现引擎 (1年完成5年进度)
// ==========================================
export interface MuskGoalMilestone {
  id: string;
  phase: 'Q1' | 'Q2' | 'Q3' | 'Q4' | string;
  title: string;
  targetDays?: number;
  completed: boolean;
  completedAt?: string;
  verificationProof: string; // 交付证据 (拒绝虚假打勾，如 "GitHub Repo 上线链接", "体检报告体脂率指标")
}

export interface AcceleratedGoal {
  id: string;
  title: string;
  category: ProjectCategory;
  fiveYearVision: string;    // 原定5年完成的宏伟愿景
  oneYearTarget: string;     // 倒逼1年达成的极限指标 (5X 时间压缩)
  progress: number;          // 0 - 100%
  status: 'active' | 'completed' | 'paused';
  firstPrinciples: {
    fundamentalTruth: string;    // 核心物理/底层事实 (剥离一切中间借口与常规假象)
    deletedProcesses: string[];  // 马斯克五步算法第2步：必须彻底删减的伪需求与虚耗环节
    coreBottleneck: string;      // 当前唯一限速瓶颈 (Rate-limiting step)
    unconventionalPath: string;  // 避开传统线性慢速做法的非常规破局解法
  };
  muskAlgorithm: {
    questionRequirement: boolean; // ① 质疑每一个所谓必做需求
    deleteWaste: boolean;         // ② 极限删除无用环节
    simplifyOptimize: boolean;    // ③ 简化优化核心流程
    accelerateCycle: boolean;     // ④ 将迭代周期从月缩短到天
    automateLeverage: boolean;    // ⑤ 自动化与杠杆锁定
  };
  milestones: MuskGoalMilestone[];
  supervision: {
    velocityScore: number;       // 0-100 (5倍速航向指数)
    paceEvaluation: 'ahead_of_5x' | 'on_pace_5x' | 'lagging_risk' | 'linear_trap'; // 领先/在轨/滞后/陷入线性慢速陷阱
    blockerAlert?: string;       // 阻力卡点预警
    muskDirective?: string;      // 马斯克风格硬核监督令
    lastAuditDate?: string;
  };
  relatedProjectId?: string;
  consultationHistory?: GoalConsultationMessage[];
  lastOptimalArrangement?: GoalOptimalArrangement;
  createdAt: string;
  updatedAt: string;
}

export interface GoalConsultationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface GoalOptimalArrangement {
  diagnosisSummary: string;
  reasoning?: string;
  ruthlessAuditSummary?: string;
  coreFocusImmediate: string;
  newBottleneck: string;
  newUnconventionalPath: string;
  weeklyPacingGuideline: string;
  optimizedMilestones: MuskGoalMilestone[];
  coachDirective: string;
  generatedAt: string;
}
