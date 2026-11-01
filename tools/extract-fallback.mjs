/**
 * 从 server.ts 抽取「无 AI 时的降级输出」，供单文件 HTML 的离线层逐字复用。
 *
 * 背景：
 *   单文件版要离线可用，就必须把后端在没有 GEMINI_API_KEY 时的输出搬到浏览器。
 *   如果手抄文案，一定会和 server.ts 漂移；本模块改为在构建期直接抽取源码，
 *   保证「一比一复刻」且 server.ts 改动后离线层自动同步。
 *
 * 抽取规则：
 *   - 直接形态：if (!ai) { return res.json({ ... }); }  → 转成 JS 对象字面量
 *   - sendFallback 形态：提取其内部的 fallbackText 模板
 *   - getFallback 形态：提取整个 getFallback 函数体
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * 从源码中扫描配对的括号/花括号，跳过字符串与模板字面量。
 * @param {string} src 源码
 * @param {number} start 起始位置（指向开括号）
 * @param {string} open 开括号
 * @param {string} close 闭括号
 * @returns {number} 闭括号之后的位置；找不到返回 -1
 */
function balancedEnd(src, start, open, close) {
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (ch === '`') {
      i++;
      while (i < src.length && src[i] !== '`') {
        if (src[i] === '\\') i++;
        i++;
      }
      continue;
    }
    if (ch === "'" || ch === '"') {
      const q = ch;
      i++;
      while (i < src.length && src[i] !== q) {
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

/** 定位 `app.post('<ep>'` 的 handler 体起点 */
function endpointBody(src, ep) {
  const idx = src.indexOf(`app.post('${ep}'`);
  if (idx === -1) throw new Error(`server.ts 中找不到端点 ${ep}`);
  const open = src.indexOf('{', src.indexOf('=>', idx));
  const end = balancedEnd(src, open, '{', '}');
  if (end === -1) throw new Error(`无法解析端点 ${ep} 的 handler 体`);
  return src.slice(open + 1, end - 1);
}

/** 在 handler 体内定位 `if (!ai) { ... }` 分支 */
function noAiBranch(body) {
  const idx = body.indexOf('if (!ai)');
  if (idx === -1) return null;
  const open = body.indexOf('{', idx);
  const end = balancedEnd(body, open, '{', '}');
  return body.slice(idx, end);
}

/**
 * 把 server.ts 里 `return res.json(X)` 的 X 抽出来，变成可注入的 JS 表达式源码。
 * 同时把 TS 专有语法剥离（离线层是纯 JS）。
 */
function extractJsonPayload(branch) {
  const m = branch.match(/return\s+res\.json\(/);
  if (!m) return null;
  const open = branch.indexOf('(', m.index);
  const end = balancedEnd(branch, open, '(', ')');
  const inner = branch.slice(open + 1, end - 1).trim();
  return inner;
}

/**
 * 抽取 sendFallback 内部的 fallbackText 模板字面量。
 * 返回**完整字面量源码**（含首尾反引号），以便求值器直接当表达式执行，
 * 内部 ${...} 插值才能在请求体作用域内正确解析。
 */
function extractFallbackText(body) {
  const idx = body.indexOf('const sendFallback');
  if (idx === -1) return null;
  const fnOpen = body.indexOf('{', idx);
  const fnEnd = balancedEnd(body, fnOpen, '{', '}');
  const fn = body.slice(fnOpen, fnEnd);
  const tIdx = fn.indexOf('fallbackText');
  if (tIdx === -1) return null;
  const eq = fn.indexOf('=', tIdx);
  // 等号与字面量之间可能有空格：`const fallbackText = \`...\``
  let litStart = eq + 1;
  while (litStart < fn.length && /\s/.test(fn[litStart])) litStart++;
  const q = fn[litStart];
  if (q !== '`' && q !== "'" && q !== '"') return null;
  let i = litStart + 1;
  while (i < fn.length) {
    if (fn[i] === '\\') { i += 2; continue; }
    if (fn[i] === q) break;
    i++;
  }
  // 返回含引号的完整字面量源码
  return fn.slice(litStart, i + 1);
}

/** 抽取 getFallback 函数体（返回对象字面量的那个分支） */
function extractGetFallbackFn(body) {
  const idx = body.indexOf('const getFallback');
  if (idx === -1) return null;
  const fnOpen = body.indexOf('{', idx);
  const fnEnd = balancedEnd(body, fnOpen, '{', '}');
  return body.slice(fnOpen + 1, fnEnd - 1);
}

/** 剥离 TS 类型标注，转成纯 JS 可执行源码 */
function stripTypeScript(code) {
  return (
    code
      // catch (err: any) -> catch (err)
      .replace(/catch\s*\(\s*([A-Za-z_$][\w$]*)\s*:\s*any\s*\)/g, 'catch ($1)')
      // catch (e: unknown) 等
      .replace(/catch\s*\(\s*([A-Za-z_$][\w$]*)\s*:\s*[A-Za-z_$][\w$<>,\[\]\s.]*\s*\)/g, 'catch ($1)')
      // 变量/参数标注: const x: Foo =  ->  const x =
      .replace(/(\b(?:const|let|var)\s+[A-Za-z_$][\w$]*)\s*:\s*[A-Za-z_$][\w$<>,\[\]\s.]*\s*=/g, '$1 =')
      // 函数参数标注
      .replace(/(\bfunction\s+[A-Za-z_$][\w$]*\s*\(\s*[A-Za-z_$][\w$]*)\s*:\s*[A-Za-z_$][\w$<>,\[\]\s.]*(\s*[,)])/g, '$1$2')
      // as SomeType
      .replace(/\s+as\s+[A-Za-z_$][\w$<>,\[\]\s.]*(?=\s*[,;)\]}]|$)/g, '')
      // 非空断言 !
      .replace(/!\./g, '.')
      // interface/type 声明块整体移除（离线层用不到）
      .replace(/^\s*(?:export\s+)?(?:interface|type)\s+[A-Za-z_$][\w$]*[\s\S]*?\n\}\s*$/gm, '')
  );
}

