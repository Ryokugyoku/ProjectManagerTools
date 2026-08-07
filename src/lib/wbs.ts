import Database from "@tauri-apps/plugin-sql";
import { deriveParentProgress, expectedProgress } from "./wbsPlanning";

const DATABASE_URL = "sqlite:project-manager.db";

export type WbsStatus = "not_started" | "in_progress" | "completed" | "on_hold";
export type UserProfile = {
  id: number;
  name: string;
  email: string;
  birthday: string | null;
  department: string;
  role: string;
  timezone: string;
  interests: string;
  skills: string;
  workStyle: string;
  notes: string;
};
export type Assignee = UserProfile;
export type UserProfileInput = Omit<UserProfile, "id">;
export type WbsTask = {
  id: number;
  title: string;
  description: string;
  projectId: number | null;
  projectName: string | null;
  parentTaskId: number | null;
  parentTaskTitle: string | null;
  prerequisiteTaskId?: number | null;
  prerequisiteTaskTitle?: string | null;
  prerequisiteTaskIds?: number[];
  prerequisiteTasks?: Array<{ id: number; title: string }>;
  assigneeId: number | null;
  assigneeName: string | null;
  status: WbsStatus;
  progress: number;
  countryCode: string;
  plannedStart: string;
  plannedEnd: string;
  businessDays: number;
  actualStart: string | null;
  actualEnd: string | null;
  finalized: boolean;
  todayDailyProgress?: number | null;
  todayProgressNote?: string;
  latestDelayReason?: string;
};
export type WbsTaskInput = Omit<WbsTask, "id" | "assigneeName" | "projectName" | "parentTaskTitle" | "prerequisiteTaskTitle" | "prerequisiteTasks" | "plannedEnd" | "finalized" | "todayDailyProgress" | "todayProgressNote" | "latestDelayReason"> & {
  plannedEnd: string;
};
export type AppSettings = {
  countryCode: string;
  notificationTime: string;
  notificationsEnabled: boolean;
  lastNotifiedDate: string | null;
};
export type WorkHistoryType = "created" | "finalized" | "rescheduled" | "progress" | "delay";
export type WorkHistoryEntry = { id: number; taskId: number; type: WorkHistoryType; reason: string; details: string; occurredAt: string };
export type TaskTreeHistoryEntry = WorkHistoryEntry & { taskTitle: string; depth: number };
export type DailyProgressSnapshot = {
  taskId: number;
  date: string;
  dailyProgress: number | null;
  cumulativeProgress: number;
  note: string;
  latestHistoryType: WorkHistoryType | null;
  latestHistoryDetails: string;
  rescheduleReason: string;
  delayReason: string;
};

type WbsTaskRow = {
  id: number; title: string; description: string; project_id: number | null;
  project_name: string | null; parent_task_id: number | null; parent_task_title: string | null;
  prerequisite_task_id: number | null; prerequisite_task_title: string | null;
  assignee_id: number | null;
  assignee_name: string | null; status: WbsStatus; progress: number; country_code: string;
  planned_start: string; planned_end: string; business_days: number;
  actual_start: string | null; actual_end: string | null;
  finalized: number;
  today_daily_progress: number | null;
  today_progress_note: string | null;
  latest_delay_reason: string | null;
};
type WbsDependencyRow = { task_id: number; prerequisite_task_id: number; prerequisite_task_title: string };
type WorkHistoryRow = { id: number; task_id: number; event_type: WorkHistoryType; reason: string; details: string; occurred_at: string };
type TaskTreeHistoryRow = WorkHistoryRow & { task_title: string; depth: number };
type AssigneeRow = {
  id: number; name: string; email: string; birthday: string | null;
  department: string; role: string; timezone: string; interests: string;
  skills: string; work_style: string; notes: string;
};
type SettingsRow = {
  country_code: string; notification_time: string; notifications_enabled: number;
  last_notified_date: string | null;
};

let databasePromise: Promise<Database> | undefined;
function database() {
  databasePromise ??= Database.load(DATABASE_URL);
  return databasePromise;
}

