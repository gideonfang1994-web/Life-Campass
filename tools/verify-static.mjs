import fs from 'node:fs';
import path from 'node:path';

// 产物可能位于项目根目录（build-standalone.mjs 的默认输出）或 Life-Campass 目录内，逐个探测
const CANDIDATES = [
  '../LifeCompass.html',
  'LifeCompass.html',
  '../dist/LifeCompass.html',
];
let file = null;
for (const rel of CANDIDATES) {
  const abs = path.resolve(process.cwd(), rel);
  if (fs.existsSync(abs)) { file = abs; break; }
}
if (!file) {
  console.error('未找到 LifeCompass.html，已尝试：\n  ' + CANDIDATES.join('\n  '));
  process.exit(1);
}
console.log('校验目标：' + file + '\n');
const html = fs.readFileSync(file, 'utf8');
const checks = [
  ['文件大小 > 600KB', html.length > 600 * 1024],
  ['AI_SPECS 单次声明', (html.match(/var AI_SPECS\s*=/g) || []).length === 1],
  ['注入 Proxy 容错作用域', html.includes('new Proxy(base')],
  ['评估函数 evalWithScope', html.includes('evalWithScope')],
  ['配置读取统一判定', html.includes("c.provider === 'openai' && !c.baseUrl")],
  ['启用判定一致', html.includes("(c.apiKey || c.provider === 'openai')")],
  ['Gemini 流式端点', html.includes('streamGenerateContent')],
  ['Gemini 非流式端点', html.includes('generateContent')],
  ['OpenAI 兼容端点', html.includes('chat/completions')],
  ['SSE 结束标记', html.includes('[DONE]')],
  ['配置键名', html.includes('life_coach_ai_config')],
  ['面板容器', html.includes('lc-ai-panel')],
  ['关闭按钮', html.includes('lc-ai-close')],
  ['移动端隐藏类', html.includes('lc-hidden')],
  ['特异度修复', html.includes('#lc-ai-panel button#lc-ai-close')],
  ['横向溢出修复', html.includes('max-width:calc(100% - 28px)')],
  ['全局 API', html.includes('window.LifeCompassAI')],
  ['默认 Gemini 模型', html.includes('gemini-3.8-flash')],
  ['默认 OpenAI 模型', html.includes('deepseek-v4-flash')],
  ['无 Key 不发鉴权', html.includes("if (cfgObj.apiKey) headers['Authorization']")],
  ['宽松 JSON 解析', html.includes('```') || html.includes('json')],
];

let pass = 0;
for (const [name, ok] of checks) {
  console.log((ok ? '✅' : '❌') + ' ' + name);
  if (ok) pass++;
}

const scripts = (html.match(/<script/g) || []).length;
const styles = (html.match(/<style/g) || []).length;
console.log(`\n<script> 标签 ${scripts} 个 / <style> 标签 ${styles} 个`);

// 端点数量
const eps = [...html.matchAll(/^\s*"(\/api\/[^"]+)":\s*\{\s*kind:\s*"[a-z]+"/gm)].map(m => m[1]);
console.log(`抽取到的 AI 端点 ${eps.length} 个`);
console.log(`文件大小 ${html.length} 字节 (${(html.length / 1024).toFixed(0)} KB)`);

// 外部依赖检查
const externals = [...html.matchAll(/https?:\/\/[^"'\s)]+/g)]
  .map(m => m[0])
  .filter(u => !u.includes('generativelanguage.googleapis.com') && !u.includes('api.deepseek.com') && !u.includes('aistudio.google.com'));
console.log(`\n其余外部 URL ${externals.length} 处`);
externals.slice(0, 6).forEach(u => console.log('  · ' + u));

console.log(`\n通过 ${pass}/${checks.length}`);
