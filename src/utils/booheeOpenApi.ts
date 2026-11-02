/**
 * 薄荷健康开放平台（Boohee Open API）直连客户端
 * ============================================================================
 * 官方文档：https://ai.boohee.com/docs/
 * 接口基址：https://api.boohee.com/open-apis
 *
 * ---------------- 能力边界（真实情况，别写成想象） ----------------
 * ✅ 可做：浏览器直接调用开放平台 API，读取 / 写入「该开放平台账号下、
 *    以 user_id 标识」的数据空间（体重、饮食、食物库）。
 *    - 鉴权二选一：请求头 `X-Api-Key: sk-xxx` 或 `Authorization: Bearer {accessToken}`
 *    - 服务端 CORS 完全开放（回显任意 Origin，支持 `null`），
 *      因此 file:// 双击打开的单文件 HTML 也能直连，不需要本地服务器。
 * ❌ 不能做：薄荷开放平台【没有】OAuth / 账号绑定 / 导入 C 端 App 历史记录的接口。
 *    也就是说：本模块【读不到】你在薄荷 App 里已有的历史数据，
 *    它读写的是开发者应用自己的数据空间。
 *    想把 App 里的历史数据搬进来，只有两条真实路径：
 *      1) App 内导出 Excel/CSV → 用 healthImporters 导入（本项目已支持）；
 *      2) 薄荷 iOS App ↔ Apple HealthKit 双向同步 → 从健康 App 导出 export.xml
 *         → 用 healthImporters 导入（本项目已支持）。
 *
 * ---------------- 设计约束 ----------------
 *  - 纯前端、零依赖，可在单文件 HTML 里直接运行；
 *  - 凭证只保存在调用方（localStorage），绝不写进代码或日志；
 *  - 所有「今天/本周」派生一律从 new Date() 动态推导，绝不写死周期键。
 */
import { HealthDailyEntry } from '../types';

// ==========================================
// 常量
// ==========================================

/** 开放平台接口基址 */
export const BOOHEE_API_BASE = 'https://api.boohee.com/open-apis';

/** 薄荷开放平台控制台 / 文档 */
export const BOOHEE_CONSOLE_URL = 'https://ai.boohee.com/docs/';

/** 餐别枚举（薄荷开放平台定义） */
export const BOOHEE_MEAL_TYPES: { value: number; label: string }[] = [
  { value: 1, label: '早餐' },
  { value: 2, label: '午餐' },
  { value: 3, label: '晚餐' },
  { value: 4, label: '加餐' },
  { value: 6, label: '上午加餐' },
  { value: 7, label: '下午加餐' },
  { value: 8, label: '晚上加餐' },
];

export function booheeMealLabel(mealType: number | undefined): string {
  if (mealType === undefined) return '未分类';
  return BOOHEE_MEAL_TYPES.find((m) => m.value === mealType)?.label ?? `餐别${mealType}`;
}

// ==========================================
// 类型
// ==========================================

export type BooheeAuthMode = 'apiKey' | 'token';

/** 直连配置（凭证由调用方保存） */
export interface BooheeConfig {
  /** 开放平台后台创建的 API Key，形如 sk-... */
  apiKey?: string;
  /** 已获取的 AccessToken（Bearer 模式） */
  accessToken?: string;
  /** 开放平台体系下的用户标识，由开发者自定义 */
  userId: string;
  authMode: BooheeAuthMode;
}

/** 统一响应信封 */
export interface BooheeEnvelope<T = unknown> {
  code: number;
  message: string;
  now?: number;
  data?: T;
}

/** 体重记录条目（开放平台返回） */
export interface BooheeWeightItem {
  id?: number | string;
  record_on: string;
  weight?: number;
  body_fat?: number;
  measure_time?: string;
}

/** 饮食条目 */
export interface BooheeFoodItem {
  id?: number | string;
  meal_type?: number;
  food_name?: string;
  food_code?: string;
  amount?: number;
  unit_name?: string;
  calories?: number;
  protein?: number;
  fat?: number;
  carbohydrate?: number;
}

/** 按餐别分组的饮食 */
export interface BooheeMealGroup {
  meal_type?: number;
  items?: BooheeFoodItem[];
  total_calories?: number;
  total_protein?: number;
  total_fat?: number;
  total_carbohydrate?: number;
}

/** 某一天的饮食汇总 */
export interface BooheeDailyEating {
  meals?: BooheeMealGroup[];
  total_calories?: number;
  total_protein?: number;
  total_fat?: number;
  total_carbohydrate?: number;
}

