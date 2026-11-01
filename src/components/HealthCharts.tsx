/**
 * 轻量手写 SVG 图表组件（无第三方图表库）
 *
 * 为什么不用图表库：
 *  - 单文件 HTML 交付要求零外部依赖，图表库会显著增大体积；
 *  - 这些图表的形态很确定（折线 / 柱状 / 环形），自己画更可控；
 *  - 所有图表都暴露 data-* 钩子，方便 e2e 直接读 DOM 断言。
 */
import React, { useMemo } from 'react';

// ==========================================
// 通用工具
// ==========================================

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const exp = Math.floor(Math.log10(value));
  const base = Math.pow(10, exp);
  const norm = value / base;
  let step: number;
  if (norm <= 1) step = 1;
  else if (norm <= 2) step = 2;
  else if (norm <= 5) step = 5;
  else step = 10;
  return step * base;
}

function fmtNum(v: number): string {
  if (!Number.isFinite(v)) return '—';
  if (Math.abs(v) >= 10000) return `${Math.round(v / 1000)}k`;
  if (Math.abs(v) >= 100) return String(Math.round(v));
  if (Math.abs(v) >= 10) return v.toFixed(1);
  return v.toFixed(1);
}

// ==========================================
// 折线图
// ==========================================

export interface LinePoint {
  label: string;
  value: number | null;
  /** 可选的第二序列（例如目标线） */
  target?: number;
}

export interface LineChartProps {
  data: LinePoint[];
  color?: string;
  targetColor?: string;
  unit?: string;
  height?: number;
  /** 目标值（贯穿一条参考线） */
  target?: number;
  /** 目标线文案 */
  targetLabel?: string;
  testId?: string;
}

