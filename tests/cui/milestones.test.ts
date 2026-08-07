import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ select: vi.fn(), execute: vi.fn() }));
vi.mock("@tauri-apps/plugin-sql", () => ({ default: { load: vi.fn(async () => db) } }));
import { createMilestone, deleteMilestone, listMilestones, updateMilestone, type MilestoneInput } from "../../src/lib/milestones";
const input: MilestoneInput = { projectId: 2, name: " リリース ", description: " 公開日 ", dueDate: "2026-09-01", completed: false, color: "ocean" };
beforeEach(() => { db.select.mockReset(); db.execute.mockReset(); db.execute.mockResolvedValue({ rowsAffected: 1 }); });

describe("milestone data methods", () => {
  it("maps milestones with their project identity", async () => {
    db.select.mockResolvedValue([{ id: 1, project_id: 2, project_name: "新製品", project_code: "NEW-01", name: "リリース", description: "公開日", due_date: "2026-09-01", completed: 1, color: "ocean" }]);
    expect(await listMilestones()).toEqual([{ id: 1, projectId: 2, projectName: "新製品", projectCode: "NEW-01", name: "リリース", description: "公開日", dueDate: "2026-09-01", completed: true, color: "ocean" }]);
  });
  it("creates, updates, and deletes a milestone", async () => {
    await createMilestone(input); await updateMilestone(4, { ...input, completed: true }); await deleteMilestone(4);
    expect(db.execute).toHaveBeenNthCalledWith(1, expect.stringContaining("INSERT INTO milestones"), [2, "リリース", "公開日", "2026-09-01", 0, "ocean"]);
    expect(db.execute).toHaveBeenNthCalledWith(2, expect.stringContaining("UPDATE milestones"), [2, "リリース", "公開日", "2026-09-01", 1, "ocean", 4]);
    expect(db.execute).toHaveBeenNthCalledWith(3, expect.stringContaining("DELETE FROM milestones"), [4]);
  });
  it("rejects missing project, name, and date", async () => {
    await expect(createMilestone({ ...input, projectId: 0 })).rejects.toThrow("所属プロジェクト");
    await expect(createMilestone({ ...input, name: "" })).rejects.toThrow("マイルストーン名");
    await expect(createMilestone({ ...input, dueDate: "" })).rejects.toThrow("達成予定日");
    await expect(createMilestone({ ...input, color: "neon" as MilestoneInput["color"] })).rejects.toThrow("色を選択");
    expect(db.execute).not.toHaveBeenCalled();
  });
});
