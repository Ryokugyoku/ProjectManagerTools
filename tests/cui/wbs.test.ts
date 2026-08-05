import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ select: vi.fn(), execute: vi.fn() }));
vi.mock("@tauri-apps/plugin-sql", () => ({ default: { load: vi.fn(async () => db) } }));

import {
  createAssignee, createWbsTask, deleteAssignee, deleteWbsTask, getSettings,
  listAssignees, listWbsTasks, saveDailyProgress, saveSettings, updateAssignee,
  updateWbsTask, type AppSettings, type UserProfileInput, type WbsTaskInput,
} from "../../src/lib/wbs";

const task: WbsTaskInput = {
  title: " 設計 ", description: " 詳細 ", projectId: null, assigneeId: null,
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
    db.select.mockResolvedValue([{ id: 1, title: "設計", description: "", project_id: 2, project_name: "案件", assignee_id: 3, assignee_name: "山田", status: "in_progress", progress: 40, country_code: "JP", planned_start: "2026-08-06", planned_end: "2026-08-13", business_days: 5, actual_start: "2026-08-06", actual_end: null }]);
    expect(await listWbsTasks()).toEqual([{ id: 1, title: "設計", description: "", projectId: 2, projectName: "案件", assigneeId: 3, assigneeName: "山田", status: "in_progress", progress: 40, countryCode: "JP", plannedStart: "2026-08-06", plannedEnd: "2026-08-13", businessDays: 5, actualStart: "2026-08-06", actualEnd: null }]);
  });

  it("creates an unassigned WBS and trims text", async () => {
    await createWbsTask(task);
    expect(db.execute).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO wbs_tasks"), expect.arrayContaining(["設計", "詳細"]));
  });

  it("creates and updates a WBS only when the assignee belongs to the project", async () => {
    db.select.mockResolvedValue([{ count: 1 }]);
    await createWbsTask({ ...task, projectId: 4, assigneeId: 8 });
    await updateWbsTask(9, { ...task, projectId: 4, assigneeId: 8 });
    expect(db.select).toHaveBeenCalledTimes(2);
    expect(db.execute).toHaveBeenCalledTimes(2);
  });

  it("rejects invalid WBS input and an out-of-project assignee", async () => {
    await expect(createWbsTask({ ...task, title: "" })).rejects.toThrow("WBS名");
    await expect(createWbsTask({ ...task, plannedStart: "" })).rejects.toThrow("予定日");
    await expect(createWbsTask({ ...task, businessDays: 0 })).rejects.toThrow("1日以上");
    db.select.mockResolvedValue([{ count: 0 }]);
    await expect(updateWbsTask(1, { ...task, projectId: 4, assigneeId: 9 })).rejects.toThrow("案件のメンバー");
  });

  it("deletes progress logs before deleting a WBS", async () => {
    await deleteWbsTask(7);
    expect(db.execute.mock.calls.map((call) => call[0])).toEqual([expect.stringContaining("wbs_progress_logs"), expect.stringContaining("wbs_tasks")]);
  });

  it("upserts daily progress and updates the WBS", async () => {
    await saveDailyProgress(7, "2026-08-06", 60, " 進捗 ");
    expect(db.execute).toHaveBeenNthCalledWith(1, expect.stringContaining("wbs_progress_logs"), [7, "2026-08-06", 60, "進捗"]);
    expect(db.execute).toHaveBeenCalledTimes(2);
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
