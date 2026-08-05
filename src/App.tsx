import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { isPermissionGranted, sendNotification } from "@tauri-apps/plugin-notification";
import { calculateEndDate, countries, formatISODate } from "./lib/calendar";
import {
  createWbsTask, deleteWbsTask, getSettings, listAssignees, listWbsTasks,
  saveDailyProgress, saveSettings, updateWbsTask, type AppSettings, type Assignee, type WbsStatus, type WbsTask,
  type WbsTaskInput,
} from "./lib/wbs";
import { TimelineBoard } from "./features/wbs/TimelineBoard";
import { UsersScreen } from "./features/users/UsersScreen";
import { SettingsScreen } from "./features/settings/SettingsScreen";
import { ProjectsScreen } from "./features/projects/ProjectsScreen";
import { listProjects, type Project } from "./lib/projects";
import "./App.css";

type View = "home" | "wbs" | "projects" | "users" | "settings";

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
  const [settings, setSettings] = useState<AppSettings>(emptySettings);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [progressTask, setProgressTask] = useState<WbsTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [nextTasks, nextAssignees, nextProjects, nextSettings] = await Promise.all([
        listWbsTasks(), listAssignees(), listProjects(), getSettings(),
      ]);
      setTasks(nextTasks);
      setAssignees(nextAssignees);
      setProjects(nextProjects);
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

  const selectedTask = tasks.find((task) => task.id === selectedId) ?? null;
  const openTasks = useMemo(() => tasks.filter((task) => task.status !== "completed").length, [tasks]);

  async function removeTask(task: WbsTask) {
    if (!window.confirm(`「${task.title}」を削除しますか？`)) return;
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
        <button className={view === "wbs" ? "active" : ""} onClick={() => setView("wbs")} aria-label="WBS">
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
        <main className="home-screen" aria-label="ホーム" />
      ) : view === "users" ? (
        <UsersScreen users={assignees} onChanged={refresh} onError={setError} />
      ) : view === "projects" ? (
        <ProjectsScreen projects={projects} users={assignees} onChanged={refresh} onError={setError} />
      ) : view === "settings" ? (
        <SettingsScreen settings={settings} onSaved={setSettings} onError={setError} />
      ) : (
        <main className="wbs-screen">
          <header className="wbs-header">
            <div>
              <p className="eyebrow">WORK BREAKDOWN STRUCTURE</p>
              <h1>WBSロードマップ</h1>
              <p className="header-subtitle">{openTasks}件の未完了WBS · {countryName(settings.countryCode)}の営業日</p>
            </div>
            <div className="header-actions">
              <button className="primary-button" onClick={() => setShowCreate(true)}>＋ WBSを登録</button>
            </div>
          </header>

          {loading ? <div className="loading-card">WBSを読み込んでいます…</div> : <TimelineBoard tasks={tasks} assignees={assignees} countryCode={settings.countryCode} selectedId={selectedId} onSelect={(task) => setSelectedId(task.id)} onScheduleChange={updateSchedule} />}
          {selectedTask && <aside className="task-drawer" aria-label="WBS詳細"><button className="drawer-close" aria-label="詳細を閉じる" onClick={() => setSelectedId(null)}>×</button><TaskEditor task={selectedTask} countryCode={settings.countryCode} projects={projects} assignees={assignees} onChanged={refresh} onProgress={() => setProgressTask(selectedTask)} onDelete={() => void removeTask(selectedTask)} onError={setError} /></aside>}
        </main>
      )}

      {showCreate && <TaskModal settings={settings} projects={projects} assignees={assignees} onClose={() => setShowCreate(false)} onSaved={async () => { setShowCreate(false); await refresh(); }} onError={setError} />}
      {progressTask && <ProgressModal task={progressTask} onClose={() => setProgressTask(null)} onSaved={async () => { setProgressTask(null); await refresh(); }} onError={setError} />}
    </div>
  );
}

