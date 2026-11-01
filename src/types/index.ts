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
// 日 / 周 / 月 / 季 / 年 五级计划体系 (勾稽分解链)
// ==========================================

export type PlanCycle = 'day' | 'week' | 'month' | 'quarter' | 'year';

export type PlanNodeStatus = 'not_started' | 'in_progress' | 'completed' | 'blocked' | 'dropped';

/**
 * 计划节点：构成 年→季→月→周→日 的树形结构。
 * 父节点通过 children 关联子节点，进度由子节点加权自动汇总（勾稽）。
 */
export interface PlanNode {
  id: string;
  title: string;              // 该层要达成的核心成果（Outcome，非 To-Do）
  cycle: PlanCycle;           // 所属周期层级
  periodKey: string;          // 周期键，如 '2026' / '2026-Q3' / '2026-10' / '2026-W43' / '2026-10-31'
  parentId?: string;           // 上级节点 id；顶级为 undefined
  children: string[];         // 下级节点 id 列表
  dimension: ProjectCategory; // 生命维度归属
  projectId?: string;         // 关联的生命项目
  goalId?: string;            // 关联的 5X 目标

  plannedHours: number;       // 计划投入工时
  actualHours: number;        // 实际投入工时
  weight: number;             // 权重（同级内相对重要性，默认 1）
  progress: number;           // 0-100，父节点由子节点汇总覆盖
  declaredProgress?: number;  // 手动登记的自评进度（父节点勾稽前），用于识别进度不一致
  status: PlanNodeStatus;

  // 交付物与验收标准：勾稽的"硬证据"锚点
  deliverable: string;        // 完成后具体交付什么
  successCriteria: string;    // 判定达成的硬标准（可量化）
  verificationProof?: string; // 交付证据（拒绝虚假打勾，如"Stripe收款截图"）

  note: string;               // 进度备注 / 偏差原因
  createdAt: string;
  updatedAt: string;
}

/** 勾稽诊断问题 */
export type ReconciliationIssueType =
  | 'orphan'            // 孤儿节点：有子节点但未挂到父节点（树断裂）
  | 'leaf_without_output'  // 叶子节点没有交付物
  | 'unallocated_time'  // 工时漏项：父节点承诺工时 > 子节点承诺工时之和
  | 'overallocated_time' // 过度承诺：子节点承诺工时之和 > 父节点承诺工时
  | 'time_overrun'      // 实耗超计划（超 30% 以上）
  | 'time_underuse'     // 计划未用掉（低于 50%）
  | 'progress_inconsistent' // 进度不一致：父节点进度与子节点汇总偏差过大
  | 'goal_unlinked'     // 目标脱钩：节点未关联任何项目/目标
  | 'no_descendant'     // 断链：中间层节点没有任何下级
  | 'empty_period'      // 空周期：某周期没有任何计划
  | 'period_mismatch'   // 跨期错配：子节点周期不属于父节点周期区间
  | 'completed_no_proof'; // 标记完成但没有交付证据

export interface ReconciliationIssue {
  id: string;
  type: ReconciliationIssueType;
  severity: 'info' | 'warning' | 'critical';
  cycle: PlanCycle;
  nodeId?: string;
  nodeTitle?: string;
  periodKey: string;
  message: string;
  suggestion: string;
  metric?: Record<string, number>;
}

/** 勾稽汇总结果（某一层） */
export interface CycleRollup {
  cycle: PlanCycle;
  periodKey: string;
  label: string;
  nodeCount: number;
  /** 加权平均进度 0-100 */
  progress: number;
  /** 计划工时合计 */
  plannedHours: number;
  /** 实际工时合计 */
  actualHours: number;
  /** 工时达成率 0-100 */
  hourFulfillment: number;
  completedCount: number;
  blockedCount: number;
  /** 该层节点 id 列表 */
  nodeIds: string[];
  /** 勾稽出的问题数 */
  issueCount: number;
}