export const LineChart: React.FC<LineChartProps> = ({
  data,
  color = '#6366f1',
  targetColor = '#f59e0b',
  unit = '',
  height = 180,
  target,
  targetLabel,
  testId,
}) => {
  const W = 680;
  const H = height;
  const padL = 42;
  const padR = 16;
  const padT = 14;
  const padB = 26;

  const values = data.map((d) => d.value).filter((v): v is number => v !== null);
  const maxRaw = Math.max(...values, target ?? 0, 0);
  const max = niceMax(maxRaw * 1.15) || 1;

  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const x = (i: number) =>
    padL + (data.length <= 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
  const y = (v: number) => padT + innerH - (v / max) * innerH;

  const paths = useMemo(() => {
    let cur = '';
    let started = false;
    const segments: string[] = [];
    data.forEach((d, i) => {
      if (d.value === null) {
        if (started) {
          segments.push(cur);
          cur = '';
          started = false;
        }
        return;
      }
      cur += `${started ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.value).toFixed(1)} `;
      started = true;
    });
    if (cur) segments.push(cur);
    return segments;
  }, [data, max]);

  const areaPath = useMemo(() => {
    if (!paths.length) return '';
    // 从路径里抽出所有 x 坐标，首尾用于闭合面积图
    const xs: number[] = [];
    for (const p of paths) {
      const re = /[ML]\s*(-?[\d.]+),(-?[\d.]+)/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(p)) !== null) xs.push(Number(m[1]));
    }
    if (!xs.length) return '';
    const startX = xs[0];
    const endX = xs[xs.length - 1];
    return `${paths[0]} L${endX.toFixed(1)},${(padT + innerH).toFixed(1)} L${startX.toFixed(1)},${(padT + innerH).toFixed(1)} Z`;
  }, [paths, innerH, padT]);

  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const labelStep = Math.max(1, Math.ceil(data.length / 8));

  return (
    <div data-testid={testId} className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img">
        {/* 网格与 Y 轴刻度 */}
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={padL}
              x2={W - padR}
              y1={padT + innerH * (1 - t)}
              y2={padT + innerH * (1 - t)}
              stroke="currentColor"
              strokeOpacity={0.08}
              strokeWidth={1}
            />
            <text
              x={padL - 6}
              y={padT + innerH * (1 - t) + 4}
              textAnchor="end"
              className="fill-stone-400 dark:fill-stone-500"
              fontSize={10}
            >
              {fmtNum(max * t)}
            </text>
          </g>
        ))}

        {/* 目标参考线 */}
        {target !== undefined && target > 0 && (
          <>
            <line
              x1={padL}
              x2={W - padR}
              y1={y(target)}
              y2={y(target)}
              stroke={targetColor}
              strokeWidth={1.5}
              strokeDasharray="4 3"
            />
            {targetLabel && (
              <text
                x={W - padR}
                y={y(target) - 5}
                textAnchor="end"
                fill={targetColor}
                fontSize={10}
              >
                {targetLabel}
              </text>
            )}
          </>
        )}

        {/* 面积 + 折线 */}
        {paths.length > 0 && (
          <path d={areaPath} fill={color} fillOpacity={0.1} />
        )}
        {paths.map((p, i) => (
          <path
            key={i}
            d={p}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {/* 数据点 */}
        {data.map((d, i) =>
          d.value === null ? null : (
            <circle
              key={i}
              cx={x(i)}
              cy={y(d.value)}
              r={2.5}
              fill={color}
              className="dark:stroke-stone-900"
              strokeWidth={1}
            >
              <title>{`${d.label}: ${d.value}${unit}`}</title>
            </circle>
          )
        )}

        {/* X 轴标签（抽稀） */}
        {data.map((d, i) =>
          i % labelStep === 0 || i === data.length - 1 ? (
            <text
              key={i}
              x={x(i)}
              y={H - 8}
              textAnchor="middle"
              className="fill-stone-400 dark:fill-stone-500"
              fontSize={9}
            >
              {d.label}
            </text>
          ) : null
        )}
      </svg>
    </div>
  );
};

// ==========================================
// 柱状图
// ==========================================

export interface BarDatum {
  label: string;
  value: number;
  /** 达标线（超过则颜色不同） */
  hit?: boolean;
}

export interface BarChartProps {
  data: BarDatum[];
  color?: string;
  hitColor?: string;
  unit?: string;
  height?: number;
  target?: number;
  targetLabel?: string;
  testId?: string;
}

export const BarChart: React.FC<BarChartProps> = ({
  data,
  color = '#10b981',
  hitColor = '#f59e0b',
  unit = '',
  height = 160,
  target,
  targetLabel,
  testId,
}) => {
  const W = 680;
  const H = height;
  const padL = 42;
  const padR = 16;
  const padT = 14;
  const padB = 26;

  const max = niceMax(Math.max(...data.map((d) => d.value), target ?? 0, 0) * 1.15) || 1;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const slot = innerW / Math.max(1, data.length);
  const barW = Math.max(3, Math.min(26, slot * 0.62));

  const y = (v: number) => padT + innerH - (v / max) * innerH;
  const labelStep = Math.max(1, Math.ceil(data.length / 10));

  return (
    <div data-testid={testId} className="w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img">
        {[0, 0.5, 1].map((t) => (
          <g key={t}>
            <line
              x1={padL}
              x2={W - padR}
              y1={padT + innerH * (1 - t)}
              y2={padT + innerH * (1 - t)}
              stroke="currentColor"
              strokeOpacity={0.08}
            />
            <text
              x={padL - 6}
              y={padT + innerH * (1 - t) + 4}
              textAnchor="end"
              className="fill-stone-400 dark:fill-stone-500"
              fontSize={10}
            >
              {fmtNum(max * t)}
            </text>
          </g>
        ))}

        {target !== undefined && target > 0 && (
          <>
            <line
              x1={padL}
              x2={W - padR}
              y1={y(target)}
              y2={y(target)}
              stroke={hitColor}
              strokeWidth={1.5}
              strokeDasharray="4 3"
            />
            {targetLabel && (
              <text
                x={W - padR}
                y={y(target) - 5}
                textAnchor="end"
                fill={hitColor}
                fontSize={10}
              >
                {targetLabel}
              </text>
            )}
          </>
        )}

        {data.map((d, i) => {
          const cx = padL + slot * i + slot / 2;
          const top = y(d.value);
          const h = Math.max(1, padT + innerH - top);
          const fill = d.hit ? hitColor : color;
          return (
            <g key={i}>
              <rect
                x={cx - barW / 2}
                y={top}
                width={barW}
                height={h}
                rx={Math.min(3, barW / 3)}
                fill={fill}
                fillOpacity={0.85}
              >
                <title>{`${d.label}: ${d.value}${unit}`}</title>
              </rect>
            </g>
          );
        })}

        {data.map((d, i) =>
          i % labelStep === 0 || i === data.length - 1 ? (
            <text
              key={i}
              x={padL + slot * i + slot / 2}
              y={H - 8}
              textAnchor="middle"
              className="fill-stone-400 dark:fill-stone-500"
              fontSize={9}
            >
              {d.label}
            </text>
          ) : null
        )}
      </svg>
    </div>
  );
};

// ==========================================
// 四维评分环
// ==========================================

export interface ScoreRingProps {
  score: number;
  label: string;
  color?: string;
  size?: number;
  testId?: string;
}

export const ScoreRing: React.FC<ScoreRingProps> = ({
  score,
  label,
  color = '#10b981',
  size = 92,
  testId,
}) => {
  const r = 38;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score));
  const dash = (pct / 100) * c;

  return (
    <div
      data-testid={testId}
      data-score={Math.round(score)}
      className="flex flex-col items-center gap-1"
    >
      <svg width={size} height={size} viewBox="0 0 96 96">
        <circle
          cx="48"
          cy="48"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.1}
          strokeWidth={8}
        />
        <circle
          cx="48"
          cy="48"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          transform="rotate(-90 48 48)"
        />
        <text
          x="48"
          y="48"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="20"
          fontWeight="600"
          fill="currentColor"
        >
          {Math.round(score)}
        </text>
      </svg>
      <span className="text-[11px] text-stone-500 dark:text-stone-400">{label}</span>
    </div>
  );
};

