import React, { useState, useRef, useEffect } from 'react';
import {
  AcceleratedGoal,
  MuskGoalMilestone,
  ProjectCategory,
  DailyLog,
  PlanActualRecord,
  GoalConsultationMessage,
  GoalOptimalArrangement,
} from '../types';
import { CATEGORIES, CategoryItem } from '../utils/categories';
import {
  generateMuskBreakdown,
  auditMuskGoalSupervision,
  streamGoalConsultationChat,
  requestGoalOptimalArrangement,
  requestAiAutofill,
  MuskBreakdownResponse,
  MuskSupervisionResponse,
} from '../services/api';
import {
  Zap,
  Target,
  Flame,
  AlertTriangle,
  CheckCircle2,
  Circle,
  Scissors,
  Layers,
  Sparkles,
  Plus,
  Trash2,
  Edit3,
  Clock,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  Cpu,
  RefreshCw,
  ExternalLink,
  HelpCircle,
  Activity,
  ArrowRight,
  MessageSquareText,
  Send,
  Mic,
  MicOff,
  Wand2,
  ListChecks,
  Calendar,
  Check,
  X,
  Bot,
} from 'lucide-react';

interface Props {
  goals: AcceleratedGoal[];
  recentLogs: DailyLog[];
  planActualRecords: PlanActualRecord[];
  onAddGoal: (goal: AcceleratedGoal) => void;
  onUpdateGoal: (goal: AcceleratedGoal) => void;
  onDeleteGoal: (id: string) => void;
  onOpenCoachChat?: () => void;
}

