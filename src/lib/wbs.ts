import Database from "@tauri-apps/plugin-sql";
import { deriveParentProgress, expectedProgress } from "./wbsPlanning";
import { requireReasonCategory, type ReasonCategory } from "./reasonCategories";

const DATABASE_URL = "sqlite:project-manager-v2.db";

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
export type UserProfileInput = Omit<UserProfile, "id">;
export type UserLeaveType = "planned" | "unplanned";
export type UserLeaveUnit = "full_day" | "morning" | "afternoon";
export type UserLeave = {
  id: number;
  userId: number;
  userName: string;
  date: string;
  type: UserLeaveType;
  unit: UserLeaveUnit;
  reason: string;
  customerApproved: boolean;
  managerApproved: boolean;
  workflowApproved: boolean;
  createdAt: string;
};
export type UserLeaveInput = Omit<UserLeave, "id" | "userName" | "createdAt">;
export type WbsTask = {
  id: number;
  title: string;
  description: string;
  projectId: number | null;
  projectName: string | null;
  parentTaskId: number | null;
  parentTaskTitle: string | null;
  prerequisiteTaskIds?: number[];
  prerequisiteTasks?: Array<{ id: number; title: string; status: WbsStatus }>;
  ownerUserId: number | null;
  ownerUserName: string | null;
  status: WbsStatus;
  progress: number;
  countryCode: string;
  plannedStart: string;
  plannedEnd: string;
  businessDays: number;
  scheduleAssigned?: boolean;
  actualStart: string | null;
  actualEnd: string | null;
  finalized: boolean;
  todayDailyProgress?: number | null;
  todayProgressNote?: string;
  todayEarlyStartReason?: string;
  latestDelayReason?: string;
  ownerLeaves?: UserLeave[];
};
export type WbsTaskInput = Omit<WbsTask, "id" | "ownerUserName" | "projectName" | "parentTaskTitle" | "prerequisiteTasks" | "plannedEnd" | "finalized" | "todayDailyProgress" | "todayProgressNote" | "todayEarlyStartReason" | "latestDelayReason"> & {
  plannedEnd: string;
};
export type AppSettings = {
  countryCode: string;
  notificationTime: string;
  notificationsEnabled: boolean;
  lastNotifiedDate: string | null;
  dailyReportAncestorDepth: number;
};
export type ActivityEventKind = "created" | "finalized" | "rescheduled" | "progress" | "delay";
export type ActivityEvent = { id: number; taskId: number; ownerUserId: number | null; type: ActivityEventKind; reasonCategory: ReasonCategory | ""; reason: string; details: string; occurredAt: string };
export type TaskTreeHistoryEntry = ActivityEvent & { taskTitle: string; depth: number };
export type DailyProgressSnapshot = {
  taskId: number;
  date: string;
  dailyProgress: number | null;
  cumulativeProgress: number;
  note: string;
  latestHistoryType: ActivityEventKind | null;
  latestHistoryDetails: string;
  rescheduleReason: string;
  rescheduleReasonCategory?: ReasonCategory | "";
  delayReason: string;
  delayReasonCategory?: ReasonCategory | "";
  earlyStartReason?: string;
};

