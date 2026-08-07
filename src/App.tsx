import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { isPermissionGranted, sendNotification } from "@tauri-apps/plugin-notification";
import { calculateEndDate, countries, formatISODate } from "./lib/calendar";
import {
  createWbsTask, deleteWbsTask, getSettings, listAssignees, listWbsTasks,
  saveDailyProgress, saveSettings, updateWbsTask, type AppSettings, type Assignee, type WbsStatus, type WbsTask,
} from "./lib/wbs";
import { TimelineBoard } from "./features/wbs/TimelineBoard";
import { businessDaysOrDefault, parseBusinessDaysInput, type WbsTaskForm } from "./features/wbs/taskForm";
import { WbsProjectSelector } from "./features/wbs/WbsProjectSelector";
import { UsersScreen } from "./features/users/UsersScreen";
import { SettingsScreen } from "./features/settings/SettingsScreen";
import { ProjectsScreen } from "./features/projects/ProjectsScreen";
import { HomeScreen } from "./features/home/HomeScreen";
import { listProjects, type Project } from "./lib/projects";
import { createMilestone, deleteMilestone, listMilestones, updateMilestone, type Milestone, type MilestoneInput } from "./lib/milestones";
import { MilestonePanel } from "./features/wbs/MilestonePanel";
import { filterWbsTasks, parentTaskCandidates, summarizeWbsTasks, type WbsFilters, type WbsFilterValue, type WbsGroupBy } from "./lib/wbsView";
import "./App.css";

type View = "home" | "wbs" | "projects" | "users" | "settings";
type WbsRoadmapMode = "select" | "all" | "project";

const statusLabels: Record<WbsStatus, string> = {
  not_started: "未着手", in_progress: "進行中", completed: "完了", on_hold: "保留",
};

const emptySettings: AppSettings = {
  countryCode: "JP", notificationTime: "17:30", notificationsEnabled: false,
  lastNotifiedDate: null,
};