/** 体重列表返回 */
export interface BooheeWeightList {
  total?: number;
  items?: BooheeWeightItem[];
  has_more?: boolean;
}

/** 食物搜索结果条目 */
export interface BooheeFood {
  code: string;
  name: string;
  calories?: number;
  protein?: number;
  fat?: number;
  carbohydrate?: number;
  health_light?: number;
  is_liquid?: boolean;
  image_url?: string;
  units?: { unit_id?: number; unit_name?: string; weight?: string; eat_weight?: string }[];
}

/** 食物搜索返回 */
export interface BooheeFoodSearchResult {
  page?: number;
  per_page?: number;
  has_more?: boolean;
  foods?: BooheeFood[];
}

/** 直连同步的汇总结果 */
export interface BooheeSyncSummary {
  /** 同步到的天数 */
  days: number;
  /** 体重记录条数 */
  weightRecords: number;
  /** 饮食记录条数（按食物明细计） */
  eatingRecords: number;
  /** 命中的日期区间 */
  dateFrom?: string;
  dateTo?: string;
  /** 转换后的健康条目 */
  entries: HealthDailyEntry[];
  /** 过程中的非致命提示 */
  warnings: string[];
}

// ==========================================
// 错误处理
// ==========================================

/** 开放平台错误码 → 人话解释 */
export const BOOHEE_ERROR_CODES: Record<number, string> = {
  1049: '缺少认证凭证：请填写 API Key 或 AccessToken',
  1050: 'API Key 无效：请到开放平台后台核对密钥是否正确、是否已启用',
  1010: 'AccessToken 无效或已过期，请重新获取',
  [-400]: '请求参数缺失，请检查必填项',
};

/** 直连过程中抛出的错误 */
export class BooheeError extends Error {
  readonly code: number;
  readonly httpStatus: number;

  constructor(message: string, code = -1, httpStatus = 0) {
    super(message);
    this.name = 'BooheeError';
    this.code = code;
    this.httpStatus = httpStatus;
  }

  /** 是否属于凭证类错误（提示用户去检查 API Key） */
  get isAuthError(): boolean {
    return this.code === 1049 || this.code === 1050 || this.code === 1010;
  }
}

function describeError(code: number, message: string): string {
  const known = BOOHEE_ERROR_CODES[code];
  if (known) return known;
  if (message && message.trim()) return `薄荷接口报错 ${code}：${message.trim()}`;
  return `薄荷接口报错 ${code}`;
}

// ==========================================
// 日期工具（全部动态派生）
// ==========================================

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Date → YYYY-MM-DD（本地时区，与 healthAnalytics.toDateKey 口径一致） */
export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** YYYY-MM-DD → Date（本地零点） */
export function fromDateKey(key: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(key.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 今天（本地） */
export function todayKey(): string {
  return toDateKey(new Date());
}

/** 往前推 n 天的日期键 */
export function daysAgoKey(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toDateKey(d);
}

// ==========================================
// 底层请求
// ==========================================

export interface BooheeRequestOptions {
  method?: 'GET' | 'POST';
  /** Query 参数 */
  query?: Record<string, string | number | undefined>;
  /** JSON Body */
  body?: unknown;
  /** 请求超时（毫秒），默认 20000 */
  timeoutMs?: number;
  /** 覆盖基址（便于测试打桩） */
  baseUrl?: string;
}

/**
 * 构造鉴权请求头。
 * 两种模式二选一；都缺失时抛 BooheeError(1049)。
 */
export function buildAuthHeaders(config: BooheeConfig): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (config.authMode === 'token') {
    const token = (config.accessToken ?? '').trim();
    if (!token) throw new BooheeError(BOOHEE_ERROR_CODES[1010], 1010);
    headers['Authorization'] = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
  } else {
    const key = (config.apiKey ?? '').trim();
    if (!key) throw new BooheeError(BOOHEE_ERROR_CODES[1049], 1049);
    headers['X-Api-Key'] = key;
  }
  return headers;
}

/** 从可能存在的信封中取出 data（兼容根级返回，如 weight/records） */
function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'code' in (payload as any)) {
    const env = payload as BooheeEnvelope<T>;
    return (env.data ?? ({} as T)) as T;
  }
  return payload as T;
}

/**
 * 发起一次开放平台请求。
 * - HTTP 层错误 → BooheeError(httpStatus)
 * - 业务 code != 0 → BooheeError(code)
 */
