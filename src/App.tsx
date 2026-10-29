import React, { useState, useEffect } from 'react';
import { LifeProject, DailyLog, LifeWheelScores, RetrospectiveReport } from './types';
import {
  INITIAL_PROJECTS,
  INITIAL_LOGS,
  INITIAL_WHEEL_SCORES,
  INITIAL_RETROSPECTIVE,
} from './data/initialData';
import { Header, ActiveTab } from './components/Header';
import { DashboardView } from './components/DashboardView';
import { DimensionHubView } from './components/DimensionHubView';
import { ProjectsListView } from './components/ProjectsListView';
import { LogsTimelineView } from './components/LogsTimelineView';
import { RetrospectiveView } from './components/RetrospectiveView';
import { CoachChatView } from './components/CoachChatView';
import { ProjectModal } from './components/ProjectModal';
import { DailyLogModal } from './components/DailyLogModal';
import { ProjectDiagnosisModal } from './components/ProjectDiagnosisModal';
import { CourseCorrectionModal } from './components/CourseCorrectionModal';
import { ZenFocusTimer } from './components/ZenFocusTimer';
import { exportStandaloneHtmlFile } from './utils/htmlExporter';
import { ProjectCategory } from './types';

export default function App() {
  // Navigation
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');

  // Core State with LocalStorage persistence
  const [projects, setProjects] = useState<LifeProject[]>(() => {
    const saved = localStorage.getItem('life_coach_projects');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return INITIAL_PROJECTS;
  });

  const [logs, setLogs] = useState<DailyLog[]>(() => {
    const saved = localStorage.getItem('life_coach_logs');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return INITIAL_LOGS;
  });

  const [wheelScores, setWheelScores] = useState<LifeWheelScores>(() => {
    const saved = localStorage.getItem('life_coach_wheel');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return INITIAL_WHEEL_SCORES;
  });

  const [retrospectives, setRetrospectives] = useState<RetrospectiveReport[]>(() => {
    const saved = localStorage.getItem('life_coach_retrospectives');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return [INITIAL_RETROSPECTIVE];
  });

  // Sync to LocalStorage
  useEffect(() => {
    localStorage.setItem('life_coach_projects', JSON.stringify(projects));
  }, [projects]);

  useEffect(() => {
    localStorage.setItem('life_coach_logs', JSON.stringify(logs));
  }, [logs]);

  useEffect(() => {
    localStorage.setItem('life_coach_wheel', JSON.stringify(wheelScores));
  }, [wheelScores]);

  useEffect(() => {
    localStorage.setItem('life_coach_retrospectives', JSON.stringify(retrospectives));
  }, [retrospectives]);

  // Modal States
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<LifeProject | null>(null);
  const [defaultProjectCategory, setDefaultProjectCategory] = useState<ProjectCategory>('career');

  const [isDailyLogModalOpen, setIsDailyLogModalOpen] = useState(false);

  const [diagnosingProject, setDiagnosingProject] = useState<LifeProject | null>(null);
  const [correctingProject, setCorrectingProject] = useState<LifeProject | null>(null);

  const [focusProject, setFocusProject] = useState<LifeProject | null>(null);
  const [isFocusTimerOpen, setIsFocusTimerOpen] = useState(false);

  const [selectedDimensionCategory, setSelectedDimensionCategory] = useState<ProjectCategory>('career');

  const [coachActiveProject, setCoachActiveProject] = useState<LifeProject | null>(null);

  // Project CRUD operations
  const handleSaveProject = (project: LifeProject) => {
    const exists = projects.some((p) => p.id === project.id);
    if (exists) {
      setProjects(projects.map((p) => (p.id === project.id ? project : p)));
    } else {
      setProjects([project, ...projects]);
    }
  };

  const handleUpdateProject = (updated: LifeProject) => {
    setProjects(projects.map((p) => (p.id === updated.id ? updated : p)));
  };

  const handleDeleteProject = (id: string) => {
    setProjects(projects.filter((p) => p.id !== id));
  };

  const handleEditProject = (project: LifeProject) => {
    setEditingProject(project);
    setIsProjectModalOpen(true);
  };

  const handleOpenNewProject = (defaultCat?: ProjectCategory) => {
    setEditingProject(null);
    setDefaultProjectCategory(defaultCat || 'career');
    setIsProjectModalOpen(true);
  };

  // Focus Mode Handler
  const handleStartFocusTimer = (project: LifeProject) => {
    setFocusProject(project);
    setIsFocusTimerOpen(true);
  };

  const handleFocusSessionComplete = (project: LifeProject, minutes: number) => {
    const today = new Date().toISOString().split('T')[0];
    const newProgress = Math.min(100, project.progress + 5);
    
    // Add check-in to project
    const updated = {
      ...project,
      progress: newProgress,
      checkins: [
        ...(project.checkins || []),
        {
          id: 'chk-' + Date.now(),
          date: today,
          note: `完成了一次 ${minutes} 分钟深度心流专注`,
          progressDelta: 5,
        },
      ],
      updatedAt: new Date().toISOString(),
    };
    handleUpdateProject(updated);

    // Also append a micro-win to today's log
    const focusLog: DailyLog = {
      id: 'log-' + Date.now(),
      date: today,
      energyLevel: 4,
      mood: 'focused',
      highlight: `在项目【${project.title}】中完成了一次 ${minutes} 分钟心流专注`,
      wins: [`保持无干扰专注 ${minutes} 分钟`, `推进了【${project.title}】5%进度`],
      friction: '',
      createdAt: new Date().toISOString(),
    };
    setLogs((prev) => [focusLog, ...prev]);
    setIsFocusTimerOpen(false);
  };

  // Course Correction Handler
  const handleApplyCorrection = (projectId: string, newMicroAction: string, note?: string) => {
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id === projectId) {
          return {
            ...p,
            nextMicroAction: newMicroAction,
            status: 'on_track', // Reset from needs_attention to on_track
            correctionNotes: note,
            updatedAt: new Date().toISOString(),
          };
        }
        return p;
      })
    );
  };

  // Log Operations
  const handleSaveLog = (newLog: DailyLog, updatedProjectsList?: LifeProject[]) => {
    setLogs([newLog, ...logs]);
    if (updatedProjectsList) {
      setProjects(updatedProjectsList);
    }
  };

  const handleDeleteLog = (id: string) => {
    setLogs(logs.filter((l) => l.id !== id));
  };

  // Diagnosis
  const handleDiagnoseProject = (project: LifeProject) => {
    setDiagnosingProject(project);
  };

  // Coach Chat Focus
  const handleOpenCoachChat = (project?: LifeProject) => {
    if (project) {
      setCoachActiveProject(project);
    }
    setActiveTab('coach');
  };

  // Retrospective
  const handleSaveRetrospective = (report: RetrospectiveReport) => {
    setRetrospectives([report, ...retrospectives]);
  };

  // Data Export / Import / Reset
  const handleExportData = () => {
    const fullBackup = {
      projects,
      logs,
      wheelScores,
      retrospectives,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(fullBackup, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lifecompass_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportHtml = () => {
    exportStandaloneHtmlFile(projects, logs, wheelScores, retrospectives);
  };

  const handleImportData = (jsonData: string) => {
    const parsed = JSON.parse(jsonData);
    if (parsed.projects && Array.isArray(parsed.projects)) {
      setProjects(parsed.projects);
    }
    if (parsed.logs && Array.isArray(parsed.logs)) {
      setLogs(parsed.logs);
    }
    if (parsed.wheelScores) {
      setWheelScores(parsed.wheelScores);
    }
    if (parsed.retrospectives && Array.isArray(parsed.retrospectives)) {
      setRetrospectives(parsed.retrospectives);
    }
    alert('备份数据导入成功！');
  };

  const handleResetData = () => {
    setProjects(INITIAL_PROJECTS);
    setLogs(INITIAL_LOGS);
    setWheelScores(INITIAL_WHEEL_SCORES);
    setRetrospectives([INITIAL_RETROSPECTIVE]);
    localStorage.removeItem('life_coach_chat_messages');
    alert('已成功重置为初始种子演示数据。');
  };

  return (
    <div className="min-h-screen bg-slate-50/70 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors">
      {/* Global Header */}
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onOpenNewLog={() => setIsDailyLogModalOpen(true)}
        onOpenNewProject={handleOpenNewProject}
        onExportData={handleExportData}
        onExportHtml={handleExportHtml}
        onImportData={handleImportData}
        onResetData={handleResetData}
      />

      {/* Main View Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {activeTab === 'dashboard' && (
          <DashboardView
            projects={projects}
            logs={logs}
            wheelScores={wheelScores}
            onUpdateProject={handleUpdateProject}
            onDeleteProject={handleDeleteProject}
            onDiagnoseProject={handleDiagnoseProject}
            onOpenCoachChat={handleOpenCoachChat}
            onEditProject={handleEditProject}
            onOpenNewProject={() => handleOpenNewProject()}
            onOpenNewLog={() => setIsDailyLogModalOpen(true)}
            onUpdateWheelScores={setWheelScores}
            onNavigateToProjects={() => setActiveTab('dimensions')}
            onNavigateToReview={() => setActiveTab('retrospective')}
          />
        )}

        {activeTab === 'dimensions' && (
          <DimensionHubView
            projects={projects}
            logs={logs}
            selectedCategory={selectedDimensionCategory}
            onSelectCategory={setSelectedDimensionCategory}
            onUpdateProject={handleUpdateProject}
            onDeleteProject={handleDeleteProject}
            onEditProject={handleEditProject}
            onOpenNewProject={(cat) => handleOpenNewProject(cat)}
            onOpenFocusTimer={handleStartFocusTimer}
            onOpenCorrection={(p) => setCorrectingProject(p)}
            onOpenCoachChat={handleOpenCoachChat}
          />
        )}

        {activeTab === 'logs' && (
          <LogsTimelineView
            logs={logs}
            projects={projects}
            onOpenNewLog={() => setIsDailyLogModalOpen(true)}
            onDeleteLog={handleDeleteLog}
          />
        )}

        {activeTab === 'retrospective' && (
          <RetrospectiveView
            projects={projects}
            logs={logs}
            wheelScores={wheelScores}
            retrospectives={retrospectives}
            onSaveRetrospective={handleSaveRetrospective}
          />
        )}

        {activeTab === 'coach' && (
          <CoachChatView
            projects={projects}
            recentLogs={logs}
            wheelScores={wheelScores}
            activeProject={coachActiveProject}
            onClearActiveProject={() => setCoachActiveProject(null)}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200/60 dark:border-slate-800 py-6 text-center text-xs text-slate-400">
        <p>LifeCompass · 人生教练 — 工作 · 健康 · 财富 · 认知 四大维度深度监督、记录分析与复盘纠偏</p>
      </footer>

      {/* Modals */}
      <ProjectModal
        isOpen={isProjectModalOpen}
        initialProject={editingProject}
        defaultCategory={defaultProjectCategory}
        onClose={() => setIsProjectModalOpen(false)}
        onSave={handleSaveProject}
      />

      <DailyLogModal
        isOpen={isDailyLogModalOpen}
        projects={projects}
        onClose={() => setIsDailyLogModalOpen(false)}
        onSaveLog={handleSaveLog}
      />

      <ProjectDiagnosisModal
        project={diagnosingProject}
        userLogs={logs}
        onClose={() => setDiagnosingProject(null)}
        onOpenCoachChat={(p) => {
          setDiagnosingProject(null);
          setCoachActiveProject(p);
          setActiveTab('coach');
        }}
      />

      <CourseCorrectionModal
        project={correctingProject}
        onClose={() => setCorrectingProject(null)}
        onApplyCorrection={handleApplyCorrection}
      />

      <ZenFocusTimer
        project={focusProject}
        isOpen={isFocusTimerOpen}
        onClose={() => setIsFocusTimerOpen(false)}
        onCompleteSession={handleFocusSessionComplete}
      />
    </div>
  );
}