type WbsTaskRow = {
  id: number; title: string; description: string; project_id: number | null;
  project_name: string | null; parent_task_id: number | null; parent_task_title: string | null;
  owner_user_id: number | null;
  owner_user_name: string | null; status: WbsStatus; progress: number; country_code: string;
  planned_start: string; planned_end: string; business_days: number; schedule_assigned: number;
  actual_start: string | null; actual_end: string | null;
  finalized: number;
  today_daily_progress: number | null;
  today_progress_note: string | null;
  today_early_start_reason: string | null;
  latest_delay_reason: string | null;
};
type WbsDependencyRow = { task_id: number; prerequisite_task_id: number; prerequisite_task_title: string; prerequisite_task_status: WbsStatus };
type ActivityEventRow = { id: number; task_id: number; owner_user_id: number | null; event_kind: ActivityEventKind; reason_category: ReasonCategory | ""; reason: string; details: string; occurred_at: string };
type TaskTreeHistoryRow = ActivityEventRow & { task_title: string; depth: number };
type UserRow = {
  id: number; name: string; email: string; birthday: string | null;
  department: string; role: string; timezone: string; interests: string;
  skills: string; work_style: string; notes: string;
};
type SettingsRow = {
  country_code: string; notification_time: string; notifications_enabled: number;
  last_notified_date: string | null;
  daily_report_ancestor_depth: number;
};
type UserLeaveRow = {
  id: number; user_id: number; user_name: string; leave_date: string;
  leave_type: UserLeaveType; leave_unit: UserLeaveUnit; reason: string;
  customer_approved: number; manager_approved: number; workflow_approved: number; created_at: string;
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
      w.owner_user_id, a.name AS owner_user_name,
      w.status, w.progress, w.country_code, w.planned_start, w.planned_end,
      w.business_days, w.schedule_assigned, w.actual_start, w.actual_end, w.finalized,
      today_log.daily_progress AS today_daily_progress,
      today_log.note AS today_progress_note,
      today_log.early_start_reason AS today_early_start_reason,
      (SELECT history.reason FROM task_activity_events history
        WHERE history.task_id=w.id AND history.event_kind='delay'
        ORDER BY history.occurred_at DESC, history.id DESC LIMIT 1) AS latest_delay_reason
    FROM wbs_tasks w
    LEFT JOIN users a ON a.id = w.owner_user_id
    LEFT JOIN projects p ON p.id = w.project_id
    LEFT JOIN wbs_tasks parent ON parent.id = w.parent_task_id
    LEFT JOIN task_progress_entries today_log ON today_log.task_id=w.id AND today_log.entry_date=$1
    ORDER BY w.planned_start, w.id
  `, [date]);
  const dependencies = await db.select<WbsDependencyRow[]>(`
    SELECT dependency.task_id, dependency.prerequisite_task_id,
      prerequisite.title AS prerequisite_task_title,
      prerequisite.status AS prerequisite_task_status
    FROM wbs_task_dependencies dependency
    JOIN wbs_tasks prerequisite ON prerequisite.id=dependency.prerequisite_task_id
    ORDER BY dependency.task_id, prerequisite.planned_start, prerequisite.id
  `);
  const leaveRows = await db.select<UserLeaveRow[]>(`SELECT leave.id, leave.user_id,
    user.name AS user_name, leave.leave_date, leave.leave_type, leave.leave_unit, leave.reason,
    leave.customer_approved, leave.manager_approved, leave.workflow_approved, leave.created_at
    FROM user_leaves leave JOIN users user ON user.id=leave.user_id
    ORDER BY leave.leave_date, leave.id`) ?? [];
  const leavesByUser = new Map<number, UserLeave[]>();
  for (const row of leaveRows) leavesByUser.set(row.user_id, [...(leavesByUser.get(row.user_id) ?? []), mapUserLeave(row)]);
  const byTask = new Map<number, Array<{ id: number; title: string; status: WbsStatus }>>();
  for (const dependency of dependencies) {
    byTask.set(dependency.task_id, [...(byTask.get(dependency.task_id) ?? []), {
      id: dependency.prerequisite_task_id, title: dependency.prerequisite_task_title,
      status: dependency.prerequisite_task_status,
    }]);
  }
  return deriveParentProgress(rows.map((row) => {
    const task = mapTask(row, byTask.get(row.id) ?? []);
    const leaves = row.owner_user_id === null ? [] : leavesByUser.get(row.owner_user_id) ?? [];
    return leaves.length > 0 ? { ...task, ownerLeaves: leaves } : task;
  }));
}

export async function listDailyProgressSnapshots(date: string): Promise<DailyProgressSnapshot[]> {
  const db = await database();
  const rows = await db.select<Array<{
    task_id: number; daily_progress: number | null; cumulative_progress: number; note: string | null;
    latest_history_type: ActivityEventKind | null; latest_history_details: string | null;
    reschedule_reason: string | null; reschedule_reason_category: ReasonCategory | "" | null;
    delay_reason: string | null; delay_reason_category: ReasonCategory | "" | null; early_start_reason: string | null;
  }>>(`
    SELECT w.id AS task_id, exact_log.daily_progress, exact_log.note, exact_log.early_start_reason,
      COALESCE(
        (SELECT previous.cumulative_progress FROM task_progress_entries previous
          WHERE previous.task_id=w.id AND previous.entry_date<=$1
          ORDER BY previous.entry_date DESC LIMIT 1),
        CASE WHEN w.actual_end IS NOT NULL AND w.actual_end<=$1 THEN 100 ELSE 0 END
      ) AS cumulative_progress,
      (SELECT history.event_kind FROM task_activity_events history
        WHERE history.task_id=w.id AND history.event_kind<>'delay'
          AND date(history.occurred_at, 'localtime')=$1
        ORDER BY history.occurred_at DESC, history.id DESC LIMIT 1) AS latest_history_type,
      (SELECT history.details FROM task_activity_events history
        WHERE history.task_id=w.id AND history.event_kind<>'delay'
          AND date(history.occurred_at, 'localtime')=$1
        ORDER BY history.occurred_at DESC, history.id DESC LIMIT 1) AS latest_history_details,
      (SELECT history.reason FROM task_activity_events history
        WHERE history.task_id=w.id AND history.event_kind='rescheduled'
          AND date(history.occurred_at, 'localtime')=$1
        ORDER BY history.occurred_at DESC, history.id DESC LIMIT 1) AS reschedule_reason,
      (SELECT history.reason_category FROM task_activity_events history
        WHERE history.task_id=w.id AND history.event_kind='rescheduled'
          AND date(history.occurred_at, 'localtime')=$1
        ORDER BY history.occurred_at DESC, history.id DESC LIMIT 1) AS reschedule_reason_category,
      (SELECT history.reason FROM task_activity_events history
        WHERE history.task_id=w.id AND history.event_kind='delay'
          AND date(history.occurred_at, 'localtime')=$1
        ORDER BY history.occurred_at DESC, history.id DESC LIMIT 1) AS delay_reason,
      (SELECT history.reason_category FROM task_activity_events history
        WHERE history.task_id=w.id AND history.event_kind='delay'
          AND date(history.occurred_at, 'localtime')=$1
        ORDER BY history.occurred_at DESC, history.id DESC LIMIT 1) AS delay_reason_category
    FROM wbs_tasks w
    LEFT JOIN task_progress_entries exact_log
      ON exact_log.task_id=w.id AND exact_log.entry_date=$1
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
    rescheduleReasonCategory: row.reschedule_reason_category ?? "",
    delayReason: row.delay_reason ?? "",
    delayReasonCategory: row.delay_reason_category ?? "",
    earlyStartReason: row.early_start_reason ?? "",
  }));
}

