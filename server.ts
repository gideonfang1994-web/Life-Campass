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

// 6. Voice / Natural Language Reflection Parser API
app.post('/api/coach/parse-reflection', async (req: Request, res: Response) => {
  const { rawText } = req.body;

  if (!rawText || typeof rawText !== 'string') {
    return res.status(400).json({ error: 'rawText is required' });
  }

  const prompt = `请将用户通过语音输入或随笔倾诉的一段日常复盘内容，提炼并结构化为标准日志对象：
用户原话：“${rawText}”

必须以 JSON 格式输出，字段如下：
{
  "highlight": "今日最核心高光战果（1句话，凝练具体）",
  "wins": ["微小胜利1", "微小胜利2"],
  "friction": "遇到的阻力、分心或卡点反思（如无则留空）",
  "energyLevel": 1到5的整数（根据语气与精力状态合理推测）,
  "mood": "thriving" | "calm" | "focused" | "tired" | "anxious"（5选1）,
  "coachTip": "人生教练针对这则记录给出的1句暖心而犀利的短评建议"
}`;

  if (!ai) {
    return res.json({
      highlight: rawText.slice(0, 40),
      wins: ['完成了日常觉察与记录'],
      friction: '',
      energyLevel: 4,
      mood: 'focused',
      coachTip: '记录本身就是对生活的觉察与掌控，继续保持！'
    });
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.3,
      },
    });

    const parsed = JSON.parse(response.text?.trim() || '{}');
    res.json(parsed);
  } catch (err: any) {
    console.error('Reflection parse error:', err);
    res.json({
      highlight: rawText.slice(0, 40),
      wins: ['坚持完成了语音记录打卡'],
      friction: '',
      energyLevel: 4,
      mood: 'focused',
      coachTip: '每一次记录都是一次重新对齐人生的契机。'
    });
  }
});

