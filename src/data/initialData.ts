import { LifeProject, DailyLog, LifeWheelScores, RetrospectiveReport } from '../types';

export const INITIAL_PROJECTS: LifeProject[] = [
  {
    id: 'proj-1',
    title: '独立SaaS产品：海外市场从0到1上线',
    category: 'career',
    description: '打造一款聚焦生产力效率的微工具，完成产品MVP构建、Stripe支付打通与ProductHunt首发。',
    priority: 'high',
    status: 'sprinting',
    progress: 65,
    targetDate: '2026-12-15',
    energyCost: 'recharging',
    weeklyHours: 12,
    nextMicroAction: '录制20秒产品核心交互演示GIF并放在Landing page首屏',
    milestones: [
      { id: 'm1-1', title: '完成核心功能交互闭环与原型验证', completed: true, completedAt: '2026-10-10' },
      { id: 'm1-2', title: '接入用户认证与计费系统', completed: true, completedAt: '2026-10-22' },
      { id: 'm1-3', title: '撰写Show Hacker News与Product Hunt推文草稿', completed: false },
      { id: 'm1-4', title: '获得前10位付费用户与第一笔MRR', completed: false },
    ],
    checkins: [
      { id: 'c1', date: '2026-10-27', note: '修复了登录状态的本地缓存同步问题，体验流畅多了', progressDelta: 5 },
      { id: 'c2', date: '2026-10-28', note: '完成定价页面的对比卡片设计', progressDelta: 5 },
    ],
    createdAt: '2026-10-01',
    updatedAt: '2026-10-28',
  },
  {
    id: 'proj-2',
    title: '半程马拉松 1小时55分 突破挑战',
    category: 'health',
    description: '通过低心率有氧(MAF180)基础跑与每周一次间歇跑，重塑心肺耐力，完成个人PB。',
    priority: 'high',
    status: 'on_track',
    progress: 50,
    targetDate: '2026-11-30',
    energyCost: 'recharging',
    weeklyHours: 5,
    nextMicroAction: '今晚把跑鞋和跑步袜放在玄关，明晨6:30完成5公里慢摇热身',
    milestones: [
      { id: 'm2-1', title: '建立每周3次跑步作息，连续达成3周', completed: true, completedAt: '2026-10-15' },
      { id: 'm2-2', title: '完成一次14公里长距离配速拉练(LSD)', completed: true, completedAt: '2026-10-26' },
      { id: 'm2-3', title: '完成18公里模拟测试配速跑', completed: false },
      { id: 'm2-4', title: '赛事当日安全完赛并冲进1h55m', completed: false },
    ],
    checkins: [
      { id: 'c2-1', date: '2026-10-26', note: '周末完成了14K晨跑，平均心率142，体感很舒适！', progressDelta: 10 },
    ],
    createdAt: '2026-10-05',
    updatedAt: '2026-10-26',
  },
  {
    id: 'proj-3',
    title: '构建「睡后收入」资产定投与现金流系统',
    category: 'wealth',
    description: '梳理每月被动收入流与固定支出，建立核心宽基指数定投自动化，设立6个月生活备用金。',
    priority: 'medium',
    status: 'on_track',
    progress: 80,
    targetDate: '2026-12-31',
    energyCost: 'balanced',
    weeklyHours: 1.5,
    nextMicroAction: '核对上月信用卡与订阅账单，取消2项闲置云服务订阅',
    milestones: [
      { id: 'm3-1', title: '梳理全盘净资产与固定月开销底账', completed: true, completedAt: '2026-10-08' },
      { id: 'm3-2', title: '设立高息活期紧急备用金账户', completed: true, completedAt: '2026-10-18' },
      { id: 'm3-3', title: '设定每月发薪日全自动智能定投计划', completed: true, completedAt: '2026-10-25' },
      { id: 'm3-4', title: '完成年度财务复盘与税费优化盘点', completed: false },
    ],
    checkins: [
      { id: 'c3-1', date: '2026-10-25', note: '自动化定投规则跑通，再也不用手动择时纠结了', progressDelta: 20 },
    ],
    createdAt: '2026-10-02',
    updatedAt: '2026-10-25',
  },
  {
    id: 'proj-4',
    title: '心智升维：深度精读6本底层思维模型经典',
    category: 'mindset',
    description: '告别碎片化短视频刺激，每周深度阅读3小时，产出卡片笔记与个人思维格栅。',
    priority: 'medium',
    status: 'needs_attention',
    progress: 30,
    targetDate: '2026-12-31',
    energyCost: 'recharging',
    weeklyHours: 3.5,
    nextMicroAction: '读《原则》第3章5页，并在浮动卡片上摘抄1条核心原则',
    milestones: [
      { id: 'm4-1', title: '精读《穷查理宝典》并整理20个心智模型', completed: true, completedAt: '2026-10-14' },
      { id: 'm4-2', title: '精读《原则》（达利欧）并对照个人决策清单', completed: false },
      { id: 'm4-3', title: '精读《纳瓦尔宝典》整理个人杠杆清单', completed: false },
      { id: 'm4-4', title: '输出个人年度心智成长知识库公开博客', completed: false },
    ],
    checkins: [
      { id: 'c4-1', date: '2026-10-20', note: '最近工作忙，连续4天没能静心打开实体书，需要重置微习惯', progressDelta: 0 },
    ],
    createdAt: '2026-10-03',
    updatedAt: '2026-10-20',
  },
  {
    id: 'proj-5',
    title: '每周高质量无手机家庭陪伴日',
    category: 'relationship',
    description: '每周日设定4小时“数字断联”陪伴时间，一起户外徒步、料理晚餐或深度交谈，加深情感连接。',
    priority: 'high',
    status: 'on_track',
    progress: 75,
    targetDate: '2026-12-31',
    energyCost: 'recharging',
    weeklyHours: 4,
    nextMicroAction: '周五晚上提前预约周日野餐露营地的车位',
    milestones: [
      { id: 'm5-1', title: '达成连续4周周日无手机半日陪伴', completed: true, completedAt: '2026-10-26' },
      { id: 'm5-2', title: '策划一次周末双人短途秋日自驾旅行', completed: false },
      { id: 'm5-3', title: '整理过去一年的家庭精选摄影相册画册', completed: false },
    ],
    checkins: [
      { id: 'c5-1', date: '2026-10-27', note: '周日一起去了植物园野餐，彼此聊了对未来生活的期待，内心很充盈。', progressDelta: 10 },
    ],
    createdAt: '2026-10-01',
    updatedAt: '2026-10-27',
  },
  {
    id: 'proj-6',
    title: '个人摄影集创作与城市漫游',
    category: 'creation',
    description: '用定焦镜头记录当下生活城市的清晨与黄昏光影，编撰《折叠城市的呼吸》主题图册。',
    priority: 'low',
    status: 'on_track',
    progress: 40,
    targetDate: '2027-01-31',
    energyCost: 'recharging',
    weeklyHours: 2,
    nextMicroAction: '将上周末扫街拍的RAW格式照片导入Lightroom做第一轮三星筛选',
    milestones: [
      { id: 'm6-1', title: '确定影集主题、视觉色调与叙事框架', completed: true, completedAt: '2026-10-12' },
      { id: 'm6-2', title: '累积拍摄超过500张初选胶片/数码素材', completed: true, completedAt: '2026-10-24' },
      { id: 'm6-3', title: '精选30张做色彩校准与配文排版', completed: false },
      { id: 'm6-4', title: '印制实体个人试版摄影画册一本', completed: false },
    ],
    checkins: [
      { id: 'c6-1', date: '2026-10-24', note: '老城区雨后天晴的光线绝美，抓拍到了几张很有故事感的街头肖像', progressDelta: 10 },
    ],
    createdAt: '2026-10-10',
    updatedAt: '2026-10-24',
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
    coachComment: '做得好！你正处于良性动量循环中。特别赞赏你用低心率跑步给大脑提供了高质量氧气，让下午的复杂逻辑攻坚更顺畅。',
  },
  {
    id: 'log-2',
    date: '2026-10-28',
    energyLevel: 3,
    mood: 'focused',
    highlight: '完成了SaaS产品定价方案的比较矩阵与文案定稿',
    wins: [
      '在面对复杂的海外税率条款时没有退缩，查阅文档搞定了逻辑',
      '准时在23:15前放下手机准备休息',
    ],
    friction: '阅读《原则》的计划又被临时工作邮件打断，产生了些许微小内疚',
    timeSpentHours: 3.5,
    createdAt: '2026-10-28T22:50:00Z',
    coachComment: '请停止对“未完成阅读”的内疚惩罚。你今天的注意力资源主要用在了高优先级的SaaS开发上，这是合理的资源置换。明天用“5分钟微阅读”重启即可。',
  }
];

