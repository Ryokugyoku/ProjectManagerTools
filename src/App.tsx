import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { isPermissionGranted, sendNotification } from "@tauri-apps/plugin-notification";
import { calculateEndDate, countries, formatISODate } from "./lib/calendar";
import {
  createWbsTask, deleteWbsTask, getSettings, listAssignees, listDailyProgressSnapshots, listRecordedProgressDates, listUserLeaves, listWbsTasks,
  finalizeWbsTask, listTaskTreeHistory, saveDailyProgress, saveScheduleChanges, saveSettings, updateWbsTask,
  type AppSettings, type Assignee, type DailyProgressSnapshot, type TaskTreeHistoryEntry, type UserLeave, type WbsStatus, type WbsTask, type WorkHistoryEntry,
} from "./lib/wbs";
import { buildScheduleCascade, buildScheduleCascadeForNewChild, expectedProgress, scheduleChangesRequireReason, type ScheduleChange, type TaskSchedule } from "./lib/wbsPlanning";
import { TimelineBoard } from "./features/wbs/TimelineBoard";
import { businessDaysOrDefault, missingProgressDates, parseBusinessDaysInput, requireDailyProgress, type WbsTaskForm } from "./features/wbs/taskForm";
import { WbsProjectSelector } from "./features/wbs/WbsProjectSelector";
import { UsersScreen } from "./features/users/UsersScreen";
import { SettingsScreen } from "./features/settings/SettingsScreen";
import { ProjectsScreen } from "./features/projects/ProjectsScreen";
import { HomeScreen } from "./features/home/HomeScreen";
import { DailyReportScreen } from "./features/reports/DailyReportScreen";
import { AnalysisScreen } from "./features/analysis/AnalysisScreen";
import { previousBusinessDate } from "./lib/dailyReport";
import { listProjects, type Project } from "./lib/projects";
import { createMilestone, deleteMilestone, listMilestones, MILESTONE_COLOR_OPTIONS, updateMilestone, type Milestone, type MilestoneInput } from "./lib/milestones";
import { MilestonePanel } from "./features/wbs/MilestonePanel";
import { dailyProgressActionLabel, filterWbsTasks, parentTaskCandidates, prerequisiteTaskCandidates, summarizeWbsTasks, type WbsFilters, type WbsFilterValue, type WbsGroupBy } from "./lib/wbsView";
import "./App.css";

type View = "home" | "wbs" | "analysis" | "reports" | "projects" | "users" | "settings";
type WbsRoadmapMode = "select" | "all" | "project";

const statusLabels: Record<WbsStatus, string> = {
  not_started: "未着手", in_progress: "進行中", completed: "完了", on_hold: "保留",
};

const emptySettings: AppSettings = {
  countryCode: "JP", notificationTime: "17:30", notificationsEnabled: false,
  lastNotifiedDate: null, dailyReportAncestorDepth: 3,
};