export async function listWbsTasks(date = localISODate()): Promise<WbsTask[]> {
  const db = await database();
  const rows = await db.select<WbsTaskRow[]>(`
    SELECT w.id, w.title, w.description, w.project_id, p.name AS project_name,
      w.parent_task_id, parent.title AS parent_task_title,
      w.prerequisite_task_id, prerequisite.title AS prerequisite_task_title,
      w.assignee_id, a.name AS assignee_name,
      w.status, w.progress, w.country_code, w.planned_start, w.planned_end,
      w.business_days, w.actual_start, w.actual_end, w.finalized,
      today_log.daily_progress AS today_daily_progress,
      today_log.note AS today_progress_note,
      (SELECT history.reason FROM wbs_work_history history
        WHERE history.task_id=w.id AND history.event_type='delay'
        ORDER BY history.occurred_at DESC, history.id DESC LIMIT 1) AS latest_delay_reason
    FROM wbs_tasks w
    LEFT JOIN assignees a ON a.id = w.assignee_id
    LEFT JOIN projects p ON p.id = w.project_id
    LEFT JOIN wbs_tasks parent ON parent.id = w.parent_task_id
    LEFT JOIN wbs_tasks prerequisite ON prerequisite.id = w.prerequisite_task_id
    LEFT JOIN wbs_progress_logs today_log ON today_log.task_id=w.id AND today_log.log_date=$1
    ORDER BY w.planned_start, w.id
  `, [date]);
  const dependencies = await db.select<WbsDependencyRow[]>(`
    SELECT dependency.task_id, dependency.prerequisite_task_id,
      prerequisite.title AS prerequisite_task_title
    FROM wbs_task_dependencies dependency
    JOIN wbs_tasks prerequisite ON prerequisite.id=dependency.prerequisite_task_id
    ORDER BY dependency.task_id, prerequisite.planned_start, prerequisite.id
  `);
  const byTask = new Map<number, Array<{ id: number; title: string }>>();
  for (const dependency of dependencies) {
    byTask.set(dependency.task_id, [...(byTask.get(dependency.task_id) ?? []), {
      id: dependency.prerequisite_task_id, title: dependency.prerequisite_task_title,
    }]);
  }
  return deriveParentProgress(rows.map((row) => mapTask(row, byTask.get(row.id) ?? [])));
}

export async function listDailyProgressSnapshots(date: string): Promise<DailyProgressSnapshot[]> {
  const db = await database();
  const rows = await db.select<Array<{
    task_id: number; daily_progress: number | null; cumulative_progress: number; note: string | null;
    latest_history_type: WorkHistoryType | null; latest_history_details: string | null;
    reschedule_reason: string | null; delay_reason: string | null;
  }>>(`
    SELECT w.id AS task_id, exact_log.daily_progress, exact_log.note,
      COALESCE(
        (SELECT previous.progress FROM wbs_progress_logs previous
          WHERE previous.task_id=w.id AND previous.log_date<=$1
          ORDER BY previous.log_date DESC LIMIT 1),
        CASE WHEN w.actual_end IS NOT NULL AND w.actual_end<=$1 THEN 100 ELSE 0 END
      ) AS cumulative_progress,
      (SELECT history.event_type FROM wbs_work_history history
        WHERE history.task_id=w.id AND history.event_type<>'delay'
          AND date(history.occurred_at, 'localtime')=$1
        ORDER BY history.occurred_at DESC, history.id DESC LIMIT 1) AS latest_history_type,
      (SELECT history.details FROM wbs_work_history history
        WHERE history.task_id=w.id AND history.event_type<>'delay'
          AND date(history.occurred_at, 'localtime')=$1
        ORDER BY history.occurred_at DESC, history.id DESC LIMIT 1) AS latest_history_details,
      (SELECT history.reason FROM wbs_work_history history
        WHERE history.task_id=w.id AND history.event_type='rescheduled'
          AND date(history.occurred_at, 'localtime')=$1
        ORDER BY history.occurred_at DESC, history.id DESC LIMIT 1) AS reschedule_reason,
      (SELECT history.reason FROM wbs_work_history history
        WHERE history.task_id=w.id AND history.event_type='delay'
          AND date(history.occurred_at, 'localtime')=$1
        ORDER BY history.occurred_at DESC, history.id DESC LIMIT 1) AS delay_reason
    FROM wbs_tasks w
    LEFT JOIN wbs_progress_logs exact_log
      ON exact_log.task_id=w.id AND exact_log.log_date=$1
    ORDER BY w.id
  `, [date]);
  return rows.map((row) => ({
    taskId: row.task_id,
    date,
    dailyProgress: row.daily_progress,
    cumulativeProgress: row.cumulative_progress,
    note: row.note ?? "",
    latestHistoryType: row.latest_history_type,
    latestHistoryDetails: row.latest_history_details ?? "",
    rescheduleReason: row.reschedule_reason ?? "",
    delayReason: row.delay_reason ?? "",
  }));
}

