import { LifeProject, DailyLog, LifeWheelScores, RetrospectiveReport, PlanActualRecord, AcceleratedGoal } from '../types';

export const INITIAL_PROJECTS: LifeProject[] = [
  {
    id: 'proj-1',
    title: '【工作杠杆】构建无许可代码与产品复利资产 (SaaS)',
    category: 'career',
    description: '践行《纳瓦尔宝典》代码与媒体杠杆：打造睡后自动化交付产品，沉淀自身专长，跑通全球付费闭环。',
    priority: 'high',
    status: 'sprinting',
    progress: 70,
    targetDate: '2026-12-15',
    energyCost: 'recharging',
    weeklyHours: 12,
    mentalModel: '代码与媒体无许可杠杆 · The ONE Thing 唯一多米诺主线',
    successCriteria: '完成MVP上线，Stripe全球计费闭环，获取前10位付费用户建立正向现金流',
    nextMicroAction: '录制20秒产品核心交互GIF放在Landing page首屏',
    milestones: [
      { id: 'm1-1', title: '完成核心交互闭环与原型验证', completed: true, completedAt: '2026-10-10' },
      { id: 'm1-2', title: '接入Stripe全球支付与自动化计费', completed: true, completedAt: '2026-10-22' },
      { id: 'm1-3', title: '制作无许可推介视频并在ProductHunt/Twitter发布', completed: false },
      { id: 'm1-4', title: '达成前10位付费用户，建立持续MRR复利', completed: false },
    ],
    checkins: [
      { id: 'c1', date: '2026-10-27', note: '修复了本地缓存同步问题，支付体验极其流畅', progressDelta: 5 },
      { id: 'c2', date: '2026-10-28', note: '完成定价页面设计，聚焦高杠杆功能展示', progressDelta: 5 },
    ],
    createdAt: '2026-10-01',
    updatedAt: '2026-10-28',
  },
  {
    id: 'proj-2',
    title: '【健康基石】MAF180 低心率有氧与生理能量池管理',
    category: 'health',
    description: '纳瓦尔心法：“身体健康是幸福的先决条件；生病的人只有一个愿望。”通过MAF180重塑心肺底座，守护7.5小时睡眠。',
    priority: 'high',
    status: 'on_track',
    progress: 55,
    targetDate: '2026-11-30',
    energyCost: 'recharging',
    weeklyHours: 5,
    mentalModel: '能量守恒定律 · 无痛微习惯多米诺骨牌',
    successCriteria: '半马跑进1h55m，静息心率降至55以下，白天无需依赖高咖啡因保持清晰度',
    nextMicroAction: '今晚把跑鞋放在玄关，明晨6:30完成5公里慢跑热身',
    milestones: [
      { id: 'm2-1', title: '建立每周3次低心率跑步节奏，连续达成3周', completed: true, completedAt: '2026-10-15' },
      { id: 'm2-2', title: '完成14公里配速拉练，平均心率控制在142以内', completed: true, completedAt: '2026-10-26' },
      { id: 'm2-3', title: '完成18公里实战配速模拟跑', completed: false },
      { id: 'm2-4', title: '赛事安全完赛PB 1h55m', completed: false },
    ],
    checkins: [
      { id: 'c2-1', date: '2026-10-26', note: '周末完成了14K晨跑，心率极平稳，体感充满电量！', progressDelta: 10 },
    ],
    createdAt: '2026-10-05',
    updatedAt: '2026-10-26',
  },
  {
    id: 'proj-3',
    title: '【财富自由】自动化指数定投与自由现金流飞轮',
    category: 'wealth',
    description: '纳瓦尔：“依靠出租时间不可能致富，必须拥有产权与复利资产。”设立发薪日全自动智能定投，极简降欲。',
    priority: 'medium',
    status: 'on_track',
    progress: 80,
    targetDate: '2026-12-31',
    energyCost: 'balanced',
    weeklyHours: 1.5,
    mentalModel: '资本杠杆 · 自动复利 · 欲望减法',
    successCriteria: '全自动定投规则运行不中断，储备6个月生活备用金，每月被动收入覆盖基础生活开销20%',
    nextMicroAction: '核对上月账单，取消2项闲置云订阅服务',
    milestones: [
      { id: 'm3-1', title: '盘点净资产负债与固定月开销底账', completed: true, completedAt: '2026-10-08' },
      { id: 'm3-2', title: '设立高息活期紧急备用金账户', completed: true, completedAt: '2026-10-18' },
      { id: 'm3-3', title: '设定发薪日全自动智能定投计划', completed: true, completedAt: '2026-10-25' },
      { id: 'm3-4', title: '年度财务复盘与税费优化盘点', completed: false },
    ],
    checkins: [
      { id: 'c3-1', date: '2026-10-25', note: '自动化定投规则跑通，彻底告别看盘情绪波动', progressDelta: 20 },
    ],
    createdAt: '2026-10-02',
    updatedAt: '2026-10-25',
  },
  {
    id: 'proj-4',
    title: '【认知心智】第一性原理思维格栅与斯多葛平静',
    category: 'mindset',
    description: '《最重要的事只有一件》心法：“专注力是唯一真正的通货。”精读思维模型经典，输出卡片笔记，习得平静。',
    priority: 'medium',
    status: 'needs_attention',
    progress: 35,
    targetDate: '2026-12-31',
    energyCost: 'recharging',
    weeklyHours: 3.5,
    mentalModel: '第一性原理 · 费曼输出闭环 · 控制二分法',
    successCriteria: '精读完6本底层经典，提炼40张心智模型卡片并应用在个人重大决策中',
    nextMicroAction: '读《原则》第3章5页，并在卡片上摘抄1条核心原则',
    milestones: [
      { id: 'm4-1', title: '精读《穷查理宝典》整理20个心智模型', completed: true, completedAt: '2026-10-14' },
      { id: 'm4-2', title: '精读《原则》对照个人决策清单', completed: false },
      { id: 'm4-3', title: '精读《纳瓦尔宝典》整理杠杆清单', completed: false },
      { id: 'm4-4', title: '输出个人年度认知成长知识库', completed: false },
    ],
    checkins: [
      { id: 'c4-1', date: '2026-10-20', note: '被零碎会议冲散了时间块，需要重新划定早晨不可侵犯的4小时', progressDelta: 0 },
    ],
    createdAt: '2026-10-03',
    updatedAt: '2026-10-20',
  }
];

