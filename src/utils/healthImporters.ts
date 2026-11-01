/**
 * 多源健康数据导入解析器
 *
 * ============================ 现实边界（勿虚构） ============================
 *  - 薄荷健康【没有】开放平台 / 开发者 API，只能 App 内导出 Excel/CSV；
 *  - Apple HealthKit 是【纯设备端】框架，无服务端 API，浏览器读不到；
 *    只能靠「健康 App → 导出数据 → export.xml」落地；
 *  - 华为运动健康 / 小米 Zepp / Android Health Connect 支持导出 CSV；
 *  - 微信运动只能在小程序端 wx.getWeRunData 拿到，本模块支持其 JSON 回传格式。
 * ==========================================================================
 *
 * 因此本文件提供的是「真实可用的导入通道」：
 *   CSV（含薄荷/华为/小米/通用表头自动嗅探）
 *   XLSX（薄荷健康导出的 Excel 报告，零依赖纯手写 zip+xml 解包）
 *   Apple Health export.xml（Health App 官方导出格式）
 *   微信运动 JSON（wx.getWeRunData 回传）
 *   通用 JSON（数组或 { entries: [...] }）
 *
 * 所有解析器统一输出 HealthDailyEntry[]，并保留来源标记与跳过原因，便于溯源。
 */
import {
  HealthDailyEntry,
  HealthDataSource,
  HealthImportResult,
} from '../types';