export async function createWbsTask(input: WbsTaskInput): Promise<void> {
  validateTask(input);
  const db = await database();
  await validateProjectAssignment(db, input.projectId, input.assigneeId);
  await validateParentTask(db, null, input.projectId, input.parentTaskId);
  const prerequisiteIds = normalizedPrerequisiteIds(input);
  await validatePrerequisiteTasks(db, null, input.projectId, input.parentTaskId, prerequisiteIds);
  const result = await db.execute(`
    INSERT INTO wbs_tasks
      (title, description, project_id, parent_task_id, prerequisite_task_id, assignee_id, status, progress,
       country_code, planned_start, planned_end, business_days, actual_start, actual_end)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
  `, taskValues(input));
  const taskId = Number(result.lastInsertId);
  await replaceTaskDependencies(db, taskId, prerequisiteIds);
  if (input.parentTaskId !== null) {
    await db.execute("INSERT INTO wbs_work_history (task_id, event_type, details) VALUES ($1, 'created', $2)", [
      input.parentTaskId, `サブタスク「${input.title.trim()}」を追加しました。`,
    ]);
  }
}

export async function updateWbsTask(id: number, input: WbsTaskInput): Promise<void> {
  validateTask(input);
  const db = await database();
  await validateProjectAssignment(db, input.projectId, input.assigneeId);
  await validateParentTask(db, id, input.projectId, input.parentTaskId);
  const prerequisiteIds = normalizedPrerequisiteIds(input);
  await validatePrerequisiteTasks(db, id, input.projectId, input.parentTaskId, prerequisiteIds);
  await validateChildProjects(db, id, input.projectId);
  await validateDependentHierarchy(db, id, input.projectId, input.parentTaskId);
  await validateFinalizedFields(db, id, input);
  await db.execute(`
    UPDATE wbs_tasks SET title=$1, description=$2, project_id=$3, parent_task_id=$4,
      prerequisite_task_id=$5, assignee_id=$6, status=$7, progress=$8, country_code=$9,
      planned_start=$10, planned_end=$11, business_days=$12, actual_start=$13, actual_end=$14,
      updated_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id=$15
  `, [...taskValues(input), id]);
  await replaceTaskDependencies(db, id, prerequisiteIds);
}

export async function deleteWbsTask(id: number): Promise<void> {
  const db = await database();
  await db.execute("DELETE FROM wbs_work_history WHERE task_id=$1", [id]);
  await db.execute("DELETE FROM wbs_progress_logs WHERE task_id=$1", [id]);
  await db.execute("DELETE FROM wbs_task_dependencies WHERE task_id=$1 OR prerequisite_task_id=$1", [id]);
  await db.execute("UPDATE wbs_tasks SET prerequisite_task_id=NULL WHERE prerequisite_task_id=$1", [id]);
  await db.execute("UPDATE wbs_tasks SET parent_task_id=NULL WHERE parent_task_id=$1", [id]);
  await db.execute("DELETE FROM wbs_tasks WHERE id=$1", [id]);
}

export async function finalizeWbsTask(taskId: number): Promise<void> {
  const db = await database();
  await db.execute("UPDATE wbs_tasks SET finalized=1, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id=$1", [taskId]);
  await db.execute("INSERT INTO wbs_work_history (task_id, event_type, details) VALUES ($1, 'finalized', $2)", [taskId, "タスクの計画を確定しました。"]);
}

