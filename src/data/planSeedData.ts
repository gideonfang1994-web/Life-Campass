import { PlanNode } from '../types';
import {
  getWeekKey,
  getMonthKey,
  getQuarterKey,
  getYearKey,
  getDayKey,
} from '../utils/planReconciliation';

/**
 * 日/周/月/季/年 五级计划体系的种子数据。
 *
 * ── 核心原则：周期键一律从「今天」派生，一个都不许写死 ──────────
 *   硬编码 `2026-W44` 这类绝对周期键是个陷阱：每过一个周一，
 *   当前周就翻到下一周，周/日两层会整体变空，计划板看起来「丢数据」。
 *   本文件不出现任何写死的周期键 —— 全部按今天动态推导。
 *
 * ── 锚点推导 ──────────────────────────────────────────────────
 *   TODAY_MONTH_KEY    今天所在月（计划板默认月视图用的就是它）
 *   MAIN_QUARTER_KEY   今天所在月的季度（计划板默认季度视图用的就是它）
 *   NOW_WEEK_MONTH_KEY 本周的承接月 —— 引擎按**周四**决定周归属哪个月
 *   IDLE_WEEK_*        上一周（必然已结束）及其承接月
 *
 * ── 与引擎规则严格对齐（这是动态化的全部难点） ─────────────────
 *   引擎 coveringPeriod('week')  用**周四**决定周 → 月；
 *   引擎 coveringPeriod('month') 用该月 **15 号**决定月 → 季；
 *   引擎 isPeriodWithin('month','week') 要求"该周任意一天落在该月"。
 *   三个规则一起推出两个必须处理的边界：
 *
 *   ① 季末（如 3/31，周四是 4/2）→ 本周落到**下个月**，甚至**下个季度**。
 *      若不补节点，月节点会挂在主季度下 → period_mismatch（跨期错配）；
 *      下季度没有节点 → empty_period（空周期）。
 *   ② 季首月初（如 4/1，上一周的周四是 3 月底）→ 闲置周落到**上个季度**，
 *      同样需要补节点。
 *
 *   所以本文件的做法是：**先算出每个节点落在哪个周期，再按需补齐缺失的
 *   季度 / 年度承接节点**。这样任何一天打开，五层结构都完整且自洽。
 *
 * ── 工时语义 ──────────────────────────────────────────────────
 *   父节点 plannedHours = 直接子节点 plannedHours 之和（自底向上生成），
 *   表示"这一层已排期的时间账"。差额即为待诊断的漏项 / 超载。
 *   （年度愿景写在 deliverable 里，不混进工时账，避免噪声淹没真问题。）
 *
 * ── 刻意构造的勾稽问题 ────────────────────────────────────────
 *   1. 工时漏项   unallocated_time  ：pn-w1 承诺 26h，三个日节点只分 6h → 缺口 20h
 *   2. 过度承诺   overallocated_time：pn-m4 承诺 7h，下级 pn-w2 却承诺 10h → 超载 3h
 *   3. 中间层断链 no_descendant    ：pn-m1 / pn-m3 排了期却没有往下拆
 *   4. 虚假打勾   completed_no_proof：pn-d2 标完成但没留交付证据
 *   5. 周期闲置   time_underuse     ：pn-w1 挂在已结束的上一周，却几乎没推进
 *
 * ── 结构自洽要求 ──────────────────────────────────────────────
 *   - 声明了 parentId 的节点必须被登记到父节点的 children 里（否则是孤儿）；
 *   - 子节点周期必须落在父节点周期区间内（否则是跨期错配）；
 *   - 父节点登记进度应与子节点加权汇总一致（否则是进度不一致）。
 */

// ==========================================
// 1. 基础工具
// ==========================================

const TODAY_DATE = new Date();

/** 取某日期所在 ISO 周的周一 */
function mondayOf(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay() || 7; // 周一=1 ... 周日=7
  d.setDate(d.getDate() - (dow - 1));
  return d;
}

/** 周内第 n 天（0=周一 ... 6=周日） */
function dayInWeek(monday: Date, offset: number): Date {
  const d = new Date(monday);
  d.setDate(monday.getDate() + offset);
  return d;
}

/** 月份键偏移（-1=上月，+1=下月） */
function shiftMonthKey(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split('-').map(Number);
  return getMonthKey(new Date(y, m - 1 + delta, 1));
}