// ==========================================
// 通用工具
// ==========================================

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function uid(): string {
  return `hd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 宽松数值解析：容忍千分位、单位后缀、破折号占位 */
export function toNumber(raw: any): number | undefined {
  if (raw === null || raw === undefined) return undefined;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : undefined;
  const s = String(raw).trim();
  if (!s) return undefined;
  if (/^(-|—|–|--|null|undefined|n\/a|na)$/i.test(s)) return undefined;
  const cleaned = s.replace(/,/g, '').replace(/[^\d.+-]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '+' || cleaned === '.') return undefined;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

/** 归一化表头：小写、去空白、去 BOM */
function normalizeHeader(h: string): string {
  return String(h ?? '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[\s\u3000_]+/g, '');
}

/** 剥离表头括号内的单位：'睡眠时长(h)' → { base: '睡眠时长', unit: 'h' } */
function splitHeaderUnit(header: string): { base: string; unit?: string } {
  const s = String(header ?? '').replace(/^\uFEFF/, '').trim();
  const m = /[（(]([^（()）]*)[）)]\s*$/.exec(s);
  if (m) {
    const unit = m[1].trim();
    const base = s.slice(0, m.index).trim();
    if (unit) return { base, unit };
  }
  return { base: s };
}

// ==========================================
// 字段别名映射
// ==========================================

type NumericField =
  | 'sleepHours'
  | 'deepSleepHours'
  | 'remSleepHours'
  | 'lightSleepHours'
  | 'awakenCount'
  | 'exerciseMinutes'
  | 'steps'
  | 'caloriesBurned'
  | 'distanceKm'
  | 'caloriesIntake'
  | 'proteinG'
  | 'carbsG'
  | 'fatG'
  | 'waterMl'
  | 'mealCount'
  | 'weightKg'
  | 'bodyFatPct'
  | 'restingHr'
  | 'systolicBp'
  | 'diastolicBp'
  | 'energyLevel';

/**
 * 别名表。键为字段，值为可接受的表头写法（已小写、去空白）。
 * 匹配顺序：精确 > 基名精确 > 包含（更长别名优先）
 */
const FIELD_ALIASES: Record<NumericField, string[]> = {
  sleepHours: [
    'sleephours', 'sleeptime', 'sleepduration', 'sleep', 'totalsleep',
    '睡眠时长', '睡眠时间', '睡眠', '总睡眠', '睡眠小时', '睡眠(小时)', '睡眠小时数',
  ],
  deepSleepHours: [
    'deepsleephours', 'deepsleep', 'deep',
    '深睡时长', '深睡', '深度睡眠', '深睡小时',
  ],
  remSleepHours: [
    'remsleephours', 'remsleep', 'rem',
    'rem睡眠', '快速眼动', 'rem时长', 'rem睡眠时长',
  ],
  lightSleepHours: [
    'lightsleephours', 'lightsleep', 'light',
    '浅睡时长', '浅睡', '浅睡眠',
  ],
  awakenCount: [
    'awakenings', 'awakencount', 'wakeups', 'wakes',
    '醒来次数', '夜醒次数', '中断次数', '醒来',
  ],
  exerciseMinutes: [
    'exerciseminutes', 'exerciseduration', 'exercisetime', 'workoutminutes', 'workoutduration',
    '运动时长', '运动时间', '运动分钟', '锻炼时长', '运动(分钟)', '活动时长', '锻炼时间',
  ],
  steps: [
    'steps', 'stepcount', 'step',
    '步数', '步数(步)', '走路步数', '每日步数',
  ],
  caloriesBurned: [
    'caloriesburned', 'activecalories', 'activeenergyburned', 'burnedcalories', 'expendedcalories',
    '消耗热量', '活动消耗', '运动消耗', '消耗千卡', '总消耗', '活动能量',
  ],
  distanceKm: [
    'distancekm', 'distance', 'walkdistance', 'walkingrunningdistance', 'totaldistance',
    '距离', '步行距离', '活动距离', '总距离', '距离(公里)', '运动距离',
  ],
  caloriesIntake: [
    'caloriesintake', 'totalcalories', 'dietaryenergyconsumed', 'intakecalories', 'calories', 'energy',
    '摄入热量', '摄入能量', '总热量', '热量', '热量摄入', '能量', '总能量', '合计能量', '热量合计',
  ],
  proteinG: [
    'proteing', 'protein', 'proteinintake',
    '蛋白质', '蛋白', '蛋白质(g)', '蛋白质摄入',
  ],
  carbsG: [
    'carbsg', 'carbs', 'carbohydrate', 'carbohydrates', 'carbintake',
    '碳水化合物', '碳水', '糖类', '碳水摄入', '碳水化合物(g)',
  ],
  fatG: [
    'fatg', 'fat', 'fatintake',
    '脂肪', '脂肪摄入', '脂肪(g)',
  ],
  waterMl: [
    'waterml', 'water', 'waterintake', 'drinkingwater',
    '饮水量', '喝水', '饮水', '饮水量(ml)', '饮水量(毫升)', '水分摄入',
  ],
  mealCount: [
    'mealcount', 'meals', 'mealtimecount',
    '进餐次数', '餐次', '用餐次数', '正餐次数',
  ],
  weightKg: [
    'weightkg', 'weight', 'bodyweight', 'bodymass',
    '体重', '体重(kg)', '体重公斤',
  ],
  bodyFatPct: [
    'bodyfatpct', 'bodyfat', 'bodyfatpercentage', 'fatpercentage',
    '体脂率', '体脂', '体脂百分比',
  ],
  restingHr: [
    'restinghr', 'restingheartrate', 'restingheart', 'heartrate',
    '静息心率', '静息心率(bpm)', '心率', '静息心率次',
  ],
  systolicBp: [
    'systolicbp', 'systolic', 'systolicbloodpressure', 'bp_high',
    '收缩压', '高压', '血压收缩压', '上压',
  ],
  diastolicBp: [
    'diastolicbp', 'diastolic', 'diastolicbloodpressure', 'bp_low',
    '舒张压', '低压', '血压舒张压', '下压',
  ],
  energyLevel: [
    'energylevel', 'energy', 'subjectiveenergy', 'vigor',
    '主观精力', '精力', '精力值', '状态评分',
  ],
};

/** 反向索引：别名 → 字段 */
const ALIAS_TO_FIELD: Record<string, NumericField> = (() => {
  const map: Record<string, NumericField> = {};
  for (const [field, aliases] of Object.entries(FIELD_ALIASES) as [NumericField, string[]][]) {
    for (const a of aliases) map[normalizeHeader(a)] = field;
  }
  return map;
})();

/** 表头 → 字段 的匹配打分 */
function matchField(header: string): { field: NumericField; score: number } | null {
  const raw = String(header ?? '').replace(/^\uFEFF/, '').trim();
  if (!raw) return null;
  const { base } = splitHeaderUnit(raw);
  const nBase = normalizeHeader(base);
  const nRaw = normalizeHeader(raw);

  // 1) 完全精确
  if (ALIAS_TO_FIELD[nRaw]) return { field: ALIAS_TO_FIELD[nRaw], score: 1000 };
  if (ALIAS_TO_FIELD[nBase]) return { field: ALIAS_TO_FIELD[nBase], score: 950 };

  // 2) 包含匹配：取最长命中别名，避免「步数」误配「步数目标」
  let best: { field: NumericField; score: number } | null = null;
  for (const [alias, field] of Object.entries(ALIAS_TO_FIELD)) {
    if (alias.length < 2) continue;
    if (nBase.includes(alias) || nRaw.includes(alias)) {
      const score = 500 + alias.length;
      if (!best || score > best.score) best = { field, score };
    }
  }
  return best;
}

/** 日期表头匹配 */
function matchDateField(headers: string[]): string | null {
  const exact = ['date', '日期', 'recorddate', '记录日期', 'day', '日期时间', 'datetime', '时间', 'time', '日期/时间'];
  for (const h of headers) {
    const n = normalizeHeader(h);
    if (exact.includes(n)) return h;
  }
  for (const h of headers) {
    const n = normalizeHeader(h);
    if (n.includes('日期') || n === 'date' || n.includes('datetime')) return h;
  }
  return null;
}

// ==========================================
// 单位换算
// ==========================================

const UNIT_PATTERNS = {
  hour: /^(h|hr|hrs|hour|hours|小时|时)$/i,
  minute: /^(min|mins|minute|minutes|分钟|分)$/i,
  second: /^(s|sec|secs|second|seconds|秒)$/i,
  km: /^(km|kilometre|kilometer|kilometers|公里|千米)$/i,
  meter: /^(m|meter|meters|metre|米)$/i,
  kg: /^(kg|kilogram|kilograms|公斤|千克)$/i,
  gram: /^(g|gram|grams|克)$/i,
  lb: /^(lb|lbs|pound|pounds|磅)$/i,
  kcal: /^(kcal|千卡|大卡|卡路里)$/i,
  kj: /^(kj|千焦|千焦耳)$/i,
  ml: /^(ml|毫升|cc)$/i,
  liter: /^(l|liter|litre|liters|升)$/i,
  mile: /^(mi|mile|miles|英里)$/i,
  percent: /^(%|percent|pct|百分号)$/i,
  bpm: /^(bpm|次\/分|次每分钟)$/i,
  mmhg: /^(mmhg|毫米汞柱)$/i,
  count: /^(count|次|步|个|份)$/i,
};

/** 睡眠小时 → 小时 */
function toHours(value: number, unit?: string): number {
  if (!unit) return value > 24 ? value / 60 : value;
  if (UNIT_PATTERNS.hour.test(unit)) return value;
  if (UNIT_PATTERNS.minute.test(unit)) return value / 60;
  if (UNIT_PATTERNS.second.test(unit)) return value / 3600;
  return value > 24 ? value / 60 : value;
}

/**
 * 运动时长 → 分钟。
 *
 * 无单位时按量级推断（现实中运动时长几乎不会是"分钟级别的小数"）：
 *  - ≤ 12 → 小时（1.5 表示 1.5 小时）
 *  - > 600 → 秒
 *  - 其余 → 分钟
 */
function toMinutes(value: number, unit?: string): number {
  if (!unit) {
    if (value > 600) return value / 60;
    if (value > 0 && value <= 12) return value * 60;
    return value;
  }
  if (UNIT_PATTERNS.hour.test(unit)) return value * 60;
  if (UNIT_PATTERNS.minute.test(unit)) return value;
  if (UNIT_PATTERNS.second.test(unit)) return value / 60;
  return value;
}

/**
 * 距离 → 公里。
 *
 * 无单位时按量级推断：>500 视为米，否则视为公里。
 * 英里只在表头显式写明 mi 时才换算。
 */
function toKm(value: number, unit?: string): number {
  if (!unit) return value > 500 ? value / 1000 : value;
  if (UNIT_PATTERNS.km.test(unit)) return value;
  if (UNIT_PATTERNS.meter.test(unit)) return value / 1000;
  if (UNIT_PATTERNS.mile.test(unit)) return value * 1.609344;
  return value;
}

/**
 * 体重 → 公斤。
 *
 * 无单位时保守按公斤处理（>300 视为克）。不猜测磅/千克 ——
 * 猜错会直接污染体重趋势，宁可让用户补一个单位。
 */
function toKg(value: number, unit?: string): number {
  if (!unit) return value > 300 ? value / 1000 : value;
  if (UNIT_PATTERNS.kg.test(unit)) return value;
  if (UNIT_PATTERNS.lb.test(unit)) return value * 0.45359237;
  if (UNIT_PATTERNS.gram.test(unit)) return value / 1000;
  return value > 300 ? value / 1000 : value;
}

/** 体脂率 → 百分数 */
function toPct(value: number, unit?: string): number {
  if (unit && UNIT_PATTERNS.percent.test(unit)) return value;
  return value <= 1 ? value * 100 : value;
}

/** 饮水 → 毫升 */
function toMl(value: number, unit?: string): number {
  if (!unit) return value > 30 ? value : value * 1000;
  if (UNIT_PATTERNS.ml.test(unit)) return value;
  if (UNIT_PATTERNS.liter.test(unit)) return value * 1000;
  return value;
}

/** 热量 → 千卡 */
function toKcal(value: number, unit?: string): number {
  if (!unit) return value;
  if (UNIT_PATTERNS.kj.test(unit)) return value / 4.184;
  return value;
}

// ==========================================
// 日期归一化
// ==========================================

/** Excel 序列号 → YYYY-MM-DD */
function excelSerialToDate(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 20000 || serial > 80000) return null;
  const ms = Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000;
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** 从任意字符串抽取 YYYY-MM-DD */
export function normalizeDate(raw: any): string | null {
  if (raw === null || raw === undefined) return null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return `${raw.getFullYear()}-${pad(raw.getMonth() + 1)}-${pad(raw.getDate())}`;
  }
  // Unix 时间戳（秒或毫秒）——微信运动回传格式
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    if (raw > 1e12) {
      const d = new Date(raw);
      if (!Number.isNaN(d.getTime())) {
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      }
    }
    if (raw > 1e9) {
      const d = new Date(raw * 1000);
      if (!Number.isNaN(d.getTime())) {
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      }
    }
  }
  const s = String(raw).trim();
  if (!s) return null;

  // 纯数字字符串：可能是 Unix 时间戳或 Excel 序列号
  if (/^\d{10}$/.test(s)) {
    const d = new Date(Number(s) * 1000);
    if (!Number.isNaN(d.getTime())) {
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }
  }
  if (/^\d{13}$/.test(s)) {
    const d = new Date(Number(s));
    if (!Number.isNaN(d.getTime())) {
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }
  }

  // Excel 序列号
  if (/^\d{5}$/.test(s)) {
    const d = excelSerialToDate(Number(s));
    if (d) return d;
  }

  // YYYY-MM-DD / YYYY/MM/DD（可带时间）
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${pad(Number(m[2]))}-${pad(Number(m[3]))}`;

  // YYYY年M月D日
  m = /^(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?/.exec(s);
  if (m) return `${m[1]}-${pad(Number(m[2]))}-${pad(Number(m[3]))}`;

  // MM-DD（无年份）→ 用当前年补全
  m = /^(\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (m) {
    const year = new Date().getFullYear();
    return `${year}-${pad(Number(m[1]))}-${pad(Number(m[2]))}`;
  }

  // Apple Health：'2026-10-01 08:00:00 +0800'
  m = /^(\d{4})-(\d{2})-(\d{2})[T ]/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  // 兜底交给 Date
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  return null;
}

// ==========================================
// CSV 解析
// ==========================================

function detectDelimiter(text: string): string {
  const line = text.split(/\r?\n/, 1)[0] ?? '';
  const candidates = [',', '\t', ';', '|'];
  let best = ',';
  let bestCount = -1;
  for (const c of candidates) {
    let count = 0;
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') inQuotes = !inQuotes;
      else if (!inQuotes && ch === c) count++;
    }
    if (count > bestCount) {
      bestCount = count;
      best = c;
    }
  }
  return best;
}

/** RFC4180 风格 CSV 解析（支持引号包裹、引号内换行、CRLF） */
export function parseCsvText(text: string, delimiter?: string): string[][] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const delim = delimiter || detectDelimiter(src);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch === '\r') {
      // 忽略，由 \n 收尾
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
}

