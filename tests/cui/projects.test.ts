import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ select: vi.fn(), execute: vi.fn() }));
vi.mock("@tauri-apps/plugin-sql", () => ({ default: { load: vi.fn(async () => db) } }));

import { createProject, deleteProject, listProjects, updateProject, type ProjectInput } from "../../src/lib/projects";

const project: ProjectInput = {
  name: " 案件A ", code: " PRJ-001 ", clientName: " 顧客 ", description: " 概要 ",
  status: "active", priority: "high", plannedStart: "2026-08-01", plannedEnd: "2026-09-30",
  members: [{ userId: 2, projectRole: " PM " }, { userId: 3, projectRole: " Developer " }],
};

beforeEach(() => { db.select.mockReset(); db.execute.mockReset(); db.execute.mockResolvedValue({ rowsAffected: 1, lastInsertId: 10 }); });

describe("project data methods", () => {
  it("maps projects and their members", async () => {
    db.select.mockResolvedValueOnce([{ id: 1, name: "案件A", code: "A", client_name: "顧客", description: "", status: "active", priority: "high", planned_start: null, planned_end: null }]);
    db.select.mockResolvedValueOnce([{ project_id: 1, user_id: 2, name: "山田", email: "a@example.com", project_role: "PM" }]);
    expect(await listProjects()).toEqual([{ id: 1, name: "案件A", code: "A", clientName: "顧客", description: "", status: "active", priority: "high", plannedStart: null, plannedEnd: null, members: [{ userId: 2, name: "山田", email: "a@example.com", projectRole: "PM" }] }]);
  });

  it("creates a project and every member", async () => {
    await createProject(project);
    expect(db.execute).toHaveBeenCalledTimes(4);
    expect(db.execute).toHaveBeenNthCalledWith(3, expect.stringContaining("project_members"), [10, 2, "PM"]);
  });

  it("stores blank planned dates as null", async () => {
    await createProject({ ...project, plannedStart: "", plannedEnd: "", members: [] });
    expect(db.execute).toHaveBeenNthCalledWith(1, expect.stringContaining("INSERT INTO projects"), [
      "案件A", "PRJ-001", "顧客", "概要", "active", "high", null, null,
    ]);
  });

  it("rejects creation when an insert id is unavailable", async () => {
    db.execute.mockResolvedValueOnce({ rowsAffected: 1 });
    await expect(createProject({ ...project, members: [] })).rejects.toThrow("案件ID");
  });

  it("updates fields, members, and invalid WBS assignments", async () => {
    await updateProject(4, project);
    expect(db.execute).toHaveBeenCalledTimes(5);
    expect(db.execute.mock.calls.at(-1)?.[0]).toContain("assignee_id=NULL");
  });

  it("deletes a project without deleting WBS rows", async () => {
    await deleteProject(4);
    expect(db.execute.mock.calls.map((call) => call[0])).toEqual([
      expect.stringContaining("UPDATE wbs_tasks"), expect.stringContaining("project_members"), expect.stringContaining("projects"),
    ]);
  });

  it("validates required fields, dates, and duplicate members", async () => {
    await expect(createProject({ ...project, name: "" })).rejects.toThrow("案件名");
    await expect(createProject({ ...project, code: "" })).rejects.toThrow("案件コード");
    await expect(createProject({ ...project, plannedStart: "2026-09-01", plannedEnd: "2026-08-01" })).rejects.toThrow("終了予定日");
    await expect(createProject({ ...project, members: [{ userId: 2, projectRole: "PM" }, { userId: 2, projectRole: "Dev" }] })).rejects.toThrow("重複");
  });
});