/**
 * 季度推导 —— 必须与引擎 coveringPeriod('month') 完全一致：
 *   getQuarterKey(new Date(y, m - 1, 15))
 * 自己另发明一套必然对不齐，所以这里直接复用引擎的算法。
 */
function quarterOfMonth(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  return getQuarterKey(new Date(y, m - 1, 15));
}

/** 季度键 → 年度键（引擎 coveringPeriod('quarter') 的算法） */
function yearOfQuarter(quarterKey: string): string {
  return quarterKey.split('-Q')[0];
}

/** 日期显示用：M-D */
function md(d: Date): string {
  return `${d.getMonth() + 1}-${d.getDate()}`;
}

/** ISO 时间戳 */
function ts(d: Date, hour = 0, minute = 0): string {
  const x = new Date(d);
  x.setHours(hour, minute, 0, 0);
  return x.toISOString();
}

const MONTH_LABEL = (key: string) => `${Number(key.split('-')[1])} 月`;
const QUARTER_LABEL = (key: string) => `第 ${key.split('-Q')[1]} 季度`;
const WEEK_LABEL = (key: string) => `第 ${key.split('-W')[1]} 周`;

// ==========================================
// 2. 锚点：全部周期键从「今天」派生
// ==========================================

/** 本周的周一与周四 */
const THIS_WEEK_MONDAY = mondayOf(TODAY_DATE);
const THIS_WEEK_THURSDAY = dayInWeek(THIS_WEEK_MONDAY, 3);
const THIS_WEEK_KEY = getWeekKey(TODAY_DATE);

/** 今天所在月 —— 计划板默认月视图用它 */
const TODAY_MONTH_KEY = getMonthKey(TODAY_DATE);
const NEXT_MONTH_KEY = shiftMonthKey(TODAY_MONTH_KEY, 1);

/** 主季度 —— 计划板默认季度视图用它 */
const MAIN_QUARTER_KEY = quarterOfMonth(TODAY_MONTH_KEY);
const YEAR_KEY = getYearKey(TODAY_DATE);

/** 本周的承接月：引擎按周四归属周 → 月 */
const NOW_WEEK_MONTH_KEY = getMonthKey(THIS_WEEK_THURSDAY);

/**
 * 闲置周 = 上一周。
 * 上一周必然已经结束（今天至少是本周第一天），因此
 * time_underuse（周期闲置）这个演示问题任何时候都触发得了。
 */
const IDLE_WEEK_MONDAY = dayInWeek(THIS_WEEK_MONDAY, -7);
const IDLE_WEEK_KEY = getWeekKey(IDLE_WEEK_MONDAY);
const IDLE_WEEK_MONTH_KEY = getMonthKey(dayInWeek(IDLE_WEEK_MONDAY, 3));

/** 闲置周里的前三天（周四 / 周五 / 周六），与本周那组自然错开 */
const IDLE_D1 = dayInWeek(IDLE_WEEK_MONDAY, 3);
const IDLE_D2 = dayInWeek(IDLE_WEEK_MONDAY, 4);
const IDLE_D3 = dayInWeek(IDLE_WEEK_MONDAY, 5);

/**
 * 日层：d4 = 今天，d5 = 同周内另一天。
 * 取"今天"而不是周内固定偏移，保证默认日视图永远有内容。
 */
const TODAY_DOW_INDEX = (TODAY_DATE.getDay() || 7) - 1; // 周一=0 ... 周日=6
const D4_DATE = new Date(TODAY_DATE);
const D5_DATE = dayInWeek(THIS_WEEK_MONDAY, TODAY_DOW_INDEX < 6 ? TODAY_DOW_INDEX + 1 : 5);

// ==========================================
// 3. 槽位 → 周期键 → 父季度
// ==========================================

/**
 * 五个「月节点槽位」各自落在哪个周期。
 *
 *   m0  闲置周所在月   —— 承载 pn-w1（已结束却没推进）
 *   m1  今天所在月     —— 断链演示（没有下级）
 *   m2  下个月         —— 未来计划
 *   m3  今天所在月     —— 断链演示（没有下级）
 *   m4  本周所在月     —— 承载 pn-w2（正在推进）
 */
const SLOT_ORDER = ['m0', 'm1', 'm2', 'm3', 'm4'] as const;

const SLOT_MONTH: Record<string, string> = {
  m0: IDLE_WEEK_MONTH_KEY,
  m1: TODAY_MONTH_KEY,
  m2: NEXT_MONTH_KEY,
  m3: TODAY_MONTH_KEY,
  m4: NOW_WEEK_MONTH_KEY,
};

