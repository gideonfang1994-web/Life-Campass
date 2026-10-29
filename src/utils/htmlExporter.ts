import { LifeProject, DailyLog, LifeWheelScores, RetrospectiveReport } from '../types';

export function exportStandaloneHtmlFile(
  projects: LifeProject[],
  logs: DailyLog[],
  wheelScores: LifeWheelScores,
  retrospectives: RetrospectiveReport[]
) {
  const serializedProjects = JSON.stringify(projects, null, 2);
  const serializedLogs = JSON.stringify(logs, null, 2);
  const serializedWheel = JSON.stringify(wheelScores, null, 2);
  const serializedRetro = JSON.stringify(retrospectives, null, 2);

  const htmlContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LifeCompass · 人生教练 | 个人全景备份网页</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/lucide@latest"></script>
  <style>
    @media print {
      .no-print { display: none !important; }
      body { background: white !important; }
    }
  </style>
</head>
<body class="bg-slate-50 text-slate-900 font-sans min-h-screen flex flex-col antialiased">
  <header class="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200">
    <div class="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
      <div class="flex items-center gap-2.5">
        <div class="w-8 h-8 rounded-xl bg-emerald-600 flex items-center justify-center text-white">
          <i data-lucide="compass" class="w-5 h-5"></i>
        </div>
        <div>
          <span class="font-extrabold text-base text-slate-900 flex items-center gap-1.5">
            LifeCompass · 人生教练
            <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold">已导出独立网页</span>
          </span>
          <span class="text-[10px] text-slate-400">导出时间：${new Date().toLocaleString()}</span>
        </div>
      </div>
      <button onclick="window.print()" class="no-print px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-100 flex items-center gap-1.5">
        <i data-lucide="printer" class="w-3.5 h-3.5"></i> 打印或存为PDF
      </button>
    </div>
  </header>

  <main class="max-w-6xl mx-auto px-4 py-8 space-y-8 flex-1 w-full">
    <!-- Summary Top -->
    <div class="bg-slate-900 text-white rounded-3xl p-6 sm:p-8">
      <h2 class="text-2xl font-bold mb-2">人生项目全盘监督概览</h2>
      <p class="text-xs sm:text-sm text-slate-300 mb-6">本网页为你的本地独立备份，包含 ${projects.length} 个生命项目、${logs.length} 篇觉察日志与全套复盘体系。</p>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div class="p-3 rounded-2xl bg-white/5 border border-white/10">
          <div class="text-[11px] text-slate-400">监督项目数</div>
          <div class="text-xl font-bold mt-1 text-emerald-400">${projects.length}</div>
        </div>
        <div class="p-3 rounded-2xl bg-white/5 border border-white/10">
          <div class="text-[11px] text-slate-400">高优/冲刺主线</div>
          <div class="text-xl font-bold mt-1 text-orange-400">${projects.filter(p => p.priority === 'high' || p.status === 'sprinting').length}</div>
        </div>
        <div class="p-3 rounded-2xl bg-white/5 border border-white/10">
          <div class="text-[11px] text-slate-400">觉察打卡记录</div>
          <div class="text-xl font-bold mt-1 text-blue-400">${logs.length}</div>
        </div>
        <div class="p-3 rounded-2xl bg-white/5 border border-white/10">
          <div class="text-[11px] text-slate-400">复盘报告数</div>
          <div class="text-xl font-bold mt-1 text-purple-400">${retrospectives.length}</div>
        </div>
      </div>
    </div>

    <!-- Section 1: Life Projects -->
    <div class="space-y-4">
      <h3 class="text-lg font-bold text-slate-900 flex items-center gap-2">
        <i data-lucide="folder-kanban" class="w-5 h-5 text-emerald-600"></i>
        生命项目监督矩阵 (${projects.length})
      </h3>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        ${projects.map(p => `
          <div class="p-4 rounded-2xl border border-slate-200 bg-white shadow-sm space-y-3">
            <div class="flex items-center justify-between text-[11px]">
              <span class="px-2 py-0.5 rounded-full font-bold bg-slate-100 text-slate-700">${p.category}</span>
              <span class="font-bold text-emerald-600">${p.status}</span>
            </div>
            <h4 class="font-bold text-sm text-slate-900">${p.title}</h4>
            <p class="text-xs text-slate-500 leading-relaxed">${p.description || ''}</p>
            <div class="space-y-1.5">
              <div class="flex justify-between text-xs font-semibold">
                <span>进度</span><span>${p.progress}%</span>
              </div>
              <div class="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                <div class="bg-emerald-600 h-full" style="width: ${p.progress}%"></div>
              </div>
            </div>
            ${p.nextMicroAction ? `
              <div class="p-2 rounded-xl bg-emerald-50 text-[11px] font-medium text-emerald-800">
                ⚡ 最小第一击: ${p.nextMicroAction}
              </div>
            ` : ''}
          </div>
        `).join('')}
      </div>
    </div>

    <!-- Section 2: Logs -->
    <div class="space-y-4">
      <h3 class="text-lg font-bold text-slate-900 flex items-center gap-2">
        <i data-lucide="calendar" class="w-5 h-5 text-emerald-600"></i>
        近期觉察与打卡明细 (${logs.length})
      </h3>
      <div class="space-y-3">
        ${logs.map(l => `
          <div class="p-4 rounded-2xl border border-slate-200 bg-white text-xs space-y-2">
            <div class="flex justify-between items-center font-bold">
              <span>${l.date}</span>
              <span class="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">⚡ 精力 ${l.energyLevel}/5</span>
            </div>
            <div class="p-2.5 rounded-xl bg-emerald-50/60 font-semibold text-emerald-900">
              🎯 战果高光：${l.highlight}
            </div>
            ${l.wins && l.wins.length > 0 ? `<div class="text-slate-700 font-medium">🏆 确认小胜：${l.wins.join('；')}</div>` : ''}
            ${l.friction ? `<div class="text-slate-500">⚠️ 反思阻抗：${l.friction}</div>` : ''}
          </div>
        `).join('')}
      </div>
    </div>

    <!-- Section 3: Retrospective Reports -->
    ${retrospectives.length > 0 ? `
      <div class="space-y-4">
        <h3 class="text-lg font-bold text-slate-900 flex items-center gap-2">
          <i data-lucide="trending-up" class="w-5 h-5 text-emerald-600"></i>
          战略复盘简报
        </h3>
        ${retrospectives.map(r => `
          <div class="p-6 rounded-3xl border border-slate-200 bg-white shadow-sm space-y-4">
            <h4 class="font-bold text-base text-slate-900">${r.title}</h4>
            <div class="prose text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">${r.content}</div>
          </div>
        `).join('')}
      </div>
    ` : ''}
  </main>

  <footer class="border-t border-slate-200 py-6 text-center text-xs text-slate-400 no-print">
    LifeCompass · 人生教练 | 个人全景备份网页
  </footer>

  <script>lucide.createIcons();</script>
</body>
</html>`;

  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `lifecompass_report_${new Date().toISOString().split('T')[0]}.html`;
  a.click();
  URL.revokeObjectURL(url);
}