export const INITIAL_WHEEL_SCORES: LifeWheelScores = {
  career: 8,       // 事业技能
  health: 7.5,     // 身体健康
  wealth: 7,       // 财务自由
  mindset: 6,       // 思维心智
  relationship: 8, // 亲密关系
  family: 7.5,     // 家庭亲情
  creation: 6.5,   // 创造爱好
  peace: 7,        // 精神宁静
};

export const INITIAL_RETROSPECTIVE: RetrospectiveReport = {
  id: 'retro-sample',
  period: 'weekly',
  generatedAt: '2026-10-26T20:00:00Z',
  title: '第43周·人生进化战略复盘简报',
  content: `### 🌟 核心成果与动量识别 (Wins & Momentum)
1. **战略主线推进扎实**：在【独立SaaS产品】上完成了核心技术攻坚，完成了计费链路闭环。从“空想”迈入到了“可验证的交付阶段”。
2. **体能底座坚韧**：完成了14K长距离拉练，心率平稳，为高强度的脑力输出提供了稳定的生理能量支持。
3. **关系资产充实**：周日家庭陪伴日做到了高专注、无屏幕，生活幸福感自评提升至8分。

### ⚠️ 能量泄漏与卡点剖析 (Bottlenecks)
- **输入型项目受阻**：【心智升维深度阅读】项目在最近两周出现连续跳票。根源在于将其设定为了“大块时间专属”，一旦白天加班，晚上就直接放弃。
- **应对药方**：将其降维为“床头翻阅3页纸”的微习惯，先保住链条不断，再追求深度。

### 🎯 下周 3 大不可妥协战略指令 (Top 3 Directives)
1. **SaaS主线**：完成产品演示短视频并配置在首屏，开放内测申请。
2. **身体防线**：周中完成2次5K匀速跑，确保睡眠时长不低于7小时15分。
3. **心智重启**：利用通勤或晨起碎片时间完成《原则》第二章节阅读。

> 💬 **教练箴言**：卓越不是偶尔的大动作，而是对微小节奏的日日守护。继续保持！`
};