/** 每个槽位按引擎规则应有的父季度 */
const SLOT_QUARTER: Record<string, string> = Object.fromEntries(
  Object.entries(SLOT_MONTH).map(([k, v]) => [k, quarterOfMonth(v)])
);

/** 各槽位的元数据（补季度节点时用来生成承接节点的标题与归属） */
const SLOT_TITLE: Record<string, string> = {
  m0: '把推介视频的脚本与素材彻底定稿',
  m1: '完成推介视频发布并启动海外支付接入',
  m2: '拿下前 10 位付费用户并跑通续费闭环',
  m3: '完成年度财务复盘与税费优化盘点',
  m4: '3 次低心率跑 + 2 次力量',
};

const SLOT_DIMENSION: Record<string, PlanNode['dimension']> = {
  m0: 'career',
  m1: 'career',
  m2: 'career',
  m3: 'wealth',
  m4: 'health',
};

const SLOT_PROJECT: Record<string, string | undefined> = {
  m0: 'proj-1',
  m1: 'proj-1',
  m2: 'proj-1',
  m3: 'proj-3',
  m4: 'proj-2',
};

/**
 * 除主季度外还需要补的季度。
 *
 * 最多出现一个：m0 落在"上个季度"要求今天是季首月，
 * m2/m4 落在"下个季度"要求今天是季末月，两者互斥。
 */
const EXTRA_QUARTERS = Array.from(new Set(Object.values(SLOT_QUARTER))).filter(
  (q) => q !== MAIN_QUARTER_KEY
);

/** 主季度下，每个槽位挂在哪个季度节点 */
const MAIN_QUARTER_NODE: Record<string, string> = {
  m0: 'pn-q1',
  m1: 'pn-q1',
  m2: 'pn-q1',
  m3: 'pn-q2',
  m4: 'pn-q3',
};

/** 补出来的季度节点 id：pn-q4、pn-q5 …… */
const EXTRA_QUARTER_IDS: Record<string, string> = {};
EXTRA_QUARTERS.forEach((q, i) => {
  EXTRA_QUARTER_IDS[q] = `pn-q${4 + i}`;
});

/** 槽位 → 父季度节点 id */
const SLOT_PARENT_Q: Record<string, string> = {};
for (const s of SLOT_ORDER) {
  SLOT_PARENT_Q[s] =
    SLOT_QUARTER[s] === MAIN_QUARTER_KEY
      ? MAIN_QUARTER_NODE[s]
      : EXTRA_QUARTER_IDS[SLOT_QUARTER[s]];
}

/** 补出来的季度节点挂哪个年度节点 */
const EXTRA_QUARTER_PARENT_Y: Record<string, string> = {};
/** 跨年时需要新建的年度节点 */
const EXTRA_YEAR_IDS: Record<string, string> = {};
/** 年度节点 → 其季度子节点列表 */
const EXTRA_YEAR_QUARTERS: Record<string, string[]> = {};

EXTRA_QUARTERS.forEach((q, i) => {
  const yKey = yearOfQuarter(q);
  if (yKey === YEAR_KEY) {
    // 同年：挂到 y1 下（不新建重复年度键的节点）
    EXTRA_QUARTER_PARENT_Y[q] = 'pn-y1';
  } else {
    // 跨年（如 12 月底进入次年）：必须新建该年度的节点，否则季度无从挂靠
    const yId = `pn-y${3 + i}`;
    EXTRA_YEAR_IDS[yKey] = yId;
    EXTRA_QUARTER_PARENT_Y[q] = yId;
    EXTRA_YEAR_QUARTERS[yId] = [];
  }
});

// ==========================================
// 4. 节点定义
// ==========================================

/** 刻意留出的工时缺口 / 超载（其余父节点工时 = 子节点之和，自底向上算） */
const PLANNED_HOURS_OVERRIDE: Record<string, number> = {
  'pn-w1': 26, // 三个日节点只分 6h → 缺口 20h
  'pn-m4': 7, // 下级 pn-w2 承诺 10h → 超载 3h
};