export async function booheeRequest<T = unknown>(
  config: BooheeConfig,
  path: string,
  options: BooheeRequestOptions = {}
): Promise<T> {
  const base = (options.baseUrl ?? BOOHEE_API_BASE).replace(/\/+$/, '');
  const method = options.method ?? 'GET';
  const headers = buildAuthHeaders(config);

  const url = new URL(`${base}${path.startsWith('/') ? path : `/${path}`}`);
  if (options.query) {
    for (const [k, v] of Object.entries(options.query)) {
      if (v === undefined || v === null || v === '') continue;
      url.searchParams.set(k, String(v));
    }
  }

  let res: Response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 20000);
  try {
    res = await fetch(url.toString(), {
      method,
      headers,
      signal: controller.signal,
      ...(options.body !== undefined
        ? {
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify(options.body),
          }
        : {}),
    });
  } catch (err) {
    const msg = err instanceof Error && err.name === 'AbortError'
      ? '请求薄荷接口超时，请检查网络后重试'
      : `无法连接薄荷接口：${err instanceof Error ? err.message : String(err)}`;
    throw new BooheeError(msg, -1);
  } finally {
    clearTimeout(timeout);
  }

  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }

  if (!res.ok) {
    const env = parsed as BooheeEnvelope | null;
    throw new BooheeError(
      env && env.code !== undefined
        ? describeError(env.code, env.message)
        : `薄荷接口返回 HTTP ${res.status}`,
      env?.code ?? -1,
      res.status
    );
  }

  if (parsed && typeof parsed === 'object' && 'code' in (parsed as any)) {
    const env = parsed as BooheeEnvelope<T>;
    if (env.code !== 0) {
      throw new BooheeError(describeError(env.code, env.message), env.code, res.status);
    }
    return (env.data ?? ({} as T)) as T;
  }

  return unwrap<T>(parsed);
}

// ==========================================
// 业务接口
// ==========================================

/**
 * GET /v2/weight/records —— 拉取体重列表
 */
export async function fetchWeightRecords(
  config: BooheeConfig,
  params: { startDate: string; endDate: string; page?: number; pageSize?: number },
  options: BooheeRequestOptions = {}
): Promise<BooheeWeightItem[]> {
  const data = await booheeRequest<BooheeWeightList | BooheeWeightItem[]>(
    config,
    '/v2/weight/records',
    {
      ...options,
      method: 'GET',
      query: {
        user_id: config.userId,
        start_date: params.startDate,
        end_date: params.endDate,
        page: params.page ?? 1,
        page_size: params.pageSize ?? 200,
      },
    }
  );
  if (Array.isArray(data)) return data;
  return data?.items ?? [];
}

/**
 * GET /v2/weight/latest —— 取指定日期（含）之前最新一条体重
 */
export async function fetchLatestWeight(
  config: BooheeConfig,
  recordOn?: string,
  options: BooheeRequestOptions = {}
): Promise<BooheeWeightItem | null> {
  const data = await booheeRequest<{ item?: BooheeWeightItem | null }>(
    config,
    '/v2/weight/latest',
    {
      ...options,
      method: 'GET',
      query: { user_id: config.userId, record_on: recordOn },
    }
  );
  return data?.item ?? null;
}

/**
 * GET /v2/eating/records —— 拉取某一天的饮食
 */
export async function fetchEatingRecords(
  config: BooheeConfig,
  recordOn: string,
  options: BooheeRequestOptions = {}
): Promise<BooheeDailyEating | null> {
  const data = await booheeRequest<{ daily?: BooheeDailyEating | null }>(
    config,
    '/v2/eating/records',
    {
      ...options,
      method: 'GET',
      query: { user_id: config.userId, record_on: recordOn },
    }
  );
  return data?.daily ?? null;
}

/**
 * GET /v1/food/search —— 搜索食物库
 */
export async function searchFoods(
  config: BooheeConfig,
  keyword: string,
  options: BooheeRequestOptions & { page?: number; perPage?: number; withUnits?: boolean } = {}
): Promise<BooheeFoodSearchResult> {
  const kw = keyword.trim();
  if (!kw) return { foods: [], page: 1, per_page: 0, has_more: false };
  const data = await booheeRequest<BooheeFoodSearchResult>(config, '/v1/food/search', {
    ...options,
    method: 'GET',
    query: {
      keyword: kw,
      page: options.page ?? 1,
      per_page: options.perPage ?? 20,
      with_units: options.withUnits ? 'true' : undefined,
    },
  });
  return { ...data, foods: data?.foods ?? [] };
}

