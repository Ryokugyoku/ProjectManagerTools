import { describe, expect, it } from "vitest";
import { buildDependencyAnalysis } from "../../src/lib/wbsAnalysis";
import type { WbsTask } from "../../src/lib/wbs";

const base: WbsTask = { id: 1, title: "A", description: "", projectId: 1, projectName: "案件", parentTaskId: null, parentTaskTitle: null, assigneeId: null, assigneeName: null, status: "not_started", progress: 0, countryCode: "JP", plannedStart: "2026-08-03", plannedEnd: "2026-08-03", businessDays: 1, actualStart: null, actualEnd: null, finalized: true };

// 因子: 依存形状（独立/直列/分岐合流）、所要日数（同一/長短あり）、依存数（0/1/複数）。
// どの組み合わせでもDAGを維持し、最長経路の所要日数とクリティカルタスクを一意に算出する。
describe("critical path combinations", () => {
  it.each([
    [[base], 1, [1]],
    [[base, { ...base, id: 2, prerequisiteTaskIds: [1], businessDays: 2 }], 3, [1, 2]],
    [[base, { ...base, id: 2, prerequisiteTaskIds: [1], businessDays: 4 }, { ...base, id: 3, prerequisiteTaskIds: [1], businessDays: 2 }, { ...base, id: 4, prerequisiteTaskIds: [2, 3], businessDays: 1 }], 6, [1, 2, 4]],
  ] as Array<[WbsTask[], number, number[]]>)("tasks=%s", (tasks, duration, criticalIds) => {
    const result = buildDependencyAnalysis(tasks);
    expect(result.hasCycle).toBe(false);
    expect(result.projectDuration).toBe(duration);
    expect(result.criticalTaskIds).toEqual(criticalIds);
  });
});