export async function listRecordedProgressDates(taskId: number): Promise<string[]> {
  const db = await database();
  const rows = await db.select<Array<{ entry_date: string }>>(
    "SELECT entry_date FROM task_progress_entries WHERE task_id=$1 ORDER BY entry_date",
    [taskId],
  );
  return rows.map((row) => row.entry_date);
}

export async function createWbsTask(input: WbsTaskInput, changeReason?: { category: ReasonCategory; reason: string }): Promise<void> {
  validateTask(input);
  const normalizedChangeReason = changeReason?.reason.trim() ?? "";
  const changeReasonCategory = changeReason ? requireReasonCategory(changeReason.category) : "";
  if (changeReason && !normalizedChangeReason) throw new Error("サブタスク追加の理由を入力してください。");
  const db = await database();
  await validateProjectAssignment(db, input.projectId, input.ownerUserId);
  await validateParentTask(db, null, input.projectId, input.parentTaskId);
  const prerequisiteIds = normalizedPrerequisiteIds(input);
  await validatePrerequisiteTasks(db, null, input.projectId, input.parentTaskId, prerequisiteIds);
  const creationInput = { ...input, scheduleAssigned: true };
  const result = await db.execute(`
    INSERT INTO wbs_tasks
      (title, description, project_id, parent_task_id, owner_user_id, status, progress,
       country_code, planned_start, planned_end, business_days, schedule_assigned, actual_start, actual_end)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
  `, taskValues(creationInput));
  const taskId = Number(result.lastInsertId);
  await replaceTaskDependencies(db, taskId, prerequisiteIds);
  if (input.parentTaskId !== null) {
    await db.execute("INSERT INTO task_activity_events (task_id, owner_user_id, event_kind, reason_category, reason, details) SELECT id, owner_user_id, 'created', $2, $3, $4 FROM wbs_tasks WHERE id=$1", [
      input.parentTaskId, changeReasonCategory, normalizedChangeReason, `サブタスク「${input.title.trim()}」を追加しました。`,
    ]);
  }
}

