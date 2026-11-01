/**
 * 校对工具：验证「单文件离线层」与 server.ts 逐字一致。
 *
 * 用法：node tools/audit-fallback.mjs
 *
 * ┌─ 重要背景（为什么不能直接搜源码字符串）──────────────────────────┐
 * │ build-standalone.mjs 里写的是 `var FALLBACK = {${table}}`，     │
 * │ table 是构建期从 server.ts 抽取后拼进去的。                      │
 * │ 所以在 build-standalone.mjs 源码里**搜不到**任何 fallback 文案， │
 * │ 旧版校对工具因此对所有端点报「文案逐字一致」——那是巧合，不是校验。│
 * │ 真正的校验对象是**构建产物 LifeCompass.html**。                  │
 * └──────────────────────────────────────────────────────────────────┘
 *
 * 本工具做三件事：
 *   1. 重新从 server.ts 抽取 fallback 表（复用 extract-fallback.mjs 的扫描器）；
 *   2. 逐条比对「抽取结果」与「产物 HTML 中实际落地的 src」是否逐字相同；
 *   3. 抽取失败必须显式报错 + 非零退出码 —— 旧版在抽取失败时返回 null，
 *      空字面量数组会被当成「完全一致」，属于静默假阳性。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ENDPOINTS, endpointBody, noAiBranch, stripTypeScript } from './extract-fallback.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const serverSrc = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
const htmlPath = path.resolve(root, '..', 'LifeCompass.html');

let totalIssues = 0;
let hardFailures = 0;

console.log('【1】server.ts → fallback 分支抽取\n');

/** 校验每个端点的 if (!ai) 分支都能被稳定抽取 */
for (const ep of ENDPOINTS) {
  let body;
  try {
    body = endpointBody(serverSrc, ep);
  } catch (e) {
    hardFailures++;
    totalIssues++;
    console.log(`❌ ${ep} —— 抽取失败：${e.message}`);
    continue;
  }

  const branch = noAiBranch(body);
  if (!branch) {
    hardFailures++;
    totalIssues++;
    console.log(`❌ ${ep} —— 未找到 if (!ai) 分支（server.ts 结构可能已变）`);
    continue;
  }

  const stripped = stripTypeScript(branch);

  // 两种合法形态：
  //   A. 分支内直接内联文案（res.json({...})）
  //   B. 分支只调用 sendFallback() / getFallback()，文案在函数体里
  // 形态 B 的中文在 handler 体而非 if (!ai) 分支内，需另行校验。
  const chinese = (stripped.match(/[\u4e00-\u9fa5]/g) || []).length;
  const isDelegate = /sendFallback\(\)|getFallback\(\)/.test(stripped);

  if (chinese === 0 && !isDelegate) {
    hardFailures++;
    totalIssues++;
    console.log(`❌ ${ep} —— 分支内既无中文文案也无 sendFallback/getFallback 调用，判定为抽取异常（不放过）`);
    continue;
  }
  if (isDelegate) {
    console.log(`✅ ${ep} —— 分支抽取正常（委托形态，文案在 helper 函数体内）`);
  } else {
    console.log(`✅ ${ep} —— 分支抽取正常（${stripped.length} 字符，${chinese} 个汉字）`);
  }
}

console.log('\n【2】产物 LifeCompass.html 与 server.ts 逐字比对\n');

if (!fs.existsSync(htmlPath)) {
  hardFailures++;
  totalIssues++;
  console.log(`❌ 未找到产物：${htmlPath}`);
  console.log('   请先执行: npm run build && node build-standalone.mjs');
} else {
  const html = fs.readFileSync(htmlPath, 'utf8');
  // 与 verify-inline-parity.mjs 共用同一套比对逻辑
  const { extractFallbackTable } = await import('./extract-fallback.mjs');
  const { table } = extractFallbackTable(serverSrc);

  const re = /"(\/api\/[^"]+)":\s*\{\s*kind:\s*'(\w+)',\s*src:\s*("(?:[^"\\]|\\.)*")\s*\}/g;
  let m;
  let checked = 0;
  while ((m = re.exec(table))) {
    checked++;
    const ep = m[1];
    const src = JSON.parse(m[3]);
    if (!html.includes(JSON.stringify(src))) {
      totalIssues++;
      console.log(`❌ ${ep} —— 产物中的 fallback 与当前 server.ts 不一致，请重新构建`);
    }
  }
  console.log(`✅ 比对 ${checked} 个端点条目`);

  // 运行时契约探针：确认离线层确实带上了 400 校验与 SSE 能力
  const probes = [
    { name: 'fetch 拦截器', needle: 'window.fetch = function' },
    { name: '入参校验 chat', needle: 'messages array is required' },
    { name: '入参校验 project', needle: 'project data is required' },
    { name: '入参校验 goal', needle: 'goal object is required' },
    { name: '入参校验 rawText', needle: 'rawText is required' },
    { name: '入参校验 autofill', needle: 'autofill type is required' },
    { name: 'SSE 流类型', needle: 'text/event-stream' },
    { name: 'SSE 结束标记', needle: 'data: [DONE]' },
    { name: '作用域求值器', needle: 'evalWithScope' },
    { name: '离线层标记', needle: '[OfflineAI]' }
  ];
  const absent = probes.filter((p) => !html.includes(p.needle)).map((p) => p.name);
  if (absent.length) {
    totalIssues += absent.length;
    console.log(`❌ 产物缺少运行时能力：${absent.join(' / ')}`);
  } else {
    console.log(`✅ ${probes.length} 项运行时能力探针全部命中`);
  }
}

console.log(`\n合计差异：${totalIssues}（硬失败 ${hardFailures}）`);
if (totalIssues > 0) {
  console.error('\n❌ 校对未通过');
  process.exit(1);
}
console.log('\n✅ 校对通过：离线层与 server.ts 逐字一致');
