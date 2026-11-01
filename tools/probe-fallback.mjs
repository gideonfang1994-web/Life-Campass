/**
 * 探针：打印 server.ts 中每个端点的「无 AI 分支」源码形态，
 * 用于确定离线层应如何逐字复用（而不是手抄，避免文案漂移）。
 * 用法：node tools/probe-fallback.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');

/** 从 start 处开始扫描配对的括号，返回 [start, end) 区间 */
function balanced(str, start, open = '{', close = '}') {
  let depth = 0;
  for (let i = start; i < str.length; i++) {
    const ch = str[i];
    if (ch === '`') {
      // 跳过模板字符串
      i++;
      while (i < str.length && src[i] !== '`') {
        if (src[i] === '\\') i++;
        i++;
      }
      continue;
    }
    if (ch === "'" || ch === '"') {
      const q = ch;
      i++;
      while (i < str.length && src[i] !== q) {
        if (src[i] === '\\') i++;
        i++;
      }
      continue;
    }
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

const ENDPOINTS = [
  '/api/coach/chat',
  '/api/coach/analyze-project',
  '/api/coach/review',
  '/api/coach/smart-breakdown',
  '/api/coach/course-correction',
  '/api/coach/parse-reflection',
  '/api/coach/musk-breakdown',
  '/api/coach/musk-supervision',
  '/api/coach/goal-consultation-chat',
  '/api/coach/goal-optimize-arrangement',
  '/api/ai/autofill',
];

for (const ep of ENDPOINTS) {
  const postIdx = src.indexOf(`app.post('${ep}'`);
  if (postIdx === -1) {
    console.log(`\n===== ${ep} =====\n  (未找到端点)`);
    continue;
  }
  const aiIdx = src.indexOf('if (!ai)', postIdx);
  if (aiIdx === -1) {
    console.log(`\n===== ${ep} =====\n  (无 if (!ai) 分支)`);
    continue;
  }
  const braceStart = src.indexOf('{', aiIdx);
  const braceEnd = balanced(src, braceStart);
  const block = src.slice(aiIdx, braceEnd);

  // 判断形态
  const shape = block.includes('sendFallback()')
    ? 'CALL sendFallback'
    : block.includes('getFallback()')
    ? 'CALL getFallback'
    : 'DIRECT res.json';

  console.log(`\n===== ${ep} ===== [${shape}] len=${block.length}`);
  console.log(block.length > 900 ? block.slice(0, 900) + '\n  …(截断)' : block);
}
