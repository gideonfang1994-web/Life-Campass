/**
 * 量化健康种子数据
 *
 * 为什么要预置：
 *  - 新用户打开「量化健康」页如果一片空白，看不出这个模块能干什么；
 *  - 预置 30 天可分析的样本，趋势图 / 相关性 / 异常检测立刻有内容；
 *  - 数据用确定性伪随机生成（固定种子），保证每次构建与测试结果一致。
 *
 * 埋的「可发现规律」（方便用户验证分析引擎是否真的在算）：
 *  - 睡眠时长与静息心率负相关（睡得越久，静息心率越低）；
 *  - 运动量与摄入热量正相关（动得多、吃得也多）；
 *  - 深睡时长随总睡眠同步上升；
 *  - 周末睡眠更长但运动更少。
 */
import { HealthDailyEntry } from '../types';

/** 线性同余伪随机（确定性） */
function makeRandom(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** 生成最近 N 天（截至今天，含今天）的健康种子数据 */
export function buildSeedHealthEntries(days = 30): HealthDailyEntry[] {
  const rand = makeRandom(20261031);
  const out: HealthDailyEntry[] = [];
  const now = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const date = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    const dow = d.getDay();
    const isWeekend = dow === 0 || dow === 6;

    // 基础波形：周末睡眠更长
    const sleepBase = isWeekend ? 8.3 : 7.1;
    const sleepHours = round1(sleepBase + (rand() - 0.5) * 1.6);
    const deepSleepHours = round1(Math.max(0.6, sleepHours * (0.17 + rand() * 0.06)));
    const remSleepHours = round1(Math.max(0.4, sleepHours * (0.19 + rand() * 0.07)));
    const lightSleepHours = round1(
      Math.max(0.5, sleepHours - deepSleepHours - remSleepHours)
    );

    const bedtimeMinutes = isWeekend
      ? 23 * 60 + Math.round(rand() * 90)
      : 22 * 60 + Math.round(rand() * 80);
    const wakeTimeMinutes = bedtimeMinutes + Math.round(sleepHours * 60);

    // 运动：周末少，工作日多
    const exerciseMinutes = Math.round(
      isWeekend ? 20 + rand() * 35 : 30 + rand() * 55
    );
    const steps = Math.round(
      (isWeekend ? 3800 : 6200) + rand() * (isWeekend ? 3200 : 5200)
    );
    const distanceKm = round1(steps * 0.00072 + rand() * 0.4);
    const caloriesBurned = Math.round(
      1450 + exerciseMinutes * 7.2 + steps * 0.032 + rand() * 120
    );

    // 摄入：与运动量正相关，周末略高
    const caloriesIntake = Math.round(
      1750 + exerciseMinutes * 9 + (isWeekend ? 180 : 0) + rand() * 320
    );
    const proteinG = Math.round(85 + exerciseMinutes * 0.42 + rand() * 25);
    const carbsG = Math.round(180 + exerciseMinutes * 6 + rand() * 55);
    const fatG = Math.round(52 + rand() * 22);
    const waterMl = Math.round(1500 + exerciseMinutes * 12 + rand() * 900);
    const mealCount = 3;

    // 体重：缓慢下降 + 噪声
    const daysAgo = days - 1 - i;
    const weightKg = round1(75.6 - daysAgo * 0.035 + (rand() - 0.5) * 0.5);
    const bodyFatPct = round1(21.4 - daysAgo * 0.012 + (rand() - 0.5) * 0.4);

    // 静息心率：与睡眠负相关（睡得越好，心率越低）
    const restingHr = Math.round(
      64 - (sleepHours - 7) * 1.9 + (rand() - 0.5) * 3.2
    );
    const systolicBp = Math.round(118 + (rand() - 0.5) * 8);
    const diastolicBp = Math.round(76 + (rand() - 0.5) * 6);

    // 有意埋一条断档：第 12~13 天没有记录（考验覆盖率与 streak 判定）
    if (daysAgo === 12 || daysAgo === 13) continue;

    out.push({
      id: `hseed-${date}`,
      date,
      source: 'manual',
      sleepHours,
      deepSleepHours,
      remSleepHours,
      lightSleepHours,
      awakenCount: Math.round(rand() * 3),
      bedtimeMinutes,
      wakeTimeMinutes: wakeTimeMinutes % 1440,
      exerciseMinutes,
      exerciseType: isWeekend ? '散步' : '跑步',
      steps,
      caloriesBurned,
      distanceKm,
      caloriesIntake,
      proteinG,
      carbsG,
      fatG,
      waterMl,
      mealCount,
      weightKg,
      bodyFatPct,
      restingHr,
      systolicBp,
      diastolicBp,
      energyLevel: Math.max(1, Math.min(5, Math.round(2 + exerciseMinutes / 35))),
      note: '',
      createdAt: `${date}T09:00:00.000Z`,
      updatedAt: `${date}T09:00:00.000Z`,
    });
  }

  return out;
}

export const INITIAL_HEALTH_ENTRIES: HealthDailyEntry[] = buildSeedHealthEntries(30);