/**
 * POST /v2/weight/record —— 写入一条体重记录
 */
export async function recordWeight(
  config: BooheeConfig,
  payload: { weight: number; bodyFat?: number; recordOn?: string },
  options: BooheeRequestOptions = {}
): Promise<void> {
  await booheeRequest(config, '/v2/weight/record', {
    ...options,
    method: 'POST',
    body: {
      user_id: config.userId,
      weight: payload.weight,
      body_fat: payload.bodyFat,
      record_on: payload.recordOn ?? todayKey(),
    },
  });
}

/**
 * POST /v2/eating/record_single —— 写入一条饮食记录
 */
export async function recordSingleFood(
  config: BooheeConfig,
  payload: {
    foodCode: string;
    amount: number;
    unitName: string;
    mealType: number;
    recordOn?: string;
  },
  options: BooheeRequestOptions = {}
): Promise<void> {
  await booheeRequest(config, '/v2/eating/record_single', {
    ...options,
    method: 'POST',
    body: {
      user_id: config.userId,
      record_on: payload.recordOn ?? todayKey(),
      meal_type: payload.mealType,
      food_code: payload.foodCode,
      amount: payload.amount,
      unit_name: payload.unitName,
    },
  });
}

// ==========================================
// 响应 → HealthDailyEntry 映射
// ==========================================