export interface PlanBoardState {
  nodes: PlanNode[];
  /** 当前选中的周期层级 */
  activeCycle: PlanCycle;
  /** 当前选中的周期键 */
  activePeriodKey: string;
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

// ==========================================
// 量化健康记录与分析 (睡眠 / 运动 / 饮食 / 体重 / 心率)
// ==========================================

/**
 * 数据来源标记。
 *
 * 现实约束（已核实，勿虚构 API）：
 *  - 薄荷健康【没有】开放平台 / 开发者 API，仅支持 App 内导出 Excel；
 *  - Apple HealthKit 是【纯设备端】框架，没有服务端 API，浏览器读不到；
 *  - 华为运动健康 / Android Health Connect 支持导出 CSV；
 *  - 微信运动只能在小程序端通过 wx.getWeRunData 获取。
 * 因此本模块采用「多源文件导入 + 本地分析」路线，不依赖任何虚构的云端 API。
 */
export type HealthDataSource =
  | 'manual'        // 手动记录
  | 'apple_health'  // Apple 健康 export.xml
  | 'boohee'        // 薄荷健康导出的 Excel/CSV
  | 'huawei'        // 华为运动健康导出 CSV
  | 'xiaomi'        // 小米运动健康 / Zepp 导出
  | 'wechat_run'    // 微信运动（小程序端回传）
  | 'csv';          // 通用 CSV / JSON 导入

/** 单日健康数据条目。缺失的指标留空即可（可选字段）。 */
export interface HealthDailyEntry {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  source: HealthDataSource;

  // ---- 睡眠 ----
  /** 睡眠总时长（小时，含深睡+浅睡+REM） */
  sleepHours?: number;
  /** 深睡时长（小时） */
  deepSleepHours?: number;
  /** REM 睡眠时长（小时） */
  remSleepHours?: number;
  /** 浅睡时长（小时） */
  lightSleepHours?: number;
  /** 睡眠中醒来次数 */
  awakenCount?: number;
  /** 入睡时间（分钟，从 18:00 起算，跨夜可 > 720） */
  bedtimeMinutes?: number;
  /** 起床时间（分钟，从 00:00 起算） */
  wakeTimeMinutes?: number;

  // ---- 运动 ----
  /** 运动时长（分钟） */
  exerciseMinutes?: number;
  /** 步数 */
  steps?: number;
  /** 消耗热量（千卡） */
  caloriesBurned?: number;
  /** 活动距离（公里） */
  distanceKm?: number;
  /** 运动类型 */
  exerciseType?: string;

  // ---- 饮食 ----
  /** 摄入热量（千卡） */
  caloriesIntake?: number;
  /** 蛋白质（克） */
  proteinG?: number;
  /** 碳水（克） */
  carbsG?: number;
  /** 脂肪（克） */
  fatG?: number;
  /** 饮水（毫升） */
  waterMl?: number;
  /** 正餐次数（早/午/晚/加餐） */
  mealCount?: number;

  // ---- 身体 ----
  /** 体重（公斤） */
  weightKg?: number;
  /** 体脂率（%） */
  bodyFatPct?: number;
  /** 静息心率（次/分） */
  restingHr?: number;
  /** 血压（收缩压/舒张压 mmHg） */
  systolicBp?: number;
  diastolicBp?: number;

  /** 主观精力（1-5），可与日志联动 */
  energyLevel?: number;
  /** 备注 */
  note?: string;

