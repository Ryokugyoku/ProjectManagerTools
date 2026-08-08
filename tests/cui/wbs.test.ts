import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ select: vi.fn(), execute: vi.fn() }));
vi.mock("@tauri-apps/plugin-sql", () => ({ default: { load: vi.fn(async () => db) } }));

import {
  createUser, createUserLeave, createWbsTask, deleteUser, deleteUserLeave, deleteWbsTask, getSettings,
  finalizeWbsTask, listUsers, listDailyProgressSnapshots, listRecordedProgressDates, listTaskActivity, listTaskTreeActivity, listUserLeaves, listWbsTasks, saveDailyProgress, saveScheduleChanges, saveSettings, updateUser, updateUserLeave,
  updateWbsTask, type AppSettings, type UserProfileInput, type WbsTaskInput,
} from "../../src/lib/wbs";

const task: WbsTaskInput = {
  title: " 設計 ", description: " 詳細 ", projectId: null, parentTaskId: null, ownerUserId: null,
  status: "not_started", progress: 0, countryCode: "JP", plannedStart: "2026-08-06",
  plannedEnd: "2026-08-13", businessDays: 5, actualStart: null, actualEnd: null,
};
const user: UserProfileInput = {
  name: " 山田 太郎 ", email: " taro@example.com ", birthday: "1990-01-02",
  department: " 開発 ", role: " PM ", timezone: " Asia/Tokyo ", interests: " 読書 ",
  skills: " 計画 ", workStyle: " 朝型 ", notes: " メモ ",
};

beforeEach(() => { db.select.mockReset(); db.execute.mockReset(); db.execute.mockResolvedValue({ rowsAffected: 1, lastInsertId: 99 }); });