/** 单位行判定：整行都是短单位词 */
function looksLikeUnitRow(cells: string[]): boolean {
  const nonEmpty = cells.filter((c) => String(c).trim() !== '');
  if (!nonEmpty.length) return false;
  return nonEmpty.every((c) => {
    const t = String(c).trim();
    if (t.length > 8) return false;
    return Object.values(UNIT_PATTERNS).some((re) => re.test(t));
  });
}

// ==========================================
// XLSX 解析（零依赖：手写 zip + xml）
// ==========================================

function u16(dv: DataView, off: number): number {
  return dv.getUint16(off, true);
}
function u32(dv: DataView, off: number): number {
  return dv.getUint32(off, true);
}

/** 读取 zip 中所有条目（仅支持 store/deflate） */
function readZipEntries(buffer: ArrayBuffer): Map<string, { method: number; data: Uint8Array }> {
  const out = new Map<string, { method: number; data: Uint8Array }>();
  const dv = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 22) return out;

  // 找 End of Central Directory
  let eocd = -1;
  const minStart = Math.max(0, bytes.length - 66000);
  for (let i = bytes.length - 22; i >= minStart; i--) {
    if (u32(dv, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return out;

  const entryCount = u16(dv, eocd + 10);
  let ptr = u32(dv, eocd + 16);

  for (let i = 0; i < entryCount; i++) {
    if (ptr + 46 > bytes.length) break;
    if (u32(dv, ptr) !== 0x02014b50) break;
    const method = u16(dv, ptr + 10);
    const compressedSize = u32(dv, ptr + 20);
    const nameLen = u16(dv, ptr + 28);
    const extraLen = u16(dv, ptr + 30);
    const commentLen = u16(dv, ptr + 32);
    const localOffset = u32(dv, ptr + 42);
    const name = new TextDecoder('utf-8').decode(bytes.subarray(ptr + 46, ptr + 46 + nameLen));

    // 本地文件头
    if (localOffset + 30 <= bytes.length && u32(dv, localOffset) === 0x04034b50) {
      const lNameLen = u16(dv, localOffset + 26);
      const lExtraLen = u16(dv, localOffset + 28);
      const dataStart = localOffset + 30 + lNameLen + lExtraLen;
      const data = bytes.subarray(dataStart, dataStart + compressedSize);
      out.set(name, { method, data });
    }
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const ds = new (globalThis as any).DecompressionStream('deflate-raw');
  const blob = new Blob([data as any]);
  const stream = blob.stream().pipeThrough(ds);
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

/** 解析 sharedStrings.xml */
function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g;
  let m: RegExpExecArray | null;
  while ((m = siRe.exec(xml))) {
    const inner = m[1] ?? '';
    let text = '';
    const tRe = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let t: RegExpExecArray | null;
    while ((t = tRe.exec(inner))) {
      text += decodeXmlEntities(t[1]);
    }
    out.push(text);
  }
  return out;
}

function decodeXmlEntities(s: string): string {
  return String(s)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, '&');
}

/** 列引用 → 索引：A→0, B→1, AA→26 */
function colIndex(ref: string): number {
  const letters = /^([A-Z]+)/.exec(ref.toUpperCase());
  if (!letters) return -1;
  let n = 0;
  for (const ch of letters[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** 解析 worksheet xml → 二维数组 */
function parseWorksheet(xml: string, shared: string[]): string[][] {
  const rows: string[][] = [];
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let rm: RegExpExecArray | null;
  while ((rm = rowRe.exec(xml))) {
    const rowInner = rm[1];
    const cells: string[] = [];
    const cellRe = /<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cm: RegExpExecArray | null;
    let maxCol = -1;
    const values: { col: number; val: string }[] = [];
    while ((cm = cellRe.exec(rowInner))) {
      const attrs = cm[1] ?? '';
      const inner = cm[2] ?? '';
      const refM = /r="([A-Z]+\d+)"/.exec(attrs);
      const col = refM ? colIndex(refM[1]) : maxCol + 1;
      const tM = /t="([^"]+)"/.exec(attrs);
      const type = tM ? tM[1] : 'n';
      let value = '';
      if (type === 's') {
        const vM = /<v>([\s\S]*?)<\/v>/.exec(inner);
        const idx = vM ? Number(vM[1]) : NaN;
        value = Number.isFinite(idx) ? shared[idx] ?? '' : '';
      } else if (type === 'inlineStr') {
        const tM2 = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
        let tm: RegExpExecArray | null;
        while ((tm = tM2.exec(inner))) value += decodeXmlEntities(tm[1]);
      } else {
        const vM = /<v>([\s\S]*?)<\/v>/.exec(inner);
        value = vM ? decodeXmlEntities(vM[1]) : '';
      }
      values.push({ col, val: value });
      if (col > maxCol) maxCol = col;
    }
    for (let c = 0; c <= maxCol; c++) {
      const hit = values.find((v) => v.col === c);
      cells.push(hit ? hit.val : '');
    }
    rows.push(cells);
  }
  return rows;
}

/** 读取 xlsx → 二维数组 */
export async function parseXlsx(buffer: ArrayBuffer): Promise<string[][]> {
  const entries = readZipEntries(buffer);
  if (!entries.size) throw new Error('无法读取文件结构（不是有效的 xlsx）');

  const shared: string[] = [];
  const sharedEntry = entries.get('xl/sharedStrings.xml');
  if (sharedEntry) {
    const xml = await decodeZipEntry(sharedEntry);
    const list = parseSharedStrings(xml);
    for (const s of list) shared.push(s);
  }

  // 找到第一个 worksheet
  const sheetNames = Array.from(entries.keys())
    .filter((k) => /^xl\/worksheets\/.*\.xml$/.test(k))
    .sort();
  if (!sheetNames.length) throw new Error('xlsx 中未找到工作表');

  const xml = await decodeZipEntry(entries.get(sheetNames[0])!);
  return parseWorksheet(xml, shared);
}

async function decodeZipEntry(entry: { method: number; data: Uint8Array }): Promise<string> {
  if (entry.method === 0) return new TextDecoder('utf-8').decode(entry.data);
  if (entry.method === 8) {
    const inflated = await inflateRaw(entry.data);
    return new TextDecoder('utf-8').decode(inflated);
  }
  throw new Error(`不支持的压缩方式：${entry.method}`);
}

// ==========================================
// 表格 → 条目 的通用映射
// ==========================================

export interface TableMapping {
  entries: HealthDailyEntry[];
  detectedFields: string[];
  skipped: { row: number; reason: string }[];
}

/**
 * 把二维表（首行为表头）映射成健康条目。
 * 支持：
 *  - 双行表头（第 2 行是单位行）
 *  - 日期列自动嗅探
 *  - 指标列自动嗅探（含中文别名与内联单位）
 */
export function mapTableToEntries(
  rows: string[][],
  source: HealthDataSource
): TableMapping {
  const skipped: { row: number; reason: string }[] = [];
  const detectedFields: string[] = [];
  if (!rows.length) return { entries: [], detectedFields, skipped };

  let headerIdx = 0;
  let headers = rows[0].map((h) => String(h ?? '').trim());
  let unitRow: string[] | null = null;

  // 单位行检测：第 2 行若整行都是单位词
  if (rows.length > 2 && looksLikeUnitRow(rows[1])) {
    unitRow = rows[1];
    headerIdx = 1;
    headers = rows[0].map((h) => String(h ?? '').trim());
  }

  const dateHeader = matchDateField(headers);
  if (!dateHeader) {
    return {
      entries: [],
      detectedFields,
      skipped: [{ row: 1, reason: '未找到日期列（表头需含 date / 日期 / 时间 之一）' }],
    };
  }

  // 表头 → 字段 + 单位
  const columnMap: { index: number; field: NumericField; unit?: string }[] = [];
  headers.forEach((h, idx) => {
    if (idx === headers.indexOf(dateHeader)) return;
    const m = matchField(h);
    if (!m) return;
    const inline = splitHeaderUnit(h).unit;
    const rowUnit = unitRow ? String(unitRow[idx] ?? '').trim() : '';
    const unit = inline || (rowUnit || undefined);
    columnMap.push({ index: idx, field: m.field, unit });
    if (!detectedFields.includes(m.field)) detectedFields.push(m.field);
  });

  const bodyRows = rows.slice(headerIdx + 1);
  const byDate = new Map<string, HealthDailyEntry>();
  const now = new Date().toISOString();

  bodyRows.forEach((cells, i) => {
    const rowNo = i + headerIdx + 2; // 1-based 且对应源文件行号
    const date = normalizeDate(cells[headers.indexOf(dateHeader)]);
    if (!date) {
      skipped.push({ row: rowNo, reason: '日期无法解析' });
      return;
    }
    let entry = byDate.get(date);
    if (!entry) {
      entry = {
        id: uid(),
        date,
        source,
        createdAt: now,
        updatedAt: now,
      };
      byDate.set(date, entry);
    }

    for (const cm of columnMap) {
      const raw = cells[cm.index];
      const num = toNumber(raw);
      if (num === undefined) continue;
      const e = entry as any;
      switch (cm.field) {
        case 'sleepHours': e.sleepHours = toHours(num, cm.unit); break;
        case 'deepSleepHours': e.deepSleepHours = toHours(num, cm.unit); break;
        case 'remSleepHours': e.remSleepHours = toHours(num, cm.unit); break;
        case 'lightSleepHours': e.lightSleepHours = toHours(num, cm.unit); break;
        case 'awakenCount': e.awakenCount = num; break;
        case 'exerciseMinutes': e.exerciseMinutes = toMinutes(num, cm.unit); break;
        case 'steps': e.steps = num; break;
        case 'caloriesBurned': e.caloriesBurned = toKcal(num, cm.unit); break;
        case 'distanceKm': e.distanceKm = toKm(num, cm.unit); break;
        case 'caloriesIntake': e.caloriesIntake = toKcal(num, cm.unit); break;
        case 'proteinG': e.proteinG = num; break;
        case 'carbsG': e.carbsG = num; break;
        case 'fatG': e.fatG = num; break;
        case 'waterMl': e.waterMl = toMl(num, cm.unit); break;
        case 'mealCount': e.mealCount = num; break;
        case 'weightKg': e.weightKg = toKg(num, cm.unit); break;
        case 'bodyFatPct': e.bodyFatPct = toPct(num, cm.unit); break;
        case 'restingHr': e.restingHr = num; break;
        case 'systolicBp': e.systolicBp = num; break;
        case 'diastolicBp': e.diastolicBp = num; break;
        case 'energyLevel': e.energyLevel = num; break;
      }
    }
  });

  const entries = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  return { entries, detectedFields, skipped };
}

// ==========================================
// Apple Health export.xml 解析
// ==========================================

const APPLE_TYPE_MAP: Record<string, NumericField> = {
  HKQuantityTypeIdentifierStepCount: 'steps',
  HKQuantityTypeIdentifierDistanceWalkingRunning: 'distanceKm',
  HKQuantityTypeIdentifierActiveEnergyBurned: 'caloriesBurned',
  HKQuantityTypeIdentifierTotalEnergyBurned: 'caloriesBurned',
  HKQuantityTypeIdentifierDietaryEnergyConsumed: 'caloriesIntake',
  HKQuantityTypeIdentifierDietaryWater: 'waterMl',
  HKQuantityTypeIdentifierBodyMass: 'weightKg',
  HKQuantityTypeIdentifierBodyFatPercentage: 'bodyFatPct',
  HKQuantityTypeIdentifierRestingHeartRate: 'restingHr',
  HKQuantityTypeIdentifierHeartRate: 'restingHr',
};

/**
 * 睡眠阶段映射。
 *
 * Apple 的取值语义：
 *  - AsleepUnspecified：未细分阶段
 *  - AsleepCore：主力浅睡（watchOS 里的 "Core" 指非 REM 非深睡的主睡眠）
 *  - AsleepDeep：深睡
 *  - AsleepREM：快速眼动睡眠
 * InBed / Awake 不计入睡眠时长。
 */
const APPLE_SLEEP_VALUES: Record<string, NumericField> = {
  HKCategoryValueSleepAnalysisAsleepUnspecified: 'lightSleepHours',
  HKCategoryValueSleepAnalysisAsleepCore: 'lightSleepHours',
  HKCategoryValueSleepAnalysisAsleepDeep: 'deepSleepHours',
  HKCategoryValueSleepAnalysisAsleepREM: 'remSleepHours',
};

function parseAttrs(attrStr: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([A-Za-z0-9_:-]+)\s*=\s*"([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrStr))) out[m[1]] = decodeXmlEntities(m[2]);
  return out;
}

/**
 * 解析 Apple 的日期时间字符串为 UTC 毫秒。
 *
 * 形如 '2026-10-01 23:00:00 +0800'。
 *
 * 关键：Apple 带的是设备本地时区偏移，必须应用它，
 * 否则「23:00 → 次日 07:00」会被当成 8 小时而实际是 16 小时
 * （真实睡眠时长就完全错了）。
 */
function appleDateMs(s: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?\s*(Z|[+-]\d{2}:?\d{2})?/.exec(s);
  if (!m) {
    const d = new Date(s);
    return d.getTime();
  }
  const [, y, mo, d, hh, mm, ss, tz] = m;
  const utc = Date.UTC(
    Number(y), Number(mo) - 1, Number(d),
    Number(hh), Number(mm), Number(ss),
  );
  if (!tz || tz === 'Z') return utc;
  // +0800 → 偏移 480 分钟；本地时间 = UTC + 偏移，所以 UTC = 本地 - 偏移
  const sign = tz[0] === '-' ? -1 : 1;
  const digits = tz.slice(1).replace(':', '');
  const offMinutes = sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2, 4)));
  return utc - offMinutes * 60000;
}

