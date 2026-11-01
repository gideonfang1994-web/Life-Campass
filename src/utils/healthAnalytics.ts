/**
 * 量化健康数据分析引擎
 *
 * 纯函数，无副作用，无外部依赖。所有统计口径写死在此文件，便于单测与审计。
 *
 * 覆盖能力：
 *  1. 周期汇总（日 / 周 / 月）—— 睡眠、运动、饮食、体重四维
 *  2. 综合健康评分 —— 四维加权 + 达标率
 *  3. 皮尔逊相关性 —— 找出真正在起作用的因果候选
 *  4. 趋势判定 —— 线性回归斜率 + 移动平均
 *  5. 连续达标 / 断档 streak
 *  6. 异常检测 —— 睡眠不足、运动断档、热量赤字过大、体重异常波动
 *  7. 洞察生成 —— 把数字翻译成可执行建议
 */
import {
  HealthDailyEntry,
  HealthGoals,
  HealthRollup,
  HealthPeriod,
  HealthCorrelation,
  HealthMetricKey,
  HealthInsight,
} from '../types';

// ==========================================
// 常量与默认配置
// ==========================================

export const DEFAULT_HEALTH_GOALS: HealthGoals = {
  sleepTargetHours: 7.5,
  exerciseTargetMinutes: 30,
  stepTarget: 8000,
  waterTargetMl: 2000,
  calorieIntakeCap: 0,      // 0 = 不限制
  calorieBurnTarget: 300,
  targetWeightKg: 0,
  targetBodyFatPct: 0,
};

/** 指标中文名与单位（用于图表轴与洞察文案） */
export const HEALTH_METRIC_META: Record<
  HealthMetricKey,
  { label: string; unit: string; color: string; higherIsBetter: boolean }
> = {
  sleepHours: { label: '睡眠时长', unit: 'h', color: '#6366f1', higherIsBetter: true },
  deepSleepHours: { label: '深睡时长', unit: 'h', color: '#818cf8', higherIsBetter: true },
  exerciseMinutes: { label: '运动时长', unit: 'min', color: '#10b981', higherIsBetter: true },
  steps: { label: '步数', unit: '步', color: '#22c55e', higherIsBetter: true },
  caloriesIntake: { label: '摄入热量', unit: 'kcal', color: '#f59e0b', higherIsBetter: false },
  caloriesBurned: { label: '消耗热量', unit: 'kcal', color: '#f97316', higherIsBetter: true },
  waterMl: { label: '饮水量', unit: 'ml', color: '#06b6d4', higherIsBetter: true },
  weightKg: { label: '体重', unit: 'kg', color: '#a855f7', higherIsBetter: false },
  restingHr: { label: '静息心率', unit: 'bpm', color: '#ec4899', higherIsBetter: false },
  energyLevel: { label: '主观精力', unit: '/5', color: '#eab308', higherIsBetter: true },
};

/** 参与相关性扫描的指标对（只扫有生理意义的组合，避免噪声） */
const CORRELATION_PAIRS: [HealthMetricKey, HealthMetricKey][] = [
  ['sleepHours', 'exerciseMinutes'],
  ['sleepHours', 'steps'],
  ['sleepHours', 'caloriesIntake'],
  ['sleepHours', 'energyLevel'],
  ['deepSleepHours', 'energyLevel'],
  ['exerciseMinutes', 'caloriesBurned'],
  ['exerciseMinutes', 'weightKg'],
  ['exerciseMinutes', 'restingHr'],
  ['steps', 'caloriesBurned'],
  ['steps', 'weightKg'],
  ['caloriesIntake', 'weightKg'],
  ['caloriesBurned', 'weightKg'],
  ['caloriesBurned', 'restingHr'],
  ['waterMl', 'energyLevel'],
  ['restingHr', 'energyLevel'],
];

// ==========================================
// 日期工具
// ==========================================

const pad = (n: number) => String(n).padStart(2, '0');