// 马斯克 5X 极速目标拆解：第一性原理 + 五步工作法 + 5年倒逼1年
app.post('/api/coach/musk-breakdown', async (req: Request, res: Response) => {
  const { title, category, fiveYearVision, context } = req.body;

  const prompt = `你现在是埃隆·马斯克（Elon Musk）的极限工程与第一性原理教练化身。
你的使命：帮助用户将一个通常需要【5年】才能实现的宏伟目标，通过【第一性原理】和【马斯克五步工作法】强力压缩到【1年】内极限突破（实现 1 年完成 5 年的进度）！

用户目标信息：
- 目标名称: ${title || '未命名目标'}
- 维度类别: ${category || 'career'}
- 原始5年愿景: ${fiveYearVision || title}
- 当前背景/资源: ${context || '个人全情投入，寻求极限破局'}

马斯克核心思考方法：
1. 第一性原理：把事情剥离到最基础的物理/底层事实，不依赖类比和“别人都是这么做的”。
2. 五步工作法（The 5-Step Algorithm）：
   ① 质疑并推翻每一个需求（Make requirements less dumb）
   ② 极限删减无用环节（Delete the part or process）
   ③ 简化与优化（Simplify or optimize，注意千万不要去优化根本不该存在的东西）
   ④ 极速压缩迭代周期（Accelerate cycle time，将按季度缩短为按天验证）
   ⑤ 自动化与杠杆锁定（Automate）

请输出严格的 JSON 对象（不要包含任何 markdown 标记或额外解释）：
{
  "oneYearTarget": "倒逼到1年完成的量化硬核指标（极具张力与可行性）",
  "fundamentalTruth": "剥离一切中间借口与常规假象后的底层物理/数学事实",
  "deletedProcesses": [
    "必须彻底删减的伪流程/伪需求1（例如：繁文缛节的PPT汇报与过早优化）",
    "必须彻底删减的伪流程/伪需求2",
    "必须彻底删减的伪流程/伪需求3"
  ],
  "coreBottleneck": "当前限制整体周转速度的唯一核心瓶颈（Rate-limiting step）",
  "unconventionalPath": "避开传统慢速排队或线性累加的非常规非线性破局战术",
  "milestones": [
    {
      "id": "q1",
      "phase": "Q1",
      "title": "Q1 极速破局：完成核心单点MVP与真实反馈闭环",
      "targetDays": 30,
      "verificationProof": "客观硬证据（如线上交易单/代码提交/体检指标）"
    },
    {
      "id": "q2",
      "phase": "Q2",
      "title": "Q2 规模化与复制：打通第二战线",
      "targetDays": 60,
      "verificationProof": "可验证的数据或实体成果"
    },
    {
      "id": "q3",
      "phase": "Q3",
      "title": "Q3 极限迭代：消除瓶颈，周转速度翻倍",
      "targetDays": 90,
      "verificationProof": "系统化周转率与产出报告"
    },
    {
      "id": "q4",
      "phase": "Q4",
      "title": "Q4 达成5年级终局指标，构建壁垒与自动化",
      "targetDays": 120,
      "verificationProof": "年终终局验收指标与财务/成果审计"
    }
  ],
  "muskDirective": "一句极具马斯克硬核风格的监督训令（直白、严苛、拒绝借口，命令其立刻行动）"
}`;

  if (!ai) {
    return res.json({
      oneYearTarget: `【1年倒逼指标】以单兵+极限杠杆，在12个月内完成【${title}】的本质跃迁，产出远超5年线性积累的硬核结果。`,
      fundamentalTruth: '价值的物理本质是解决真实世界的不可逆摩擦，无须依赖冗长的组织层级与繁复的类比。',
      deletedProcesses: [
        '砍掉无验证的长篇市场调研与冗长PPT',
        '砍掉过早优化与非核心架构封装',
        '砍掉任何不产出交付物的讨论会议'
      ],
      coreBottleneck: '从想法到面对真实用户/物理世界的闭环反馈周期',
      unconventionalPath: '通过小规模极速试错，48小时上线最小可用版本测试真实付费与生理反馈。',
      milestones: [
        { id: 'q1', phase: 'Q1', title: '完成物理原型并获得首批真实硬核验证', targetDays: 30, verificationProof: '可验证的公开链接或实物指标' },
        { id: 'q2', phase: 'Q2', title: '去除全部阻力环节，建立自动化交付机制', targetDays: 60, verificationProof: '周转效率提升300%的数据记录' },
        { id: 'q3', phase: 'Q3', title: '极限负荷测试与产能扩张', targetDays: 90, verificationProof: '关键输出指标翻倍' },
        { id: 'q4', phase: 'Q4', title: '完成终局硬指标并实现系统自运转', targetDays: 120, verificationProof: '年终全面指标验收报告' }
      ],
      muskDirective: '马斯克监督令：如果一个想法需要5年，问问自己为什么不能在6个月内做完？今天就交付你的第一件粗糙但能跑的原型！'
    });
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.4,
      },
    });

    const parsed = JSON.parse(response.text?.trim() || '{}');
    res.json(parsed);
  } catch (err: any) {
    console.error('Musk breakdown error:', err);
    res.json({
      oneYearTarget: `【1年倒逼】极限压缩：12个月内跑通【${title}】完整商业或生理闭环。`,
      fundamentalTruth: '事物本质极其简单，复杂性都是人为制造的逃避机制。',
      deletedProcesses: ['砍掉未经验证的前置准备', '砍掉多余形式主义', '砍掉空想规划'],
      coreBottleneck: '交付物触达真实外部世界的反馈延迟',
      unconventionalPath: '以终为始，倒推最小里程碑，48小时交付一版。',
      milestones: [
        { id: 'q1', phase: 'Q1', title: '首期硬核成果上线', targetDays: 30, verificationProof: '交付物链接' },
        { id: 'q2', phase: 'Q2', title: '系统性破局与复制', targetDays: 60, verificationProof: '实测数据' },
        { id: 'q3', phase: 'Q3', title: '高频迭代与瓶颈粉碎', targetDays: 90, verificationProof: '产出翻倍证据' },
        { id: 'q4', phase: 'Q4', title: '年终5X成果交付', targetDays: 120, verificationProof: '全体验收报告' }
      ],
      muskDirective: '马斯克监督令：别为拖延找借口，立即砍掉非核心动作，24小时内交出下一份成果！'
    });
  }
});

// 马斯克 极限监督审计：识破“线性慢速陷阱”与“假努力”，发出硬核督导令
app.post('/api/coach/musk-supervision', async (req: Request, res: Response) => {
  const { goalTitle, currentProgress, actualWork, oneYearTarget, recentLogs } = req.body;

  const prompt = `你现在是埃隆·马斯克（Elon Musk）化身的【极限监督官与生产力总工程师】。
你的监督风格：
- 冷酷、直白、严密、极度厌恶“假努力”和“形式主义”。
- 如果用户只是在做些表面琐碎工作、做规划、看教程或打磨不重要的边角料，无情指出他正在掉进【5年线性慢速陷阱（Linear Trap）】！
- 给出 5X 航向评分 (0-100)，评估当前速度状态，并下达一条不可推卸的【24小时马斯克监督令】。

被监督的目标：
- 目标: ${goalTitle || '极速战略目标'}
- 1年倒逼指标: ${oneYearTarget || '1年完成5年进度'}
- 当前声称进度: ${currentProgress || 0}%
- 最近实际工作产出记录: ${actualWork || '无详细产出记录'}
- 补充日志上下文: ${JSON.stringify(recentLogs || []).slice(0, 300)}

请输出严格的 JSON 对象（不要附加其他文字）：
{
  "velocityScore": 85,
  "paceEvaluation": "on_pace_5x", // 可选: ahead_of_5x(领先), on_pace_5x(在轨), lagging_risk(滞后风险), linear_trap(严重陷入假努力/线性陷阱)
  "blockerAlert": "指出他目前最致命的时间黑洞或伪需求",
  "ruthlessAudit": "一段约80字的马斯克风格冷酷审计：直切要害，剖析假努力",
  "muskDirective": "严苛的【24小时执行令】：明确要求在未来24小时内必须拿出的具体交付物"
}`;

  if (!ai) {
    return res.json({
      velocityScore: 82,
      paceEvaluation: 'on_pace_5x',
      blockerAlert: '谨防把时间消耗在打磨次要排版与次要工具链上，核心交付物才是唯一衡量尺度。',
      ruthlessAudit: '你的大方向正确，但仍保留了太多传统线性思维。你还在等什么完美时机？真实世界里没有完美，只有谁的迭代速度更快。',
      muskDirective: '马斯克24小时督导令：砍掉今天的一切非紧急事务，在今晚睡前必须交付一件可以被外部检验的核心成果！'
    });
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.3,
      },
    });

    const parsed = JSON.parse(response.text?.trim() || '{}');
    res.json(parsed);
  } catch (err: any) {
    console.error('Musk supervision error:', err);
    res.json({
      velocityScore: 78,
      paceEvaluation: 'on_pace_5x',
      blockerAlert: '注意避免陷入过度思考却迟迟不交付的线性陷阱。',
      ruthlessAudit: '永远不要去优化一个根本不该存在的工作环节。审视你今天做的事，有哪一件是在假装忙碌？',
      muskDirective: '马斯克监督令：今天结束前，拿出能直接验证用户痛点的最小交付物！'
    });
  }
});

