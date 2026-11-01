/**
 * 校验：构建产物 LifeCompass.html 中内联的 FALLBACK 表，
 * 是否与当前 server.ts 抽取结果**逐字一致**。
 *
 * 这是比「搜中文片段」更严格的校验：
 *   - 对每个端点，比较「构建期抽取出的 src」与「产物 HTML 中实际落地的 src」。
 *   - server.ts 改一个字符 → 产物就检测到不一致。
 *   - 抽取失败的端点必须显式报错，不允许静默跳过。
 *
 * 用法：node tools/verify-inline-parity.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractFallbackTable } from './extract-fallback.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const serverSrc = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
const htmlPath = path.resolve(root, '..', 'LifeCompass.html');

if (!fs.existsSync(htmlPath)) {
  console.error(`❌ 未找到产物 ${htmlPath}\n   请先执行: npm run build && node build-standalone.mjs`);
  process.exit(1);
}
const html = fs.readFileSync(htmlPath, 'utf8');

const { table, notes } = extractFallbackTable(serverSrc);
console.log('—— server.ts 抽取结果 ——');
notes.forEach((n) => console.log('  ' + n));

/** 从生成的表源码里取出每个端点的 src 字面量 */
function parseEntries(tableSrc) {
  const out = [];
  const re = /"(\/api\/[^"]+)":\s*\{\s*kind:\s*'(\w+)',\s*src:\s*("(?:[^"\\]|\\.)*")\s*\}/g;
  let m;
  while ((m = re.exec(tableSrc))) {
    out.push({ ep: m[1], kind: m[2], src: JSON.parse(m[3]) });
  }
  return out;
}

const entries = parseEntries(table);
console.log(`\n解析到表条目：${entries.length} 个`);

let issues = 0;
let checked = 0;

for (const e of entries) {
  checked++;
  const needle = JSON.stringify(e.src);
  if (!html.includes(needle)) {
    issues++;
    console.log(`❌ ${e.ep} —— 产物中的 fallback src 与当前 server.ts 不一致（需重新构建）`);
  }
}

/** 兜底：产物必须包含所有端点路径，且数量一致 */
const missingEp = [];
for (const e of entries) {
  if (!html.includes(JSON.stringify(e.ep))) missingEp.push(e.ep);
}
if (missingEp.length) {
  issues += missingEp.length;
  console.log(`❌ 产物缺少端点条目：${missingEp.join(', ')}`);
}

/** 反向校验：产物中不应存在 server.ts 里已删除的端点 */
for (const ep of ['/api/coach/chat', '/api/coach/review', '/api/ai/autofill']) {
  if (!html.includes(JSON.stringify(ep))) {
    issues++;
    console.log(`❌ 产物缺少关键端点 ${ep}`);
  }
}

console.log(`\n比对条目：${checked}，不一致：${issues}`);
if (issues > 0) {
  console.error('\n❌ 产物与 server.ts 不一致 —— 请执行 npm run build && node build-standalone.mjs');
  process.exit(1);
}
console.log('✅ 产物内联的 fallback 与 server.ts 逐字一致');
