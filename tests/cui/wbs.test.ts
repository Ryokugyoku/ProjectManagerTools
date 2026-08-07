import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ select: vi.fn(), execute: vi.fn() }));
vi.mock("@tauri-apps/plugin-sql", () => ({ default: { load: vi.fn(async () => db) } }));

import {
  createAssignee, createWbsTask, deleteAssignee, deleteWbsTask, getSettings,
  finalizeWbsTask, listAssignees, listTaskHistory, listTaskTreeHistory, listWbsTasks, saveDailyProgress, saveScheduleChanges, saveSettings, updateAssignee,
  updateWbsTask, type AppSettings, type UserProfileInput, type WbsTaskInput,
} from "../../src/lib/wbs";

const task: WbsTaskInput = {
  title: " 設計 ", description: " 詳細 ", projectId: null, parentTaskId: null, assigneeId: null,
  status: "not_started", progress: 0, countryCode: "JP", plannedStart: "2026-08-06",
  plannedEnd: "2026-08-13", businessDays: 5, actualStart: null, actualEnd: null,
};
const user: UserProfileInput = {
  name: " 山田 太郎 ", email: " taro@example.com ", birthday: "1990-01-02",
  department: " 開発 ", role: " PM ", timezone: " Asia/Tokyo ", interests: " 読書 ",
  skills: " 計画 ", workStyle: " 朝型 ", notes: " メモ ",
};

beforeEach(() => { db.select.mockReset(); db.execute.mockReset(); db.execute.mockResolvedValue({ rowsAffected: 1 }); });