/** 从 Apple 日期时间串里取「本地时刻的分钟数」（0-1439） */
function appleLocalMinutes(s: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(s);
  if (!m) return null;
  return Number(m[4]) * 60 + Number(m[5]);
}

/** 从 Apple 日期时间串里取本地日期部分 YYYY-MM-DD */
function appleLocalDateKey(s: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/** 解析 Apple Health 导出的 export.xml */
export function parseAppleHealthXml(xml: string): TableMapping {
  const skipped: { row: number; reason: string }[] = [];
  const detectedFields: string[] = [];
  const byDate = new Map<string, HealthDailyEntry>();
  const now = new Date().toISOString();
  let rowNo = 0;

  const ensure = (date: string): HealthDailyEntry => {
    let e = byDate.get(date);
    if (!e) {
      e = { id: uid(), date, source: 'apple_health', createdAt: now, updatedAt: now };
      byDate.set(date, e);
    }
    return e;
  };

  // <Record .../>
  const recRe = /<Record\b([^>]*?)\/>/g;
  let rm: RegExpExecArray | null;
  while ((rm = recRe.exec(xml))) {
    rowNo++;
    const attrs = parseAttrs(rm[1] ?? '');
    const type = attrs.type ?? '';
    const value = attrs.value;
    if (value === undefined) continue;

    // 通用记录用【本地日期】归属，避免时区偏移把数据推到相邻一天
    const localDate = appleLocalDateKey(attrs.endDate ?? attrs.startDate ?? '');
    const date = localDate ?? normalizeDate(attrs.endDate ?? attrs.startDate);
    if (!date) {
      skipped.push({ row: rowNo, reason: '记录缺少可解析日期' });
      continue;
    }
    const entry = ensure(date);
    const e = entry as any;

    if (type === 'HKCategoryTypeIdentifierSleepAnalysis') {
      const field = APPLE_SLEEP_VALUES[value];
      if (!field) continue; // InBed / Awake 不计入睡眠结构
      const start = appleDateMs(attrs.startDate ?? '');
      const end = appleDateMs(attrs.endDate ?? '');
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
      const hours = (end - start) / 3600000;

      // 睡眠归属「醒来那天」：23:00 入睡到次日 07:00 起床，算作第二天（起床日）的睡眠。
      // 这是睡眠记录的标准口径 —— 早上醒来后回看昨晚睡眠，属于「今天」。
      const startKey = appleLocalDateKey(attrs.startDate ?? '');
      const wakeKey = appleLocalDateKey(attrs.endDate ?? '');
      const sleepDate = wakeKey ?? date;
      const sleepEntry = ensure(sleepDate);
      const se = sleepEntry as any;
      se[field] = (se[field] ?? 0) + hours;
      se.sleepHours = (se.sleepHours ?? 0) + hours;

      // 入睡 / 起床时间（分钟）。
      // 入睡口径：从当日 18:00 起算的分钟偏移（窗口 18:00 → 次日 18:00，1440 分钟）。
      // 这样 23:00 入睡 = 300，01:00 入睡 = 420，07:00 入睡 = 780（>720 表示跨到后半夜）。
      const startMins = appleLocalMinutes(attrs.startDate ?? '');
      const wakeMins = appleLocalMinutes(attrs.endDate ?? '');
      if (startMins !== null) {
        const mins = (startMins - 18 * 60 + 1440) % 1440;
        se.bedtimeMinutes = Math.min(se.bedtimeMinutes ?? Infinity, mins);
      }
      if (wakeMins !== null) {
        se.wakeTimeMinutes = Math.max(se.wakeTimeMinutes ?? 0, wakeMins);
      }

      if (!detectedFields.includes(field)) detectedFields.push(field);
      if (!detectedFields.includes('sleepHours')) detectedFields.push('sleepHours');
      continue;
    }

    const field = APPLE_TYPE_MAP[type];
    if (!field) continue;
    const num = toNumber(value);
    if (num === undefined) continue;
    const unit = attrs.unit;
    let v = num;
    switch (field) {
      case 'distanceKm': v = toKm(num, unit === 'mi' ? 'mi' : unit); break;
      case 'weightKg': v = toKg(num, unit); break;
      case 'bodyFatPct': v = toPct(num, unit); break;
      case 'caloriesBurned':
      case 'caloriesIntake': v = toKcal(num, unit); break;
      case 'waterMl': v = toMl(num, unit); break;
      default: v = num;
    }
    // 累加型：步数/距离/热量/饮水
    // 注意 TotalEnergyBurned 已包含 ActiveEnergyBurned，两者同时存在时
    // 会重复累加，所以单独记录 totalEnergy 字段，只在有 active 时用 active。
    if (type === 'HKQuantityTypeIdentifierTotalEnergyBurned') {
      const e2 = entry as any;
      e2.__totalEnergy = (e2.__totalEnergy ?? 0) + v;
      if (!detectedFields.includes(field)) detectedFields.push(field);
      continue;
    }
    if (type === 'HKQuantityTypeIdentifierActiveEnergyBurned') {
      const e2 = entry as any;
      e2.__activeEnergy = (e2.__activeEnergy ?? 0) + v;
      if (!detectedFields.includes(field)) detectedFields.push(field);
      continue;
    }
    if (field === 'waterMl' || field === 'steps' || field === 'distanceKm') {
      e[field] = (e[field] ?? 0) + v;
    } else {
      // 体重/体脂/心率取当天最后一次
      e[field] = v;
    }
    if (!detectedFields.includes(field)) detectedFields.push(field);
  }

  // <Workout .../>
  const woRe = /<Workout\b([^>]*?)\/>/g;
  let wm: RegExpExecArray | null;
  while ((wm = woRe.exec(xml))) {
    rowNo++;
    const attrs = parseAttrs(wm[1] ?? '');
    const date =
      appleLocalDateKey(attrs.endDate ?? attrs.startDate ?? '') ??
      normalizeDate(attrs.endDate ?? attrs.startDate);
    if (!date) continue;
    const entry = ensure(date);
    const e = entry as any;
    const duration = toNumber(attrs.duration);
    if (duration !== undefined) {
      const unit = attrs.durationUnit ?? 'min';
      e.exerciseMinutes = (e.exerciseMinutes ?? 0) + toMinutes(duration, unit);
    }
    // Workout 能量单独累计，最终与 Record 的活动能量取较大值，避免重复累加
    const energy = toNumber(attrs.totalEnergyBurned);
    if (energy !== undefined) {
      e.__workoutEnergy = (e.__workoutEnergy ?? 0) + toKcal(energy, attrs.totalEnergyBurnedUnit ?? 'kcal');
    }
    const dist = toNumber(attrs.totalDistance);
    if (dist !== undefined) {
      e.distanceKm = (e.distanceKm ?? 0) + toKm(dist, attrs.totalDistanceUnit ?? 'km');
    }
    if (attrs.workoutActivityType) {
      e.exerciseType = attrs.workoutActivityType.replace(/^HKWorkoutActivityType/, '');
    }
    for (const f of ['exerciseMinutes', 'caloriesBurned', 'distanceKm']) {
      if (!detectedFields.includes(f)) detectedFields.push(f);
    }
  }

  // 结算消耗热量并清理内部临时字段：
  // - Record.ActiveEnergyBurned 与 Record.TotalEnergyBurned 同时存在时后者更大，取大值；
  // - Workout 能量已经包含在 Active 里，所以 workout 能量只用于在没有 Record 能量时兜底。
  for (const entry of byDate.values()) {
    const e = entry as any;
    const active = e.__activeEnergy as number | undefined;
    const total = e.__totalEnergy as number | undefined;
    const workout = e.__workoutEnergy as number | undefined;
    const candidates = [active, total, workout].filter(
      (v): v is number => typeof v === 'number' && Number.isFinite(v)
    );
    if (candidates.length) {
      e.caloriesBurned = Math.max(...candidates);
    }
    delete e.__activeEnergy;
    delete e.__totalEnergy;
    delete e.__workoutEnergy;
  }

  const entries = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  return { entries, detectedFields, skipped };
}

// ==========================================
// 微信运动 JSON 解析（wx.getWeRunData 回传格式）
// ==========================================

export function parseWechatRunJson(text: string): TableMapping {
  const skipped: { row: number; reason: string }[] = [];
  const detectedFields: string[] = [];
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    return { entries: [], detectedFields, skipped: [{ row: 0, reason: 'JSON 解析失败' }] };
  }

  const list: any[] = Array.isArray(data)
    ? data
    : data?.stepInfoList ?? data?.data?.stepInfoList ?? data?.entries ?? [];

  if (!Array.isArray(list) || !list.length) {
    return { entries: [], detectedFields, skipped: [{ row: 0, reason: '未找到 stepInfoList / entries 数组' }] };
  }

  const byDate = new Map<string, HealthDailyEntry>();
  const now = new Date().toISOString();
  list.forEach((item, i) => {
    const ts = item?.timestamp ?? item?.date ?? item?.time;
    const date = normalizeDate(ts);
    if (!date) {
      skipped.push({ row: i + 1, reason: '缺少可解析的 timestamp' });
      return;
    }
    let e = byDate.get(date);
    if (!e) {
      e = { id: uid(), date, source: 'wechat_run', createdAt: now, updatedAt: now };
      byDate.set(date, e);
    }
    const steps = toNumber(item?.step ?? item?.steps);
    if (steps !== undefined) {
      e.steps = (e.steps ?? 0) + steps;
      if (!detectedFields.includes('steps')) detectedFields.push('steps');
    }
    const km = toNumber(item?.distanceMeters ?? item?.distance);
    if (km !== undefined) {
      e.distanceKm = (e.distanceKm ?? 0) + (item?.distanceMeters !== undefined ? km / 1000 : toKm(km));
      if (!detectedFields.includes('distanceKm')) detectedFields.push('distanceKm');
    }
    const energy = toNumber(item?.energyKcal ?? item?.calories);
    if (energy !== undefined) {
      e.caloriesBurned = (e.caloriesBurned ?? 0) + energy;
      if (!detectedFields.includes('caloriesBurned')) detectedFields.push('caloriesBurned');
    }
  });

  const entries = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  return { entries, detectedFields, skipped };
}

