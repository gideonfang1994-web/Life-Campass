/**
 * 量化健康记录与分析视图
 *
 * 设计要点：
 *  1. 手动记录是「一等公民」——不依赖任何外部 App 也能用；
 *  2. 导入是「加速器」——多源文件导入后与手动数据按日期幂等合并；
 *  3. 明确告诉用户每个数据源怎么导出，不画不存在的 API；
 *  4. 所有关键 DOM 暴露 data-testid / data-* 钩子，便于 e2e 断言。
 */
import React, { useState, useMemo, useRef, useCallback } from 'react';
import {
  HealthDailyEntry,
  HealthGoals,
  HealthPeriod,
  HealthMetricKey,
  HealthImportBatch,
  HealthImportResult,
} from '../types';
import {
  DEFAULT_HEALTH_GOALS,
  HEALTH_METRIC_META,
  analyzeHealth,
  recentPeriodKeys,
  periodKeyLabel,
  toDateKey,
  datesInPeriod,
  computeStreak,
} from '../utils/healthAnalytics';
import {
  parseHealthFile,
  mergeImportedEntries,
  buildImportResult,
  SOURCE_LABEL,
  SOURCE_GUIDE,
} from '../utils/healthImporters';
import {
  LineChart,
  BarChart,
  ScoreRing,
  SleepStack,
  CalorieBalance,
  LinePoint,
} from './HealthCharts';
import {
  Moon,
  Activity,
  Utensils,
  Scale,
  Upload,
  Plus,
  Trash2,
  Settings2,
  AlertTriangle,
  Info,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Minus,
  Link2,
  Lightbulb,
  X,
  Loader2,
  Target,
  Droplets,
  HeartPulse,
  Footprints,
  Flame,
} from 'lucide-react';

interface Props {
  entries: HealthDailyEntry[];
  goals: HealthGoals;
  importBatches: HealthImportBatch[];
  onUpdateEntries: (entries: HealthDailyEntry[]) => void;
  onUpdateGoals: (goals: HealthGoals) => void;
  onAddImportBatch: (batch: HealthImportBatch) => void;
}

// ==========================================
// 常量
// ==========================================

const PERIOD_TABS: { id: HealthPeriod; label: string }[] = [
  { id: 'day', label: '日' },
  { id: 'week', label: '周' },
  { id: 'month', label: '月' },
];

const METRIC_CHOICES: { key: HealthMetricKey; label: string }[] = [
  { key: 'sleepHours', label: '睡眠时长' },
  { key: 'exerciseMinutes', label: '运动时长' },
  { key: 'steps', label: '步数' },
  { key: 'caloriesIntake', label: '摄入热量' },
  { key: 'caloriesBurned', label: '消耗热量' },
  { key: 'waterMl', label: '饮水量' },
  { key: 'weightKg', label: '体重' },
  { key: 'restingHr', label: '静息心率' },
];

const SOURCE_ORDER: (keyof typeof SOURCE_LABEL)[] = [
  'manual',
  'apple_health',
  'boohee',
  'huawei',
  'xiaomi',
  'wechat_run',
  'csv',
];

function todayKey(): string {
  return toDateKey(new Date());
}

