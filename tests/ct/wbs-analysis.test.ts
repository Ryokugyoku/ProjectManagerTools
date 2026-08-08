import { describe, expect, it } from "vitest";
import { buildDependencyAnalysis, buildDependencyScope } from "../../src/lib/wbsAnalysis";
import type { WbsTask } from "../../src/lib/wbs";

const base: WbsTask = { id: 1, title: "A", description: "", projectId: 1, projectName: "案件", parentTaskId: null, parentTaskTitle: null, ownerUserId: null, ownerUserName: null, status: "not_started", progress: 0, countryCode: "JP", plannedStart: "2026-08-03", plannedEnd: "2026-08-03", businessDays: 1, actualStart: null, actualEnd: null, finalized: true };

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

// 因子: 階層（最上位/子/孫）、同階層の依存（なし/あり）、配下（末端/親）。
// どの組み合わせでも現在の親の直属タスクだけを抽出し、階層外の依存を混在させない。
describe("dependency hierarchy combinations", () => {
  it.each([
    [null, [1, 2]],
    [1, [3, 4]],
    [3, [5]],
  ] as Array<[number | null, number[]]>)("parent=%s", (parentTaskId, expectedIds) => {
    const tasks: WbsTask[] = [
      base,
      { ...base, id: 2, title: "B", prerequisiteTaskIds: [1] },
      { ...base, id: 3, title: "A-1", parentTaskId: 1 },
      { ...base, id: 4, title: "A-2", parentTaskId: 1, prerequisiteTaskIds: [3] },
      { ...base, id: 5, title: "A-1-1", parentTaskId: 3 },
    ];
    const scope = buildDependencyScope(tasks, parentTaskId);
    const result = buildDependencyAnalysis(scope.tasks);
    expect(scope.tasks.map((task) => task.id)).toEqual(expectedIds);
    expect(result.edges.every((edge) => expectedIds.includes(edge.from) && expectedIds.includes(edge.to))).toBe(true);
  });
});