export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDateKey(key: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(key);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** ISO 周键，与 planReconciliation 保持同一口径（UTC 变体，不受时区影响） */
export function getWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${pad(week)}`;
}

export function getMonthKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

/** 周期键 → 显示标签 */
export function periodKeyLabel(period: HealthPeriod, key: string): string {
  if (period === 'day') {
    const d = parseDateKey(key);
    if (!d) return key;
    const wd = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()];
    return `${d.getMonth() + 1}月${d.getDate()}日 周${wd}`;
  }
  if (period === 'week') return `${key}（${weekDateRange(key)}）`;
  const [y, m] = key.split('-');
  return `${y} 年 ${Number(m)} 月`;
}

/** ISO 周键 → "10-26 ~ 11-01" */
export function weekDateRange(weekKey: string): string {
  const m = /^(\d{4})-W(\d{2})$/.exec(weekKey);
  if (!m) return '';
  const year = Number(m[1]);
  const week = Number(m[2]);
  const jan4 = new Date(year, 0, 4);
  const dayNum = (jan4.getDay() + 6) % 7;
  const week1Monday = new Date(year, 0, 4 - dayNum);
  const monday = new Date(week1Monday);
  monday.setDate(week1Monday.getDate() + (week - 1) * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return `${pad(monday.getMonth() + 1)}-${pad(monday.getDate())} ~ ${pad(sunday.getMonth() + 1)}-${pad(sunday.getDate())}`;
}

/** 某个周期键所属的日期列表 */
export function datesInPeriod(period: HealthPeriod, key: string): string[] {
  if (period === 'day') return [key];
  if (period === 'month') {
    const [y, m] = key.split('-');
    const year = Number(y);
    const month = Number(m);
    const days = new Date(year, month, 0).getDate();
    const out: string[] = [];
    for (let i = 1; i <= days; i++) out.push(`${year}-${pad(month)}-${pad(i)}`);
    return out;
  }
  // week
  const m = /^(\d{4})-W(\d{2})$/.exec(key);
  if (!m) return [];
  const year = Number(m[1]);
  const week = Number(m[2]);
  const jan4 = new Date(year, 0, 4);
  const dayNum = (jan4.getDay() + 6) % 7;
  const week1Monday = new Date(year, 0, 4 - dayNum);
  const monday = new Date(week1Monday);
  monday.setDate(week1Monday.getDate() + (week - 1) * 7);
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    out.push(toDateKey(d));
  }
  return out;
}

// ==========================================
// 基础统计
// ==========================================

export function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

export function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** 只保留有定义的数值 */
function definedValues(entries: HealthDailyEntry[], key: HealthMetricKey): number[] {
  const out: number[] = [];
  for (const e of entries) {
    const v = (e as any)[key] as number | undefined;
    if (typeof v === 'number' && Number.isFinite(v)) out.push(v);
  }
  return out;
}

/** 皮尔逊相关系数。样本 < 3 或任一方方差为 0 时返回 null。 */
export function pearson(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  const mx = mean(xs.slice(0, n));
  const my = mean(ys.slice(0, n));
  let num = 0;
  let dx2 = 0;
  let dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  if (dx2 === 0 || dy2 === 0) return null;
  const r = num / Math.sqrt(dx2 * dy2);
  if (!Number.isFinite(r)) return null;
  return Math.max(-1, Math.min(1, r));
}

/** 线性回归斜率（用于趋势判定） */
export function linearSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const mx = (n - 1) / 2;
  const my = mean(values);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - mx) * (values[i] - my);
    den += (i - mx) * (i - mx);
  }
  if (den === 0) return 0;
  return num / den;
}

/** 移动平均 */
export function movingAverage(values: number[], window: number): number[] {
  if (!values.length) return [];
  const out: number[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= window) sum -= values[i - window];
    const denom = Math.min(i + 1, window);
    out.push(sum / denom);
  }
  return out;
}

// ==========================================
// 周期汇总
// ==========================================

export interface RollupOptions {
  goals: HealthGoals;
  /** 上一周期的汇总，用于算体重变化 */
  previous?: HealthRollup;
}

/** 计算单个周期的汇总 */
export function rollupForPeriod(
  entries: HealthDailyEntry[],
  period: HealthPeriod,
  key: string,
  options: RollupOptions
): HealthRollup {
  const goals = options.goals;
  const dateSet = new Set(datesInPeriod(period, key));
  const inPeriod = entries.filter((e) => dateSet.has(e.date));
  const sorted = [...inPeriod].sort((a, b) => a.date.localeCompare(b.date));

  const sleeps = definedValues(sorted, 'sleepHours');
  const exercises = definedValues(sorted, 'exerciseMinutes');
  const steps = definedValues(sorted, 'steps');
  const intakes = definedValues(sorted, 'caloriesIntake');
  const burns = definedValues(sorted, 'caloriesBurned');
  const waters = definedValues(sorted, 'waterMl');
  const weights = definedValues(sorted, 'weightKg');

  const avgSleep = mean(sleeps);
  const avgExercise = mean(exercises);
  const avgSteps = mean(steps);
  const avgIntake = mean(intakes);
  const avgBurn = mean(burns);
  const avgWater = mean(waters);
  const latestWeight = weights.length ? weights[weights.length - 1] : 0;

  // 达标天数（只统计"有该指标数据"的天，避免未记录被算作未达标）
  const sleepHit = sleeps.filter((v) => v >= goals.sleepTargetHours - 0.75).length;
  const exHit = exercises.filter((v) => v >= goals.exerciseTargetMinutes).length;
  const calHit =
    goals.calorieIntakeCap > 0
      ? intakes.filter((v) => v <= goals.calorieIntakeCap).length
      : intakes.length;

  const sleepRate = sleeps.length ? sleepHit / sleeps.length : 0;
  const exRate = exercises.length ? exHit / exercises.length : 0;
  const calRate = intakes.length ? calHit / intakes.length : 0;

  const scoreBreakdown = {
    sleep: scoreSleep(avgSleep, sleepRate, goals),
    exercise: scoreExercise(avgExercise, avgSteps, exRate, goals),
    diet: scoreDiet(avgIntake, avgBurn, calRate, goals),
    body: scoreBody(latestWeight, goals),
  };

  // 有数据的维度才计入平均，无数据的维度给中性分
  const activeDims: number[] = [];
  if (sleeps.length) activeDims.push(scoreBreakdown.sleep);
  if (exercises.length) activeDims.push(scoreBreakdown.exercise);
  if (intakes.length || burns.length) activeDims.push(scoreBreakdown.diet);
  if (weights.length) activeDims.push(scoreBreakdown.body);

  const score = activeDims.length
    ? Math.round(mean(activeDims))
    : 0;

  const weightDelta =
    options.previous && weights.length
      ? round2(latestWeight - options.previous.latestWeightKg)
      : 0;

  return {
    period,
    key,
    label: periodKeyLabel(period, key),
    daysRecorded: sorted.length,
    avgSleepHours: round1(avgSleep),
    avgExerciseMinutes: Math.round(avgExercise),
    avgSteps: Math.round(avgSteps),
    avgCaloriesIntake: Math.round(avgIntake),
    avgCaloriesBurned: Math.round(avgBurn),
    avgCalorieBalance: Math.round(avgIntake - avgBurn),
    avgWaterMl: Math.round(avgWater),
    latestWeightKg: round1(latestWeight),
    weightDeltaKg: weightDelta,
    sleepHitDays: sleepHit,
    exerciseHitDays: exHit,
    calorieHitDays: calHit,
    score,
    scoreBreakdown,
  };
}

/** 睡眠得分：时长达标率 70% + 深睡结构 30% */
function scoreSleep(avgSleep: number, hitRate: number, goals: HealthGoals): number {
  if (avgSleep <= 0) return 0;
  const durationScore = Math.min(1, avgSleep / Math.max(1, goals.sleepTargetHours)) * 100;
  return Math.round(durationScore * 0.7 + hitRate * 100 * 0.3);
}

/**
 * 运动得分：时长达标 70% + 步数达标 30%
 *
 * 步数占比只有在配置了 stepTarget 且当天确有步数数据时才生效，
 * 否则该 30% 权重重新分配给时长，避免出现「没记步数就白丢分」。
 */
function scoreExercise(
  avgExercise: number,
  avgSteps: number,
  hitRate: number,
  goals: HealthGoals
): number {
  if (avgExercise <= 0 && avgSteps <= 0) return 0;
  const durationScore =
    avgExercise > 0
      ? Math.min(1, avgExercise / Math.max(1, goals.exerciseTargetMinutes)) * 100
      : 0;
  const stepRate = goals.stepTarget > 0 && avgSteps > 0
    ? Math.min(1, avgSteps / goals.stepTarget)
    : 0;

  if (avgExercise > 0 && avgSteps > 0) {
    return Math.round(durationScore * 0.7 + stepRate * 100 * 0.3);
  }
  if (avgExercise > 0) {
    // 只有运动时长：时长 70% + 达标率 30%
    return Math.round(durationScore * 0.7 + hitRate * 100 * 0.3);
  }
  // 只有步数
  return Math.round(stepRate * 100);
}

/** 饮食得分：热量未超比例 60% + 热量平衡健康 40% */
function scoreDiet(avgIntake: number, avgBurn: number, hitRate: number, goals: HealthGoals): number {
  if (avgIntake <= 0) return 0;
  let capScore = 100;
  if (goals.calorieIntakeCap > 0) {
    capScore = Math.max(0, Math.min(100, hitRate * 100));
  }
  // 热量平衡：赤字过大（>800）或盈余过大（>400）都要扣分
  const balance = avgIntake - avgBurn;
  let balanceScore = 100;
  if (balance > 400) balanceScore = Math.max(0, 100 - (balance - 400) / 4);
  if (balance < -800) balanceScore = Math.max(0, 100 - (-balance - 800) / 4);
  return Math.round(capScore * 0.6 + balanceScore * 0.4);
}

/** 身体得分：距目标体重越近越高 */
function scoreBody(latestWeight: number, goals: HealthGoals): number {
  if (!latestWeight || goals.targetWeightKg <= 0) return 70; // 未设目标给中性分
  const diff = Math.abs(latestWeight - goals.targetWeightKg);
  if (diff <= 1) return 100;
  if (diff <= 3) return 85;
  if (diff <= 5) return 70;
  if (diff <= 8) return 50;
  return 30;
}

/**
 * 某个周期「应记录」的天数。
 *
 * 规则：
 *  - 日：1
 *  - 周：7；但若该周尚未结束，只算到今天为止
 *  - 月：当月天数；若该月尚未结束，只算到今天为止
 * 这样覆盖率才不会被「未来还没到的日子」稀释。
 */
export function expectedDaysInPeriod(period: HealthPeriod, key: string): number {
  const today = new Date();
  if (period === 'day') return 1;
  if (period === 'week') {
    const dates = datesInPeriod('week', key);
    if (!dates.length) return 7;
    const todayKey = toDateKey(today);
    const elapsed = dates.filter((d) => d <= todayKey).length;
    return elapsed > 0 ? elapsed : 7;
  }
  const [y, m] = key.split('-');
  const year = Number(y);
  const month = Number(m);
  const daysInMonth = new Date(year, month, 0).getDate();
  const isCurrentMonth =
    year === today.getFullYear() && month === today.getMonth() + 1;
  if (isCurrentMonth) return today.getDate();
  const isFutureMonth = year > today.getFullYear() ||
    (year === today.getFullYear() && month > today.getMonth() + 1);
  if (isFutureMonth) return 0;
  return daysInMonth;
}

/**
 * 生成一组连续周期的汇总（含上一周期，用于算体重变化）。
 *
 * 注意：keys 的传入顺序是「最新在前」（见 recentPeriodKeys），
 * 但体重变化需要「当前周期 - 上一周期」，所以内部按时间正序计算后再倒序返回。
 */
export function buildRollups(
  entries: HealthDailyEntry[],
  period: HealthPeriod,
  keys: string[],
  goals: HealthGoals
): HealthRollup[] {
  const out: HealthRollup[] = [];
  let prev: HealthRollup | undefined;
  // 时间正序遍历：最老 → 最新
  for (const key of [...keys].reverse()) {
    const r = rollupForPeriod(entries, period, key, { goals, previous: prev });
    out.push(r);
    prev = r;
  }
  // 还原为「最新在前」
  return out.reverse();
}

/** 取最近 N 个周期键（按时间倒序输入，倒序输出） */
export function recentPeriodKeys(period: HealthPeriod, count: number, endDate?: Date): string[] {
  const end = endDate ? new Date(endDate) : new Date();
  const keys: string[] = [];
  if (period === 'day') {
    for (let i = 0; i < count; i++) {
      const d = new Date(end);
      d.setDate(end.getDate() - i);
      keys.push(toDateKey(d));
    }
  } else if (period === 'week') {
    for (let i = 0; i < count; i++) {
      const d = new Date(end);
      d.setDate(end.getDate() - i * 7);
      keys.push(getWeekKey(d));
    }
  } else {
    for (let i = 0; i < count; i++) {
      const d = new Date(end);
      d.setMonth(end.getMonth() - i);
      keys.push(getMonthKey(d));
    }
  }
  return keys;
}

// ==========================================
// 相关性分析
// ==========================================

export function correlationStrength(r: number): HealthCorrelation['strength'] {
  const abs = Math.abs(r);
  if (abs >= 0.6) return 'strong';
  if (abs >= 0.35) return 'moderate';
  if (abs >= 0.15) return 'weak';
  return 'none';
}

export function analyzeCorrelations(entries: HealthDailyEntry[]): HealthCorrelation[] {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const results: HealthCorrelation[] = [];

  for (const [xKey, yKey] of CORRELATION_PAIRS) {
    const xs: number[] = [];
    const ys: number[] = [];
    for (const e of sorted) {
      const x = (e as any)[xKey] as number | undefined;
      const y = (e as any)[yKey] as number | undefined;
      if (typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y)) {
        xs.push(x);
        ys.push(y);
      }
    }
    const r = pearson(xs, ys);
    if (r === null) continue;
    const strength = correlationStrength(r);
    if (strength === 'none') continue;

    const xm = HEALTH_METRIC_META[xKey];
    const ym = HEALTH_METRIC_META[yKey];
    const direction = r >= 0 ? 'positive' : 'negative';
    let interpretation: string;
    if (strength === 'strong') {
      interpretation = `${xm.label}与${ym.label}存在强${direction === 'positive' ? '正' : '负'}相关（r=${round2(r)}）`;
    } else if (strength === 'moderate') {
      interpretation = `${xm.label}与${ym.label}存在中等${direction === 'positive' ? '正' : '负'}相关（r=${round2(r)}）`;
    } else {
      interpretation = `${xm.label}与${ym.label}呈弱${direction === 'positive' ? '正' : '负'}相关（r=${round2(r)}），仅作参考`;
    }

    results.push({
      xKey,
      xLabel: xm.label,
      yKey,
      yLabel: ym.label,
      r: round2(r),
      n: xs.length,
      strength,
      direction,
      interpretation,
    });
  }

  // 按 |r| 降序
  return results.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
}

// ==========================================
// 趋势与 streak
// ==========================================

export interface TrendResult {
  key: HealthMetricKey;
  label: string;
  unit: string;
  /** 最近均值 */
  recentAvg: number;
  /** 更早均值 */
  previousAvg: number;
  /** 变化量 */
  delta: number;
  /** 变化百分比 */
  deltaPct: number;
  /** 回归斜率（每单位周期） */
  slope: number;
  direction: 'up' | 'down' | 'flat';
  /** 是否显著（变化幅度超过阈值） */
  significant: boolean;
}

/** 趋势判定：比较近一半与远一半的均值，并用回归斜率确认方向 */
export function analyzeTrend(
  entries: HealthDailyEntry[],
  key: HealthMetricKey,
  window = 14
): TrendResult | null {
  const sorted = [...entries]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-window);
  const values = definedValues(sorted, key);
  if (values.length < 4) return null;

  const half = Math.floor(values.length / 2);
  const previousAvg = mean(values.slice(0, half));
  const recentAvg = mean(values.slice(half));
  const delta = recentAvg - previousAvg;
  const deltaPct = previousAvg !== 0 ? (delta / Math.abs(previousAvg)) * 100 : 0;
  const slope = linearSlope(values);

  const meta = HEALTH_METRIC_META[key];
  // 显著阈值：相对变化 > 5% 且绝对变化 > 阈值
  const absThreshold =
    key === 'sleepHours' ? 0.4 :
    key === 'exerciseMinutes' ? 8 :
    key === 'steps' ? 800 :
    key === 'weightKg' ? 0.4 :
    key === 'restingHr' ? 2 :
    key === 'caloriesIntake' || key === 'caloriesBurned' ? 120 :
    key === 'waterMl' ? 200 :
    key === 'energyLevel' ? 0.3 : 0;

  const significant = Math.abs(delta) >= absThreshold && Math.abs(deltaPct) >= 5;
  const direction: TrendResult['direction'] =
    Math.abs(delta) < absThreshold * 0.4 ? 'flat' : delta > 0 ? 'up' : 'down';

  return {
    key,
    label: meta.label,
    unit: meta.unit,
    recentAvg: round1(recentAvg),
    previousAvg: round1(previousAvg),
    delta: round1(delta),
    deltaPct: round1(deltaPct),
    slope: round2(slope),
    direction,
    significant,
  };
}

/**
 * 连续达标 / 断档 streak。
 * 返回：从最近一天往回数，连续满足条件的天数。
 */
export function computeStreak(
  entries: HealthDailyEntry[],
  predicate: (e: HealthDailyEntry) => boolean | undefined,
  maxLookback = 120
): number {
  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));
  let streak = 0;
  let counted = 0;
  for (const e of sorted) {
    if (counted >= maxLookback) break;
    const r = predicate(e);
    if (r === undefined) {
      // 该天没有这个指标的数据，跳过（不算断）
      continue;
    }
    counted++;
    if (r) streak++;
    else break;
  }
  return streak;
}

// ==========================================
// 异常检测
// ==========================================

export interface HealthAnomaly {
  id: string;
  kind: 'sleep_deficit' | 'exercise_gap' | 'calorie_deficit' | 'weight_volatility' | 'sleep_volatility' | 'hydration' | 'resting_hr_high';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  detail: string;
  dates: string[];
  evidence: Record<string, string | number>;
}

/** 异常检测：基于滑动窗口与阈值 */
export function detectAnomalies(
  entries: HealthDailyEntry[],
  goals: HealthGoals
): HealthAnomaly[] {
  const out: HealthAnomaly[] = [];
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 3) return out;

  // 1. 连续睡眠不足
  const sleepStreak = computeStreak(
    sorted,
    (e) => (e.sleepHours === undefined ? undefined : e.sleepHours < goals.sleepTargetHours - 1)
  );
  if (sleepStreak >= 3) {
    out.push({
      id: 'anom-sleep-deficit',
      kind: 'sleep_deficit',
      severity: sleepStreak >= 5 ? 'critical' : 'warning',
      title: `连续 ${sleepStreak} 天睡眠不足`,
      detail:
        `目标 ${goals.sleepTargetHours}h，连续 ${sleepStreak} 天低于 ${(goals.sleepTargetHours - 1).toFixed(1)}h。` +
        `睡眠不足会直接压低次日运动意愿与主观精力，形成「越缺觉越不想动」的负循环。`,
      dates: sorted.slice(-sleepStreak).map((e) => e.date),
      evidence: { streak: sleepStreak, target: goals.sleepTargetHours },
    });
  }

  // 2. 运动断档
  const exStreak = computeStreak(
    sorted,
    (e) => (e.exerciseMinutes === undefined ? undefined : e.exerciseMinutes < goals.exerciseTargetMinutes * 0.5)
  );
  if (exStreak >= 3) {
    out.push({
      id: 'anom-exercise-gap',
      kind: 'exercise_gap',
      severity: exStreak >= 5 ? 'critical' : 'warning',
      title: `连续 ${exStreak} 天运动量腰斩`,
      detail:
        `目标 ${goals.exerciseTargetMinutes} 分钟，连续 ${exStreak} 天不足目标的一半。` +
        `肌肉对训练信号的响应具有「断档衰减」，连续中断超过 3 天，重新启动的心理成本显著上升。`,
      dates: sorted.slice(-exStreak).map((e) => e.date),
      evidence: { streak: exStreak, target: goals.exerciseTargetMinutes },
    });
  }

  // 3. 热量赤字过大（连续）
  const deficitStreak = computeStreak(sorted, (e) => {
    if (e.caloriesIntake === undefined || e.caloriesBurned === undefined) return undefined;
    return e.caloriesIntake - e.caloriesBurned < -800;
  });
  if (deficitStreak >= 2) {
    out.push({
      id: 'anom-calorie-deficit',
      kind: 'calorie_deficit',
      severity: deficitStreak >= 4 ? 'critical' : 'warning',
      title: `连续 ${deficitStreak} 天热量赤字超 800 kcal`,
      detail:
        `每日摄入比消耗低 800 kcal 以上。持续大幅赤字会分解肌肉而非脂肪，` +
        `同时降低基础代谢，常见结果是「体重降了但体脂没降、精力先崩」。`,
      dates: sorted.slice(-deficitStreak).map((e) => e.date),
      evidence: { streak: deficitStreak },
    });
  }

  // 4. 体重异常波动
  const weights = sorted
    .map((e) => ({ date: e.date, w: e.weightKg }))
    .filter((x): x is { date: string; w: number } => typeof x.w === 'number' && Number.isFinite(x.w));
  if (weights.length >= 4) {
    const recent = weights.slice(-7);
    const wAvg = mean(recent.map((x) => x.w));
    const vol = Math.max(...recent.map((x) => x.w)) - Math.min(...recent.map((x) => x.w));
    if (vol > 2.5 && wAvg > 0) {
      out.push({
        id: 'anom-weight-volatility',
        kind: 'weight_volatility',
        severity: vol > 4 ? 'critical' : 'warning',
        title: `近 7 天体重波动 ${round1(vol)} kg`,
        detail:
          `体重在短期内大幅波动通常来自水分与钠摄入变化，而非真实脂肪增减。` +
          `建议把观察窗口拉长到 2 周以上再评估趋势。`,
        dates: recent.map((x) => x.date),
        evidence: { volatility: round1(vol), avg: round1(wAvg) },
      });
    }
  }

  // 5. 睡眠时长剧烈波动
  const sleeps = sorted
    .map((e) => ({ date: e.date, s: e.sleepHours }))
    .filter((x): x is { date: string; s: number } => typeof x.s === 'number' && Number.isFinite(x.s));
  if (sleeps.length >= 4) {
    const recent = sleeps.slice(-7);
    const vol = Math.max(...recent.map((x) => x.s)) - Math.min(...recent.map((x) => x.s));
    if (vol > 2.5) {
      out.push({
        id: 'anom-sleep-volatility',
        kind: 'sleep_volatility',
        severity: vol > 4 ? 'critical' : 'warning',
        title: `近 7 天睡眠时长波动 ${round1(vol)} h`,
        detail: `睡眠时间大幅摇摆通常来自作息不固定（周末补觉型）。生物钟紊乱会同时影响情绪与代谢。`,
        dates: recent.map((x) => x.date),
        evidence: { volatility: round1(vol) },
      });
    }
  }

  // 6. 饮水不足
  if (goals.waterTargetMl > 0) {
    const lowDays = sorted.filter(
      (e) => e.waterMl !== undefined && e.waterMl < goals.waterTargetMl * 0.6
    );
    if (lowDays.length >= 3) {
      out.push({
        id: 'anom-hydration',
        kind: 'hydration',
        severity: 'info',
        title: `${lowDays.length} 天饮水量低于目标的 60%`,
        detail: `饮水不足会带来假性饥饿与注意力下降，建议在前半夜集中补足饮水。`,
        dates: lowDays.map((e) => e.date),
        evidence: { days: lowDays.length, target: goals.waterTargetMl },
      });
    }
  }

  // 7. 静息心率偏高
  const hrs = sorted
    .map((e) => ({ date: e.date, hr: e.restingHr }))
    .filter((x): x is { date: string; hr: number } => typeof x.hr === 'number' && Number.isFinite(x.hr));
  if (hrs.length >= 3) {
    const avgHr = mean(hrs.slice(-7).map((x) => x.hr));
    if (avgHr > 78) {
      out.push({
        id: 'anom-resting-hr',
        kind: 'resting_hr_high',
        severity: avgHr > 85 ? 'critical' : 'warning',
        title: `静息心率偏高（均值 ${round1(avgHr)} bpm）`,
        detail:
          `成年人静息心率长期高于 80 bpm 往往提示恢复不足、压力偏高或睡眠债累积。` +
          `建议结合睡眠与运动数据交叉排查。`,
        dates: hrs.slice(-7).map((x) => x.date),
        evidence: { avgHr: round1(avgHr) },
      });
    }
  }

  return out;
}

// ==========================================
// 洞察生成
// ==========================================

/**
 * 把统计结果翻译成可执行建议。
 * 排序：严重问题在前 → 相关性最强在前 → 成就与建议在后。
 */
export function generateInsights(
  entries: HealthDailyEntry[],
  goals: HealthGoals,
  correlations: HealthCorrelation[],
  anomalies: HealthAnomaly[],
  trends: TrendResult[]
): HealthInsight[] {
  const insights: HealthInsight[] = [];

  // 1. 异常（最高优先级）
  for (const a of anomalies) {
    insights.push({
      id: a.id,
      kind: 'anomaly',
      severity: a.severity,
      title: a.title,
      detail: a.detail,
      evidence: a.evidence,
      action: a.kind === 'sleep_deficit'
        ? `今晚提前 ${sleepDebtMinutes(entries, goals)} 分钟入睡，用「累积睡眠债」而非单日补偿`
        : a.kind === 'exercise_gap'
        ? '把运动拆到最小可执行量：先做 10 分钟，把断档连续性拉回来'
        : a.kind === 'calorie_deficit'
        ? '把每日赤字控制在 300-500 kcal 区间，优先补蛋白质而非主食'
        : a.kind === 'weight_volatility'
        ? '不要按日读体重，改看 2 周移动平均'
        : a.kind === 'sleep_volatility'
        ? '固定起床时间（比固定入睡时间更有效），周末偏移控制在 1 小时内'
        : a.kind === 'hydration'
        ? '在每天固定三个时点各喝 500ml，把饮水变成习惯而非口渴驱动'
        : '检查近期压力源与睡眠债，先补恢复再谈训练量',
    });
  }

  // 2. 相关性（取强度最高的 3 条）
  for (const c of correlations.slice(0, 3)) {
    if (c.strength === 'weak') continue;
    insights.push({
      id: `corr-${c.xKey}-${c.yKey}`,
      kind: 'correlation',
      severity: c.strength === 'strong' ? 'info' : 'info',
      title: c.interpretation,
      detail:
        `基于 ${c.n} 天配对数据。「${c.xLabel}」${c.direction === 'positive' ? '升高时' : '降低时'}，` +
        `「${c.yLabel}」倾向于${c.direction === 'positive' ? '同步升高' : '同步降低'}。` +
        `这是相关性而非因果，但足以提示优先干预哪一个杠杆。`,
      evidence: { r: c.r, n: c.n, strength: c.strength },
      action:
        c.direction === 'positive'
          ? `保持「${c.xLabel}」的投入节奏，它会带动「${c.yLabel}」`
          : `重点盯住「${c.xLabel}」，它在拖累「${c.yLabel}」`,
    });
  }

  // 3. 显著趋势
  for (const t of trends) {
    if (!t.significant) continue;
    insights.push({
      id: `trend-${t.key}`,
      kind: 'trend',
      severity: 'info',
      title: `${t.label}${t.direction === 'up' ? '上升' : '下降'}趋势明显`,
      detail:
        `近期均值 ${t.recentAvg}${t.unit}，较早均值 ${t.previousAvg}${t.unit}，` +
        `变化 ${t.delta > 0 ? '+' : ''}${t.delta}${t.unit}（${t.deltaPct > 0 ? '+' : ''}${t.deltaPct}%）。`,
      evidence: {
        recent: t.recentAvg,
        previous: t.previousAvg,
        delta: t.delta,
        deltaPct: t.deltaPct,
      },
      action:
        t.direction === 'up' && t.key === 'sleepHours'
          ? '守住当前作息，别在好转时偷换习惯'
          : t.direction === 'down' && t.key === 'sleepHours'
            ? '把睡眠当成第一优先级实验，先固定起床时间'
            : '确认这是主动选择还是被动滑坡，再决定要不要干预',
    });
  }

  // 4. 成就
  const sleepStreak = computeStreak(
    entries,
    (e) => (e.sleepHours === undefined ? undefined : e.sleepHours >= goals.sleepTargetHours - 0.75)
  );
  if (sleepStreak >= 3) {
    insights.push({
      id: 'achieve-sleep-streak',
      kind: 'achievement',
      severity: 'info',
      title: `睡眠已连续 ${sleepStreak} 天达标`,
      detail: `这是最难建立也最容易崩塌的节律。连续记录本身就是一种承诺机制。`,
      evidence: { streak: sleepStreak },
      action: '记录一下你为它付出了什么，这会在下一次想放弃时起作用',
    });
  }
  const exStreak = computeStreak(
    entries,
    (e) => (e.exerciseMinutes === undefined ? undefined : e.exerciseMinutes >= goals.exerciseTargetMinutes)
  );
  if (exStreak >= 3) {
    insights.push({
      id: 'achieve-exercise-streak',
      kind: 'achievement',
      severity: 'info',
      title: `运动已连续 ${exStreak} 天达标`,
      detail: `运动习惯的复利远大于强度，稳定频率优先于单次强度。`,
      evidence: { streak: exStreak },
      action: '保持频率，当前强度不必加码',
    });
  }

  // 5. 兜底建议
  if (entries.length < 7) {
    insights.push({
      id: 'advice-need-data',
      kind: 'advice',
      severity: 'info',
      title: `目前只有 ${entries.length} 天数据，统计结论尚不可靠`,
      detail: `相关性分析至少需要 7 天配对样本，趋势判定需要 4 个以上数据点。继续记录，结论会自动变准。`,
      evidence: { days: entries.length },
      action: '优先补齐睡眠与运动两项，它们的信息密度最高',
    });
  } else if (insights.length === 0) {
    insights.push({
      id: 'advice-balanced',
      kind: 'advice',
      severity: 'info',
      title: '各项指标未见明显异常',
      detail: '当前没有触发任何预警规则，数据处于健康区间。',
      action: '保持现有节奏，把注意力放回你的年度目标',
    });
  }

  const severityRank = { critical: 0, warning: 1, info: 2 };
  return insights.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
}

/** 估算累积睡眠债（分钟） */
function sleepDebtMinutes(entries: HealthDailyEntry[], goals: HealthGoals): number {
  const recent = [...entries]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 7);
  let debt = 0;
  for (const e of recent) {
    if (e.sleepHours === undefined) continue;
    debt += Math.max(0, goals.sleepTargetHours - e.sleepHours) * 60;
  }
  return Math.round(debt);
}

// ==========================================
// 汇总入口
// ==========================================

export interface HealthAnalysis {
  rollups: HealthRollup[];
  correlations: HealthCorrelation[];
  anomalies: HealthAnomaly[];
  insights: HealthInsight[];
  trends: TrendResult[];
  /** 总体健康评分（最近周期加权） */
  overallScore: number;
  /** 记录覆盖率（有数据的天数 / 周期内总天数） */
  coverage: number;
  /** 记录天数 */
  totalDays: number;
}

export function analyzeHealth(
  entries: HealthDailyEntry[],
  goals: HealthGoals,
  period: HealthPeriod = 'week',
  periodCount = 8
): HealthAnalysis {
  const keys = recentPeriodKeys(period, periodCount);
  const rollups = buildRollups(entries, period, keys, goals);
  const correlations = analyzeCorrelations(entries);
  const anomalies = detectAnomalies(entries, goals);

  const trends: TrendResult[] = [];
  for (const key of [
    'sleepHours',
    'exerciseMinutes',
    'steps',
    'weightKg',
    'caloriesIntake',
    'restingHr',
  ] as HealthMetricKey[]) {
    const t = analyzeTrend(entries, key);
    if (t) trends.push(t);
  }

  const insights = generateInsights(entries, goals, correlations, anomalies, trends);

  // 总体评分 = 最近周期评分 * 0.6 + 前面周期均值 * 0.4
  const scores = rollups.filter((r) => r.daysRecorded > 0).map((r) => r.score);
  const overallScore = scores.length
    ? Math.round(
        (scores[0] ?? 0) * 0.6 +
          mean(scores.slice(1).length ? scores.slice(1) : scores) * 0.4
      )
    : 0;

  // 覆盖率：最近周期记录天数 / 该周期应有天数
  // 注意：月周期必须用「该月实际天数」，不能一律用当前月的天数，
  // 否则 2 月的覆盖率会被算成 7/31 这种不可能的值。
  const latest = rollups[0];
  const expected = latest ? expectedDaysInPeriod(period, latest.key) : 0;
  const coverage = latest && expected > 0 ? Math.min(1, latest.daysRecorded / expected) : 0;

  return {
    rollups,
    correlations,
    anomalies,
    insights,
    trends,
    overallScore,
    coverage: round2(coverage),
    totalDays: entries.length,
  };
}

/**
 * 按日期合并导入条目：同一天以新数据覆盖旧数据。
 * 这是导入的核心语义 —— 重复导入同一份文件不会产生重复条目。
 */
export function mergeEntries(
  existing: HealthDailyEntry[],
  incoming: HealthDailyEntry[]
): { merged: HealthDailyEntry[]; added: number; mergedCount: number } {
  const map = new Map<string, HealthDailyEntry>();
  for (const e of existing) map.set(e.date, e);
  let added = 0;
  let mergedCount = 0;
  for (const inc of incoming) {
    const prev = map.get(inc.date);
    if (prev) {
      // 合并：非空字段覆盖旧值，保留旧数据里导入没覆盖的字段
      const merged: HealthDailyEntry = { ...prev };
      for (const [k, v] of Object.entries(inc)) {
        if (k === 'id' || k === 'createdAt' || k === 'source') continue;
        if (v !== undefined && v !== null && v !== '') {
          (merged as any)[k] = v;
        }
      }
      merged.source = inc.source;
      merged.updatedAt = new Date().toISOString();
      map.set(inc.date, merged);
      mergedCount++;
    } else {
      map.set(inc.date, inc);
      added++;
    }
  }
  return {
    merged: Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date)),
    added,
    mergedCount,
  };
}