export async function updateWbsTask(id: number, input: WbsTaskInput): Promise<void> {
  validateTask(input);
  const db = await database();
  await validateProjectAssignment(db, input.projectId, input.ownerUserId);
  await validateParentTask(db, id, input.projectId, input.parentTaskId);
  const prerequisiteIds = normalizedPrerequisiteIds(input);
  await validatePrerequisiteTasks(db, id, input.projectId, input.parentTaskId, prerequisiteIds);
  await validateChildProjects(db, id, input.projectId);
  await validateDependentHierarchy(db, id, input.projectId, input.parentTaskId);
  await validateFinalizedFields(db, id, input);
  await db.execute(`
    UPDATE wbs_tasks SET title=$1, description=$2, project_id=$3, parent_task_id=$4,
      owner_user_id=$5, status=$6, progress=$7, country_code=$8,
      planned_start=$9, planned_end=$10, business_days=$11, schedule_assigned=$12, actual_start=$13, actual_end=$14,
      updated_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id=$15
  `, [...taskValues(input), id]);
  await replaceTaskDependencies(db, id, prerequisiteIds);
}

export async function deleteWbsTask(id: number): Promise<void> {
  const db = await database();
  await db.execute("DELETE FROM task_activity_events WHERE task_id=$1", [id]);
  await db.execute("DELETE FROM task_progress_entries WHERE task_id=$1", [id]);
  await db.execute("DELETE FROM wbs_task_dependencies WHERE task_id=$1 OR prerequisite_task_id=$1", [id]);
  await db.execute("UPDATE wbs_tasks SET parent_task_id=NULL WHERE parent_task_id=$1", [id]);
  await db.execute("DELETE FROM wbs_tasks WHERE id=$1", [id]);
}

export async function finalizeWbsTask(taskId: number): Promise<void> {
  const db = await database();
  const rows = await db.select<Array<{ id: number; title: string; schedule_assigned: number }>>(`WITH RECURSIVE task_tree(id, title, schedule_assigned) AS (
      SELECT id, title, schedule_assigned FROM wbs_tasks WHERE id=$1
      UNION ALL
      SELECT child.id, child.title, child.schedule_assigned
      FROM wbs_tasks child JOIN task_tree ON child.parent_task_id=task_tree.id
    ) SELECT id, title, schedule_assigned FROM task_tree ORDER BY id`, [taskId]);
  if (!rows[0]) throw new Error("確定するタスクが見つかりません。");
  const unassigned = rows.find((task) => task.schedule_assigned !== 1);
  if (unassigned) throw new Error(`「${unassigned.title}」の日程を入力してから、親子の状態を確定してください。`);
  await db.execute(`WITH RECURSIVE task_tree(id) AS (
      SELECT id FROM wbs_tasks WHERE id=$1
      UNION ALL
      SELECT child.id FROM wbs_tasks child JOIN task_tree ON child.parent_task_id=task_tree.id
    ) UPDATE wbs_tasks SET finalized=1, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id IN (SELECT id FROM task_tree) AND finalized=0`, [taskId]);
}

export async function saveScheduleChanges(changes: Array<{ taskId: number; plannedStart: string; plannedEnd: string; businessDays: number; historyContext?: string }>, reason: string, reasonCategory: ReasonCategory | ""): Promise<void> {
  const normalizedReason = reason.trim();
  if (!normalizedReason) throw new Error("リスケ理由を入力してください。");
  const normalizedCategory = requireReasonCategory(reasonCategory);
  const db = await database();
  for (const change of changes) {
    const rows = await db.select<Array<{ planned_start: string; planned_end: string }>>("SELECT planned_start, planned_end FROM wbs_tasks WHERE id=$1", [change.taskId]);
    const before = rows[0];
    if (!before) throw new Error("変更対象のタスクが見つかりません。");
    await db.execute(`UPDATE wbs_tasks SET planned_start=$1, planned_end=$2, business_days=$3, schedule_assigned=1,
      updated_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id=$4`, [change.plannedStart, change.plannedEnd, change.businessDays, change.taskId]);
    const context = change.historyContext?.trim();
    const scheduleDetails = `${before.planned_start}〜${before.planned_end} → ${change.plannedStart}〜${change.plannedEnd}`;
    await db.execute("INSERT INTO task_activity_events (task_id, owner_user_id, event_kind, reason_category, reason, details) SELECT id, owner_user_id, 'rescheduled', $2, $3, $4 FROM wbs_tasks WHERE id=$1", [
      change.taskId, normalizedCategory, normalizedReason, context ? `${context}。${scheduleDetails}` : scheduleDetails,
    ]);
  }
}