function App() {
  const [view, setView] = useState<View>("home");
  const [tasks, setTasks] = useState<WbsTask[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [settings, setSettings] = useState<AppSettings>(emptySettings);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedRoadmapProjectId, setSelectedRoadmapProjectId] = useState<number | null>(null);
  const [roadmapMode, setRoadmapMode] = useState<WbsRoadmapMode>("select");
  const [showCreate, setShowCreate] = useState(false);
  const [createParentTaskId, setCreateParentTaskId] = useState<number | null>(null);
  const [progressTask, setProgressTask] = useState<WbsTask | null>(null);
  const [milestoneEditor, setMilestoneEditor] = useState<Milestone | "new" | null>(null);
  const [groupBy, setGroupBy] = useState<WbsGroupBy>("project");
  const [filters, setFilters] = useState<WbsFilters>({ query: "", projectId: "all", assigneeId: "all", status: "all" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [nextTasks, nextAssignees, nextProjects, nextMilestones, nextSettings] = await Promise.all([
        listWbsTasks(), listAssignees(), listProjects(), listMilestones(), getSettings(),
      ]);
      setTasks(nextTasks);
      setAssignees(nextAssignees);
      setProjects(nextProjects);
      setMilestones(nextMilestones);
      setSettings(nextSettings);
      setSelectedId((current) => current && nextTasks.some((task) => task.id === current) ? current : nextTasks[0]?.id ?? null);
      setError(null);
    } catch (cause) {
      setError(toMessage(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

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

  useEffect(() => {
    if (selectedId !== null && !visibleTasks.some((task) => task.id === selectedId)) setSelectedId(null);
  }, [selectedId, visibleTasks]);

  async function removeTask(task: WbsTask) {
    const hasChildren = tasks.some((candidate) => candidate.parentTaskId === task.id);
    const note = hasChildren ? "\n子タスクは削除せず、親なしのタスクとして残します。" : "";
    if (!window.confirm(`「${task.title}」を削除しますか？${note}`)) return;
    try { await deleteWbsTask(task.id); await refresh(); } catch (cause) { setError(toMessage(cause)); }
  }

  const updateSchedule = useCallback(async (task: WbsTask, schedule: { plannedStart: string; plannedEnd: string; businessDays: number }) => {
    try {
      await updateWbsTask(task.id, { ...task, ...schedule });
      await refresh();
    } catch (cause) { setError(toMessage(cause)); }
  }, [refresh]);

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
      ) : view === "users" ? (
        <UsersScreen users={assignees} onChanged={refresh} onError={setError} />
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

          {loading ? <div className="loading-card">WBSを読み込んでいます…</div> : roadmapTasks.length === 0 && roadmapMilestones.length === 0 ? <section className="wbs-empty"><span>▦</span><h2>{roadmapMode === "all" ? "最初のWBSを追加しましょう" : "このプロジェクトの最初のタスクを追加しましょう"}</h2><p>責任者と日程を紐づけると、ロードマップ上で予定と進捗をまとめて確認できます。</p><button className="primary-button" onClick={() => openTaskCreate()}>＋ ロードマップにタスクを追加</button></section> : visibleTasks.length === 0 && roadmapTasks.length > 0 ? <section className="wbs-empty filtered"><span>⌕</span><h2>条件に一致するWBSがありません</h2><p>検索語または絞り込み条件を変更してください。</p>{hasActiveFilters && <button className="quiet-button" onClick={() => setFilters({ query: "", projectId: roadmapMode === "all" ? "all" : selectedRoadmapProjectId ?? "all", assigneeId: "all", status: "all" })}>絞り込みを解除</button>}</section> : <TimelineBoard tasks={visibleTasks} milestones={roadmapMilestones.filter((milestone) => filters.projectId === "all" || milestone.projectId === filters.projectId)} assignees={assignees} projects={projects} groupBy={groupBy} countryCode={settings.countryCode} selectedId={selectedId} onSelect={(task) => setSelectedId(task.id)} onCreateSubtask={(task) => openTaskCreate(task.id)} onSelectMilestone={setMilestoneEditor} onScheduleChange={updateSchedule} />}
          {selectedTask && <aside className="task-drawer" aria-label="タスク詳細"><button className="drawer-close" aria-label="詳細を閉じる" onClick={() => setSelectedId(null)}>×</button><TaskEditor task={selectedTask} tasks={roadmapTasks} countryCode={settings.countryCode} projects={projects} assignees={assignees} onChanged={refresh} onCreateChild={() => openTaskCreate(selectedTask.id)} onProgress={() => setProgressTask(selectedTask)} onDelete={() => void removeTask(selectedTask)} onError={setError} /></aside>}
        </main>
      )}

      {showCreate && <TaskModal settings={settings} projects={projects} assignees={assignees} tasks={roadmapTasks} initialProjectId={selectedRoadmapProjectId} initialParentTaskId={createParentTaskId} onClose={() => setShowCreate(false)} onSaved={async () => { setShowCreate(false); await refresh(); }} onError={setError} />}
      {progressTask && <ProgressModal task={progressTask} onClose={() => setProgressTask(null)} onSaved={async () => { setProgressTask(null); await refresh(); }} onError={setError} />}
      {milestoneEditor && (milestoneEditor === "new" ? selectedRoadmapProject : projects.find((project) => project.id === milestoneEditor.projectId)) && <MilestoneModal milestone={milestoneEditor === "new" ? null : milestoneEditor} project={(milestoneEditor === "new" ? selectedRoadmapProject : projects.find((project) => project.id === milestoneEditor.projectId))!} onClose={() => setMilestoneEditor(null)} onSaved={async () => { setMilestoneEditor(null); await refresh(); }} onError={setError} />}
    </div>
  );
}

function MilestoneModal({ milestone, project, onClose, onSaved, onError }: { milestone: Milestone | null; project: Project; onClose: () => void; onSaved: () => Promise<void>; onError: (value: string | null) => void }) {
  const [form, setForm] = useState<MilestoneInput>({ projectId: project.id, name: milestone?.name ?? "", description: milestone?.description ?? "", dueDate: milestone?.dueDate ?? formatISODate(new Date()), completed: milestone?.completed ?? false });
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
        <label>達成予定日<input required type="date" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.currentTarget.value })} /></label>
        <label className="milestone-completed"><span>達成状態</span><span><input type="checkbox" checked={form.completed} onChange={(event) => setForm({ ...form, completed: event.currentTarget.checked })} /> 達成済みにする</span></label>
      </div>
      <div className="modal-actions">{milestone && <button type="button" className="danger-text" disabled={saving} onClick={() => void remove()}>削除</button>}<span className="action-spacer" /><button type="button" className="quiet-button" onClick={onClose}>キャンセル</button><button className="primary-button" disabled={saving || !form.name.trim()}>{saving ? "保存中…" : milestone ? "変更を保存" : "追加する"}</button></div>
    </form>
  </Modal>;
}