export const MuskGoalAccelerationView: React.FC<Props> = ({
  goals,
  recentLogs,
  planActualRecords,
  onAddGoal,
  onUpdateGoal,
  onDeleteGoal,
  onOpenCoachChat,
}) => {
  // Filters & State
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [expandedGoalId, setExpandedGoalId] = useState<string | null>(goals[0]?.id || null);
  const [isAlgorithmGuideOpen, setIsAlgorithmGuideOpen] = useState(false);

  // Modal State for Add / Edit Goal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<AcceleratedGoal | null>(null);

  // Form Fields
  const [formTitle, setFormTitle] = useState('');
  const [formCategory, setFormCategory] = useState<ProjectCategory>('career');
  const [formFiveYearVision, setFormFiveYearVision] = useState('');
  const [formOneYearTarget, setFormOneYearTarget] = useState('');
  const [formFundamentalTruth, setFormFundamentalTruth] = useState('');
  const [formDeletedProcessesText, setFormDeletedProcessesText] = useState('');
  const [formCoreBottleneck, setFormCoreBottleneck] = useState('');
  const [formUnconventionalPath, setFormUnconventionalPath] = useState('');
  const [formMuskDirective, setFormMuskDirective] = useState('');
  const [formMilestones, setFormMilestones] = useState<MuskGoalMilestone[]>([]);
  const [isAiDecomposing, setIsAiDecomposing] = useState(false);

  // Supervision Audit State
  const [auditingGoal, setAuditingGoal] = useState<AcceleratedGoal | null>(null);
  const [isAuditing, setIsAuditing] = useState(false);
  const [supervisionResult, setSupervisionResult] = useState<MuskSupervisionResponse | null>(null);

  // AI Coach Goal Consultation & Optimal Arrangement State
  const [isConsultModalOpen, setIsConsultModalOpen] = useState(false);
  const [consultingGoal, setConsultingGoal] = useState<AcceleratedGoal | null>(null);
  const [consultTab, setConsultTab] = useState<'dialogue' | 'optimal_plan'>('dialogue');
  const [consultMessages, setConsultMessages] = useState<GoalConsultationMessage[]>([]);
  const [consultInput, setConsultInput] = useState('');
  const [isConsultStreaming, setIsConsultStreaming] = useState(false);
  const [isGeneratingOptimalPlan, setIsGeneratingOptimalPlan] = useState(false);
  const [optimalPlan, setOptimalPlan] = useState<GoalOptimalArrangement | null>(null);
  const [isConsultListening, setIsConsultListening] = useState(false);
  const [consultApplyToast, setConsultApplyToast] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (isConsultModalOpen && consultTab === 'dialogue') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [consultMessages, isConsultModalOpen, consultTab]);

  // Open Consultation Modal
  const handleOpenConsultation = (goal: AcceleratedGoal) => {
    setConsultingGoal(goal);
    setOptimalPlan(goal.lastOptimalArrangement || null);
    setConsultApplyToast(null);

    if (goal.consultationHistory && goal.consultationHistory.length > 0) {
      setConsultMessages(goal.consultationHistory);
    } else {
      setConsultMessages([
        {
          id: 'init-' + Date.now(),
          role: 'assistant',
          content: `### 🎯 目标加速诊断已接入：【${goal.title}】\n\n你好！我是你的第一性原理与战略破局教练。\n\n针对这项战役，你的核心使命是将 5 年愿景**倒逼到 1 年内极限突破**。\n- **1年倒逼指标**：\`${goal.oneYearTarget}\`\n- **当前航向评分**：\`${goal.supervision?.velocityScore || 85} / 100\`\n- **当前限速瓶颈**：\`${goal.firstPrinciples?.coreBottleneck || '尚未穿透'}\`\n\n请告诉我：你最近推进时感觉最费劲、最犹豫、或者时间被消耗在什么环节？我来帮你**穿透假努力，并做出最高效的最优推进安排**！`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    }

    setConsultTab(goal.lastOptimalArrangement ? 'optimal_plan' : 'dialogue');
    setIsConsultModalOpen(true);
  };

  // Send message in consultation chat (Streaming)
  const handleSendConsultMessage = async (customText?: string) => {
    const textToSend = (customText !== undefined ? customText : consultInput).trim();
    if (!textToSend || !consultingGoal || isConsultStreaming) return;

    const userMsg: GoalConsultationMessage = {
      id: 'user-' + Date.now(),
      role: 'user',
      content: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const newHistory = [...consultMessages, userMsg];
    setConsultMessages(newHistory);
    setConsultInput('');
    setIsConsultStreaming(true);

    const assistantMsgId = 'coach-' + Date.now();
    let accumulatedText = '';

    setConsultMessages((prev) => [
      ...prev,
      {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);

    await streamGoalConsultationChat(
      consultingGoal,
      newHistory.map((m) => ({ role: m.role, content: m.content })),
      {
        recentLogs: recentLogs.slice(0, 3),
        planActualRecords: planActualRecords.slice(0, 3),
      },
      (chunkText) => {
        accumulatedText += chunkText;
        setConsultMessages((prev) =>
          prev.map((m) => (m.id === assistantMsgId ? { ...m, content: accumulatedText } : m))
        );
      },
      () => {
        setIsConsultStreaming(false);
        const finalHistory: GoalConsultationMessage[] = [
          ...newHistory,
          {
            id: assistantMsgId,
            role: 'assistant',
            content: accumulatedText,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ];
        const updated: AcceleratedGoal = {
          ...consultingGoal,
          consultationHistory: finalHistory,
          updatedAt: new Date().toISOString(),
        };
        setConsultingGoal(updated);
        onUpdateGoal(updated);
      },
      (err) => {
        console.error('Consultation stream failed:', err);
        setIsConsultStreaming(false);
      }
    );
  };

  // Generate Optimal Arrangement for Goal
  const handleGenerateOptimalPlan = async () => {
    if (!consultingGoal) return;
    setIsGeneratingOptimalPlan(true);

    try {
      const plan = await requestGoalOptimalArrangement(
        consultingGoal,
        consultMessages.map((m) => ({ role: m.role, content: m.content }))
      );

      setOptimalPlan(plan);
      setConsultTab('optimal_plan');

      const notificationMsg: GoalConsultationMessage = {
        id: 'plan-notice-' + Date.now(),
        role: 'assistant',
        content: `### 📋 教练已为你做出【最优推进安排方案】！\n\n已根据交流诊断重新精炼了 Q1-Q4 里程碑，并锁定了未来48小时最关键的单点突破口：\`${plan.coreFocusImmediate}\`。\n请查看【最优安排方案】标签页，一键采纳并应用到当前目标！`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      const updatedHistory = [...consultMessages, notificationMsg];
      setConsultMessages(updatedHistory);

      const updatedGoal: AcceleratedGoal = {
        ...consultingGoal,
        consultationHistory: updatedHistory,
        lastOptimalArrangement: plan,
        updatedAt: new Date().toISOString(),
      };
      setConsultingGoal(updatedGoal);
      onUpdateGoal(updatedGoal);
    } catch (err) {
      console.error(err);
      alert('生成最优安排方案失败，请重试');
    } finally {
      setIsGeneratingOptimalPlan(false);
    }
  };

  // Apply Optimal Plan into Goal State
  const handleApplyOptimalPlan = () => {
    if (!consultingGoal || !optimalPlan) return;

    const updatedGoal: AcceleratedGoal = {
      ...consultingGoal,
      milestones: optimalPlan.optimizedMilestones,
      firstPrinciples: {
        ...consultingGoal.firstPrinciples,
        coreBottleneck: optimalPlan.newBottleneck || consultingGoal.firstPrinciples.coreBottleneck,
        unconventionalPath:
          optimalPlan.newUnconventionalPath || consultingGoal.firstPrinciples.unconventionalPath,
      },
      supervision: {
        ...consultingGoal.supervision,
        muskDirective: optimalPlan.coachDirective || consultingGoal.supervision.muskDirective,
        velocityScore: Math.max(consultingGoal.supervision.velocityScore, 92),
        paceEvaluation: 'ahead_of_5x',
        lastAuditDate: new Date().toISOString().split('T')[0],
      },
      lastOptimalArrangement: optimalPlan,
      updatedAt: new Date().toISOString(),
    };

    setConsultingGoal(updatedGoal);
    onUpdateGoal(updatedGoal);
    setConsultApplyToast('🎉 最优安排方案已成功采纳！里程碑已重组，瓶颈与第一破局点已全面刷新！');
    setTimeout(() => {
      setConsultApplyToast(null);
    }, 4500);
  };

  // Speech Recognition for Consultation Chat
  const handleToggleConsultSpeech = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('当前浏览器未支持 Web 语音识别，请直接键入。');
      return;
    }
    if (isConsultListening) {
      setIsConsultListening(false);
      return;
    }
    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'zh-CN';
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.onstart = () => setIsConsultListening(true);
      recognition.onend = () => setIsConsultListening(false);
      recognition.onerror = () => setIsConsultListening(false);
      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          setConsultInput((prev) => (prev ? prev + ' ' + transcript : transcript));
        }
      };
      recognition.start();
    } catch (e) {
      setIsConsultListening(false);
    }
  };

  // Open Add Goal Modal
  const handleOpenAddModal = () => {
    setEditingGoal(null);
    setFormTitle('');
    setFormCategory('career');
    setFormFiveYearVision('');
    setFormOneYearTarget('');
    setFormFundamentalTruth('');
    setFormDeletedProcessesText('');
    setFormCoreBottleneck('');
    setFormUnconventionalPath('');
    setFormMuskDirective('');
    setFormMilestones([
      { id: 'q1-' + Date.now(), phase: 'Q1', title: 'Q1 极限MVP破局与真实反馈', completed: false, verificationProof: '真实上线交易/代码仓库' },
      { id: 'q2-' + Date.now(), phase: 'Q2', title: 'Q2 规模化复制与消除瓶颈', completed: false, verificationProof: '周转效率翻倍数据' },
      { id: 'q3-' + Date.now(), phase: 'Q3', title: 'Q3 极限产能扩张与高频迭代', completed: false, verificationProof: '产出指标检验' },
      { id: 'q4-' + Date.now(), phase: 'Q4', title: 'Q4 达成5年级终局指标并固化', completed: false, verificationProof: '年终全面指标验收报告' },
    ]);
    setIsModalOpen(true);
  };

  // Open Edit Goal Modal
  const handleOpenEditModal = (goal: AcceleratedGoal) => {
    setEditingGoal(goal);
    setFormTitle(goal.title);
    setFormCategory(goal.category);
    setFormFiveYearVision(goal.fiveYearVision);
    setFormOneYearTarget(goal.oneYearTarget);
    setFormFundamentalTruth(goal.firstPrinciples.fundamentalTruth);
    setFormDeletedProcessesText(goal.firstPrinciples.deletedProcesses.join('\n'));
    setFormCoreBottleneck(goal.firstPrinciples.coreBottleneck);
    setFormUnconventionalPath(goal.firstPrinciples.unconventionalPath);
    setFormMuskDirective(goal.supervision.muskDirective || '');
    setFormMilestones(goal.milestones);
    setIsModalOpen(true);
  };

  // Clear Goal Form completely
  const handleClearGoalForm = () => {
    setFormTitle('');
    setFormFiveYearVision('');
    setFormOneYearTarget('');
    setFormFundamentalTruth('');
    setFormDeletedProcessesText('');
    setFormCoreBottleneck('');
    setFormUnconventionalPath('');
    setFormMuskDirective('');
    setFormMilestones([]);
  };

  // Milestone operations in Goal Form
  const handleAddMilestone = () => {
    const nextQuarter = `Q${formMilestones.length + 1}`;
    setFormMilestones([
      ...formMilestones,
      {
        id: 'm-' + Date.now(),
        phase: nextQuarter,
        title: '',
        completed: false,
        verificationProof: '',
      },
    ]);
  };

  const handleRemoveMilestone = (id: string) => {
    setFormMilestones(formMilestones.filter((m) => m.id !== id));
  };

  const handleUpdateMilestone = (id: string, field: 'phase' | 'title' | 'verificationProof', value: string) => {
    setFormMilestones(
      formMilestones.map((m) => (m.id === id ? { ...m, [field]: value } : m))
    );
  };

  // AI Musk Autofill All Fields (works from scratch or from prompt)
  const handleAutofillEntireGoal = async () => {
    setIsAiDecomposing(true);
    try {
      const data = await requestAiAutofill('goal', {
        category: formCategory,
        currentTitle: formTitle,
        fiveYearVision: formFiveYearVision,
      });

      if (data.title) setFormTitle(data.title);
      if (data.fiveYearVision) setFormFiveYearVision(data.fiveYearVision);
      if (data.oneYearTarget) setFormOneYearTarget(data.oneYearTarget);
      if (data.fundamentalTruth) setFormFundamentalTruth(data.fundamentalTruth);
      if (Array.isArray(data.deletedProcesses)) {
        setFormDeletedProcessesText(data.deletedProcesses.join('\n'));
      }
      if (data.coreBottleneck) setFormCoreBottleneck(data.coreBottleneck);
      if (data.unconventionalPath) setFormUnconventionalPath(data.unconventionalPath);
      if (data.muskDirective) setFormMuskDirective(data.muskDirective);

      if (Array.isArray(data.milestones) && data.milestones.length > 0) {
        setFormMilestones(
          data.milestones.map((m: any, idx: number) => ({
            id: 'm-auto-' + Date.now() + '-' + idx,
            phase: m.phase || `Q${idx + 1}`,
            title: m.title,
            completed: false,
            verificationProof: m.verificationProof || '客观交付证据',
          }))
        );
      }
    } catch (err) {
      console.error(err);
      alert('AI 自动填充服务异常，请稍后重试');
    } finally {
      setIsAiDecomposing(false);
    }
  };

  // AI Musk Breakdown Trigger in Modal
  const handleTriggerAiBreakdown = async () => {
    if (!formTitle.trim()) {
      await handleAutofillEntireGoal();
      return;
    }
    setIsAiDecomposing(true);
    try {
      const res: MuskBreakdownResponse = await generateMuskBreakdown({
        title: formTitle,
        category: formCategory,
        fiveYearVision: formFiveYearVision || formTitle,
        context: '个人单兵作战，寻求运用马斯克第一性原理和五步法在1年内完成5年进度',
      });

      setFormOneYearTarget(res.oneYearTarget);
      setFormFundamentalTruth(res.fundamentalTruth);
      setFormDeletedProcessesText(res.deletedProcesses.join('\n'));
      setFormCoreBottleneck(res.coreBottleneck);
      setFormUnconventionalPath(res.unconventionalPath);
      setFormMuskDirective(res.muskDirective);

      if (res.milestones && res.milestones.length > 0) {
        setFormMilestones(
          res.milestones.map((m, idx) => ({
            id: 'm-' + idx + '-' + Date.now(),
            phase: m.phase,
            title: m.title,
            targetDays: m.targetDays || (idx + 1) * 30,
            completed: false,
            verificationProof: m.verificationProof || '客观交付证据',
          }))
        );
      }
    } catch (err) {
      console.error(err);
      alert('智能拆解调用失败，已填充默认推荐模型');
    } finally {
      setIsAiDecomposing(false);
    }
  };

  // Save Goal
  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) return;

    const deletedList = formDeletedProcessesText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    const goalToSave: AcceleratedGoal = {
      id: editingGoal ? editingGoal.id : 'goal-' + Date.now(),
      title: formTitle.trim(),
      category: formCategory,
      fiveYearVision: formFiveYearVision.trim() || formTitle.trim(),
      oneYearTarget: formOneYearTarget.trim() || `1年极限指标：完成【${formTitle.trim()}】的本质跨越。`,
      progress: editingGoal ? editingGoal.progress : 15,
      status: 'active',
      firstPrinciples: {
        fundamentalTruth:
          formFundamentalTruth.trim() || '事物的物理底层极其简单，不被过往类比与传统借口所束缚。',
        deletedProcesses:
          deletedList.length > 0
            ? deletedList
            : ['砍掉未经验证的前置调研与冗长规划', '砍掉非核心架构与过早优化', '砍掉任何无实质交付物的流程'],
        coreBottleneck: formCoreBottleneck.trim() || '从构思到面对真实世界反馈的循环时间延迟。',
        unconventionalPath: formUnconventionalPath.trim() || '极速小步试错，48小时交付一版最小可用原型。',
      },
      muskAlgorithm: editingGoal
        ? editingGoal.muskAlgorithm
        : {
            questionRequirement: true,
            deleteWaste: true,
            simplifyOptimize: false,
            accelerateCycle: false,
            automateLeverage: false,
          },
      milestones: formMilestones.length > 0 ? formMilestones : [
        { id: 'q1', phase: 'Q1', title: 'Q1 完成单点MVP闭环', completed: false, verificationProof: '交付成果硬证据' },
        { id: 'q2', phase: 'Q2', title: 'Q2 规模化与第二战线', completed: false, verificationProof: '效率翻倍报告' },
        { id: 'q3', phase: 'Q3', title: 'Q3 高频迭代消除瓶颈', completed: false, verificationProof: '产出指标检验' },
        { id: 'q4', phase: 'Q4', title: 'Q4 达成5年级终局指标', completed: false, verificationProof: '年终全面验收' },
      ],
      supervision: {
        velocityScore: editingGoal ? editingGoal.supervision.velocityScore : 85,
        paceEvaluation: editingGoal ? editingGoal.supervision.paceEvaluation : 'on_pace_5x',
        blockerAlert: editingGoal ? editingGoal.supervision.blockerAlert : '警惕不要陷入次要细节打磨，紧扣核心限速瓶颈。',
        muskDirective:
          formMuskDirective.trim() ||
          '马斯克监督令：如果一个目标需要5年，问问自己为什么不能在6个月做完？今天就交付你的第一版原型！',
        lastAuditDate: new Date().toISOString().split('T')[0],
      },
      createdAt: editingGoal ? editingGoal.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (editingGoal) {
      onUpdateGoal(goalToSave);
    } else {
      onAddGoal(goalToSave);
    }
    setIsModalOpen(false);
  };

  // Toggle Musk Algorithm Step
  const handleToggleAlgorithmStep = (
    goal: AcceleratedGoal,
    stepKey: keyof AcceleratedGoal['muskAlgorithm']
  ) => {
    const updated: AcceleratedGoal = {
      ...goal,
      muskAlgorithm: {
        ...goal.muskAlgorithm,
        [stepKey]: !goal.muskAlgorithm[stepKey],
      },
      updatedAt: new Date().toISOString(),
    };
    onUpdateGoal(updated);
  };

  // Toggle Milestone Complete
  const handleToggleMilestone = (goal: AcceleratedGoal, milestoneId: string) => {
    const today = new Date().toISOString().split('T')[0];
    const updatedMilestones = goal.milestones.map((m) => {
      if (m.id === milestoneId) {
        const nextState = !m.completed;
        return {
          ...m,
          completed: nextState,
          completedAt: nextState ? today : undefined,
        };
      }
      return m;
    });

    const completedCount = updatedMilestones.filter((m) => m.completed).length;
    const newProgress = Math.round((completedCount / updatedMilestones.length) * 100);

    const updated: AcceleratedGoal = {
      ...goal,
      milestones: updatedMilestones,
      progress: newProgress,
      updatedAt: new Date().toISOString(),
    };
    onUpdateGoal(updated);
  };

  // Trigger Musk Radical Supervision Audit
  const handleStartSupervision = async (goal: AcceleratedGoal) => {
    setAuditingGoal(goal);
    setIsAuditing(true);
    setSupervisionResult(null);

    // Collect recent actual work related to this goal
    const actualWorkSnippet = planActualRecords
      .slice(0, 5)
      .map((r) => `[${r.date}] 计划:${r.oneThingGoal} | 实际:${r.actualAction} | 达成率:${r.fulfillmentRate}%`)
      .join('; ');

    try {
      const res = await auditMuskGoalSupervision({
        goalTitle: goal.title,
        oneYearTarget: goal.oneYearTarget,
        currentProgress: goal.progress,
        actualWork: actualWorkSnippet,
        recentLogs: recentLogs.slice(0, 4),
      });

      setSupervisionResult(res);

      // Automatically update the goal's supervision status
      const updated: AcceleratedGoal = {
        ...goal,
        supervision: {
          velocityScore: res.velocityScore,
          paceEvaluation: res.paceEvaluation,
          blockerAlert: res.blockerAlert,
          muskDirective: res.muskDirective,
          lastAuditDate: new Date().toISOString().split('T')[0],
        },
        updatedAt: new Date().toISOString(),
      };
      onUpdateGoal(updated);
    } catch (err) {
      console.error(err);
      alert('审计请求出现异常，请稍后重试');
    } finally {
      setIsAuditing(false);
    }
  };

  // Filtered Goals
  const filteredGoals =
    selectedCategory === 'all'
      ? goals
      : goals.filter((g) => g.category === selectedCategory);

  // High-level aggregates
  const avgVelocity =
    goals.length > 0
      ? Math.round(goals.reduce((acc, g) => acc + (g.supervision.velocityScore || 80), 0) / goals.length)
      : 85;

  const totalWasteDeleted = goals.reduce(
    (acc, g) => acc + (g.firstPrinciples?.deletedProcesses?.length || 0),
    0
  );

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Hero Header: 5X Acceleration & Musk Principles */}
      <div className="bg-gradient-to-br from-stone-900 via-stone-850 to-stone-950 text-white rounded-3xl p-6 sm:p-8 shadow-xl border border-stone-800 relative overflow-hidden">
        {/* Background glow decoration */}
        <div className="absolute -right-16 -top-16 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -left-16 -bottom-16 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-stone-800/80">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-amber-400 font-mono text-xs tracking-wider uppercase font-extrabold flex items-center gap-1.5">
                  <Flame className="w-4 h-4 fill-amber-400" />
                  5X 极限加速引擎 · 1年完成5年进度
                </span>
                <span className="text-stone-500 text-xs">·</span>
                <span className="text-stone-300 text-xs font-medium">
                  融入埃隆·马斯克第一性原理与算法五步法
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
                目标实现 · 极限破局工作台
              </h1>
              <p className="text-stone-300 text-sm sm:text-base mt-1.5 max-w-2xl leading-relaxed">
                “如果你有一个10年目标，问问自己为什么不能在6个月内做完？即便没做完，你走过的路也会远超按部就班的人。”
              </p>
            </div>

            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 shrink-0 w-full md:w-auto mt-2 md:mt-0">
              <button
                type="button"
                onClick={() => setIsAlgorithmGuideOpen(!isAlgorithmGuideOpen)}
                className="flex-1 sm:flex-none justify-center px-3.5 py-2.5 rounded-2xl bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs sm:text-sm font-semibold transition flex items-center gap-1.5 border border-stone-700/80 min-h-[44px]"
              >
                <Cpu className="w-4 h-4 text-amber-400" />
                <span>马斯克算法五步法</span>
                {isAlgorithmGuideOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>

              <button
                type="button"
                onClick={handleOpenAddModal}
                className="flex-1 sm:flex-none justify-center px-4 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs sm:text-sm font-extrabold transition shadow-lg flex items-center gap-1.5 min-h-[44px]"
              >
                <Plus className="w-4 h-4" />
                <span>建立 5X 极限目标</span>
              </button>
            </div>
          </div>

          {/* Core Metrics Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-4 pt-4 sm:pt-6">
            <div className="bg-stone-800/60 rounded-2xl p-3 sm:p-4 border border-stone-700/60">
              <div className="text-[11px] sm:text-xs text-stone-400 font-medium">5X 极限航向速度指数</div>
              <div className="text-xl sm:text-3xl font-mono font-extrabold text-amber-400 mt-1 flex items-baseline gap-1">
                {avgVelocity}
                <span className="text-[10px] sm:text-xs text-stone-400 font-sans font-normal">/ 100</span>
              </div>
              <div className="text-[10px] sm:text-[11px] text-stone-400 mt-1">杜绝低效慢速假努力</div>
            </div>

            <div className="bg-stone-800/60 rounded-2xl p-3 sm:p-4 border border-stone-700/60">
              <div className="text-[11px] sm:text-xs text-stone-400 font-medium">已极度删减无用环节</div>
              <div className="text-xl sm:text-3xl font-mono font-extrabold text-emerald-400 mt-1 flex items-baseline gap-1">
                {totalWasteDeleted}
                <span className="text-[10px] sm:text-xs text-stone-400 font-sans font-normal">个工序</span>
              </div>
              <div className="text-[10px] sm:text-[11px] text-stone-400 mt-1">五步法第二步：狠删零件</div>
            </div>

            <div className="bg-stone-800/60 rounded-2xl p-3 sm:p-4 border border-stone-700/60">
              <div className="text-[11px] sm:text-xs text-stone-400 font-medium">活跃倒逼战役</div>
              <div className="text-xl sm:text-3xl font-mono font-extrabold text-white mt-1">
                {goals.length}
              </div>
              <div className="text-[10px] sm:text-[11px] text-stone-400 mt-1">5年跨度压缩至12个月</div>
            </div>

            <div className="bg-stone-800/60 rounded-2xl p-3 sm:p-4 border border-stone-700/60">
              <div className="text-[11px] sm:text-xs text-stone-400 font-medium">核心破局机制</div>
              <div className="text-xs sm:text-sm font-bold text-amber-300 mt-2">
                48小时真实反馈闭环
              </div>
              <div className="text-[10px] sm:text-[11px] text-stone-400 mt-0.5">以终为始 · 拒绝排队</div>
            </div>
          </div>
        </div>
      </div>

      {/* Musk 5-Step Algorithm Collapsible Reference */}
      {isAlgorithmGuideOpen && (
        <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-3xl p-6 shadow-sm space-y-4 transition-all">
          <div className="flex items-center justify-between pb-3 border-b border-stone-100 dark:border-stone-800">
            <div className="flex items-center gap-2">
              <Cpu className="w-5 h-5 text-amber-500" />
              <h3 className="font-extrabold text-base text-stone-900 dark:text-white">
                马斯克五步工作法（The 5-Step Algorithm）—— 极速破局核心逻辑
              </h3>
            </div>
            <span className="text-xs text-stone-400">Tesla & SpaceX 敏捷生产力法典</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 text-xs sm:text-sm">
            <div className="p-3.5 rounded-2xl bg-stone-50 dark:bg-stone-850 border border-stone-200/60 dark:border-stone-800 space-y-1.5">
              <div className="font-bold text-amber-600 dark:text-amber-400">① 质疑每一个需求</div>
              <div className="text-stone-600 dark:text-stone-300 text-xs leading-relaxed">
                质疑谁提出来的？哪怕是聪明人提出的也必须质疑。删除任何不符合底层逻辑的规定。
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-stone-50 dark:bg-stone-850 border border-stone-200/60 dark:border-stone-800 space-y-1.5">
              <div className="font-bold text-red-600 dark:text-red-400">② 极限删除零件/步骤</div>
              <div className="text-stone-600 dark:text-stone-300 text-xs leading-relaxed">
                如果你最终没有不得不加回至少10%的内容，说明你删得还不够狠！狠砍非核心环节。
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-stone-50 dark:bg-stone-850 border border-stone-200/60 dark:border-stone-800 space-y-1.5">
              <div className="font-bold text-blue-600 dark:text-blue-400">③ 简化或优化</div>
              <div className="text-stone-600 dark:text-stone-300 text-xs leading-relaxed">
                千万不要去优化一个根本不该存在的东西！最常见的错误就是花大力气优化无用步骤。
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-stone-50 dark:bg-stone-850 border border-stone-200/60 dark:border-stone-800 space-y-1.5">
              <div className="font-bold text-emerald-600 dark:text-emerald-400">④ 极度加速周期</div>
              <div className="text-stone-600 dark:text-stone-300 text-xs leading-relaxed">
                将按月或按年的工期压缩为按天甚至按小时。前三步做彻底后，全力倒逼迭代速度。
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-stone-50 dark:bg-stone-850 border border-stone-200/60 dark:border-stone-800 space-y-1.5">
              <div className="font-bold text-purple-600 dark:text-purple-400">⑤ 自动化与杠杆锁定</div>
              <div className="text-stone-600 dark:text-stone-300 text-xs leading-relaxed">
                最后一步才是自动化。不要在需求未推敲或步骤未删减前盲目追求自动化。
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Category Tabs & Quick Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 p-1 bg-stone-200/60 dark:bg-stone-800/60 rounded-2xl overflow-x-auto">
          <button
            type="button"
            onClick={() => setSelectedCategory('all')}
            className={`px-3.5 py-1.5 text-xs sm:text-sm font-bold rounded-xl transition ${
              selectedCategory === 'all'
                ? 'bg-white dark:bg-stone-900 text-stone-900 dark:text-white shadow-sm'
                : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white'
            }`}
          >
            全部维度 ({goals.length})
          </button>
          {CATEGORIES.map((cat: CategoryItem) => {
            const count = goals.filter((g) => g.category === cat.id).length;
            const isSel = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3 py-1.5 text-xs sm:text-sm font-bold rounded-xl transition whitespace-nowrap ${
                  isSel
                    ? 'bg-white dark:bg-stone-900 text-stone-900 dark:text-white shadow-sm'
                    : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white'
                }`}
              >
                {cat.name} ({count})
              </button>
            );
          })}
        </div>

        <div className="text-xs text-stone-500 dark:text-stone-400 flex items-center gap-2">
          <span>当前显示: {filteredGoals.length} 项极限目标</span>
          <span>·</span>
          <span>按马斯克第一性原理持续纠偏</span>
        </div>
      </div>

      {/* Goals List */}
      {filteredGoals.length === 0 ? (
        <div className="bg-white dark:bg-stone-900 border border-stone-200/80 dark:border-stone-800 rounded-3xl p-12 text-center space-y-4 shadow-sm">
          <div className="w-14 h-14 mx-auto rounded-3xl bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 flex items-center justify-center">
            <Zap className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-bold text-stone-900 dark:text-white">暂无当前维度的 5X 极限目标</h3>
          <p className="text-sm text-stone-500 max-w-md mx-auto">
            挑选一个你原本打算用3-5年达成的宏伟设想，运用马斯克算法将其倒逼至12个月内破局。
          </p>
          <button
            type="button"
            onClick={handleOpenAddModal}
            className="px-5 py-2.5 rounded-2xl bg-stone-900 text-white dark:bg-white dark:text-stone-900 text-sm font-bold hover:opacity-90 transition shadow"
          >
            建立第一个 5X 目标
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {filteredGoals.map((goal) => {
            const isExpanded = expandedGoalId === goal.id;
            const catMeta = CATEGORIES.find((c: CategoryItem) => c.id === goal.category);

            // Pace evaluation styling
            const isAhead = goal.supervision?.paceEvaluation === 'ahead_of_5x';
            const isOnPace = goal.supervision?.paceEvaluation === 'on_pace_5x';
            const isLinearTrap = goal.supervision?.paceEvaluation === 'linear_trap';

            return (
              <div
                key={goal.id}
                className="bg-white dark:bg-stone-900 border border-stone-200/80 dark:border-stone-800 rounded-3xl p-6 sm:p-7 shadow-sm transition hover:border-stone-300 dark:hover:border-stone-700 space-y-5"
              >
                {/* Card Header */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2 text-xs font-semibold text-stone-500 dark:text-stone-400">
                      <span className="text-amber-600 dark:text-amber-400 font-bold">5X 极限倒逼</span>
                      <span>·</span>
                      <span>{catMeta?.name || '综合维度'}</span>
                      <span>·</span>
                      <span className="font-mono">航向分: {goal.supervision?.velocityScore || 85}</span>
                    </div>

                    <h2 className="text-xl sm:text-2xl font-black text-stone-900 dark:text-white tracking-tight">
                      {goal.title}
                    </h2>
                  </div>

                  {/* Actions & Status */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleOpenConsultation(goal)}
                      className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-indigo-500/15 to-purple-500/15 hover:from-indigo-500/25 hover:to-purple-500/25 text-indigo-800 dark:text-indigo-200 text-xs font-black flex items-center gap-1.5 transition border border-indigo-500/30 shadow-sm"
                      title="与AI教练开启诊断交流并做出最优安排"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                      <span>AI诊断与最优安排</span>
                      {goal.lastOptimalArrangement && (
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" title="已生效最优排期" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleStartSupervision(goal)}
                      className="px-3.5 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-800 dark:text-amber-300 text-xs font-extrabold flex items-center gap-1.5 transition border border-amber-500/30"
                      title="调用马斯克极限监督官，审计是否陷入线性慢速陷阱"
                    >
                      <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
                      <span>极限监督</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenEditModal(goal)}
                      className="p-2 rounded-xl text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition"
                      title="编辑目标"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`确定删除 5X 目标【${goal.title}】吗？`)) {
                          onDeleteGoal(goal.id);
                        }
                      }}
                      className="p-2 rounded-xl text-stone-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition"
                      title="删除目标"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* 5-Year Vision vs 1-Year Extreme Target Contrast Box */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-2xl bg-stone-50 dark:bg-stone-850 border border-stone-200/70 dark:border-stone-800 space-y-1">
                    <div className="text-xs font-bold text-stone-500 dark:text-stone-400 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-stone-400" />
                      <span>原定 5 年常规愿景（传统线性慢速）</span>
                    </div>
                    <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-300 leading-relaxed">
                      {goal.fiveYearVision}
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/60 space-y-1">
                    <div className="text-xs font-extrabold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                      <Flame className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                      <span>倒逼 1 年极限指标（5X 时间压缩）</span>
                    </div>
                    <p className="text-xs sm:text-sm font-semibold text-amber-950 dark:text-amber-100 leading-relaxed">
                      {goal.oneYearTarget}
                    </p>
                  </div>
                </div>

                {/* Progress Bar & Status Pill */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <div className="flex items-center gap-2">
                      <span className="text-stone-700 dark:text-stone-300">5X 整体推进进度</span>
                      <span className="font-mono text-stone-900 dark:text-white font-bold">{goal.progress}%</span>
                    </div>

                    <div className="flex items-center gap-2">
                      {isAhead && (
                        <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> 速度领先于 5X 规划
                        </span>
                      )}
                      {isOnPace && (
                        <span className="text-amber-600 dark:text-amber-400 font-bold flex items-center gap-1">
                          <Activity className="w-3.5 h-3.5" /> 5X 轨线平稳运行中
                        </span>
                      )}
                      {isLinearTrap && (
                        <span className="text-red-600 dark:text-red-400 font-bold flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5" /> 警报：正掉进5年线性慢速陷阱！
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="h-2.5 w-full bg-stone-100 dark:bg-stone-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${
                        isAhead
                          ? 'bg-emerald-500'
                          : isLinearTrap
                          ? 'bg-red-500'
                          : 'bg-gradient-to-r from-amber-500 to-emerald-500'
                      }`}
                      style={{ width: `${Math.max(5, goal.progress)}%` }}
                    />
                  </div>
                </div>

                {/* Musk Directive Callout Banner */}
                {goal.supervision?.muskDirective && (
                  <div className="p-4 rounded-2xl bg-stone-900 text-stone-100 dark:bg-black dark:text-stone-100 border border-stone-800 shadow-inner flex items-start gap-3">
                    <div className="w-7 h-7 rounded-xl bg-amber-500 text-stone-950 flex items-center justify-center shrink-0 mt-0.5 font-black text-xs">
                      EM
                    </div>
                    <div className="space-y-0.5 flex-1">
                      <div className="text-xs font-mono font-bold text-amber-400 uppercase tracking-wide">
                        马斯克硬核监督令 · 24小时穿透性指令
                      </div>
                      <p className="text-xs sm:text-sm text-stone-200 leading-relaxed font-medium">
                        {goal.supervision.muskDirective}
                      </p>
                      {goal.supervision.blockerAlert && (
                        <div className="text-xs text-red-400 mt-1 font-semibold flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          <span>时间黑洞警报：{goal.supervision.blockerAlert}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Toggle Details Button */}
                <div className="pt-1 flex items-center justify-between border-t border-stone-100 dark:border-stone-800 text-xs">
                  <button
                    type="button"
                    onClick={() => setExpandedGoalId(isExpanded ? null : goal.id)}
                    className="font-bold text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white flex items-center gap-1.5 transition py-1"
                  >
                    <span>{isExpanded ? '收起第一性原理与战役里程碑' : '展开第一性原理与战役里程碑'}</span>
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>

                  <div className="text-stone-400 flex items-center gap-3">
                    <span>
                      已完成里程碑: {goal.milestones.filter((m) => m.completed).length} / {goal.milestones.length}
                    </span>
                  </div>
                </div>

                {/* Expanded Details Section */}
                {isExpanded && (
                  <div className="pt-4 border-t border-stone-100 dark:border-stone-800 space-y-6">
                    {/* First Principles & Ruthlessly Deleted Processes */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Fundamental Truth & Bottleneck */}
                      <div className="p-4 rounded-2xl bg-stone-50/70 dark:bg-stone-850/60 border border-stone-200/60 dark:border-stone-800 space-y-3">
                        <div>
                          <div className="text-xs font-extrabold text-stone-800 dark:text-stone-200 flex items-center gap-1.5 mb-1">
                            <Layers className="w-3.5 h-3.5 text-amber-500" />
                            <span>第一性原理：底层物理/事实本质</span>
                          </div>
                          <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-400 leading-relaxed">
                            {goal.firstPrinciples.fundamentalTruth}
                          </p>
                        </div>

                        <div>
                          <div className="text-xs font-extrabold text-stone-800 dark:text-stone-200 flex items-center gap-1.5 mb-1">
                            <Target className="w-3.5 h-3.5 text-red-500" />
                            <span>当前唯一限速核心瓶颈 (Rate-limiting step)</span>
                          </div>
                          <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-400 leading-relaxed font-medium">
                            {goal.firstPrinciples.coreBottleneck}
                          </p>
                        </div>

                        <div>
                          <div className="text-xs font-extrabold text-stone-800 dark:text-stone-200 flex items-center gap-1.5 mb-1">
                            <Zap className="w-3.5 h-3.5 text-emerald-500" />
                            <span>非常规非线性破局路径</span>
                          </div>
                          <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-400 leading-relaxed">
                            {goal.firstPrinciples.unconventionalPath}
                          </p>
                        </div>
                      </div>

                      {/* Ruthlessly Deleted Processes */}
                      <div className="p-4 rounded-2xl bg-red-50/40 dark:bg-red-950/20 border border-red-200/60 dark:border-red-900/40 space-y-2.5">
                        <div className="text-xs font-extrabold text-red-800 dark:text-red-300 flex items-center gap-1.5">
                          <Scissors className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
                          <span>算法第二步：必须彻底删减的无用工序与伪需求</span>
                        </div>
                        <p className="text-[11px] text-red-700/80 dark:text-red-300/70">
                          “最糟糕的浪费，是把根本不该做的事情做得极其精美。”
                        </p>
                        <div className="space-y-1.5 pt-1">
                          {goal.firstPrinciples.deletedProcesses.map((proc, idx) => (
                            <div
                              key={idx}
                              className="flex items-start gap-2 text-xs sm:text-sm text-stone-700 dark:text-stone-300"
                            >
                              <span className="text-red-500 font-bold shrink-0 line-through">✕</span>
                              <span className="line-through decoration-red-400 text-stone-500 dark:text-stone-400">
                                {proc}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Musk 5-Step Algorithm Interactive Checkboxes */}
                    <div className="p-4 rounded-2xl bg-stone-50 dark:bg-stone-850/80 border border-stone-200/70 dark:border-stone-800 space-y-2">
                      <div className="text-xs font-extrabold text-stone-900 dark:text-white flex items-center gap-2">
                        <Cpu className="w-4 h-4 text-amber-500" />
                        <span>马斯克五步算法实施进程（点击核验）:</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1 text-xs">
                        <button
                          type="button"
                          onClick={() => handleToggleAlgorithmStep(goal, 'questionRequirement')}
                          className={`p-2.5 rounded-xl border text-left transition flex items-center gap-2 ${
                            goal.muskAlgorithm.questionRequirement
                              ? 'bg-amber-100/70 dark:bg-amber-950/50 border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 font-bold'
                              : 'bg-white dark:bg-stone-800 border-stone-200 dark:border-stone-700 text-stone-500'
                          }`}
                        >
                          {goal.muskAlgorithm.questionRequirement ? (
                            <CheckCircle2 className="w-4 h-4 text-amber-600 shrink-0" />
                          ) : (
                            <Circle className="w-4 h-4 text-stone-400 shrink-0" />
                          )}
                          <span>① 质疑伪需求</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleToggleAlgorithmStep(goal, 'deleteWaste')}
                          className={`p-2.5 rounded-xl border text-left transition flex items-center gap-2 ${
                            goal.muskAlgorithm.deleteWaste
                              ? 'bg-red-100/70 dark:bg-red-950/50 border-red-300 dark:border-red-700 text-red-900 dark:text-red-200 font-bold'
                              : 'bg-white dark:bg-stone-800 border-stone-200 dark:border-stone-700 text-stone-500'
                          }`}
                        >
                          {goal.muskAlgorithm.deleteWaste ? (
                            <CheckCircle2 className="w-4 h-4 text-red-600 shrink-0" />
                          ) : (
                            <Circle className="w-4 h-4 text-stone-400 shrink-0" />
                          )}
                          <span>② 极限删环节</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleToggleAlgorithmStep(goal, 'simplifyOptimize')}
                          className={`p-2.5 rounded-xl border text-left transition flex items-center gap-2 ${
                            goal.muskAlgorithm.simplifyOptimize
                              ? 'bg-blue-100/70 dark:bg-blue-950/50 border-blue-300 dark:border-blue-700 text-blue-900 dark:text-blue-200 font-bold'
                              : 'bg-white dark:bg-stone-800 border-stone-200 dark:border-stone-700 text-stone-500'
                          }`}
                        >
                          {goal.muskAlgorithm.simplifyOptimize ? (
                            <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                          ) : (
                            <Circle className="w-4 h-4 text-stone-400 shrink-0" />
                          )}
                          <span>③ 简化与优化</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleToggleAlgorithmStep(goal, 'accelerateCycle')}
                          className={`p-2.5 rounded-xl border text-left transition flex items-center gap-2 ${
                            goal.muskAlgorithm.accelerateCycle
                              ? 'bg-emerald-100/70 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-700 text-emerald-900 dark:text-emerald-200 font-bold'
                              : 'bg-white dark:bg-stone-800 border-stone-200 dark:border-stone-700 text-stone-500'
                          }`}
                        >
                          {goal.muskAlgorithm.accelerateCycle ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          ) : (
                            <Circle className="w-4 h-4 text-stone-400 shrink-0" />
                          )}
                          <span>④ 极限压缩迭代</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleToggleAlgorithmStep(goal, 'automateLeverage')}
                          className={`p-2.5 rounded-xl border text-left transition flex items-center gap-2 ${
                            goal.muskAlgorithm.automateLeverage
                              ? 'bg-purple-100/70 dark:bg-purple-950/50 border-purple-300 dark:border-purple-700 text-purple-900 dark:text-purple-200 font-bold'
                              : 'bg-white dark:bg-stone-800 border-stone-200 dark:border-stone-700 text-stone-500'
                          }`}
                        >
                          {goal.muskAlgorithm.automateLeverage ? (
                            <CheckCircle2 className="w-4 h-4 text-purple-600 shrink-0" />
                          ) : (
                            <Circle className="w-4 h-4 text-stone-400 shrink-0" />
                          )}
                          <span>⑤ 自动化固化</span>
                        </button>
                      </div>
                    </div>

                    {/* Q1-Q4 Quarterly Sprint Milestones */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs sm:text-sm font-extrabold text-stone-900 dark:text-white flex items-center gap-2">
                          <Target className="w-4 h-4 text-amber-500" />
                          <span>Q1-Q4 极速破局战役里程碑（杜绝虚假打勾，必填交付证据）</span>
                        </h4>
                        <span className="text-xs text-stone-400">点击圆圈完成交付验证</span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {goal.milestones.map((m) => {
                          const isDone = m.completed;
                          return (
                            <div
                              key={m.id}
                              onClick={() => handleToggleMilestone(goal, m.id)}
                              className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-start gap-3 ${
                                isDone
                                  ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800'
                                  : 'bg-white dark:bg-stone-850 border-stone-200/80 dark:border-stone-800 hover:border-amber-400'
                              }`}
                            >
                              <div className="mt-0.5 shrink-0">
                                {isDone ? (
                                  <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                                ) : (
                                  <Circle className="w-5 h-5 text-stone-400 hover:text-amber-500" />
                                )}
                              </div>

                              <div className="space-y-1 flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-xs font-black text-amber-600 dark:text-amber-400">
                                    {m.phase}
                                  </span>
                                  <span className="text-stone-400 text-xs">·</span>
                                  <span
                                    className={`text-xs sm:text-sm font-bold ${
                                      isDone
                                        ? 'line-through text-stone-400 dark:text-stone-500'
                                        : 'text-stone-900 dark:text-white'
                                    }`}
                                  >
                                    {m.title}
                                  </span>
                                </div>

                                <div className="text-xs text-stone-500 dark:text-stone-400 flex items-center gap-1.5">
                                  <span className="font-semibold text-stone-600 dark:text-stone-300">交付凭据:</span>
                                  <span className="truncate">{m.verificationProof}</span>
                                </div>

                                {m.completedAt && (
                                  <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                                    达成验证于: {m.completedAt}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* AI Coach Consultation & Optimal Arrangement Banner */}
                    <div className="p-4 rounded-2xl bg-gradient-to-r from-indigo-50/80 via-purple-50/60 to-amber-50/80 dark:from-indigo-950/30 dark:via-purple-950/20 dark:to-amber-950/30 border border-indigo-200/80 dark:border-indigo-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                          <span className="text-xs font-black text-indigo-950 dark:text-indigo-200">
                            {goal.lastOptimalArrangement ? '✨ 已生效的 AI 最优推进安排方案' : '🤖 AI教练深度诊断与最优安排'}
                          </span>
                        </div>
                        <p className="text-xs text-stone-600 dark:text-stone-300">
                          {goal.lastOptimalArrangement
                            ? `未来 48 小时破局点：${goal.lastOptimalArrangement.coreFocusImmediate}`
                            : '遇到推进瓶颈或无法按时交付？与教练实时对话，穿透假努力，重构 5X 最优推进方案。'}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleOpenConsultation(goal)}
                        className="shrink-0 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-sm transition"
                      >
                        <MessageSquareText className="w-3.5 h-3.5" />
                        <span>{goal.lastOptimalArrangement ? '查看方案 / 继续诊断' : '进入AI教练诊断室'}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Add or Edit Accelerated Goal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/70 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-200 dark:border-stone-800 shadow-2xl w-full max-w-2xl overflow-hidden my-8">
            <div className="px-6 py-4 border-b border-stone-100 dark:border-stone-800 flex items-center justify-between bg-stone-50/60 dark:bg-stone-850">
              <div className="flex items-center gap-2">
                <Flame className="w-5 h-5 text-amber-500 fill-amber-500" />
                <h3 className="text-base font-extrabold text-stone-900 dark:text-white">
                  {editingGoal ? '编辑 5X 极限目标' : '构建 5X 极限目标（1年完成5年）'}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleClearGoalForm}
                  className="px-2.5 py-1 rounded-lg text-xs font-bold text-stone-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition flex items-center gap-1 border border-stone-200 dark:border-stone-700"
                  title="一键清空表单所有已有内容"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>清空表单</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 font-bold p-1"
                >
                  ✕
                </button>
              </div>
            </div>

            <form onSubmit={handleSaveForm} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto text-xs sm:text-sm">
              {/* AI Auto-Decompose Assistance Banner */}
              <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5">
                    <div className="font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-amber-600" />
                      <span>马斯克 AI 第一性原理极限生成与拆解</span>
                    </div>
                    <p className="text-xs text-amber-800/80 dark:text-amber-300/80">
                      支持全要素 AI 自动构想，也可根据你输入的关键词极速推导 1 年倒逼路径与 Q1-Q4 战役。
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleClearGoalForm}
                    className="text-xs text-amber-800/70 hover:text-red-600 transition underline shrink-0"
                  >
                    重置所有字段
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleAutofillEntireGoal}
                    disabled={isAiDecomposing}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 text-stone-950 font-extrabold text-xs transition shadow flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    {isAiDecomposing ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>AI 正在全要素推演生成...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-stone-950" />
                        <span>✨ AI 全要素自动构想并填充</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleTriggerAiBreakdown}
                    disabled={isAiDecomposing}
                    className="px-3.5 py-2 rounded-xl bg-white dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 font-bold text-xs transition border border-amber-300/60 dark:border-amber-700/60 flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Zap className="w-3.5 h-3.5 text-amber-500" />
                    <span>⚡ 基于当前输入拆解</span>
                  </button>
                </div>
              </div>

              {/* Goal Title */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-stone-800 dark:text-stone-200">
                    目标名称 *
                  </label>
                  {formTitle && (
                    <button
                      type="button"
                      onClick={() => setFormTitle('')}
                      className="text-[11px] text-stone-400 hover:text-red-500 flex items-center gap-0.5"
                    >
                      <span>清空</span>
                    </button>
                  )}
                </div>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="例如：打造年营收100万的全球独立SaaS产品矩阵 / 掌握大模型底层研发"
                    className="w-full px-4 py-2.5 pr-8 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
                  />
                  {formTitle && (
                    <button
                      type="button"
                      onClick={() => setFormTitle('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 p-0.5"
                      title="清除内容"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              {/* Category */}
              <div>
                <label className="block font-bold text-stone-800 dark:text-stone-200 mb-1">
                  生命维度
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {CATEGORIES.map((cat: CategoryItem) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setFormCategory(cat.id)}
                      className={`p-2 rounded-xl border text-center transition font-semibold ${
                        formCategory === cat.id
                          ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-500 text-amber-900 dark:text-amber-200 font-bold'
                          : 'bg-white dark:bg-stone-800 border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400'
                      }`}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* 5-Year Vision */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-stone-800 dark:text-stone-200">
                    原定 5 年常规愿景（传统慢速做法）
                  </label>
                  {formFiveYearVision && (
                    <button
                      type="button"
                      onClick={() => setFormFiveYearVision('')}
                      className="text-[11px] text-stone-400 hover:text-red-500"
                    >
                      清空
                    </button>
                  )}
                </div>
                <textarea
                  rows={2}
                  value={formFiveYearVision}
                  onChange={(e) => setFormFiveYearVision(e.target.value)}
                  placeholder="例如：慢慢筹备团队、融资、花2年打磨完美架构、做漫长调研与大团队推介..."
                  className="w-full px-4 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {/* 1-Year Extreme Target */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-amber-700 dark:text-amber-300">
                    倒逼 1 年极限完成指标（5X 时间压缩）*
                  </label>
                  {formOneYearTarget && (
                    <button
                      type="button"
                      onClick={() => setFormOneYearTarget('')}
                      className="text-[11px] text-amber-700/70 hover:text-red-500"
                    >
                      清空
                    </button>
                  )}
                </div>
                <textarea
                  rows={2}
                  value={formOneYearTarget}
                  onChange={(e) => setFormOneYearTarget(e.target.value)}
                  placeholder="例如：单兵作战+AI代码杠杆，2周交付1款高痛点MVP，直接在真实市场打磨收费，年内沉淀3款盈利工具..."
                  className="w-full px-4 py-2.5 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50/40 dark:bg-amber-950/20 text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium"
                />
              </div>

              {/* First Principles: Truth & Deleted Processes */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-stone-800 dark:text-stone-200">
                      底层物理/事实真理
                    </label>
                    {formFundamentalTruth && (
                      <button
                        type="button"
                        onClick={() => setFormFundamentalTruth('')}
                        className="text-[11px] text-stone-400 hover:text-red-500"
                      >
                        清空
                      </button>
                    )}
                  </div>
                  <textarea
                    rows={3}
                    value={formFundamentalTruth}
                    onChange={(e) => setFormFundamentalTruth(e.target.value)}
                    placeholder="剥离一切借口与别人做法，事情本质的最少物理单元是什么？"
                    className="w-full px-4 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-red-600 dark:text-red-400">
                      必须彻底删减的伪流程 (每行一项)
                    </label>
                    {formDeletedProcessesText && (
                      <button
                        type="button"
                        onClick={() => setFormDeletedProcessesText('')}
                        className="text-[11px] text-red-400 hover:text-red-600"
                      >
                        清空
                      </button>
                    )}
                  </div>
                  <textarea
                    rows={3}
                    value={formDeletedProcessesText}
                    onChange={(e) => setFormDeletedProcessesText(e.target.value)}
                    placeholder="砍掉长篇无用PPT&#10;砍掉未验证前的过早架构优化&#10;砍掉任何无产出交付的会议"
                    className="w-full px-4 py-2 rounded-xl border border-red-200 dark:border-red-800 bg-white dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
              </div>

              {/* Core Bottleneck & Unconventional Path */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-stone-800 dark:text-stone-200">
                      当前唯一限速瓶颈
                    </label>
                    {formCoreBottleneck && (
                      <button
                        type="button"
                        onClick={() => setFormCoreBottleneck('')}
                        className="text-[11px] text-stone-400 hover:text-red-500"
                      >
                        清空
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={formCoreBottleneck}
                    onChange={(e) => setFormCoreBottleneck(e.target.value)}
                    placeholder="例如：从写完代码到推送到真实付费用户眼前的反馈周期"
                    className="w-full px-4 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-stone-800 dark:text-stone-200">
                      非常规非线性破局路径
                    </label>
                    {formUnconventionalPath && (
                      <button
                        type="button"
                        onClick={() => setFormUnconventionalPath('')}
                        className="text-[11px] text-stone-400 hover:text-red-500"
                      >
                        清空
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={formUnconventionalPath}
                    onChange={(e) => setFormUnconventionalPath(e.target.value)}
                    placeholder="例如：在社交社群公开构建(Build in Public)，48小时极速上线验证"
                    className="w-full px-4 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              {/* Musk Directive */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-stone-800 dark:text-stone-200">
                    马斯克硬核监督训令 (直接严厉命令)
                  </label>
                  {formMuskDirective && (
                    <button
                      type="button"
                      onClick={() => setFormMuskDirective('')}
                      className="text-[11px] text-stone-400 hover:text-red-500"
                    >
                      清空
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  value={formMuskDirective}
                  onChange={(e) => setFormMuskDirective(e.target.value)}
                  placeholder="例如：停止在内部做无用打磨！立刻把原型发给5位用户拿真实痛点反馈！"
                  className="w-full px-4 py-2 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {/* Milestone Breakdowns with Delete & Add */}
              <div className="space-y-2.5 pt-2 border-t border-stone-150 dark:border-stone-800">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="font-bold text-stone-800 dark:text-stone-200 flex items-center gap-1.5">
                      <Target className="w-4 h-4 text-amber-500" />
                      <span>年度季度极速拆解里程碑 ({formMilestones.length})</span>
                    </label>
                    <p className="text-[11px] text-stone-400">
                      每个里程碑均可编辑、清空或点击垃圾桶独立删除
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddMilestone}
                    className="px-2.5 py-1 rounded-lg bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-300 text-xs font-bold transition flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>添加里程碑</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {formMilestones.map((m, idx) => (
                    <div
                      key={m.id || idx}
                      className="p-3 rounded-xl bg-stone-50 dark:bg-stone-800/60 border border-stone-200/80 dark:border-stone-700 flex flex-col sm:flex-row sm:items-center gap-2"
                    >
                      <input
                        type="text"
                        value={m.phase}
                        onChange={(e) => handleUpdateMilestone(m.id, 'phase', e.target.value)}
                        className="w-16 px-2 py-1.5 rounded-lg border border-stone-200 dark:border-stone-600 bg-white dark:bg-stone-700 text-center font-bold text-xs"
                        placeholder="阶段"
                      />
                      <input
                        type="text"
                        value={m.title}
                        onChange={(e) => handleUpdateMilestone(m.id, 'title', e.target.value)}
                        placeholder="里程碑核心交付目标"
                        className="flex-1 px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-600 bg-white dark:bg-stone-700 text-xs font-medium"
                      />
                      <input
                        type="text"
                        value={m.verificationProof || ''}
                        onChange={(e) => handleUpdateMilestone(m.id, 'verificationProof', e.target.value)}
                        placeholder="硬核验收凭证（如链接、交易流水）"
                        className="sm:w-48 px-2.5 py-1.5 rounded-lg border border-stone-200 dark:border-stone-600 bg-white dark:bg-stone-700 text-xs text-stone-600 dark:text-stone-300"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveMilestone(m.id)}
                        className="p-1.5 rounded-lg text-stone-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition shrink-0 self-end sm:self-center"
                        title="删除该里程碑"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  {formMilestones.length === 0 && (
                    <div className="p-4 rounded-xl border border-dashed border-stone-300 dark:border-stone-700 text-center text-xs text-stone-400">
                      暂无里程碑，点击「✨ AI 全要素自动构想并填充」或「+ 添加里程碑」生成
                    </div>
                  )}
                </div>
              </div>

              {/* Modal Buttons */}
              <div className="pt-4 border-t border-stone-100 dark:border-stone-800 flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleClearGoalForm}
                  className="px-4 py-2.5 rounded-xl text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 text-xs font-bold transition flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>清空所有内容</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-5 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 font-bold hover:bg-stone-100 dark:hover:bg-stone-800 transition"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-extrabold transition shadow"
                  >
                    保存 5X 极限目标
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Supervision Audit Result Modal / Drawer */}
      {auditingGoal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/70 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-200 dark:border-stone-800 shadow-2xl w-full max-w-xl overflow-hidden my-8">
            <div className="px-6 py-4 border-b border-stone-100 dark:border-stone-800 flex items-center justify-between bg-stone-900 text-white">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-extrabold tracking-tight">
                  马斯克极限监督官 · 现场冷酷审计
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setAuditingGoal(null)}
                className="text-stone-400 hover:text-white font-bold p-1"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-5 text-xs sm:text-sm">
              <div className="border-b border-stone-100 dark:border-stone-800 pb-3">
                <div className="text-stone-400 text-xs">审计目标</div>
                <div className="text-base font-extrabold text-stone-900 dark:text-white mt-0.5">
                  {auditingGoal.title}
                </div>
              </div>

              {isAuditing ? (
                <div className="py-12 text-center space-y-3">
                  <RefreshCw className="w-8 h-8 mx-auto text-amber-500 animate-spin" />
                  <p className="font-bold text-stone-800 dark:text-stone-200">
                    马斯克 AI 监督官正在穿透你的实际产出与打卡记录...
                  </p>
                  <p className="text-xs text-stone-400">
                    正在核验是否存在“把5年拉长为拖延借口”的线性陷阱与假努力
                  </p>
                </div>
              ) : supervisionResult ? (
                <div className="space-y-4">
                  {/* Score & Evaluation */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-4 rounded-2xl bg-stone-50 dark:bg-stone-850 border border-stone-200 dark:border-stone-700">
                      <div className="text-xs text-stone-400 font-medium">5X 航向速度评分</div>
                      <div className="text-3xl font-mono font-black text-amber-500 mt-1">
                        {supervisionResult.velocityScore} <span className="text-xs text-stone-400 font-sans">/ 100</span>
                      </div>
                    </div>

                    <div className="p-4 rounded-2xl bg-stone-50 dark:bg-stone-850 border border-stone-200 dark:border-stone-700">
                      <div className="text-xs text-stone-400 font-medium">状态定性</div>
                      <div className="text-base font-extrabold text-stone-900 dark:text-white mt-2">
                        {supervisionResult.paceEvaluation === 'ahead_of_5x' && '🔥 极速领先 5X 轨迹'}
                        {supervisionResult.paceEvaluation === 'on_pace_5x' && '⚡ 5X 正常在轨推进'}
                        {supervisionResult.paceEvaluation === 'lagging_risk' && '⚠️ 进度有滞后风险'}
                        {supervisionResult.paceEvaluation === 'linear_trap' && '🚨 陷入5年慢速线性陷阱'}
                      </div>
                    </div>
                  </div>

                  {/* Ruthless Audit */}
                  <div className="p-4 rounded-2xl bg-stone-50 dark:bg-stone-850 border border-stone-200 dark:border-stone-800 space-y-1">
                    <div className="font-bold text-stone-800 dark:text-stone-200 flex items-center gap-1.5 text-xs">
                      <Layers className="w-3.5 h-3.5 text-amber-500" />
                      <span>冷酷工程审计剖析</span>
                    </div>
                    <p className="text-stone-700 dark:text-stone-300 leading-relaxed font-medium">
                      {supervisionResult.ruthlessAudit}
                    </p>
                  </div>

                  {/* Blocker Alert */}
                  {supervisionResult.blockerAlert && (
                    <div className="p-3.5 rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 text-red-900 dark:text-red-200 space-y-1">
                      <div className="font-bold flex items-center gap-1.5 text-xs text-red-700 dark:text-red-300">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>无情剔除：时间黑洞警报</span>
                      </div>
                      <p className="text-xs leading-relaxed">
                        {supervisionResult.blockerAlert}
                      </p>
                    </div>
                  )}

                  {/* Musk 24h Directive */}
                  <div className="p-4 rounded-2xl bg-stone-900 text-white dark:bg-black border border-stone-800 space-y-1.5">
                    <div className="font-mono text-xs font-black text-amber-400 flex items-center gap-1.5 uppercase">
                      <Flame className="w-4 h-4 fill-amber-400" />
                      <span>马斯克不可妥协令：未来 24 小时必须交付</span>
                    </div>
                    <p className="text-sm font-bold text-amber-100 leading-relaxed">
                      {supervisionResult.muskDirective}
                    </p>
                  </div>

                  <div className="pt-2 flex items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setAuditingGoal(null)}
                      className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-extrabold text-xs transition"
                    >
                      明白，即刻执行不可拖延！
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Modal: AI Coach Goal Consultation & Optimal Arrangement */}
      {isConsultModalOpen && consultingGoal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-5 bg-stone-950/75 backdrop-blur-md overflow-hidden">
          <div className="bg-white dark:bg-stone-900 rounded-t-3xl sm:rounded-3xl border-t sm:border border-stone-200 dark:border-stone-800 shadow-2xl w-full max-w-4xl flex flex-col h-[94dvh] sm:h-[90vh] max-h-[880px] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-stone-150 dark:border-stone-800 flex flex-col sm:flex-row sm:items-center justify-between bg-gradient-to-r from-stone-50 via-indigo-50/30 to-amber-50/30 dark:from-stone-900 dark:via-indigo-950/20 dark:to-stone-900 gap-2.5 shrink-0">
              <div className="flex items-center justify-between sm:justify-start gap-2.5 min-w-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-amber-500 p-0.5 shadow-md shrink-0 flex items-center justify-center">
                    <div className="w-full h-full bg-stone-950 rounded-[14px] flex items-center justify-center">
                      <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400" />
                    </div>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-sm sm:text-base font-black text-stone-900 dark:text-white truncate">
                        {consultingGoal.title}
                      </h3>
                      <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 font-bold border border-amber-500/20 shrink-0">
                        5X 诊断
                      </span>
                    </div>
                    <p className="text-[11px] text-stone-500 dark:text-stone-400 truncate">
                      倒逼指标：<span className="font-semibold text-stone-700 dark:text-stone-300">{consultingGoal.oneYearTarget}</span>
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsConsultModalOpen(false)}
                  className="sm:hidden p-1.5 rounded-xl text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
                  title="关闭"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Tabs & Desktop Close */}
              <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
                <div className="flex p-1 bg-stone-100 dark:bg-stone-800 rounded-xl w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setConsultTab('dialogue')}
                    className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                      consultTab === 'dialogue'
                        ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-white shadow-sm'
                        : 'text-stone-500 hover:text-stone-700 dark:hover:text-stone-300'
                    }`}
                  >
                    <MessageSquareText className="w-3.5 h-3.5" />
                    <span>诊断交流</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setConsultTab('optimal_plan')}
                    className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                      consultTab === 'optimal_plan'
                        ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-white shadow-sm'
                        : 'text-stone-500 hover:text-stone-700 dark:hover:text-stone-300'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    <span>最优安排方案</span>
                    {optimalPlan && (
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    )}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setIsConsultModalOpen(false)}
                  className="hidden sm:flex p-2 rounded-xl text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition"
                  title="关闭"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Toast Notice */}
            {consultApplyToast && (
              <div className="px-6 py-2.5 bg-emerald-500 text-white font-bold text-xs sm:text-sm flex items-center justify-between shadow-md shrink-0 animate-in fade-in">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{consultApplyToast}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setConsultApplyToast(null)}
                  className="text-white/80 hover:text-white text-xs font-bold ml-4"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Modal Body */}
            <div className="flex-1 overflow-hidden flex flex-col bg-stone-50/50 dark:bg-stone-950/40">
              {/* TAB 1: Dialogue & Real-Time Diagnosis */}
              {consultTab === 'dialogue' && (
                <div className="flex-1 flex flex-col overflow-hidden">
                  {/* Messages Area */}
                  <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-4">
                    {consultMessages.map((msg) => {
                      const isCoach = msg.role === 'assistant';
                      return (
                        <div
                          key={msg.id}
                          className={`flex gap-3 max-w-[88%] ${isCoach ? 'mr-auto' : 'ml-auto flex-row-reverse'}`}
                        >
                          <div
                            className={`w-8 h-8 rounded-xl shrink-0 flex items-center justify-center text-xs font-black shadow-sm ${
                              isCoach
                                ? 'bg-stone-900 text-amber-400 dark:bg-amber-500 dark:text-stone-950'
                                : 'bg-indigo-600 text-white'
                            }`}
                          >
                            {isCoach ? <Bot className="w-4 h-4" /> : '我'}
                          </div>

                          <div className="space-y-1">
                            <div
                              className={`p-4 rounded-2xl text-xs sm:text-sm leading-relaxed shadow-sm ${
                                isCoach
                                  ? 'bg-white dark:bg-stone-850 text-stone-850 dark:text-stone-100 border border-stone-200/80 dark:border-stone-800'
                                  : 'bg-indigo-600 text-white'
                              }`}
                            >
                              {/* Simple markdown parser for message content */}
                              <div className="space-y-2 whitespace-pre-wrap">
                                {msg.content.split('\n\n').map((paragraph, pIdx) => {
                                  if (paragraph.startsWith('### ')) {
                                    return (
                                      <h4 key={pIdx} className="font-extrabold text-sm sm:text-base text-amber-600 dark:text-amber-400">
                                        {paragraph.replace('### ', '')}
                                      </h4>
                                    );
                                  }
                                  return (
                                    <p key={pIdx} className="leading-relaxed">
                                      {paragraph}
                                    </p>
                                  );
                                })}
                              </div>
                            </div>
                            <div
                              className={`text-[10px] text-stone-400 font-mono px-1 ${
                                isCoach ? 'text-left' : 'text-right'
                              }`}
                            >
                              {msg.timestamp}
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {/* Streaming indicator */}
                    {isConsultStreaming && (
                      <div className="flex gap-3 mr-auto max-w-[85%] animate-pulse">
                        <div className="w-8 h-8 rounded-xl bg-stone-900 text-amber-400 flex items-center justify-center shrink-0">
                          <Bot className="w-4 h-4" />
                        </div>
                        <div className="p-3.5 rounded-2xl bg-white dark:bg-stone-850 border border-stone-200/80 dark:border-stone-800 text-xs text-stone-500 dark:text-stone-400 flex items-center gap-2">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-500" />
                          <span>AI教练正在结合马斯克第一性原理诊断与推演中...</span>
                        </div>
                      </div>
                    )}

                    <div ref={messagesEndRef} />
                  </div>

                  {/* Quick Diagnostic Suggestions */}
                  <div className="px-4 py-2 border-t border-stone-150 dark:border-stone-800/80 bg-white dark:bg-stone-900 shrink-0">
                    <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs no-scrollbar">
                      <span className="text-[11px] font-bold text-stone-400 shrink-0 flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-amber-500" />
                        快捷诊断:
                      </span>
                      {[
                        '帮我诊断当前是否有假努力或时间黑洞？',
                        '如果时间压缩到半年甚至三个月，该砍掉什么？',
                        '未来48小时最关键的单点突破口是什么？',
                        '重新按第一性原理重组我的推进安排',
                      ].map((promptText, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => handleSendConsultMessage(promptText)}
                          disabled={isConsultStreaming}
                          className="px-3 py-1 rounded-full bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-300 shrink-0 text-xs transition disabled:opacity-50"
                        >
                          {promptText}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Input Toolbar & Generate Optimal Plan CTA */}
                  <div className="p-4 border-t border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 shrink-0 space-y-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleToggleConsultSpeech}
                        className={`p-2.5 rounded-2xl border transition ${
                          isConsultListening
                            ? 'bg-red-500 border-red-600 text-white animate-pulse'
                            : 'bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-600 dark:text-stone-300 border-stone-200 dark:border-stone-700'
                        }`}
                        title={isConsultListening ? '停止语音录制' : '语音输入'}
                      >
                        {isConsultListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                      </button>

                      <input
                        type="text"
                        value={consultInput}
                        onChange={(e) => setConsultInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleSendConsultMessage();
                          }
                        }}
                        placeholder="向教练倾诉推进遇到的卡点、犹豫或时间消耗，按 Enter 发送..."
                        disabled={isConsultStreaming}
                        className="flex-1 px-4 py-2.5 rounded-2xl bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-white border border-transparent focus:border-indigo-500 focus:bg-white dark:focus:bg-stone-850 text-xs sm:text-sm outline-none transition"
                      />

                      <button
                        type="button"
                        onClick={() => handleSendConsultMessage()}
                        disabled={!consultInput.trim() || isConsultStreaming}
                        className="px-4 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs sm:text-sm transition disabled:opacity-40 flex items-center gap-1.5"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>发送</span>
                      </button>
                    </div>

                    {/* Master Action: Generate Optimal Plan */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 border-t border-stone-100 dark:border-stone-800/60">
                      <span className="text-[11px] text-stone-400">
                        交流完毕后，点击右侧让教练融合第一性原理生成排期蓝图 👇
                      </span>

                      <button
                        type="button"
                        onClick={handleGenerateOptimalPlan}
                        disabled={isGeneratingOptimalPlan}
                        className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 font-black text-xs sm:text-sm shadow-md flex items-center justify-center gap-2 transition disabled:opacity-60"
                      >
                        {isGeneratingOptimalPlan ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            <span>正在推演并生成最优排期方案...</span>
                          </>
                        ) : (
                          <>
                            <Wand2 className="w-4 h-4" />
                            <span>✨ 生成诊断并做出最优安排</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: Optimal Arrangement Blueprint */}
              {consultTab === 'optimal_plan' && (
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
                  {optimalPlan ? (
                    <div className="space-y-6">
                      {/* Top Action Ribbon */}
                      <div className="p-4 rounded-3xl bg-gradient-to-r from-stone-900 via-stone-850 to-stone-900 text-white border border-stone-800 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Flame className="w-5 h-5 text-amber-400 fill-amber-400" />
                            <span className="text-sm sm:text-base font-black text-amber-300">
                              第一性原理最优安排方案已就绪
                            </span>
                          </div>
                          <p className="text-xs text-stone-300 leading-relaxed">
                            {optimalPlan.diagnosisSummary || optimalPlan.ruthlessAuditSummary || '剔除一切低价值工序，将核心重心压至 48 小时内的可验证交付。'}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={handleApplyOptimalPlan}
                            className="px-5 py-2.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-black text-xs sm:text-sm flex items-center gap-1.5 shadow-md transition"
                          >
                            <Check className="w-4 h-4 stroke-[3]" />
                            <span>采纳并一键应用此最优安排</span>
                          </button>
                        </div>
                      </div>

                      {/* Immediate 48-Hour Breakthrough Point */}
                      <div className="p-5 rounded-3xl bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent border-2 border-amber-500/40 dark:border-amber-500/30 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-xs font-black uppercase text-amber-700 dark:text-amber-400 font-mono tracking-wider">
                            <Target className="w-4 h-4 text-amber-500" />
                            <span>未来 48 小时单点破局核心重心（最高优先级）</span>
                          </div>
                          <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500 text-stone-950">
                            DO THIS FIRST
                          </span>
                        </div>
                        <p className="text-base sm:text-lg font-black text-stone-900 dark:text-white leading-relaxed">
                          {optimalPlan.coreFocusImmediate}
                        </p>
                        <p className="text-xs text-stone-500 dark:text-stone-400">
                          教练指示：暂停其他一切细枝末节的准备工作，首先攻破此卡点以触发多米诺骨牌效应。
                        </p>
                      </div>

                      {/* Bottleneck vs Unconventional Path */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="p-4 rounded-2xl bg-red-50/70 dark:bg-red-950/20 border border-red-200/80 dark:border-red-900/40 space-y-1.5">
                          <div className="text-xs font-black text-red-700 dark:text-red-400 flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>唯一限速瓶颈 (Rate-Limiting Bottleneck)</span>
                          </div>
                          <p className="text-xs sm:text-sm font-bold text-red-950 dark:text-red-200 leading-relaxed">
                            {optimalPlan.newBottleneck || consultingGoal.firstPrinciples.coreBottleneck}
                          </p>
                        </div>

                        <div className="p-4 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/20 border border-indigo-200/80 dark:border-indigo-900/40 space-y-1.5">
                          <div className="text-xs font-black text-indigo-700 dark:text-indigo-400 flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>非常规非线性捷径 (Unconventional Shortcut)</span>
                          </div>
                          <p className="text-xs sm:text-sm font-bold text-indigo-950 dark:text-indigo-200 leading-relaxed">
                            {optimalPlan.newUnconventionalPath || consultingGoal.firstPrinciples.unconventionalPath}
                          </p>
                        </div>
                      </div>

                      {/* Optimized Milestones (Q1-Q4) */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs sm:text-sm font-extrabold text-stone-900 dark:text-white flex items-center gap-2">
                            <ListChecks className="w-4 h-4 text-amber-500" />
                            <span>重新优化的 5X 极限里程碑排期（硬核交付）</span>
                          </h4>
                          <span className="text-[11px] text-stone-400">
                            共 {optimalPlan.optimizedMilestones?.length || 0} 个阶段交付
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {optimalPlan.optimizedMilestones?.map((m) => (
                            <div
                              key={m.id}
                              className="p-4 rounded-2xl bg-white dark:bg-stone-850 border border-stone-200/80 dark:border-stone-800 space-y-2 shadow-sm"
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-mono font-black px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
                                  {m.phase}
                                </span>
                                <span className="text-xs font-mono font-bold text-stone-400 flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  第 {m.targetDays} 天前达成
                                </span>
                              </div>

                              <div className="text-xs sm:text-sm font-extrabold text-stone-900 dark:text-white">
                                {m.title}
                              </div>

                              <div className="text-xs text-stone-500 dark:text-stone-400 flex items-start gap-1.5 pt-1 border-t border-stone-100 dark:border-stone-800">
                                <span className="font-bold text-stone-700 dark:text-stone-300 shrink-0">严苛交付凭据:</span>
                                <span className="text-stone-600 dark:text-stone-300 leading-tight">
                                  {m.verificationProof}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Weekly Pacing Guideline */}
                      {optimalPlan.weeklyPacingGuideline && (
                        <div className="p-4 rounded-2xl bg-stone-100 dark:bg-stone-850 border border-stone-200 dark:border-stone-800 space-y-1.5">
                          <div className="text-xs font-bold text-stone-600 dark:text-stone-300 flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-stone-400" />
                            <span>每周冲刺与推进节奏指南</span>
                          </div>
                          <p className="text-xs sm:text-sm text-stone-700 dark:text-stone-300 leading-relaxed whitespace-pre-wrap">
                            {optimalPlan.weeklyPacingGuideline}
                          </p>
                        </div>
                      )}

                      {/* Bottom Footer Actions */}
                      <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-stone-200 dark:border-stone-800">
                        <button
                          type="button"
                          onClick={() => setConsultTab('dialogue')}
                          className="px-4 py-2 rounded-xl text-xs font-bold text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-800 transition"
                        >
                          ← 返回诊断对话，继续调整细节
                        </button>

                        <button
                          type="button"
                          onClick={handleApplyOptimalPlan}
                          className="px-6 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg transition"
                        >
                          <Check className="w-4 h-4 stroke-[3]" />
                          <span>确认并采纳此方案，即刻重构目标排期</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Empty State for Plan */
                    <div className="h-full py-16 flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-4">
                      <div className="w-16 h-16 rounded-3xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
                        <Sparkles className="w-8 h-8" />
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-base font-extrabold text-stone-900 dark:text-white">
                          尚未生成专属最优安排方案
                        </h4>
                        <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed">
                          在【诊断交流】中与教练探讨当前卡点，或直接点击下方按钮，由 AI 教练基于第一性原理为你定制最优排期与破局蓝图。
                        </p>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-3 pt-2">
                        <button
                          type="button"
                          onClick={() => setConsultTab('dialogue')}
                          className="px-4 py-2.5 rounded-xl border border-stone-200 dark:border-stone-700 text-xs font-bold text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 transition"
                        >
                          前往诊断交流
                        </button>
                        <button
                          type="button"
                          onClick={handleGenerateOptimalPlan}
                          disabled={isGeneratingOptimalPlan}
                          className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-xs shadow-md flex items-center gap-1.5 transition"
                        >
                          {isGeneratingOptimalPlan ? (
                            <>
                              <RefreshCw className="w-4 h-4 animate-spin" />
                              <span>推演中...</span>
                            </>
                          ) : (
                            <>
                              <Wand2 className="w-4 h-4" />
                              <span>立即生成最优安排方案</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