export async function saveDailyProgress(taskId: number, date: string, dailyProgress: number, note: string, delayReason: string, earlyStartReason = "", delayReasonCategory: ReasonCategory | "" = "") {
  if (!Number.isFinite(dailyProgress) || dailyProgress < 0 || dailyProgress > 100) throw new Error("その日に進んだ進捗は0〜100%で入力してください。");
  const db = await database();
  const rows = await db.select<Array<{ progress: number; finalized: number; planned_start: string; planned_end: string; business_days: number; schedule_assigned: number; country_code: string; owner_user_id: number | null; previous_daily: number; child_count: number }>>(
    `SELECT w.progress, w.finalized, w.planned_start, w.planned_end, w.business_days, w.schedule_assigned, w.country_code, w.owner_user_id,
      COALESCE((SELECT daily_progress FROM task_progress_entries WHERE task_id=w.id AND entry_date=$2), 0) AS previous_daily,
      (SELECT COUNT(*) FROM wbs_tasks child WHERE child.parent_task_id=w.id) AS child_count
      FROM wbs_tasks w WHERE w.id=$1`,
    [taskId, date],
  );
  const task = rows[0];
  if (!task) throw new Error("進捗を記録するタスクが見つかりません。");
  if (task.schedule_assigned === 0) throw new Error("日程を入力してから進捗を記録してください。");
  if (task.child_count > 0) throw new Error("サブタスクを持つタスクには進捗を直接入力できません。");
  const logs = await db.select<Array<{ entry_date: string; cumulative_progress: number; daily_progress: number }>>(
    "SELECT entry_date, cumulative_progress, daily_progress FROM task_progress_entries WHERE task_id=$1 ORDER BY entry_date",
    [taskId],
  );
  const leaveRows = task.owner_user_id == null ? [] : await db.select<UserLeaveRow[]>(`SELECT leave.id, leave.user_id,
    user.name AS user_name, leave.leave_date, leave.leave_type, leave.leave_unit, leave.reason,
    leave.customer_approved, leave.manager_approved, leave.workflow_approved, leave.created_at
    FROM user_leaves leave JOIN users user ON user.id=leave.user_id WHERE leave.user_id=$1`, [task.owner_user_id]);
  const baselineProgress = logs.length > 0 ? Math.max(0, logs[0].cumulative_progress - logs[0].daily_progress) : task.progress;
  const dailyByDate = new Map(logs.map((log) => [log.entry_date, log.daily_progress]));
  dailyByDate.set(date, dailyProgress);
  let runningProgress = baselineProgress;
  const recalculated = [...dailyByDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([logDate, increment]) => {
    runningProgress = Math.min(100, runningProgress + increment);
    return { logDate, progress: runningProgress };
  });
  // dailyByDateには選択日を必ず追加するため、再計算結果と選択日の要素は必ず存在する。
  const selectedProgress = recalculated.find((log) => log.logDate === date)!.progress;
  const totalProgress = recalculated[recalculated.length - 1].progress;
  const expected = expectedProgress({ plannedStart: task.planned_start, plannedEnd: task.planned_end, businessDays: task.business_days, countryCode: task.country_code, ownerLeaves: leaveRows.map(mapUserLeave) }, date);
  const normalizedReason = delayReason.trim();
  const normalizedEarlyStartReason = earlyStartReason.trim();
  const incompletePrerequisites = await db.select<Array<{ title: string }>>(`
    SELECT prerequisite.title
    FROM wbs_task_dependencies dependency
    JOIN wbs_tasks prerequisite ON prerequisite.id=dependency.prerequisite_task_id
    WHERE dependency.task_id=$1 AND prerequisite.status<>'completed'
    ORDER BY prerequisite.planned_end, prerequisite.id
  `, [taskId]) ?? [];
  if (task.finalized === 1 && selectedProgress < expected && !normalizedReason) throw new Error("計画進捗を下回る理由を入力してください。");
  const normalizedDelayCategory = task.finalized === 1 && selectedProgress < expected ? requireReasonCategory(delayReasonCategory) : "";
  if (dailyProgress > 0 && incompletePrerequisites.length > 0 && !normalizedEarlyStartReason) {
    throw new Error("完了前提タスクの完了前に開始した理由を入力してください。");
  }
  await db.execute(`
    INSERT INTO task_progress_entries (task_id, entry_date, cumulative_progress, note, daily_progress, early_start_reason)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT(task_id, entry_date) DO UPDATE SET cumulative_progress=excluded.cumulative_progress,
      note=excluded.note, daily_progress=excluded.daily_progress, early_start_reason=excluded.early_start_reason,
      updated_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  `, [taskId, date, selectedProgress, note.trim(), dailyProgress, dailyProgress > 0 ? normalizedEarlyStartReason : ""]);
  for (const log of recalculated.filter((log) => log.logDate > date)) {
    await db.execute("UPDATE task_progress_entries SET cumulative_progress=$1, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE task_id=$2 AND entry_date=$3", [log.progress, taskId, log.logDate]);
  }
  await db.execute(`
    UPDATE wbs_tasks SET progress=$1,
      status=CASE WHEN $1=100 THEN 'completed' WHEN $1>0 THEN 'in_progress' ELSE 'not_started' END,
      actual_end=CASE WHEN $1=100 THEN COALESCE(actual_end, $2) ELSE NULL END,
      updated_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id=$3
  `, [totalProgress, date, taskId]);
  await db.execute("INSERT INTO task_activity_events (task_id, owner_user_id, event_kind, details) SELECT id, owner_user_id, 'progress', $2 FROM wbs_tasks WHERE id=$1", [taskId, `${date} +${dailyProgress}% / 当日累計 ${selectedProgress}% / 計画 ${expected}%${note.trim() ? `\n${note.trim()}` : ""}`]);
  if (task.finalized === 1 && selectedProgress < expected) {
    await db.execute("INSERT INTO task_activity_events (task_id, owner_user_id, event_kind, reason_category, reason, details) SELECT id, owner_user_id, 'delay', $2, $3, $4 FROM wbs_tasks WHERE id=$1", [taskId, normalizedDelayCategory, normalizedReason, `${date}時点の累計進捗 ${selectedProgress}%（計画 ${expected}%）`]);
  }
}