export async function saveScheduleChanges(changes: Array<{ taskId: number; plannedStart: string; plannedEnd: string; businessDays: number; historyContext?: string }>, reason: string): Promise<void> {
  const normalizedReason = reason.trim();
  if (!normalizedReason) throw new Error("リスケ理由を入力してください。");
  const db = await database();
  for (const change of changes) {
    const rows = await db.select<Array<{ planned_start: string; planned_end: string }>>("SELECT planned_start, planned_end FROM wbs_tasks WHERE id=$1", [change.taskId]);
    const before = rows[0];
    if (!before) throw new Error("変更対象のタスクが見つかりません。");
    await db.execute(`UPDATE wbs_tasks SET planned_start=$1, planned_end=$2, business_days=$3,
      updated_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id=$4`, [change.plannedStart, change.plannedEnd, change.businessDays, change.taskId]);
    const context = change.historyContext?.trim();
    const scheduleDetails = `${before.planned_start}〜${before.planned_end} → ${change.plannedStart}〜${change.plannedEnd}`;
    await db.execute("INSERT INTO wbs_work_history (task_id, event_type, reason, details) VALUES ($1, 'rescheduled', $2, $3)", [
      change.taskId, normalizedReason, context ? `${context}。${scheduleDetails}` : scheduleDetails,
    ]);
  }
}

export async function saveDailyProgress(taskId: number, date: string, dailyProgress: number, note: string, delayReason: string) {
  if (!Number.isFinite(dailyProgress) || dailyProgress < 0 || dailyProgress > 100) throw new Error("今日進んだ進捗は0〜100%で入力してください。");
  const db = await database();
  const rows = await db.select<Array<{ progress: number; finalized: number; planned_start: string; planned_end: string; business_days: number; country_code: string; previous_daily: number; child_count: number }>>(
    `SELECT w.progress, w.finalized, w.planned_start, w.planned_end, w.business_days, w.country_code,
      COALESCE((SELECT daily_progress FROM wbs_progress_logs WHERE task_id=w.id AND log_date=$2), 0) AS previous_daily,
      (SELECT COUNT(*) FROM wbs_tasks child WHERE child.parent_task_id=w.id) AS child_count
      FROM wbs_tasks w WHERE w.id=$1`,
    [taskId, date],
  );
  const task = rows[0];
  if (!task) throw new Error("進捗を記録するタスクが見つかりません。");
  if (task.child_count > 0) throw new Error("サブタスクを持つタスクには進捗を直接入力できません。");
  const totalProgress = Math.max(0, Math.min(100, task.progress - task.previous_daily + dailyProgress));
  const expected = expectedProgress({ plannedStart: task.planned_start, plannedEnd: task.planned_end, businessDays: task.business_days, countryCode: task.country_code }, date);
  const normalizedReason = delayReason.trim();
  if (task.finalized === 1 && totalProgress < expected && !normalizedReason) throw new Error("計画進捗を下回る理由を入力してください。");
  await db.execute(`
    INSERT INTO wbs_progress_logs (task_id, log_date, progress, note, daily_progress)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT(task_id, log_date) DO UPDATE SET progress=excluded.progress, note=excluded.note, daily_progress=excluded.daily_progress
  `, [taskId, date, totalProgress, note.trim(), dailyProgress]);
  await db.execute(`
    UPDATE wbs_tasks SET progress=$1,
      status=CASE WHEN $1=100 THEN 'completed' WHEN $1>0 THEN 'in_progress' ELSE status END,
      actual_end=CASE WHEN $1=100 THEN COALESCE(actual_end, $2) ELSE actual_end END,
      updated_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id=$3
  `, [totalProgress, date, taskId]);
  await db.execute("INSERT INTO wbs_work_history (task_id, event_type, details) VALUES ($1, 'progress', $2)", [taskId, `今日 +${dailyProgress}% / 累計 ${totalProgress}% / 計画 ${expected}%${note.trim() ? `\n${note.trim()}` : ""}`]);
  if (task.finalized === 1 && totalProgress < expected) {
    await db.execute("INSERT INTO wbs_work_history (task_id, event_type, reason, details) VALUES ($1, 'delay', $2, $3)", [taskId, normalizedReason, `累計進捗 ${totalProgress}%（計画 ${expected}%）`]);
  }
}