const BASE_NODES: PlanNode[] = [
  // ==========================================================
  // 年度层
  // ==========================================================
  {
    id: 'pn-y1',
    title: '把 SaaS 产品做成能自动收租的无许可资产，年营收破百万',
    cycle: 'year',
    periodKey: YEAR_KEY,
    children: ['pn-q1', 'pn-q2'],
    dimension: 'career',
    projectId: 'proj-1',
    goalId: 'goal-musk-1',
    plannedHours: 184,
    actualHours: 5,
    weight: 3,
    progress: 15,
    declaredProgress: 15,
    status: 'in_progress',
    deliverable: '年度累计营收超100万元，MRR稳定在8万以上，产品具备无人值守自动续费能力',
    successCriteria: '12月31日前银行流水显示年度营收>100万，且连续3个月MRR环比增长>8%',
    verificationProof: 'Stripe年度收入报表 + 银行对账单',
    note: '核心是把"卖时间"彻底换成"卖系统"，客户获取必须走内容与代码双杠杆。',
    createdAt: `${YEAR_KEY}-01-01T00:00:00.000Z`,
    updatedAt: ts(TODAY_DATE, 8),
  },
  {
    id: 'pn-y2',
    title: '身体成为承载野心的物理硬件：全马完赛 + 静息心率降至52',
    cycle: 'year',
    periodKey: YEAR_KEY,
    children: ['pn-q3'],
    dimension: 'health',
    projectId: 'proj-2',
    goalId: 'goal-musk-2',
    plannedHours: 7,
    actualHours: 7,
    weight: 2,
    progress: 75,
    declaredProgress: 75,
    status: 'in_progress',
    deliverable: '完成全马完赛，静息心率稳定在52次/分以下，体脂率保持15%以下',
    successCriteria: '官方赛事完赛证书 + 三甲医院体检报告两项同时达标',
    verificationProof: '',
    note: '',
    createdAt: `${YEAR_KEY}-01-01T00:00:00.000Z`,
    updatedAt: ts(TODAY_DATE, 8),
  },

  // ==========================================================
  // 季度层（主季度）
  // ==========================================================
  {
    id: 'pn-q1',
    title: `${QUARTER_LABEL(MAIN_QUARTER_KEY)}冲刺：跑通海外支付闭环，拿到前 10 位付费用户`,
    cycle: 'quarter',
    periodKey: MAIN_QUARTER_KEY,
    parentId: 'pn-y1',
    children: [],
    dimension: 'career',
    projectId: 'proj-1',
    goalId: 'goal-musk-1',
    plannedHours: 160,
    actualHours: 5,
    weight: 3,
    progress: 20,
    declaredProgress: 20,
    status: 'in_progress',
    deliverable: 'Stripe 全球计费上线，首月 MRR 突破 3 万，付费用户数 ≥ 10',
    successCriteria: '生产环境真实收款 ≥ 10 笔，且续费不掉零',
    verificationProof: 'Stripe 后台收入截图',
    note: '产品本身已到 70%，瓶颈在"没推到用户面前"，本季重心是分发而非开发。',
    createdAt: `${YEAR_KEY}-10-01T00:00:00.000Z`,
    updatedAt: ts(TODAY_DATE, 8),
  },
  {
    id: 'pn-q2',
    title: `${QUARTER_LABEL(MAIN_QUARTER_KEY)}收官：完成年度财务复盘与税费优化盘点`,
    cycle: 'quarter',
    periodKey: MAIN_QUARTER_KEY,
    parentId: 'pn-y1',
    children: [],
    dimension: 'wealth',
    projectId: 'proj-3',
    plannedHours: 24,
    actualHours: 0,
    weight: 1,
    progress: 0,
    declaredProgress: 0,
    status: 'not_started',
    deliverable: '完成全年现金流复盘，落地 ≥ 3 项节税优化',
    successCriteria: '复盘文档完成且至少 3 项优化已在真实账户生效',
    verificationProof: '',
    note: '',
    createdAt: `${YEAR_KEY}-10-01T00:00:00.000Z`,
    updatedAt: ts(TODAY_DATE, 8),
  },
  {
    id: 'pn-q3',
    title: `${QUARTER_LABEL(MAIN_QUARTER_KEY)}冬训：完成 40km 拉练 + 体脂降到 15% 以下`,
    cycle: 'quarter',
    periodKey: MAIN_QUARTER_KEY,
    parentId: 'pn-y2',
    children: [],
    dimension: 'health',
    projectId: 'proj-2',
    plannedHours: 7,
    actualHours: 7,
    weight: 2,
    progress: 75,
    declaredProgress: 75,
    status: 'in_progress',
    deliverable: '完成 40km 长距离拉练，InBody 体脂率 ≤ 15%',
    successCriteria: 'Garmin 训练日志显示单次 ≥ 40km 且平均心率 ≤ 145',
    verificationProof: 'InBody 成分分析单',
    note: '',
    createdAt: `${YEAR_KEY}-10-01T00:00:00.000Z`,
    updatedAt: ts(TODAY_DATE, 8),
  },

  // ==========================================================
  // 月度层
  // ==========================================================
  {
    id: 'pn-m0',
    title: `${MONTH_LABEL(SLOT_MONTH.m0)}：把推介视频的脚本与素材彻底定稿`,
    cycle: 'month',
    periodKey: SLOT_MONTH.m0,
    parentId: SLOT_PARENT_Q.m0,
    children: ['pn-w1'],
    dimension: 'career',
    projectId: 'proj-1',
    goalId: 'goal-musk-1',
    plannedHours: 26,
    actualHours: 5,
    weight: 1,
    progress: 80,
    declaredProgress: 80,
    status: 'in_progress',
    deliverable: '推介视频脚本定稿 + 原始素材齐套',
    successCriteria: '脚本可直接进提词器，素材无缺帧',
    verificationProof: '',
    note: '这个月已经过去大半，只推进了一小半——勾稽引擎会提示周期闲置。',
    createdAt: ts(new Date(IDLE_WEEK_MONDAY.getFullYear(), IDLE_WEEK_MONDAY.getMonth(), 1)),
    updatedAt: ts(IDLE_D3, 8),
  },
  {
    id: 'pn-m1',
    title: `${MONTH_LABEL(SLOT_MONTH.m1)}：完成推介视频发布并启动海外支付接入`,
    cycle: 'month',
    periodKey: SLOT_MONTH.m1,
    parentId: SLOT_PARENT_Q.m1,
    children: [],
    dimension: 'career',
    projectId: 'proj-1',
    goalId: 'goal-musk-1',
    plannedHours: 110,
    actualHours: 0,
    weight: 2,
    progress: 0,
    declaredProgress: 0,
    status: 'not_started',
    deliverable: '推介视频上线 + 3 个平台发布完成，收集 ≥ 50 条真实用户反馈',
    successCriteria: '视频播放量破 5000，且反馈中明确提到"愿意付费"字样 ≥ 10 条',
    verificationProof: '',
    note: '排了期但还没拆到周，属于"停在中层"的典型断链。',
    createdAt: ts(new Date(TODAY_MONTH_KEY.split('-')[0] as unknown as number, 0, 1)),
    updatedAt: ts(TODAY_DATE, 8),
  },
  {
    id: 'pn-m2',
    title: `${MONTH_LABEL(SLOT_MONTH.m2)}：拿下前 10 位付费用户并跑通续费闭环`,
    cycle: 'month',
    periodKey: SLOT_MONTH.m2,
    parentId: SLOT_PARENT_Q.m2,
    children: [],
    dimension: 'career',
    projectId: 'proj-1',
    goalId: 'goal-musk-1',
    plannedHours: 24,
    actualHours: 0,
    weight: 1,
    progress: 0,
    declaredProgress: 0,
    status: 'not_started',
    deliverable: '付费用户 ≥ 10 位，续费不掉零',
    successCriteria: '生产环境真实收款 ≥ 10 笔，且次月续费 ≥ 80%',
    verificationProof: '',
    note: '',
    createdAt: ts(TODAY_DATE, 0),
    updatedAt: ts(TODAY_DATE, 8),
  },
  {
    id: 'pn-m3',
    title: `${MONTH_LABEL(SLOT_MONTH.m3)}：完成年度财务复盘与税费优化盘点`,
    cycle: 'month',
    periodKey: SLOT_MONTH.m3,
    parentId: SLOT_PARENT_Q.m3,
    children: [],
    dimension: 'wealth',
    projectId: 'proj-3',
    plannedHours: 24,
    actualHours: 0,
    weight: 1,
    progress: 0,
    declaredProgress: 0,
    status: 'not_started',
    deliverable: '完成全年现金流复盘，落地 ≥ 3 项节税优化',
    successCriteria: '复盘文档完成且至少 3 项优化已在真实账户生效',
    verificationProof: '',
    note: '本层已排期但尚未向下拆到周，属于"停在中层"的典型断链。',
    createdAt: ts(new Date(TODAY_MONTH_KEY.split('-')[0] as unknown as number, 0, 1)),
    updatedAt: ts(TODAY_DATE, 8),
  },
  {
    id: 'pn-m4',
    title: `${MONTH_LABEL(SLOT_MONTH.m4)}：3 次低心率跑 + 2 次力量`,
    cycle: 'month',
    periodKey: SLOT_MONTH.m4,
    parentId: SLOT_PARENT_Q.m4,
    children: ['pn-w2'],
    dimension: 'health',
    projectId: 'proj-2',
    plannedHours: 7,
    actualHours: 7,
    weight: 2,
    progress: 75,
    declaredProgress: 75,
    status: 'in_progress',
    deliverable: '本月跑量 ≥ 60km，力量训练完成 12 次',
    successCriteria: 'Garmin 月度汇总跑量 ≥ 60km 且力量训练记录 ≥ 12 次',
    verificationProof: 'Garmin 月度活动汇总',
    note: '',
    createdAt: ts(new Date(TODAY_DATE.getFullYear(), TODAY_DATE.getMonth(), 1)),
    updatedAt: ts(TODAY_DATE, 8),
  },

  // ==========================================================
  // 周层
  // ==========================================================
  {
    id: 'pn-w1',
    title: `${WEEK_LABEL(IDLE_WEEK_KEY)}：写完脚本并完成视频正式录制`,
    cycle: 'week',
    periodKey: IDLE_WEEK_KEY,
    parentId: 'pn-m0',
    children: ['pn-d1', 'pn-d2', 'pn-d3'],
    dimension: 'career',
    projectId: 'proj-1',
    goalId: 'goal-musk-1',
    plannedHours: 26,
    actualHours: 5,
    weight: 1,
    progress: 80,
    declaredProgress: 80,
    status: 'in_progress',
    deliverable: '视频成片 + 在 2 个平台完成首轮投放并拿到点击率数据',
    successCriteria: '成片时长 ≤ 90 秒，投放 CTR ≥ 2%',
    verificationProof: '',
    note: '',
    createdAt: ts(IDLE_D1, 0),
    updatedAt: ts(IDLE_D3, 8),
  },
  {
    id: 'pn-w2',
    title: `${WEEK_LABEL(THIS_WEEK_KEY)}：3 次低心率跑 + 2 次力量`,
    cycle: 'week',
    periodKey: THIS_WEEK_KEY,
    parentId: 'pn-m4',
    children: ['pn-d4', 'pn-d5'],
    dimension: 'health',
    projectId: 'proj-2',
    plannedHours: 10,
    actualHours: 7,
    weight: 2,
    progress: 75,
    declaredProgress: 75,
    status: 'in_progress',
    deliverable: '本周完成 3 次有氧 + 2 次力量',
    successCriteria: 'Garmin 记录显示有氧 3 次且力量训练 2 次',
    verificationProof: '',
    note: '',
    createdAt: ts(THIS_WEEK_MONDAY, 0),
    updatedAt: ts(TODAY_DATE, 8),
  },

  // ==========================================================
  // 日层
  // ==========================================================
  {
    id: 'pn-d1',
    title: `${md(IDLE_D1)} 上午 9:00-11:00：写完推介视频完整脚本并定稿`,
    cycle: 'day',
    periodKey: getDayKey(IDLE_D1),
    parentId: 'pn-w1',
    children: [],
    dimension: 'career',
    projectId: 'proj-1',
    goalId: 'goal-musk-1',
    plannedHours: 2,
    actualHours: 2,
    weight: 2,
    progress: 100,
    declaredProgress: 100,
    status: 'completed',
    deliverable: '90 秒口播脚本定稿，钩子在前 3 秒',
    successCriteria: '脚本可直接进入提词器录制',
    verificationProof: '脚本文档 + 自录 30 秒试看版',
    note: '',
    createdAt: ts(IDLE_D1, 9),
    updatedAt: ts(IDLE_D1, 11),
  },
  {
    id: 'pn-d2',
    title: `${md(IDLE_D2)} 下午 14:00-17:00：完成视频正式录制`,
    cycle: 'day',
    periodKey: getDayKey(IDLE_D2),
    parentId: 'pn-w1',
    children: [],
    dimension: 'career',
    projectId: 'proj-1',
    goalId: 'goal-musk-1',
    plannedHours: 3,
    actualHours: 3,
    weight: 2,
    progress: 100,
    declaredProgress: 100,
    status: 'completed',
    deliverable: '成片素材 + 字幕文件',
    successCriteria: '素材完整无黑屏，字幕时间轴对齐',
    verificationProof: '',
    note: '标了完成但还没把成片传上去——典型的虚假打勾。',
    createdAt: ts(IDLE_D2, 14),
    updatedAt: ts(IDLE_D2, 17),
  },
  {
    id: 'pn-d3',
    title: `${md(IDLE_D3)} 晚上 20:00-21:00：发布至 Twitter 并回复首轮评论`,
    cycle: 'day',
    periodKey: getDayKey(IDLE_D3),
    parentId: 'pn-w1',
    children: [],
    dimension: 'career',
    projectId: 'proj-1',
    goalId: 'goal-musk-1',
    plannedHours: 1,
    actualHours: 0,
    weight: 1,
    progress: 0,
    declaredProgress: 0,
    status: 'not_started',
    deliverable: '推文发布成功 + 首轮评论回复完毕',
    successCriteria: '推文处于置顶状态',
    verificationProof: '',
    note: '',
    createdAt: ts(IDLE_D3, 20),
    updatedAt: ts(IDLE_D3, 21),
  },
  {
    id: 'pn-d4',
    title: `${md(D4_DATE)} 上午 07:00-08:00：低心率跑 8km`,
    cycle: 'day',
    periodKey: getDayKey(D4_DATE),
    parentId: 'pn-w2',
    children: [],
    dimension: 'health',
    projectId: 'proj-2',
    plannedHours: 4,
    actualHours: 4,
    weight: 1,
    progress: 100,
    declaredProgress: 100,
    status: 'completed',
    deliverable: '8km 低心率跑完成，平均心率 ≤ 135',
    successCriteria: 'Garmin 显示平均心率 ≤ 135 且距离 ≥ 8km',
    verificationProof: 'Garmin 活动记录',
    note: '',
    createdAt: ts(D4_DATE, 7),
    updatedAt: ts(D4_DATE, 8),
  },
  {
    id: 'pn-d5',
    title: `${md(D5_DATE)} 上午 10:00-16:00：力量训练（深蹲 + 硬拉 + 核心）`,
    cycle: 'day',
    periodKey: getDayKey(D5_DATE),
    parentId: 'pn-w2',
    children: [],
    dimension: 'health',
    projectId: 'proj-2',
    plannedHours: 6,
    actualHours: 3,
    weight: 1,
    progress: 50,
    declaredProgress: 50,
    status: 'in_progress',
    deliverable: '深蹲 4×8、硬拉 3×6 完成并录入',
    successCriteria: '两组动作全部完成且组间重量无下降',
    verificationProof: '',
    note: '',
    createdAt: ts(D5_DATE, 10),
    updatedAt: ts(D5_DATE, 16),
  },
];

