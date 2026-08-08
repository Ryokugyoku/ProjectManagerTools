import { describe, expect, it } from "vitest";

import { buildActiveTaskHierarchy, calculateDelayImpact, calculateProjectScheduleVariance, calculateTaskScheduleVariance } from "../../src/lib/dailyReport";
import { missingProgressDates } from "../../src/features/wbs/taskForm";
import type { DailyProgressSnapshot, WbsTask } from "../../src/lib/wbs";

// 因子: 実績進捗（前倒し/同率/遅延）、計画状態（確定/編集中）、階層（末端/親）。
// 確定済み末端タスクだけを対象に、符号と小数1桁の営業日換算が崩れないことを確認する。
const base: WbsTask = { id: 1, title: "実装", description: "", projectId: 1, projectName: "案件", parentTaskId: null, parentTaskTitle: null, ownerUserId: 1, ownerUserName: "山田", status: "in_progress", progress: 0, countryCode: "JP", plannedStart: "2026-08-03", plannedEnd: "2026-08-14", businessDays: 10, actualStart: null, actualEnd: null, finalized: true };
const snapshot = (progress: number): DailyProgressSnapshot => ({ taskId: 1, date: "2026-08-07", dailyProgress: 5, cumulativeProgress: progress, note: "", latestHistoryType: "progress", latestHistoryDetails: "進捗記録", rescheduleReason: "", delayReason: "" });

describe("project schedule variance combinations", () => {
  it.each([
    [60, .9],
    [50, 0],
    [40, -.9],
  ])("converts cumulative progress %s to %s business days", (progress, expectedDays) => {
    expect(calculateProjectScheduleVariance([base], [snapshot(progress)], "2026-08-07").businessDays).toBe(expectedDays);
  });

  it("excludes a parent task and uses its finalized leaf child", () => {
    const parent = { ...base, id: 9, title: "親", businessDays: 100 };
    const child = { ...base, parentTaskId: 9, parentTaskTitle: "親" };
    expect(calculateProjectScheduleVariance([parent, child], [snapshot(60)], "2026-08-07").businessDays).toBe(.9);
  });

  it("does not claim schedule variance for editing-only tasks", () => {
    expect(calculateProjectScheduleVariance([{ ...base, finalized: false }], [snapshot(90)], "2026-08-07")).toEqual({ businessDays: 0, actualProgress: 0, plannedProgress: 0, trackedTasks: 0 });
  });

  it("reports task delay in decimal business days and checks successor buffer", () => {
    const delayed = calculateTaskScheduleVariance(base, snapshot(40), "2026-08-07");
    expect(delayed).toBe(-1);
    const affected = { ...base, id: 2, title: "後続A", prerequisiteTaskIds: [1], plannedStart: "2026-08-17" };
    const buffered = { ...base, id: 3, title: "後続B", prerequisiteTaskIds: [1], plannedStart: "2026-08-19" };
    const impact = calculateDelayImpact(base, [base, affected, buffered], delayed!);
    expect(impact.projectedEnd).toBe("2026-08-17");
    expect(impact.affectedTasks.map((task) => task.id)).toEqual([2]);
  });
});

// 因子: 親の表示数（0/1/3）、進行中タスク（親のみ/子のみ/親子）、分岐（なし/兄弟）。
// 表示上限を守りながら、共有する祖先と進行中タスクを重複させない。
describe("active task hierarchy combinations", () => {
  const root = { ...base, title: "親" };
  const child = { ...base, id: 2, title: "子", parentTaskId: 1, parentTaskTitle: "親" };
  const sibling = { ...base, id: 3, title: "兄弟", parentTaskId: 1, parentTaskTitle: "親" };

  it.each([0, 1, 3])("keeps each active task once with an ancestor depth of %s", (depth) => {
    const hierarchy = buildActiveTaskHierarchy([root, child, sibling], depth);
    const ids: number[] = [];
    const visit = (nodes: typeof hierarchy) => nodes.forEach((node) => { ids.push(node.task.id); visit(node.children); });
    visit(hierarchy);
    expect(ids.filter((id) => id === 1)).toHaveLength(1);
    expect(ids.filter((id) => id === 2)).toHaveLength(1);
    expect(ids.filter((id) => id === 3)).toHaveLength(1);
  });

  it("shows no parents when the configured depth is zero", () => {
    const inactiveParent = { ...root, status: "not_started" as const };
    const hierarchy = buildActiveTaskHierarchy([inactiveParent, child], 0);
    expect(hierarchy.map((node) => node.task.id)).toEqual([2]);
    expect(hierarchy[0].omittedAncestorCount).toBe(1);
  });
});

// 因子: 日種別（営業日/週末/祝日）、記録状態（未入力/入力済み）、期間（正常/逆転）。
// 過去入力の候補には、期間内の未入力営業日だけを含める。
describe("past progress date combinations", () => {
  it.each([
    ["2026-08-07", [], ["2026-08-07", "2026-08-06", "2026-08-05", "2026-08-04", "2026-08-03"]],
    ["2026-08-09", ["2026-08-06"], ["2026-08-07", "2026-08-05", "2026-08-04", "2026-08-03"]],
    ["2026-08-11", ["2026-08-07"], ["2026-08-10", "2026-08-06", "2026-08-05", "2026-08-04", "2026-08-03"]],
  ] as const)("ends at %s and excludes recorded dates", (end, recorded, expected) => {
    expect(missingProgressDates("2026-08-03", end, "JP", [...recorded])).toEqual(expected);
  });

  it("returns no candidates for an inverted range", () => {
    expect(missingProgressDates("2026-08-08", "2026-08-07", "JP", [])).toEqual([]);
  });
});
