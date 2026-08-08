import { describe, expect, it } from "vitest";
import { ancestorTrail, buildTimelineDateRange, buildTimelineMonths, buildWbsGroups, calculateSchedulePreview, dailyProgressActionLabel, filterWbsTasks, flattenWbsTaskTree, includeMatchingAncestors, parentTaskCandidates, prerequisiteTaskCandidates, summarizeDescendants, summarizeWbsTasks, taskActionLabels, visibleWbsTaskTree, type WbsFilters } from "../../src/lib/wbsView";
import type { Milestone } from "../../src/lib/milestones";
import type { Project } from "../../src/lib/projects";
import type { UserProfile, WbsTask } from "../../src/lib/wbs";

const tasks: WbsTask[] = [
  { id: 1, title: "要件レビュー", description: "顧客確認", projectId: 10, projectName: "新製品", parentTaskId: null, parentTaskTitle: null, ownerUserId: 20, ownerUserName: "山田", status: "in_progress", progress: 40, countryCode: "JP", plannedStart: "2026-08-01", plannedEnd: "2026-08-05", businessDays: 3, actualStart: null, actualEnd: null, finalized: true },
  { id: 2, title: "UI実装", description: "画面", projectId: 10, projectName: "新製品", parentTaskId: 1, parentTaskTitle: "要件レビュー", ownerUserId: null, ownerUserName: null, status: "not_started", progress: 0, countryCode: "JP", plannedStart: "2026-08-06", plannedEnd: "2026-08-12", businessDays: 5, actualStart: null, actualEnd: null, finalized: false },
  { id: 3, title: "運用確認", description: "", projectId: null, projectName: null, parentTaskId: null, parentTaskTitle: null, ownerUserId: 21, ownerUserName: "佐藤", status: "completed", progress: 100, countryCode: "JP", plannedStart: "2026-07-01", plannedEnd: "2026-07-02", businessDays: 2, actualStart: null, actualEnd: "2026-07-02", finalized: true },
];
const projects: Project[] = [{ id: 10, name: "新製品", code: "NEW-1", clientName: "", description: "", status: "active", priority: "high", plannedStart: null, plannedEnd: null, members: [{ userId: 20, name: "山田", email: "y@example.com", projectRole: "PM" }] }];
const users: UserProfile[] = [
  { id: 20, name: "山田", email: "y@example.com", birthday: null, department: "開発", role: "PM", timezone: "Asia/Tokyo", interests: "", skills: "", workStyle: "", notes: "" },
  { id: 21, name: "佐藤", email: "s@example.com", birthday: null, department: "QA", role: "", timezone: "Asia/Tokyo", interests: "", skills: "", workStyle: "", notes: "" },
];
const all: WbsFilters = { query: "", projectId: "all", ownerUserId: "all", status: "all", attention: "all" };
const milestones: Milestone[] = [{ id: 1, projectId: 10, projectName: "新製品", projectCode: "NEW-1", name: "公開", description: "", dueDate: "2026-09-01", completed: false, color: "forest" }];