export const INITIAL_PLAN_ACTUAL_RECORDS: PlanActualRecord[] = [
  {
    id: 'pa-1',
    date: '2026-10-28',
    dimension: 'career',
    projectId: 'proj-1',
    oneThingGoal: '打通SaaS产品定价方案的比较矩阵与文案定稿',
    plannedHours: 3.0,
    plannedOutput: '完成定价矩阵代码编写与中英双语文案',
    actualAction: '完成了定价矩阵UI构建与文案定稿，顺带调试了多币种汇率API',
    actualHours: 3.5,
    actualOutput: '定价页面完全可用并部署在测试环境',
    fulfillmentRate: 95,
    deviationReason: '汇率API文档比预想中复杂，额外花了30分钟联调，属于必要的技术攻坚',
    leverageType: 'high_leverage',
    coachTip: '非常扎实的高杠杆产出。纳瓦尔说：用代码创造资产。这3.5小时投入将在未来持续带来边际收益。',
    createdAt: '2026-10-28T22:30:00Z',
  },
  {
    id: 'pa-2',
    date: '2026-10-27',
    dimension: 'career',
    projectId: 'proj-1',
    oneThingGoal: '完成Stripe国际支付结账流程本地联调',
    plannedHours: 2.5,
    plannedOutput: '点击升级按钮可成功跳转Stripe并收到Webhook回调',
    actualAction: '专注攻关支付逻辑，排除了Webhooks重放验证Bug',
    actualHours: 2.5,
    actualOutput: 'Stripe Checkout沙盒跑通，完成支付状态本地持久化',
    fulfillmentRate: 100,
    deviationReason: '无偏差，严格执行了《最重要的事只有一件》时间块保护',
    leverageType: 'high_leverage',
    coachTip: '100%达成！保护深度工作时间块，就是对生命资产最大的负责。',
    createdAt: '2026-10-27T22:00:00Z',
  },
  {
    id: 'pa-3',
    date: '2026-10-26',
    dimension: 'mindset',
    projectId: 'proj-4',
    oneThingGoal: '精读《原则》第二章并提炼3条决策原则',
    plannedHours: 1.5,
    plannedOutput: '产出3张原则卡片并存入心智模型库',
    actualAction: '只读了前8页，随后被微信群消息打断，转去处理非紧急工作邮件',
    actualHours: 0.5,
    actualOutput: '产出1条粗糙笔记，未达成预定闭环',
    fulfillmentRate: 35,
    deviationReason: '陷入了《最重要的事只有一件》指出的四大谎言之一：平等谎言（误把即时消息当做紧急要事）',
    leverageType: 'low_leverage',
    coachTip: '警惕假努力与低水平忙碌。明天关闭所有即时通讯通知，先做这件最重要的事。',
    createdAt: '2026-10-26T21:30:00Z',
  }
];