function fmtMinutes(min: number | undefined): string {
  if (min === undefined) return '—';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ==========================================
// 主视图
// ==========================================

export const HealthMetricsView: React.FC<Props> = ({
  entries,
  goals,
  importBatches,
  onUpdateEntries,
  onUpdateGoals,
  onAddImportBatch,
}) => {
  const [period, setPeriod] = useState<HealthPeriod>('week');
  const [activeMetric, setActiveMetric] = useState<HealthMetricKey>('sleepHours');
  const [showEntryForm, setShowEntryForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showGoals, setShowGoals] = useState(false);
  const [importing, setImporting] = useState(false);
  const [lastResult, setLastResult] = useState<HealthImportResult | null>(null);
  const [lastError, setLastError] = useState<string>('');
  const fileRef = useRef<HTMLInputElement>(null);

  const analysis = useMemo(
    () => analyzeHealth(entries, goals, period, period === 'day' ? 14 : 8),
    [entries, goals, period]
  );
  const latest = analysis.rollups[0];

  // ===== 手动记录表单 =====
  const [formDate, setFormDate] = useState(todayKey());
  const [form, setForm] = useState({
    sleepHours: '',
    deepSleepHours: '',
    remSleepHours: '',
    exerciseMinutes: '',
    steps: '',
    caloriesIntake: '',
    proteinG: '',
    carbsG: '',
    fatG: '',
    waterMl: '',
    caloriesBurned: '',
    weightKg: '',
    bodyFatPct: '',
    restingHr: '',
    energyLevel: '',
    note: '',
  });

  const handleSaveEntry = useCallback(() => {
    const now = new Date().toISOString();
    const num = (v: string): number | undefined => {
      const t = v.trim();
      if (!t) return undefined;
      const n = Number(t);
      return Number.isFinite(n) ? n : undefined;
    };

    const patch: Partial<HealthDailyEntry> = {};
    const setIf = (k: keyof HealthDailyEntry, v: number | undefined) => {
      if (v !== undefined) (patch as any)[k] = v;
    };
    setIf('sleepHours', num(form.sleepHours));
    setIf('deepSleepHours', num(form.deepSleepHours));
    setIf('remSleepHours', num(form.remSleepHours));
    setIf('exerciseMinutes', num(form.exerciseMinutes));
    setIf('steps', num(form.steps));
    setIf('caloriesIntake', num(form.caloriesIntake));
    setIf('proteinG', num(form.proteinG));
    setIf('carbsG', num(form.carbsG));
    setIf('fatG', num(form.fatG));
    setIf('waterMl', num(form.waterMl));
    setIf('caloriesBurned', num(form.caloriesBurned));
    setIf('weightKg', num(form.weightKg));
    setIf('bodyFatPct', num(form.bodyFatPct));
    setIf('restingHr', num(form.restingHr));
    setIf('energyLevel', num(form.energyLevel));
    if (form.note.trim()) patch.note = form.note.trim();

    const hasAny = Object.keys(patch).length > 0;
    if (!hasAny) {
      setLastError('至少填写一个指标');
      return;
    }
    setLastError('');

    const existing = entries.find((e) => e.date === formDate);
    const next: HealthDailyEntry = existing
      ? {
          ...existing,
          ...patch,
          source: 'manual',
          updatedAt: now,
        }
      : {
          id: `hd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
          date: formDate,
          source: 'manual',
          createdAt: now,
          updatedAt: now,
          ...patch,
        };

    const rest = entries.filter((e) => e.date !== formDate);
    onUpdateEntries([...rest, next].sort((a, b) => a.date.localeCompare(b.date)));
    setShowEntryForm(false);
    setForm({
      sleepHours: '', deepSleepHours: '', remSleepHours: '', exerciseMinutes: '',
      steps: '', caloriesIntake: '', proteinG: '', carbsG: '', fatG: '',
      waterMl: '', caloriesBurned: '', weightKg: '', bodyFatPct: '',
      restingHr: '', energyLevel: '', note: '',
    });
  }, [form, formDate, entries, onUpdateEntries]);

  const handleDelete = useCallback(
    (date: string) => {
      if (!confirm(`确定删除 ${date} 的记录吗？`)) return;
      onUpdateEntries(entries.filter((e) => e.date !== date));
    },
    [entries, onUpdateEntries]
  );

  // ===== 导入 =====
  const handleFile = useCallback(
    async (file: File) => {
      setImporting(true);
      setLastError('');
      setLastResult(null);
      try {
        const outcome = await parseHealthFile(file);
        if (!outcome.entries.length) {
          setLastError(
            outcome.skipped[0]?.reason ?? '文件里没有解析出可用的健康数据'
          );
          return;
        }
        const { merged, added, mergedCount } = mergeImportedEntries(
          entries,
          outcome.entries
        );
        onUpdateEntries(merged);
        const result = buildImportResult(outcome, added, mergedCount, file.name);
        setLastResult(result);
        onAddImportBatch({
          batchId: result.batchId,
          source: result.detectedSource,
          fileName: file.name,
          imported: result.imported,
          merged: result.merged,
          importedAt: result.importedAt,
        });
      } catch (err) {
        setLastError(`解析失败：${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setImporting(false);
        if (fileRef.current) fileRef.current.value = '';
      }
    },
    [entries, onUpdateEntries, onAddImportBatch]
  );

  // ===== 图表数据 =====
  const metricMeta = HEALTH_METRIC_META[activeMetric];
  const metricTarget = useMemo(() => {
    switch (activeMetric) {
      case 'sleepHours': return goals.sleepTargetHours;
      case 'exerciseMinutes': return goals.exerciseTargetMinutes;
      case 'steps': return goals.stepTarget;
      case 'caloriesIntake': return goals.calorieIntakeCap || undefined;
      case 'caloriesBurned': return goals.calorieBurnTarget || undefined;
      case 'waterMl': return goals.waterTargetMl;
      default: return undefined;
    }
  }, [activeMetric, goals]);

  const chartData: LinePoint[] = useMemo(() => {
    const out: LinePoint[] = [];
    const keys = period === 'day'
      ? datesInPeriod('day', todayKey())
      : recentPeriodKeys(period, period === 'week' ? 8 : 6);
    if (period === 'day') {
      // 日视图：展示最近 14 天
      const days: string[] = [];
      for (let i = 13; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        days.push(toDateKey(d));
      }
      for (const k of days) {
        const e = entries.find((x) => x.date === k);
        const v = e ? (e as any)[activeMetric] as number | undefined : undefined;
        out.push({
          label: k.slice(5).replace('-', '/'),
          value: typeof v === 'number' && Number.isFinite(v) ? v : null,
        });
      }
      return out;
    }
    for (const key of [...keys].reverse()) {
      const r = analysis.rollups.find((x) => x.key === key);
      const raw = r ? (r as any)[metricRollupField(activeMetric)] : undefined;
      out.push({
        label: period === 'week' ? key.slice(-3) : key.slice(5),
        value: typeof raw === 'number' ? raw : null,
      });
    }
    return out;
  }, [entries, period, analysis.rollups, activeMetric]);

  // 睡眠结构（取最近一个有数据的日子）
  const latestSleep = useMemo(() => {
    const withSleep = entries
      .filter((e) => e.sleepHours !== undefined)
      .sort((a, b) => b.date.localeCompare(a.date));
    return withSleep[0];
  }, [entries]);

  // 体重折线（按天）
  const weightPoints: LinePoint[] = useMemo(() => {
    const sorted = [...entries]
      .filter((e) => e.weightKg !== undefined)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-30);
    return sorted.map((e) => ({
      label: e.date.slice(5).replace('-', '/'),
      value: e.weightKg!,
    }));
  }, [entries]);

  // 步数柱状（最近 14 天）
  const stepBars = useMemo(() => {
    const days: string[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(toDateKey(d));
    }
    return days.map((k) => {
      const e = entries.find((x) => x.date === k);
      const v = e?.steps ?? 0;
      return {
        label: k.slice(5).replace('-', '/'),
        value: v,
        hit: goals.stepTarget > 0 && v >= goals.stepTarget,
      };
    });
  }, [entries, goals.stepTarget]);

  // Streak
  const sleepStreak = useMemo(
    () =>
      computeStreak(
        entries,
        (e) =>
          e.sleepHours === undefined
            ? undefined
            : e.sleepHours >= goals.sleepTargetHours - 0.75
      ),
    [entries, goals.sleepTargetHours]
  );
  const exStreak = useMemo(
    () =>
      computeStreak(
        entries,
        (e) =>
          e.exerciseMinutes === undefined
            ? undefined
            : e.exerciseMinutes >= goals.exerciseTargetMinutes
      ),
    [entries, goals.exerciseTargetMinutes]
  );

  const activeMetricTrend = analysis.trends.find((t) => t.key === activeMetric);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6" data-testid="health-metrics-view">
      {/* ================= 头部 ================= */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <HeartPulse className="h-5 w-5 text-rose-500" />
            量化健康
          </h1>
          <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
            睡眠 · 运动 · 饮食 · 身体 —— 记录 {entries.length} 天 · 覆盖最新周期{' '}
            {Math.round(analysis.coverage * 100)}%
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="health-add-entry"
            onClick={() => setShowEntryForm((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-stone-900 px-3 py-2 text-xs font-medium text-white transition hover:bg-stone-700 dark:bg-white dark:text-stone-900 dark:hover:bg-stone-200"
          >
            <Plus className="h-3.5 w-3.5" />
            手动记录
          </button>
          <button
            type="button"
            data-testid="health-open-import"
            onClick={() => setShowImport((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 px-3 py-2 text-xs font-medium transition hover:bg-stone-50 dark:border-stone-700 dark:hover:bg-stone-800"
          >
            <Upload className="h-3.5 w-3.5" />
            导入数据
          </button>
          <button
            type="button"
            data-testid="health-open-goals"
            onClick={() => setShowGoals((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 px-3 py-2 text-xs font-medium transition hover:bg-stone-50 dark:border-stone-700 dark:hover:bg-stone-800"
          >
            <Settings2 className="h-3.5 w-3.5" />
            目标
          </button>
        </div>
      </header>

      {lastError && (
        <div
          data-testid="health-error"
          className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{lastError}</span>
        </div>
      )}

      {/* ================= 目标设置 ================= */}
      {showGoals && (
        <section
          data-testid="health-goals-panel"
          className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900/50"
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">健康目标</h2>
            <button
              type="button"
              aria-label="关闭目标设置"
              onClick={() => setShowGoals(false)}
              className="rounded p-1 text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {GOAL_FIELDS.map((f) => (
              <label key={f.key} className="block">
                <span className="mb-1 block text-[11px] text-stone-500 dark:text-stone-400">
                  {f.label}
                  <span className="ml-1 text-stone-400">{f.unit}</span>
                </span>
                <input
                  type="number"
                  step={f.step}
                  data-testid={`health-goal-${f.key}`}
                  value={(goals as any)[f.key]}
                  onChange={(e) =>
                    onUpdateGoals({
                      ...goals,
                      [f.key]: Number(e.target.value) || 0,
                    })
                  }
                  className="w-full rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm tabular-nums outline-none focus:border-stone-900 dark:border-stone-700 dark:bg-stone-900 dark:focus:border-white"
                />
              </label>
            ))}
          </div>
          <button
            type="button"
            data-testid="health-goals-reset"
            onClick={() => onUpdateGoals(DEFAULT_HEALTH_GOALS)}
            className="mt-3 text-[11px] text-stone-500 underline-offset-2 hover:underline dark:text-stone-400"
          >
            恢复默认目标
          </button>
        </section>
      )}

      {/* ================= 导入面板 ================= */}
      {showImport && (
        <section
          data-testid="health-import-panel"
          className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900/50"
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">导入健康数据</h2>
            <button
              type="button"
              aria-label="关闭导入面板"
              onClick={() => setShowImport(false)}
              className="rounded p-1 text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-[11px] leading-relaxed text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            <div className="mb-1 flex items-center gap-1.5 font-semibold">
              <Info className="h-3.5 w-3.5" />
              关于「直接连薄荷健康 / Apple 健康」的真实情况
            </div>
            <p>
              薄荷健康没有开放平台或开发者 API，Apple HealthKit 是纯设备端框架、
              浏览器也读不到 —— 所以不存在「点一下就自动同步」的直连通道。
              现实可行的做法是：在对应 App 里导出文件，再在这里导入。
              导入后所有分析都在你本机浏览器完成，数据不出本地。
            </p>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              data-testid="health-import-file"
              accept=".csv,.txt,.json,.xml,.xlsx,.xlsm"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            <button
              type="button"
              data-testid="health-import-trigger"
              disabled={importing}
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-stone-900 px-3 py-2 text-xs font-medium text-white transition hover:bg-stone-700 disabled:opacity-50 dark:bg-white dark:text-stone-900"
            >
              {importing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              {importing ? '解析中…' : '选择文件导入'}
            </button>
            <span className="text-[11px] text-stone-500 dark:text-stone-400">
              支持 CSV / XLSX / Apple export.xml / 微信运动 JSON
            </span>
          </div>

          {lastResult && (
            <div
              data-testid="health-import-result"
              data-imported={lastResult.imported}
              data-added={lastResult.added}
              data-merged={lastResult.merged}
              className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 text-[11px] text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"
            >
              <div className="mb-1 flex items-center gap-1.5 font-semibold">
                <CheckCircle2 className="h-3.5 w-3.5" />
                导入成功：{SOURCE_LABEL[lastResult.detectedSource]}
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 md:grid-cols-4">
                <span>解析 {lastResult.imported} 条</span>
                <span>新增 {lastResult.added} 天</span>
                <span>覆盖 {lastResult.merged} 天</span>
                <span>
                  {lastResult.dateFrom ?? '—'} ~ {lastResult.dateTo ?? '—'}
                </span>
              </div>
              {lastResult.detectedFields.length > 0 && (
                <div className="mt-1.5">
                  识别到的指标：
                  {lastResult.detectedFields.map((f) => (
                    <span
                      key={f}
                      className="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] dark:bg-emerald-900/50"
                    >
                      {f}
                    </span>
                  ))}
                </div>
              )}
              {lastResult.skipped.length > 0 && (
                <div className="mt-1.5 text-amber-800 dark:text-amber-300">
                  跳过 {lastResult.skipped.length} 行：
                  {lastResult.skipped.slice(0, 3).map((s, i) => (
                    <span key={i} className="ml-1">
                      第 {s.row} 行（{s.reason}）
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {SOURCE_ORDER.map((s) => (
              <div
                key={s}
                data-testid={`health-source-${s}`}
                className="rounded-lg border border-stone-200 p-2.5 dark:border-stone-800"
              >
                <div className="mb-1 flex items-center gap-1.5 text-xs font-medium">
                  <Link2 className="h-3 w-3 text-stone-400" />
                  {SOURCE_LABEL[s]}
                </div>
                <p className="text-[11px] leading-relaxed text-stone-500 dark:text-stone-400">
                  {SOURCE_GUIDE[s]}
                </p>
              </div>
            ))}
          </div>

          {importBatches.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-2 text-xs font-semibold">导入历史</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[11px]">
                  <thead className="text-stone-400">
                    <tr className="border-b border-stone-200 dark:border-stone-800">
                      <th className="py-1.5 pr-3 font-medium">来源</th>
                      <th className="py-1.5 pr-3 font-medium">文件</th>
                      <th className="py-1.5 pr-3 font-medium">条数</th>
                      <th className="py-1.5 pr-3 font-medium">覆盖</th>
                      <th className="py-1.5 font-medium">时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importBatches.slice(-10).reverse().map((b) => (
                      <tr
                        key={b.batchId}
                        className="border-b border-stone-100 dark:border-stone-800/60"
                      >
                        <td className="py-1.5 pr-3">{SOURCE_LABEL[b.source]}</td>
                        <td className="max-w-[160px] truncate py-1.5 pr-3">{b.fileName}</td>
                        <td className="py-1.5 pr-3 tabular-nums">{b.imported}</td>
                        <td className="py-1.5 pr-3 tabular-nums">{b.merged}</td>
                        <td className="py-1.5 text-stone-400">
                          {new Date(b.importedAt).toLocaleString('zh-CN', {
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ================= 手动记录表单 ================= */}
      {showEntryForm && (
        <section
          data-testid="health-entry-form"
          className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900/50"
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">手动记录</h2>
            <button
              type="button"
              aria-label="关闭记录表单"
              onClick={() => setShowEntryForm(false)}
              className="rounded p-1 text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <label className="mb-3 block">
            <span className="mb-1 block text-[11px] text-stone-500 dark:text-stone-400">
              日期
            </span>
            <input
              type="date"
              data-testid="health-entry-date"
              value={formDate}
              onChange={(e) => setFormDate(e.target.value)}
              className="rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-stone-900 dark:border-stone-700 dark:bg-stone-900 dark:focus:border-white"
            />
          </label>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {ENTRY_FIELDS.map((f) => (
              <label key={f.key} className="block">
                <span className="mb-1 block text-[11px] text-stone-500 dark:text-stone-400">
                  {f.label}
                  <span className="ml-1 text-stone-400">{f.unit}</span>
                </span>
                <input
                  type="number"
                  step={f.step}
                  data-testid={`health-entry-${f.key}`}
                  value={(form as any)[f.key] ?? ''}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, [f.key]: e.target.value }))
                  }
                  className="w-full rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm tabular-nums outline-none focus:border-stone-900 dark:border-stone-700 dark:bg-stone-900 dark:focus:border-white"
                />
              </label>
            ))}
          </div>

          <label className="mt-3 block">
            <span className="mb-1 block text-[11px] text-stone-500 dark:text-stone-400">
              备注
            </span>
            <input
              type="text"
              data-testid="health-entry-note"
              value={form.note}
              onChange={(e) => setForm((prev) => ({ ...prev, note: e.target.value }))}
              placeholder="今天的感受、饮食内容、异常情况…"
              className="w-full rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-stone-900 dark:border-stone-700 dark:bg-stone-900 dark:focus:border-white"
            />
          </label>

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              data-testid="health-entry-save"
              onClick={handleSaveEntry}
              className="rounded-lg bg-stone-900 px-3 py-2 text-xs font-medium text-white transition hover:bg-stone-700 dark:bg-white dark:text-stone-900"
            >
              保存记录
            </button>
            <button
              type="button"
              onClick={() => setShowEntryForm(false)}
              className="rounded-lg border border-stone-300 px-3 py-2 text-xs font-medium dark:border-stone-700"
            >
              取消
            </button>
          </div>
        </section>
      )}

      {/* ================= KPI ================= */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard
          testId="health-kpi-score"
          icon={<Target className="h-3.5 w-3.5" />}
          label="健康评分"
          value={analysis.overallScore > 0 ? String(analysis.overallScore) : '—'}
          unit="/100"
          hint={`${latest?.label ?? ''} · 覆盖 ${Math.round(analysis.coverage * 100)}%`}
        />
        <KpiCard
          testId="health-kpi-sleep"
          icon={<Moon className="h-3.5 w-3.5" />}
          label="平均睡眠"
          value={latest ? latest.avgSleepHours.toFixed(1) : '—'}
          unit="h"
          hint={`目标 ${goals.sleepTargetHours}h · 连续 ${sleepStreak} 天达标`}
        />
        <KpiCard
          testId="health-kpi-exercise"
          icon={<Activity className="h-3.5 w-3.5" />}
          label="平均运动"
          value={latest ? String(latest.avgExerciseMinutes) : '—'}
          unit="min"
          hint={`目标 ${goals.exerciseTargetMinutes}min · 连续 ${exStreak} 天达标`}
        />
        <KpiCard
          testId="health-kpi-weight"
          icon={<Scale className="h-3.5 w-3.5" />}
          label="当前体重"
          value={latest && latest.latestWeightKg ? latest.latestWeightKg.toFixed(1) : '—'}
          unit="kg"
          hint={
            latest && latest.weightDeltaKg !== 0
              ? `较上一周期 ${latest.weightDeltaKg > 0 ? '+' : ''}${latest.weightDeltaKg}kg`
              : goals.targetWeightKg > 0
                ? `目标 ${goals.targetWeightKg}kg`
                : '未设目标体重'
          }
        />
      </section>

      {/* ================= 四维评分 ================= */}
      {latest && latest.daysRecorded > 0 && (
        <section
          data-testid="health-score-rings"
          className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900/50"
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">四维健康评分</h2>
            <span className="text-[11px] text-stone-500 dark:text-stone-400">
              {latest.label} · {latest.daysRecorded} 天有记录
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-around gap-4">
            <ScoreRing
              testId="health-ring-sleep"
              score={latest.scoreBreakdown.sleep}
              label="睡眠"
              color="#6366f1"
            />
            <ScoreRing
              testId="health-ring-exercise"
              score={latest.scoreBreakdown.exercise}
              label="运动"
              color="#10b981"
            />
            <ScoreRing
              testId="health-ring-diet"
              score={latest.scoreBreakdown.diet}
              label="饮食"
              color="#f59e0b"
            />
            <ScoreRing
              testId="health-ring-body"
              score={latest.scoreBreakdown.body}
              label="身体"
              color="#a855f7"
            />
          </div>
        </section>
      )}

      {/* ================= 趋势图 ================= */}
      <section className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900/50">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">指标趋势</h2>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-stone-200 p-0.5 dark:border-stone-800">
              {PERIOD_TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  data-testid="health-period-tab"
                  data-period={t.id}
                  data-active={period === t.id ? 'true' : 'false'}
                  onClick={() => setPeriod(t.id)}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
                    period === t.id
                      ? 'bg-stone-900 text-white dark:bg-white dark:text-stone-900'
                      : 'text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <select
              data-testid="health-metric-select"
              value={activeMetric}
              onChange={(e) => setActiveMetric(e.target.value as HealthMetricKey)}
              className="rounded-lg border border-stone-300 bg-white px-2 py-1 text-[11px] outline-none dark:border-stone-700 dark:bg-stone-900"
            >
              {METRIC_CHOICES.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mb-2 flex flex-wrap items-center gap-3 text-[11px] text-stone-500 dark:text-stone-400">
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: metricMeta.color }}
            />
            {metricMeta.label}（{metricMeta.unit}）
          </span>
          {metricTarget !== undefined && (
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 bg-amber-500" />
              目标 {metricTarget}
            </span>
          )}
          {activeMetricTrend && (
            <span
              data-testid="health-trend-badge"
              data-direction={activeMetricTrend.direction}
              className="inline-flex items-center gap-1"
            >
              {activeMetricTrend.direction === 'up' ? (
                <TrendingUp className="h-3 w-3 text-emerald-500" />
              ) : activeMetricTrend.direction === 'down' ? (
                <TrendingDown className="h-3 w-3 text-rose-500" />
              ) : (
                <Minus className="h-3 w-3 text-stone-400" />
              )}
              近期 {activeMetricTrend.recentAvg}
              {activeMetricTrend.delta !== 0 && (
                <span
                  className={
                    activeMetricTrend.delta > 0 ? 'text-emerald-600' : 'text-rose-600'
                  }
                >
                  （{activeMetricTrend.delta > 0 ? '+' : ''}
                  {activeMetricTrend.delta}）
                </span>
              )}
            </span>
          )}
        </div>

        <LineChart
          testId="health-metric-chart"
          data={chartData}
          color={metricMeta.color}
          unit={metricMeta.unit}
          target={metricTarget}
          targetLabel={metricTarget !== undefined ? `目标 ${metricTarget}` : undefined}
        />
      </section>

      {/* ================= 睡眠结构 + 热量 ================= */}
      <section className="grid gap-3 md:grid-cols-2">
        <div
          data-testid="health-sleep-structure"
          className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900/50"
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold">
              <Moon className="h-3.5 w-3.5 text-indigo-500" />
              睡眠结构
            </h2>
            {latestSleep && (
              <span className="text-[11px] text-stone-500 dark:text-stone-400">
                {latestSleep.date}
              </span>
            )}
          </div>
          {latestSleep?.sleepHours ? (
            <div className="space-y-3">
              <SleepStack
                testId="health-sleep-stack"
                deep={latestSleep.deepSleepHours ?? 0}
                rem={latestSleep.remSleepHours ?? 0}
                light={
                  latestSleep.lightSleepHours ??
                  Math.max(
                    0,
                    latestSleep.sleepHours -
                      (latestSleep.deepSleepHours ?? 0) -
                      (latestSleep.remSleepHours ?? 0)
                  )
                }
                total={latestSleep.sleepHours}
              />
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded-lg bg-stone-50 p-2 dark:bg-stone-800/50">
                  <div className="text-stone-400">入睡 / 起床</div>
                  <div className="mt-0.5 font-medium tabular-nums">
                    {fmtMinutes(latestSleep.bedtimeMinutes)} →{' '}
                    {fmtMinutes(latestSleep.wakeTimeMinutes)}
                  </div>
                </div>
                <div className="rounded-lg bg-stone-50 p-2 dark:bg-stone-800/50">
                  <div className="text-stone-400">夜醒次数</div>
                  <div className="mt-0.5 font-medium tabular-nums">
                    {latestSleep.awakenCount ?? '—'}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <EmptyHint text="还没有睡眠数据。手动记录，或从健康 App 导出后导入。" />
          )}
        </div>

        <div
          data-testid="health-calorie-balance"
          className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900/50"
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold">
              <Utensils className="h-3.5 w-3.5 text-amber-500" />
              热量平衡
            </h2>
            {latest && (
              <span className="text-[11px] text-stone-500 dark:text-stone-400">
                {latest.label} 日均
              </span>
            )}
          </div>
          {latest && (latest.avgCaloriesIntake > 0 || latest.avgCaloriesBurned > 0) ? (
            <div className="space-y-3">
              <CalorieBalance
                testId="health-calorie-bars"
                intake={latest.avgCaloriesIntake}
                burned={latest.avgCaloriesBurned}
              />
              <div className="grid grid-cols-3 gap-2 text-[11px]">
                <MacroStat label="蛋白质" value={avgMacro(entries, 'proteinG')} unit="g" />
                <MacroStat label="碳水" value={avgMacro(entries, 'carbsG')} unit="g" />
                <MacroStat label="脂肪" value={avgMacro(entries, 'fatG')} unit="g" />
              </div>
            </div>
          ) : (
            <EmptyHint text="还没有饮食数据。手动记录，或从薄荷健康导出后导入。" />
          )}
        </div>
      </section>

      {/* ================= 步数 ================= */}
      <section className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900/50">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold">
            <Footprints className="h-3.5 w-3.5 text-emerald-500" />
            每日步数
          </h2>
          <span className="text-[11px] text-stone-500 dark:text-stone-400">
            目标 {goals.stepTarget} 步 · 最近 14 天
          </span>
        </div>
        {entries.some((e) => e.steps) ? (
          <BarChart
            testId="health-steps-chart"
            data={stepBars}
            color="#22c55e"
            hitColor="#f59e0b"
            unit="步"
            target={goals.stepTarget}
            targetLabel={`目标 ${goals.stepTarget}`}
          />
        ) : (
          <EmptyHint text="还没有步数数据。导入微信运动 / 华为 / Apple 健康数据后这里会自动填充。" />
        )}
      </section>

      {/* ================= 体重 ================= */}
      {weightPoints.length > 0 && (
        <section className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900/50">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold">
              <Scale className="h-3.5 w-3.5 text-purple-500" />
              体重变化
            </h2>
            {goals.targetWeightKg > 0 && (
              <span className="text-[11px] text-stone-500 dark:text-stone-400">
                目标 {goals.targetWeightKg} kg
              </span>
            )}
          </div>
          <LineChart
            testId="health-weight-chart"
            data={weightPoints}
            color="#a855f7"
            unit="kg"
            target={goals.targetWeightKg || undefined}
            targetLabel={goals.targetWeightKg > 0 ? `目标 ${goals.targetWeightKg}` : undefined}
          />
        </section>
      )}

      {/* ================= 洞察 ================= */}
      <section className="grid gap-3 md:grid-cols-2">
        <div
          data-testid="health-insights"
          className="min-w-0 rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900/50"
        >
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
            <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
            分析洞察
          </h2>
          {analysis.insights.length ? (
            <ul className="space-y-2">
              {analysis.insights.slice(0, 8).map((ins) => (
                <li
                  key={ins.id}
                  data-testid="health-insight-item"
                  data-severity={ins.severity}
                  data-kind={ins.kind}
                  className={`rounded-lg border p-2.5 ${
                    ins.severity === 'critical'
                      ? 'border-rose-200 bg-rose-50/70 dark:border-rose-900 dark:bg-rose-950/30'
                      : ins.severity === 'warning'
                        ? 'border-amber-200 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/30'
                        : 'border-stone-200 dark:border-stone-800'
                  }`}
                >
                  <div className="flex items-start gap-1.5">
                    {ins.severity === 'info' ? (
                      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-stone-400" />
                    ) : (
                      <AlertTriangle
                        className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                          ins.severity === 'critical' ? 'text-rose-500' : 'text-amber-500'
                        }`}
                      />
                    )}
                    <div className="min-w-0">
                      <div className="text-xs font-medium">{ins.title}</div>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-stone-600 dark:text-stone-400">
                        {ins.detail}
                      </p>
                      {ins.action && (
                        <p className="mt-1 text-[11px] font-medium text-stone-700 dark:text-stone-300">
                          → {ins.action}
                        </p>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyHint text="数据还不够，多记录几天就会出现相关性洞察。" />
          )}
        </div>

        <div
          data-testid="health-correlations"
          className="min-w-0 rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900/50"
        >
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
            <Link2 className="h-3.5 w-3.5 text-indigo-500" />
            指标相关性
          </h2>
          {analysis.correlations.length ? (
            <ul className="space-y-1.5">
              {analysis.correlations.slice(0, 8).map((c, i) => (
                <li
                  key={`${c.xKey}-${c.yKey}-${i}`}
                  data-testid="health-correlation-item"
                  data-strength={c.strength}
                  data-r={c.r.toFixed(3)}
                  className="rounded-lg border border-stone-200 px-2.5 py-1.5 dark:border-stone-800"
                >
                  {/* 移动端上下两行，桌面端单行；避免固定宽度标签撑破 Grid 轨道 */}
                  <div className="flex items-center gap-2 md:hidden">
                    <span className="min-w-0 flex-1 truncate text-[11px] font-medium">
                      {c.xLabel} × {c.yLabel}
                    </span>
                    <span className="shrink-0 text-[11px] font-medium tabular-nums">
                      {c.r >= 0 ? '+' : ''}
                      {c.r.toFixed(2)}
                    </span>
                    <span className="w-9 shrink-0 text-right text-[10px] text-stone-400">
                      n={c.n}
                    </span>
                  </div>
                  <div className="hidden items-center gap-2 md:flex">
                    <span className="w-24 shrink-0 truncate text-[11px] font-medium">
                      {c.xLabel}
                    </span>
                    <span className="text-[11px] text-stone-400">×</span>
                    <span className="w-24 shrink-0 truncate text-[11px] font-medium">
                      {c.yLabel}
                    </span>
                    <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
                      <div
                        className={`h-full rounded-full ${
                          c.r >= 0
                            ? 'bg-emerald-500'
                            : 'bg-rose-500'
                        }`}
                        style={{ width: `${Math.abs(c.r) * 100}%` }}
                      />
                    </div>
                    <span className="w-12 shrink-0 text-right text-[11px] font-medium tabular-nums">
                      {c.r >= 0 ? '+' : ''}
                      {c.r.toFixed(2)}
                    </span>
                    <span className="w-14 shrink-0 text-right text-[10px] text-stone-400">
                      n={c.n}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyHint text="需要至少 3 天的同指标记录才能算出相关性。" />
          )}
        </div>
      </section>

      {/* ================= 记录明细 ================= */}
      <section className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900/50">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">记录明细</h2>
          <span className="text-[11px] text-stone-500 dark:text-stone-400">
            共 {entries.length} 天
          </span>
        </div>
        {entries.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px]">
              <thead className="text-stone-400">
                <tr className="border-b border-stone-200 dark:border-stone-800">
                  <th className="py-1.5 pr-3 font-medium">日期</th>
                  <th className="py-1.5 pr-3 font-medium">来源</th>
                  <th className="py-1.5 pr-3 font-medium">睡眠</th>
                  <th className="py-1.5 pr-3 font-medium">运动</th>
                  <th className="py-1.5 pr-3 font-medium">步数</th>
                  <th className="py-1.5 pr-3 font-medium">摄入</th>
                  <th className="py-1.5 pr-3 font-medium">消耗</th>
                  <th className="py-1.5 pr-3 font-medium">饮水</th>
                  <th className="py-1.5 pr-3 font-medium">体重</th>
                  <th className="py-1.5 font-medium" />
                </tr>
              </thead>
              <tbody>
                {[...entries].reverse().slice(0, 30).map((e) => (
                  <tr
                    key={e.id}
                    data-testid="health-entry-row"
                    data-date={e.date}
                    className="border-b border-stone-100 dark:border-stone-800/60"
                  >
                    <td className="py-1.5 pr-3 font-medium tabular-nums">{e.date}</td>
                    <td className="py-1.5 pr-3 text-stone-500 dark:text-stone-400">
                      {SOURCE_LABEL[e.source]}
                    </td>
                    <td className="py-1.5 pr-3 tabular-nums">
                      {e.sleepHours !== undefined ? `${e.sleepHours}h` : '—'}
                    </td>
                    <td className="py-1.5 pr-3 tabular-nums">
                      {e.exerciseMinutes !== undefined ? `${e.exerciseMinutes}m` : '—'}
                    </td>
                    <td className="py-1.5 pr-3 tabular-nums">{e.steps ?? '—'}</td>
                    <td className="py-1.5 pr-3 tabular-nums">
                      {e.caloriesIntake !== undefined ? e.caloriesIntake : '—'}
                    </td>
                    <td className="py-1.5 pr-3 tabular-nums">
                      {e.caloriesBurned !== undefined ? e.caloriesBurned : '—'}
                    </td>
                    <td className="py-1.5 pr-3 tabular-nums">
                      {e.waterMl !== undefined ? `${e.waterMl}ml` : '—'}
                    </td>
                    <td className="py-1.5 pr-3 tabular-nums">
                      {e.weightKg !== undefined ? `${e.weightKg}kg` : '—'}
                    </td>
                    <td className="py-1.5 text-right">
                      <button
                        type="button"
                        data-testid="health-delete-entry"
                        aria-label={`删除 ${e.date} 的记录`}
                        onClick={() => handleDelete(e.date)}
                        className="rounded p-1 text-stone-300 transition hover:bg-rose-50 hover:text-rose-500 dark:text-stone-600 dark:hover:bg-rose-950/50"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyHint text="还没有任何记录。点「手动记录」开始，或从健康 App 导出文件导入。" />
        )}
      </section>
    </div>
  );
};

// ==========================================
// 子组件
// ==========================================

const GOAL_FIELDS: {
  key: keyof HealthGoals;
  label: string;
  unit: string;
  step: number;
}[] = [
  { key: 'sleepTargetHours', label: '目标睡眠', unit: 'h', step: 0.5 },
  { key: 'exerciseTargetMinutes', label: '目标运动', unit: 'min', step: 5 },
  { key: 'stepTarget', label: '目标步数', unit: '步', step: 500 },
  { key: 'waterTargetMl', label: '目标饮水', unit: 'ml', step: 100 },
  { key: 'calorieIntakeCap', label: '摄入上限', unit: 'kcal', step: 50 },
  { key: 'calorieBurnTarget', label: '消耗目标', unit: 'kcal', step: 50 },
  { key: 'targetWeightKg', label: '目标体重', unit: 'kg', step: 0.5 },
  { key: 'targetBodyFatPct', label: '目标体脂', unit: '%', step: 0.5 },
];

const ENTRY_FIELDS: {
  key: string;
  label: string;
  unit: string;
  step: number;
}[] = [
  { key: 'sleepHours', label: '睡眠时长', unit: 'h', step: 0.1 },
  { key: 'deepSleepHours', label: '深睡', unit: 'h', step: 0.1 },
  { key: 'remSleepHours', label: 'REM', unit: 'h', step: 0.1 },
  { key: 'exerciseMinutes', label: '运动时长', unit: 'min', step: 5 },
  { key: 'steps', label: '步数', unit: '步', step: 100 },
  { key: 'caloriesIntake', label: '摄入热量', unit: 'kcal', step: 10 },
  { key: 'proteinG', label: '蛋白质', unit: 'g', step: 5 },
  { key: 'carbsG', label: '碳水', unit: 'g', step: 5 },
  { key: 'fatG', label: '脂肪', unit: 'g', step: 5 },
  { key: 'waterMl', label: '饮水', unit: 'ml', step: 100 },
  { key: 'caloriesBurned', label: '消耗热量', unit: 'kcal', step: 10 },
  { key: 'weightKg', label: '体重', unit: 'kg', step: 0.1 },
  { key: 'bodyFatPct', label: '体脂率', unit: '%', step: 0.1 },
  { key: 'restingHr', label: '静息心率', unit: 'bpm', step: 1 },
  { key: 'energyLevel', label: '主观精力', unit: '/5', step: 1 },
];

const KpiCard: React.FC<{
  testId: string;
  icon: React.ReactNode;
  label: string;
  value: string;
  unit?: string;
  hint?: string;
}> = ({ testId, icon, label, value, unit, hint }) => (
  <div
    data-testid={testId}
    className="rounded-xl border border-stone-200 bg-white p-3 dark:border-stone-800 dark:bg-stone-900/50"
  >
    <div className="mb-1 flex items-center gap-1.5 text-[11px] text-stone-500 dark:text-stone-400">
      {icon}
      {label}
    </div>
    <div className="flex items-baseline gap-1">
      <span className="text-xl font-semibold tabular-nums">{value}</span>
      {unit && <span className="text-[11px] text-stone-400">{unit}</span>}
    </div>
    {hint && (
      <div className="mt-0.5 truncate text-[10px] text-stone-400">{hint}</div>
    )}
  </div>
);

const MacroStat: React.FC<{ label: string; value: number; unit: string }> = ({
  label,
  value,
  unit,
}) => (
  <div className="rounded-lg bg-stone-50 p-2 dark:bg-stone-800/50">
    <div className="text-stone-400">{label}</div>
    <div className="mt-0.5 font-medium tabular-nums">
      {value > 0 ? Math.round(value) : '—'} {value > 0 ? unit : ''}
    </div>
  </div>
);

const EmptyHint: React.FC<{ text: string }> = ({ text }) => (
  <p className="rounded-lg border border-dashed border-stone-300 px-3 py-6 text-center text-[11px] text-stone-400 dark:border-stone-700">
    {text}
  </p>
);

// ==========================================
// 辅助函数
// ==========================================

/** 周期汇总里对应某个指标的字段名 */
function metricRollupField(key: HealthMetricKey): string {
  switch (key) {
    case 'sleepHours': return 'avgSleepHours';
    case 'exerciseMinutes': return 'avgExerciseMinutes';
    case 'steps': return 'avgSteps';
    case 'caloriesIntake': return 'avgCaloriesIntake';
    case 'caloriesBurned': return 'avgCaloriesBurned';
    case 'waterMl': return 'avgWaterMl';
    case 'weightKg': return 'latestWeightKg';
    default: return 'avgSteps';
  }
}

/** 最近 14 天的宏量营养素日均 */
function avgMacro(
  entries: HealthDailyEntry[],
  key: 'proteinG' | 'carbsG' | 'fatG'
): number {
  const vals = entries
    .map((e) => e[key])
    .filter((v): v is number => typeof v === 'number');
  if (!vals.length) return 0;
  return vals.reduce((s, v) => s + v, 0) / vals.length;
}