// 目标实现：AI 教练深度诊断与交流会话 (Streaming SSE)
app.post('/api/coach/goal-consultation-chat', async (req: Request, res: Response) => {
  const { goal, messages, contextData } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array is required' });
  }

  // Set up SSE headers for streaming
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const systemPrompt = `你是一位融合了埃隆·马斯克（Elon Musk）第一性原理工程思维、纳瓦尔·拉威肯特高杠杆思维以及顶尖战略教练体系的【极限目标突破与排期总教练】。
你当前正在就用户的特定极限加速目标（目标：1年完成5年进度）进行【一对一深度诊断与排期最优安排交流】。

【当前被诊断的目标全貌】：
- 目标名称: ${goal?.title || '未命名极速目标'}
- 所属维度: ${goal?.category || 'career'}
- 原始5年愿景: ${goal?.fiveYearVision || '无'}
- 倒逼1年极限指标: ${goal?.oneYearTarget || '无'}
- 底层物理事实 (第一性原理): ${goal?.firstPrinciples?.fundamentalTruth || '无'}
- 必须砍掉的伪流程: ${JSON.stringify(goal?.firstPrinciples?.deletedProcesses || [])}
- 当前核心限速瓶颈: ${goal?.firstPrinciples?.coreBottleneck || '无'}
- 非常规破局路径: ${goal?.firstPrinciples?.unconventionalPath || '无'}
- 当前配置的里程碑: ${JSON.stringify(goal?.milestones || [])}
- 航向评分: ${goal?.supervision?.velocityScore || 85} (${goal?.supervision?.paceEvaluation || '在轨'})
- 当前最新督导令: ${goal?.supervision?.muskDirective || '无'}
- 辅助上下文: ${contextData ? JSON.stringify(contextData) : '无'}

【教练交流原则】：
1. 语言风格：专业、尖锐、务实、直截了当。绝不鼓励“假努力”，绝不容忍“用形式上的忙碌掩盖战略上的懒惰”。
2. 深度诊断：如果用户感到时间不够用、推进卡顿或信心动摇，运用“第一性原理”和“五步工作法”帮其无情砍减非核心琐事，找出真正的 Rate-limiting Step（限速瓶颈）。
3. 给出最优安排：在交谈中提出明确的排期重构思路、最小交付切片和优先级排序。
4. 格式规范：使用优雅清晰的 Markdown 排版，重点突出，最后给出 1 个最具穿透力的诊断提问或 1 个未来 24 小时内的启动动作。`;

  const sendFallback = async () => {
    const fallbackText = `### 💡 AI 教练深度诊断与突破建议

针对目标【${goal?.title || '当前目标'}】，结合 1 年倒逼 5 年进度的高杠杆模型，我为你诊断出以下关键突破点：

1. **破除隐形假努力**：
   - 检查你最近是否把时间花费在“找教程”、“美化排版”或“过度思考”上。
   - 记住马斯克第一戒律：**永远不要优化根本不该存在的工作环节**。

2. **锁定核心限速瓶颈**：
   - 当前阻碍周转的核心阻力往往是**“交付物与外界真实反馈之间的距离”**。
   - 只要你的成果还没放到真实受众眼前，所有内部迭代都只是主观假设。

3. **建议的最优推进动作**：
   - 将 Q1 里程碑颗粒度切到 48 小时内可交付的最小切片。
   - 点击上方【✨ 一键生成最优安排方案】，我可以立即为你重组并排出一套最精简、交付证据硬核的里程碑。

**🎯 教练诊断追问**：
> 如果本周只能交付一件能在真实世界中被验证的粗糙产出，那会是什么？`;

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
    console.error('Goal consultation error:', error);
    res.write(`data: ${JSON.stringify({ text: '\n\n*(诊断会话波动，切换为本地离线诊断建议)*\n\n' })}\n\n`);
    await sendFallback();
  }
});

