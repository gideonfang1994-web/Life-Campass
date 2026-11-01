/**
 * 浏览器端 AI 适配层生成器。
 *
 * 目标：单文件 HTML 在「不配 Key」时用 server.ts 的降级文案（离线演示），
 *      在「配置了 Key」时直接调用真实大模型，且 prompt / temperature / JSON 模式
 *      / 失败行为全部与 server.ts 逐字一致。
 *
 * 支持两类服务：
 *   1. Gemini 原生协议（与 server.ts 同一套：generateContent / streamGenerateContent）
 *   2. OpenAI 兼容协议（/chat/completions）—— 覆盖 DeepSeek、通义、Kimi、智谱、
 *      Ollama、one-api 等绝大多数国内外服务
 *
 * 关键设计：所有 prompt 都在构建期从 server.ts 抽取（见 tools/extract-ai-spec.mjs），
 * 运行期在请求体作用域内求值，因此不存在「两套 prompt 漂移」的问题。
 */
import { extractAiSpecs } from './extract-ai-spec.mjs';
import { extractFallbackTable } from './extract-fallback.mjs';

const CONFIG_KEY = 'life_coach_ai_config';

/**
 * 生成注入到单文件 HTML 的 <script> 内容。
 * @param {string} serverSrc server.ts 源码
 * @returns {string}
 */