describe("WBS data methods", () => {
  it("maps WBS rows including project and user", async () => {
    db.select.mockResolvedValueOnce([{ id: 1, title: "設計", description: "", project_id: 2, project_name: "案件", parent_task_id: 5, parent_task_title: "要件定義", owner_user_id: 3, owner_user_name: "山田", status: "in_progress", progress: 40, country_code: "JP", planned_start: "2026-08-06", planned_end: "2026-08-13", business_days: 5, actual_start: "2026-08-06", actual_end: null, finalized: 1, today_daily_progress: 10, today_progress_note: "確認済み", latest_delay_reason: "レビュー待ち" }])
      .mockResolvedValueOnce([{ task_id: 1, prerequisite_task_id: 6, prerequisite_task_title: "基盤", prerequisite_task_status: "completed" }, { task_id: 1, prerequisite_task_id: 7, prerequisite_task_title: "デザイン", prerequisite_task_status: "in_progress" }])
      .mockResolvedValueOnce([]);
    expect(await listWbsTasks("2026-08-07")).toEqual([{ id: 1, title: "設計", description: "", projectId: 2, projectName: "案件", parentTaskId: 5, parentTaskTitle: "要件定義", prerequisiteTaskIds: [6, 7], prerequisiteTasks: [{ id: 6, title: "基盤", status: "completed" }, { id: 7, title: "デザイン", status: "in_progress" }], ownerUserId: 3, ownerUserName: "山田", status: "in_progress", progress: 40, countryCode: "JP", plannedStart: "2026-08-06", plannedEnd: "2026-08-13", businessDays: 5, scheduleAssigned: true, actualStart: "2026-08-06", actualEnd: null, finalized: true, todayDailyProgress: 10, todayProgressNote: "確認済み", todayEarlyStartReason: "", latestDelayReason: "レビュー待ち" }]);
    expect(db.select).toHaveBeenCalledWith(expect.stringContaining("today_log.entry_date=$1"), ["2026-08-07"]);
  });

  it("maps nullable fields, dependency rows, and user leave states", async () => {
    const baseRow = {
      id: 1, title: "設計", description: "", project_id: 2, project_name: "案件",
      parent_task_id: null, parent_task_title: null,
      owner_user_id: null, owner_user_name: null, status: "not_started", progress: 0, country_code: "JP",
      planned_start: "2026-08-06", planned_end: "2026-08-13", business_days: 5,
      actual_start: null, actual_end: null, finalized: 0, today_daily_progress: null,
      today_progress_note: null, latest_delay_reason: null,
    };
    db.select.mockResolvedValueOnce([
      baseRow,
      { ...baseRow, id: 2, owner_user_id: 3, owner_user_name: "山田" },
    ]).mockResolvedValueOnce([{ task_id: 2, prerequisite_task_id: 8, prerequisite_task_title: "基盤", prerequisite_task_status: "not_started" }]).mockResolvedValueOnce([
      { id: 4, user_id: 3, user_name: "山田", leave_date: "2026-08-12", leave_type: "planned", leave_unit: "full_day", reason: "", customer_approved: 0, manager_approved: 0, workflow_approved: 0, created_at: "2026-08-01T00:00:00Z" },
      { id: 5, user_id: 3, user_name: "山田", leave_date: "2026-08-13", leave_type: "planned", leave_unit: "morning", reason: "", customer_approved: 1, manager_approved: 1, workflow_approved: 1, created_at: "2026-08-01T00:00:00Z" },
    ]);

    const result = await listWbsTasks("2026-08-07");
    expect(result[0]).toMatchObject({ prerequisiteTasks: [], ownerUserId: null, todayProgressNote: "", latestDelayReason: "" });
    expect(result[1]).toMatchObject({
      prerequisiteTasks: [{ id: 8, title: "基盤", status: "not_started" }],
      ownerLeaves: [expect.objectContaining({ id: 4 }), expect.objectContaining({ id: 5 })],
    });
  });

  it("treats a missing leave query result as no leave", async () => {
    db.select.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce(null);
    expect(await listWbsTasks("2026-08-07")).toEqual([]);
  });

  it("uses the current local date when loading today's progress by default", async () => {
    db.select.mockResolvedValue([]);
    await listWbsTasks();
    expect(db.select.mock.calls[0][1][0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("loads the exact day's work and the latest cumulative progress up to that date", async () => {
    db.select.mockResolvedValue([{ task_id: 7, daily_progress: 15, cumulative_progress: 55, note: "レビュー完了", latest_history_type: "progress", latest_history_details: "今日 +15% / 累計 55%", reschedule_reason: "顧客都合", reschedule_reason_category: "external_dependency", delay_reason: "回答待ち", delay_reason_category: "requirement_change", early_start_reason: "先行調査" }]);
    expect(await listDailyProgressSnapshots("2026-08-07")).toEqual([{ taskId: 7, date: "2026-08-07", dailyProgress: 15, cumulativeProgress: 55, note: "レビュー完了", latestHistoryType: "progress", latestHistoryDetails: "今日 +15% / 累計 55%", rescheduleReason: "顧客都合", rescheduleReasonCategory: "external_dependency", delayReason: "回答待ち", delayReasonCategory: "requirement_change", earlyStartReason: "先行調査" }]);
    expect(db.select).toHaveBeenCalledWith(expect.stringContaining("previous.entry_date<=$1"), ["2026-08-07"]);
    expect(db.select).toHaveBeenCalledWith(expect.stringContaining("exact_log.entry_date=$1"), ["2026-08-07"]);
    expect(db.select).toHaveBeenCalledWith(expect.stringContaining("date(history.occurred_at, 'localtime')=$1"), ["2026-08-07"]);
    expect(db.select).toHaveBeenCalledWith(expect.stringContaining("history.event_kind='rescheduled'"), ["2026-08-07"]);
  });

  it("maps absent daily snapshot text to empty strings", async () => {
    db.select.mockResolvedValue([{ task_id: 7, daily_progress: null, cumulative_progress: 0, note: null, latest_history_type: null, latest_history_details: null, reschedule_reason: null, delay_reason: null }]);
    expect(await listDailyProgressSnapshots("2026-08-07")).toEqual([{
      taskId: 7, date: "2026-08-07", dailyProgress: null, cumulativeProgress: 0,
      note: "", latestHistoryType: null, latestHistoryDetails: "", rescheduleReason: "", rescheduleReasonCategory: "", delayReason: "", delayReasonCategory: "", earlyStartReason: "",
    }]);
  });

  it("lists recorded progress dates for a task", async () => {
    db.select.mockResolvedValue([{ entry_date: "2026-08-05" }, { entry_date: "2026-08-07" }]);
    expect(await listRecordedProgressDates(7)).toEqual(["2026-08-05", "2026-08-07"]);
    expect(db.select).toHaveBeenCalledWith(expect.stringContaining("ORDER BY entry_date"), [7]);
  });

  it("creates an unassigned WBS and trims text", async () => {
    await createWbsTask(task);
    expect(db.execute).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO wbs_tasks"), expect.arrayContaining(["設計", "詳細"]));
  });

  it("creates and updates a WBS only when the user belongs to the project", async () => {
    db.select.mockResolvedValueOnce([{ count: 1 }]);
    await createWbsTask({ ...task, projectId: 4, ownerUserId: 8 });
    db.select.mockResolvedValueOnce([{ count: 1 }]).mockResolvedValueOnce([{ invalid_children: 0 }]).mockResolvedValueOnce([{ invalid_dependents: 0 }]).mockResolvedValueOnce([{ finalized: 0 }]);
    await updateWbsTask(9, { ...task, projectId: 4, ownerUserId: 8, scheduleAssigned: false });
    expect(db.select).toHaveBeenCalledTimes(5);
    expect(db.execute).toHaveBeenCalledTimes(4);
  });

  it("creates a scheduled child task only when its parent belongs to the same project", async () => {
    db.select.mockResolvedValue([{ parent_project_id: 4, is_descendant: 0 }]);
    await createWbsTask({ ...task, projectId: 4, parentTaskId: 7 });
    expect(db.execute).toHaveBeenCalledWith(expect.stringContaining("parent_task_id"), expect.arrayContaining([4, 7]));
    expect(db.execute.mock.calls[0][1]?.[11]).toBe(1);
    expect(db.execute).toHaveBeenCalledWith(expect.stringContaining("'created'"), [7, "", "", "サブタスク「設計」を追加しました。"]);

    db.select.mockResolvedValue([{ parent_project_id: 5, is_descendant: 0 }]);
    await expect(createWbsTask({ ...task, projectId: 4, parentTaskId: 7 })).rejects.toThrow("同じ案件");
  });

  it("stores the category and reason for a scope-changing subtask", async () => {
    db.select.mockResolvedValue([{ parent_project_id: 4, is_descendant: 0 }]);
    await createWbsTask({ ...task, projectId: 4, parentTaskId: 7 }, { category: "scope_omission", reason: " 設計時の確認項目が不足していた " });
    expect(db.execute).toHaveBeenLastCalledWith(expect.stringContaining("reason_category"), [7, "scope_omission", "設計時の確認項目が不足していた", "サブタスク「設計」を追加しました。"]);
  });

  it("rejects a categorized subtask without a reason before writing", async () => {
    await expect(createWbsTask({ ...task, projectId: 4, parentTaskId: 7 }, { category: "scope_omission", reason: " " })).rejects.toThrow("サブタスク追加の理由");
    expect(db.execute).not.toHaveBeenCalled();
  });

  it("rejects finalizing a schedule-unassigned task", async () => {
    db.select.mockResolvedValue([{ id: 7, title: "親", schedule_assigned: 1 }, { id: 8, title: "日程未設定の子", schedule_assigned: 0 }]);
    await expect(finalizeWbsTask(7)).rejects.toThrow("日程を入力してから");
    expect(db.execute).not.toHaveBeenCalled();
  });

  it("rejects finalizing a missing task", async () => {
    db.select.mockResolvedValueOnce([]);
    await expect(finalizeWbsTask(999)).rejects.toThrow("確定するタスクが見つかりません");
    expect(db.execute).not.toHaveBeenCalled();
  });

  it("rejects progress for a schedule-unassigned task", async () => {
    db.select.mockResolvedValueOnce([{ progress: 0, finalized: 0, planned_start: "2026-08-08", planned_end: "2026-08-08", business_days: 1, schedule_assigned: 0, country_code: "JP", owner_user_id: null, previous_daily: 0, child_count: 0 }]);
    await expect(saveDailyProgress(7, "2026-08-08", 10, "", "")).rejects.toThrow("日程を入力してから");
    expect(db.execute).not.toHaveBeenCalled();
  });

  it("rejects self-parenting and descendant-parent cycles", async () => {
    await expect(updateWbsTask(7, { ...task, projectId: 4, parentTaskId: 7 })).rejects.toThrow("自身");
    db.select.mockResolvedValue([{ parent_project_id: 4, is_descendant: 1 }]);
    await expect(updateWbsTask(7, { ...task, projectId: 4, parentTaskId: 9 })).rejects.toThrow("子孫");
  });

  it("rejects missing project and missing parent records for child tasks", async () => {
    await expect(createWbsTask({ ...task, parentTaskId: 7 })).rejects.toThrow("所属案件");
    db.select.mockResolvedValueOnce([]);
    await expect(createWbsTask({ ...task, projectId: 4, parentTaskId: 7 })).rejects.toThrow("親タスクが見つかりません");
  });

  it("accepts only same-level prerequisite tasks and rejects dependency cycles", async () => {
    db.select.mockResolvedValueOnce([{ candidate_project_id: 4, candidate_parent_task_id: null, is_cycle: 0 }]);
    await createWbsTask({ ...task, projectId: 4, prerequisiteTaskIds: [7] });
    expect(db.execute).toHaveBeenCalledWith("INSERT INTO wbs_task_dependencies (task_id, prerequisite_task_id) VALUES ($1, $2)", [99, 7]);

    await expect(updateWbsTask(7, { ...task, projectId: 4, prerequisiteTaskIds: [7] })).rejects.toThrow("自身");
    db.select.mockResolvedValueOnce([{ candidate_project_id: 4, candidate_parent_task_id: 3, is_cycle: 0 }]);
    await expect(updateWbsTask(7, { ...task, projectId: 4, parentTaskId: null, prerequisiteTaskIds: [9] })).rejects.toThrow("同じ階層");
    db.select.mockResolvedValueOnce([{ candidate_project_id: 4, candidate_parent_task_id: null, is_cycle: 1 }]);
    await expect(updateWbsTask(7, { ...task, projectId: 4, prerequisiteTaskIds: [9] })).rejects.toThrow("循環");
  });

  it("rejects a missing prerequisite record", async () => {
    db.select.mockResolvedValueOnce([]);
    await expect(createWbsTask({ ...task, projectId: 4, prerequisiteTaskIds: [7] })).rejects.toThrow("完了前提タスクが見つかりません");
  });

  it("stores multiple prerequisite tasks for one WBS", async () => {
    db.select.mockResolvedValueOnce([{ candidate_project_id: 4, candidate_parent_task_id: null, is_cycle: 0 }]).mockResolvedValueOnce([{ candidate_project_id: 4, candidate_parent_task_id: null, is_cycle: 0 }]);
    await createWbsTask({ ...task, projectId: 4, prerequisiteTaskIds: [7, 8] });
    expect(db.execute).toHaveBeenCalledWith("INSERT INTO wbs_task_dependencies (task_id, prerequisite_task_id) VALUES ($1, $2)", [99, 7]);
    expect(db.execute).toHaveBeenCalledWith("INSERT INTO wbs_task_dependencies (task_id, prerequisite_task_id) VALUES ($1, $2)", [99, 8]);
  });

  it("rejects moving a task away from children in another project", async () => {
    db.select.mockResolvedValue([{ invalid_children: 1 }]);
    await expect(updateWbsTask(7, { ...task, projectId: 4 })).rejects.toThrow("子タスク");
  });

  it("rejects moving a prerequisite away from dependent tasks", async () => {
    db.select.mockResolvedValueOnce([{ invalid_children: 0 }]).mockResolvedValueOnce([{ invalid_dependents: 1 }]);
    await expect(updateWbsTask(7, { ...task, projectId: 4 })).rejects.toThrow("完了前提");
  });

  it("rejects direct schedule and progress changes after finalization", async () => {
    const current = { finalized: 1, planned_start: task.plannedStart, planned_end: task.plannedEnd, business_days: task.businessDays, progress: task.progress };
    db.select.mockResolvedValueOnce([{ invalid_children: 0 }]).mockResolvedValueOnce([{ invalid_dependents: 0 }]).mockResolvedValueOnce([current]);
    await expect(updateWbsTask(7, { ...task, plannedStart: "2026-08-07" })).rejects.toThrow("リスケ理由");
    db.select.mockResolvedValueOnce([{ invalid_children: 0 }]).mockResolvedValueOnce([{ invalid_dependents: 0 }]).mockResolvedValueOnce([current]);
    await expect(updateWbsTask(7, { ...task, progress: 10 })).rejects.toThrow("今日進んだ進捗");
  });

  it("allows unchanged finalized fields", async () => {
    const current = { finalized: 1, planned_start: task.plannedStart, planned_end: task.plannedEnd, business_days: task.businessDays, progress: task.progress };
    db.select.mockResolvedValueOnce([{ invalid_children: 0 }]).mockResolvedValueOnce([{ invalid_dependents: 0 }]).mockResolvedValueOnce([current]);
    await updateWbsTask(7, task);
    expect(db.execute).toHaveBeenCalledWith(expect.stringContaining("UPDATE wbs_tasks"), expect.any(Array));
  });

  it("rejects invalid WBS input and an out-of-project user", async () => {
    await expect(createWbsTask({ ...task, title: "" })).rejects.toThrow("タスク名");
    await expect(createWbsTask({ ...task, plannedStart: "" })).rejects.toThrow("予定日");
    await expect(createWbsTask({ ...task, businessDays: 0 })).rejects.toThrow("1日以上");
    db.select.mockResolvedValue([{ count: 0 }]);
    await expect(updateWbsTask(1, { ...task, projectId: 4, ownerUserId: 9 })).rejects.toThrow("案件のメンバー");
  });

  it("rejects missing assignment and hierarchy aggregate rows", async () => {
    db.select.mockResolvedValueOnce([]);
    await expect(createWbsTask({ ...task, projectId: 4, ownerUserId: 9 })).rejects.toThrow("案件のメンバー");

    db.select.mockResolvedValueOnce([]).mockResolvedValueOnce([{ invalid_dependents: 0 }]).mockResolvedValueOnce([{ finalized: 0 }]);
    await expect(updateWbsTask(7, { ...task, projectId: 4 })).resolves.toBeUndefined();

    db.select.mockResolvedValueOnce([{ invalid_children: 0 }]).mockResolvedValueOnce([]).mockResolvedValueOnce([{ finalized: 0 }]);
    await expect(updateWbsTask(7, { ...task, projectId: 4 })).resolves.toBeUndefined();
  });

  it("detaches child tasks between deleting progress logs and the task", async () => {
    await deleteWbsTask(7);
    expect(db.execute.mock.calls.map((call) => call[0])).toEqual([expect.stringContaining("task_activity_events"), expect.stringContaining("task_progress_entries"), expect.stringContaining("wbs_task_dependencies"), expect.stringContaining("parent_task_id=NULL"), expect.stringContaining("DELETE FROM wbs_tasks")]);
  });

  it("upserts daily progress and updates the WBS", async () => {
    db.select.mockResolvedValueOnce([{ progress: 40, previous_daily: 0, finalized: 1, planned_start: "2026-08-03", planned_end: "2026-08-14", business_days: 10, country_code: "JP", child_count: 0 }]).mockResolvedValueOnce([]);
    await saveDailyProgress(7, "2026-08-07", 20, " 進捗 ", "");
    expect(db.execute).toHaveBeenNthCalledWith(1, expect.stringContaining("task_progress_entries"), [7, "2026-08-07", 60, "進捗", 20, ""]);
    expect(db.execute).toHaveBeenCalledTimes(3);
  });

  it("validates daily progress and missing tasks", async () => {
    await expect(saveDailyProgress(7, "2026-08-07", Number.NaN, "", "")).rejects.toThrow("0〜100%");
    db.select.mockResolvedValueOnce([]);
    await expect(saveDailyProgress(7, "2026-08-07", 10, "", "")).rejects.toThrow("タスクが見つかりません");
  });

  it("loads user leave and records progress without a note", async () => {
    db.select.mockResolvedValueOnce([{ progress: 0, previous_daily: 0, finalized: 0, planned_start: "2026-08-03", planned_end: "2026-08-14", business_days: 10, country_code: "JP", owner_user_id: 3, child_count: 0 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 4, user_id: 3, user_name: "山田", leave_date: "2026-08-12", leave_type: "planned", leave_unit: "full_day", reason: "", customer_approved: 0, manager_approved: 0, workflow_approved: 0, created_at: "2026-08-01T00:00:00Z" }]);
    await saveDailyProgress(7, "2026-08-07", 10, "", "");
    expect(db.select).toHaveBeenCalledWith(expect.stringContaining("WHERE leave.user_id=$1"), [3]);
    expect(db.execute).toHaveBeenLastCalledWith(expect.stringContaining("'progress'"), [7, expect.stringMatching(/^2026-08-07 \+10% \/ 当日累計 10% \/ 計画 \d+%$/)]);
  });

  it("rejects daily progress for a task that owns subtasks", async () => {
    db.select.mockResolvedValue([{ progress: 40, previous_daily: 0, finalized: 1, planned_start: "2026-08-03", planned_end: "2026-08-14", business_days: 10, country_code: "JP", child_count: 2 }]);
    await expect(saveDailyProgress(7, "2026-08-07", 10, "", "")).rejects.toThrow("サブタスクを持つ");
    expect(db.execute).not.toHaveBeenCalled();
  });

  it("requires and records a delay reason when cumulative progress is below plan", async () => {
    const stored = { progress: 20, previous_daily: 0, finalized: 1, planned_start: "2026-08-03", planned_end: "2026-08-14", business_days: 10, country_code: "JP", child_count: 0 };
    db.select.mockResolvedValueOnce([stored]).mockResolvedValueOnce([]);
    await expect(saveDailyProgress(7, "2026-08-07", 5, "", "")).rejects.toThrow("理由");
    db.select.mockResolvedValueOnce([stored]).mockResolvedValueOnce([]);
    await saveDailyProgress(7, "2026-08-07", 5, "確認中", "仕様確認待ち", "", "requirement_change");
    expect(db.execute).toHaveBeenCalledTimes(4);
    expect(db.execute).toHaveBeenLastCalledWith(expect.stringContaining("'delay'"), [7, "requirement_change", "仕様確認待ち", "2026-08-07時点の累計進捗 25%（計画 50%）"]);
  });

  it("requires and stores a reason when progress starts before prerequisites complete", async () => {
    const stored = { progress: 0, previous_daily: 0, finalized: 0, planned_start: "2026-08-03", planned_end: "2026-08-14", business_days: 10, country_code: "JP", owner_user_id: null, child_count: 0 };
    db.select.mockResolvedValueOnce([stored]).mockResolvedValueOnce([]).mockResolvedValueOnce([{ title: "設計レビュー" }]);
    await expect(saveDailyProgress(7, "2026-08-07", 10, "先行調査", "", " ")).rejects.toThrow("完了前");

    db.select.mockResolvedValueOnce([stored]).mockResolvedValueOnce([]).mockResolvedValueOnce([{ title: "設計レビュー" }]);
    await saveDailyProgress(7, "2026-08-07", 10, "先行調査", "", "手戻りのない範囲を先行した");
    expect(db.execute).toHaveBeenNthCalledWith(1, expect.stringContaining("early_start_reason"), [7, "2026-08-07", 10, "先行調査", 10, "手戻りのない範囲を先行した"]);
  });

  it("does not treat an explicit zero as starting before prerequisites complete", async () => {
    const stored = { progress: 0, previous_daily: 0, finalized: 0, planned_start: "2026-08-03", planned_end: "2026-08-14", business_days: 10, country_code: "JP", owner_user_id: null, child_count: 0 };
    db.select.mockResolvedValueOnce([stored]).mockResolvedValueOnce([]).mockResolvedValueOnce([{ title: "設計レビュー" }]);
    await saveDailyProgress(7, "2026-08-07", 0, "待機", "", "不要な理由");
    expect(db.execute).toHaveBeenNthCalledWith(1, expect.stringContaining("early_start_reason"), [7, "2026-08-07", 0, "待機", 0, ""]);
  });

  it("replaces today's increment instead of adding it twice", async () => {
    db.select.mockResolvedValueOnce([{ progress: 60, previous_daily: 20, finalized: 0, planned_start: "2026-08-03", planned_end: "2026-08-14", business_days: 10, country_code: "JP", child_count: 0 }]).mockResolvedValueOnce([{ entry_date: "2026-08-07", cumulative_progress: 60, daily_progress: 20 }]);
    await saveDailyProgress(7, "2026-08-07", 10, "訂正", "");
    expect(db.execute).toHaveBeenNthCalledWith(1, expect.stringContaining("task_progress_entries"), [7, "2026-08-07", 50, "訂正", 10, ""]);
  });

  it("recalculates later cumulative progress when a missed past date is added", async () => {
    db.select.mockResolvedValueOnce([{ progress: 50, previous_daily: 0, finalized: 0, planned_start: "2026-08-03", planned_end: "2026-08-14", business_days: 10, country_code: "JP", child_count: 0 }]).mockResolvedValueOnce([{ entry_date: "2026-08-08", cumulative_progress: 50, daily_progress: 20 }]);
    await saveDailyProgress(7, "2026-08-07", 10, "追加入力", "");
    expect(db.execute).toHaveBeenNthCalledWith(1, expect.stringContaining("task_progress_entries"), [7, "2026-08-07", 40, "追加入力", 10, ""]);
    expect(db.execute).toHaveBeenNthCalledWith(2, expect.stringContaining("UPDATE task_progress_entries SET cumulative_progress=$1"), [60, 7, "2026-08-08"]);
    expect(db.execute).toHaveBeenNthCalledWith(3, expect.stringContaining("UPDATE wbs_tasks"), [60, "2026-08-07", 7]);
  });

  it("finalizes tasks and persists reasoned schedule history", async () => {
    db.select.mockResolvedValueOnce([{ id: 7, title: "親", schedule_assigned: 1 }, { id: 8, title: "子", schedule_assigned: 1 }]);
    await finalizeWbsTask(7);
    expect(db.execute).toHaveBeenCalledTimes(1);
    expect(db.execute).toHaveBeenCalledWith(expect.stringContaining("WITH RECURSIVE task_tree"), [7]);
    db.execute.mockClear();
    await expect(saveScheduleChanges([{ taskId: 7, plannedStart: "2026-08-07", plannedEnd: "2026-08-14", businessDays: 5 }], " ", "requirement_change")).rejects.toThrow("リスケ理由");
    await expect(saveScheduleChanges([{ taskId: 7, plannedStart: "2026-08-07", plannedEnd: "2026-08-14", businessDays: 5 }], "要件変更", "")).rejects.toThrow("区分");
    db.select.mockResolvedValue([{ planned_start: "2026-08-06", planned_end: "2026-08-13" }]);
    await saveScheduleChanges([{ taskId: 7, plannedStart: "2026-08-07", plannedEnd: "2026-08-14", businessDays: 5 }], " 顧客都合 ", "external_dependency");
    expect(db.execute).toHaveBeenCalledTimes(2);
    expect(db.execute).toHaveBeenLastCalledWith(expect.stringContaining("'rescheduled'"), [7, "external_dependency", "顧客都合", "2026-08-06〜2026-08-13 → 2026-08-07〜2026-08-14"]);
    db.execute.mockClear();
    await saveScheduleChanges([{ taskId: 8, plannedStart: "2026-08-08", plannedEnd: "2026-08-15", businessDays: 5, historyContext: "親タスク「親」の移動に連動" }], " 顧客都合 ", "external_dependency");
    expect(db.execute).toHaveBeenLastCalledWith(expect.stringContaining("'rescheduled'"), [8, "external_dependency", "顧客都合", "親タスク「親」の移動に連動。2026-08-06〜2026-08-13 → 2026-08-08〜2026-08-15"]);
  });

  it("rejects schedule changes for a missing task", async () => {
    db.select.mockResolvedValueOnce([]);
    await expect(saveScheduleChanges([{ taskId: 7, plannedStart: "2026-08-07", plannedEnd: "2026-08-14", businessDays: 5 }], "顧客都合", "external_dependency")).rejects.toThrow("変更対象のタスクが見つかりません");
  });

  it("loads work history in chronological order", async () => {
    db.select.mockResolvedValue([{ id: 2, task_id: 7, owner_user_id: 3, event_kind: "delay", reason_category: "external_dependency", reason: "待ち", details: "20%", occurred_at: "2026-08-06T01:00:00Z" }]);
    expect(await listTaskActivity(7)).toEqual([{ id: 2, taskId: 7, ownerUserId: 3, type: "delay", reasonCategory: "external_dependency", reason: "待ち", details: "20%", occurredAt: "2026-08-06T01:00:00Z" }]);
    expect(db.select).toHaveBeenCalledWith(expect.stringContaining("ORDER BY occurred_at ASC"), [7]);
  });

  it("loads the selected task and descendant history with source context", async () => {
    db.select.mockResolvedValue([{ id: 3, task_id: 8, owner_user_id: null, event_kind: "progress", reason_category: "", reason: "", details: "累計 50%", occurred_at: "2026-08-07T01:00:00Z", task_title: "実装", depth: 1 }]);
    expect(await listTaskTreeActivity(7)).toEqual([{ id: 3, taskId: 8, ownerUserId: null, type: "progress", reasonCategory: "", reason: "", details: "累計 50%", occurredAt: "2026-08-07T01:00:00Z", taskTitle: "実装", depth: 1 }]);
    expect(db.select).toHaveBeenCalledWith(expect.stringContaining("WITH RECURSIVE task_tree"), [7]);
  });
});

describe("user and settings data methods", () => {
  it("maps user profile rows", async () => {
    db.select.mockResolvedValue([{ id: 1, name: "山田", email: "taro@example.com", birthday: null, department: "開発", role: "PM", timezone: "Asia/Tokyo", interests: "読書", skills: "計画", work_style: "朝型", notes: "" }]);
    expect((await listUsers())[0]).toMatchObject({ name: "山田", workStyle: "朝型" });
  });

  it("creates and updates a valid user", async () => {
    await createUser(user);
    await updateUser(1, user);
    expect(db.execute).toHaveBeenCalledTimes(2);
    expect(db.execute.mock.calls[0][1][0]).toBe("山田 太郎");
  });

  it("stores a blank birthday as null", async () => {
    await createUser({ ...user, birthday: "" });
    expect(db.execute.mock.calls[0][1][2]).toBeNull();
  });

  it("rejects missing name and invalid email", async () => {
    await expect(createUser({ ...user, name: "" })).rejects.toThrow("氏名");
    await expect(updateUser(1, { ...user, email: "invalid" })).rejects.toThrow("メールアドレス");
  });

  it("detaches and deletes a user", async () => {
    await deleteUser(3);
    expect(db.execute).toHaveBeenCalledTimes(3);
  });

  it("lists, creates, updates, and deletes user leave", async () => {
    db.select.mockResolvedValueOnce([{ id: 4, user_id: 3, user_name: "山田", leave_date: "2026-08-12", leave_type: "planned", leave_unit: "morning", reason: "通院", customer_approved: 1, manager_approved: 0, workflow_approved: 1, created_at: "2026-08-01T01:00:00Z" }]);
    expect(await listUserLeaves()).toEqual([{ id: 4, userId: 3, userName: "山田", date: "2026-08-12", type: "planned", unit: "morning", reason: "通院", customerApproved: true, managerApproved: false, workflowApproved: true, createdAt: "2026-08-01T01:00:00Z" }]);
    await createUserLeave({ userId: 3, date: "2026-08-13", type: "planned", unit: "afternoon", reason: " 私用 ", customerApproved: true, managerApproved: false, workflowApproved: false });
    await updateUserLeave(4, { userId: 3, date: "2026-08-12", type: "unplanned", unit: "full_day", reason: " 体調不良 ", customerApproved: true, managerApproved: true, workflowApproved: true });
    await deleteUserLeave(4);
    expect(db.execute).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO user_leaves"), [3, "2026-08-13", "planned", "afternoon", "私用", 1, 0, 0]);
    expect(db.execute).toHaveBeenCalledWith(expect.stringContaining("UPDATE user_leaves"), [3, "2026-08-12", "unplanned", "full_day", "体調不良", 1, 1, 1, 4]);
    expect(db.execute).toHaveBeenLastCalledWith("DELETE FROM user_leaves WHERE id=$1", [4]);
  });

  it("persists the opposite approval combinations", async () => {
    await createUserLeave({ userId: 3, date: "2026-08-13", type: "planned", unit: "full_day", reason: "", customerApproved: false, managerApproved: true, workflowApproved: true });
    await updateUserLeave(4, { userId: 3, date: "2026-08-13", type: "planned", unit: "full_day", reason: "", customerApproved: false, managerApproved: false, workflowApproved: false });
    expect(db.execute).toHaveBeenNthCalledWith(1, expect.stringContaining("INSERT INTO user_leaves"), [3, "2026-08-13", "planned", "full_day", "", 0, 1, 1]);
    expect(db.execute).toHaveBeenNthCalledWith(2, expect.stringContaining("UPDATE user_leaves"), [3, "2026-08-13", "planned", "full_day", "", 0, 0, 0, 4]);
  });

  it("requires a reason for unplanned leave", async () => {
    await expect(createUserLeave({ userId: 3, date: "2026-08-13", type: "unplanned", unit: "full_day", reason: " ", customerApproved: false, managerApproved: false, workflowApproved: false })).rejects.toThrow("理由");
    expect(db.execute).not.toHaveBeenCalled();
  });

  it("validates every user leave input boundary", async () => {
    const valid = { userId: 3, date: "2026-08-13", type: "planned" as const, unit: "full_day" as const, reason: "", customerApproved: false, managerApproved: false, workflowApproved: false };
    await expect(createUserLeave({ ...valid, userId: 0 })).rejects.toThrow("ユーザーを選択");
    await expect(createUserLeave({ ...valid, date: "" })).rejects.toThrow("休暇日");
    await expect(createUserLeave({ ...valid, type: "other" as never })).rejects.toThrow("休暇種別");
    await expect(createUserLeave({ ...valid, unit: "hour" as never })).rejects.toThrow("取得単位");
  });

  it("loads stored settings and defaults when absent", async () => {
    db.select.mockResolvedValueOnce([{ country_code: "US", notification_time: "09:00", notifications_enabled: 1, last_notified_date: "2026-08-06", daily_report_ancestor_depth: 5 }]);
    expect(await getSettings()).toEqual({ countryCode: "US", notificationTime: "09:00", notificationsEnabled: true, lastNotifiedDate: "2026-08-06", dailyReportAncestorDepth: 5 });
    db.select.mockResolvedValueOnce([]);
    expect(await getSettings()).toEqual({ countryCode: "JP", notificationTime: "17:30", notificationsEnabled: false, lastNotifiedDate: null, dailyReportAncestorDepth: 3 });
  });

  it("saves settings using SQLite values", async () => {
    const settings: AppSettings = { countryCode: "GB", notificationTime: "18:00", notificationsEnabled: true, lastNotifiedDate: null, dailyReportAncestorDepth: 4 };
    await saveSettings(settings);
    expect(db.execute).toHaveBeenCalledWith(expect.stringContaining("UPDATE app_settings"), ["GB", "18:00", 1, null, 4]);
    await saveSettings({ ...settings, notificationsEnabled: false });
    expect(db.execute).toHaveBeenLastCalledWith(expect.stringContaining("UPDATE app_settings"), ["GB", "18:00", 0, null, 4]);
    await expect(saveSettings({ ...settings, dailyReportAncestorDepth: 11 })).rejects.toThrow("0から10");
  });
});
