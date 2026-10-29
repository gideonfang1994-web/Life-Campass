import React, { useState, useRef, useEffect } from 'react';
import { CoachPersona, ChatMessage, LifeProject, DailyLog, LifeWheelScores } from '../types';
import { streamCoachChat } from '../services/api';
import {
  Send,
  Sparkles,
  Bot,
  User,
  Trash2,
  Copy,
  Check,
  Compass,
  Flame,
  Feather,
  ShieldAlert,
  Loader2,
  RefreshCw,
} from 'lucide-react';

interface Props {
  projects: LifeProject[];
  recentLogs: DailyLog[];
  wheelScores: LifeWheelScores;
  activeProject?: LifeProject | null;
  onClearActiveProject?: () => void;
}

const PERSONA_DETAILS: Record<
  CoachPersona,
  {
    name: string;
    title: string;
    desc: string;
    icon: any;
    color: string;
    bg: string;
    border: string;
  }
> = {
  strategic: {
    name: '战略导师',
    title: '麦肯锡合伙人 & 创业家范式',
    desc: '聚焦高杠杆战役，识别假努力，构建量化OKR与里程碑',
    icon: Compass,
    color: 'text-blue-600 dark:text-blue-400',
    bg: 'bg-blue-50 dark:bg-blue-950/40',
    border: 'border-blue-200 dark:border-blue-800',
  },
  mindful: {
    name: '心流导师',
    title: '正念生命设计与认知心理学',
    desc: '接纳心理阻抗与疲态，守护身心能量池，滋养内在动力',
    icon: Feather,
    color: 'text-emerald-600 dark:text-emerald-400',
    bg: 'bg-emerald-50 dark:bg-emerald-950/40',
    border: 'border-emerald-200 dark:border-emerald-800',
  },
  accountability: {
    name: '敏捷督导',
    title: '硬核行动教官 & 习惯架构师',
    desc: '直击拖延症软肋，2分钟最小行动切入，建立闭环反馈',
    icon: Flame,
    color: 'text-orange-600 dark:text-orange-400',
    bg: 'bg-orange-50 dark:bg-orange-950/40',
    border: 'border-orange-200 dark:border-orange-800',
  },
  stoic: {
    name: '斯多葛智者',
    title: '沉思录思辨与长周期哲人',
    desc: '践行控制二分法，将挫折转化为燃料，化解琐碎焦虑',
    icon: ShieldAlert,
    color: 'text-purple-600 dark:text-purple-400',
    bg: 'bg-purple-50 dark:bg-purple-950/40',
    border: 'border-purple-200 dark:border-purple-800',
  },
};

const SUGGESTED_QUESTIONS = [
  '我最近总是在拖延某个关键项目，帮我剖析深层心理阻抗。',
  '我感觉手头项目过多、精力透支，请帮我梳理优先级砍掉假努力。',
  '帮我将我当前最难的项目，拆解为一个今天可在5分钟内无痛完成的第一击。',
  '请根据我目前的生命之轮平衡度，指出我最危险的盲点是什么？',
];

