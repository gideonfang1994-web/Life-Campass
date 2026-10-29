import { ProjectCategory, ProjectPriority, ProjectStatus, EnergyCost, MoodType } from '../types';

export interface DimensionMeta {
  key: ProjectCategory;
  label: string;
  enLabel: string;
  tagline: string;
  iconName: string;
  mentalModels: string[];
  northStarQuestion: string;
  bgLight: string;
  borderColor: string;
  textColor: string;
  accent: string;
}

export const DIMENSIONS_CONFIG: Record<ProjectCategory, DimensionMeta> = {
  career: {
    key: 'career',
    label: '工作与事业',
    enLabel: 'Work & Career',
    tagline: '极度求真 · 杠杆交付 · 消除假努力',
    iconName: 'Briefcase',
    mentalModels: ['深度工作法 (Deep Work)', '第一性原理', 'OKR 关键成果', '80/20 杠杆律'],
    northStarQuestion: '如果今天只交付一件真正推动大局的事，那件核心交付物是什么？',
    bgLight: 'bg-zinc-50 dark:bg-zinc-900',
    borderColor: 'border-zinc-200 dark:border-zinc-800',
    textColor: 'text-zinc-800 dark:text-zinc-200',
    accent: 'bg-zinc-900 dark:bg-zinc-100',
  },
  health: {
    key: 'health',
    label: '身体与健康',
    enLabel: 'Body & Vitality',
    tagline: '生理电量守恒 · 低心率有氧 · 睡眠防线',
    iconName: 'Activity',
    mentalModels: ['MAF180 低心率有氧', '昼夜节律重置', '无痛微习惯', '能量池管理'],
    northStarQuestion: '我今天是在为身体蓄能，还是在透支未来的健康资产？',
    bgLight: 'bg-emerald-50/50 dark:bg-emerald-950/20',
    borderColor: 'border-emerald-200/80 dark:border-emerald-900/60',
    textColor: 'text-emerald-900 dark:text-emerald-200',
    accent: 'bg-emerald-600',
  },
  wealth: {
    key: 'wealth',
    label: '财富与自由',
    enLabel: 'Wealth & Freedom',
    tagline: '复利被动现金流 · 自动化定投 · 负债分流',
    iconName: 'TrendingUp',
    mentalModels: ['被动收入飞轮', '发薪日自动定投', '极简生活降欲', '边际成本归零'],
    northStarQuestion: '我的财务体系是否正随着时间产生正向复利，而非随着时间增加焦虑？',
    bgLight: 'bg-amber-50/50 dark:bg-amber-950/20',
    borderColor: 'border-amber-200/80 dark:border-amber-900/60',
    textColor: 'text-amber-900 dark:text-amber-200',
    accent: 'bg-amber-600',
  },
  mindset: {
    key: 'mindset',
    label: '认知与心智',
    enLabel: 'Cognition & Mindset',
    tagline: '第一性原理 · 费曼输出闭环 · 斯多葛平静',
    iconName: 'Brain',
    mentalModels: ['费曼学习法', '控制二分法 (斯多葛)', '心智卡片盒 (Zettelkasten)', '逆向思考法'],
    northStarQuestion: '我是在进行深度认知重构，还是在进行浮于表面的信息松鼠式囤积？',
    bgLight: 'bg-indigo-50/50 dark:bg-indigo-950/20',
    borderColor: 'border-indigo-200/80 dark:border-indigo-900/60',
    textColor: 'text-indigo-900 dark:text-indigo-200',
    accent: 'bg-indigo-600',
  },
  relationship: {
    key: 'relationship',
    label: '关系与家庭',
    enLabel: 'Connection & Family',
    tagline: '高质量数字断联 · 深度倾听 · 情感账户',
    iconName: 'Heart',
    mentalModels: ['情感银行账户', '非暴力沟通', '数字断联陪伴'],
    northStarQuestion: '我是否给予了身边最重要的人完全不可分割的专注与温柔？',
    bgLight: 'bg-rose-50/50 dark:bg-rose-950/20',
    borderColor: 'border-rose-200/80 dark:border-rose-900/60',
    textColor: 'text-rose-900 dark:text-rose-200',
    accent: 'bg-rose-500',
  },
  creation: {
    key: 'creation',
    label: '创造与热爱',
    enLabel: 'Creativity & Passions',
    tagline: '终生探索 · 不计功利的表达 · 匠人精神',
    iconName: 'Sparkles',
    mentalModels: ['自由创作晨间流', '作品思维', '初学者心态'],
    northStarQuestion: '今天我创造了什么让我自己由衷欣喜的事物？',
    bgLight: 'bg-teal-50/50 dark:bg-teal-950/20',
    borderColor: 'border-teal-200/80 dark:border-teal-900/60',
    textColor: 'text-teal-900 dark:text-teal-200',
    accent: 'bg-teal-600',
  },
};

