/**
 * 从 server.ts 抽取「真实 AI 调用所需的全部要素」，供单文件 HTML 在浏览器内直连 LLM 时逐字复用。
 *
 * 为什么也要抽 prompt：
 *   如果浏览器端手抄一份 prompt，它会和 server.ts 慢慢漂移，AI 输出质量就变了，
 *   "一比一复刻"立刻失效。所以 prompt 模板、systemInstruction、temperature、
 *   是否 JSON 模式、响应包装字段，全部在构建期从源码读出来。
 *
 * 抽取出的每条 spec 形态：
 *   {
 *     kind: 'chat' | 'single',   // chat: prompt 是 systemInstruction，内容来自 body.messages
 *     promptSrc: '`...`',        // 模板字面量源码（含反引号），运行期在请求体作用域内求值
 *     systemSrc: '"..."' | null, // systemInstruction 字面量源码
 *     temperature: 0.6,
 *     json: true | false,        // responseMimeType === 'application/json'
 *     sse: true | false,         // 使用 generateContentStream，走流式
 *     shape: 'diagnosis' | 'raw' // 非流式时的响应包装字段名（raw 表示直接返回解析后的对象）
 *   }
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  ENDPOINTS,
  endpointBody,
  balancedEnd,
  stripTypeScript,
} from './extract-fallback.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * 从 start（引号位置）读取一个完整字符串/模板字面量源码。
 * 模板字面量里的 ${...} 会被整体跳过（含其内部的引号与嵌套括号），
 * 避免把插值里的 `'` 误当成字面量结束。
 * @returns {{code: string, end: number} | null}
 */
function readLiteral(src, start) {
  const q = src[start];
  if (q !== '`' && q !== "'" && q !== '"') return null;
  let i = start + 1;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (q === '`' && ch === '$' && src[i + 1] === '{') {
      let depth = 1;
      i += 2;
      while (i < src.length && depth > 0) {
        const c = src[i];
        if (c === '\\') {
          i += 2;
          continue;
        }
        if (c === '`' || c === "'" || c === '"') {
          const inner = readLiteral(src, i);
          if (inner) {
            i = inner.end;
            continue;
          }
        }
        if (c === '{') depth++;
        else if (c === '}') depth--;
        i++;
      }
      continue;
    }
    if (ch === q) return { code: src.slice(start, i + 1), end: i + 1 };
    i++;
  }
  return null;
}

/** 定位 `const <name> = <字面量>` 并返回字面量源码（含引号） */
function extractAssignedLiteral(code, name) {
  const re = new RegExp('(?:const|let|var)\\s+' + name + '\\s*=\\s*');
  const m = re.exec(code);
  if (!m) return null;
  const lit = readLiteral(code, m.index + m[0].length);
  return lit ? lit.code : null;
}

/** 定位 `const <name>: T = { ... }` 并返回对象字面量源码（含花括号） */
function extractAssignedObject(code, name) {
  const re = new RegExp('(?:const|let|var)\\s+' + name + '\\b[^=]*=\\s*\\{');
  const m = re.exec(code);
  if (!m) return null;
  const open = m.index + m[0].length - 1;
  const end = balancedEnd(code, open, '{', '}');
  if (end === -1) return null;
  return code.slice(open, end);
}

/**
 * 抽取「prompt 由 if/else 分支赋值的代码块」。
 *
 * 场景：/api/ai/autofill 里是 `let prompt = ''; if (type === 'goal') { prompt = `...` } else if ...`，
 * 单靠 extractAssignedLiteral 只能拿到空串。这里把整段赋值逻辑抽出来，
 * 运行期在请求体作用域内执行，末尾补 `return prompt`，从而拿到真正该用的那条模板。
 */