// ==========================================
// 通用 JSON 解析
// ==========================================

export function parseGenericJson(text: string): TableMapping {
  const skipped: { row: number; reason: string }[] = [];
  const detectedFields: string[] = [];
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    return { entries: [], detectedFields, skipped: [{ row: 0, reason: 'JSON 解析失败' }] };
  }
  const list: any[] = Array.isArray(data)
    ? data
    : data?.entries ?? data?.data?.entries ?? data?.records ?? data?.days ?? [];
  if (!Array.isArray(list) || !list.length) {
    return { entries: [], detectedFields, skipped: [{ row: 0, reason: '未找到条目数组' }] };
  }
  // 对象数组 → 二维表
  const keys = Array.from(new Set(list.flatMap((o) => (o && typeof o === 'object' ? Object.keys(o) : []))));
  const rows: string[][] = [];
  rows.push(keys);
  for (const o of list) {
    rows.push(keys.map((k) => (o?.[k] === undefined || o?.[k] === null ? '' : String(o[k]))));
  }
  const mapped = mapTableToEntries(rows, 'csv');
  return {
    entries: mapped.entries,
    detectedFields: mapped.detectedFields,
    skipped: [...skipped, ...mapped.skipped],
  };
}

// ==========================================
// 来源识别
// ==========================================