export async function listTaskActivity(taskId: number): Promise<ActivityEvent[]> {
  const db = await database();
  const rows = await db.select<ActivityEventRow[]>(`SELECT id, task_id, owner_user_id, event_kind, reason_category, reason, details, occurred_at
    FROM task_activity_events WHERE task_id=$1 ORDER BY occurred_at ASC, id ASC`, [taskId]);
  return rows.map((row) => ({ id: row.id, taskId: row.task_id, ownerUserId: row.owner_user_id, type: row.event_kind, reasonCategory: row.reason_category, reason: row.reason, details: row.details, occurredAt: row.occurred_at }));
}

export async function listTaskTreeActivity(taskId: number): Promise<TaskTreeHistoryEntry[]> {
  const db = await database();
  const rows = await db.select<TaskTreeHistoryRow[]>(`WITH RECURSIVE task_tree(id, title, depth) AS (
      SELECT id, title, 0 FROM wbs_tasks WHERE id=$1
      UNION ALL
      SELECT child.id, child.title, task_tree.depth + 1
      FROM wbs_tasks child JOIN task_tree ON child.parent_task_id=task_tree.id
    )
    SELECT history.id, history.task_id, history.owner_user_id, history.event_kind, history.reason_category, history.reason, history.details,
      history.occurred_at, task_tree.title AS task_title, task_tree.depth
    FROM task_tree JOIN task_activity_events history ON history.task_id=task_tree.id
    ORDER BY history.occurred_at DESC, history.id DESC`, [taskId]);
  return rows.map((row) => ({
    id: row.id, taskId: row.task_id, ownerUserId: row.owner_user_id, type: row.event_kind, reasonCategory: row.reason_category, reason: row.reason,
    details: row.details, occurredAt: row.occurred_at, taskTitle: row.task_title, depth: row.depth,
  }));
}