export const INITIAL_LOGS: DailyLog[] = [
  {
    id: 'log-1',
    date: '2026-10-27',
    energyLevel: 4,
    mood: 'thriving',
    highlight: '早晨跑步心率控制极佳，下午集中攻克了SaaS产品的Stripe结算流程',
    wins: [
      '在无干扰状态下连续专注深度工作2.5小时',
      '晚上拒绝了无意义的信息流刷屏，陪伴家人散步30分钟',
    ],
    friction: '午后有一过性的疲乏，咖啡因摄入略晚影响了入睡前平静',
    timeSpentHours: 4.5,
    createdAt: '2026-10-27T22:30:00Z',
    coachComment: '《纳瓦尔宝典》心法：保持心流与高杠杆。你的低心率跑步为高强度的脑力输出提供了稳定的生理能量支持。',
  },
  {
    id: 'log-2',
    date: '2026-10-28',
    energyLevel: 4,
    mood: 'focused',
    highlight: '完成了SaaS产品定价方案的比较矩阵与文案定稿',
    wins: [
      '在面对复杂的海外税率条款时没有退缩，查阅文档搞定了逻辑',
      '准时在23:15前放下手机准备休息',
    ],
    friction: '阅读《原则》的计划被临时打断，产生了些许微小内疚',
    timeSpentHours: 3.5,
    createdAt: '2026-10-28T22:50:00Z',
    coachComment: '《最重要的事只有一件》教导我们：卓越需要有意识的反平衡。今天的精力集中在高杠杆主线上是完全正确的战略取舍。',
  }
];

export const INITIAL_WHEEL_SCORES: LifeWheelScores = {
  career: 8,       // 事业技能 (工作)
  health: 7.5,     // 身体健康 (健康)
  wealth: 7,       // 财务自由 (财富)
  mindset: 6.5,     // 思维认知 (认知)
  relationship: 8, // 亲密关系
  family: 7.5,     // 家庭亲情
  creation: 6.5,   // 创造爱好
  peace: 7.5,      // 精神宁静
};

