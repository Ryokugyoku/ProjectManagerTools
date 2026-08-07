import { describe, expect, it } from "vitest";
import { buildBurndownSeries, buildDependencyAnalysis, buildDependencyScope, currentRemainingEffort, dependencyIds, summarizeProgressHealth } from "../../src/lib/wbsAnalysis";
import type { WbsTask } from "../../src/lib/wbs";

const base: WbsTask = { id: 1, title: "要件", description: "", projectId: 1, projectName: "案件", parentTaskId: null, parentTaskTitle: null, assigneeId: 1, assigneeName: "山田", status: "in_progress", progress: 50, countryCode: "JP", plannedStart: "2026-08-03", plannedEnd: "2026-08-07", businessDays: 5, actualStart: null, actualEnd: null, finalized: true };

describe("WBS analysis methods", () => {
  it("finds the longest dependency path across multiple prerequisites", () => {
    const tasks = [base, { ...base, id: 2, title: "設計", businessDays: 3, prerequisiteTaskIds: [1] }, { ...base, id: 3, title: "調達", businessDays: 2, prerequisiteTaskIds: [1] }, { ...base, id: 4, title: "実装", businessDays: 5, prerequisiteTaskIds: [2, 3] }];
    const analysis = buildDependencyAnalysis(tasks);
    expect(analysis.projectDuration).toBe(13);
    expect(analysis.criticalTaskIds).toEqual([1, 2, 4]);
    expect(analysis.edges.find((edge) => edge.from === 2 && edge.to === 4)?.critical).toBe(true);
    expect(analysis.nodes.find((node) => node.task.id === 3)?.totalFloat).toBe(1);
    expect(analysis.hasCycle).toBe(false);
  });

  it("reports a malformed cycle without hanging", () => {
    const analysis = buildDependencyAnalysis([{ ...base, prerequisiteTaskIds: [2] }, { ...base, id: 2, prerequisiteTaskIds: [1] }]);
    expect(analysis.hasCycle).toBe(true);
    expect(analysis.nodes).toHaveLength(2);
  });

  it("builds one dependency level and its breadcrumb path recursively", () => {
    const root = { ...base, id: 10, title: "親工程" };
    const child = { ...base, id: 11, title: "子工程", parentTaskId: 10, parentTaskTitle: "親工程" };
    const grandchild = { ...base, id: 12, title: "孫工程", parentTaskId: 11, parentTaskTitle: "子工程" };
    const sibling = { ...base, id: 13, title: "別の親工程" };
    const tasks = [root, child, grandchild, sibling];

    expect(buildDependencyScope(tasks, null).tasks.map((task) => task.id)).toEqual([10, 13]);
    const childScope = buildDependencyScope(tasks, 11);
    expect(childScope.parentTask?.id).toBe(11);
    expect(childScope.breadcrumbs.map((task) => task.id)).toEqual([10, 11]);
    expect(childScope.tasks.map((task) => task.id)).toEqual([12]);
  });

  it("falls back to the project root for a missing scope task", () => {
    const root = { ...base, id: 10, title: "親工程" };
    expect(buildDependencyScope([root], 999)).toEqual({ parentTask: null, breadcrumbs: [], tasks: [root] });
  });

  it("builds planned burn-down points and current remaining leaf effort", () => {
    const parent = { ...base, id: 9, businessDays: 10 };
    const child = { ...base, parentTaskId: 9, progress: 40 };
    const points = buildBurndownSeries([parent, child], "2026-08-07");
    expect(points[0].plannedRemaining).toBe(4);
    expect(points[points.length - 1].plannedRemaining).toBe(0);
    expect(currentRemainingEffort([parent, child])).toBe(3);
  });

  it("summarizes ahead, on-track, behind, and draft separately", () => {
    const result = summarizeProgressHealth([{ ...base, progress: 60 }, { ...base, id: 2, progress: 100 }, { ...base, id: 3, progress: 20 }, { ...base, id: 4, finalized: false }], "2026-08-05");
    expect(result).toEqual({ ahead: 1, onTrack: 1, behind: 1, draft: 1 });
    expect(dependencyIds({ ...base, prerequisiteTaskId: 7 })).toEqual([7]);
  });
});