function App() {
  const [currentDate, setCurrentDate] = useState(() => formatISODate(new Date()));
  const [view, setView] = useState<View>("home");
  const [tasks, setTasks] = useState<WbsTask[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [userLeaves, setUserLeaves] = useState<UserLeave[]>([]);
  const [settings, setSettings] = useState<AppSettings>(emptySettings);
  const [reportSnapshots, setReportSnapshots] = useState<DailyProgressSnapshot[]>([]);
  const [reportSnapshotsLoaded, setReportSnapshotsLoaded] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedRoadmapProjectId, setSelectedRoadmapProjectId] = useState<number | null>(null);
  const [roadmapMode, setRoadmapMode] = useState<WbsRoadmapMode>("select");
  const [showCreate, setShowCreate] = useState(false);
  const [createParentTaskId, setCreateParentTaskId] = useState<number | null>(null);
  const [progressTask, setProgressTask] = useState<{ task: WbsTask; pastOnly: boolean } | null>(null);
  const [historyTask, setHistoryTask] = useState<WbsTask | null>(null);
  const [reschedule, setReschedule] = useState<{ task: WbsTask; changes: ScheduleChange[] } | null>(null);
  const [milestoneEditor, setMilestoneEditor] = useState<Milestone | "new" | null>(null);
  const [groupBy, setGroupBy] = useState<WbsGroupBy>("project");
  const [filters, setFilters] = useState<WbsFilters>({ query: "", projectId: "all", assigneeId: "all", status: "all" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [nextTasks, nextAssignees, nextProjects, nextMilestones, nextSettings, nextLeaves] = await Promise.all([
        listWbsTasks(currentDate), listAssignees(), listProjects(), listMilestones(), getSettings(), listUserLeaves(),
      ]);
      setTasks(nextTasks);
      setAssignees(nextAssignees);
      setProjects(nextProjects);
      setMilestones(nextMilestones);
      setUserLeaves(nextLeaves);
      setSettings(nextSettings);
      setSelectedId((current) => current && nextTasks.some((task) => task.id === current) ? current : nextTasks[0]?.id ?? null);
      setError(null);
    } catch (cause) {
      setError(toMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [currentDate]);

  useEffect(() => { void refresh(); }, [refresh]);

  const reportDate = previousBusinessDate(currentDate, settings.countryCode);
  useEffect(() => {
    let active = true;
    setReportSnapshotsLoaded(false);
    if (view === "reports") setReportLoading(true);
    void listDailyProgressSnapshots(reportDate)
      .then((records) => { if (active) { setReportSnapshots(records); setReportSnapshotsLoaded(true); setError(null); } })
      .catch((cause) => { if (active) setError(toMessage(cause)); })
      .finally(() => { if (active) setReportLoading(false); });
    return () => { active = false; };
  }, [reportDate, view]);

  useEffect(() => {
    const updateDate = () => setCurrentDate(formatISODate(new Date()));
    const timer = window.setInterval(updateDate, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    async function notifyIfDue() {
      if (!settings.notificationsEnabled || !("__TAURI_INTERNALS__" in window)) return;
      const now = new Date();
      const today = formatISODate(now);
      const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      if (time !== settings.notificationTime || settings.lastNotifiedDate === today) return;
      const openTasks = tasks.filter((task) => task.status !== "completed").length;
      if (openTasks === 0) return;
      try {
        if (await isPermissionGranted()) {
          sendNotification({ title: "WBSの進捗を入力しましょう", body: `未完了のWBSが${openTasks}件あります。今日の進捗を記録してください。` });
          const next = { ...settings, lastNotifiedDate: today };
          await saveSettings(next);
          setSettings(next);
        }
      } catch (cause) {
        setError(`通知を送信できませんでした: ${toMessage(cause)}`);
      }
    }
    void notifyIfDue();
    const timer = window.setInterval(() => void notifyIfDue(), 30_000);
    return () => window.clearInterval(timer);
  }, [settings, tasks]);

  const selectedRoadmapProject = projects.find((project) => project.id === selectedRoadmapProjectId) ?? null;
  const selectedTask = tasks.find((task) => task.id === selectedId) ?? null;
  const roadmapTasks = useMemo(() => roadmapMode === "all" ? tasks : tasks.filter((task) => task.projectId === selectedRoadmapProjectId), [roadmapMode, selectedRoadmapProjectId, tasks]);
  const roadmapMilestones = useMemo(() => roadmapMode === "all" ? milestones : milestones.filter((milestone) => milestone.projectId === selectedRoadmapProjectId), [milestones, roadmapMode, selectedRoadmapProjectId]);
  const openTasks = useMemo(() => roadmapTasks.filter((task) => task.status !== "completed").length, [roadmapTasks]);
  const visibleTasks = useMemo(() => filterWbsTasks(tasks, filters), [filters, tasks]);
  const visibleSummary = useMemo(() => summarizeWbsTasks(visibleTasks, formatISODate(new Date())), [visibleTasks]);
  const filterAssignees = useMemo(() => {
    if (typeof filters.projectId !== "number") return assignees;
    const project = projects.find((item) => item.id === filters.projectId);
    return project ? assignees.filter((person) => project.members.some((member) => member.userId === person.id)) : assignees;
  }, [assignees, filters.projectId, projects]);
  const hasActiveFilters = filters.query.trim() !== "" || filters.projectId !== (roadmapMode === "all" ? "all" : selectedRoadmapProjectId) || filters.assigneeId !== "all" || filters.status !== "all";
  const pastMissingTaskIds = useMemo(() => {
    if (!reportSnapshotsLoaded) return new Set<number>();
    const snapshotByTask = new Map(reportSnapshots.map((snapshot) => [snapshot.taskId, snapshot]));
    return new Set(tasks.filter((task) => task.status !== "completed" && task.plannedStart <= reportDate && snapshotByTask.get(task.id)?.dailyProgress == null).map((task) => task.id));
  }, [reportDate, reportSnapshots, reportSnapshotsLoaded, tasks]);

  function openWbsProjectSelection() {
    setRoadmapMode("select");
    setSelectedRoadmapProjectId(null);
    setSelectedId(null);
    setFilters({ query: "", projectId: "all", assigneeId: "all", status: "all" });
    setView("wbs");
  }

  function openProjectRoadmap(project: Project) {
    setRoadmapMode("project");
    setSelectedRoadmapProjectId(project.id);
    setSelectedId(null);
    setFilters({ query: "", projectId: project.id, assigneeId: "all", status: "all" });
  }

  function openAllRoadmap() {
    setRoadmapMode("all");
    setSelectedRoadmapProjectId(null);
    setSelectedId(null);
    setFilters({ query: "", projectId: "all", assigneeId: "all", status: "all" });
  }

  function openTaskCreate(parentTaskId: number | null = null) {
    setCreateParentTaskId(parentTaskId);
    setShowCreate(true);
  }

  function openProgress(task: WbsTask) {
    setProgressTask({ task, pastOnly: pastMissingTaskIds.has(task.id) });
  }

  useEffect(() => {
    if (selectedId !== null && !visibleTasks.some((task) => task.id === selectedId)) setSelectedId(null);
  }, [selectedId, visibleTasks]);

  async function removeTask(task: WbsTask) {
    const hasChildren = tasks.some((candidate) => candidate.parentTaskId === task.id);
    const note = hasChildren ? "\n子タスクは削除せず、親なしのタスクとして残します。" : "";
    if (!window.confirm(`「${task.title}」を削除しますか？${note}`)) return;
    try { await deleteWbsTask(task.id); await refresh(); } catch (cause) { setError(toMessage(cause)); }
  }

  const updateSchedule = useCallback(async (task: WbsTask, schedule: TaskSchedule) => {
    try {
      const changes = buildScheduleCascade(tasks, task.id, schedule);
      if (scheduleChangesRequireReason(tasks, changes)) {
        setReschedule({ task, changes });
        return;
      }
      for (const change of changes) {
        const current = tasks.find((candidate) => candidate.id === change.taskId);
        if (current) await updateWbsTask(current.id, { ...current, ...change.after });
      }
      await refresh();
    } catch (cause) { setError(toMessage(cause)); }
  }, [refresh, tasks]);

  return (
    <div className="app-frame">
      <aside className="app-nav" aria-label="メインナビゲーション">
        <div className="brand-mark">PM</div>
        <button className={view === "home" ? "active" : ""} onClick={() => setView("home")} aria-label="ホーム">
          <span aria-hidden="true">⌂</span><small>ホーム</small>
        </button>
        <button className={view === "wbs" ? "active" : ""} onClick={openWbsProjectSelection} aria-label="WBS">
          <span aria-hidden="true">▦</span><small>WBS</small>
        </button>
        <button className={view === "analysis" ? "active" : ""} onClick={() => setView("analysis")} aria-label="分析">
          <span aria-hidden="true">⌁</span><small>分析</small>
        </button>
        <button className={view === "reports" ? "active" : ""} onClick={() => setView("reports")} aria-label="作業報告">
          <span aria-hidden="true">◷</span><small>報告</small>
        </button>
        <button className={view === "projects" ? "active" : ""} onClick={() => setView("projects")} aria-label="案件">
          <span aria-hidden="true">◇</span><small>案件</small>
        </button>
        <button className={view === "users" ? "active" : ""} onClick={() => setView("users")} aria-label="ユーザー">
          <span aria-hidden="true">♙</span><small>ユーザー</small>
        </button>
        <button className={view === "settings" ? "active" : ""} onClick={() => setView("settings")} aria-label="設定">
          <span aria-hidden="true">⚙</span><small>設定</small>
        </button>
      </aside>

      {error && <div className="global-error error" role="alert"><span>{error}</span><button onClick={() => setError(null)}>閉じる</button></div>}

      {view === "home" ? (
        <HomeScreen tasks={tasks} projects={projects} users={assignees} loading={loading} onNavigate={(nextView) => nextView === "wbs" ? openWbsProjectSelection() : setView(nextView)} onOpenTask={(task) => { setRoadmapMode(task.projectId === null ? "all" : "project"); setSelectedRoadmapProjectId(task.projectId); setFilters({ query: "", projectId: task.projectId ?? "all", assigneeId: "all", status: "all" }); setSelectedId(task.id); setView("wbs"); }} />
      ) : view === "analysis" ? (
        <AnalysisScreen projects={projects} tasks={tasks} today={currentDate} loading={loading} />
      ) : view === "reports" ? (
        <DailyReportScreen projects={projects} tasks={tasks} snapshots={reportSnapshots} reportDate={reportDate} loading={loading || reportLoading} ancestorDepth={settings.dailyReportAncestorDepth} onOpenWbs={(projectId) => { const project = projects.find((item) => item.id === projectId); if (project) { openProjectRoadmap(project); setView("wbs"); } else openWbsProjectSelection(); }} />
      ) : view === "users" ? (
        <UsersScreen users={assignees} leaves={userLeaves} onChanged={refresh} onError={setError} />
      ) : view === "projects" ? (
        <ProjectsScreen projects={projects} users={assignees} onChanged={refresh} onError={setError} />
      ) : view === "settings" ? (
        <SettingsScreen settings={settings} onSaved={setSettings} onError={setError} />
      ) : roadmapMode === "select" ? (
        <WbsProjectSelector projects={projects} tasks={tasks} loading={loading} onSelectAll={openAllRoadmap} onSelect={openProjectRoadmap} onCreate={() => setView("projects")} />
      ) : (
        <main className="wbs-screen">
          <header className="wbs-header">
            <div>
              <p className="eyebrow">WORK BREAKDOWN STRUCTURE</p>
              <h1>{roadmapMode === "all" ? "全体WBSロードマップ" : selectedRoadmapProject?.name}</h1>
              <p className="header-context">{roadmapMode === "all" ? `全${projects.length}案件・案件未設定を含む` : `WBSロードマップ · ${selectedRoadmapProject?.code}`}</p>
              <p className="header-subtitle">{openTasks}件の未完了WBS · {countryName(settings.countryCode)}の営業日</p>
            </div>
            <div className="header-actions">
              <button className="quiet-button" onClick={openWbsProjectSelection}>表示範囲を変更</button>
              {selectedRoadmapProject && <button className="quiet-button" onClick={() => setMilestoneEditor("new")}>＋ マイルストーン</button>}
              <button className="primary-button" onClick={() => openTaskCreate()}>＋ ロードマップにタスクを追加</button>
            </div>
          </header>

          {!loading && assignees.length === 0 && <section className="setup-banner" aria-label="WBSの準備状況"><div><span className="setup-icon">↗</span><div><strong>WBSをチームの計画として活用しましょう</strong><p>ユーザーを登録して案件メンバーに追加すると、WBSへ責任者を割り当てられます。</p></div></div><div><button className="quiet-button" onClick={() => setView("users")}>ユーザーを登録</button></div></section>}

          {!loading && selectedRoadmapProject && <MilestonePanel milestones={roadmapMilestones} project={selectedRoadmapProject} today={formatISODate(new Date())} onCreate={() => setMilestoneEditor("new")} onEdit={setMilestoneEditor} />}

          {!loading && roadmapTasks.length > 0 && <>
            <section className="wbs-summary" aria-label="表示中のWBS概要">
              <div><span>表示中</span><strong>{visibleSummary.total}</strong><small>全{roadmapTasks.length}件</small></div>
              <div><span>未完了</span><strong>{visibleSummary.open}</strong><small>平均進捗 {visibleSummary.averageProgress}%</small></div>
              <div className={visibleSummary.overdue > 0 ? "attention" : ""}><span>期限超過</span><strong>{visibleSummary.overdue}</strong><small>完了以外</small></div>
              <div className={visibleSummary.unassigned > 0 ? "attention" : ""}><span>責任者未設定</span><strong>{visibleSummary.unassigned}</strong><small>責任者の割り当て</small></div>
            </section>
            <section className="wbs-controls" aria-label="WBSの表示条件">
              <label className="search-field"><span>検索</span><input type="search" value={filters.query} onChange={(event) => setFilters({ ...filters, query: event.currentTarget.value })} placeholder="WBS名・責任者" /></label>
              {roadmapMode === "all" && <label><span>案件</span><select value={filters.projectId} onChange={(event) => setFilters({ ...filters, projectId: parseFilterValue(event.currentTarget.value), assigneeId: "all" })}><option value="all">すべての案件</option><option value="unset">案件未設定</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>}
              <label><span>責任者</span><select value={filters.assigneeId} onChange={(event) => setFilters({ ...filters, assigneeId: parseFilterValue(event.currentTarget.value) })}><option value="all">すべての責任者</option><option value="unset">未設定</option>{filterAssignees.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
              <label><span>状態</span><select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.currentTarget.value as WbsFilters["status"] })}><option value="all">すべての状態</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <fieldset className="group-switch"><legend>まとめ方</legend><button type="button" className={groupBy === "project" ? "active" : ""} aria-pressed={groupBy === "project"} onClick={() => setGroupBy("project")}>案件</button><button type="button" className={groupBy === "assignee" ? "active" : ""} aria-pressed={groupBy === "assignee"} onClick={() => setGroupBy("assignee")}>責任者</button></fieldset>
            </section>
          </>}

          {loading ? <div className="loading-card">WBSを読み込んでいます…</div> : roadmapTasks.length === 0 && roadmapMilestones.length === 0 ? <section className="wbs-empty"><span>▦</span><h2>{roadmapMode === "all" ? "最初のWBSを追加しましょう" : "このプロジェクトの最初のタスクを追加しましょう"}</h2><p>責任者と日程を紐づけると、ロードマップ上で予定と進捗をまとめて確認できます。</p><button className="primary-button" onClick={() => openTaskCreate()}>＋ ロードマップにタスクを追加</button></section> : visibleTasks.length === 0 && roadmapTasks.length > 0 ? <section className="wbs-empty filtered"><span>⌕</span><h2>条件に一致するWBSがありません</h2><p>検索語または絞り込み条件を変更してください。</p>{hasActiveFilters && <button className="quiet-button" onClick={() => setFilters({ query: "", projectId: roadmapMode === "all" ? "all" : selectedRoadmapProjectId ?? "all", assigneeId: "all", status: "all" })}>絞り込みを解除</button>}</section> : <TimelineBoard tasks={visibleTasks} allTasks={roadmapTasks} milestones={roadmapMilestones.filter((milestone) => filters.projectId === "all" || milestone.projectId === filters.projectId)} assignees={assignees} projects={projects} groupBy={groupBy} countryCode={settings.countryCode} selectedId={selectedId} pastMissingTaskIds={pastMissingTaskIds} onSelect={(task) => setSelectedId(task.id)} onCreateSubtask={(task) => openTaskCreate(task.id)} onShowHistory={setHistoryTask} onRecordProgress={openProgress} onSelectMilestone={setMilestoneEditor} onScheduleChange={updateSchedule} />}
          {selectedTask && <aside className="task-drawer" aria-label="タスク詳細"><button className="drawer-close" aria-label="詳細を閉じる" onClick={() => setSelectedId(null)}>×</button><TaskEditor task={selectedTask} tasks={roadmapTasks} countryCode={settings.countryCode} projects={projects} assignees={assignees} pastMissing={pastMissingTaskIds.has(selectedTask.id)} onChanged={refresh} onCreateChild={() => openTaskCreate(selectedTask.id)} onProgress={() => openProgress(selectedTask)} onDelete={() => void removeTask(selectedTask)} onError={setError} /></aside>}
        </main>
      )}

      {showCreate && <TaskModal settings={settings} projects={projects} assignees={assignees} tasks={roadmapTasks} initialProjectId={selectedRoadmapProjectId} initialParentTaskId={createParentTaskId} onClose={() => setShowCreate(false)} onSaved={async () => { setShowCreate(false); await refresh(); }} onError={setError} />}
      {progressTask && <ProgressModal task={progressTask.task} pastOnly={progressTask.pastOnly} reportDate={reportDate} onClose={() => setProgressTask(null)} onSaved={async () => { setProgressTask(null); await refresh(); setReportSnapshots(await listDailyProgressSnapshots(reportDate)); }} onError={setError} />}
      {historyTask && <HistoryModal task={historyTask} onClose={() => setHistoryTask(null)} onError={setError} />}
      {reschedule && <RescheduleModal task={reschedule.task} changes={reschedule.changes} tasks={tasks} onClose={() => setReschedule(null)} onSaved={async () => { setReschedule(null); await refresh(); }} onError={setError} />}
      {milestoneEditor && (milestoneEditor === "new" ? selectedRoadmapProject : projects.find((project) => project.id === milestoneEditor.projectId)) && <MilestoneModal milestone={milestoneEditor === "new" ? null : milestoneEditor} project={(milestoneEditor === "new" ? selectedRoadmapProject : projects.find((project) => project.id === milestoneEditor.projectId))!} onClose={() => setMilestoneEditor(null)} onSaved={async () => { setMilestoneEditor(null); await refresh(); }} onError={setError} />}
    </div>
  );
}

function MilestoneModal({ milestone, project, onClose, onSaved, onError }: { milestone: Milestone | null; project: Project; onClose: () => void; onSaved: () => Promise<void>; onError: (value: string | null) => void }) {
  const [form, setForm] = useState<MilestoneInput>({ projectId: project.id, name: milestone?.name ?? "", description: milestone?.description ?? "", dueDate: milestone?.dueDate ?? formatISODate(new Date()), completed: milestone?.completed ?? false, color: milestone?.color ?? "forest" });
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true);
    try { if (milestone) await updateMilestone(milestone.id, form); else await createMilestone(form); await onSaved(); }
    catch (cause) { onError(toMessage(cause)); setSaving(false); }
  }
  async function remove() {
    if (!milestone || !window.confirm(`マイルストーン「${milestone.name}」を削除しますか？`)) return;
    setSaving(true);
    try { await deleteMilestone(milestone.id); await onSaved(); } catch (cause) { onError(toMessage(cause)); setSaving(false); }
  }
  return <Modal title={milestone ? "マイルストーンを編集" : "マイルストーンを追加"} onClose={onClose}>
    <form className="modal-form" onSubmit={submit}>
      <div className="milestone-project-context"><span>所属プロジェクト</span><strong>{project.name}</strong><small>{project.code}</small></div>
      <div className="field-grid">
        <label className="wide">マイルストーン名<input required maxLength={120} value={form.name} onChange={(event) => setForm({ ...form, name: event.currentTarget.value })} placeholder="例：正式リリース" /></label>
        <label className="wide">説明<textarea rows={2} maxLength={1000} value={form.description} onChange={(event) => setForm({ ...form, description: event.currentTarget.value })} placeholder="達成条件や補足" /></label>
        <fieldset className="milestone-color-picker wide"><legend>列の色</legend><p>ロードマップで節目を識別するための、画面に調和した色です。</p><div className="milestone-color-options">{MILESTONE_COLOR_OPTIONS.map((option) => <label key={option.value} style={{ "--choice-color": option.solid } as React.CSSProperties}><input type="radio" name="milestone-color" value={option.value} checked={form.color === option.value} onChange={() => setForm({ ...form, color: option.value })} /><span className="milestone-color-swatch" aria-hidden="true" /><small>{option.label}</small></label>)}</div></fieldset>
        <label>達成予定日<input required type="date" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.currentTarget.value })} /></label>
        <label className="milestone-completed"><span>達成状態</span><span><input type="checkbox" checked={form.completed} onChange={(event) => setForm({ ...form, completed: event.currentTarget.checked })} /> 達成済みにする</span></label>
      </div>
      <div className="modal-actions milestone-actions">{milestone && <button type="button" className="danger-text" disabled={saving} onClick={() => void remove()}>削除</button>}<span className="action-spacer" /><button type="button" className="quiet-button" onClick={onClose}>キャンセル</button><button className="primary-button" disabled={saving || !form.name.trim()}>{saving ? "保存中…" : milestone ? "変更を保存" : "追加する"}</button></div>
    </form>
  </Modal>;
}