export async function listTaskHistory(taskId: number): Promise<WorkHistoryEntry[]> {
  const db = await database();
  const rows = await db.select<WorkHistoryRow[]>(`SELECT id, task_id, event_type, reason, details, occurred_at
    FROM wbs_work_history WHERE task_id=$1 ORDER BY occurred_at ASC, id ASC`, [taskId]);
  return rows.map((row) => ({ id: row.id, taskId: row.task_id, type: row.event_type, reason: row.reason, details: row.details, occurredAt: row.occurred_at }));
}

export async function listTaskTreeHistory(taskId: number): Promise<TaskTreeHistoryEntry[]> {
  const db = await database();
  const rows = await db.select<TaskTreeHistoryRow[]>(`WITH RECURSIVE task_tree(id, title, depth) AS (
      SELECT id, title, 0 FROM wbs_tasks WHERE id=$1
      UNION ALL
      SELECT child.id, child.title, task_tree.depth + 1
      FROM wbs_tasks child JOIN task_tree ON child.parent_task_id=task_tree.id
    )
    SELECT history.id, history.task_id, history.event_type, history.reason, history.details,
      history.occurred_at, task_tree.title AS task_title, task_tree.depth
    FROM task_tree JOIN wbs_work_history history ON history.task_id=task_tree.id
    ORDER BY history.occurred_at DESC, history.id DESC`, [taskId]);
  return rows.map((row) => ({
    id: row.id, taskId: row.task_id, type: row.event_type, reason: row.reason,
    details: row.details, occurredAt: row.occurred_at, taskTitle: row.task_title, depth: row.depth,
  }));
}

export async function listAssignees(): Promise<Assignee[]> {
  const db = await database();
  const rows = await db.select<AssigneeRow[]>(`SELECT id, name, email, birthday, department,
    role, timezone, interests, skills, work_style, notes
    FROM assignees ORDER BY name COLLATE NOCASE`);
  return rows.map((row) => ({
    id: row.id, name: row.name, email: row.email, birthday: row.birthday,
    department: row.department, role: row.role, timezone: row.timezone,
    interests: row.interests, skills: row.skills, workStyle: row.work_style, notes: row.notes,
  }));
}