export const INITIAL_RETROSPECTIVE: RetrospectiveReport = {
  id: 'retro-sample',
  period: 'weekly',
  generatedAt: '2026-10-26T20:00:00Z',
  title: '第43周·人生进化战略复盘简报',
  content: `### 🌟 核心成果与动量识别 (Wins & Momentum)
1. **推倒核心多米诺骨牌**：在【独立SaaS产品】上完成了核心技术攻坚，跑通计费链路。践行《纳瓦尔宝典》理念：用代码与媒体杠杆构建终身资产。
2. **守护生理能量底座**：完成了14K长距离拉练，心率平稳，为高强度脑力输出提供了稳定的生理能量支持。
3. **消除平等谎言**：在关键时刻敢于对低价值琐事说“不”，保护了早晨的核心工作块。

### ⚠️ 能量泄漏与卡点剖析 (Bottlenecks)
- **多任务陷阱**：周中有两天试图一边写代码一边回消息，导致认知切换成本剧增。
- **应对药方**：坚决贯彻《最重要的事只有一件》：“全心投入当下这一件事，直至尘埃落定。”

### 🎯 下周 3 大不可妥协战略指令 (Top 3 Directives)
1. **多米诺首牌**：录制20秒产品演示视频并配置在首屏，开放海外内测。
2. **生理防线**：周中完成2次5K匀速跑，确保睡眠时长不低于7小时15分。
3. **认知蓄能**：利用晨起半小时完成《纳瓦尔宝典》核心章节复读。

> 💬 **纳瓦尔与教练箴言**：“如果不能彻底平静下来，你就无法看清真相。追求复利，不仅是在金钱上，更是在健康、关系和智慧上。”`
};

