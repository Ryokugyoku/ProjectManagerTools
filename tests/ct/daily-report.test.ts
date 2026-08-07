import { describe, expect, it } from "vitest";

import { calculateProjectScheduleVariance } from "../../src/lib/dailyReport";
import type { DailyProgressSnapshot, WbsTask } from "../../src/lib/wbs";

// 因子: 実績進捗（前倒し/同率/遅延）、計画状態（確定/編集中）、階層（末端/親）。
// 確定済み末端タスクだけを対象に、符号と小数1桁の営業日換算が崩れないことを確認する。
const base: WbsTask = { id: 1, title: "実装", description: "", projectId: 1, projectName: "案件", parentTaskId: null, parentTaskTitle: null, assigneeId: 1, assigneeName: "山田", status: "in_progress", progress: 0, countryCode: "JP", plannedStart: "2026-08-03", plannedEnd: "2026-08-14", businessDays: 10, actualStart: null, actualEnd: null, finalized: true };
const snapshot = (progress: number): DailyProgressSnapshot => ({ taskId: 1, date: "2026-08-07", dailyProgress: 5, cumulativeProgress: progress, note: "" });

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
});
