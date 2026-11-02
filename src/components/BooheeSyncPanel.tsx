/**
 * 薄荷健康开放平台「直连同步」面板
 *
 * ============================ 能力边界（说人话版） ============================
 * 1. 这里能【真的直连】：填入开放平台 API Key 后，点同步即可直接拉取体重与饮食，
 *    全程在浏览器里完成，不需要导出 Excel、不需要中转服务器。
 * 2. 但读到的数据是「开放平台数据空间」里的内容 —— 也就是你这个开发者应用
 *    自己写进去的记录。薄荷没有开放「读我的 App 历史记录」的接口，
 *    所以如果你 App 里的老数据没进这个空间，这里就是空的。
 * 3. 想把 App 里的历史数据搬进来，现成两条路：
 *    - App 内导出 Excel/CSV → 用「导入数据」上传（支持 Excel/CSV）；
 *    - 薄荷 iOS App ↔ Apple 健康 双向同步 → 健康 App 导出 export.xml → 同样上传。
 * ==========================================================================
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BOOHEE_CONSOLE_URL,
  BOOHEE_MEAL_TYPES,
  BooheeConfig,
  BooheeError,
  BooheeSyncSummary,
  booheeMealLabel,
  clearBooheeConfig,
  daysAgoKey,
  loadBooheeConfig,
  saveBooheeConfig,
  searchFoods,
  syncFromBoohee,
  todayKey,
} from '../utils/booheeOpenApi';
import { HealthDailyEntry } from '../types';
import {
  CheckCircle2,
  ExternalLink,
  Info,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  X,
  AlertTriangle,
} from 'lucide-react';

interface Props {
  onApplyEntries: (entries: HealthDailyEntry[]) => void;
  onRegisterBatch: (info: {
    source: 'boohee';
    fileName: string;
    imported: number;
    merged: number;
  }) => void;
}

const AUTH_MODE_LABEL: Record<'apiKey' | 'token', string> = {
  apiKey: 'API Key（推荐）',
  token: 'AccessToken',
};

export const BooheeSyncPanel: React.FC<Props> = ({ onApplyEntries, onRegisterBatch }) => {
  const [authMode, setAuthMode] = useState<'apiKey' | 'token'>('apiKey');
  const [apiKey, setApiKey] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [userId, setUserId] = useState('');
  const [startDate, setStartDate] = useState(() => daysAgoKey(30));
  const [endDate, setEndDate] = useState(() => todayKey());
  const [includeEating, setIncludeEating] = useState(true);
  const [configured, setConfigured] = useState(false);

  const [syncing, setSyncing] = useState(false);
  const [summary, setSummary] = useState<BooheeSyncSummary | null>(null);
  const [error, setError] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);

  // ---- 食物搜索（连通性自检 + 手动补录） ----
  const [keyword, setKeyword] = useState('');
  const [searching, setSearching] = useState(false);
  const [foods, setFoods] = useState<{ code: string; name: string; calories?: number }[]>([]);
  const [foodMsg, setFoodMsg] = useState('');

  // 载入本机已保存的凭证
  useEffect(() => {
    const saved = loadBooheeConfig();
    if (!saved) return;
    setAuthMode(saved.authMode);
    setApiKey(saved.apiKey ?? '');
    setAccessToken(saved.accessToken ?? '');
    setUserId(saved.userId);
    setConfigured(true);
  }, []);

  const config = useMemo<BooheeConfig>(
    () => ({
      apiKey,
      accessToken,
      userId: userId.trim(),
      authMode,
    }),
    [apiKey, accessToken, userId, authMode]
  );

  const hasCredential =
    config.userId.length > 0 &&
    (authMode === 'apiKey' ? apiKey.trim().length > 0 : accessToken.trim().length > 0);

  const handleSave = useCallback(() => {
    if (!config.userId) {
      setError('请填写 user_id（开放平台体系下的用户标识，自己定义即可）');
      return;
    }
    if (authMode === 'apiKey' && !apiKey.trim()) {
      setError('请填写 API Key');
      return;
    }
    if (authMode === 'token' && !accessToken.trim()) {
      setError('请填写 AccessToken');
      return;
    }
    saveBooheeConfig(config);
    setConfigured(true);
    setError('');
  }, [config, apiKey, accessToken, authMode]);

  const handleClear = useCallback(() => {
    clearBooheeConfig();
    setApiKey('');
    setAccessToken('');
    setUserId('');
    setConfigured(false);
    setSummary(null);
    setFoods([]);
    setError('');
    setFoodMsg('');
  }, []);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    setError('');
    setWarnings([]);
    setSummary(null);
    try {
      const result = await syncFromBoohee(config, {
        startDate,
        endDate,
        includeEating,
      });
      setSummary(result);
      setWarnings(result.warnings);
      if (!result.entries.length) {
        setError(
          '这个 user_id 在所选区间里没有数据。可能是区间太窄，或该 user_id 还没写入过记录。'
        );
        return;
      }
      onApplyEntries(result.entries);
      onRegisterBatch({
        source: 'boohee',
        fileName: `薄荷开放平台 · 直连同步 ${result.dateFrom ?? ''}~${result.dateTo ?? ''}`,
        imported: result.entries.length,
        merged: 0,
      });
    } catch (err) {
      if (err instanceof BooheeError) {
        setError(err.message);
      } else {
        setError(`同步失败：${err instanceof Error ? err.message : String(err)}`);
      }
    } finally {
      setSyncing(false);
    }
  }, [config, startDate, endDate, includeEating, onApplyEntries, onRegisterBatch]);

  const handleSearch = useCallback(async () => {
    if (!keyword.trim()) {
      setFoodMsg('请输入食物关键词');
      return;
    }
    setSearching(true);
    setFoodMsg('');
    try {
      const result = await searchFoods(config, keyword, { withUnits: false });
      setFoods(
        (result.foods ?? []).slice(0, 10).map((f) => ({
          code: f.code,
          name: f.name,
          calories: f.calories,
        }))
      );
      if (!result.foods?.length) setFoodMsg('没有搜到食物');
    } catch (err) {
      setFoodMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setSearching(false);
    }
  }, [config, keyword]);

  return (
    <section
      data-testid="boohee-sync-panel"
      className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900/50"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <RefreshCw className="h-4 w-4 text-emerald-600" />
          薄荷开放平台 · 直连同步
        </h2>
        <a
          href={BOOHEE_CONSOLE_URL}
          target="_blank"
          rel="noreferrer"
          data-testid="boohee-console-link"
          className="inline-flex items-center gap-1 text-[11px] text-stone-500 underline-offset-2 hover:underline dark:text-stone-400"
        >
          开放平台文档
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {/* 能力边界说明 */}
      <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 text-[11px] leading-relaxed text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
        <div className="mb-1 flex items-center gap-1.5 font-semibold">
          <ShieldCheck className="h-3.5 w-3.5" />
          不用 Excel 了 —— 但先看清楚这一条
        </div>
        <p>
          填好开放平台的 API Key，点「同步」就能直接从薄荷服务器拉数据，
          全程在你的浏览器里跑，不需要导出文件、不需要上传服务器。
        </p>
        <p className="mt-1">
          不过要说清楚：<b>读到的是「开放平台数据空间」里的数据</b>
          （也就是你这个应用自己写进去的记录）。
          薄荷没有开放「读取我 App 里的历史数据」的接口，
          所以 App 里的老数据不会自动出现 —— 那些还得走
          <b>App 导出 Excel/CSV</b> 或 <b>Apple 健康 export.xml</b> 两条路导入。
        </p>
      </div>

      {/* 凭证区 */}
      <div className="grid gap-2.5 md:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-[11px] text-stone-500 dark:text-stone-400">
            鉴权方式
          </span>
          <select
            data-testid="boohee-auth-mode"
            value={authMode}
            onChange={(e) => setAuthMode(e.target.value as 'apiKey' | 'token')}
            className="w-full rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-stone-900 dark:border-stone-700 dark:bg-stone-900 dark:focus:border-white"
          >
            {(['apiKey', 'token'] as const).map((m) => (
              <option key={m} value={m}>
                {AUTH_MODE_LABEL[m]}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-[11px] text-stone-500 dark:text-stone-400">
            user_id
            <span className="ml-1 text-stone-400">开放平台里的用户标识，自己定义</span>
          </span>
          <input
            type="text"
            data-testid="boohee-user-id"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="例如 my_apple_2026"
            className="w-full rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-stone-900 dark:border-stone-700 dark:bg-stone-900 dark:focus:border-white"
          />
        </label>

        {authMode === 'apiKey' ? (
          <label className="block">
            <span className="mb-1 block text-[11px] text-stone-500 dark:text-stone-400">
              API Key
              <span className="ml-1 text-stone-400">开放平台后台「API Key 管理」创建，形如 sk-…</span>
            </span>
            <input
              type="password"
              data-testid="boohee-api-key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-xxxxxxxx"
              autoComplete="off"
              className="w-full rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-stone-900 dark:border-stone-700 dark:bg-stone-900 dark:focus:border-white"
            />
          </label>
        ) : (
          <label className="block">
            <span className="mb-1 block text-[11px] text-stone-500 dark:text-stone-400">
              AccessToken
              <span className="ml-1 text-stone-400">Bearer 模式下的 access_token</span>
            </span>
            <input
              type="password"
              data-testid="boohee-access-token"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder="eyJhbGciOiJIUzI1NiIs…"
              autoComplete="off"
              className="w-full rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-stone-900 dark:border-stone-700 dark:bg-stone-900 dark:focus:border-white"
            />
          </label>
        )}

        <label className="block">
          <span className="mb-1 block text-[11px] text-stone-500 dark:text-stone-400">
            开始日期
          </span>
          <input
            type="date"
            data-testid="boohee-start-date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-stone-900 dark:border-stone-700 dark:bg-stone-900 dark:focus:border-white"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-[11px] text-stone-500 dark:text-stone-400">
            结束日期
          </span>
          <input
            type="date"
            data-testid="boohee-end-date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-stone-900 dark:border-stone-700 dark:bg-stone-900 dark:focus:border-white"
          />
        </label>
      </div>

      <label className="mt-2.5 flex items-center gap-2 text-[11px] text-stone-600 dark:text-stone-300">
        <input
          type="checkbox"
          data-testid="boohee-include-eating"
          checked={includeEating}
          onChange={(e) => setIncludeEating(e.target.checked)}
          className="h-3.5 w-3.5 accent-emerald-600"
        />
        同时同步饮食（按天逐日拉取，日期跨度越大越慢）
      </label>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-testid="boohee-save-config"
          onClick={handleSave}
          className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 px-3 py-2 text-xs font-medium transition hover:bg-stone-50 dark:border-stone-700 dark:hover:bg-stone-800"
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          保存到本机
        </button>
        <button
          type="button"
          data-testid="boohee-sync-trigger"
          disabled={syncing || !hasCredential}
          onClick={handleSync}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
        >
          {syncing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          {syncing ? '同步中…' : '立即同步'}
        </button>
        <button
          type="button"
          data-testid="boohee-clear-config"
          onClick={handleClear}
          className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 px-3 py-2 text-xs font-medium text-stone-600 transition hover:bg-stone-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
        >
          <Trash2 className="h-3.5 w-3.5" />
          清除凭证
        </button>
        <span className="text-[11px] text-stone-500 dark:text-stone-400">
          {configured ? '凭证已存在本机浏览器（localStorage）' : '凭证只保存在本机浏览器，不上传任何服务器'}
        </span>
      </div>

      {!hasCredential && (
        <p
          data-testid="boohee-hint"
          className="mt-2 text-[11px] text-amber-700 dark:text-amber-300"
        >
          填好 user_id 和凭证后，「立即同步」按钮才会亮起。
        </p>
      )}

      {/* 同步结果 */}
      {summary && (
        <div
          data-testid="boohee-sync-result"
          data-days={summary.days}
          data-weight-records={summary.weightRecords}
          data-eating-records={summary.eatingRecords}
          className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 text-[11px] text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"
        >
          <div className="mb-1 flex items-center gap-1.5 font-semibold">
            <CheckCircle2 className="h-3.5 w-3.5" />
            同步完成
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 md:grid-cols-4">
            <span>天数 {summary.days}</span>
            <span>体重 {summary.weightRecords} 条</span>
            <span>饮食 {summary.eatingRecords} 条</span>
            <span>
              {summary.dateFrom ?? '—'} ~ {summary.dateTo ?? '—'}
            </span>
          </div>
          <p className="mt-1 text-[10px] opacity-80">
            已写入本机健康记录（与已有数据按日期合并）。
          </p>
        </div>
      )}

      {warnings.length > 0 && (
        <div
          data-testid="boohee-sync-warnings"
          className="mt-2 rounded-lg border border-amber-200 bg-amber-50/70 p-2.5 text-[11px] text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
        >
          {warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </div>
      )}

      {error && (
        <div
          data-testid="boohee-sync-error"
          className="mt-2 flex items-start gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2 text-[11px] text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 连通性自检：搜索食物库 */}
      <div className="mt-3 border-t border-stone-100 pt-3 dark:border-stone-800">
        <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-stone-600 dark:text-stone-300">
          <Info className="h-3.5 w-3.5" />
          连通性自检：搜一个食物试试（能搜到说明凭证和直连都通了）
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            data-testid="boohee-food-keyword"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="例如 米饭"
            className="w-40 rounded-md border border-stone-300 bg-white px-2 py-1.5 text-xs outline-none focus:border-stone-900 dark:border-stone-700 dark:bg-stone-900 dark:focus:border-white"
          />
          <button
            type="button"
            data-testid="boohee-food-search"
            disabled={searching || !hasCredential}
            onClick={handleSearch}
            className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs font-medium transition hover:bg-stone-50 disabled:opacity-50 dark:border-stone-700 dark:hover:bg-stone-800"
          >
            {searching ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Search className="h-3 w-3" />
            )}
            搜索
          </button>
          {foodMsg && (
            <span className="text-[11px] text-stone-500 dark:text-stone-400">{foodMsg}</span>
          )}
        </div>
        {foods.length > 0 && (
          <ul
            data-testid="boohee-food-results"
            className="mt-2 space-y-0.5 text-[11px] text-stone-600 dark:text-stone-300"
          >
            {foods.map((f) => (
              <li key={f.code}>
                · {f.name}
                {f.calories !== undefined ? `（${f.calories} kcal/100g）` : ''}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 餐别对照 */}
      <div className="mt-3 border-t border-stone-100 pt-3 text-[11px] text-stone-500 dark:border-stone-800 dark:text-stone-400">
        餐别编码（写饮食记录时用）：
        {BOOHEE_MEAL_TYPES.map((m) => (
          <span key={m.value} className="ml-1.5">
            {m.value}={m.label}
          </span>
        ))}
        <span className="ml-1.5">（{booheeMealLabel(1)}…）</span>
      </div>
    </section>
  );
};