export const CATEGORY_CONFIG = DIMENSIONS_CONFIG;

export const PRIORITY_CONFIG: Record<
  ProjectPriority,
  { label: string; badgeClass: string; dotClass: string }
> = {
  high: {
    label: '高优主线',
    badgeClass: 'bg-stone-900 text-white dark:bg-white dark:text-stone-950 font-semibold',
    dotClass: 'bg-rose-500',
  },
  medium: {
    label: '稳进支线',
    badgeClass: 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300',
    dotClass: 'bg-stone-500',
  },
  low: {
    label: '弹性探索',
    badgeClass: 'bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400',
    dotClass: 'bg-stone-400',
  },
};

export const STATUS_CONFIG: Record<
  ProjectStatus,
  { label: string; color: string; bg: string }
> = {
  sprinting: {
    label: '冲刺攻坚',
    color: 'text-amber-800 dark:text-amber-300 font-bold',
    bg: 'bg-amber-50 border-amber-200/80 dark:bg-amber-950/40 dark:border-amber-900',
  },
  on_track: {
    label: '稳步推进',
    color: 'text-emerald-800 dark:text-emerald-300 font-medium',
    bg: 'bg-emerald-50 border-emerald-200/80 dark:bg-emerald-950/40 dark:border-emerald-900',
  },
  needs_attention: {
    label: '遇阻偏离',
    color: 'text-rose-800 dark:text-rose-300 font-semibold',
    bg: 'bg-rose-50 border-rose-200/80 dark:bg-rose-950/40 dark:border-rose-900',
  },
  paused: {
    label: '战略冻结',
    color: 'text-stone-500 dark:text-stone-400',
    bg: 'bg-stone-100 border-stone-200 dark:bg-stone-800 dark:border-stone-700',
  },
  completed: {
    label: '圆满达成',
    color: 'text-zinc-800 dark:text-zinc-200 font-medium',
    bg: 'bg-zinc-100 border-zinc-200 dark:bg-zinc-800 dark:border-zinc-700',
  },
};

export const ENERGY_CONFIG: Record<
  EnergyCost,
  { label: string; icon: string; desc: string; badge: string }
> = {
  recharging: {
    label: '充电滋养型',
    icon: '🔋',
    desc: '做完后精神饱满、充满内在秩序',
    badge: 'bg-emerald-50 text-emerald-800 border border-emerald-200/60 dark:bg-emerald-950/40 dark:text-emerald-300',
  },
  balanced: {
    label: '平衡中性型',
    icon: '⚖️',
    desc: '正常精力支出，节奏平稳',
    badge: 'bg-stone-100 text-stone-700 border border-stone-200 dark:bg-stone-800 dark:text-stone-300',
  },
  draining: {
    label: '高负荷消耗型',
    icon: '⚡',
    desc: '高心力开销，需配合充足休整',
    badge: 'bg-rose-50 text-rose-800 border border-rose-200/60 dark:bg-rose-950/40 dark:text-rose-300',
  },
};

export const MOOD_CONFIG: Record<
  MoodType,
  { label: string; emoji: string; color: string }
> = {
  thriving: { label: '生机勃勃', emoji: '✨', color: 'text-amber-600' },
  calm: { label: '平和宁静', emoji: '🌱', color: 'text-emerald-600' },
  focused: { label: '心流专注', emoji: '🎯', color: 'text-zinc-800 dark:text-zinc-200' },
  tired: { label: '身心疲惫', emoji: '🥱', color: 'text-stone-500' },
  anxious: { label: '焦虑起伏', emoji: '🌧️', color: 'text-indigo-600' },
};
