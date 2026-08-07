import { describe, expect, it } from "vitest";
import { buildTimelineDateRange, buildTimelineMonths, buildWbsGroups, filterWbsTasks, flattenWbsTaskTree, parentTaskCandidates, summarizeWbsTasks, type WbsFilters } from "../../src/lib/wbsView";
import type { Milestone } from "../../src/lib/milestones";
import type { Project } from "../../src/lib/projects";
import type { Assignee, WbsTask } from "../../src/lib/wbs";

const tasks: WbsTask[] = [
  { id: 1, title: "要件レビュー", description: "顧客確認", projectId: 10, projectName: "新製品", parentTaskId: null, parentTaskTitle: null, assigneeId: 20, assigneeName: "山田", status: "in_progress", progress: 40, countryCode: "JP", plannedStart: "2026-08-01", plannedEnd: "2026-08-05", businessDays: 3, actualStart: null, actualEnd: null },
  { id: 2, title: "UI実装", description: "画面", projectId: 10, projectName: "新製品", parentTaskId: 1, parentTaskTitle: "要件レビュー", assigneeId: null, assigneeName: null, status: "not_started", progress: 0, countryCode: "JP", plannedStart: "2026-08-06", plannedEnd: "2026-08-12", businessDays: 5, actualStart: null, actualEnd: null },
  { id: 3, title: "運用確認", description: "", projectId: null, projectName: null, parentTaskId: null, parentTaskTitle: null, assigneeId: 21, assigneeName: "佐藤", status: "completed", progress: 100, countryCode: "JP", plannedStart: "2026-07-01", plannedEnd: "2026-07-02", businessDays: 2, actualStart: null, actualEnd: "2026-07-02" },
];
const projects: Project[] = [{ id: 10, name: "新製品", code: "NEW-1", clientName: "", description: "", status: "active", priority: "high", plannedStart: null, plannedEnd: null, members: [{ userId: 20, name: "山田", email: "y@example.com", projectRole: "PM" }] }];
const users: Assignee[] = [
  { id: 20, name: "山田", email: "y@example.com", birthday: null, department: "開発", role: "PM", timezone: "Asia/Tokyo", interests: "", skills: "", workStyle: "", notes: "" },
  { id: 21, name: "佐藤", email: "s@example.com", birthday: null, department: "QA", role: "", timezone: "Asia/Tokyo", interests: "", skills: "", workStyle: "", notes: "" },
];
const all: WbsFilters = { query: "", projectId: "all", assigneeId: "all", status: "all" };
const milestones: Milestone[] = [{ id: 1, projectId: 10, projectName: "新製品", projectCode: "NEW-1", name: "公開", description: "", dueDate: "2026-09-01", completed: false, color: "forest" }];

describe("WBS view methods", () => {
  it("filters by searchable text, relationship, status, and unset values", () => {
    expect(filterWbsTasks(tasks, { ...all, query: "顧客" }).map((task) => task.id)).toEqual([1]);
    expect(filterWbsTasks(tasks, { ...all, projectId: 10, assigneeId: 20, status: "in_progress" }).map((task) => task.id)).toEqual([1]);
    expect(filterWbsTasks(tasks, { ...all, projectId: "unset" }).map((task) => task.id)).toEqual([3]);
    expect(filterWbsTasks(tasks, { ...all, assigneeId: "unset" }).map((task) => task.id)).toEqual([2]);
  });

  it("summarizes visible work without treating completed work as overdue", () => {
    expect(summarizeWbsTasks(tasks, "2026-08-06")).toEqual({ total: 3, open: 2, overdue: 1, unassigned: 2, averageProgress: 47 });
    expect(summarizeWbsTasks([], "2026-08-06").averageProgress).toBe(0);
  });

  it("groups only visible work and preserves an explicit unset group", () => {
    expect(buildWbsGroups(tasks, "project", projects, users).map((group) => [group.label, group.tasks.length])).toEqual([["新製品", 2], ["案件未設定", 1]]);
    expect(buildWbsGroups(tasks, "assignee", projects, users).map((group) => [group.label, group.detail, group.tasks.length])).toEqual([["山田", "PM", 1], ["佐藤", "QA", 1], ["責任者未設定", "責任者の設定が必要です", 1]]);
  });

  it("flattens recursive children and excludes self and descendants from parent candidates", () => {
    const grandchild = { ...tasks[1], id: 4, title: "アイコン実装", parentTaskId: 2, parentTaskTitle: "UI実装" };
    const nested = [tasks[1], grandchild, tasks[0]];
    expect(flattenWbsTaskTree(nested).map(({ task, depth }) => [task.id, depth])).toEqual([[1, 0], [2, 1], [4, 2]]);
    expect(parentTaskCandidates(nested, 10, 2).map((task) => task.id)).toEqual([1]);
    expect(parentTaskCandidates(nested, null, null)).toEqual([]);
  });

  it("builds a horizontally scrollable range that includes tasks, milestones, and padding", () => {
    expect(buildTimelineDateRange(tasks, milestones, "2026-08-06")).toEqual({ start: "2026-06-24", end: "2026-09-08", days: 77 });
    expect(buildTimelineDateRange([], [], "2026-08-06")).toEqual({ start: "2026-07-30", end: "2026-09-09", days: 42 });
  });

  it("groups the visible date headers by month", () => {
    expect(buildTimelineMonths(["2026-08-30", "2026-08-31", "2026-09-01", "2026-09-02"])).toEqual([
      { key: "2026-08", label: "2026年8月", days: 2 },
      { key: "2026-09", label: "2026年9月", days: 2 },
    ]);
    expect(buildTimelineMonths([])).toEqual([]);
  });
});