export function detectSourceFromName(fileName: string): HealthDataSource {
  const n = fileName.toLowerCase();
  if (n.includes('export.xml') || n.includes('apple_health_export') || n.includes('apple健康')) return 'apple_health';
  if (n.includes('薄荷') || n.includes('boohee')) return 'boohee';
  if (n.includes('华为') || n.includes('huawei')) return 'huawei';
  if (n.includes('小米') || n.includes('xiaomi') || n.includes('zepp')) return 'xiaomi';
  if (n.includes('微信') || n.includes('wechat') || n.includes('werun')) return 'wechat_run';
  return 'csv';
}

/**
 * 表头特征 → 来源推断。
 *
 * 只在有【厂商专属特征】时才判定具体厂商，否则一律归为通用 csv。
 * 避免「步数 + 运动时长」这种通用组合被误判成华为。
 */
function detectSourceFromFields(fields: string[], headers: string[]): HealthDataSource {
  const joined = headers.map(normalizeHeader).join('|');
  // 薄荷特征：餐次 / 食物名称 / 克数
  if (headers.some((h) => /早餐|午餐|晚餐|加餐|餐次|食物|食物名称|克数|摄入量/.test(h))) {
    return 'boohee';
  }
  // 小米 / Zepp 特征：表头里直接带品牌名
  if (/小米|米家|zepp|amazfit/.test(joined)) return 'xiaomi';
  // 华为特征：卡路里 + 活动量 + 步数这类组合（比通用组合更具体）
  if (/华为|huawei/.test(joined)) return 'huawei';
  if (/步幅|活动量|卡路里/.test(joined) && /锻炼时长|运动类型/.test(joined)) {
    return 'huawei';
  }
  return 'csv';
}