export function buildOfflineLayerScript(serverSrc) {
  const fallback = extractFallbackTable(serverSrc);
  const ai = extractAiSpecs(serverSrc);

  const notes = [
    '📦 从 server.ts 抽取降级文案：',
    ...fallback.notes.map((n) => '   ' + n),
    '📦 从 server.ts 抽取 AI 调用规格：',
    ...ai.notes.map((n) => '   ' + n),
  ];

  const script = `
<script>
(function () {
  'use strict';

  // ==================== 一、构建期抽取的数据表 ====================
  // ↓↓↓ 以下两段由 tools/extract-fallback.mjs / extract-ai-spec.mjs 自动生成，请勿手改 ↓↓↓
  var FALLBACK = {
${fallback.table}
  };

  var AI_SPECS = {
${ai.table}
  };

  var PERSONA_PROMPTS = ${ai.personas || '{}'};
  // ↑↑↑ 自动抽取区结束 ↑↑↑

  // ==================== 二、通用工具 ====================
  var IDENT_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

  /**
   * 在给定作用域下求值一段 JS 代码。
   *
   * server.ts 的 prompt 模板里会直接引用局部变量（如 userLogs、wheelScores），
   * 这些变量来自 req.body 的解构。若前端某次请求没带某个字段，直接用函数参数
   * 注入会导致 ReferenceError，进而让整条 AI 调用失败——而真实后端只会渲染成
   * "undefined"。因此这里用 Proxy 作为 with 的目标：未声明的标识符读取时返回
   * undefined 而不是抛错，与后端行为对齐。
   */
  function evalWithScope(code, scope) {
    var base = scope && typeof scope === 'object' ? scope : {};
    var proxy = new Proxy(base, {
      // 只接管「全局作用域里不存在」的标识符，保证 eval / JSON / Math 等仍走全局，
      // 同时让 __scope__、__code__ 这类内部参数不被吞掉。
      has: function (t, k) {
        if (typeof k === 'symbol') return false;
        if (k.slice(0, 2) === '__') return false;
        return !(k in globalThis);
      },
      get: function (t, k) { return t[k]; }
    });
    var runner = new Function(
      '__scope__',
      '__code__',
      'with (__scope__) { return eval(__code__); }'
    );
    return runner(proxy, code);
  }

  function json(obj, status) {
    return new Response(JSON.stringify(obj), {
      status: status || 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  /**
   * 求值 fallback 表项。
   * fallback 源码含模板字面量，换行是真实换行符，必须用 eval 而非拼 new Function 的 body。
   */
  function evalFallback(path, body) {
    var entry = FALLBACK[path];
    if (!entry) return undefined;
    try {
      if (entry.kind === 'sse') {
        return { sse: evalWithScope(entry.src, body || {}) };
      }
      if (entry.kind === 'fn') {
        var scope = Object.assign({ type: '', context: {} }, body || {});
        return { json: evalWithScope('(function(){ ' + entry.src + ' })()', scope) };
      }
      return { json: evalWithScope('(' + entry.src + ')', body || {}) };
    } catch (e) {
      console.error('[OfflineAI] fallback eval error for ' + path, e);
      return undefined;
    }
  }

  /** 宽松 JSON 解析：容忍 \`\`\`json 围栏、前后说明文字 */
  function parseLooseJson(text) {
    if (!text) return null;
    var s = String(text).trim();
    var fence = s.match(/\`\`\`(?:json)?\\s*([\\s\\S]*?)\`\`\`/i);
    if (fence) s = fence[1].trim();
    try {
      return JSON.parse(s);
    } catch (e) {
      var start = s.indexOf('{');
      var end = s.lastIndexOf('}');
      if (start !== -1 && end > start) {
        try {
          return JSON.parse(s.slice(start, end + 1));
        } catch (e2) {
          /* fallthrough */
        }
      }
      return null;
    }
  }

  // ==================== 三、配置读写 ====================
  function getConfig() {
    var raw = null;
    try {
      raw = localStorage.getItem('${CONFIG_KEY}');
    } catch (e) {
      return null;
    }
    if (!raw) return null;
    try {
      var c = JSON.parse(raw);
      if (!c) return null;
      // 允许「OpenAI 兼容协议 + 无 Key」这一组合（本地 Ollama、内网 one-api 无需鉴权）；
      // 但必须填了 Base URL 才算有效配置，否则同样视为未配置、继续走离线演示。
      // 注意：这里必须与 aiEnabled() 的判断保持一致，否则会出现
      // 「保存成功但角标仍显示离线演示」的矛盾状态。
      if (!c.apiKey && c.provider !== 'openai') return null;
      if (c.provider === 'openai' && !c.baseUrl) return null;
      return c;
    } catch (e) {
      return null;
    }
  }

  function setConfig(cfg) {
    try {
      if (!cfg) localStorage.removeItem('${CONFIG_KEY}');
      else localStorage.setItem('${CONFIG_KEY}', JSON.stringify(cfg));
    } catch (e) {
      /* localStorage 不可用（隐私模式等）时静默降级 */
    }
    syncIndicator();
    syncPanel();
  }

  var DEFAULTS = {
    provider: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    model: 'gemini-3.8-flash',
    jsonMode: true
  };

  var PROVIDER_PRESETS = {
    gemini: {
      label: 'Google Gemini（原生协议，与原后端一致）',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      model: 'gemini-3.8-flash',
      keyHint: '在 aistudio.google.com/apikey 获取，形如 AIza...'
    },
    openai: {
      label: 'OpenAI 兼容（DeepSeek / 通义 / Kimi / 智谱 / Ollama / one-api）',
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-v4-flash',
      keyHint: '填对应平台的 Key；本地 Ollama 可留空并填 http://localhost:11434/v1'
    }
  };

  // ==================== 四、真实模型调用 ====================

  /**
   * 把请求体 + spec 解析成「system 指令 + 对话消息 / 单轮用户内容」。
   */
  function resolvePrompt(spec, body) {
    var scope = Object.assign({}, body);
    if (spec.kind === 'chat') {
      scope.PERSONA_PROMPTS = PERSONA_PROMPTS;
      var system = evalWithScope(spec.promptSrc, scope);
      var msgs = (body.messages || []).map(function (m) {
        return {
          role: m && m.role === 'assistant' ? 'assistant' : 'user',
          content: String((m && m.content) || '')
        };
      });
      return { system: system, messages: msgs, user: null };
    }
    var sys = spec.systemSrc ? evalWithScope(spec.systemSrc, scope) : null;
    var user;
    if (spec.promptMode === 'block') {
      user = evalWithScope('(function(){' + spec.promptSrc + '})()', scope);
    } else {
      user = evalWithScope('(' + spec.promptSrc + ')', scope);
    }
    return { system: sys, messages: null, user: String(user == null ? '' : user) };
  }

  /** 把应用侧的 SSE 协议（data: {text} / [DONE]）包成 Response */
  function makeAppSse(upstream) {
    var enc = new TextEncoder();
    var body = new ReadableStream({
      async start(controller) {
        try {
          var out = upstream.body.getReader();
          var dec = new TextDecoder();
          var buf = '';
          while (true) {
            var r = await out.read();
            if (r.done) break;
            buf += dec.decode(r.value, { stream: true });
            var lines = buf.split('\\n');
            buf = lines.pop() || '';
            for (var i = 0; i < lines.length; i++) {
              var line = lines[i].trim();
              if (!line) continue;
              controller.enqueue(enc.encode(line + '\\n\\n'));
            }
          }
          controller.enqueue(enc.encode('data: [DONE]\\n\\n'));
        } catch (e) {
          console.error('[AI] stream error', e);
          controller.enqueue(
            enc.encode('data: ' + JSON.stringify({ text: '\\n\\n*(流式中断：' + (e && e.message ? e.message : e) + ')*' }) + '\\n\\n')
          );
        } finally {
          try { controller.close(); } catch (e2) { /* already closed */ }
        }
      }
    });
    return new Response(body, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' }
    });
  }

  /** 把纯文本按字符逐块推成应用侧 SSE（用于上游不支持流式时） */
  function textToAppSse(text, delay) {
    var enc = new TextEncoder();
    var body = new ReadableStream({
      start(controller) {
        var i = 0;
        function push() {
          if (i >= text.length) {
            controller.enqueue(enc.encode('data: [DONE]\\n\\n'));
            controller.close();
            return;
          }
          controller.enqueue(enc.encode('data: ' + JSON.stringify({ text: text[i] }) + '\\n\\n'));
          i++;
          setTimeout(push, delay || 8);
        }
        push();
      }
    });
    return new Response(body, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' }
    });
  }

  /** Gemini 原生协议 */
  async function callGemini(spec, resolved, cfg) {
    var cfgObj = cfg || getConfig();
    var base = (cfgObj.baseUrl || DEFAULTS.baseUrl).replace(/\\/$/, '');
    var model = cfgObj.model || DEFAULTS.model;
    var method = spec.sse && spec.kind === 'chat' ? 'streamGenerateContent' : 'generateContent';
    var url = base + '/models/' + encodeURIComponent(model) + ':' + method;
    url += '?key=' + encodeURIComponent(cfgObj.apiKey);
    if (method === 'streamGenerateContent') url += '&alt=sse';

    var contents;
    if (resolved.messages) {
      contents = resolved.messages.map(function (m) {
        return { role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] };
      });
    } else {
      contents = [{ role: 'user', parts: [{ text: resolved.user }] }];
    }

    var generationConfig = {};
    if (typeof spec.temperature === 'number') generationConfig.temperature = spec.temperature;
    if (spec.json) generationConfig.responseMimeType = 'application/json';

    var payload = { contents: contents };
    if (resolved.system) payload.systemInstruction = { parts: [{ text: resolved.system }] };
    if (Object.keys(generationConfig).length) payload.generationConfig = generationConfig;

    var res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      var detail = '';
      try { detail = (await res.text()).slice(0, 300); } catch (e) { /* ignore */ }
      throw new Error('Gemini HTTP ' + res.status + ' ' + detail);
    }

    if (method === 'streamGenerateContent') {
      return { stream: res };
    }

    var data = await res.json();
    var text = '';
    var cands = (data && data.candidates) || [];
    if (cands[0] && cands[0].content && cands[0].content.parts) {
      for (var i = 0; i < cands[0].content.parts.length; i++) {
        text += cands[0].content.parts[i].text || '';
      }
    }
    return { text: text };
  }

  /** OpenAI 兼容协议 */
  async function callOpenAI(spec, resolved, cfg) {
    var cfgObj = cfg || getConfig();
    var base = (cfgObj.baseUrl || 'https://api.deepseek.com/v1').replace(/\\/$/, '');
    var url = base + '/chat/completions';

    var msgs = [];
    if (resolved.system) msgs.push({ role: 'system', content: resolved.system });
    if (resolved.messages) {
      for (var i = 0; i < resolved.messages.length; i++) msgs.push(resolved.messages[i]);
    } else {
      msgs.push({ role: 'user', content: resolved.user });
    }

    var payload = { model: cfgObj.model, messages: msgs, stream: !!spec.sse };
    if (typeof spec.temperature === 'number') payload.temperature = spec.temperature;
    if (spec.json && cfgObj.jsonMode !== false) payload.response_format = { type: 'json_object' };

    var headers = { 'Content-Type': 'application/json' };
    if (cfgObj.apiKey) headers['Authorization'] = 'Bearer ' + cfgObj.apiKey;

    var res = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      var detail = '';
      try { detail = (await res.text()).slice(0, 300); } catch (e) { /* ignore */ }
      throw new Error('LLM HTTP ' + res.status + ' ' + detail);
    }

    if (spec.sse) return { stream: res };

    var data = await res.json();
    var text = '';
    var ch = (data && data.choices) || [];
    if (ch[0] && ch[0].message) text = ch[0].message.content || '';
    return { text: text };
  }

  /** 把上游 OpenAI 流转换成应用侧 SSE 文本块（供 makeAppSse 使用） */
  function adaptOpenAIStream(res) {
    var enc = new TextEncoder();
    var body = new ReadableStream({
      async start(controller) {
        try {
          var reader = res.body.getReader();
          var dec = new TextDecoder();
          var buf = '';
          while (true) {
            var r = await reader.read();
            if (r.done) break;
            buf += dec.decode(r.value, { stream: true });
            var lines = buf.split('\\n');
            buf = lines.pop() || '';
            for (var i = 0; i < lines.length; i++) {
              var line = lines[i].trim();
              if (!line || line.indexOf('data:') !== 0) continue;
              var payload = line.slice(5).trim();
              if (payload === '[DONE]') continue;
              var obj = null;
              try { obj = JSON.parse(payload); } catch (e) { continue; }
              var delta =
                obj && obj.choices && obj.choices[0] && obj.choices[0].delta
                  ? obj.choices[0].delta.content
                  : null;
              if (delta) {
                controller.enqueue(enc.encode('data: ' + JSON.stringify({ text: delta }) + '\\n\\n'));
              }
            }
          }
          controller.enqueue(enc.encode('data: [DONE]\\n\\n'));
        } catch (e) {
          console.error('[AI] upstream stream error', e);
          controller.enqueue(
            enc.encode('data: ' + JSON.stringify({ text: '\\n\\n*(流式中断)*' }) + '\\n\\n')
          );
          controller.enqueue(enc.encode('data: [DONE]\\n\\n'));
        } finally {
          try { controller.close(); } catch (e2) { /* already closed */ }
        }
      }
    });
    return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  }

  /** 把上游 Gemini 流转换成应用侧 SSE 文本块 */
  function adaptGeminiStream(res) {
    var enc = new TextEncoder();
    var body = new ReadableStream({
      async start(controller) {
        try {
          var reader = res.body.getReader();
          var dec = new TextDecoder();
          var buf = '';
          while (true) {
            var r = await reader.read();
            if (r.done) break;
            buf += dec.decode(r.value, { stream: true });
            var lines = buf.split('\\n');
            buf = lines.pop() || '';
            for (var i = 0; i < lines.length; i++) {
              var line = lines[i].trim();
              if (!line || line.indexOf('data:') !== 0) continue;
              var payload = line.slice(5).trim();
              if (!payload || payload === '[DONE]') continue;
              var obj = null;
              try { obj = JSON.parse(payload); } catch (e) { continue; }
              var parts =
                obj && obj.candidates && obj.candidates[0] && obj.candidates[0].content
                  ? obj.candidates[0].content.parts
                  : null;
              if (parts) {
                for (var j = 0; j < parts.length; j++) {
                  if (parts[j] && parts[j].text) {
                    controller.enqueue(
                      enc.encode('data: ' + JSON.stringify({ text: parts[j].text }) + '\\n\\n')
                    );
                  }
                }
              }
            }
          }
          controller.enqueue(enc.encode('data: [DONE]\\n\\n'));
        } catch (e) {
          console.error('[AI] upstream stream error', e);
          controller.enqueue(
            enc.encode('data: ' + JSON.stringify({ text: '\\n\\n*(流式中断)*' }) + '\\n\\n')
          );
          controller.enqueue(enc.encode('data: [DONE]\\n\\n'));
        } finally {
          try { controller.close(); } catch (e2) { /* already closed */ }
        }
      }
    });
    return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  }

  /** 是否走真实模型 */
  function aiEnabled() {
    var c = getConfig();
    return !!(c && (c.apiKey || c.provider === 'openai'));
  }

  /**
   * 调真实模型，返回与 server.ts 一致的 Response。
   * 失败时按 spec.failMode 决定 500 还是回退降级文案。
   */
  async function callRealAI(path, spec, body) {
    var cfg = getConfig();
    var resolved = resolvePrompt(spec, body);
    var out;
    if (cfg.provider === 'openai') {
      out = await callOpenAI(spec, resolved, cfg);
    } else {
      out = await callGemini(spec, resolved, cfg);
    }

    if (spec.sse) {
      if (out.stream) {
        return cfg.provider === 'openai'
          ? makeAppSse(adaptOpenAIStream(out.stream))
          : makeAppSse(adaptGeminiStream(out.stream));
      }
      return textToAppSse(out.text || '');
    }

    var text = out.text || '';
    if (spec.json) {
      var parsed = parseLooseJson(text);
      if (parsed) return json(parsed);
      console.warn('[AI] JSON 解析失败，原始输出：', text.slice(0, 200));
      return json({});
    }
    if (spec.shape && spec.shape !== 'raw') {
      var wrap = {};
      wrap[spec.shape] = text;
      return json(wrap);
    }
    return json({ raw: text });
  }

  // ==================== 五、入参校验（与 server.ts 一致） ====================
  function validate(path, body) {
    if (path === '/api/coach/chat' || path === '/api/coach/goal-consultation-chat') {
      if (!body || !Array.isArray(body.messages)) return { error: 'messages array is required' };
    }
    if (path === '/api/coach/analyze-project') {
      if (!body || !body.project) return { error: 'project data is required' };
    }
    if (path === '/api/coach/goal-optimize-arrangement') {
      if (!body || !body.goal) return { error: 'goal object is required' };
    }
    if (path === '/api/coach/parse-reflection') {
      if (!body || typeof body.rawText !== 'string') return { error: 'rawText is required' };
    }
    if (path === '/api/ai/autofill') {
      if (!body || !body.type) return { error: 'autofill type is required' };
    }
    return null;
  }

  // ==================== 六、fetch 拦截 ====================
  var nativeFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    if (url.indexOf('/api/') === -1) return nativeFetch(input, init);

    var path = url.split('?')[0];
    var body = {};
    try {
      body = init && init.body ? JSON.parse(init.body) : {};
    } catch (e) {
      body = {};
    }

    var invalid = validate(path, body);
    if (invalid) return Promise.resolve(json(invalid, 400));

    if (path === '/api/health') {
      var c0 = getConfig();
      return Promise.resolve(
        json({ status: 'ok', hasApiKey: aiEnabled(), provider: c0 ? c0.provider : null, model: c0 ? c0.model : null })
      );
    }

    var spec = AI_SPECS[path];
    if (!spec) {
      var fbOnly = evalFallback(path, body);
      if (fbOnly) {
        if (fbOnly.sse !== undefined) return Promise.resolve(textToAppSse(fbOnly.sse, 12));
        if (fbOnly.json !== undefined) return Promise.resolve(json(fbOnly.json));
      }
      return Promise.resolve(json({ error: 'Offline mode: endpoint not mocked', path: path }, 404));
    }

    if (aiEnabled()) {
      return callRealAI(path, spec, body).catch(function (err) {
        console.error('[AI] 真实模型调用失败，回退降级文案：', err);
        notifyFailure(err);
        return fallbackResponse(path, body, spec, true);
      });
    }
    return Promise.resolve(fallbackResponse(path, body, spec, false));
  };

  /**
   * 降级响应。
   *
   * 两种场景必须区分，否则会偏离 server.ts：
   *   - failed = false（未配置 Key）：等价 server.ts 的 if (!ai) 分支，**始终**返回降级文案
   *   - failed = true（配了 Key 但调用抛错）：按 spec.failMode 决定 500 还是回退
   *     server.ts 里 analyze-project / review / course-correction 失败时是 res.status(500)
   */
  function fallbackResponse(path, body, spec, failed) {
    var fb = evalFallback(path, body);
    var wantError = failed && spec && spec.failMode === 'error';

    if (fb && fb.sse !== undefined) {
      // SSE 端点失败时不抛 500，返回降级流（server.ts 也是写一段提示后 sendFallback）
      return Promise.resolve(textToAppSse(fb.sse, 12));
    }
    if (fb && fb.json !== undefined) {
      if (wantError) return Promise.resolve(json({ error: 'AI call failed' }, 500));
      return Promise.resolve(json(fb.json));
    }
    if (wantError) return Promise.resolve(json({ error: 'AI call failed' }, 500));
    return Promise.resolve(json({}));
  }

  // ==================== 七、设置面板 UI ====================
  var panelEl = null;
  var badgeEl = null;

  function injectStyles() {
    if (document.getElementById('lc-ai-style')) return;
    var st = document.createElement('style');
    st.id = 'lc-ai-style';
    st.textContent = [
      '#lc-ai-badge{position:fixed;right:14px;bottom:14px;z-index:9998;display:flex;align-items:center;gap:6px;',
      'padding:7px 12px;border-radius:999px;font:600 12px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;',
      'cursor:pointer;border:1px solid rgba(0,0,0,.08);box-shadow:0 4px 14px rgba(0,0,0,.12);',
      'background:#fff;color:#44403c;transition:transform .15s,box-shadow .15s;user-select:none}',
      '#lc-ai-badge:hover{transform:translateY(-1px);box-shadow:0 6px 18px rgba(0,0,0,.16)}',
      '#lc-ai-badge.on{background:#166534;color:#fff;border-color:#166534}',
      '#lc-ai-badge i{width:7px;height:7px;border-radius:50%;background:#a8a29e;display:inline-block}',
      '#lc-ai-badge.on i{background:#4ade80;box-shadow:0 0 0 3px rgba(74,222,128,.28)}',
      '#lc-ai-panel{position:fixed;right:14px;bottom:60px;z-index:9999;width:384px;',
      'max-width:calc(100% - 28px);max-height:calc(100vh - 90px);overflow:auto;background:#fff;border-radius:16px;',
      'border:1px solid #e7e5e4;box-shadow:0 20px 50px rgba(0,0,0,.2);',
      'font:13px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;',
      'color:#292524;padding:16px;display:none;box-sizing:border-box}',
      '#lc-ai-panel.show{display:block}',
      '#lc-ai-panel h4{margin:0 0 4px;font-size:14px;font-weight:700}',
      '#lc-ai-panel p.lc-hint{margin:0 0 12px;font-size:11.5px;color:#78716c}',
      '#lc-ai-panel label{display:block;font-size:11.5px;font-weight:600;color:#57534e;margin:10px 0 4px}',
      '#lc-ai-panel input,#lc-ai-panel select{width:100%;box-sizing:border-box;padding:7px 9px;border:1px solid #d6d3d1;',
      'border-radius:8px;font-size:12.5px;font-family:inherit;color:#292524;background:#fff;outline:none}',
      '#lc-ai-panel input:focus,#lc-ai-panel select:focus{border-color:#78716c;box-shadow:0 0 0 3px rgba(120,113,108,.12)}',
      '#lc-ai-panel .lc-row{display:flex;gap:8px;margin-top:14px}',
      '#lc-ai-panel button{flex:1;padding:8px 10px;border-radius:8px;font:600 12.5px/1 inherit;cursor:pointer;',
      'border:1px solid #d6d3d1;background:#fff;color:#292524;transition:background .15s}',
      '#lc-ai-panel button:hover{background:#f5f5f4}',
      '#lc-ai-panel button.lc-primary{background:#1c1917;color:#fff;border-color:#1c1917}',
      '#lc-ai-panel button.lc-primary:hover{background:#292524}',
      '#lc-ai-panel button:disabled{opacity:.5;cursor:not-allowed}',
      '#lc-ai-panel .lc-status{margin-top:12px;padding:8px 10px;border-radius:8px;font-size:11.5px;',
      'background:#f5f5f4;color:#57534e;word-break:break-word;white-space:pre-wrap;max-height:120px;overflow:auto}',
      '#lc-ai-panel .lc-status.ok{background:#dcfce7;color:#14532d}',
      '#lc-ai-panel .lc-status.err{background:#fee2e2;color:#7f1d1d}',
      '#lc-ai-panel .lc-chk{display:flex;align-items:center;gap:6px;margin-top:10px;font-size:12px;color:#57534e}',
      '#lc-ai-panel .lc-chk input{width:auto;margin:0}',
      '#lc-ai-panel .lc-head{display:flex;align-items:flex-start;gap:8px}',
      '#lc-ai-panel .lc-head h4{flex:1;min-width:0}',
      // 注意：必须用 (1,0,2) 特异性压过上面的 '#lc-ai-panel button{flex:1}'，
      // 否则关闭按钮会被 flex:1 拉满整行，导致标题栏错位。
      '#lc-ai-panel button#lc-ai-close{flex:0 0 auto;width:24px;height:24px;padding:0;border-radius:7px;',
      'border:1px solid transparent;background:transparent;color:#78716c;font:16px/1 inherit;cursor:pointer}',
      '#lc-ai-panel button#lc-ai-close:hover{background:#f5f5f4;color:#292524}',
      '@media(max-width:640px){#lc-ai-badge{bottom:76px;right:10px;max-width:calc(100vw - 20px);',
      'white-space:normal;text-align:left;line-height:1.35;padding:6px 10px}',
      '#lc-ai-badge.lc-hidden{display:none}}',
      '#lc-ai-toast{position:fixed;left:50%;bottom:84px;transform:translateX(-50%);z-index:10000;',
      'background:#7f1d1d;color:#fff;padding:9px 16px;border-radius:10px;font:12.5px/1.4 -apple-system,sans-serif;',
      'box-shadow:0 8px 24px rgba(0,0,0,.25);max-width:min(420px,90vw);display:none;text-align:center}',
      '#lc-ai-toast.show{display:block}'
    ].join('');
    document.head.appendChild(st);
  }

  function syncIndicator() {
    if (!badgeEl) return;
    var c = getConfig();
    var on = aiEnabled();
    badgeEl.className = on ? 'on' : '';
    badgeEl.innerHTML =
      '<i></i>' + (on ? 'AI 已接入 · ' + (c.model || '') : '离线演示数据 · 点此接入 AI');
  }

  function notifyFailure(err) {
    var msg = err && err.message ? err.message : String(err);
    var lower = msg.toLowerCase();
    if (lower.indexOf('failed to fetch') !== -1 || lower.indexOf('networkerror') !== -1) {
      msg = '网络或跨域受限（CORS）。可直接双击打开时部分模型接口不允许跨域，建议用本地 http 服务打开，或改用支持 CORS 的服务。';
    }
    toast('真实 AI 调用失败，已回退降级文案。' + msg);
  }

  var toastTimer = null;
  function toast(text) {
    var t = document.getElementById('lc-ai-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'lc-ai-toast';
      document.body.appendChild(t);
    }
    t.textContent = text;
    t.className = 'show';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      t.className = '';
    }, 6000);
  }

  function buildPanel() {
    if (panelEl) return panelEl;
    var el = document.createElement('div');
    el.id = 'lc-ai-panel';
    el.innerHTML = [
      '<div class="lc-head"><h4>接入真实 AI</h4>',
      '<button id="lc-ai-close" type="button" aria-label="关闭">×</button></div>',
      '<p class="lc-hint">配置后所有 AI 功能（教练对话、项目诊断、周复盘、5X 目标拆解、觉察填充）都会走真实模型；不配置则使用与官方一致的离线演示文案。</p>',
      '<label>服务商</label>',
      '<select id="lc-provider">',
      '<option value="gemini">Google Gemini（原生协议，与原后端一致）</option>',
      '<option value="openai">OpenAI 兼容（DeepSeek / 通义 / Kimi / 智谱 / Ollama）</option>',
      '</select>',
      '<label>API 地址（Base URL）</label>',
      '<input id="lc-base" spellcheck="false" placeholder="https://...">',
      '<label>模型名称</label>',
      '<input id="lc-model" spellcheck="false" placeholder="gemini-3.8-flash">',
      '<label>API Key</label>',
      '<input id="lc-key" type="password" spellcheck="false" placeholder="粘贴你的 Key">',
      '<div class="lc-chk"><input type="checkbox" id="lc-json"><span>对 JSON 类接口启用严格 JSON 模式（部分服务不支持，可关闭）</span></div>',
      '<div class="lc-row">',
      '<button id="lc-test">测试连接</button>',
      '<button id="lc-save" class="lc-primary">保存并启用</button>',
      '</div>',
      '<div class="lc-row">',
      '<button id="lc-clear">清除配置（回到离线演示）</button>',
      '</div>',
      '<div id="lc-status" class="lc-status">未配置 API Key，当前为离线演示数据。</div>'
    ].join('');
    document.body.appendChild(el);
    panelEl = el;

    var $ = function (id) { return document.getElementById(id); };

    $('lc-ai-close').addEventListener('click', function () {
      closePanel();
    });

    $('lc-provider').addEventListener('change', function () {
      var p = PROVIDER_PRESETS[this.value];
      $('lc-base').value = p.baseUrl;
      $('lc-model').value = p.model;
      $('lc-key').placeholder = p.keyHint;
    });

    $('lc-test').addEventListener('click', async function () {
      var status = $('lc-status');
      var btn = $('lc-test');
      btn.disabled = true;
      status.className = 'lc-status';
      status.textContent = '正在测试…';
      try {
        var cfg = readForm();
        if (!cfg.apiKey && cfg.provider !== 'openai') throw new Error('请先填写 API Key');
        var resolved = { system: null, messages: null, user: '只回复两个字：可以' };
        var spec = { kind: 'single', sse: false, json: false, temperature: 0 };
        var out =
          cfg.provider === 'openai'
            ? await callOpenAI(spec, resolved, cfg)
            : await callGemini(spec, resolved, cfg);
        status.className = 'lc-status ok';
        status.textContent = '连接成功 ✓  模型回复：' + String(out.text || '').slice(0, 60);
      } catch (e) {
        status.className = 'lc-status err';
        var m = e && e.message ? e.message : String(e);
        if (/failed to fetch|networkerror/i.test(m)) {
          m = '跨域或网络被拦截（CORS）。浏览器 file:// 直连部分接口会失败，建议用本地 http 服务打开本页面，或改用允许浏览器直连的服务。原始错误：' + m;
        }
        status.textContent = '连接失败：' + m;
      } finally {
        btn.disabled = false;
      }
    });

    $('lc-save').addEventListener('click', function () {
      var cfg = readForm();
      var status = $('lc-status');
      if (!cfg.apiKey && cfg.provider !== 'openai') {
        status.className = 'lc-status err';
        status.textContent = '请先填写 API Key。';
        return;
      }
      setConfig(cfg);
      status.className = 'lc-status ok';
      status.textContent = '已保存并启用：' + cfg.provider + ' · ' + cfg.model + '\\n后续所有 AI 功能将走真实模型。';
    });

    $('lc-clear').addEventListener('click', function () {
      setConfig(null);
      clearForm();
      $('lc-status').className = 'lc-status';
      $('lc-status').textContent = '已清除配置，回到离线演示数据。';
    });

    return el;
  }

  function readForm() {
    return {
      provider: document.getElementById('lc-provider').value,
      baseUrl: document.getElementById('lc-base').value.trim(),
      model: document.getElementById('lc-model').value.trim(),
      apiKey: document.getElementById('lc-key').value.trim(),
      jsonMode: document.getElementById('lc-json').checked
    };
  }

  function clearForm() {
    if (!panelEl) return;
    document.getElementById('lc-key').value = '';
    var p = PROVIDER_PRESETS.gemini;
    document.getElementById('lc-provider').value = 'gemini';
    document.getElementById('lc-base').value = p.baseUrl;
    document.getElementById('lc-model').value = p.model;
    document.getElementById('lc-key').placeholder = p.keyHint;
    document.getElementById('lc-json').checked = true;
  }

  function syncPanel() {
    if (!panelEl) return;
    var c = getConfig();
    var $ = function (id) { return document.getElementById(id); };
    if (!c) {
      clearForm();
      return;
    }
    $('lc-provider').value = c.provider || 'gemini';
    $('lc-base').value = c.baseUrl || PROVIDER_PRESETS.gemini.baseUrl;
    $('lc-model').value = c.model || DEFAULTS.model;
    $('lc-key').value = c.apiKey || '';
    $('lc-json').checked = c.jsonMode !== false;
  }

  // 打开/关闭面板：移动端打开时隐藏角标，避免面板盖住唯一的关闭入口
  function openPanel() {
    var p = buildPanel();
    syncPanel();
    p.classList.add('show');
    if (badgeEl) badgeEl.classList.add('lc-hidden');
  }

  function closePanel() {
    if (!panelEl) return;
    panelEl.classList.remove('show');
    if (badgeEl) badgeEl.classList.remove('lc-hidden');
  }

  function mountUI() {
    injectStyles();
    badgeEl = document.createElement('div');
    badgeEl.id = 'lc-ai-badge';
    badgeEl.addEventListener('click', function () {
      if (panelEl && panelEl.classList.contains('show')) {
        closePanel();
      } else {
        openPanel();
      }
    });
    document.body.appendChild(badgeEl);
    syncIndicator();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountUI);
  } else {
    mountUI();
  }

  // 对外暴露，便于自动化测试与二次开发
  window.LifeCompassAI = {
    getConfig: getConfig,
    setConfig: setConfig,
    enabled: aiEnabled,
    specs: AI_SPECS,
    fallback: FALLBACK,
    openPanel: openPanel,
    closePanel: closePanel
  };
})();
</script>
`;

  return { script, notes };
}