export async function listUsers(): Promise<UserProfile[]> {
  const db = await database();
  const rows = await db.select<UserRow[]>(`SELECT id, name, email, birthday, department,
    role, timezone, interests, skills, work_style, notes
    FROM users ORDER BY name COLLATE NOCASE`);
  return rows.map((row) => ({
    id: row.id, name: row.name, email: row.email, birthday: row.birthday,
    department: row.department, role: row.role, timezone: row.timezone,
    interests: row.interests, skills: row.skills, workStyle: row.work_style, notes: row.notes,
  }));
}

export async function createUser(input: UserProfileInput): Promise<void> {
  validateUserProfile(input.name, input.email);
  const db = await database();
  await db.execute(`INSERT INTO users
    (name, email, birthday, department, role, timezone, interests, skills, work_style, notes)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, userValues(input));
}

export async function updateUser(id: number, input: UserProfileInput): Promise<void> {
  validateUserProfile(input.name, input.email);
  const db = await database();
  await db.execute(`UPDATE users SET name=$1, email=$2, birthday=$3,
    department=$4, role=$5, timezone=$6, interests=$7, skills=$8,
    work_style=$9, notes=$10, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id=$11`, [...userValues(input), id]);
}

export async function deleteUser(id: number): Promise<void> {
  const db = await database();
  await db.execute("UPDATE wbs_tasks SET owner_user_id=NULL WHERE owner_user_id=$1", [id]);
  await db.execute("DELETE FROM project_members WHERE user_id=$1", [id]);
  await db.execute("DELETE FROM users WHERE id=$1", [id]);
}

export async function listUserLeaves(): Promise<UserLeave[]> {
  const db = await database();
  const rows = await db.select<UserLeaveRow[]>(`SELECT leave.id, leave.user_id,
    user.name AS user_name, leave.leave_date, leave.leave_type, leave.leave_unit, leave.reason,
    leave.customer_approved, leave.manager_approved, leave.workflow_approved, leave.created_at
    FROM user_leaves leave JOIN users user ON user.id=leave.user_id
    ORDER BY leave.leave_date DESC, leave.id DESC`);
  return rows.map(mapUserLeave);
}

export async function createUserLeave(input: UserLeaveInput): Promise<void> {
  validateUserLeave(input);
  const db = await database();
  await db.execute(`INSERT INTO user_leaves (user_id, leave_date, leave_type, leave_unit, reason,
    customer_approved, manager_approved, workflow_approved)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [input.userId, input.date, input.type, input.unit, input.reason.trim(),
    input.customerApproved ? 1 : 0, input.managerApproved ? 1 : 0, input.workflowApproved ? 1 : 0]);
}

export async function updateUserLeave(id: number, input: UserLeaveInput): Promise<void> {
  validateUserLeave(input);
  const db = await database();
  await db.execute(`UPDATE user_leaves SET user_id=$1, leave_date=$2, leave_type=$3,
    leave_unit=$4, reason=$5, customer_approved=$6, manager_approved=$7, workflow_approved=$8,
    updated_at=strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id=$9`,
  [input.userId, input.date, input.type, input.unit, input.reason.trim(), input.customerApproved ? 1 : 0,
    input.managerApproved ? 1 : 0, input.workflowApproved ? 1 : 0, id]);
}

export async function deleteUserLeave(id: number): Promise<void> {
  const db = await database();
  await db.execute("DELETE FROM user_leaves WHERE id=$1", [id]);
}

export async function getSettings(): Promise<AppSettings> {
  const db = await database();
  const rows = await db.select<SettingsRow[]>("SELECT country_code, notification_time, notifications_enabled, last_notified_date, daily_report_ancestor_depth FROM app_settings WHERE id=1");
  const row = rows[0];
  return {
    countryCode: row?.country_code ?? "JP",
    notificationTime: row?.notification_time ?? "17:30",
    notificationsEnabled: row?.notifications_enabled === 1,
    lastNotifiedDate: row?.last_notified_date ?? null,
    dailyReportAncestorDepth: row?.daily_report_ancestor_depth ?? 3,
  };
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  if (!Number.isInteger(settings.dailyReportAncestorDepth) || settings.dailyReportAncestorDepth < 0 || settings.dailyReportAncestorDepth > 10) {
    throw new Error("前日作業報告の親階層数は0から10の整数で指定してください。");
  }
  const db = await database();
  await db.execute(`UPDATE app_settings SET country_code=$1, notification_time=$2,
    notifications_enabled=$3, last_notified_date=$4, daily_report_ancestor_depth=$5 WHERE id=1`, [
    settings.countryCode, settings.notificationTime, settings.notificationsEnabled ? 1 : 0,
    settings.lastNotifiedDate, settings.dailyReportAncestorDepth,
  ]);
}