// ==========================================
// 统一入口
// ==========================================

export interface ParseOutcome {
  entries: HealthDailyEntry[];
  detectedSource: HealthDataSource;
  detectedFields: string[];
  skipped: { row: number; reason: string }[];
  dateFrom?: string;
  dateTo?: string;
}

/** 解析单个文件内容（不涉及合并） */
export async function parseHealthContent(
  fileName: string,
  content: string | ArrayBuffer | Uint8Array
): Promise<ParseOutcome> {
  const nameSource = detectSourceFromName(fileName);
  let text = '';
  let isBinary = false;
  if (typeof content === 'string') {
    text = content;
  } else {
    isBinary = true;
    const buf = content instanceof Uint8Array
      ? content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength)
      : content;
    text = new TextDecoder('utf-8').decode(new Uint8Array(buf as ArrayBuffer));
  }

  const lower = fileName.toLowerCase();
  const looksXml = /<healthdata|<record\b/i.test(text.slice(0, 5000)) || lower.endsWith('.xml');
  const looksJson = lower.endsWith('.json') || /^\s*[{[]/.test(text);

  let mapping: TableMapping;
  let detectedSource: HealthDataSource = nameSource;

  if (looksXml && /<healthdata/i.test(text)) {
    mapping = parseAppleHealthXml(text);
    detectedSource = 'apple_health';
  } else if (looksJson) {
    if (nameSource === 'wechat_run' || /stepInfoList/i.test(text)) {
      mapping = parseWechatRunJson(text);
      detectedSource = 'wechat_run';
    } else {
      mapping = parseGenericJson(text);
      detectedSource = nameSource === 'csv' ? 'csv' : nameSource;
    }
  } else if (lower.endsWith('.xlsx') || lower.endsWith('.xlsm')) {
    const buf = isBinary
      ? (content instanceof Uint8Array
        ? content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength)
        : content)
      : new TextEncoder().encode(text).buffer;
    const rows = await parseXlsx(buf as ArrayBuffer);
    mapping = mapTableToEntries(rows, nameSource);
    detectedSource = detectSourceFromFields(mapping.detectedFields, rows[0] ?? []);
    if (nameSource !== 'csv') detectedSource = nameSource;
  } else {
    const rows = parseCsvText(text);
    mapping = mapTableToEntries(rows, nameSource);
    detectedSource = detectSourceFromFields(mapping.detectedFields, rows[0] ?? []);
    if (nameSource !== 'csv') detectedSource = nameSource;
  }

  const dates = mapping.entries.map((e) => e.date).sort();
  return {
    entries: mapping.entries,
    detectedSource,
    detectedFields: mapping.detectedFields,
    skipped: mapping.skipped,
    dateFrom: dates[0],
    dateTo: dates[dates.length - 1],
  };
}