describe("WBS view methods", () => {
  it("filters by searchable text, relationship, status, and unset values", () => {
    expect(filterWbsTasks(tasks, { ...all, query: "顧客" }).map((task) => task.id)).toEqual([1]);
    expect(filterWbsTasks(tasks, { ...all, projectId: 10, ownerUserId: 20, status: "in_progress" }).map((task) => task.id)).toEqual([1]);
    expect(filterWbsTasks(tasks, { ...all, projectId: "unset" }).map((task) => task.id)).toEqual([3]);
    expect(filterWbsTasks(tasks, { ...all, ownerUserId: "unset" }).map((task) => task.id)).toEqual([2]);
  });

  it("summarizes visible work without treating completed work as overdue", () => {
    expect(summarizeWbsTasks(tasks, "2026-08-06")).toEqual({ total: 3, open: 2, overdue: 1, delayed: 1, unassigned: 1, scheduleUnassigned: 0, averageProgress: 47 });
    expect(summarizeWbsTasks([], "2026-08-06").averageProgress).toBe(0);
  });

  it("keeps schedule-unassigned work out of the timeline range and overdue count", () => {
    const unscheduled = { ...tasks[0], scheduleAssigned: false, plannedStart: "2030-01-01", plannedEnd: "2030-01-31" };
    expect(summarizeWbsTasks([unscheduled], "2030-02-01")).toMatchObject({ overdue: 0, scheduleUnassigned: 1 });
    expect(buildTimelineDateRange([unscheduled], [], "2026-08-06")).toEqual({ start: "2026-07-30", end: "2026-09-09", days: 42 });
  });

  it("groups only visible work and preserves an explicit unset group", () => {
    expect(buildWbsGroups(tasks, "project", projects, users).map((group) => [group.label, group.tasks.length])).toEqual([["新製品", 2], ["案件未設定", 1]]);
    expect(buildWbsGroups(tasks, "user", projects, users).map((group) => [group.label, group.detail, group.tasks.length])).toEqual([["山田", "PM", 1], ["佐藤", "QA", 1], ["責任者未設定", "責任者の設定が必要です", 1]]);
  });

  it("flattens recursive children and excludes self and descendants from parent candidates", () => {
    const grandchild = { ...tasks[1], id: 4, title: "アイコン実装", parentTaskId: 2, parentTaskTitle: "UI実装" };
    const nested = [tasks[1], grandchild, tasks[0]];
    expect(flattenWbsTaskTree(nested).map(({ task, depth }) => [task.id, depth])).toEqual([[1, 0], [2, 1], [4, 2]]);
    expect(parentTaskCandidates(nested, 10, 2).map((task) => task.id)).toEqual([1]);
    expect(parentTaskCandidates(nested, null, null)).toEqual([]);
    expect(ancestorTrail(nested, 4).map((task) => task.title)).toEqual(["要件レビュー", "UI実装"]);
  });

  it("switches the daily progress action by today's record and hides it for parents", () => {
    expect(dailyProgressActionLabel({}, false)).toBe("今日進んだ進捗を入力");
    expect(dailyProgressActionLabel({ todayDailyProgress: 0 }, false)).toBe("今日の進捗を編集");
    expect(dailyProgressActionLabel({}, false, true)).toBe("過去の進捗を入力");
    expect(dailyProgressActionLabel({ todayDailyProgress: 10 }, true)).toBeNull();
    expect(taskActionLabels({}, false, true)).toEqual(["タスクを編集", "過去の進捗を入力", "作業経緯を表示", "＋ サブタスクを追加"]);
    expect(taskActionLabels({}, true, true)).toEqual(["タスクを編集", "作業経緯を表示", "＋ サブタスクを追加"]);
  });

  it("filters attention conditions with existing filters and restores ancestors", () => {
    expect(filterWbsTasks(tasks, { ...all, projectId: 10, attention: "unassigned" }, "2026-08-06").map((task) => task.id)).toEqual([2]);
    expect(filterWbsTasks(tasks, { ...all, query: "UI", attention: "open" }, "2026-08-06").map((task) => task.id)).toEqual([2]);
    expect(includeMatchingAncestors(tasks, [tasks[1]]).map((task) => task.id)).toEqual([1, 2]);
    expect(filterWbsTasks(tasks, all, "2026-08-06")).toEqual(tasks);
  });

  it("collapses descendants unless a matching descendant must be revealed", () => {
    const grandchild = { ...tasks[1], id: 4, title: "孫", parentTaskId: 2 };
    const nested = [tasks[0], tasks[1], grandchild];
    expect(visibleWbsTaskTree(nested, new Set([1]), new Set()).map(({ task }) => task.id)).toEqual([1]);
    expect(visibleWbsTaskTree(nested, new Set([1, 2]), new Set([4])).map(({ task }) => task.id)).toEqual([1, 2, 4]);
  });

  it("summarizes descendant attention and calculates drag previews", () => {
    const child = { ...tasks[1], scheduleAssigned: false, plannedEnd: "2026-08-01" };
    expect(summarizeDescendants([tasks[0], child], 1, "2026-08-06")).toMatchObject({ count: 1, unassigned: 1, scheduleUnassigned: 1 });
    expect(calculateSchedulePreview(tasks[0], "move", 1, "JP")).toMatchObject({ plannedStart: "2026-08-03", businessDays: 3, plannedEnd: "2026-08-05" });
    expect(calculateSchedulePreview(tasks[0], "right", 2, "JP")).toMatchObject({ businessDays: 5, plannedEnd: "2026-08-07" });
  });

  it("offers only same-level tasks as prerequisites and excludes cycles", () => {
    const sibling = { ...tasks[0], id: 5, title: "同階層A" };
    const dependent = { ...tasks[0], id: 6, title: "同階層B", prerequisiteTaskIds: [1] };
    expect(prerequisiteTaskCandidates([tasks[0], tasks[1], sibling], 10, null, 1).map((task) => task.id)).toEqual([5]);
    expect(prerequisiteTaskCandidates([tasks[0], tasks[1], sibling, dependent], 10, null, 1).map((task) => task.id)).not.toContain(6);
    expect(prerequisiteTaskCandidates([tasks[0]], null, null, null)).toEqual([]);
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