function TaskModal({ settings, projects, assignees, tasks, initialProjectId, initialParentTaskId, onClose, onSaved, onError }: {
  settings: AppSettings; projects: Project[]; assignees: Assignee[]; tasks: WbsTask[]; initialProjectId: number | null; initialParentTaskId: number | null; onClose: () => void; onSaved: () => Promise<void>; onError: (value: string | null) => void;
}) {
  const today = formatISODate(new Date());
  const parentTask = tasks.find((task) => task.id === initialParentTaskId);
  const [form, setForm] = useState<WbsTaskForm>({
    title: "", description: "", projectId: parentTask?.projectId ?? initialProjectId, parentTaskId: initialParentTaskId, prerequisiteTaskId: null, prerequisiteTaskIds: [], assigneeId: null, status: "not_started", progress: 0,
    countryCode: settings.countryCode, plannedStart: today,
    plannedEnd: calculateEndDate(today, 1, settings.countryCode), businessDays: "",
    actualStart: null, actualEnd: null,
  });
  const [saving, setSaving] = useState(false);
  const [reason, setReason] = useState("");
  const businessDays = businessDaysOrDefault(form.businessDays);
  const end = calculateEndDate(form.plannedStart, businessDays, form.countryCode);
  const average = 100 / businessDays;
  const parentChanges = buildScheduleCascadeForNewChild(tasks, form.parentTaskId, { plannedStart: form.plannedStart, plannedEnd: end, businessDays });
  const requiresReason = scheduleChangesRequireReason(tasks, parentChanges);

  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true);
    try {
      await createWbsTask({ ...form, businessDays, plannedEnd: end });
      if (requiresReason) {
        await saveScheduleChanges(parentChanges.map((change) => ({ taskId: change.taskId, ...change.after })), reason);
      } else {
        for (const change of parentChanges) {
          const current = tasks.find((task) => task.id === change.taskId);
          if (current) await updateWbsTask(current.id, { ...current, ...change.after });
        }
      }
      await onSaved();
    }
    catch (cause) { onError(toMessage(cause)); setSaving(false); }
  }

  return <Modal title={initialParentTaskId === null ? "ロードマップにタスクを追加" : "サブタスクを追加"} onClose={onClose}>
    <form className="modal-form" onSubmit={submit}>
      <FormFields form={form} setForm={setForm} projects={projects} assignees={assignees} tasks={tasks} currentTaskId={null} includeActual={false} />
      <div className="preview-card">
        <span>PREVIEW</span>
        <div><small>終了予定日</small><strong>{formatLongDate(end)}</strong></div>
        <div><small>1日の平均進捗</small><strong>{average.toFixed(1)}%</strong></div>
      </div>
      {businessDays >= 5 && <div className="warning" role="status"><strong>サブタスクへの分割をおすすめします</strong><span>5営業日以上のタスクです。完了条件が明確な小さなサブタスクとして分割すると、遅れを早く発見できます。</span></div>}
      {requiresReason && <>
        <p className="modal-lead">サブタスクの追加により、確定済みの親タスクの日程が変わります。</p>
        <div className="schedule-change-list">{parentChanges.map((change) => <div key={change.taskId}><strong>{tasks.find((item) => item.id === change.taskId)?.title ?? `タスク #${change.taskId}`}</strong><span>{change.before.plannedStart}〜{change.before.plannedEnd}</span><b>→</b><span>{change.after.plannedStart}〜{change.after.plannedEnd}</span></div>)}</div>
        <label>変更理由<span className="required-label">必須</span><textarea required rows={4} maxLength={1000} value={reason} onChange={(event) => setReason(event.currentTarget.value)} placeholder="変更が必要になった背景と影響を記載してください" /></label>
      </>}
      <div className="modal-actions"><button type="button" className="quiet-button" onClick={onClose}>キャンセル</button><button className="primary-button" disabled={saving || !form.title.trim() || (requiresReason && !reason.trim())}>{saving ? "保存中…" : requiresReason ? "理由を記録して登録" : "登録する"}</button></div>
    </form>
  </Modal>;
}

