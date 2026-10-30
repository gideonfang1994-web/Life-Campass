import React, { useState } from 'react';
import {
  Compass,
  LayoutDashboard,
  FolderKanban,
  FileEdit,
  TrendingUp,
  MessageSquareQuote,
  Plus,
  Download,
  Upload,
  RotateCcw,
  Settings,
  X,
  Sparkles,
  Scale,
  Target,
  Flame,
} from 'lucide-react';

export type ActiveTab = 'today' | 'goal_acceleration' | 'dimensions' | 'plan_actual' | 'coach';

interface Props {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  onOpenNewLog: () => void;
  onOpenNewProject: () => void;
  onExportData: () => void;
  onExportHtml: () => void;
  onImportData: (jsonData: string) => void;
  onResetData: () => void;
}

export const Header: React.FC<Props> = ({
  activeTab,
  onTabChange,
  onOpenNewLog,
  onOpenNewProject,
  onExportData,
  onExportHtml,
  onImportData,
  onResetData,
}) => {
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [importText, setImportText] = useState('');

  const handleImportSubmit = () => {
    if (!importText.trim()) return;
    try {
      onImportData(importText.trim());
      setShowSettingsModal(false);
      setImportText('');
    } catch (e) {
      alert('导入失败，请确保格式为合法的 JSON 备份数据');
    }
  };

  const navItems: { id: ActiveTab; label: string; icon: any }[] = [
    { id: 'today', label: '今日焦点', icon: Target },
    { id: 'goal_acceleration', label: '目标实现', icon: Flame },
    { id: 'dimensions', label: '四大维度', icon: FolderKanban },
    { id: 'plan_actual', label: '计划与实绩', icon: Scale },
    { id: 'coach', label: '复盘与教练', icon: MessageSquareQuote },
  ];

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/95 dark:bg-stone-900/95 backdrop-blur-md border-b border-stone-200/80 dark:border-stone-800 transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16 gap-3">
            {/* Logo and Brand */}
            <div
              onClick={() => onTabChange('today')}
              className="flex items-center gap-2.5 cursor-pointer shrink-0"
            >
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-stone-900 text-white dark:bg-white dark:text-stone-900 flex items-center justify-center shadow-md">
                <Compass className="w-5 h-5 animate-spin-slow" />
              </div>
              <div>
                <span className="font-extrabold text-base sm:text-lg tracking-tight text-stone-900 dark:text-white flex items-center gap-1.5">
                  LifeCompass
                  <span className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-full font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300">
                    人生教练
                  </span>
                </span>
                <span className="hidden lg:block text-xs text-stone-400 font-medium">
                  聚焦唯一要事 · 构建无许可杠杆 · 消除假努力
                </span>
              </div>
            </div>

            {/* Desktop Center Navigation Bar */}
            <nav className="hidden md:flex items-center gap-1 p-1 bg-stone-100/90 dark:bg-stone-800/90 rounded-2xl border border-stone-200/50 dark:border-stone-700/50">
              {navItems.map((item) => {
                const isSelected = activeTab === item.id;
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onTabChange(item.id)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
                      isSelected
                        ? 'bg-white dark:bg-stone-900 text-stone-900 dark:text-white shadow-sm'
                        : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white'
                    }`}
                  >
                    <Icon
                      className={`w-4 h-4 transition ${
                        isSelected
                          ? item.id === 'goal_acceleration'
                            ? 'text-amber-500 fill-amber-500'
                            : item.id === 'today'
                            ? 'text-emerald-500'
                            : item.id === 'dimensions'
                            ? 'text-blue-500'
                            : item.id === 'plan_actual'
                            ? 'text-indigo-500'
                            : 'text-purple-500'
                          : 'text-stone-400'
                      }`}
                    />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>

            {/* Quick Actions Right */}
            <div className="flex items-center gap-1.5 sm:gap-2">
              <a
                href="/life_coach.html"
                target="_blank"
                rel="noreferrer"
                className="hidden xl:flex items-center gap-1 px-3 py-1.5 rounded-xl border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300 bg-stone-50/60 dark:bg-stone-800/40 text-xs font-semibold hover:bg-stone-100 transition whitespace-nowrap"
                title="在新标签页中打开单文件独立 HTML 网页"
              >
                🌐 单文件HTML
              </a>

              <button
                type="button"
                onClick={onOpenNewLog}
                className="flex items-center gap-1 sm:gap-1.5 px-3 sm:px-4 py-2 rounded-xl bg-stone-900 text-white dark:bg-white dark:text-stone-900 font-bold text-xs sm:text-sm shadow-sm transition hover:opacity-90 min-h-[40px]"
                title="记觉察 / 打卡"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden xs:inline">记觉察</span>
                <span className="hidden sm:inline"> / 打卡</span>
              </button>

              <button
                type="button"
                onClick={() => setShowSettingsModal(true)}
                className="p-2 sm:p-2.5 rounded-xl text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-white hover:bg-stone-100 dark:hover:bg-stone-800 transition min-w-[40px] min-h-[40px] flex items-center justify-center"
                title="数据备份与设置"
              >
                <Settings className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Fixed Native Mobile Bottom Tab Bar */}
      <nav
        aria-label="移动端底部导航"
        className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-stone-900/95 backdrop-blur-xl border-t border-stone-200/90 dark:border-stone-800 md:hidden pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-4px_16px_rgba(0,0,0,0.06)]"
      >
        <div className="grid grid-cols-5 items-stretch h-15 px-1">
          {navItems.map((item) => {
            const isSelected = activeTab === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onTabChange(item.id)}
                className={`flex flex-col items-center justify-center py-1 rounded-xl transition-all duration-150 min-h-[48px] active:scale-95 ${
                  isSelected
                    ? 'text-stone-950 dark:text-white font-extrabold'
                    : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 font-medium'
                }`}
              >
                <div className="relative">
                  <Icon
                    className={`w-5 h-5 transition-transform ${
                      isSelected
                        ? item.id === 'goal_acceleration'
                          ? 'text-amber-500 fill-amber-500 scale-110'
                          : item.id === 'today'
                          ? 'text-emerald-500 scale-110'
                          : item.id === 'dimensions'
                          ? 'text-blue-500 scale-110'
                          : item.id === 'plan_actual'
                          ? 'text-indigo-500 scale-110'
                          : 'text-purple-500 scale-110'
                        : 'text-stone-400'
                    }`}
                  />
                  {item.id === 'goal_acceleration' && (
                    <span className="absolute -top-1 -right-2.5 px-1 py-0.2 text-[9px] font-black leading-none rounded-full bg-amber-500 text-stone-950 shadow-xs">
                      5X
                    </span>
                  )}
                </div>
                <span className={`text-[10px] sm:text-[11px] mt-0.5 tracking-tight ${isSelected ? 'font-black' : ''}`}>
                  {item.label}
                </span>
                {isSelected && (
                  <span className="w-1 h-1 rounded-full bg-stone-900 dark:bg-white mt-0.5" />
                )}
              </button>
            );
          })}
        </div>
      </nav>



      {/* Settings / Data Backup Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white dark:bg-stone-900 rounded-3xl border border-stone-200 dark:border-stone-800 shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-stone-100 dark:border-stone-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-emerald-600" />
                <h3 className="text-base font-bold text-stone-900 dark:text-white">
                  数据管理与独立 HTML 导出
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
                className="p-1.5 rounded-lg text-stone-400 hover:text-stone-600 dark:hover:text-stone-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs sm:text-sm">
              <div>
                <h4 className="font-bold text-stone-900 dark:text-white mb-1">
                  导出离线独立 HTML 网页
                </h4>
                <p className="text-stone-500 text-xs mb-2 leading-relaxed">
                  将你当下的全部人生项目、计划与实绩记录、打卡日志和复盘报告生成单一离线 HTML 文件，永久保留且不依赖任何服务器。
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onExportHtml();
                      setShowSettingsModal(false);
                    }}
                    className="px-4 py-2 rounded-xl bg-stone-900 text-white dark:bg-white dark:text-stone-900 font-bold text-xs transition flex items-center gap-1.5 shadow-sm"
                  >
                    <span>🌐</span> 一键下载个人独立 HTML
                  </button>
                  <a
                    href="/life_coach.html"
                    target="_blank"
                    rel="noreferrer"
                    className="px-4 py-2 rounded-xl border border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300 text-xs font-semibold hover:bg-stone-50"
                  >
                    新窗口预览
                  </a>
                </div>
              </div>

              <div className="pt-3 border-t border-stone-100 dark:border-stone-800">
                <h4 className="font-bold text-stone-900 dark:text-white mb-1">
                  JSON 备份与恢复
                </h4>
                <p className="text-stone-500 text-xs mb-2">
                  导出或导入完整 JSON 数据集，用于跨设备数据迁移。
                </p>
                <button
                  type="button"
                  onClick={onExportData}
                  className="px-4 py-2 rounded-xl border border-stone-200 dark:border-stone-700 hover:bg-stone-50 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 font-semibold text-xs transition flex items-center gap-2 mb-3"
                >
                  <Download className="w-3.5 h-3.5" /> 下载完整备份文件 (.json)
                </button>

                <textarea
                  rows={2}
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder="在此粘贴此前导出的 JSON 备份文本..."
                  className="w-full px-3 py-2 text-xs rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 text-stone-900 dark:text-white focus:outline-none mb-2"
                />
                <button
                  type="button"
                  onClick={handleImportSubmit}
                  disabled={!importText.trim()}
                  className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-semibold text-xs transition flex items-center gap-1.5"
                >
                  <Upload className="w-3.5 h-3.5" /> 恢复导入数据
                </button>
              </div>

              <div className="pt-3 border-t border-stone-100 dark:border-stone-800">
                <h4 className="font-bold text-rose-600 mb-1">
                  重置演示数据
                </h4>
                <p className="text-stone-500 text-xs mb-2">
                  重置为预装的《最重要的事只有一件》与《纳瓦尔宝典》精选种子范例。
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm('确定要重置为初始种子演示数据吗？')) {
                      onResetData();
                      setShowSettingsModal(false);
                    }
                  }}
                  className="px-4 py-1.5 rounded-xl bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 font-semibold text-xs hover:bg-rose-100 transition flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> 重置为精选演示数据
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