function extractPromptBlock(body, genIdx) {
  const m = /(?:let|var)\s+prompt\b[^=]*=\s*/.exec(body);
  if (!m) return null;
  const start = m.index;
  if (genIdx <= start) return null;
  const block = body.slice(start, genIdx).trim();
  // 必须确实是分支赋值结构，否则不认
  if (!/if\s*\(/.test(block) || !/prompt\s*=/.test(block)) return null;
  return stripTypeScript(block) + '\nreturn prompt;';
}

/** 抽取 `systemInstruction: '...'` 的字面量源码 */
function extractSystemInstruction(body) {
  const m = /systemInstruction\s*:\s*/.exec(body);
  if (!m) return null;
  const lit = readLiteral(body, m.index + m[0].length);
  return lit ? lit.code : null;
}

/**
 * 生成浏览器端 AI spec 表。
 * @param {string} serverSrc server.ts 源码
 * @returns {{ table: string, personas: string | null, notes: string[] }}
 */
export function extractAiSpecs(serverSrc) {
  const notes = [];
  const entries = [];

  const personaObj = extractAssignedObject(serverSrc, 'PERSONA_PROMPTS');
  if (personaObj) {
    notes.push(`✅ PERSONA_PROMPTS 人格 prompt（${personaObj.length} 字符）`);
  } else {
    notes.push('⚠️  未找到 PERSONA_PROMPTS，聊天人格将退化为空 system');
  }

  for (const ep of ENDPOINTS) {
    const body = endpointBody(serverSrc, ep);

    // 注意：generateContent 是 generateContentStream 的子串，必须先判流式
    const streamIdx = body.indexOf('ai.models.generateContentStream');
    const singleIdx = body.indexOf('ai.models.generateContent(');
    const isStream = streamIdx !== -1;
    const genIdx = isStream ? streamIdx : singleIdx;

    if (genIdx === -1) {
      notes.push(`⚠️  ${ep} 未找到 ai.models.generateContent 调用，跳过`);
      continue;
    }

    // 聊天类端点的 prompt 就是 systemInstruction；其余端点是 user 内容
    const isChat = /const\s+systemPrompt\s*=/.test(body);
    let promptSrc = isChat
      ? extractAssignedLiteral(body, 'systemPrompt')
      : extractAssignedLiteral(body, 'prompt');
    let promptMode = 'expr';

    // 分支赋值形态（/api/ai/autofill）：抽整段 if/else 逻辑，运行期执行
    const promptBlock = isChat ? null : extractPromptBlock(body, genIdx);
    if (promptBlock) {
      promptSrc = promptBlock;
      promptMode = 'block';
    }

    if (!promptSrc) {
      notes.push(`⚠️  ${ep} 未找到 ${isChat ? 'systemPrompt' : 'prompt'} 模板，跳过`);
      continue;
    }

    const systemSrc = isChat ? null : extractSystemInstruction(body);

    const tempMatch = /temperature\s*:\s*([\d.]+)/.exec(body);
    const temperature = tempMatch ? Number(tempMatch[1]) : null;

    const json = /responseMimeType\s*:\s*['"]application\/json['"]/.test(body);

    // 响应形态：在模型调用之后找第一个 res.json(...)
    let shape = null;
    if (!isStream) {
      const rj = body.indexOf('res.json(', genIdx);
      if (rj !== -1) {
        const open = body.indexOf('(', rj);
        const end = balancedEnd(body, open, '(', ')');
        const arg = body.slice(open + 1, end - 1).trim();
        if (arg.startsWith('{')) {
          const km = /[{,]\s*([A-Za-z_$][\w$]*)\s*:/.exec(arg);
          shape = km ? km[1] : 'raw';
        } else {
          shape = 'raw';
        }
      }
    }

    // 失败行为：server.ts 里两种并存，必须复刻
    //   res.status(500)        -> 前端收到 !ok 并抛错
    //   res.json(getFallback())-> 静默回退到降级文案
    const catchIdx = body.indexOf('catch (err');
    let failMode = 'fallback';
    if (catchIdx !== -1) {
      const cOpen = body.indexOf('{', catchIdx);
      const cEnd = balancedEnd(body, cOpen, '{', '}');
      const catchBlock = cEnd === -1 ? body.slice(catchIdx) : body.slice(catchIdx, cEnd);
      if (/status\(500\)/.test(catchBlock)) failMode = 'error';
    }

    entries.push({
      ep,
      kind: isChat ? 'chat' : 'single',
      promptSrc: promptMode === 'block' ? promptSrc : stripTypeScript(promptSrc),
      promptMode,
      systemSrc: systemSrc ? stripTypeScript(systemSrc) : null,
      temperature,
      json,
      sse: isStream,
      shape,
      failMode,
    });

    notes.push(
      `✅ ${ep} → ${isChat ? 'systemPrompt' : 'prompt'} ${promptSrc.length} 字符` +
        `(${promptMode === 'block' ? '分支赋值' : '单模板'})` +
        ` / ${isStream ? 'SSE' : json ? 'JSON' : '文本'}` +
        ` / temp ${temperature ?? '默认'}` +
        ` / 包装 ${shape ?? '-'}` +
        ` / 失败 ${failMode === 'error' ? '500' : '回退'}`
    );
  }

  const table = entries
    .map((e) => {
      const parts = [
        `kind: ${JSON.stringify(e.kind)}`,
        `promptMode: ${JSON.stringify(e.promptMode)}`,
        `promptSrc: ${JSON.stringify(e.promptSrc)}`,
        `systemSrc: ${JSON.stringify(e.systemSrc)}`,
        `temperature: ${e.temperature === null ? 'null' : e.temperature}`,
        `json: ${e.json}`,
        `sse: ${e.sse}`,
        `shape: ${JSON.stringify(e.shape)}`,
        `failMode: ${JSON.stringify(e.failMode)}`,
      ];
      return `    ${JSON.stringify(e.ep)}: { ${parts.join(', ')} }`;
    })
    .join(',\n');

  return {
    table,
    personas: personaObj ? stripTypeScript(personaObj) : null,
    notes,
  };
}

export { readLiteral, extractAssignedLiteral, extractAssignedObject };

// CLI：node tools/extract-ai-spec.mjs
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
) {
  const root = path.resolve(__dirname, '..');
  const src = fs.readFileSync(path.join(root, 'server.ts'), 'utf8');
  const { table, notes } = extractAiSpecs(src);
  console.log(notes.join('\n'));
  console.log('\n----- AI_SPECS -----\n');
  console.log(table);
}