export async function createAssignee(input: UserProfileInput): Promise<void> {
  validateAssignee(input.name, input.email);
  const db = await database();
  await db.execute(`INSERT INTO assignees
    (name, email, birthday, department, role, timezone, interests, skills, work_style, notes)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, userValues(input));
}

export async function updateAssignee(id: number, input: UserProfileInput): Promise<void> {
  validateAssignee(input.name, input.email);
  const db = await database();
  await db.execute(`UPDATE assignees SET name=$1, email=$2, birthday=$3,
    department=$4, role=$5, timezone=$6, interests=$7, skills=$8,
    work_style=$9, notes=$10, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id=$11`, [...userValues(input), id]);
}

export async function deleteAssignee(id: number): Promise<void> {
  const db = await database();
  await db.execute("UPDATE wbs_tasks SET assignee_id=NULL WHERE assignee_id=$1", [id]);
  await db.execute("DELETE FROM project_members WHERE user_id=$1", [id]);
  await db.execute("DELETE FROM assignees WHERE id=$1", [id]);
}

export async function getSettings(): Promise<AppSettings> {
  const db = await database();
  const rows = await db.select<SettingsRow[]>("SELECT country_code, notification_time, notifications_enabled, last_notified_date FROM app_settings WHERE id=1");
  const row = rows[0];
  return {
    countryCode: row?.country_code ?? "JP",
    notificationTime: row?.notification_time ?? "17:30",
    notificationsEnabled: row?.notifications_enabled === 1,
    lastNotifiedDate: row?.last_notified_date ?? null,
  };
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const db = await database();
  await db.execute(`UPDATE app_settings SET country_code=$1, notification_time=$2,
    notifications_enabled=$3, last_notified_date=$4 WHERE id=1`, [
    settings.countryCode, settings.notificationTime, settings.notificationsEnabled ? 1 : 0,
    settings.lastNotifiedDate,
  ]);
}

function mapTask(row: WbsTaskRow, dependencies: Array<{ id: number; title: string }>): WbsTask {
  const effectiveDependencies = dependencies.length > 0
    ? dependencies
    : row.prerequisite_task_id === null ? [] : [{ id: row.prerequisite_task_id, title: row.prerequisite_task_title ?? "" }];
  return {
    id: row.id, title: row.title, description: row.description,
    projectId: row.project_id, projectName: row.project_name,
    parentTaskId: row.parent_task_id, parentTaskTitle: row.parent_task_title,
    prerequisiteTaskId: row.prerequisite_task_id, prerequisiteTaskTitle: row.prerequisite_task_title,
    prerequisiteTaskIds: effectiveDependencies.map((item) => item.id), prerequisiteTasks: effectiveDependencies,
    assigneeId: row.assignee_id, assigneeName: row.assignee_name, status: row.status,
    progress: row.progress, countryCode: row.country_code, plannedStart: row.planned_start,
    plannedEnd: row.planned_end, businessDays: row.business_days,
    actualStart: row.actual_start, actualEnd: row.actual_end, finalized: row.finalized === 1,
    todayDailyProgress: row.today_daily_progress,
    todayProgressNote: row.today_progress_note ?? "",
    latestDelayReason: row.latest_delay_reason ?? "",
  };
}

function localISODate() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function taskValues(input: WbsTaskInput): unknown[] {
  const firstPrerequisiteId = normalizedPrerequisiteIds(input)[0] ?? null;
  return [input.title.trim(), input.description.trim(), input.projectId, input.parentTaskId, firstPrerequisiteId, input.assigneeId,
    input.status, input.progress, input.countryCode, input.plannedStart, input.plannedEnd,
    input.businessDays, input.actualStart || null, input.actualEnd || null];
}

function validateTask(input: WbsTaskInput) {
  if (!input.title.trim()) throw new Error("タスク名を入力してください。");
  if (!input.plannedStart || !input.plannedEnd) throw new Error("予定日を入力してください。");
  if (input.businessDays < 1) throw new Error("営業日数は1日以上にしてください。");
}

function validateAssignee(name: string, email: string) {
  if (!name.trim()) throw new Error("氏名を入力してください。");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) throw new Error("有効なメールアドレスを入力してください。");
}

function userValues(input: UserProfileInput): unknown[] {
  return [input.name.trim(), input.email.trim(), input.birthday || null,
    input.department.trim(), input.role.trim(), input.timezone.trim(),
    input.interests.trim(), input.skills.trim(), input.workStyle.trim(), input.notes.trim()];
}

async function validateProjectAssignment(db: Database, projectId: number | null, assigneeId: number | null) {
  if (projectId === null || assigneeId === null) return;
  const rows = await db.select<Array<{ count: number }>>(
    "SELECT COUNT(*) AS count FROM project_members WHERE project_id=$1 AND user_id=$2",
    [projectId, assigneeId],
  );
  if ((rows[0]?.count ?? 0) === 0) throw new Error("担当者は選択した案件のメンバーではありません。");
}

async function validateParentTask(db: Database, taskId: number | null, projectId: number | null, parentTaskId: number | null) {
  if (parentTaskId === null) return;
  if (projectId === null) throw new Error("親タスクを設定する場合は所属案件が必要です。");
  if (taskId === parentTaskId) throw new Error("タスク自身を親タスクには設定できません。");
  const rows = await db.select<Array<{ parent_project_id: number | null; is_descendant: number }>>(`
    WITH RECURSIVE descendants(id) AS (
      SELECT id FROM wbs_tasks WHERE parent_task_id=$1
      UNION ALL
      SELECT child.id FROM wbs_tasks child JOIN descendants ON child.parent_task_id=descendants.id
    )
    SELECT parent.project_id AS parent_project_id,
      EXISTS(SELECT 1 FROM descendants WHERE id=$2) AS is_descendant
    FROM wbs_tasks parent WHERE parent.id=$3
  `, [taskId ?? -1, parentTaskId, parentTaskId]);
  const parent = rows[0];
  if (!parent) throw new Error("選択した親タスクが見つかりません。");
  if (parent.parent_project_id !== projectId) throw new Error("親タスクは同じ案件から選択してください。");
  if (parent.is_descendant === 1) throw new Error("子孫タスクを親タスクには設定できません。");
}

async function validateChildProjects(db: Database, taskId: number, projectId: number | null) {
  const rows = await db.select<Array<{ invalid_children: number }>>(
    "SELECT COUNT(*) AS invalid_children FROM wbs_tasks WHERE parent_task_id=$1 AND project_id IS NOT $2",
    [taskId, projectId],
  );
  if ((rows[0]?.invalid_children ?? 0) > 0) throw new Error("子タスクがあるタスクは別の案件へ移動できません。");
}

async function validatePrerequisiteTasks(db: Database, taskId: number | null, projectId: number | null, parentTaskId: number | null, prerequisiteTaskIds: number[]) {
  for (const prerequisiteTaskId of prerequisiteTaskIds) {
  if (taskId === prerequisiteTaskId) throw new Error("タスク自身を完了前提には設定できません。");
  const rows = await db.select<Array<{ candidate_project_id: number | null; candidate_parent_task_id: number | null; is_cycle: number }>>(`
    WITH RECURSIVE prerequisite_chain(id) AS (
      SELECT prerequisite_task_id FROM wbs_task_dependencies WHERE task_id=$1
      UNION ALL
      SELECT dependency.prerequisite_task_id
      FROM wbs_task_dependencies dependency JOIN prerequisite_chain chain ON dependency.task_id=chain.id
    )
    SELECT candidate.project_id AS candidate_project_id,
      candidate.parent_task_id AS candidate_parent_task_id,
      EXISTS(SELECT 1 FROM prerequisite_chain WHERE id=$2) AS is_cycle
    FROM wbs_tasks candidate WHERE candidate.id=$1
  `, [prerequisiteTaskId, taskId ?? -1]);
  const candidate = rows[0];
  if (!candidate) throw new Error("選択した完了前提タスクが見つかりません。");
  if (candidate.candidate_project_id !== projectId || candidate.candidate_parent_task_id !== parentTaskId) {
    throw new Error("完了前提は同じ案件・同じ階層のタスクから選択してください。");
  }
  if (candidate.is_cycle === 1) throw new Error("完了前提の依存関係を循環させることはできません。");
  }
}

async function validateDependentHierarchy(db: Database, taskId: number, projectId: number | null, parentTaskId: number | null) {
  const rows = await db.select<Array<{ invalid_dependents: number }>>(
    `SELECT COUNT(*) AS invalid_dependents FROM wbs_task_dependencies dependency
      JOIN wbs_tasks dependent ON dependent.id=dependency.task_id
      WHERE dependency.prerequisite_task_id=$1
        AND (dependent.project_id IS NOT $2 OR dependent.parent_task_id IS NOT $3)`,
    [taskId, projectId, parentTaskId],
  );
  if ((rows[0]?.invalid_dependents ?? 0) > 0) throw new Error("このタスクを完了前提にしている同階層タスクがあるため、階層または案件を変更できません。");
}

function normalizedPrerequisiteIds(input: Pick<WbsTaskInput, "prerequisiteTaskIds" | "prerequisiteTaskId">): number[] {
  const values = input.prerequisiteTaskIds ?? (input.prerequisiteTaskId == null ? [] : [input.prerequisiteTaskId]);
  return [...new Set(values.filter((value) => Number.isInteger(value)))];
}

async function replaceTaskDependencies(db: Database, taskId: number, prerequisiteTaskIds: number[]) {
  await db.execute("DELETE FROM wbs_task_dependencies WHERE task_id=$1", [taskId]);
  for (const prerequisiteTaskId of prerequisiteTaskIds) {
    await db.execute("INSERT INTO wbs_task_dependencies (task_id, prerequisite_task_id) VALUES ($1, $2)", [taskId, prerequisiteTaskId]);
  }
}

async function validateFinalizedFields(db: Database, taskId: number, input: WbsTaskInput) {
  const rows = await db.select<Array<{ finalized: number; planned_start: string; planned_end: string; business_days: number; progress: number }>>(
    "SELECT finalized, planned_start, planned_end, business_days, progress FROM wbs_tasks WHERE id=$1",
    [taskId],
  );
  const current = rows[0];
  if (!current || current.finalized !== 1) return;
  if (current.planned_start !== input.plannedStart || current.planned_end !== input.plannedEnd || current.business_days !== input.businessDays) {
    throw new Error("確定済みタスクの日程は、ロードマップからリスケ理由を記録して変更してください。");
  }
  if (current.progress !== input.progress) {
    throw new Error("確定済みタスクの進捗は「今日進んだ進捗」から記録してください。");
  }
}
