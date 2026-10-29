import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '10mb' }));

// Initialize Google GenAI
const apiKey = process.env.GEMINI_API_KEY || '';
let ai: GoogleGenAI | null = null;
if (apiKey) {
  ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Health check endpoint
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', hasApiKey: !!apiKey });
});

// Coach personas system instructions
const PERSONA_PROMPTS: Record<string, string> = {
  strategic: `你是一位顶尖的【战略导师型】人生教练（类似麦肯锡资深合伙人与硅谷创业导师的结合）。
你的风格：严密、务实、数据驱动、结果导向。
你的核心原则：
1. 聚焦高杠杆行动（80/20法则），无情识别并指出“假努力”与“低水平勤奋”。
2. 将模糊的人生宏愿转化为清晰的 OKR、关键交付物与量化检验标准。
3. 语言言简意赅，逻辑清晰，结构化输出（问题本质、杠杆支点、立即可做的三步）。`,

  mindful: `你是一位温润且深刻的【心流与内在动机导师】（融合认知行为心理学与正念生命设计）。
你的风格：共情、敏锐、包容、重视心理能量与身心平衡。
你的核心原则：
1. 关注执行力背后的情绪阻抗、完美主义焦虑和精力透支信号。
2. 引导用户觉察“我真正想要什么”而非“外界期待我做什么”。
3. 倡导“温柔而坚定”的自我关怀，用小胜（Micro-wins）重建心理资本。`,

  accountability: `你是一位高能量的【敏捷督导与行动教练】（类似顶尖运动员的体能与自律主教）。
你的风格：直接、振奋、不找借口、死磕执行细节。
你的核心原则：
1. 直击拖延症软肋：“如果现在只能做2分钟，你的第一击是什么？”
2. 强调“环境设计胜过意志力”，帮用户剔除阻力场，建立触发器。
3. 要求明确承诺与闭环反馈，语言充满动力与紧迫感。`,

  stoic: `你是一位睿智深邃的【斯多葛哲人导师】（融合马可·奥勒留《沉思录》与长周期思考）。
你的风格：从容、宏观、超然、富有思辨力。
你的核心原则：
1. 区分“控制二分法”：什么是完全在用户掌控中的？什么是外部随机性？
2. 帮助用户在逆境中逆向思考（Premeditatio Malorum），将障碍转化为燃料（The obstacle is the way）。
3. 引导用户拉长时间尺度（5年、10年、终局），化解当下的琐碎焦虑。`
};

