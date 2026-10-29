import React, { useId } from 'react';
import { LifeWheelScores } from '../types';
import { Sparkles, Sliders, Info } from 'lucide-react';

interface Props {
  scores: LifeWheelScores;
  onChange?: (newScores: LifeWheelScores) => void;
  readOnly?: boolean;
}

const DIMENSIONS: { key: keyof LifeWheelScores; label: string; icon: string; color: string }[] = [
  { key: 'career', label: '事业技能', icon: '💼', color: '#3B82F6' },
  { key: 'health', label: '身体健康', icon: '🏃', color: '#10B981' },
  { key: 'wealth', label: '财务自由', icon: '💰', color: '#F59E0B' },
  { key: 'mindset', label: '思维认知', icon: '🧠', color: '#8B5CF6' },
  { key: 'relationship', label: '亲密关系', icon: '❤️', color: '#EC4899' },
  { key: 'family', label: '家庭亲情', icon: '🏡', color: '#06B6D4' },
  { key: 'creation', label: '创造热爱', icon: '🎨', color: '#14B8A6' },
  { key: 'peace', label: '精神宁静', icon: '🕊️', color: '#6366F1' },
];

export const LifeWheelRadar: React.FC<Props> = ({ scores, onChange, readOnly = false }) => {
  const gradientId = useId();
  const [activeKey, setActiveKey] = React.useState<keyof LifeWheelScores | null>(null);

  const numAxes = DIMENSIONS.length;
  const size = 340;
  const center = size / 2;
  const radius = size * 0.38;

  // Calculate coordinates for a given dimension index and value (1-10)
  const getCoordinates = (index: number, value: number) => {
    const angle = (Math.PI * 2 * index) / numAxes - Math.PI / 2;
    const r = (value / 10) * radius;
    const x = center + r * Math.cos(angle);
    const y = center + r * Math.sin(angle);
    return { x, y };
  };

  // Build the polygon points for current scores
  const polygonPoints = DIMENSIONS.map((dim, i) => {
    const val = scores[dim.key] || 1;
    const { x, y } = getCoordinates(i, val);
    return `${x},${y}`;
  }).join(' ');

  // Compute average and smoothness balance
  const values = Object.values(scores);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);
  // Balance score out of 100: higher when stdDev is low and avg is healthy
  const balanceIndex = Math.max(30, Math.round(100 - stdDev * 16));

  const handleSliderChange = (key: keyof LifeWheelScores, val: number) => {
    if (!onChange || readOnly) return;
    onChange({
      ...scores,
      [key]: val,
    });
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <span>生命之轮平衡度透视</span>
            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
              平衡指数 {balanceIndex}/100
            </span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            人生如车轮，各维度越均衡充盈，生活前进时颠簸阻力越小
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
        {/* SVG Radar */}
        <div className="md:col-span-7 flex justify-center relative">
          <svg width={size} height={size} className="overflow-visible select-none">
            <defs>
              <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#10B981" stopOpacity="0.45" />
                <stop offset="50%" stopColor="#3B82F6" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0.45" />
              </linearGradient>
            </defs>

            {/* Concentric circles (levels 2, 4, 6, 8, 10) */}
            {[2, 4, 6, 8, 10].map((level) => {
              const r = (level / 10) * radius;
              return (
                <circle
                  key={level}
                  cx={center}
                  cy={center}
                  r={r}
                  fill="none"
                  stroke="currentColor"
                  strokeDasharray={level === 10 ? undefined : '3 3'}
                  className="text-slate-200 dark:text-slate-800"
                  strokeWidth={level === 10 ? '1.5' : '1'}
                />
              );
            })}

            {/* Axis spokes */}
            {DIMENSIONS.map((dim, i) => {
              const { x, y } = getCoordinates(i, 10);
              return (
                <line
                  key={dim.key}
                  x1={center}
                  y1={center}
                  x2={x}
                  y2={y}
                  stroke="currentColor"
                  className="text-slate-200 dark:text-slate-800"
                  strokeWidth="1"
                />
              );
            })}

            {/* Scores polygon fill */}
            <polygon
              points={polygonPoints}
              fill={`url(#${gradientId})`}
              stroke="#059669"
              strokeWidth="2.5"
              className="transition-all duration-300 drop-shadow-sm"
            />

            {/* Vertex Dots and Labels */}
            {DIMENSIONS.map((dim, i) => {
              const val = scores[dim.key] || 1;
              const { x, y } = getCoordinates(i, val);
              const labelPos = getCoordinates(i, 11.8);
              const isSelected = activeKey === dim.key;

              return (
                <g
                  key={dim.key}
                  className="cursor-pointer group"
                  onMouseEnter={() => setActiveKey(dim.key)}
                  onMouseLeave={() => setActiveKey(null)}
                >
                  <circle
                    cx={x}
                    cy={y}
                    r={isSelected ? 6 : 4}
                    fill={dim.color}
                    className="transition-all duration-200 shadow"
                    stroke="#ffffff"
                    strokeWidth="2"
                  />
                  <text
                    x={labelPos.x}
                    y={labelPos.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    className={`text-[11px] font-medium transition-colors ${
                      isSelected
                        ? 'fill-emerald-600 dark:fill-emerald-400 font-bold'
                        : 'fill-slate-600 dark:fill-slate-400'
                    }`}
                  >
                    {dim.label} {val}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Dimension Sliders & Quick Coaching Cue */}
        <div className="md:col-span-5 space-y-2.5">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center justify-between mb-1">
            <span className="flex items-center gap-1">
              <Sliders className="w-3.5 h-3.5" />
              调整自我评估得分 (1-10分)
            </span>
            <span className="text-slate-400">均分 {avg.toFixed(1)}</span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            {DIMENSIONS.map((dim) => {
              const val = scores[dim.key] || 1;
              const isHovered = activeKey === dim.key;
              return (
                <div
                  key={dim.key}
                  onMouseEnter={() => setActiveKey(dim.key)}
                  onMouseLeave={() => setActiveKey(null)}
                  className={`p-2 rounded-xl border transition-all ${
                    isHovered
                      ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/30'
                      : 'border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1">
                      <span>{dim.icon}</span>
                      <span>{dim.label}</span>
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white">{val}</span>
                  </div>
                  {!readOnly && (
                    <input
                      type="range"
                      min="1"
                      max="10"
                      step="0.5"
                      value={val}
                      onChange={(e) => handleSliderChange(dim.key, parseFloat(e.target.value))}
                      className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                    />
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 text-xs text-slate-600 dark:text-slate-300 flex items-start gap-2">
            <Sparkles className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-slate-800 dark:text-slate-200">教练速评：</span>
              {stdDev > 2.0
                ? '维度间落差较大，注意避免在优势维度上过度内卷，而忽略了短板维度的能量流失。'
                : '整体结构相对匀称！目前最需关照的是分值最低项，投入微小关注即可产生显著幸福感提升。'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