// 目标实现：AI 教练为目标生成【最优重排方案与里程碑】(Structured JSON)
app.post('/api/coach/goal-optimize-arrangement', async (req: Request, res: Response) => {
  const { goal, dialogueHistory, constraints } = req.body;

  if (!goal) {
    return res.status(400).json({ error: 'goal object is required' });
  }

  const prompt = `你现在是埃隆·马斯克（Elon Musk）工程团队的总规划师化身与第一性原理教练。
请根据以下【5X极限目标】的背景、当前诊断交流记录，以及用户的实际约束条件，为该目标量身定制一套【最优推进安排（The Optimal Arrangement）】。

【目标资料】：
- 目标名称: ${goal.title}
- 维度类别: ${goal.category}
- 5年愿景: ${goal.fiveYearVision}
- 1年倒逼指标: ${goal.oneYearTarget}
- 底层物理事实: ${goal.firstPrinciples?.fundamentalTruth || ''}
- 原定瓶颈: ${goal.firstPrinciples?.coreBottleneck || ''}
- 当前里程碑: ${JSON.stringify(goal.milestones || [])}
- 用户补充约束/诉求: ${constraints || '追求极致高杠杆与最少阻力，砍掉一切伪流程'}
- 双方诊断对话摘要: ${JSON.stringify(dialogueHistory || []).slice(0, 800)}

【重排优化原则】：
1. 里程碑重组：将Q1-Q4重新精简为4个阶段，每个阶段必须有明确的【targetDays】、【聚焦单点】和【拒绝打假的客观验证证据(verificationProof)】。
2. 极限砍负：删减一切非必需步骤，把交付时间大幅前置（Q1重点是跑通闭环，而非追求规模）。
3. 破局切片：明确未来48小时内必须击穿的第一破局动作（CoreFocusImmediate）。

请严格输出 JSON 对象（无任何其他文字或 markdown 包装）：
{
  "diagnosisSummary": "一针见血的当前状态与卡点诊断总结（约60字）",
  "reasoning": "为什么这样重排里程碑能避开假努力并实现5X极限加速的底层逻辑（约80字）",
  "coreFocusImmediate": "未来48小时内必须死磕完成的最核心破局动作（具体、可交付）",
  "newBottleneck": "重新提炼出的当前唯一核心限速瓶颈（Rate-limiting step）",
  "newUnconventionalPath": "绕开常规低效排队的非常规破局战术",
  "weeklyPacingGuideline": "每周工时节奏分配与防假努力戒律（如每周投入核心工时，严禁无交付的空转）",
  "optimizedMilestones": [
    {
      "id": "opt-q1",
      "phase": "Q1",
      "title": "精炼重组后的Q1里程碑标题（极速破局）",
      "targetDays": 30,
      "completed": false,
      "verificationProof": "严苛的客观可检验硬证据（如代码上线、交易订单、实物指标）"
    },
    {
      "id": "opt-q2",
      "phase": "Q2",
      "title": "精炼重组后的Q2里程碑标题（打通第二战线）",
      "targetDays": 60,
      "completed": false,
      "verificationProof": "客观可检验硬证据"
    },
    {
      "id": "opt-q3",
      "phase": "Q3",
      "title": "精炼重组后的Q3里程碑标题（高频迭代与产能翻倍）",
      "targetDays": 90,
      "completed": false,
      "verificationProof": "客观可检验硬证据"
    },
    {
      "id": "opt-q4",
      "phase": "Q4",
      "title": "精炼重组后的Q4里程碑标题（达成5年终局指标）",
      "targetDays": 120,
      "completed": false,
      "verificationProof": "终局硬指标审计报告"
    }
  ],
  "coachDirective": "严苛的马斯克监督训令（直接、有力、拒绝借口）"
}`;

  if (!ai) {
    return res.json({
      diagnosisSummary: `针对【${goal.title}】，当前最大风险在于初期试图兼顾过多非核心要素，稀释了穿透力。`,
      reasoning: '基于第一性原理，将交付周期压缩到最小单元，通过Q1极速MVP获取真实世界反馈，以此为锚点撬动后续增长。',
      coreFocusImmediate: '在未来48小时内，关闭一切次要任务，交付一份粗糙但能跑通闭环的最小原型。',
      newBottleneck: '从方案设计到外部真实用户产生直接反馈的闭环延迟。',
      newUnconventionalPath: '不等待完整系统构建，直接以最小可交付单点测试真实响应。',
      weeklyPacingGuideline: '每周锁定至少12小时黄金深度工时，所有时间只用于产生交付物，严禁以准备为借口拖延。',
      optimizedMilestones: [
        {
          id: 'opt-q1-' + Date.now(),
          phase: 'Q1',
          title: 'Q1 极限破局：交付最小可用MVP闭环并获取真实反馈',
          targetDays: 30,
          completed: false,
          verificationProof: '客观上线链接、实际交易凭证或体检数值'
        },
        {
          id: 'opt-q2-' + Date.now(),
          phase: 'Q2',
          title: 'Q2 消除限速瓶颈：打通规模化通道，周转率提升200%',
          targetDays: 60,
          completed: false,
          verificationProof: '周转效率与产出数据报告'
        },
        {
          id: 'opt-q3-' + Date.now(),
          phase: 'Q3',
          title: 'Q3 极限迭代：建立自动化与第二杠杆支点',
          targetDays: 90,
          completed: false,
          verificationProof: '产出指标翻倍的验收数据'
        },
        {
          id: 'opt-q4-' + Date.now(),
          phase: 'Q4',
          title: 'Q4 达成5年级终局指标：完成系统固化与年终审计',
          targetDays: 120,
          completed: false,
          verificationProof: '年度硬指标审计报告'
        }
      ],
      coachDirective: '马斯克监督令：计划已经精简到极限，现在唯一的变量是你的执行速度。48小时内交出第一件成果！'
    });
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.3,
      },
    });

    const parsed = JSON.parse(response.text?.trim() || '{}');
    res.json(parsed);
  } catch (err: any) {
    console.error('Goal optimize arrangement error:', err);
    res.json({
      diagnosisSummary: `针对【${goal.title}】，首要任务是识别伪需求，将全部注意力集中于核心交付物。`,
      reasoning: '剥离一切装饰性流程，以最硬核的交付标准推进，确保每一步都有客观外部证据验证。',
      coreFocusImmediate: '立刻启动第一步核心交付动作，今晚之前产出可被检验的初稿。',
      newBottleneck: '想法到交付物外部检验的周期过长。',
      newUnconventionalPath: '跳过冗余规划，以原型直接验证真实价值。',
      weeklyPacingGuideline: '每周专注唯一主线，拒绝一切低杠杆杂务打扰。',
      optimizedMilestones: [
        {
          id: 'opt-q1',
          phase: 'Q1',
          title: 'Q1 极限突破MVP闭环',
          targetDays: 30,
          completed: false,
          verificationProof: '交付物硬证据'
        },
        {
          id: 'opt-q2',
          phase: 'Q2',
          title: 'Q2 规模化消除瓶颈',
          targetDays: 60,
          completed: false,
          verificationProof: '产出翻倍证据'
        },
        {
          id: 'opt-q3',
          phase: 'Q3',
          title: 'Q3 自动化杠杆锁定',
          targetDays: 90,
          completed: false,
          verificationProof: '系统自动化指标'
        },
        {
          id: 'opt-q4',
          phase: 'Q4',
          title: 'Q4 达成5年级终局指标',
          targetDays: 120,
          completed: false,
          verificationProof: '终局验收审计'
        }
      ],
      coachDirective: '马斯克监督令：停止空想，现在就迈出第一步！'
    });
  }
});