/** 解析文件（File 对象） */
export async function parseHealthFile(file: File): Promise<ParseOutcome> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.xlsx') || lower.endsWith('.xlsm')) {
    const buf = await file.arrayBuffer();
    return parseHealthContent(file.name, buf);
  }
  const text = await file.text();
  return parseHealthContent(file.name, text);
}

/** 合并已有数据（按日期幂等） */
export function mergeImportedEntries(
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
      const merged: HealthDailyEntry = { ...prev };
      for (const [k, v] of Object.entries(inc)) {
        if (k === 'id' || k === 'createdAt' || k === 'updatedAt') continue;
        if (v !== undefined && v !== null && v !== '') (merged as any)[k] = v;
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

/** 组装导入结果 */
export function buildImportResult(
  outcome: ParseOutcome,
  added: number,
  mergedCount: number,
  fileName: string
): HealthImportResult {
  return {
    imported: outcome.entries.length,
    added,
    merged: mergedCount,
    detectedSource: outcome.detectedSource,
    detectedFields: outcome.detectedFields,
    skipped: outcome.skipped.slice(0, 50),
    dateFrom: outcome.dateFrom,
    dateTo: outcome.dateTo,
    batchId: `hb-${Date.now().toString(36)}`,
    importedAt: new Date().toISOString(),
  };
}

/** 数据源中文名 */
export const SOURCE_LABEL: Record<HealthDataSource, string> = {
  manual: '手动记录',
  apple_health: 'Apple 健康',
  boohee: '薄荷健康',
  huawei: '华为运动健康',
  xiaomi: '小米运动健康',
  wechat_run: '微信运动',
  csv: '通用 CSV / JSON',
};

/** 各来源的导出指引 */
export const SOURCE_GUIDE: Record<HealthDataSource, string> = {
  manual: '直接在表单里逐日填写，最简单也最可靠。',
  apple_health:
    'iPhone：健康 App → 右上角头像 → 导出所有健康数据 → 分享 → 保存 export.zip，解压后上传 export.xml。',
  boohee:
    '薄荷健康 App：我的 → 右上角设置 → 导出数据 → 选择时间范围（单次最多约 90 天）→ 得到 Excel/CSV 后上传。',
  huawei: '华为运动健康 App：我的 → 设备/运动健康 → 数据管理 → 导出 CSV 后上传。',
  xiaomi: '小米运动健康 App：我的 → 设置 → 账号与安全 → 导出数据（CSV/Excel）后上传。',
  wechat_run:
    '微信运动数据需在微信小程序端通过 wx.getWeRunData 获取，可把返回的 stepInfoList JSON 上传到此处。',
  csv: '通用格式：第一行表头，含 date/日期 列，其余列名可用中文（睡眠时长、运动时长、步数、摄入热量、蛋白质、体重…）。',
};
