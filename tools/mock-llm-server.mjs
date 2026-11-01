/**
 * 本地假 LLM 服务：验证浏览器端 AI 适配层的协议正确性。
 *
 * 同时模拟两种协议：
 *   - POST /v1beta/models/:model:generateContent         (Gemini 非流式)
 *   - POST /v1beta/models/:model:streamGenerateContent   (Gemini 流式, alt=sse)
 *   - POST /v1/chat/completions                           (OpenAI 兼容，流式/非流式)
 *
 * 关键：它会把收到的 prompt / temperature / JSON 模式回显到响应里，
 * 便于断言「浏览器发出的请求是否与 server.ts 的 prompt 逐字一致」。
 */
import http from 'http';

const PORT = 8791;
const seen = [];

function readBody(req) {
  return new Promise((resolve) => {
    let s = '';
    req.on('data', (c) => (s += c));
    req.on('end', () => {
      try {
        resolve(JSON.parse(s || '{}'));
      } catch (e) {
        resolve({ __raw: s });
      }
    });
  });
}

function visible(text) {
  // 把收到的 prompt 压成可断言的一行
  return String(text || '').replace(/\s+/g, ' ').slice(0, 400);
}

const server = http.createServer(async (req, res) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors);
    return res.end();
  }

  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;

  // 诊断用：把最近一次请求体吐出来
  if (p === '/__last') {
    res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(seen[seen.length - 1] || null, null, 1));
  }
  if (p === '/__all') {
    res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(seen, null, 1));
  }
  if (p === '/__reset') {
    seen.length = 0;
    res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
    return res.end('{"ok":true}');
  }

  const body = await readBody(req);

  // ---------- Gemini 协议 ----------
  if (p.includes(':generateContent') || p.includes(':streamGenerateContent')) {
    const isStream = p.includes(':streamGenerateContent');
    const sys = body.systemInstruction?.parts?.[0]?.text || '';
    const userParts = (body.contents || []).map((c) =>
      (c.parts || []).map((x) => x.text).join('')
    );
    const gen = body.generationConfig || {};

    seen.push({
      protocol: 'gemini',
      model: p.match(/models\/([^:]+):/)?.[1],
      stream: isStream,
      temperature: gen.temperature,
      responseMimeType: gen.responseMimeType || null,
      systemPreview: visible(sys),
      userPreview: visible(userParts.join(' | ')),
      userCount: userParts.length,
      key: url.searchParams.get('key'),
    });

    const isJson = gen.responseMimeType === 'application/json';
    const PAYLOAD = isJson
      ? JSON.stringify({
          milestones: [
            { title: 'AI-里程碑1', targetDays: 7 },
            { title: 'AI-里程碑2', targetDays: 21 },
            { title: 'AI-里程碑3', targetDays: 45 },
            { title: 'AI-里程碑4', targetDays: 90 },
          ],
          nextMicroAction: 'AI 生成的微行动',
          coachTip: 'AI 心法（来自真实模型）',
        })
      : '### AI 真实回复\n\n这是来自真实模型的内容，用于验证协议链路。\n\n**关键点**：参数与 prompt 均与后端一致。';

    if (isStream) {
      res.writeHead(200, {
        ...cors,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      // 按 12 字符切块推送，模拟真实增量
      const step = 12;
      for (let i = 0; i < PAYLOAD.length; i += step) {
        const piece = PAYLOAD.slice(i, i + step);
        res.write(
          `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: piece }] } }] })}\n\n`
        );
        await new Promise((r) => setTimeout(r, 8));
      }
      res.end();
      return;
    }

    res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
    return res.end(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: PAYLOAD }] }, finishReason: 'STOP' }],
      })
    );
  }

  // ---------- OpenAI 兼容协议 ----------
  if (p.endsWith('/chat/completions')) {
    const posts = (body.messages || []).map((m) => `${m.role}:${visible(m.content)}`);
    seen.push({
      protocol: 'openai',
      model: body.model,
      stream: !!body.stream,
      temperature: body.temperature,
      responseFormat: body.response_format?.type || null,
      messages: posts,
      auth: req.headers.authorization || null,
      roleCount: (body.messages || []).length,
    });

    const isJson = body.response_format?.type === 'json_object';
    const CONTENT = isJson
      ? JSON.stringify({
          highlight: 'AI 高光（真实模型）',
          wins: ['AI 小胜 1', 'AI 小胜 2'],
          friction: '',
          energyLevel: 5,
          mood: 'thriving',
          coachTip: 'AI 短评',
          projectNote: 'AI 项目要点',
          progressDelta: 12,
        })
      : '### OpenAI 兼容通道回复\n\n这是来自兼容协议的真实内容。';

    if (body.stream) {
      res.writeHead(200, {
        ...cors,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
      });
      const step = 10;
      for (let i = 0; i < CONTENT.length; i += step) {
        res.write(
          `data: ${JSON.stringify({ choices: [{ delta: { content: CONTENT.slice(i, i + step) } }] })}\n\n`
        );
        await new Promise((r) => setTimeout(r, 8));
      }
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }

    res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
    return res.end(
      JSON.stringify({ choices: [{ message: { role: 'assistant', content: CONTENT } }] })
    );
  }

  res.writeHead(404, { ...cors, 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found', path: p }));
});

server.listen(PORT, () => {
  console.log(`mock-llm listening on http://localhost:${PORT}`);
  console.log('  Gemini : POST /v1beta/models/{model}:generateContent');
  console.log('  OpenAI : POST /v1/chat/completions');
  console.log('  观测   : GET /__last | /__all | /__reset');
});