// ==========================================
// 睡眠结构堆叠条
// ==========================================

export interface SleepStackProps {
  deep: number;
  rem: number;
  light: number;
  total: number;
  testId?: string;
}

export const SleepStack: React.FC<SleepStackProps> = ({
  deep,
  rem,
  light,
  total,
  testId,
}) => {
  const safeTotal = total > 0 ? total : 1;
  const parts = [
    { key: 'deep', label: '深睡', value: deep, color: '#4f46e5' },
    { key: 'rem', label: 'REM', value: rem, color: '#8b5cf6' },
    { key: 'light', label: '浅睡', value: light, color: '#a5b4fc' },
  ];
  return (
    <div data-testid={testId} className="w-full">
      <div className="flex h-5 w-full overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
        {parts.map((p) =>
          p.value > 0 ? (
            <div
              key={p.key}
              data-part={p.key}
              title={`${p.label} ${p.value.toFixed(1)}h`}
              style={{
                width: `${Math.max(0, (p.value / safeTotal) * 100)}%`,
                background: p.color,
              }}
            />
          ) : null
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-stone-500 dark:text-stone-400">
        {parts.map((p) => (
          <span key={p.key} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: p.color }}
            />
            {p.label} {p.value.toFixed(1)}h
          </span>
        ))}
      </div>
    </div>
  );
};

// ==========================================
// 热量平衡双条
// ==========================================

export interface CalorieBalanceProps {
  intake: number;
  burned: number;
  testId?: string;
}

export const CalorieBalance: React.FC<CalorieBalanceProps> = ({
  intake,
  burned,
  testId,
}) => {
  const max = Math.max(intake, burned, 1);
  const diff = intake - burned;
  return (
    <div data-testid={testId} className="space-y-2">
      <div>
        <div className="mb-1 flex justify-between text-[11px]">
          <span className="text-stone-500 dark:text-stone-400">摄入</span>
          <span className="font-medium tabular-nums">{Math.round(intake)} kcal</span>
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
          <div
            className="h-full rounded-full bg-amber-500"
            style={{ width: `${(intake / max) * 100}%` }}
          />
        </div>
      </div>
      <div>
        <div className="mb-1 flex justify-between text-[11px]">
          <span className="text-stone-500 dark:text-stone-400">消耗</span>
          <span className="font-medium tabular-nums">{Math.round(burned)} kcal</span>
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
          <div
            className="h-full rounded-full bg-orange-500"
            style={{ width: `${(burned / max) * 100}%` }}
          />
        </div>
      </div>
      <div className="text-[11px] text-stone-500 dark:text-stone-400">
        热量平衡{' '}
        <span
          className={
            diff > 0
              ? 'font-medium text-rose-600 dark:text-rose-400'
              : diff < 0
                ? 'font-medium text-emerald-600 dark:text-emerald-400'
                : 'font-medium'
          }
        >
          {diff > 0 ? '+' : ''}
          {Math.round(diff)} kcal
        </span>
        <span className="ml-1">（正数盈余 / 负数赤字）</span>
      </div>
    </div>
  );
};