/**
 * 把源码片段安全地序列化为 JS 字符串字面量。
 * 关键：源文件是 CRLF，模板字面量里的换行是真实 \r\n。
 * JSON.stringify 会把它们转义成 \r \n 两个字符序列 —— 这正是我们想要的，
 * 因为注入后的 JS 里该字面量仍是**单行合法**的；
 * 而运行期 JSON.parse 还原后得到真实换行，交给 eval 在模板字面量内部求值。
 */
function jsonStr(code) {
  return JSON.stringify(code);
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

/**
 * 生成离线层的 fallback 数据表（纯 JS，可直接注入浏览器）。
 * @param {string} serverSrc server.ts 源码
 * @returns {{ table: string, notes: string[] }}
 */
export function extractFallbackTable(serverSrc) {
  const notes = [];
  const entries = [];

  for (const ep of ENDPOINTS) {
    const body = endpointBody(serverSrc, ep);
    const branch = noAiBranch(body);
    if (!branch) {
      notes.push(`⚠️  ${ep} 未找到 if (!ai) 分支，需人工处理`);
      continue;
    }

    // 形态 A：sendFallback（两个聊天端点）
    if (branch.includes('sendFallback()')) {
      const tpl = extractFallbackText(body);
      if (tpl) {
        entries.push({ ep, kind: 'sse', tpl: stripTypeScript(tpl) });
        notes.push(`✅ ${ep} → SSE 模板字面量（${tpl.length} 字符）`);
        continue;
      }
    }

    // 形态 B：getFallback（autofill）
    if (branch.includes('getFallback()')) {
      const fn = extractGetFallbackFn(body);
      if (fn) {
        entries.push({ ep, kind: 'fn', fn: stripTypeScript(fn) });
        notes.push(`✅ ${ep} → getFallback 函数体（${fn.length} 字符）`);
        continue;
      }
    }

    // 形态 C：直接 res.json({...})
    const payload = extractJsonPayload(branch);
    if (payload) {
      entries.push({ ep, kind: 'json', payload: stripTypeScript(payload) });
      notes.push(`✅ ${ep} → JSON 字面量（${payload.length} 字符）`);
      continue;
    }

    notes.push(`⚠️  ${ep} 形态无法识别，需人工处理`);
  }

  const table = entries
    .map((e) => {
      if (e.kind === 'sse') {
        // tpl 是完整的模板字面量源码（含反引号）。
        // 存为**字符串**保持惰性：goal-consultation-chat 的模板含 ${goal?.title}，
        // 若在表定义时求值会因顶层无 goal 变量而 ReferenceError，导致整个离线层失效。
        return `  ${JSON.stringify(e.ep)}: { kind: 'sse', src: ${jsonStr(e.tpl)} }`;
      }
      if (e.kind === 'fn') {
        // getFallback 函数体：整段源码存字符串，求值时编译执行
        return `  ${JSON.stringify(e.ep)}: { kind: 'fn', src: ${jsonStr(e.fn)} }`;
      }
      // json 形态：payload 是对象字面量源码，里面含 ${...} 插值，
      // 必须存成字符串、求值时再编译，保证惰性。
      return `  ${JSON.stringify(e.ep)}: { kind: 'json', src: ${jsonStr(e.payload)} }`;
    })
    .join(',\n');

  return { table, notes };
}

function indent(code, n) {
  const pad = ' '.repeat(n);
  return code
    .split('\n')
    .map((l) => (l.trim() ? pad + l : l))
    .join('\n');
}

export { ENDPOINTS, stripTypeScript, balancedEnd, endpointBody, noAiBranch, extractFallbackText, extractGetFallbackFn, extractJsonPayload };

// CLI 用法：node tools/extract-fallback.mjs
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const root = path.resolve(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
  const { table, notes } = extractFallbackTable(src);
  console.log(notes.join('\n'));
  console.log('\n----- 生成的表 -----\n');
  console.log(table);
}