  createdAt: string;
  updatedAt: string;
}

/** 健康目标配置（用户可调，驱动达标判定与评分） */
export interface HealthGoals {
  /** 目标睡眠时长（小时） */
  sleepTargetHours: number;
  /** 目标运动时长（分钟/天） */
  exerciseTargetMinutes: number;
  /** 目标步数 */
  stepTarget: number;
  /** 目标饮水（毫升/天） */
  waterTargetMl: number;
  /** 每日热量摄入上限（千卡），0 表示不限制 */
  calorieIntakeCap: number;
  /** 每日热量消耗目标（千卡） */
  calorieBurnTarget: number;
  /** 目标体重（公斤），0 表示不设 */
  targetWeightKg: number;
  /** 目标体脂率（%），0 表示不设 */
  targetBodyFatPct: number;
}

/** 一条健康分析洞察 */
export interface HealthInsight {
  id: string;
  /** 洞察类型 */
  kind: 'correlation' | 'trend' | 'anomaly' | 'achievement' | 'warning' | 'advice';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  detail: string;
  /** 支撑该洞察的量化证据 */
  evidence?: Record<string, string | number>;
  /** 相关联的日期 */
  date?: string;
  /** 建议动作 */
  action?: string;
}

/** 周期汇总（日/周/月） */
export type HealthPeriod = 'day' | 'week' | 'month';

export interface HealthRollup {
  period: HealthPeriod;
  /** 周期标识：日=YYYY-MM-DD，周=YYYY-Www，月=YYYY-MM */
  key: string;
  label: string;
  /** 有效数据天数 */
  daysRecorded: number;
  /** 睡眠平均（小时） */
  avgSleepHours: number;
  /** 运动平均（分钟） */
  avgExerciseMinutes: number;
  /** 步数日均 */
  avgSteps: number;
  /** 摄入热量日均 */
  avgCaloriesIntake: number;
  /** 消耗热量日均 */
  avgCaloriesBurned: number;
  /** 热量平衡日均（摄入 - 消耗） */
  avgCalorieBalance: number;
  /** 饮水日均（毫升） */
  avgWaterMl: number;
  /** 期末体重 */
  latestWeightKg: number;
  /** 体重变化（相对上一周期） */
  weightDeltaKg: number;
  /** 睡眠达标天数 */
  sleepHitDays: number;
  /** 运动达标天数 */
  exerciseHitDays: number;
  /** 热量未超天数 */
  calorieHitDays: number;
  /** 综合健康评分 0-100 */
  score: number;
  /** 各维度得分 */
  scoreBreakdown: {
    sleep: number;
    exercise: number;
    diet: number;
    body: number;
  };
}

/** 可参与相关性分析的指标 */
export type HealthMetricKey =
  | 'sleepHours'
  | 'deepSleepHours'
  | 'exerciseMinutes'
  | 'steps'
  | 'caloriesIntake'
  | 'caloriesBurned'
  | 'waterMl'
  | 'weightKg'
  | 'restingHr'
  | 'energyLevel';

/** 相关性分析结果 */
export interface HealthCorrelation {
  /** 指标 A */
  xKey: HealthMetricKey;
  xLabel: string;
  /** 指标 B */
  yKey: HealthMetricKey;
  yLabel: string;
  /** 皮尔逊相关系数 -1 ~ 1 */
  r: number;
  /** 样本量 */
  n: number;
  /** 强度判定 */
  strength: 'strong' | 'moderate' | 'weak' | 'none';
  /** 方向 */
  direction: 'positive' | 'negative';
  /** 解读 */
  interpretation: string;
}

/** 一次导入操作的结果 */
export interface HealthImportResult {
  /** 导入的条目数 */
  imported: number;
  /** 与已有数据合并（按日期覆盖）后新增的日期数 */
  added: number;
  /** 被覆盖的已有日期数 */
  merged: number;
  /** 识别出的数据源 */
  detectedSource: HealthDataSource;
  /** 识别到的指标字段 */
  detectedFields: string[];
  /** 跳过的行与原因 */
  skipped: { row: number; reason: string }[];
  /** 时间范围 */
  dateFrom?: string;
  dateTo?: string;
  /** 导入批次 ID */
  batchId: string;
  /** 导入时间 */
  importedAt: string;
}

/** 导入批次记录（用于溯源与去重） */
export interface HealthImportBatch {
  batchId: string;
  source: HealthDataSource;
  fileName: string;
  imported: number;
  merged: number;
  importedAt: string;
}