function TaskModal({ settings, projects, assignees, onClose, onSaved, onError }: {
  settings: AppSettings; projects: Project[]; assignees: Assignee[]; onClose: () => void; onSaved: () => Promise<void>; onError: (value: string | null) => void;
}) {
  const today = formatISODate(new Date());
  const [form, setForm] = useState<WbsTaskInput>({
    title: "", description: "", projectId: null, assigneeId: null, status: "not_started", progress: 0,
    countryCode: settings.countryCode, plannedStart: today,
    plannedEnd: calculateEndDate(today, 1, settings.countryCode), businessDays: 1,
    actualStart: null, actualEnd: null,
  });
  const [saving, setSaving] = useState(false);
  const end = calculateEndDate(form.plannedStart, form.businessDays, form.countryCode);
  const average = 100 / Math.max(1, form.businessDays);

  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true);
    try { await createWbsTask({ ...form, plannedEnd: end }); await onSaved(); }
    catch (cause) { onError(toMessage(cause)); setSaving(false); }
  }

  return <Modal title="WBSを登録" onClose={onClose}>
    <form className="modal-form" onSubmit={submit}>
      <FormFields form={form} setForm={setForm} projects={projects} assignees={assignees} includeActual={false} />
      <div className="preview-card">
        <span>PREVIEW</span>
        <div><small>終了予定日</small><strong>{formatLongDate(end)}</strong></div>
        <div><small>1日の平均進捗</small><strong>{average.toFixed(1)}%</strong></div>
      </div>
      {form.businessDays >= 5 && <div className="warning" role="status"><strong>タスクの分解をおすすめします</strong><span>5営業日以上のWBSです。完了条件が明確な小さなWBSへ分けると、遅れを早く発見できます。</span></div>}
      <div className="modal-actions"><button type="button" className="quiet-button" onClick={onClose}>キャンセル</button><button className="primary-button" disabled={saving || !form.title.trim()}>{saving ? "保存中…" : "登録する"}</button></div>
    </form>
  </Modal>;
}

function TaskEditor({ task, countryCode, projects, assignees, onChanged, onProgress, onDelete, onError }: {
  task: WbsTask; countryCode: string; projects: Project[]; assignees: Assignee[]; onChanged: () => Promise<void>; onProgress: () => void; onDelete: () => void; onError: (value: string | null) => void;
}) {
  const [form, setForm] = useState<WbsTaskInput>({ ...task, countryCode });
  const [saving, setSaving] = useState(false);
  useEffect(() => setForm({ ...task, countryCode }), [task, countryCode]);
  const end = calculateEndDate(form.plannedStart, form.businessDays, countryCode);

  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true);
    try { await updateWbsTask(task.id, { ...form, countryCode, plannedEnd: end }); await onChanged(); }
    catch (cause) { onError(toMessage(cause)); } finally { setSaving(false); }
  }

  return <form className="panel-form" onSubmit={submit}>
    <div className="panel-title"><div><p className="eyebrow">DETAIL</p><h2>WBSを編集</h2></div><span className={`status-badge ${form.status}`}>{statusLabels[form.status]}</span></div>
    <FormFields form={form} setForm={setForm} projects={projects} assignees={assignees} includeActual />
    <div className="progress-block"><div><span>進捗率</span><strong>{form.progress}%</strong></div><input aria-label="進捗率" type="range" min="0" max="100" step="5" value={form.progress} onChange={(e) => setForm({ ...form, progress: Number(e.currentTarget.value) })} /></div>
    <div className="editor-actions"><button type="button" className="quiet-button" onClick={onProgress}>今日の進捗</button><button className="primary-button" disabled={saving}>{saving ? "保存中…" : "変更を保存"}</button></div>
    <button type="button" className="danger-button" onClick={onDelete}>このWBSを削除</button>
  </form>;
}

function FormFields({ form, setForm, projects, assignees, includeActual }: {
  form: WbsTaskInput; setForm: (value: WbsTaskInput) => void; projects: Project[]; assignees: Assignee[]; includeActual: boolean;
}) {
  const selectedProject = projects.find((project) => project.id === form.projectId);
  const availableAssignees = selectedProject
    ? assignees.filter((person) => selectedProject.members.some((member) => member.userId === person.id))
    : assignees;
  return <div className="field-grid">
    <label className="wide">WBS名<input value={form.title} maxLength={120} required onChange={(e) => setForm({ ...form, title: e.currentTarget.value })} placeholder="例：要件定義レビュー" /></label>
    <label className="wide">説明<textarea value={form.description} maxLength={1000} rows={2} onChange={(e) => setForm({ ...form, description: e.currentTarget.value })} placeholder="完了条件や補足" /></label>
    <label>所属案件<select value={form.projectId ?? ""} onChange={(e) => { const projectId = e.currentTarget.value ? Number(e.currentTarget.value) : null; const project = projects.find((item) => item.id === projectId); const keepAssignee = !project || project.members.some((member) => member.userId === form.assigneeId); setForm({ ...form, projectId, assigneeId: keepAssignee ? form.assigneeId : null }); }}><option value="">案件未設定</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
    <label>担当者<select value={form.assigneeId ?? ""} onChange={(e) => setForm({ ...form, assigneeId: e.currentTarget.value ? Number(e.currentTarget.value) : null })}><option value="">未割当</option>{availableAssignees.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select>{selectedProject && availableAssignees.length === 0 && <small>この案件にはユーザーが紐づいていません。</small>}</label>
    <label>開始予定日<input type="date" required value={form.plannedStart} onChange={(e) => setForm({ ...form, plannedStart: e.currentTarget.value })} /></label>
    <label>営業日数<input type="number" min="1" max="999" required value={form.businessDays} onChange={(e) => setForm({ ...form, businessDays: Math.max(1, Number(e.currentTarget.value)) })} /></label>
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

export default App;