function TaskEditor({ task, tasks, countryCode, projects, assignees, pastMissing, onChanged, onCreateChild, onProgress, onDelete, onError }: {
  task: WbsTask; tasks: WbsTask[]; countryCode: string; projects: Project[]; assignees: Assignee[]; pastMissing: boolean; onChanged: () => Promise<void>; onCreateChild: () => void; onProgress: () => void; onDelete: () => void; onError: (value: string | null) => void;
}) {
  const [form, setForm] = useState<WbsTaskForm>({ ...task, countryCode });
  const [saving, setSaving] = useState(false);
  useEffect(() => setForm({ ...task, countryCode }), [task, countryCode]);
  const businessDays = businessDaysOrDefault(form.businessDays);
  const end = calculateEndDate(form.plannedStart, businessDays, countryCode);
  const hasChildren = tasks.some((candidate) => candidate.parentTaskId === task.id);

  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true);
    try { await updateWbsTask(task.id, { ...form, businessDays, countryCode, plannedEnd: end }); await onChanged(); }
    catch (cause) { onError(toMessage(cause)); } finally { setSaving(false); }
  }

  async function finalize() {
    setSaving(true);
    try { await finalizeWbsTask(task.id); await onChanged(); }
    catch (cause) { onError(toMessage(cause)); } finally { setSaving(false); }
  }

  return <form className="panel-form" onSubmit={submit}>
    <div className="panel-title"><div><p className="eyebrow">DETAIL</p><h2>タスクを編集</h2></div><span className={`status-badge ${form.status}`}>{statusLabels[form.status]}</span></div>
    <div className={`task-lock-state ${task.finalized ? "finalized" : "draft"}`}><div><strong>{task.finalized ? "計画確定済み" : "編集中"}</strong><span>{task.finalized ? "日程変更にはロードマップ上で理由の記録が必要です。" : "確定するまで日程を自由に調整できます。"}</span></div>{!task.finalized && <button type="button" className="quiet-button" disabled={saving} onClick={() => void finalize()}>タスクの状態を確定</button>}</div>
    <FormFields form={form} setForm={setForm} projects={projects} assignees={assignees} tasks={tasks} currentTaskId={task.id} includeActual scheduleLocked={task.finalized} />
    <div className="progress-block"><div><span>{hasChildren ? "子タスクからの進捗" : "進捗率"}</span><strong>{form.progress}%</strong></div>{hasChildren ? <small>直属のサブタスクを営業日数で重み付けし、深い階層まで自動集計しています。</small> : <><input aria-label="進捗率" type="range" min="0" max="100" step="5" disabled={task.finalized} value={form.progress} onChange={(e) => setForm({ ...form, progress: Number(e.currentTarget.value) })} />{task.finalized && <small>確定後は「今日の進捗」から記録します。</small>}</>}</div>
    <button type="button" className="child-task-button" onClick={onCreateChild}>＋ ロードマップ上でサブタスクを追加</button>
    <div className="editor-actions">{dailyProgressActionLabel(task, hasChildren, pastMissing) && <button type="button" className="quiet-button" onClick={onProgress}>{dailyProgressActionLabel(task, false, pastMissing)}</button>}<button className="primary-button" disabled={saving}>{saving ? "保存中…" : "変更を保存"}</button></div>
    <button type="button" className="danger-button" onClick={onDelete}>このタスクを削除</button>
  </form>;
}

