/**
 * 薄荷开放平台直连模块 单元测试
 *
 * 运行：node tools/test-boohee-openapi.mjs
 *
 * 关键点：
 *  - 不需要真实 API Key。用本地 http server 打桩，验证请求路径、参数、鉴权头、
 *    业务 code 错误处理、响应 → HealthDailyEntry 的映射、同步编排逻辑。
 *  - 校验「凭证缺失 / 无效」时的错误码与提示文案。
 */
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import http from 'node:http';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

async function loadModule(entry) {
  const outfile = join(mkdtempSync(join(tmpdir(), 'boohee-')), 'bundle.mjs');
  await build({
    entryPoints: [resolve(root, entry)],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile,
    loader: { '.ts': 'ts' },
    logLevel: 'error',
  });
  return import('file://' + outfile.replace(/\\/g, '/'));
}

const B = await loadModule('src/utils/booheeOpenApi.ts');

let pass = 0;
let fail = 0;
const failures = [];
function ok(name, cond, extra = '') {
  if (cond) pass++;
  else {
    fail++;
    failures.push(`${name}${extra ? ' → ' + extra : ''}`);
  }
}
function eq(name, actual, expected) {
  ok(name, actual === expected, `期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
}
function group(name) {
  console.log(`\n▶ ${name}`);
}

// ==========================================
// 本地桩服务
// ==========================================
const requests = [];
let handler = () => ({ code: 0, message: 'ok', data: {} });

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    requests.push({
      method: req.method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams.entries()),
      headers: req.headers,
      body: body ? JSON.parse(body) : undefined,
    });
    const out = handler({ path: url.pathname, query: Object.fromEntries(url.searchParams.entries()) });
    res.writeHead(out.httpStatus ?? 200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(out.payload));
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const CFG = {
  apiKey: 'sk-test-key',
  accessToken: '',
  userId: 'u_1',
  authMode: 'apiKey',
};
const BASE_OPT = { baseUrl: base };

// ==========================================
group('1. 鉴权头构造')
// ==========================================
{
  const h1 = B.buildAuthHeaders(CFG);
  eq('API Key 模式使用 X-Api-Key', h1['X-Api-Key'], 'sk-test-key');
  ok('API Key 模式不带 Authorization', !('Authorization' in h1));

  const h2 = B.buildAuthHeaders({ ...CFG, authMode: 'token', accessToken: 'abc' });
  eq('Token 模式使用 Bearer', h2['Authorization'], 'Bearer abc');

  const h3 = B.buildAuthHeaders({ ...CFG, authMode: 'token', accessToken: 'Bearer xyz' });
  eq('Token 已带 Bearer 前缀不重复添加', h3['Authorization'], 'Bearer xyz');

  let threw = null;
  try {
    B.buildAuthHeaders({ ...CFG, apiKey: '' });
  } catch (e) {
    threw = e;
  }
  ok('缺 API Key 抛错', threw !== null);
  eq('缺 API Key 错误码 1049', threw?.code, 1049);
  ok('缺 API Key 标记为鉴权错误', threw?.isAuthError === true);

  threw = null;
  try {
    B.buildAuthHeaders({ ...CFG, authMode: 'token', accessToken: '' });
  } catch (e) {
    threw = e;
  }
  eq('缺 Token 错误码 1010', threw?.code, 1010);
}

// ==========================================
group('2. 请求参数与路径')
// ==========================================
{
  requests.length = 0;
  handler = () => ({
    payload: {
      code: 0,
      message: 'ok',
      data: { total: 1, items: [{ id: 1, record_on: '2026-01-02', weight: 65.5, body_fat: 20.1 }] },
    },
  });
  const items = await B.fetchWeightRecords(CFG, { startDate: '2026-01-01', endDate: '2026-01-31' }, BASE_OPT);
  eq('体重列表返回 1 条', items.length, 1);
  const r0 = requests[0];
  eq('路径正确', r0.path, '/v2/weight/records');
  eq('带 user_id', r0.query.user_id, 'u_1');
  eq('带 start_date', r0.query.start_date, '2026-01-01');
  eq('带 end_date', r0.query.end_date, '2026-01-31');
  eq('默认页码', r0.query.page, '1');
  ok('发送了 X-Api-Key', r0.headers['x-api-key'] === 'sk-test-key');

  requests.length = 0;
  handler = () => ({ payload: { code: 0, message: 'ok', data: { daily: { meals: [], total_calories: 0 } } } });
  await B.fetchEatingRecords(CFG, '2026-02-03', BASE_OPT);
  eq('饮食路径正确', requests[0].path, '/v2/eating/records');
  eq('饮食带 record_on', requests[0].query.record_on, '2026-02-03');

  requests.length = 0;
  handler = () => ({ payload: { code: 0, message: 'ok', data: { foods: [{ code: '1', name: '米饭' }] } } });
  const search = await B.searchFoods(CFG, '米饭', BASE_OPT);
  eq('食物搜索路径正确', requests[0].path, '/v1/food/search');
  eq('食物搜索带 keyword', requests[0].query.keyword, '米饭');
  eq('食物搜索返回 1 条', search.foods.length, 1);

  requests.length = 0;
  await B.recordWeight(CFG, { weight: 70, bodyFat: 22, recordOn: '2026-03-04' }, BASE_OPT);
  eq('写体重是 POST', requests[0].method, 'POST');
  eq('写体重路径正确', requests[0].path, '/v2/weight/record');
  eq('写体重 body.weight', requests[0].body.weight, 70);
  eq('写体重 body.body_fat', requests[0].body.body_fat, 22);
  eq('写体重 body.record_on', requests[0].body.record_on, '2026-03-04');
  ok('POST 带 Content-Type', String(requests[0].headers['content-type']).includes('json'));

  requests.length = 0;
  await B.recordSingleFood(
    CFG,
    { foodCode: 'f_1', amount: 200, unitName: '克', mealType: 2, recordOn: '2026-03-05' },
    BASE_OPT
  );
  eq('写饮食路径正确', requests[0].path, '/v2/eating/record_single');
  eq('写饮食 body.food_code', requests[0].body.food_code, 'f_1');
  eq('写饮食 body.meal_type', requests[0].body.meal_type, 2);
  eq('写饮食 body.unit_name', requests[0].body.unit_name, '克');
}

// ==========================================
group('3. 业务错误处理')
// ==========================================
{
  handler = () => ({ payload: { code: 1050, message: '无效的 API Key' } });
  let err = null;
  try {
    await B.fetchWeightRecords(CFG, { startDate: '2026-01-01', endDate: '2026-01-02' }, BASE_OPT);
  } catch (e) {
    err = e;
  }
  ok('无效 API Key 抛错', err !== null);
  eq('错误码透传', err?.code, 1050);
  ok('识别为鉴权错误', err?.isAuthError === true);
  ok('提示文案可读', String(err?.message).includes('API Key'), String(err?.message));

  handler = () => ({ payload: { code: 1049, message: '缺少认证凭证' } });
  err = null;
  try {
    await B.fetchEatingRecords(CFG, '2026-01-01', BASE_OPT);
  } catch (e) {
    err = e;
  }
  eq('缺凭证错误码 1049', err?.code, 1049);

  handler = () => ({ payload: { code: -400, message: '参数缺失' } });
  err = null;
  try {
    await B.searchFoods(CFG, 'x', BASE_OPT);
  } catch (e) {
    err = e;
  }
  eq('参数缺失错误码 -400', err?.code, -400);
  ok('非鉴权错误不标记为鉴权错误', err?.isAuthError === false);

  handler = () => ({ httpStatus: 500, payload: { code: -1, message: '服务器内部错误' } });
  err = null;
  try {
    await B.fetchWeightRecords(CFG, { startDate: '2026-01-01', endDate: '2026-01-02' }, BASE_OPT);
  } catch (e) {
    err = e;
  }
  ok('HTTP 500 也抛错', err !== null);
  eq('保留 HTTP 状态码', err?.httpStatus, 500);
}

// ==========================================
group('4. 响应映射')
// ==========================================
{
  const w = B.weightItemToEntry({ record_on: '2026-04-01', weight: 68.4, body_fat: 21.3 });
  eq('体重映射日期', w?.date, '2026-04-01');
  eq('体重映射体重', w?.weightKg, 68.4);
  eq('体重映射体脂', w?.bodyFatPct, 21.3);
  eq('体重映射来源', w?.source, 'boohee');
  ok('缺日期返回 null', B.weightItemToEntry({ record_on: '', weight: 60 }) === null);
  ok('无数值返回 null', B.weightItemToEntry({ record_on: '2026-04-01' }) === null);

  const e = B.eatingToEntry('2026-04-02', {
    meals: [
      { meal_type: 1, items: [{ id: 1, food_name: '鸡蛋', calories: 120 }] },
      { meal_type: 2, items: [{ id: 2, food_name: '米饭', calories: 232 }] },
    ],
    total_calories: 352,
    total_protein: 13.4,
    total_fat: 6.0,
    total_carbohydrate: 51.8,
  });
  eq('饮食映射日期', e?.date, '2026-04-02');
  eq('饮食映射热量', e?.caloriesIntake, 352);
  eq('饮食映射蛋白', e?.proteinG, 13.4);
  eq('饮食映射脂肪', e?.fatG, 6.0);
  eq('饮食映射碳水', e?.carbsG, 51.8);
  eq('饮食映射餐次', e?.mealCount, 2);
  ok('空饮食返回 null', B.eatingToEntry('2026-04-03', { meals: [] }) === null);
  ok('null 饮食返回 null', B.eatingToEntry('2026-04-03', null) === null);
}

// ==========================================
group('5. 一键同步编排')
// ==========================================
{
  requests.length = 0;
  handler = ({ path, query }) => {
    if (path === '/v2/weight/records') {
      return {
        payload: {
          code: 0,
          message: 'ok',
          data: {
            total: 2,
            items: [
              { id: 1, record_on: '2026-05-01', weight: 70, body_fat: 22 },
              { id: 2, record_on: '2026-05-02', weight: 69.6, body_fat: 21.8 },
            ],
          },
        },
      };
    }
    if (path === '/v2/eating/records') {
      const on = query.record_on;
      if (on === '2026-05-01') {
        return {
          payload: {
            code: 0,
            message: 'ok',
            data: {
              daily: {
                meals: [{ meal_type: 1, items: [{ id: 1, food_name: '燕麦', calories: 300 }] }],
                total_calories: 300,
                total_protein: 12,
                total_fat: 6,
                total_carbohydrate: 45,
              },
            },
          },
        };
      }
      return { payload: { code: 0, message: 'ok', data: { daily: null } } };
    }
    return { payload: { code: 0, message: 'ok', data: {} } };
  };

  const summary = await B.syncFromBoohee(
    CFG,
    { startDate: '2026-05-01', endDate: '2026-05-02', includeEating: true },
    BASE_OPT
  );
  eq('同步得到 2 天', summary.days, 2);
  eq('体重记录 2 条', summary.weightRecords, 2);
  eq('饮食明细 1 条', summary.eatingRecords, 1);
  eq('起始日期', summary.dateFrom, '2026-05-01');
  eq('结束日期', summary.dateTo, '2026-05-02');
  const d1 = summary.entries.find((x) => x.date === '2026-05-01');
  eq('同日体重+饮食合并：体重', d1?.weightKg, 70);
  eq('同日体重+饮食合并：热量', d1?.caloriesIntake, 300);
  eq('同日体重+饮食合并：餐次', d1?.mealCount, 1);
  eq('同日体重+饮食合并：来源', d1?.source, 'boohee');
  const d2 = summary.entries.find((x) => x.date === '2026-05-02');
  eq('只有体重也有条目', d2?.weightKg, 69.6);
  ok('条目按日期升序', summary.entries[0].date <= summary.entries[1].date);

  // 跳过饮食
  requests.length = 0;
  const noEat = await B.syncFromBoohee(
    CFG,
    { startDate: '2026-05-01', endDate: '2026-05-02', includeEating: false },
    BASE_OPT
  );
  eq('关闭饮食后仍能同步体重', noEat.weightRecords, 2);
  eq('关闭饮食后无饮食明细', noEat.eatingRecords, 0);
  ok('关闭饮食后不请求饮食接口', !requests.some((r) => r.path === '/v2/eating/records' && r.query.record_on));
}

// ==========================================
group('6. 同步容错：体重失败但饮食成功')
// ==========================================
{
  handler = ({ path }) => {
    if (path === '/v2/weight/records') {
      return { payload: { code: 1050, message: '无效的 API Key' } };
    }
    return { payload: { code: 0, message: 'ok', data: { daily: null } } };
  };
  let err = null;
  try {
    await B.syncFromBoohee(CFG, { startDate: '2026-05-01', endDate: '2026-05-01' }, BASE_OPT);
  } catch (e) {
    err = e;
  }
  ok('鉴权错误直接抛出，不静默', err !== null);
  eq('错误码保持 1050', err?.code, 1050);
}

// ==========================================
group('7. 日期工具动态派生')
// ==========================================
{
  const t = B.todayKey();
  ok('todayKey 形如 YYYY-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(t), t);
  const d = new Date();
  const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  eq('todayKey 与本地日期一致', t, expected);
  const ago = B.daysAgoKey(30);
  ok('daysAgoKey 早于今天', ago < t, `${ago} vs ${t}`);
  eq('fromDateKey 往返一致', B.toDateKey(B.fromDateKey('2026-07-15')), '2026-07-15');
  eq('非法日期键返回 null', B.fromDateKey('not-a-date'), null);
}

// ==========================================
group('8. 餐别映射')
// ==========================================
{
  eq('餐别 1', B.booheeMealLabel(1), '早餐');
  eq('餐别 2', B.booheeMealLabel(2), '午餐');
  eq('餐别 3', B.booheeMealLabel(3), '晚餐');
  eq('餐别 8', B.booheeMealLabel(8), '晚上加餐');
  eq('未知餐别', B.booheeMealLabel(99), '餐别99');
  eq('未定义餐别', B.booheeMealLabel(undefined), '未分类');
  eq('餐别枚举长度', B.BOOHEE_MEAL_TYPES.length, 7);
}

// ==========================================
server.close();
// ==========================================
console.log('\n' + '='.repeat(56));
console.log(`通过 ${pass} / 失败 ${fail} / 合计 ${pass + fail}`);
if (failures.length) {
  console.log('\n失败明细：');
  for (const f of failures) console.log('  ✗ ' + f);
}
console.log('='.repeat(56));
process.exit(fail ? 1 : 0);