// ==========================================
// 5. 补齐周期链（季末 / 季首的跨季场景）
// ==========================================

/**
 * 补出来的季度节点。
 *
 * 引擎的 empty_period 检查会沿 coveringPeriod 链向上走：
 *   周(W13) → 月(2026-04) → 季(2026-Q2) → 年(2026)
 * 季末时本周的周四落在下月，这条链会跳出主季度；
 * 若下季度没有节点，引擎就会报"季度周期没有任何计划节点"。
 */
const EXTRA_QUARTER_NODES: PlanNode[] = EXTRA_QUARTERS.map((q) => {
  const yKey = yearOfQuarter(q);
  const hosts = SLOT_ORDER.filter((s) => SLOT_QUARTER[s] === q);
  const hostSlot = hosts[0];
  const hostTitle = SLOT_TITLE[hostSlot];
  return {
    id: EXTRA_QUARTER_IDS[q],
    title: `${QUARTER_LABEL(q)}承接：${hostTitle}`,
    cycle: 'quarter',
    periodKey: q,
    parentId: EXTRA_QUARTER_PARENT_Y[q],
    children: [],
    dimension: SLOT_DIMENSION[hostSlot],
    projectId: SLOT_PROJECT[hostSlot],
    plannedHours: 0,
    actualHours: 0,
    weight: 1,
    progress: 0,
    status: 'not_started',
    deliverable: `${QUARTER_LABEL(q)}的承接成果：${hostTitle}`,
    successCriteria: '该季度的承接节点有明确的月度分解与可验证交付',
    verificationProof: '',
    note: '',
    createdAt: ts(new Date(Number(yKey), Number(q.split('-Q')[1]) * 3 - 2, 1)),
    updatedAt: ts(TODAY_DATE, 8),
  };
});