function num(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** 体重条目 → 单日条目（体重 / 体脂率） */
export function weightItemToEntry(item: BooheeWeightItem): HealthDailyEntry | null {
  const date = (item.record_on ?? '').slice(0, 10);
  if (!date) return null;
  const weight = num(item.weight);
  const bodyFat = num(item.body_fat);
  if (weight === undefined && bodyFat === undefined) return null;
  const now = new Date().toISOString();
  return {
    id: `hd-boohee-${date}`,
    date,
    source: 'boohee',
    weightKg: weight,
    bodyFatPct: bodyFat,
    createdAt: now,
    updatedAt: now,
  };
}

/** 某日饮食 → 单日条目（热量 / 三大营养素 / 餐次） */
export function eatingToEntry(
  date: string,
  daily: BooheeDailyEating | null
): HealthDailyEntry | null {
  if (!daily) return null;
  const meals = daily.meals ?? [];
  const itemCount = meals.reduce((sum, m) => sum + (m.items?.length ?? 0), 0);
  const calories = num(daily.total_calories);
  const protein = num(daily.total_protein);
  const fat = num(daily.total_fat);
  const carbs = num(daily.total_carbohydrate);

  if (
    itemCount === 0 &&
    calories === undefined &&
    protein === undefined &&
    fat === undefined &&
    carbs === undefined
  ) {
    return null;
  }

  const now = new Date().toISOString();
  return {
    id: `hd-boohee-${date}`,
    date,
    source: 'boohee',
    caloriesIntake: calories,
    proteinG: protein,
    fatG: fat,
    carbsG: carbs,
    mealCount: meals.length || undefined,
    createdAt: now,
    updatedAt: now,
  };
}

/** 合并同一天的体重 + 饮食为一条 */
function mergeDayEntries(parts: (HealthDailyEntry | null)[]): HealthDailyEntry | null {
  const valid = parts.filter((p): p is HealthDailyEntry => p !== null);
  if (!valid.length) return null;
  const base = valid[0];
  const merged: HealthDailyEntry = { ...base };
  for (const p of valid.slice(1)) {
    for (const [k, v] of Object.entries(p)) {
      if (v === undefined || v === null) continue;
      if (k === 'id' || k === 'date' || k === 'source' || k === 'createdAt' || k === 'updatedAt') continue;
      (merged as any)[k] = v;
    }
  }
  return merged;
}

// ==========================================
// 一键同步
// ==========================================

export interface BooheeSyncParams {
  /** 开始日期（含），默认 30 天前 */
  startDate?: string;
  /** 结束日期（含），默认今天 */
  endDate?: string;
  /** 是否同步饮食 */
  includeEating?: boolean;
  /** 饮食逐日请求时的并发数，默认 4 */
  concurrency?: number;
  /** 单次请求超时（毫秒） */
  timeoutMs?: number;
}

/**
 * 一次性同步体重 + 饮食，转成 HealthDailyEntry[]。
 *
 * 注意：读到的数据是「开放平台数据空间」里的内容。
 * 若你的薄荷 App 历史数据不在这个空间里，这里就拉不到 —— 这是平台限制，不是 bug。
 */
export async function syncFromBoohee(
  config: BooheeConfig,
  params: BooheeSyncParams = {},
  options: BooheeRequestOptions = {}
): Promise<BooheeSyncSummary> {
  const endDate = params.endDate ?? todayKey();
  const startDate = params.startDate ?? daysAgoKey(30);
  const includeEating = params.includeEating !== false;
  const warnings: string[] = [];

  const reqOptions: BooheeRequestOptions = {
    timeoutMs: params.timeoutMs ?? 20000,
    ...options,
  };

  // --- 体重 ---
  let weightItems: BooheeWeightItem[] = [];
  try {
    weightItems = await fetchWeightRecords(config, { startDate, endDate }, reqOptions);
  } catch (err) {
    if (err instanceof BooheeError && err.isAuthError) throw err;
    warnings.push(
      `体重同步失败：${err instanceof Error ? err.message : String(err)}`
    );
  }

  // --- 饮食（按日逐日请求） ---
  const eatingByDate = new Map<string, BooheeDailyEating>();
  if (includeEating) {
    const dates: string[] = [];
    const start = fromDateKey(startDate);
    const end = fromDateKey(endDate);
    if (start && end && start <= end) {
      const cursor = new Date(start);
      // 上限保护：一次最多同步 400 天
      let guard = 0;
      while (cursor <= end && guard < 400) {
        dates.push(toDateKey(cursor));
        cursor.setDate(cursor.getDate() + 1);
        guard++;
      }
    }

    const concurrency = Math.max(1, Math.min(8, params.concurrency ?? 4));
    const failures: string[] = [];
    let cursorIdx = 0;

    const worker = async () => {
      while (cursorIdx < dates.length) {
        const date = dates[cursorIdx++];
        try {
          const daily = await fetchEatingRecords(config, date, reqOptions);
          if (daily) eatingByDate.set(date, daily);
        } catch (err) {
          if (err instanceof BooheeError && err.isAuthError) throw err;
          failures.push(date);
        }
      }
    };

    const workers = Array.from({ length: Math.min(concurrency, dates.length) }, () => worker());
    await Promise.all(workers);
    if (failures.length) {
      warnings.push(`${failures.length} 天的饮食没拉到（${failures[0]} 等）`);
    }
  }

  // --- 汇总为每日条目 ---
  const byDate = new Map<string, HealthDailyEntry>();
  for (const item of weightItems) {
    const entry = weightItemToEntry(item);
    if (!entry) continue;
    byDate.set(entry.date, entry);
  }
  for (const [date, daily] of eatingByDate) {
    const eatingEntry = eatingToEntry(date, daily);
    if (!eatingEntry) continue;
    const existing = byDate.get(date);
    const merged = mergeDayEntries([existing ?? null, eatingEntry]);
    if (merged) byDate.set(date, merged);
  }

  const entries = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));

  return {
    days: entries.length,
    weightRecords: weightItems.length,
    eatingRecords: Array.from(eatingByDate.values()).reduce(
      (sum, d) => sum + (d.meals?.reduce((s, m) => s + (m.items?.length ?? 0), 0) ?? 0),
      0
    ),
    dateFrom: entries.length ? entries[0].date : undefined,
    dateTo: entries.length ? entries[entries.length - 1].date : undefined,
    entries,
    warnings,
  };
}

// ==========================================
// 本地凭证存取
// ==========================================

const STORAGE_KEY = 'life_coach_boohee_config';

interface StoredConfig {
  apiKey?: string;
  accessToken?: string;
  userId: string;
  authMode: BooheeAuthMode;
}

/** 读取本地保存的直连配置（凭证仅存本机 localStorage） */
export function loadBooheeConfig(): BooheeConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredConfig;
    if (!parsed || !parsed.userId) return null;
    return {
      apiKey: parsed.apiKey,
      accessToken: parsed.accessToken,
      userId: parsed.userId,
      authMode: parsed.authMode === 'token' ? 'token' : 'apiKey',
    };
  } catch {
    return null;
  }
}

/** 保存直连配置 */
export function saveBooheeConfig(config: BooheeConfig): void {
  const payload: StoredConfig = {
    apiKey: config.apiKey?.trim() || undefined,
    accessToken: config.accessToken?.trim() || undefined,
    userId: config.userId.trim(),
    authMode: config.authMode,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

/** 清除本地凭证 */
export function clearBooheeConfig(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