// 7. Universal AI Autofill Endpoint for all modular blocks
app.post('/api/ai/autofill', async (req: Request, res: Response) => {
  const { type, context = {} } = req.body;

  if (!type) {
    return res.status(400).json({ error: 'autofill type is required' });
  }

  // Pre-configured rich heuristic fallbacks for every type
  const getFallback = () => {
    if (type === 'goal') {
      const cat = context.category || 'career';
      const presets: Record<string, any> = {
        career: {
          title: '构建单兵AI独立软件矩阵，实现年营收100万与全球化交付',
          category: 'career',
          fiveYearVision: '常规路线：组建5人团队，融天使轮，花2年设计架构，再花2年缓慢打磨产品并做销售推介。',
          oneYearTarget: '倒逼1年：利用AI全栈与第一性原理，48小时上线MVP，以真实付费为唯一检验，年内迭代3款高转化工具。',
          fundamentalTruth: '软件的本质是为用户节省时间或创造收入；只要核心代码跑通并解决真痛点，多余的流程和冗员都是熵增。',
          deletedProcesses: [
            '删掉未见用户前的长篇架构设计与无用PPT',
            '删掉过早的微服务与过度设计',
            '删掉无实质交付的内部会议',
          ],
          coreBottleneck: '从功能实现到推送到目标用户面前并产生第一笔付款的反馈闭环周期。',
          unconventionalPath: '在海外技术社区与社媒公开构建(Build in Public)，以预售和终身优惠直接检验付费意愿。',
          muskDirective: '马斯克监督令：停止在内部反复打磨！本周末前把最简版本推给10位潜在用户，拿到真实硬反馈！',
          milestones: [
            { phase: 'Q1', title: 'Q1 极限破局：完成首款高痛点工具上线并获得第一批种子付费用户', verificationProof: 'Stripe真实收款账单与生产环境访问链接' },
            { phase: 'Q2', title: 'Q2 消除限速瓶颈：打通海外自然搜索流量与社群裂变通路', verificationProof: '月活突破5000且转化率维持在3%以上的数据报告' },
            { phase: 'Q3', title: 'Q3 杠杆复制：将核心系统自动化，矩阵式上线第2款协同产品', verificationProof: '双产品合并MRR突破5万元的财务报表' },
            { phase: 'Q4', title: 'Q4 达成5年级终局指标：年累计营收破百万并建立全自动运转流', verificationProof: '年度硬财务审计报告与资产自动化运行证据' },
          ],
        },
        health: {
          title: '重塑体能与代谢引擎：体脂降至15%并跑通全马',
          category: 'health',
          fiveYearVision: '常规路线：断断续续办健身卡，盲目试错食谱，拖延到中年才被迫进行健康干预。',
          oneYearTarget: '倒逼1年：精准心率训练+纯天然洁净饮食，Q2半马破2小时，Q4全马完赛且体脂达到运动员级健康水准。',
          fundamentalTruth: '人体的本质是一台能量代谢热力学机器；热量缺口+渐进超负荷+深度睡眠即是全部真理。',
          deletedProcesses: ['删掉无计划的佛系散步', '删掉花哨但无效的高价补剂', '删掉深夜暴饮暴食的情绪性进食'],
          coreBottleneck: '晨间启动跑步的心理阻抗与训练后的疲劳恢复效率。',
          unconventionalPath: '睡前将跑步装备置于床头，建立2分钟无痛触发器，引入心率带客观数据驱动配速。',
          muskDirective: '马斯克监督令：身体是承载5X雄心的唯一物理硬件。今晚10:30必须断网熄灯，明天早晨6:00踏出家门！',
          milestones: [
            { phase: 'Q1', title: 'Q1 有氧筑基：连续12周每周跑步30公里，静息心率降至60以下', verificationProof: 'Garmin/Apple Watch训练日志客观导出记录' },
            { phase: 'Q2', title: 'Q2 配速突破：成功挑战半程马拉松并破2小时完赛', verificationProof: '官方半马完赛证书与净计时芯片数据' },
            { phase: 'Q3', title: 'Q3 力量与核心防伤重塑：深蹲达到1.5倍体重，体脂率降至16%', verificationProof: 'InBody专业体成分体检单' },
            { phase: 'Q4', title: 'Q4 达成5年级终局指标：全程马拉松安全完赛，身体素质全面跃升', verificationProof: '全马奖牌与年度三甲医院全套体检优异指标' },
          ],
        },
        wealth: {
          title: '构建抗脆弱被动现金流系统，年被动收入达到30万元',
          category: 'wealth',
          fiveYearVision: '常规路线：靠存死工资，等待每年微薄加薪，漫长积累第一桶金。',
          oneYearTarget: '倒逼1年：通过高杠杆数字资产与高收益被动现金流项目，实现被动月入2.5万。',
          fundamentalTruth: '财富来自于为你创造现金流的资产，而非出售时间的工资；利用代码与媒体杠杆才能突破时间边界。',
          deletedProcesses: ['删掉追涨杀跌的情绪化短线操作', '删掉为低回报繁杂琐事耗费的时间', '删掉盲目听信内幕消息'],
          coreBottleneck: '可复制的数字商品或高现金流业务的第一批规模化分发渠道。',
          unconventionalPath: '利用自媒体建立利基垂直影响力，将专业工作流打包为高客单知识资产与工具模板。',
          muskDirective: '马斯克监督令：停止出卖体力时间！本周内上线首个可被无限复制的自动化数字产品并开放购买！',
          milestones: [
            { phase: 'Q1', title: 'Q1 打造核心数字资产并完成首发验证', verificationProof: '首批50位付费用户交易明细' },
            { phase: 'Q2', title: 'Q2 建立自动化销售漏斗与长期邮件分发体系', verificationProof: '转化漏斗数据与稳定的日均现金流' },
            { phase: 'Q3', title: 'Q3 搭建多资产现金流矩阵，月被动现金流入破2万', verificationProof: '月度银行流水凭证' },
            { phase: 'Q4', title: 'Q4 达成5年级终局指标：年化现金流突破30万，达成财务安全线', verificationProof: '资产负债表与税单审计证据' },
          ],
        },
        mindset: {
          title: '建立第一性原理心智操作系统，深度阅读50部硬核典籍并输出思想体系',
          category: 'mindset',
          fiveYearVision: '常规路线：随手翻翻畅销书，浅尝辄止，思维认知停留在人云亦云的表层。',
          oneYearTarget: '倒逼1年：精读50部横跨物理、演化生物学与经典哲学的顶尖专著，每周公开发表深度长文复盘。',
          fundamentalTruth: '人类认知的大多数焦虑源于信息过载与二阶假说；唯有回归数学、物理与斯多葛经典，方能获得定力。',
          deletedProcesses: ['删掉短视频与快餐资讯信息流', '删掉虚荣的浅层社交', '删掉未经思考的被动吸收'],
          coreBottleneck: '每日能否雷打不动守住前90分钟进行高难度深度心流阅读与推导。',
          unconventionalPath: '以费曼学习法为内核：每学完一个核心思维模型，必须用最白话的语言向外界讲通并接受质疑。',
          muskDirective: '马斯克监督令：立刻关掉一切垃圾信息源！今晚就写下你对当前最困惑问题的物理本质拆解！',
          milestones: [
            { phase: 'Q1', title: 'Q1 心智断舍离：彻底清除数字噪音，精读12部科学与哲学硬核原著', verificationProof: '输出12篇万字结构化精读手记' },
            { phase: 'Q2', title: 'Q2 思维模型重塑：归纳整理出包含20个顶级心智模型的个人认知库', verificationProof: '公开个人知识库与推导图谱' },
            { phase: 'Q3', title: 'Q3 决策实践闭环：将第一性原理应用于重大工作与生活抉择', verificationProof: '复盘记录集与决策正确率提升数据' },
            { phase: 'Q4', title: 'Q4 达成5年级终局指标：出版或公开发布个人思维演进白皮书', verificationProof: '完整知识体系文档与读者硬核反馈' },
          ],
        },
      };
      return presets[cat] || presets.career;
    }

    if (type === 'project') {
      const cat = context.category || 'career';
      const presets: Record<string, any> = {
        career: {
          title: '核心交付物极速突破战役',
          category: 'career',
          description: '运用第一性原理，砍掉一切伪流程，快速跑通核心业务交付闭环。',
          priority: 'high',
          energyCost: 'recharging',
          weeklyHours: 4,
          targetDate: new Date(Date.now() + 60 * 86400000).toISOString().split('T')[0],
          mentalModel: '80/20 法则与 MVP 极限精益验证',
          successCriteria: '完成端到端核心功能交付，并获得外部真实用户正面反馈。',
          nextMicroAction: '梳理核心流程最小可交付清单，并在48小时内写下第一版原型草稿。',
          milestones: [
            { title: '完成核心流程最小原型梳理与技术验证', targetDays: 7 },
            { title: '内部自测跑通并修复所有阻断性问题', targetDays: 20 },
            { title: '面向种子用户发布并收集真实数据反馈', targetDays: 45 },
          ],
        },
        health: {
          title: '精力充沛重塑计划：晨跑与洁净饮食',
          category: 'health',
          description: '建立高抗逆力的身体底座，通过周期化跑步和深度睡眠提升日常专注力。',
          priority: 'high',
          energyCost: 'recharging',
          weeklyHours: 3.5,
          targetDate: new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0],
          mentalModel: '习惯回路触发器 (Cue-Routine-Reward)',
          successCriteria: '静息心率降至60以下，每周稳定完成3次有氧慢跑。',
          nextMicroAction: '今晚22:30前准时断开电子屏幕，准备好明早跑步装备。',
          milestones: [
            { title: '连续2周保持早睡早起与低碳洁净饮食', targetDays: 14 },
            { title: '突破单次有氧跑10公里，配速平稳', targetDays: 35 },
            { title: '完成全身体脂与心肺耐力阶段性复测', targetDays: 60 },
          ],
        },
        wealth: {
          title: '抗脆弱资产与现金流基石搭建',
          category: 'wealth',
          description: '梳理家庭资产负债表，理顺自动化定投机制，探索第二被动收入来源。',
          priority: 'medium',
          energyCost: 'neutral',
          weeklyHours: 2.5,
          targetDate: new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0],
          mentalModel: '巴菲特护城河与纳瓦尔特定知识杠杆',
          successCriteria: '建立清晰的资产配置流水账，被动收入占比持续提升。',
          nextMicroAction: '完成过去半年的财务开销复盘，砍掉3项无效隐性订阅。',
          milestones: [
            { title: '完成全口径个人资产负债表梳理', targetDays: 7 },
            { title: '建立自动化定投通道与6个月紧急备用金账户', targetDays: 30 },
            { title: '调研并上线首个低边际成本数字产品', targetDays: 60 },
          ],
        },
      };
      return presets[cat] || presets.career;
    }

    if (type === 'today_plan') {
      return {
        oneThingGoal: '攻坚核心业务交付物，完成关键逻辑闭环并发送外部验证',
        plannedHours: 3.5,
        plannedOutput: '完成核心模块交付并产出可直接检验的证据链接',
        actualAction: '专注心流3小时，彻底解决关键瓶颈并完成对外交付',
        actualHours: 3.0,
        actualOutput: '已按既定高标准完成关键交付并向相关方发送验证通知',
        fulfillmentRate: 95,
        deviationReason: '执行极为专注，前序时间块未受到任何外部无意义打扰',
        leverageType: 'high_leverage',
        coachTip: '今日推倒了核心多米诺骨牌，保持这种单点穿透的节奏！',
      };
    }

    if (type === 'daily_log') {
      return {
        highlight: '在晨间黄金心流时间内，攻坚完成了最具阻抗的核心交付任务！',
        energyLevel: 4,
        mood: 'focused',
        wins: [
          '拒绝了2个无意义的会议和低价值打扰，守住了3小时深度工作块',
          '把模糊复杂的项目拆解成了立刻可动手的3个小步，克服了拖延',
          '晚上进行了30分钟轻松慢跑，身心完全充盈',
        ],
        friction: '下午略微受到碎片化资讯吸引，明天需要更严格地限制手机使用。',
        projectNote: '核心项目进展扎实，关键指标已前进了一大步。',
        progressDelta: 8,
      };
    }

    return {};
  };

  if (!ai) {
    return res.json(getFallback());
  }

  try {
    let prompt = '';
    if (type === 'goal') {
      prompt = `你是一位融合了埃隆·马斯克第一性原理、乔布斯极致专注与顶级战略教练的智囊。
请针对以下背景，为用户全要素自动构想一份能够【在1年内完成5年进度】的硬核 5X 加速目标方案：
【用户提供的信息/偏好】：${JSON.stringify(context)}

请严格返回符合以下 JSON Schema 的纯 JSON 对象（不要用 markdown 代码块包围，只输出纯 JSON）：
{
  "title": "目标的硬核名称（简明有力，直击本质）",
  "category": "${context.category || 'career'}",
  "fiveYearVision": "原本按传统保守、线性拖延的做法需要5年才能完成的愿景描绘",
  "oneYearTarget": "倒逼在1年内极限突破的硬核量化指标（5X时间压缩，只保留核心本质）",
  "fundamentalTruth": "剥离一切表象与借口后，这项事情最底层的物理本质与事实真理",
  "deletedProcesses": ["必须彻底删减的伪流程/伪需求1", "必须彻底删减的伪流程/伪需求2", "必须彻底删减的伪流程/伪需求3"],
  "coreBottleneck": "当前唯一的最大限速瓶颈(Rate-limiting step)",
  "unconventionalPath": "非常规、非线性的破局路径与杠杆支点",
  "muskDirective": "马斯克式的严厉不可妥协训令（要求48小时内产生真实交付证据）",
  "milestones": [
    { "phase": "Q1", "title": "Q1 极限破局：最小可用闭环与真实世界反馈", "verificationProof": "客观不可篡改的交付硬凭据" },
    { "phase": "Q2", "title": "Q2 消除瓶颈：打通规模化通道", "verificationProof": "周转效率指标" },
    { "phase": "Q3", "title": "Q3 极限迭代：建立自动化支点", "verificationProof": "产出翻倍证据" },
    { "phase": "Q4", "title": "Q4 达成5年级终局指标：固化成果与年度审计", "verificationProof": "硬核审计报告" }
  ]
}`;
    } else if (type === 'project') {
      prompt = `请作为专业人生教练，为用户自动构思一个高杠杆、结构化的人生项目：
【用户上下文/分类】：${JSON.stringify(context)}

请严格返回符合以下 JSON Schema 的纯 JSON 对象：
{
  "title": "项目名称",
  "category": "${context.category || 'career'}",
  "description": "项目简要背景与核心使命",
  "priority": "high",
  "energyCost": "recharging",
  "weeklyHours": 3.5,
  "targetDate": "2026-12-31",
  "mentalModel": "适用的核心思维模型（如 80/20、费曼学习法、第一性原理等）",
  "successCriteria": "清晰、可检验的验收成功标准",
  "nextMicroAction": "今日或未来24小时内可无痛启动的极简微行动",
  "milestones": [
    { "title": "里程碑 1", "targetDays": 7 },
    { "title": "里程碑 2", "targetDays": 21 },
    { "title": "里程碑 3", "targetDays": 45 }
  ]
}`;
    } else if (type === 'today_plan') {
      prompt = `请根据《最重要的事只有一件》与《纳瓦尔宝典》的高杠杆原则，为用户智能推演今日的最优计划与实绩模板：
【参考上下文】：${JSON.stringify(context)}

请严格返回符合以下 JSON Schema 的纯 JSON 对象：
{
  "oneThingGoal": "今天最不可妥协的唯一一件高杠杆要事",
  "plannedHours": 3.0,
  "plannedOutput": "完成后具体的关键交付物",
  "actualAction": "实际落地的关键攻坚动作",
  "actualHours": 3.0,
  "actualOutput": "实际完成的高质量成果",
  "fulfillmentRate": 92,
  "deviationReason": "执行平稳高效，专注心流无外部打扰",
  "leverageType": "high_leverage",
  "coachTip": "一句话高能量教练点评"
}`;
    } else if (type === 'daily_log') {
      prompt = `请为用户生成一份充满洞察力与正向动量的每日高水平复盘日志样例：
【参考上下文】：${JSON.stringify(context)}

请严格返回符合以下 JSON Schema 的纯 JSON 对象：
{
  "highlight": "今日最亮眼的高光时刻或顿悟",
  "energyLevel": 4,
  "mood": "focused",
  "wins": ["今日小胜 1", "今日小胜 2", "今日小胜 3"],
  "friction": "今日遇到的阻抗或反思观察",
  "projectNote": "关联项目的具体推进要点",
  "progressDelta": 8
}`;
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.6,
      },
    });

    const parsed = JSON.parse(response.text?.trim() || '{}');
    res.json(parsed);
  } catch (err: any) {
    console.error('AI autofill error:', err);
    res.json(getFallback());
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