/** 跨年时补出来的年度节点 */
const EXTRA_YEAR_NODES: PlanNode[] = Object.entries(EXTRA_YEAR_IDS).map(([yKey, id]) => ({
  id,
  title: `${yKey} 年：延续既定的产品与健康节奏`,
  cycle: 'year',
  periodKey: yKey,
  children: [],
  dimension: 'career' as const,
  projectId: 'proj-1',
  goalId: 'goal-musk-1',
  plannedHours: 0,
  actualHours: 0,
  weight: 1,
  progress: 0,
  status: 'not_started' as const,
  deliverable: '把上一年度的成果惯性延续到新的一年',
  successCriteria: '新年度至少承接一项已经跑通的季度节奏',
  verificationProof: '',
  note: '跨年时自动补出的年度承接节点。',
  createdAt: `${yKey}-01-01T00:00:00.000Z`,
  updatedAt: ts(TODAY_DATE, 8),
}));

// ==========================================
// 6. 组装：挂 children + 自底向上算工时
// ==========================================

const ALL_NODES: PlanNode[] = [
  ...BASE_NODES,
  ...EXTRA_QUARTER_NODES,
  ...EXTRA_YEAR_NODES,
];

/**
 * 自底向上算父节点工时：父 = 直接子之和。
 * 再套上 PLANNED_HOURS_OVERRIDE 制造刻意的缺口 / 超载。
 */