function FormFields({ form, setForm, projects, assignees, tasks, currentTaskId, includeActual, scheduleLocked = false }: {
  form: WbsTaskForm; setForm: (value: WbsTaskForm) => void; projects: Project[]; assignees: Assignee[]; tasks: WbsTask[]; currentTaskId: number | null; includeActual: boolean; scheduleLocked?: boolean;
}) {
  const selectedProject = projects.find((project) => project.id === form.projectId);
  const availableAssignees = selectedProject
    ? assignees.filter((person) => selectedProject.members.some((member) => member.userId === person.id))
    : assignees;
  const availableParents = parentTaskCandidates(tasks, form.projectId, currentTaskId);
  const availablePrerequisites = prerequisiteTaskCandidates(tasks, form.projectId, form.parentTaskId, currentTaskId);
  return <div className="field-grid">
    <label className="wide">タスク名<input value={form.title} maxLength={120} required onChange={(e) => setForm({ ...form, title: e.currentTarget.value })} placeholder="例：要件定義レビュー" /></label>
    <label className="wide">作業の概要<textarea value={form.description} maxLength={1000} rows={3} onChange={(e) => setForm({ ...form, description: e.currentTarget.value })} placeholder="担当者が行う作業、完了条件、報告時に共有したい前提" /></label>
    <label>所属案件<select value={form.projectId ?? ""} onChange={(e) => { const projectId = e.currentTarget.value ? Number(e.currentTarget.value) : null; const project = projects.find((item) => item.id === projectId); const keepAssignee = !project || project.members.some((member) => member.userId === form.assigneeId); const keepParent = tasks.some((task) => task.id === form.parentTaskId && task.projectId === projectId); const parentTaskId = keepParent ? form.parentTaskId : null; const prerequisiteTaskIds = (form.prerequisiteTaskIds ?? []).filter((id) => tasks.some((task) => task.id === id && task.projectId === projectId && (task.parentTaskId ?? null) === parentTaskId)); setForm({ ...form, projectId, parentTaskId, prerequisiteTaskId: prerequisiteTaskIds[0] ?? null, prerequisiteTaskIds, assigneeId: keepAssignee ? form.assigneeId : null }); }}><option value="">案件未設定</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
    <label>担当者<select value={form.assigneeId ?? ""} onChange={(e) => setForm({ ...form, assigneeId: e.currentTarget.value ? Number(e.currentTarget.value) : null })}><option value="">未設定</option>{availableAssignees.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select>{selectedProject && availableAssignees.length === 0 && <small>この案件にはユーザーが紐づいていません。</small>}</label>
    <label className="wide">親タスク<select value={form.parentTaskId ?? ""} onChange={(e) => { const parentTaskId = e.currentTarget.value ? Number(e.currentTarget.value) : null; const prerequisiteTaskIds = (form.prerequisiteTaskIds ?? []).filter((id) => tasks.some((task) => task.id === id && task.projectId === form.projectId && (task.parentTaskId ?? null) === parentTaskId)); setForm({ ...form, parentTaskId, prerequisiteTaskId: prerequisiteTaskIds[0] ?? null, prerequisiteTaskIds }); }}><option value="">親なし（最上位）</option>{availableParents.map((task) => <option key={task.id} value={task.id}>{task.parentTaskTitle ? `${task.parentTaskTitle} › ` : ""}{task.title}</option>)}</select><small>子タスクにも同じ操作で子を追加でき、階層を深くできます。</small></label>
    <fieldset className="wide prerequisite-picker"><legend>完了が前提となるタスク（複数選択可）</legend>{availablePrerequisites.length === 0 ? <p>選択できる同階層タスクはありません。</p> : availablePrerequisites.map((task) => { const checked = (form.prerequisiteTaskIds ?? []).includes(task.id); return <label key={task.id}><input type="checkbox" checked={checked} onChange={() => { const prerequisiteTaskIds = checked ? (form.prerequisiteTaskIds ?? []).filter((id) => id !== task.id) : [...(form.prerequisiteTaskIds ?? []), task.id]; setForm({ ...form, prerequisiteTaskId: prerequisiteTaskIds[0] ?? null, prerequisiteTaskIds }); }} /><span><strong>{task.title}</strong><small>{task.plannedEnd} 完了予定</small></span></label>; })}<small>同じ案件・同じ親タスク配下から複数選択できます。循環する組み合わせは保存できません。</small></fieldset>
    <label>開始予定日<input type="date" required disabled={scheduleLocked} value={form.plannedStart} onChange={(e) => setForm({ ...form, plannedStart: e.currentTarget.value })} /></label>
    <label>営業日数<input type="number" min="1" max="999" placeholder="1" value={form.businessDays} disabled={scheduleLocked} onChange={(e) => setForm({ ...form, businessDays: parseBusinessDaysInput(e.currentTarget.value) })} />{!includeActual && <small>未入力の場合は1営業日です。</small>}</label>
    {includeActual && <>
      <label>状態<select value={form.status} onChange={(e) => setForm({ ...form, status: e.currentTarget.value as WbsStatus })}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <span />
      <label>開始実績日<input type="date" value={form.actualStart ?? ""} onChange={(e) => setForm({ ...form, actualStart: e.currentTarget.value || null })} /></label>
      <label>終了実績日<input type="date" min={form.actualStart ?? undefined} value={form.actualEnd ?? ""} onChange={(e) => setForm({ ...form, actualEnd: e.currentTarget.value || null })} /></label>
    </>}
  </div>;
}

function ProgressModal({ task, pastOnly, reportDate, onClose, onSaved, onError }: { task: WbsTask; pastOnly: boolean; reportDate: string; onClose: () => void; onSaved: () => Promise<void>; onError: (value: string | null) => void }) {
  const today = formatISODate(new Date());
  const previousDaily = pastOnly ? 0 : task.todayDailyProgress ?? 0;
  const baseProgress = task.progress - previousDaily;
  const [progress, setProgress] = useState<number | "">(pastOnly ? "" : task.todayDailyProgress ?? "");
  const [progressError, setProgressError] = useState<string | null>(null);
  const [note, setNote] = useState(pastOnly ? "" : task.todayProgressNote ?? "");
  const [delayReason, setDelayReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [pastDates, setPastDates] = useState<string[] | null>(pastOnly ? null : []);
  const [selectedDate, setSelectedDate] = useState(pastOnly ? reportDate : today);
  const [selectedSnapshot, setSelectedSnapshot] = useState<DailyProgressSnapshot | null>(null);
  useEffect(() => {
    if (!pastOnly) return;
    let active = true;
    void listRecordedProgressDates(task.id).then((dates) => {
      if (!active) return;
      const missing = missingProgressDates(task.plannedStart, reportDate, task.countryCode, dates);
      setPastDates(missing);
      setSelectedDate(missing.includes(reportDate) ? reportDate : missing[0] ?? "");
    }).catch((cause) => onError(toMessage(cause)));
    return () => { active = false; };
  }, [onError, pastOnly, reportDate, task.countryCode, task.id, task.plannedStart]);
  useEffect(() => {
    if (!pastOnly || !selectedDate) { setSelectedSnapshot(null); return; }
    let active = true;
    void listDailyProgressSnapshots(selectedDate).then((snapshots) => {
      if (active) setSelectedSnapshot(snapshots.find((snapshot) => snapshot.taskId === task.id) ?? null);
    }).catch((cause) => onError(toMessage(cause)));
    return () => { active = false; };
  }, [onError, pastOnly, selectedDate, task.id]);
  const expected = expectedProgress(task, selectedDate || reportDate);
  const progressValue = progress === "" ? 0 : progress;
  const selectedBaseProgress = pastOnly ? selectedSnapshot?.cumulativeProgress ?? 0 : baseProgress;
  const selectedTotal = Math.min(100, selectedBaseProgress + progressValue);
  const currentTotal = pastOnly ? Math.min(100, task.progress + progressValue) : selectedTotal;
  const maxProgress = Math.max(0, 100 - baseProgress);
  const delayed = progress !== "" && task.finalized && selectedTotal < expected;
  async function submit(event: FormEvent) {
    event.preventDefault();
    let dailyProgress: number;
    try {
      dailyProgress = requireDailyProgress(progress);
      setProgressError(null);
    } catch (cause) {
      setProgressError(toMessage(cause));
      return;
    }
    setSaving(true);
    try { await saveDailyProgress(task.id, selectedDate, dailyProgress, note, delayReason); await onSaved(); }
    catch (cause) { onError(toMessage(cause)); setSaving(false); }
  }
  const editing = !pastOnly && task.todayDailyProgress != null;
  return <Modal title={pastOnly ? "過去の進捗を入力" : editing ? "今日の進捗を編集" : "今日の進捗を記録"} onClose={onClose}>
    <form className="modal-form" onSubmit={submit}>
      <p className="modal-lead">{task.title}</p>
      {pastOnly && <label>未入力の日付<select aria-label="未入力の日付" value={selectedDate} onChange={(event) => { setSelectedDate(event.currentTarget.value); setProgress(""); setProgressError(null); }}>{pastDates?.map((date) => <option key={date} value={date}>{formatLongDate(date)}</option>)}</select>{pastDates?.length === 0 && <small>入力できる過去の未入力日はありません。</small>}</label>}
      <div className="progress-comparison"><div><span>{pastOnly ? "その日に進んだ進捗" : "今日進んだ進捗"}</span><strong>+{progressValue}%</strong></div><div><span>{pastOnly ? "入力後の現在累計" : "入力後の累計"}</span><strong>{currentTotal}%</strong></div><div className={delayed ? "delayed" : ""}><span>{pastOnly ? "選択日時点の計画" : "今日時点の計画"}</span><strong>{expected}%</strong></div></div>
      <label>{pastOnly ? "その日に進んだ進捗" : "今日進んだ進捗"}（%）<input aria-label={pastOnly ? "その日に進んだ進捗" : "今日進んだ進捗"} aria-describedby={progressError ? "daily-progress-error" : undefined} aria-invalid={progressError ? "true" : undefined} type="number" min="0" max={maxProgress} placeholder="0" value={progress} onChange={(e) => { setProgressError(null); setProgress(e.currentTarget.value === "" ? "" : Math.max(0, Math.min(maxProgress, Number(e.currentTarget.value)))); }} /></label>
      {progressError && <div id="daily-progress-error" className="error" role="alert"><span>{progressError}</span></div>}
      <label>{pastOnly ? "その日のメモ" : "今日のメモ"}<textarea rows={4} maxLength={500} value={note} onChange={(e) => setNote(e.currentTarget.value)} placeholder="進んだこと、困っていること" /></label>
      {delayed && <label className="delay-reason">計画を下回る理由<span>必須</span><textarea required rows={3} maxLength={1000} value={delayReason} onChange={(e) => setDelayReason(e.currentTarget.value)} placeholder="遅延の要因と対応方針を記載してください" /></label>}
      <div className="modal-actions"><button type="button" className="quiet-button" onClick={onClose}>キャンセル</button><button className="primary-button" disabled={saving || !selectedDate || (delayed && !delayReason.trim())}>{saving ? "保存中…" : editing ? "更新する" : "記録する"}</button></div>
    </form>
  </Modal>;
}

function RescheduleModal({ task, changes, tasks, onClose, onSaved, onError }: { task: WbsTask; changes: ScheduleChange[]; tasks: WbsTask[]; onClose: () => void; onSaved: () => Promise<void>; onError: (value: string | null) => void }) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true);
    try { await saveScheduleChanges(changes.map((change) => ({ taskId: change.taskId, ...change.after, historyContext: change.historyContext })), reason); await onSaved(); }
    catch (cause) { onError(toMessage(cause)); setSaving(false); }
  }
  return <Modal title="リスケ理由を記録" onClose={onClose}><form className="modal-form" onSubmit={submit}>
    <p className="modal-lead">{task.title} の日程を変更します。影響する親タスクも同時に更新されます。</p>
    <div className="schedule-change-list">{changes.map((change) => <div key={change.taskId}><strong>{tasks.find((item) => item.id === change.taskId)?.title ?? `タスク #${change.taskId}`}</strong><span>{change.before.plannedStart}〜{change.before.plannedEnd}</span><b>→</b><span>{change.after.plannedStart}〜{change.after.plannedEnd}</span></div>)}</div>
    <label>変更理由<span className="required-label">必須</span><textarea autoFocus required rows={4} maxLength={1000} value={reason} onChange={(event) => setReason(event.currentTarget.value)} placeholder="変更が必要になった背景と影響を記載してください" /></label>
    <div className="modal-actions"><button type="button" className="quiet-button" onClick={onClose}>キャンセル</button><button className="primary-button" disabled={saving || !reason.trim()}>{saving ? "変更中…" : "理由を記録して変更"}</button></div>
  </form></Modal>;
}