function TaskModal({ settings, projects, assignees, tasks, initialProjectId, initialParentTaskId, onClose, onSaved, onError }: {
  settings: AppSettings; projects: Project[]; assignees: Assignee[]; tasks: WbsTask[]; initialProjectId: number | null; initialParentTaskId: number | null; onClose: () => void; onSaved: () => Promise<void>; onError: (value: string | null) => void;
}) {
  const today = formatISODate(new Date());
  const parentTask = tasks.find((task) => task.id === initialParentTaskId);
  const [form, setForm] = useState<WbsTaskForm>({
    title: "", description: "", projectId: parentTask?.projectId ?? initialProjectId, parentTaskId: initialParentTaskId, assigneeId: null, status: "not_started", progress: 0,
    countryCode: settings.countryCode, plannedStart: today,
    plannedEnd: calculateEndDate(today, 1, settings.countryCode), businessDays: "",
    actualStart: null, actualEnd: null,
  });
  const [saving, setSaving] = useState(false);
  const businessDays = businessDaysOrDefault(form.businessDays);
  const end = calculateEndDate(form.plannedStart, businessDays, form.countryCode);
  const average = 100 / businessDays;

  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true);
    try { await createWbsTask({ ...form, businessDays, plannedEnd: end }); await onSaved(); }
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
      <div className="modal-actions"><button type="button" className="quiet-button" onClick={onClose}>キャンセル</button><button className="primary-button" disabled={saving || !form.title.trim()}>{saving ? "保存中…" : "登録する"}</button></div>
    </form>
  </Modal>;
}

function TaskEditor({ task, tasks, countryCode, projects, assignees, onChanged, onCreateChild, onProgress, onDelete, onError }: {
  task: WbsTask; tasks: WbsTask[]; countryCode: string; projects: Project[]; assignees: Assignee[]; onChanged: () => Promise<void>; onCreateChild: () => void; onProgress: () => void; onDelete: () => void; onError: (value: string | null) => void;
}) {
  const [form, setForm] = useState<WbsTaskForm>({ ...task, countryCode });
  const [saving, setSaving] = useState(false);
  useEffect(() => setForm({ ...task, countryCode }), [task, countryCode]);
  const businessDays = businessDaysOrDefault(form.businessDays);
  const end = calculateEndDate(form.plannedStart, businessDays, countryCode);

  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true);
    try { await updateWbsTask(task.id, { ...form, businessDays, countryCode, plannedEnd: end }); await onChanged(); }
    catch (cause) { onError(toMessage(cause)); } finally { setSaving(false); }
  }

  return <form className="panel-form" onSubmit={submit}>
    <div className="panel-title"><div><p className="eyebrow">DETAIL</p><h2>タスクを編集</h2></div><span className={`status-badge ${form.status}`}>{statusLabels[form.status]}</span></div>
    <FormFields form={form} setForm={setForm} projects={projects} assignees={assignees} tasks={tasks} currentTaskId={task.id} includeActual />
    <div className="progress-block"><div><span>進捗率</span><strong>{form.progress}%</strong></div><input aria-label="進捗率" type="range" min="0" max="100" step="5" value={form.progress} onChange={(e) => setForm({ ...form, progress: Number(e.currentTarget.value) })} /></div>
    <button type="button" className="child-task-button" onClick={onCreateChild}>＋ ロードマップ上でサブタスクを追加</button>
    <div className="editor-actions"><button type="button" className="quiet-button" onClick={onProgress}>今日の進捗</button><button className="primary-button" disabled={saving}>{saving ? "保存中…" : "変更を保存"}</button></div>
    <button type="button" className="danger-button" onClick={onDelete}>このタスクを削除</button>
  </form>;
}