export const CoachChatView: React.FC<Props> = ({
  projects,
  recentLogs,
  wheelScores,
  activeProject,
  onClearActiveProject,
}) => {
  const [persona, setPersona] = useState<CoachPersona>('strategic');
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Local storage for chat history
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const saved = localStorage.getItem('life_coach_chat_messages');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // ignore
      }
    }
    return [
      {
        id: 'msg-welcome',
        role: 'assistant',
        content: `你好！我是你的专属全天候人生教练。

我已经同步接入了你当前管理中的 **${projects.length} 个生命演进项目** 以及最近的日志与精力评估。

你可以随时向我倾诉卡点、进行项目深度研讨、请求拖延破解方案，或者做一次临睡前的思想澄清。

你今天希望从哪件事或哪种困惑开始？`,
        timestamp: new Date().toISOString(),
      },
    ];
  });

  const chatContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem('life_coach_chat_messages', JSON.stringify(messages));
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  // When activeProject changes from outside, suggest a prompt
  useEffect(() => {
    if (activeProject) {
      setInput(`教练，我想就「${activeProject.title}」这个项目和你深度聊聊。当前进度是 ${activeProject.progress}%，状态是 ${activeProject.status}。`);
    }
  }, [activeProject]);

  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend || input).trim();
    if (!query || isStreaming) return;

    const userMessage: ChatMessage = {
      id: 'msg-' + Date.now(),
      role: 'user',
      content: query,
      timestamp: new Date().toISOString(),
      relatedProjectId: activeProject?.id,
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput('');
    setIsStreaming(true);

    const assistantMsgId = 'msg-' + (Date.now() + 1);
    const initialAssistantMsg: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
    };

    setMessages([...updatedMessages, initialAssistantMsg]);

    const contextPayload = {
      projects: projects.map((p) => ({
        id: p.id,
        title: p.title,
        category: p.category,
        priority: p.priority,
        status: p.status,
        progress: p.progress,
        weeklyHours: p.weeklyHours,
        energyCost: p.energyCost,
        nextMicroAction: p.nextMicroAction,
        milestones: p.milestones,
      })),
      recentLogs: recentLogs.slice(-3),
      wheelScores,
      activeTargetProject: activeProject
        ? { id: activeProject.id, title: activeProject.title, progress: activeProject.progress }
        : null,
    };

    let streamText = '';

    await streamCoachChat(
      updatedMessages,
      persona,
      contextPayload,
      (chunk) => {
        streamText += chunk;
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMsgId ? { ...m, content: streamText } : m))
        );
      },
      () => {
        setIsStreaming(false);
      },
      (err) => {
        console.error(err);
        setIsStreaming(false);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  content:
                    m.content ||
                    '教练当前网络连接有些许波动。请检查你的连接并重试，我随时为你准备好。',
                }
              : m
          )
        );
      }
    );
  };

  const handleClearChat = () => {
    if (confirm('确定要清空与教练的对话记录吗？')) {
      const resetMsg: ChatMessage = {
        id: 'msg-welcome-new',
        role: 'assistant',
        content: '对话记录已归档重置。随时告诉我你此刻最想突破的事情。',
        timestamp: new Date().toISOString(),
      };
      setMessages([resetMsg]);
    }
  };

  const handleCopyMessage = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const currentPersona = PERSONA_DETAILS[persona];
  const PersonaIcon = currentPersona.icon;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col h-[780px] overflow-hidden">
      {/* Top Bar: Persona Selection */}
      <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-xl ${currentPersona.bg} ${currentPersona.border} border`}>
              <PersonaIcon className={`w-5 h-5 ${currentPersona.color}`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {currentPersona.name}
                </h3>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  {currentPersona.title}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {currentPersona.desc}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            {activeProject && (
              <span className="text-xs px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 flex items-center gap-1.5 font-medium">
                <span>聚焦研讨: {activeProject.title}</span>
                {onClearActiveProject && (
                  <button
                    onClick={onClearActiveProject}
                    className="hover:text-rose-500 font-bold ml-1"
                    title="取消对单一项目的聚焦"
                  >
                    ×
                  </button>
                )}
              </span>
            )}

            <button
              type="button"
              onClick={handleClearChat}
              title="清空记录"
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Persona Segment Tabs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {(Object.keys(PERSONA_DETAILS) as CoachPersona[]).map((pKey) => {
            const p = PERSONA_DETAILS[pKey];
            const isSelected = persona === pKey;
            const IconComponent = p.icon;
            return (
              <button
                key={pKey}
                type="button"
                onClick={() => setPersona(pKey)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 border transition ${
                  isSelected
                    ? `${p.bg} ${p.border} ${p.color} shadow-sm ring-1 ring-current`
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/60'
                }`}
              >
                <IconComponent className="w-3.5 h-3.5" />
                <span>{p.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Messages Stream Area */}
      <div
        ref={chatContainerRef}
        className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-4 bg-slate-50/20 dark:bg-slate-900/40"
      >
        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          return (
            <div
              key={msg.id}
              className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
            >
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${
                  isUser
                    ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900'
                    : 'bg-emerald-600 text-white'
                }`}
              >
                {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>

              <div
                className={`group relative max-w-[85%] rounded-2xl p-4 text-xs sm:text-sm leading-relaxed shadow-sm ${
                  isUser
                    ? 'bg-emerald-600 text-white rounded-tr-none'
                    : 'bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 text-slate-800 dark:text-slate-100 rounded-tl-none'
                }`}
              >
                {!isUser && (
                  <button
                    type="button"
                    onClick={() => handleCopyMessage(msg.id, msg.content)}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-white transition"
                    title="复制内容"
                  >
                    {copiedId === msg.id ? (
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                )}

                <div className="whitespace-pre-wrap font-sans">
                  {msg.content || (
                    <span className="flex items-center gap-2 text-slate-400">
                      <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
                      教练正在构思深层回应...
                    </span>
                  )}
                </div>

                <div
                  className={`mt-1.5 text-[10px] ${
                    isUser ? 'text-emerald-100' : 'text-slate-400'
                  } flex justify-end`}
                >
                  {new Date(msg.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Suggested Quick Prompts */}
      <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto flex gap-2 no-scrollbar">
        {SUGGESTED_QUESTIONS.map((q, i) => (
          <button
            key={i}
            type="button"
            disabled={isStreaming}
            onClick={() => handleSendMessage(q)}
            className="text-[11px] whitespace-nowrap px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-emerald-50 hover:border-emerald-300 dark:hover:bg-emerald-950/40 transition flex items-center gap-1.5 shrink-0"
          >
            <Sparkles className="w-3 h-3 text-emerald-500" />
            {q}
          </button>
        ))}
      </div>

      {/* Input Box */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={input}
            disabled={isStreaming}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`向${currentPersona.name}提问、倾诉卡点或探讨项目落地方案...`}
            className="flex-1 px-4 py-2.5 text-xs sm:text-sm rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isStreaming || !input.trim()}
            className="p-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-40 transition shadow-sm"
          >
            {isStreaming ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