export const INITIAL_ACCELERATED_GOALS: AcceleratedGoal[] = [
  {
    id: 'goal-musk-1',
    title: '【工作/财富】打造年产生正向现金流的 AI 自动化产品矩阵',
    category: 'career',
    fiveYearVision: '常规5年规划：慢慢调研市场、找技术合伙人、融资、组建6人研发团队、耗时18个月研发重构、做冗长渠道投放。',
    oneYearTarget: '倒逼1年极限指标：单兵作战+AI代码杠杆，2周交付1个高痛点MVP，直接在真实市场打磨收费，年内沉淀3款盈利工具，MRR突破$10,000。',
    progress: 45,
    status: 'active',
    firstPrinciples: {
      fundamentalTruth: '软件的物理本质是几千行逻辑代码运行在云端服务器。用户付费买的是“立刻解决他的某个棘手问题”，而不是精美PPT、冗长文档或庞大团队。',
      deletedProcesses: [
        '彻底砍掉长达数月的市场调研报告（直接上极简落地页测试真实预付款）',
        '砍掉过早优化与重构（未验证需求前不写复杂微服务架构）',
        '砍掉一切非必要的外部社交与无议程会议'
      ],
      coreBottleneck: '从“代码完成”到“推送到真实用户眼前并拿到第一笔美元支付”的反馈循环时间（必须压缩到48小时内）。',
      unconventionalPath: '利用现有开源大模型API与无服务器架构，48小时上线最小闭环，在Twitter/ProductHunt等社群实时公开构建（Build in Public）以零广告费获客。'
    },
    muskAlgorithm: {
      questionRequirement: true,
      deleteWaste: true,
      simplifyOptimize: true,
      accelerateCycle: false,
      automateLeverage: false,
    },
    milestones: [
      {
        id: 'ms-m1',
        phase: 'Q1',
        title: '发布首款单功能高频痛点工具并完成Stripe支付验证',
        targetDays: 30,
        completed: true,
        completedAt: '2026-10-22',
        verificationProof: 'Stripe后台首批真实付费交易记录 + GitHub代码发布Tag v1.0'
      },
      {
        id: 'ms-m2',
        phase: 'Q2',
        title: '产品矩阵化：提炼通用用户认证与计费底座，2周内上线第二款垂直工具',
        targetDays: 60,
        completed: false,
        verificationProof: '两个独立域名稳定运转，第二款工具产生首单付费'
      },
      {
        id: 'ms-m3',
        phase: 'Q3',
        title: '极速迭代循环：用户核心流失点自动化监测，上线内容自动化分发引擎',
        targetDays: 90,
        completed: false,
        verificationProof: '自动化SEO与海外社交触达日均吸引100+独立访问'
      },
      {
        id: 'ms-m4',
        phase: 'Q4',
        title: '全面杠杆固化：年化MRR突破$10k，实现全自动无人值守现金流系统',
        targetDays: 120,
        completed: false,
        verificationProof: '年终财务财报核算，现金流稳健正向'
      }
    ],
    supervision: {
      velocityScore: 88,
      paceEvaluation: 'on_pace_5x',
      blockerAlert: '警惕不要陷入第二款产品的界面细节过度打磨陷阱，必须在下周五前让首批外部试用者上手。',
      muskDirective: '马斯克监督令：停止在内部琢磨完美设计！把未完成的原型立刻发给5位核心用户，让他们用哪怕最简陋的版本测出真实痛点。',
      lastAuditDate: '2026-10-28'
    },
    relatedProjectId: 'proj-1',
    createdAt: '2026-10-01',
    updatedAt: '2026-10-28'
  },
  {
    id: 'goal-musk-2',
    title: '【健康/体能】生物黑客级精力重塑：体脂12% + 极限抗阻与清醒心流',
    category: 'health',
    fiveYearVision: '常规5年规划：随缘健身、偶尔节食、买昂贵补剂、断断续续每年年初立志又荒废。',
    oneYearTarget: '倒逼1年极限指标：精准热量称重追踪+每周3次重训大重量复合动作+无妥协7.5小时睡眠，半年内体脂降至12%，静息心率52。',
    progress: 60,
    status: 'active',
    firstPrinciples: {
      fundamentalTruth: '人体生理是一台能量转化发动机，遵守能量守恒（热量赤字控制体脂）与超量恢复（渐进超负荷刺激肌肉合成）。不需要任何花哨动作。',
      deletedProcesses: [
        '砍掉各种网红轻食代餐包与伪科学排毒仪式（只吃原生态鸡蛋、牛肉、米饭与蔬菜）',
        '砍掉每次训练超过15分钟的无意义器械换乘与拍照发圈',
        '砍掉睡前刷手机导致皮质醇升高的恶性循环'
      ],
      coreBottleneck: '睡前1小时的光线刺激与神经兴奋度（限制了深睡眠修复，导致次日皮质醇飙升）。',
      unconventionalPath: '晚上9点半全屋进入琥珀色暖光，睡前10分钟冷水洗脸刺激迷走神经，晨起第一时间接受15分钟自然光重置昼夜节律。'
    },
    muskAlgorithm: {
      questionRequirement: true,
      deleteWaste: true,
      simplifyOptimize: true,
      accelerateCycle: true,
      automateLeverage: false,
    },
    milestones: [
      {
        id: 'ms-h1',
        phase: 'Q1',
        title: '建立全自动化饮食厨房流水线与每早空腹体重记录习惯',
        targetDays: 30,
        completed: true,
        completedAt: '2026-10-15',
        verificationProof: '连续30天晨起体脂与体重无间断曲线数据表'
      },
      {
        id: 'ms-h2',
        phase: 'Q2',
        title: '体脂稳步降至15%以下，深蹲达到1.5倍自重',
        targetDays: 60,
        completed: true,
        completedAt: '2026-10-26',
        verificationProof: 'InBody身体成分分析单扫描件'
      },
      {
        id: 'ms-h3',
        phase: 'Q3',
        title: '达成12%体脂率目标，日间精力充沛无咖啡因崩塌',
        targetDays: 90,
        completed: false,
        verificationProof: '专业体脂夹与医院体检报告'
      },
      {
        id: 'ms-h4',
        phase: 'Q4',
        title: '固化生理底座：全马完赛或半马PB 1h50m，终身自动化执行',
        targetDays: 120,
        completed: false,
        verificationProof: '官方赛事计时芯片完赛证书'
      }
    ],
    supervision: {
      velocityScore: 92,
      paceEvaluation: 'ahead_of_5x',
      blockerAlert: '当前推进速度优于5X预期，需注意高强度力量训练后的中枢神经疲劳恢复。',
      muskDirective: '马斯克监督令：生理能量是一切智力输出的硬件底盘。睡前彻底杜绝电子屏幕，把睡眠当成猎鹰火箭发射前的系统校验一样严苛对待。',
      lastAuditDate: '2026-10-27'
    },
    relatedProjectId: 'proj-2',
    createdAt: '2026-10-01',
    updatedAt: '2026-10-27'
  }
];