function computePlannedHours(nodes: PlanNode[]): void {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const DEPTH: Record<string, number> = { year: 0, quarter: 1, month: 2, week: 3, day: 4 };
  const byDepth = [...nodes].sort((a, b) => DEPTH[b.cycle] - DEPTH[a.cycle]);
  for (const node of byDepth) {
    const kids = (node.children || []).map((id) => byId.get(id)).filter(Boolean) as PlanNode[];
    if (kids.length === 0) continue;
    const sum = kids.reduce((s, c) => s + (c.plannedHours || 0), 0);
    node.plannedHours = PLANNED_HOURS_OVERRIDE[node.id] ?? sum;
  }
}

/** 按 parentId 重建 children 列表（保证双向一致，不产生孤儿） */
function rebuildChildren(nodes: PlanNode[]): void {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const n of nodes) n.children = [];
  for (const n of nodes) {
    if (!n.parentId) continue;
    const parent = byId.get(n.parentId);
    if (parent) parent.children.push(n.id);
  }
}

/**
 * 让**补出来的**承接节点进度与其下级汇总一致。
 *
 * 引擎的 progress_inconsistent 检查拿"登记进度"和"子节点加权汇总"比，
 * 偏差 > 25 个点就报警。补出来的季度 / 年度节点是纯承接角色，
 * 本身没有"自评进度"这回事 —— 直接按子节点汇总填上，两边自然对齐。
 *
 * 注意：只处理补出来的节点。主树节点的自评进度是刻意设计的
 * （与子节点汇总有偏差正是"进度不一致"这条演示线索的来源），不能动。
 */
