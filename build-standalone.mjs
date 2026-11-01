/**
 * 单文件 HTML 构建器
 *
 * 流程：
 *   1. vite build -> dist/（单个 ES module bundle + 单个 CSS）
 *   2. 读取 dist/index.html，把 JS/CSS 全部内联进 <script type="module"> / <style>
 *   3. 注入 AI 层（拦截 window.fetch 的 /api/* 请求）
 *      - 未配置 Key：使用 server.ts 的降级文案（离线演示，与官方逐字一致）
 *      - 已配置 Key：浏览器直连真实大模型（Gemini 原生 / OpenAI 兼容）
 *      prompt、temperature、JSON 模式、失败行为全部在构建期从 server.ts 抽取，避免漂移
 *   4. 输出 LifeCompass.html（可双击直接打开）
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildOfflineLayerScript } from './tools/ai-layer.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, 'dist');
const outFile = path.resolve(__dirname, '..', 'LifeCompass.html');

function readDist() {
  const html = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
  const jsRef = html.match(/<script[^>]*src="\/assets\/([^"]+\.js)"[^>]*><\/script>/);
  const cssRef = html.match(/<link[^>]*href="\/assets\/([^"]+\.css)"[^>]*>/);
  if (!jsRef || !cssRef) throw new Error('dist/index.html 结构不符合预期，未找到 JS/CSS 引用');

  const js = fs.readFileSync(path.join(distDir, 'assets', jsRef[1]), 'utf8');
  const css = fs.readFileSync(path.join(distDir, 'assets', cssRef[1]), 'utf8');
  return { html, js, css };
}

/**
 * 单文件模式下需要做的路径适配：
 *   - 源码里 Header 的「单文件HTML」按钮指向 /life_coach.html（仓库自带的独立静态页）。
 *     在 file:// 协议下以 / 开头会被解析成磁盘根目录，导致 404。
 *     这里改写为同目录相对路径 life_coach.html，与本 HTML 放在同一文件夹即可正常打开。
 *   - Vite 产物的 /assets/ 引用已被整体内联，无需处理。
 */
function adaptPathsForFileProtocol(js) {
  const before = js;
  const jsOut = js
    .replace(/href:`\/life_coach\.html`/g, 'href:`life_coach.html`')
    .replace(/href:"\/life_coach\.html"/g, 'href:"life_coach.html"');
  const changed = before !== jsOut;
  return { js: jsOut, changed };
}

function build() {
  const { html, js: rawJs, css } = readDist();
  const serverSrc = fs.readFileSync(path.resolve(__dirname, 'server.ts'), 'utf8');

  // 保留原 index.html 的 head 元信息，替换 body 内容
  const headMatch = html.match(/<head>([\s\S]*?)<\/head>/);
  const head = headMatch ? headMatch[1] : '';

  const titleMatch = head.match(/<title>([\s\S]*?)<\/title>/);
  const title = titleMatch ? titleMatch[1] : 'LifeCompass · 人生教练';

  // 移除 vite 注入的 script/link 标签，保留 meta
  const cleanHead = head
    .replace(/<script[^>]*src="\/assets\/[^"]*\.js"[^>]*><\/script>/g, '')
    .replace(/<link[^>]*href="\/assets\/[^"]*\.css"[^>]*>/g, '')
    .replace('<html lang="en">', '<html lang="zh-CN">');

  const { js, changed } = adaptPathsForFileProtocol(rawJs);
  if (changed) console.log('🔧 已将 /life_coach.html 重写为相对路径 life_coach.html');

  console.log('📦 从 server.ts 抽取运行数据：');
  const { script: aiLayer, notes } = buildOfflineLayerScript(serverSrc);
  console.log(notes.join('\n'));

  const out = `<!doctype html>
<html lang="zh-CN">
  <head>
${cleanHead}
    <meta name="x-lifecompass-mode" content="standalone-ai-capable" />
    <title>${title}</title>
    <style>
${css}
    </style>
  </head>
  <body>
    <div id="root"></div>
${aiLayer}
    <script type="module">
${js}
    </script>
  </body>
</html>
`;

  fs.writeFileSync(outFile, out, 'utf8');
  const size = (fs.statSync(outFile).size / 1024).toFixed(0);
  console.log(`✅ 单文件 HTML 已生成: ${outFile} (${size} KB)`);
}

build();