function HistoryModal({ task, onClose, onError }: { task: WbsTask; onClose: () => void; onError: (value: string | null) => void }) {
  const [entries, setEntries] = useState<TaskTreeHistoryEntry[] | null>(null);
  const [scope, setScope] = useState<"all" | "self">("all");
  const [expanded, setExpanded] = useState(false);
  useEffect(() => { let active = true; void listTaskTreeHistory(task.id).then((result) => { if (active) setEntries(result); }).catch((cause) => onError(toMessage(cause))); return () => { active = false; }; }, [onError, task.id]);
  const labels: Record<WorkHistoryEntry["type"], string> = { created: "サブタスク追加", finalized: "計画確定", rescheduled: "リスケ", progress: "進捗記録", delay: "遅延理由" };
  const ownCount = entries?.filter((entry) => entry.depth === 0).length ?? 0;
  const childCount = (entries?.length ?? 0) - ownCount;
  const filtered = entries?.filter((entry) => scope === "all" || entry.depth === 0) ?? [];
  const visible = expanded ? filtered : filtered.slice(0, 8);
  return <Modal title="作業経緯" onClose={onClose}><div className="history-modal">
    <div className="history-overview"><div><p className="modal-lead">{task.title}</p><small>{childCount > 0 ? "親自身と配下の履歴を新しい順に確認できます。" : "このタスクの履歴を新しい順に表示します。"}</small></div>{entries && <strong>{entries.length}<span>件</span></strong>}</div>
    {entries && childCount > 0 && <div className="history-scope" role="group" aria-label="作業経緯の表示範囲"><button className={scope === "all" ? "active" : ""} aria-pressed={scope === "all"} onClick={() => { setScope("all"); setExpanded(false); }}>配下を含む <span>{entries.length}</span></button><button className={scope === "self" ? "active" : ""} aria-pressed={scope === "self"} onClick={() => { setScope("self"); setExpanded(false); }}>親自身のみ <span>{ownCount}</span></button></div>}
    {entries === null ? <div className="history-empty">読み込んでいます…</div> : filtered.length === 0 ? <div className="history-empty">この範囲に記録された経緯はありません。</div> : <><ol className="history-timeline">{visible.map((entry) => <li key={entry.id} className={entry.type}><time>{formatHistoryTime(entry.occurredAt)}</time><div><div className="history-entry-meta"><span>{labels[entry.type]}</span>{entry.depth > 0 && <small title={`親から${entry.depth}階層下`}>{entry.taskTitle}</small>}</div><p>{entry.details}</p>{entry.reason && <blockquote><strong>理由</strong>{entry.reason}</blockquote>}</div></li>)}</ol>{filtered.length > 8 && <button type="button" className="history-more" onClick={() => setExpanded((current) => !current)}>{expanded ? "最新8件に戻す" : `さらに${filtered.length - 8}件を表示`}</button>}</>}
    <div className="modal-actions"><button className="quiet-button" onClick={onClose}>閉じる</button></div>
  </div></Modal>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler);
  }, [onClose]);
  return <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><header><h2 id="modal-title">{title}</h2><button aria-label="閉じる" onClick={onClose}>×</button></header>{children}</section></div>;
}

function formatLongDate(value: string) { return value ? new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short" }).format(new Date(`${value}T12:00:00`)) : "—"; }
function formatHistoryTime(value: string) { return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function countryName(code: string) { return countries.find((country) => country.code === code)?.name ?? code; }
function toMessage(cause: unknown) { return cause instanceof Error ? cause.message : String(cause); }
function parseFilterValue(value: string): WbsFilterValue { return value === "all" || value === "unset" ? value : Number(value); }

export default App;