function alignGeneratedProgress(nodes: PlanNode[], generatedIds: Set<string>): void {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const DEPTH: Record<string, number> = { year: 0, quarter: 1, month: 2, week: 3, day: 4 };
  // 深 → 浅：先算子节点，再算父节点，父节点才能拿到子节点算好的进度
  const byDepth = [...nodes].sort((a, b) => DEPTH[b.cycle] - DEPTH[a.cycle]);
  for (const node of byDepth) {
    const kids = (node.children || []).map((id) => byId.get(id)).filter(Boolean) as PlanNode[];
    if (kids.length === 0) continue;
    const totalWeight = kids.reduce((s, c) => s + (c.weight || 1), 0);
    const avg =
      totalWeight > 0
        ? Math.round(kids.reduce((s, c) => s + (c.progress || 0) * (c.weight || 1), 0) / totalWeight)
        : Math.round(kids.reduce((s, c) => s + (c.progress || 0), 0) / kids.length);
    if (generatedIds.has(node.id)) {
      node.progress = avg;
      node.declaredProgress = avg;
    }
  }
}

rebuildChildren(ALL_NODES);
computePlannedHours(ALL_NODES);
alignGeneratedProgress(
  ALL_NODES,
  new Set([...EXTRA_QUARTER_NODES, ...EXTRA_YEAR_NODES].map((n) => n.id))
);

export const INITIAL_PLAN_NODES: PlanNode[] = ALL_NODES;
