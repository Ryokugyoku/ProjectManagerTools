import Database from "@tauri-apps/plugin-sql";

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
};
export type WbsTaskInput = Omit<WbsTask, "id" | "assigneeName" | "projectName" | "plannedEnd"> & {
  plannedEnd: string;
};
export type AppSettings = {
  countryCode: string;
  notificationTime: string;
  notificationsEnabled: boolean;
  lastNotifiedDate: string | null;
};

type WbsTaskRow = {
  id: number; title: string; description: string; project_id: number | null;
  project_name: string | null; assignee_id: number | null;
  assignee_name: string | null; status: WbsStatus; progress: number; country_code: string;
  planned_start: string; planned_end: string; business_days: number;
  actual_start: string | null; actual_end: string | null;
};
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

export async function listWbsTasks(): Promise<WbsTask[]> {
  const db = await database();
  const rows = await db.select<WbsTaskRow[]>(`
    SELECT w.id, w.title, w.description, w.project_id, p.name AS project_name,
      w.assignee_id, a.name AS assignee_name,
      w.status, w.progress, w.country_code, w.planned_start, w.planned_end,
      w.business_days, w.actual_start, w.actual_end
    FROM wbs_tasks w
    LEFT JOIN assignees a ON a.id = w.assignee_id
    LEFT JOIN projects p ON p.id = w.project_id
    ORDER BY w.planned_start, w.id
  `);
  return rows.map(mapTask);
}

export async function createWbsTask(input: WbsTaskInput): Promise<void> {
  validateTask(input);
  const db = await database();
  await validateProjectAssignment(db, input.projectId, input.assigneeId);
  await db.execute(`
    INSERT INTO wbs_tasks
      (title, description, project_id, assignee_id, status, progress, country_code, planned_start,
       planned_end, business_days, actual_start, actual_end)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
  `, taskValues(input));
}

export async function updateWbsTask(id: number, input: WbsTaskInput): Promise<void> {
  validateTask(input);
  const db = await database();
  await validateProjectAssignment(db, input.projectId, input.assigneeId);
  await db.execute(`
    UPDATE wbs_tasks SET title=$1, description=$2, project_id=$3, assignee_id=$4, status=$5,
      progress=$6, country_code=$7, planned_start=$8, planned_end=$9,
      business_days=$10, actual_start=$11, actual_end=$12,
      updated_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id=$13
  `, [...taskValues(input), id]);
}

export async function deleteWbsTask(id: number): Promise<void> {
  const db = await database();
  await db.execute("DELETE FROM wbs_progress_logs WHERE task_id=$1", [id]);
  await db.execute("DELETE FROM wbs_tasks WHERE id=$1", [id]);
}

export async function saveDailyProgress(taskId: number, date: string, progress: number, note: string) {
  const db = await database();
  await db.execute(`
    INSERT INTO wbs_progress_logs (task_id, log_date, progress, note)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT(task_id, log_date) DO UPDATE SET progress=excluded.progress, note=excluded.note
  `, [taskId, date, progress, note.trim()]);
  await db.execute(`
    UPDATE wbs_tasks SET progress=$1,
      status=CASE WHEN $1=100 THEN 'completed' WHEN $1>0 THEN 'in_progress' ELSE status END,
      actual_end=CASE WHEN $1=100 THEN COALESCE(actual_end, $2) ELSE actual_end END,
      updated_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id=$3
  `, [progress, date, taskId]);
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

function mapTask(row: WbsTaskRow): WbsTask {
  return {
    id: row.id, title: row.title, description: row.description,
    projectId: row.project_id, projectName: row.project_name,
    assigneeId: row.assignee_id, assigneeName: row.assignee_name, status: row.status,
    progress: row.progress, countryCode: row.country_code, plannedStart: row.planned_start,
    plannedEnd: row.planned_end, businessDays: row.business_days,
    actualStart: row.actual_start, actualEnd: row.actual_end,
  };
}

function taskValues(input: WbsTaskInput): unknown[] {
  return [input.title.trim(), input.description.trim(), input.projectId, input.assigneeId,
    input.status, input.progress, input.countryCode, input.plannedStart, input.plannedEnd,
    input.businessDays, input.actualStart || null, input.actualEnd || null];
}

function validateTask(input: WbsTaskInput) {
  if (!input.title.trim()) throw new Error("WBS名を入力してください。");
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
