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
} from 'lucide-react';

export type ActiveTab = 'dashboard' | 'dimensions' | 'logs' | 'retrospective' | 'coach';

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
    { id: 'dashboard', label: '全景中枢', icon: LayoutDashboard },
    { id: 'dimensions', label: '核心维度 (工作·健康·财富·认知)', icon: FolderKanban },
    { id: 'logs', label: '觉察打卡', icon: FileEdit },
    { id: 'retrospective', label: '周期复盘', icon: TrendingUp },
    { id: 'coach', label: 'AI教练室', icon: MessageSquareQuote },
  ];

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-4">
            {/* Logo and Brand */}
            <div
              onClick={() => onTabChange('dashboard')}
              className="flex items-center gap-2.5 cursor-pointer shrink-0"
            >
              <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-emerald-600 via-teal-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-emerald-500/20">
                <Compass className="w-5 h-5 animate-spin-slow" />
              </div>
              <div>
                <span className="font-extrabold text-base tracking-tight text-slate-900 dark:text-white flex items-center gap-1.5">
                  LifeCompass
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300">
                    人生教练
                  </span>
                </span>
                <span className="hidden sm:block text-[10px] text-slate-400 font-medium">
                  监督 · 记录 · 分析 · 复盘 · 进化
                </span>
              </div>
            </div>

            {/* Desktop Navigation Tabs */}
            <nav className="hidden md:flex items-center gap-1 bg-slate-100/80 dark:bg-slate-800/80 p-1 rounded-2xl border border-slate-200/50 dark:border-slate-700/50">
              {navItems.map((item) => {
                const isSelected = activeTab === item.id;
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onTabChange(item.id)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all ${
                      isSelected
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm ring-1 ring-slate-200/60 dark:ring-slate-700/60'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <Icon className={`w-3.5 h-3.5 ${isSelected ? 'text-emerald-600 dark:text-emerald-400' : ''}`} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>

            {/* Quick Actions Right */}
            <div className="flex items-center gap-2">
              <a
                href="/life_coach.html"
                target="_blank"
                rel="noreferrer"
                className="hidden lg:flex items-center gap-1 px-3 py-1.5 rounded-xl border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 bg-emerald-50/60 dark:bg-emerald-950/40 text-xs font-semibold hover:bg-emerald-100 transition"
                title="在新标签页中打开单文件独立 HTML 网页"
              >
                🌐 独立HTML版
              </a>

              <button
                type="button"
                onClick={onOpenNewLog}
                className="hidden sm:flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-sm transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>记觉察 / 打卡</span>
              </button>

              <button
                type="button"
                onClick={() => setShowSettingsModal(true)}
                className="p-2 rounded-xl text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                title="数据备份、导出HTML与设置"
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Navigation Bar */}
        <div className="md:hidden flex items-center justify-around border-t border-slate-200/60 dark:border-slate-800 px-2 py-1.5 bg-slate-50/50 dark:bg-slate-900/50">
          {navItems.map((item) => {
            const isSelected = activeTab === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onTabChange(item.id)}
                className={`flex flex-col items-center py-1 px-2 rounded-xl text-[10px] font-medium transition ${
                  isSelected
                    ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <Icon className="w-4 h-4 mb-0.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </header>

      {/* Settings / Data Backup Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-emerald-600" />
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  数据管理与配置
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                  导出与离线独立网页 (HTML)
                </h4>
                <p className="text-xs text-slate-500 mb-2">
                  可将你当下的全部人生项目、生命之轮、打卡日志和复盘打包为单文件 HTML，无需任何安装，双击即可在任何电脑/手机浏览器中离线打开与打印。
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onExportHtml();
                      setShowSettingsModal(false);
                    }}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition flex items-center gap-2 shadow-sm"
                  >
                    <span>🌐</span>
                    一键导出为独立 HTML 网页 (.html)
                  </button>
                  <a
                    href="/life_coach.html"
                    target="_blank"
                    rel="noreferrer"
                    className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs transition flex items-center gap-1.5"
                  >
                    在新窗口预览单文件版
                  </a>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                  导出个人生命数据库 (JSON)
                </h4>
                <p className="text-xs text-slate-500 mb-2">
                  数据保存在你的本地浏览器，可一键导出为 JSON 备份以便日后在其他设备无缝恢复。
                </p>
                <button
                  type="button"
                  onClick={onExportData}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-xs transition flex items-center gap-2"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-600" />
                  下载完整备份数据 (.json)
                </button>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                  恢复 / 导入备份数据
                </h4>
                <textarea
                  rows={3}
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder="在此粘贴此前导出的 JSON 备份文本..."
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none mb-2"
                />
                <button
                  type="button"
                  onClick={handleImportSubmit}
                  disabled={!importText.trim()}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-semibold text-xs transition flex items-center gap-1.5"
                >
                  <Upload className="w-3.5 h-3.5" />
                  确认恢复导入
                </button>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                <h4 className="text-xs font-bold text-rose-600 dark:text-rose-400 mb-1">
                  重置演示数据
                </h4>
                <p className="text-xs text-slate-500 mb-2">
                  若希望恢复到系统预装的丰富种子项目、打卡样例与生命之轮，可在此重置。
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm('确定要重置为初始演示数据吗？你当前的修改将被覆盖。')) {
                      onResetData();
                      setShowSettingsModal(false);
                    }
                  }}
                  className="px-4 py-2 rounded-xl bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 font-semibold text-xs hover:bg-rose-100 transition flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  重置为初始种子演示数据
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