function FormFields({ form, setForm, projects, assignees, tasks, currentTaskId, includeActual }: {
  form: WbsTaskForm; setForm: (value: WbsTaskForm) => void; projects: Project[]; assignees: Assignee[]; tasks: WbsTask[]; currentTaskId: number | null; includeActual: boolean;
}) {
  const selectedProject = projects.find((project) => project.id === form.projectId);
  const availableAssignees = selectedProject
    ? assignees.filter((person) => selectedProject.members.some((member) => member.userId === person.id))
    : assignees;
  const availableParents = parentTaskCandidates(tasks, form.projectId, currentTaskId);
  return <div className="field-grid">
    <label className="wide">タスク名<input value={form.title} maxLength={120} required onChange={(e) => setForm({ ...form, title: e.currentTarget.value })} placeholder="例：要件定義レビュー" /></label>
    <label className="wide">説明<textarea value={form.description} maxLength={1000} rows={2} onChange={(e) => setForm({ ...form, description: e.currentTarget.value })} placeholder="完了条件や補足" /></label>
    <label>所属案件<select value={form.projectId ?? ""} onChange={(e) => { const projectId = e.currentTarget.value ? Number(e.currentTarget.value) : null; const project = projects.find((item) => item.id === projectId); const keepAssignee = !project || project.members.some((member) => member.userId === form.assigneeId); const keepParent = tasks.some((task) => task.id === form.parentTaskId && task.projectId === projectId); setForm({ ...form, projectId, parentTaskId: keepParent ? form.parentTaskId : null, assigneeId: keepAssignee ? form.assigneeId : null }); }}><option value="">案件未設定</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
    <label>担当者<select value={form.assigneeId ?? ""} onChange={(e) => setForm({ ...form, assigneeId: e.currentTarget.value ? Number(e.currentTarget.value) : null })}><option value="">未設定</option>{availableAssignees.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select>{selectedProject && availableAssignees.length === 0 && <small>この案件にはユーザーが紐づいていません。</small>}</label>
    <label className="wide">親タスク<select value={form.parentTaskId ?? ""} onChange={(e) => setForm({ ...form, parentTaskId: e.currentTarget.value ? Number(e.currentTarget.value) : null })}><option value="">親なし（最上位）</option>{availableParents.map((task) => <option key={task.id} value={task.id}>{task.parentTaskTitle ? `${task.parentTaskTitle} › ` : ""}{task.title}</option>)}</select><small>子タスクにも同じ操作で子を追加でき、階層を深くできます。</small></label>
    <label>開始予定日<input type="date" required value={form.plannedStart} onChange={(e) => setForm({ ...form, plannedStart: e.currentTarget.value })} /></label>
    <label>営業日数<input type="number" min="1" max="999" placeholder="1" value={form.businessDays} onChange={(e) => setForm({ ...form, businessDays: parseBusinessDaysInput(e.currentTarget.value) })} />{!includeActual && <small>未入力の場合は1営業日です。</small>}</label>
    {includeActual && <>
      <label>状態<select value={form.status} onChange={(e) => setForm({ ...form, status: e.currentTarget.value as WbsStatus })}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <span />
      <label>開始実績日<input type="date" value={form.actualStart ?? ""} onChange={(e) => setForm({ ...form, actualStart: e.currentTarget.value || null })} /></label>
      <label>終了実績日<input type="date" min={form.actualStart ?? undefined} value={form.actualEnd ?? ""} onChange={(e) => setForm({ ...form, actualEnd: e.currentTarget.value || null })} /></label>
    </>}
  </div>;
}

function ProgressModal({ task, onClose, onSaved, onError }: { task: WbsTask; onClose: () => void; onSaved: () => Promise<void>; onError: (value: string | null) => void }) {
  const [progress, setProgress] = useState(task.progress);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true);
    try { await saveDailyProgress(task.id, formatISODate(new Date()), progress, note); await onSaved(); }
    catch (cause) { onError(toMessage(cause)); setSaving(false); }
  }
  return <Modal title="今日の進捗を記録" onClose={onClose}>
    <form className="modal-form" onSubmit={submit}>
      <p className="modal-lead">{task.title}</p>
      <div className="progress-input"><strong>{progress}%</strong><input aria-label="今日の進捗率" type="range" min="0" max="100" step="5" value={progress} onChange={(e) => setProgress(Number(e.currentTarget.value))} /></div>
      <label>今日のメモ<textarea rows={4} maxLength={500} value={note} onChange={(e) => setNote(e.currentTarget.value)} placeholder="進んだこと、困っていること" /></label>
      <div className="modal-actions"><button type="button" className="quiet-button" onClick={onClose}>キャンセル</button><button className="primary-button" disabled={saving}>{saving ? "保存中…" : "記録する"}</button></div>
    </form>
  </Modal>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler);
  }, [onClose]);
  return <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><header><h2 id="modal-title">{title}</h2><button aria-label="閉じる" onClick={onClose}>×</button></header>{children}</section></div>;
}

function formatLongDate(value: string) { return value ? new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short" }).format(new Date(`${value}T12:00:00`)) : "—"; }
function countryName(code: string) { return countries.find((country) => country.code === code)?.name ?? code; }
function toMessage(cause: unknown) { return cause instanceof Error ? cause.message : String(cause); }
function parseFilterValue(value: string): WbsFilterValue { return value === "all" || value === "unset" ? value : Number(value); }

export default App;