// 1. AI Coach Chat API (Streaming)
app.post('/api/coach/chat', async (req: Request, res: Response) => {
  const { messages, persona = 'strategic', contextData } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array is required' });
  }

  // Set up SSE headers for streaming
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const systemPrompt = `${PERSONA_PROMPTS[persona] || PERSONA_PROMPTS.strategic}

【用户当前生命系统全景上下文】：
${contextData ? JSON.stringify(contextData, null, 2) : '暂无详细项目数据'}

【教练回复原则】：
1. 始终使用中文回复，排版使用优雅的 Markdown，要点明确，便于阅读。
2. 结合用户当前的项目进展、精力指数和历史反思给予针对性指导，切忌泛泛而谈。
3. 提倡引导式提问（Coaching Questions）与具体行动方案相结合，每次回复结尾提供1个值得深思的问题或1个今日可在5分钟内完成的微行动。`;

  // Fallback generator if AI is not configured
  const sendFallback = async () => {
    const fallbackText = `### 💡 人生教练观察与行动建议

我注意到你正在关注你的关键生活项目。无论外部节奏如何，核心在于**保持动量与保护精力池**。

1. **核心堵点透视**：拖延或阻力通常并非因为意志力不足，而是因为“下一步行动”的颗粒度还不够小，或者心理预期负荷过高。
2. **杠杆行动建议**：
   - 选出当前最重要的**唯一主线项目**。
   - 设定一个「无痛启动阈值」：只做前 10 分钟，不追求完美，只追求发生。
   - 记录做完后的精力反馈，是充盈还是消耗。

**🎯 今日教练提问**：
> 如果今天只完成一件事就能让你晚上入睡时感到踏实与自豪，那件不可妥协的事是什么？`;

    for (const char of fallbackText) {
      res.write(`data: ${JSON.stringify({ text: char })}\n\n`);
      await new Promise((r) => setTimeout(r, 12));
    }
    res.write('data: [DONE]\n\n');
    res.end();
  };

  if (!ai) {
    await sendFallback();
    return;
  }

  try {
    const formattedContents = messages.map((m: { role: string; content: string }) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const responseStream = await ai.models.generateContentStream({
      model: 'gemini-3.8-flash',
      contents: formattedContents,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.7,
      },
    });

    for await (const chunk of responseStream) {
      const text = chunk.text;
      if (text) {
        res.write(`data: ${JSON.stringify({ text })}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error: any) {
    console.error('Gemini Chat error:', error);
    // If error occurs mid-stream, inform client gracefully
    res.write(`data: ${JSON.stringify({ text: '\n\n*(教练网络波动，以下为你生成离线建议方案)*\n\n' })}\n\n`);
    await sendFallback();
  }
});

// 2. Project Deep Diagnostic API
app.post('/api/coach/analyze-project', async (req: Request, res: Response) => {
  const { project, userLogs } = req.body;

  if (!project) {
    return res.status(400).json({ error: 'project data is required' });
  }

  const prompt = `请作为专业人生教练，对以下这个特定人生项目进行深度体检诊断与突破指导：

【项目详情】
标题：${project.title}
分类：${project.category}
当前进度：${project.progress}%
状态：${project.status}
优先级：${project.priority}
能量属性：${project.energyCost}
目标周期：${project.targetDate || '长期演进'}
描述与初衷：${project.description}
已设里程碑：${JSON.stringify(project.milestones || [])}
当前最小行动：${project.nextMicroAction || '未定义'}
历史打卡记录：${JSON.stringify(project.checkins || [])}

【相关近期日常日志（供参考上下文）】：
${JSON.stringify(userLogs?.slice(-5) || [])}

请返回一段结构严谨、富有洞察力的诊断报告，包含：
1. **健康度评估与潜在盲点**（指出是否处于假努力、目标过载或动力衰竭）；
2. **关键突破支点**（最关键的单点突破口）；
3. **优化后的下阶段里程碑推荐**（3-4个切实可行的阶段阶梯）；
4. **48小时破局微行动**（具体到第一步动作）。

请直接输出 Markdown 格式。`;

  if (!ai) {
    return res.json({
      diagnosis: `### 🩺 项目深度诊断报告：${project.title}

#### 1. 健康度评估与潜在盲点
- **进度与动能匹配**：当前完成度为 ${project.progress}%，整体处于${project.status === 'on_track' ? '健康推进' : '需聚力激活'}阶段。
- **潜在风险点**：注意警惕“准备做”多于“实际上场”。检查是否有将时间过多花费在工具选择、完美计划设计，而推迟了实质产出。

#### 2. 关键突破支点
- **单核聚焦**：将每周该项目的投入固定在精力最旺盛的时段（如早晨第一专注块）。
- **降低认知负荷**：定义一个任何人都能在5分钟内接管的最简初稿标准。

#### 3. 推荐阶段里程碑
1. **阶段 1 (本周)**：完成核心最小可行样本 (MVP)，排除所有边角修饰。
2. **阶段 2 (下阶段)**：进行一次真实反馈测试或成果自我检阅。
3. **阶段 3 (巩固期)**：形成稳定的每周迭代节奏与自动化工作流。

#### 4. 48小时破局微行动
> 🎯 **第一步**：${project.nextMicroAction || '打开空白文档/工作区，只写下/行动前100字或前5分钟动作，不要停顿。'}`
    });
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        systemInstruction: '你是一位资深的人生项目督导专家，擅长敏捷项目管理与个人效能进化。用清晰有力的中文排版输出。',
        temperature: 0.6,
      },
    });

    res.json({ diagnosis: response.text });
  } catch (err: any) {
    console.error('Project diagnosis error:', err);
    res.status(500).json({ error: 'Diagnosis failed', fallback: '暂无法完成AI诊断，请稍后重试。' });
  }
});

// 3. AI Retrospective Review Generator (周度 / 月度深度复盘)
app.post('/api/coach/review', async (req: Request, res: Response) => {
  const { period = 'weekly', projects, logs, wheelScores } = req.body;

  const prompt = `你是一位高阶人生复盘导师。请基于用户过去${period === 'weekly' ? '一周' : '一月'}的全部真实数据，生成一份极具指导价值、发人深省又充满动力的【${period === 'weekly' ? '周度' : '月度'}人生战略复盘简报】。

【生命项目现状】：
${JSON.stringify(projects, null, 2)}

【近期行为与心情日志记录】：
${JSON.stringify(logs, null, 2)}

【生命之轮各维度自评分数（1-10分）】：
${JSON.stringify(wheelScores, null, 2)}

请输出一份包含以下板块的专业复盘报告（请使用 Markdown 格式）：
# 🧭 ${period === 'weekly' ? '周度' : '月度'}人生进化与战略复盘报告

### 🌟 核心成果与动量识别 (Wins & Momentum)
（不仅列举做了什么，更指出做对了什么底层策略）

### ⚠️ 能量泄漏与卡点剖析 (Bottlenecks & Energy Drain)
（深度剖析哪几个项目在消耗心力、是否存在投入产出比不匹配、是否有假性忙碌）

### ⚖️ 生命之轮平衡度评价 (Life Wheel Synthesis)
（针对评分过高或过低的维度给出敏锐洞察，比如是否过度牺牲健康来换取短期工作）

### 🎯 下阶段 3 大不可妥协战略指令 (Top 3 Directives)
1. ...
2. ...
3. ...

### 💬 教练灵魂箴言 (Coach's Closing Wisdom)
（一句穿透当下局面的深刻启发）`;

  if (!ai) {
    return res.json({
      report: `# 🧭 ${period === 'weekly' ? '周度' : '月度'}人生进化与战略复盘报告

### 🌟 核心成果与动量识别
- **动能持续**：在过去周期中，你持续保持了记录与监督的觉察力，完成了多次微小闭环。
- **正向反馈**：高质量的记录本身就是抵抗生活熵增的最有力武器。

### ⚠️ 能量泄漏与卡点剖析
- **注意力分散**：同时关注的项目过多容易导致单点动量不足。建议收拢战线，确保 1 个主力推进项目，其余作为维持项目。
- **精力起伏**：注意精力低谷日的安排，避免在疲惫时进行高强度决策。

### ⚖️ 生命之轮平衡度评价
- 重点关注评分最低的维度。人生的短板往往不是能力的短板，而是关注度和恢复节奏的短板。

### 🎯 下阶段 3 大不可妥协战略指令
1. **只打关键战役**：下周期只设定 1 个核心攻坚成果。
2. **建立启动仪式**：将最难的行动放在每天早晨第一精力高峰执行。
3. **彻底的放空休息**：设定至少半天的无屏幕放空时段，为心智充电。

### 💬 教练灵魂箴言
> “不是因为事情困难我们不敢去做，而是因为我们不敢去做，事情才变得困难。” — 塞涅卡`
    });
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        systemInstruction: '你是一位兼具战略高度与心理关怀的人生复盘教练。使用清晰有条理的中文，富有洞见。',
        temperature: 0.7,
      },
    });

    res.json({ report: response.text });
  } catch (err: any) {
    console.error('Review generation error:', err);
    res.status(500).json({ error: 'Review generation failed' });
  }
});

// 4. Smart Goal Breakdown to Milestones
app.post('/api/coach/smart-breakdown', async (req: Request, res: Response) => {
  const { goalTitle, category, currentLevel } = req.body;

  const prompt = `用户想要开启一个新的人生项目/目标：
目标名称：${goalTitle}
项目分类：${category}
当前基础：${currentLevel || '零基础/初次探索'}

请作为目标拆解专家，将其科学转化为符合清晰阶梯路线的 4 个阶段性里程碑，以及一个今日即可启动的“极简微行动”。
必须以 JSON 格式返回，结构如下：
{
  "milestones": [
    { "title": "里程碑1名称", "targetDays": 7 },
    { "title": "里程碑2名称", "targetDays": 21 },
    { "title": "里程碑3名称", "targetDays": 45 },
    { "title": "里程碑4名称", "targetDays": 90 }
  ],
  "nextMicroAction": "今日可在3分钟内完成的微小第一步",
  "coachTip": "一句话核心心法"
}`;

  if (!ai) {
    return res.json({
      milestones: [
        { title: '阶段一：明确基线与搭建极简工作流', targetDays: 7 },
        { title: '阶段二：完成第一个最小闭环成果', targetDays: 21 },
        { title: '阶段三：优化进阶与节奏固化', targetDays: 45 },
        { title: '阶段四：全面验收与系统化交付', targetDays: 90 },
      ],
      nextMicroAction: '在笔记本上写下该目标达成后的3个具体画面',
      coachTip: '不要高估一天的产出，也不要低估持续三个月的复利。'
    });
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.5,
      },
    });

    const parsed = JSON.parse(response.text?.trim() || '{}');
    res.json(parsed);
  } catch (err: any) {
    console.error('Breakdown error:', err);
    res.json({
      milestones: [
        { title: '阶段一：明确基线与搭建极简工作流', targetDays: 7 },
        { title: '阶段二：完成第一个最小闭环成果', targetDays: 21 },
        { title: '阶段三：优化进阶与节奏固化', targetDays: 45 },
        { title: '阶段四：全面验收与系统化交付', targetDays: 90 },
      ],
      nextMicroAction: '在笔记本上写下该目标达成后的3个具体画面',
      coachTip: '动起来，答案在行动中生成。'
    });
  }
});

// 5. Course Correction & Intervention API (纠偏指导)
app.post('/api/coach/course-correction', async (req: Request, res: Response) => {
  const { dimension, title, progress, bottleneck, tasks } = req.body;

  const prompt = `你是一位严谨而敏锐的人生教练。用户在【${dimension}】维度（项目/目标：${title}）遇到执行阻碍，需要紧急【纠偏与路径重构】。
当前完成度：${progress}%
遇到的卡点/偏离现象：${bottleneck || '进展缓慢，执行停滞或产生拖延内耗'}
现有任务清单：${JSON.stringify(tasks || [])}

请提供一份极简主义、直击痛点的【教练纠偏方案】：
1. **偏差溯源**：指出为什么会偏离（是否目标过高、是否陷入细节假努力、是否缺乏及时正反馈）；
2. **断舍离减负**：指出哪些繁琐动作应当立刻砍掉或降维；
3. **48小时纠偏行动令**：给出 1 个强制性、5分钟内立即可做的微突破，以及重新校准后的执行节奏。

请使用结构清晰的 Markdown 格式输出。`;

  if (!ai) {
    return res.json({
      correction: `### 🧭 教练纠偏与路径重构令：【${dimension} · ${title}】

#### 1. 偏差溯源诊断
- **阻力本质**：通常停滞并非缺乏毅力，而是“启动成本超过了心理能量存量”。任务颗粒度过大，导致大脑将其判定为威胁。
- **警惕假努力**：检查是否在“准备工作”、“挑选工具”、“收集资料”上消耗了80%的精力，而迟迟不敢交付初稿。

#### 2. 断舍离减负清单
- **砍掉非必要修饰**：暂时剥离所有形式化排版与边角料，只保留核心交付骨架。
- **调低完美期望**：从“做到80分”降至“做出一份极其粗糙的0.1版本”。

#### 3. 48小时极简纠偏行动
> ⚡ **今日第一击**：设定 10 分钟倒计时，不查资料、不切窗口，只执行第一步最简单的动作，时间一到立刻停手并奖励自己。`
    });
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        systemInstruction: '你是一位注重实效与极简行动的人生教练，言简意赅，直击痛点，排版清爽。',
        temperature: 0.6,
      },
    });

    res.json({ correction: response.text });
  } catch (err: any) {
    console.error('Correction error:', err);
    res.status(500).json({ error: 'Correction failed' });
  }
});

// Setup Vite middleware in dev or static files in production
async function startServer() {
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`LifeCoach applet server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