function mapTask(row: WbsTaskRow, dependencies: Array<{ id: number; title: string; status: WbsStatus }>): WbsTask {
  return {
    id: row.id, title: row.title, description: row.description,
    projectId: row.project_id, projectName: row.project_name,
    parentTaskId: row.parent_task_id, parentTaskTitle: row.parent_task_title,
    prerequisiteTaskIds: dependencies.map((item) => item.id), prerequisiteTasks: dependencies,
    ownerUserId: row.owner_user_id, ownerUserName: row.owner_user_name, status: row.status,
    progress: row.progress, countryCode: row.country_code, plannedStart: row.planned_start,
    plannedEnd: row.planned_end, businessDays: row.business_days, scheduleAssigned: row.schedule_assigned !== 0,
    actualStart: row.actual_start, actualEnd: row.actual_end, finalized: row.finalized === 1,
    todayDailyProgress: row.today_daily_progress,
    todayProgressNote: row.today_progress_note ?? "",
    todayEarlyStartReason: row.today_early_start_reason ?? "",
    latestDelayReason: row.latest_delay_reason ?? "",
  };
}

function localISODate() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function taskValues(input: WbsTaskInput): unknown[] {
  return [input.title.trim(), input.description.trim(), input.projectId, input.parentTaskId, input.ownerUserId,
    input.status, input.progress, input.countryCode, input.plannedStart, input.plannedEnd,
    input.businessDays, input.scheduleAssigned === false ? 0 : 1, input.actualStart || null, input.actualEnd || null];
}

function validateTask(input: WbsTaskInput) {
  if (!input.title.trim()) throw new Error("タスク名を入力してください。");
  if (!input.plannedStart || !input.plannedEnd) throw new Error("予定日を入力してください。");
  if (input.businessDays < 1) throw new Error("営業日数は1日以上にしてください。");
}

function validateUserProfile(name: string, email: string) {
  if (!name.trim()) throw new Error("氏名を入力してください。");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) throw new Error("有効なメールアドレスを入力してください。");
}

function userValues(input: UserProfileInput): unknown[] {
  return [input.name.trim(), input.email.trim(), input.birthday || null,
    input.department.trim(), input.role.trim(), input.timezone.trim(),
    input.interests.trim(), input.skills.trim(), input.workStyle.trim(), input.notes.trim()];
}

function validateUserLeave(input: UserLeaveInput) {
  if (!Number.isInteger(input.userId) || input.userId < 1) throw new Error("休暇を登録するユーザーを選択してください。");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error("休暇日を入力してください。");
  if (!(["planned", "unplanned"] as const).includes(input.type)) throw new Error("休暇種別を選択してください。");
  if (!(["full_day", "morning", "afternoon"] as const).includes(input.unit)) throw new Error("取得単位を選択してください。");
  if (input.type === "unplanned" && !input.reason.trim()) throw new Error("計画外休暇の理由を入力してください。");
}

function mapUserLeave(row: UserLeaveRow): UserLeave {
  return {
    id: row.id, userId: row.user_id, userName: row.user_name, date: row.leave_date,
    type: row.leave_type, unit: row.leave_unit, reason: row.reason,
    customerApproved: row.customer_approved === 1, managerApproved: row.manager_approved === 1,
    workflowApproved: row.workflow_approved === 1, createdAt: row.created_at,
  };
}

async function validateProjectAssignment(db: Database, projectId: number | null, ownerUserId: number | null) {
  if (projectId === null || ownerUserId === null) return;
  const rows = await db.select<Array<{ count: number }>>(
    "SELECT COUNT(*) AS count FROM project_members WHERE project_id=$1 AND user_id=$2",
    [projectId, ownerUserId],
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

function normalizedPrerequisiteIds(input: Pick<WbsTaskInput, "prerequisiteTaskIds">): number[] {
  const values = input.prerequisiteTaskIds ?? [];
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