describe("WBS data methods", () => {
  it("maps WBS rows including project and assignee", async () => {
    db.select.mockResolvedValue([{ id: 1, title: "設計", description: "", project_id: 2, project_name: "案件", parent_task_id: 5, parent_task_title: "要件定義", assignee_id: 3, assignee_name: "山田", status: "in_progress", progress: 40, country_code: "JP", planned_start: "2026-08-06", planned_end: "2026-08-13", business_days: 5, actual_start: "2026-08-06", actual_end: null, finalized: 1, today_daily_progress: 10, today_progress_note: "確認済み", latest_delay_reason: "レビュー待ち" }]);
    expect(await listWbsTasks("2026-08-07")).toEqual([{ id: 1, title: "設計", description: "", projectId: 2, projectName: "案件", parentTaskId: 5, parentTaskTitle: "要件定義", assigneeId: 3, assigneeName: "山田", status: "in_progress", progress: 40, countryCode: "JP", plannedStart: "2026-08-06", plannedEnd: "2026-08-13", businessDays: 5, actualStart: "2026-08-06", actualEnd: null, finalized: true, todayDailyProgress: 10, todayProgressNote: "確認済み", latestDelayReason: "レビュー待ち" }]);
    expect(db.select).toHaveBeenCalledWith(expect.stringContaining("today_log.log_date=$1"), ["2026-08-07"]);
  });

  it("uses the current local date when loading today's progress by default", async () => {
    db.select.mockResolvedValue([]);
    await listWbsTasks();
    expect(db.select.mock.calls[0][1][0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("creates an unassigned WBS and trims text", async () => {
    await createWbsTask(task);
    expect(db.execute).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO wbs_tasks"), expect.arrayContaining(["設計", "詳細"]));
  });

  it("creates and updates a WBS only when the assignee belongs to the project", async () => {
    db.select.mockResolvedValueOnce([{ count: 1 }]);
    await createWbsTask({ ...task, projectId: 4, assigneeId: 8 });
    db.select.mockResolvedValueOnce([{ count: 1 }]).mockResolvedValueOnce([{ invalid_children: 0 }]).mockResolvedValueOnce([{ finalized: 0 }]);
    await updateWbsTask(9, { ...task, projectId: 4, assigneeId: 8 });
    expect(db.select).toHaveBeenCalledTimes(4);
    expect(db.execute).toHaveBeenCalledTimes(2);
  });

  it("creates a child task only when its parent belongs to the same project", async () => {
    db.select.mockResolvedValue([{ parent_project_id: 4, is_descendant: 0 }]);
    await createWbsTask({ ...task, projectId: 4, parentTaskId: 7 });
    expect(db.execute).toHaveBeenCalledWith(expect.stringContaining("parent_task_id"), expect.arrayContaining([4, 7]));
    expect(db.execute).toHaveBeenCalledWith(expect.stringContaining("'created'"), [7, "サブタスク「設計」を追加しました。"]);

    db.select.mockResolvedValue([{ parent_project_id: 5, is_descendant: 0 }]);
    await expect(createWbsTask({ ...task, projectId: 4, parentTaskId: 7 })).rejects.toThrow("同じ案件");
  });

  it("rejects self-parenting and descendant-parent cycles", async () => {
    await expect(updateWbsTask(7, { ...task, projectId: 4, parentTaskId: 7 })).rejects.toThrow("自身");
    db.select.mockResolvedValue([{ parent_project_id: 4, is_descendant: 1 }]);
    await expect(updateWbsTask(7, { ...task, projectId: 4, parentTaskId: 9 })).rejects.toThrow("子孫");
  });

  it("rejects moving a task away from children in another project", async () => {
    db.select.mockResolvedValue([{ invalid_children: 1 }]);
    await expect(updateWbsTask(7, { ...task, projectId: 4 })).rejects.toThrow("子タスク");
  });

  it("rejects direct schedule and progress changes after finalization", async () => {
    const current = { finalized: 1, planned_start: task.plannedStart, planned_end: task.plannedEnd, business_days: task.businessDays, progress: task.progress };
    db.select.mockResolvedValueOnce([{ invalid_children: 0 }]).mockResolvedValueOnce([current]);
    await expect(updateWbsTask(7, { ...task, plannedStart: "2026-08-07" })).rejects.toThrow("リスケ理由");
    db.select.mockResolvedValueOnce([{ invalid_children: 0 }]).mockResolvedValueOnce([current]);
    await expect(updateWbsTask(7, { ...task, progress: 10 })).rejects.toThrow("今日進んだ進捗");
  });

  it("rejects invalid WBS input and an out-of-project assignee", async () => {
    await expect(createWbsTask({ ...task, title: "" })).rejects.toThrow("タスク名");
    await expect(createWbsTask({ ...task, plannedStart: "" })).rejects.toThrow("予定日");
    await expect(createWbsTask({ ...task, businessDays: 0 })).rejects.toThrow("1日以上");
    db.select.mockResolvedValue([{ count: 0 }]);
    await expect(updateWbsTask(1, { ...task, projectId: 4, assigneeId: 9 })).rejects.toThrow("案件のメンバー");
  });

  it("detaches child tasks between deleting progress logs and the task", async () => {
    await deleteWbsTask(7);
    expect(db.execute.mock.calls.map((call) => call[0])).toEqual([expect.stringContaining("wbs_work_history"), expect.stringContaining("wbs_progress_logs"), expect.stringContaining("parent_task_id=NULL"), expect.stringContaining("DELETE FROM wbs_tasks")]);
  });

  it("upserts daily progress and updates the WBS", async () => {
    db.select.mockResolvedValue([{ progress: 40, previous_daily: 0, finalized: 1, planned_start: "2026-08-03", planned_end: "2026-08-14", business_days: 10, country_code: "JP", child_count: 0 }]);
    await saveDailyProgress(7, "2026-08-07", 20, " 進捗 ", "");
    expect(db.execute).toHaveBeenNthCalledWith(1, expect.stringContaining("wbs_progress_logs"), [7, "2026-08-07", 60, "進捗", 20]);
    expect(db.execute).toHaveBeenCalledTimes(3);
  });

  it("rejects daily progress for a task that owns subtasks", async () => {
    db.select.mockResolvedValue([{ progress: 40, previous_daily: 0, finalized: 1, planned_start: "2026-08-03", planned_end: "2026-08-14", business_days: 10, country_code: "JP", child_count: 2 }]);
    await expect(saveDailyProgress(7, "2026-08-07", 10, "", "")).rejects.toThrow("サブタスクを持つ");
    expect(db.execute).not.toHaveBeenCalled();
  });

  it("requires and records a delay reason when cumulative progress is below plan", async () => {
    const stored = { progress: 20, previous_daily: 0, finalized: 1, planned_start: "2026-08-03", planned_end: "2026-08-14", business_days: 10, country_code: "JP", child_count: 0 };
    db.select.mockResolvedValue([stored]);
    await expect(saveDailyProgress(7, "2026-08-07", 5, "", "")).rejects.toThrow("理由");
    await saveDailyProgress(7, "2026-08-07", 5, "確認中", "仕様確認待ち");
    expect(db.execute).toHaveBeenCalledTimes(4);
    expect(db.execute).toHaveBeenLastCalledWith(expect.stringContaining("'delay'"), [7, "仕様確認待ち", "累計進捗 25%（計画 50%）"]);
  });

  it("replaces today's increment instead of adding it twice", async () => {
    db.select.mockResolvedValue([{ progress: 60, previous_daily: 20, finalized: 0, planned_start: "2026-08-03", planned_end: "2026-08-14", business_days: 10, country_code: "JP", child_count: 0 }]);
    await saveDailyProgress(7, "2026-08-07", 10, "訂正", "");
    expect(db.execute).toHaveBeenNthCalledWith(1, expect.stringContaining("wbs_progress_logs"), [7, "2026-08-07", 50, "訂正", 10]);
  });

  it("finalizes tasks and persists reasoned schedule history", async () => {
    await finalizeWbsTask(7);
    expect(db.execute).toHaveBeenCalledTimes(2);
    db.execute.mockClear();
    await expect(saveScheduleChanges([{ taskId: 7, plannedStart: "2026-08-07", plannedEnd: "2026-08-14", businessDays: 5 }], " ")).rejects.toThrow("リスケ理由");
    db.select.mockResolvedValue([{ planned_start: "2026-08-06", planned_end: "2026-08-13" }]);
    await saveScheduleChanges([{ taskId: 7, plannedStart: "2026-08-07", plannedEnd: "2026-08-14", businessDays: 5 }], " 顧客都合 ");
    expect(db.execute).toHaveBeenCalledTimes(2);
    expect(db.execute).toHaveBeenLastCalledWith(expect.stringContaining("'rescheduled'"), [7, "顧客都合", "2026-08-06〜2026-08-13 → 2026-08-07〜2026-08-14"]);
    db.execute.mockClear();
    await saveScheduleChanges([{ taskId: 8, plannedStart: "2026-08-08", plannedEnd: "2026-08-15", businessDays: 5, historyContext: "親タスク「親」の移動に連動" }], " 顧客都合 ");
    expect(db.execute).toHaveBeenLastCalledWith(expect.stringContaining("'rescheduled'"), [8, "顧客都合", "親タスク「親」の移動に連動。2026-08-06〜2026-08-13 → 2026-08-08〜2026-08-15"]);
  });

  it("loads work history in chronological order", async () => {
    db.select.mockResolvedValue([{ id: 2, task_id: 7, event_type: "delay", reason: "待ち", details: "20%", occurred_at: "2026-08-06T01:00:00Z" }]);
    expect(await listTaskHistory(7)).toEqual([{ id: 2, taskId: 7, type: "delay", reason: "待ち", details: "20%", occurredAt: "2026-08-06T01:00:00Z" }]);
    expect(db.select).toHaveBeenCalledWith(expect.stringContaining("ORDER BY occurred_at ASC"), [7]);
  });

  it("loads the selected task and descendant history with source context", async () => {
    db.select.mockResolvedValue([{ id: 3, task_id: 8, event_type: "progress", reason: "", details: "累計 50%", occurred_at: "2026-08-07T01:00:00Z", task_title: "実装", depth: 1 }]);
    expect(await listTaskTreeHistory(7)).toEqual([{ id: 3, taskId: 8, type: "progress", reason: "", details: "累計 50%", occurredAt: "2026-08-07T01:00:00Z", taskTitle: "実装", depth: 1 }]);
    expect(db.select).toHaveBeenCalledWith(expect.stringContaining("WITH RECURSIVE task_tree"), [7]);
  });
});

describe("user and settings data methods", () => {
  it("maps user profile rows", async () => {
    db.select.mockResolvedValue([{ id: 1, name: "山田", email: "taro@example.com", birthday: null, department: "開発", role: "PM", timezone: "Asia/Tokyo", interests: "読書", skills: "計画", work_style: "朝型", notes: "" }]);
    expect((await listAssignees())[0]).toMatchObject({ name: "山田", workStyle: "朝型" });
  });

  it("creates and updates a valid user", async () => {
    await createAssignee(user);
    await updateAssignee(1, user);
    expect(db.execute).toHaveBeenCalledTimes(2);
    expect(db.execute.mock.calls[0][1][0]).toBe("山田 太郎");
  });

  it("rejects missing name and invalid email", async () => {
    await expect(createAssignee({ ...user, name: "" })).rejects.toThrow("氏名");
    await expect(updateAssignee(1, { ...user, email: "invalid" })).rejects.toThrow("メールアドレス");
  });

  it("detaches and deletes a user", async () => {
    await deleteAssignee(3);
    expect(db.execute).toHaveBeenCalledTimes(3);
  });

  it("loads stored settings and defaults when absent", async () => {
    db.select.mockResolvedValueOnce([{ country_code: "US", notification_time: "09:00", notifications_enabled: 1, last_notified_date: "2026-08-06" }]);
    expect(await getSettings()).toEqual({ countryCode: "US", notificationTime: "09:00", notificationsEnabled: true, lastNotifiedDate: "2026-08-06" });
    db.select.mockResolvedValueOnce([]);
    expect(await getSettings()).toEqual({ countryCode: "JP", notificationTime: "17:30", notificationsEnabled: false, lastNotifiedDate: null });
  });

  it("saves settings using SQLite values", async () => {
    const settings: AppSettings = { countryCode: "GB", notificationTime: "18:00", notificationsEnabled: true, lastNotifiedDate: null };
    await saveSettings(settings);
    expect(db.execute).toHaveBeenCalledWith(expect.stringContaining("UPDATE app_settings"), ["GB", "18:00", 1, null]);
  });
});
