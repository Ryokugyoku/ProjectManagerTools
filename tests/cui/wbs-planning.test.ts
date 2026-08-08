import { describe, expect, it } from "vitest";
import type { WbsTask } from "../../src/lib/wbs";
import { buildScheduleCascade, buildScheduleCascadeForNewChild, countBusinessDays, deriveParentProgress, expectedProgress, progressHealth, scheduleChangesRequireReason } from "../../src/lib/wbsPlanning";

const base: WbsTask = {
  id: 1, title: "親", description: "", projectId: 1, projectName: "案件", parentTaskId: null,
  parentTaskTitle: null, ownerUserId: null, ownerUserName: null, status: "not_started", progress: 0,
  countryCode: "JP", plannedStart: "2026-08-03", plannedEnd: "2026-08-14", businessDays: 9,
  actualStart: null, actualEnd: null, finalized: true,
};

describe("WBS planning methods", () => {
  it("counts business days and calculates planned cumulative progress", () => {
    expect(countBusinessDays("2026-08-03", "2026-08-07", "JP")).toBe(5);
    expect(expectedProgress({ ...base, businessDays: 10, plannedEnd: "2026-08-17" }, "2026-08-07")).toBe(50);
    expect(expectedProgress(base, "2026-08-01")).toBe(0);
    expect(expectedProgress(base, "2026-08-14")).toBe(100);
  });

  it("classifies actual progress against today's plan", () => {
    const planned = { ...base, businessDays: 10, plannedEnd: "2026-08-17" };
    expect(progressHealth({ ...planned, finalized: false, progress: 10 }, "2026-08-07")).toBe("untracked");
    expect(progressHealth({ ...planned, progress: 60 }, "2026-08-07")).toBe("ahead");
    expect(progressHealth({ ...planned, progress: 50 }, "2026-08-07")).toBe("on-track");
    expect(progressHealth({ ...planned, progress: 40 }, "2026-08-07")).toBe("behind");
  });

  it("expands and shrinks every ancestor to contain its direct children", () => {
    const child = { ...base, id: 2, title: "子A", parentTaskId: 1, parentTaskTitle: "親", plannedStart: "2026-08-03", plannedEnd: "2026-08-07", businessDays: 5 };
    const sibling = { ...base, id: 3, title: "子B", parentTaskId: 1, parentTaskTitle: "親", plannedStart: "2026-08-10", plannedEnd: "2026-08-14", businessDays: 5 };
    const changes = buildScheduleCascade([base, child, sibling], 2, { plannedStart: "2026-08-05", plannedEnd: "2026-08-06", businessDays: 2 });
    expect(changes).toHaveLength(2);
    expect(changes[1].after).toEqual({ plannedStart: "2026-08-05", plannedEnd: "2026-08-14", businessDays: 7 });
  });

  it("moves every descendant by the same business-day offset when sliding a parent", () => {
    const child = { ...base, id: 2, title: "子", parentTaskId: 1, parentTaskTitle: "親", plannedStart: "2026-08-03", plannedEnd: "2026-08-07", businessDays: 5 };
    const grandchild = { ...child, id: 3, title: "孫", parentTaskId: 2, parentTaskTitle: "子", plannedStart: "2026-08-04", plannedEnd: "2026-08-06", businessDays: 3 };
    const changes = buildScheduleCascade([base, child, grandchild], 1, { plannedStart: "2026-08-05", plannedEnd: "2026-08-18", businessDays: 9 });
    expect(changes.map((change) => [change.taskId, change.after.plannedStart, change.after.plannedEnd])).toEqual([
      [1, "2026-08-05", "2026-08-18"],
      [2, "2026-08-05", "2026-08-12"],
      [3, "2026-08-06", "2026-08-10"],
    ]);
    expect(changes.map((change) => change.historyContext)).toEqual([
      undefined,
      "親タスク「親」の移動に連動",
      "親タスク「親」の移動に連動",
    ]);
  });

  it("derives recursive parent progress using direct child business-day weights", () => {
    const childA = { ...base, id: 2, title: "子A", parentTaskId: 1, parentTaskTitle: "親", progress: 100, businessDays: 2 };
    const childB = { ...base, id: 3, title: "子B", parentTaskId: 1, parentTaskTitle: "親", progress: 0, businessDays: 6 };
    const grandchild = { ...base, id: 4, title: "孫", parentTaskId: 3, parentTaskTitle: "子B", progress: 50, businessDays: 6 };
    const derived = deriveParentProgress([base, childA, childB, grandchild]);
    expect(derived.find((task) => task.id === 3)).toMatchObject({ progress: 50, status: "in_progress" });
    expect(derived.find((task) => task.id === 1)).toMatchObject({ progress: 63, status: "in_progress" });
  });

  it("updates ancestors when a new child extends their schedule", () => {
    const child = { ...base, id: 2, title: "既存の子", parentTaskId: 1, parentTaskTitle: "親", plannedStart: "2026-08-03", plannedEnd: "2026-08-07", businessDays: 5 };
    const changes = buildScheduleCascadeForNewChild([base, child], 1, { plannedStart: "2026-08-10", plannedEnd: "2026-08-18", businessDays: 6 });
    expect(changes).toEqual([{
      taskId: 1,
      before: { plannedStart: "2026-08-03", plannedEnd: "2026-08-14", businessDays: 9 },
      after: { plannedStart: "2026-08-03", plannedEnd: "2026-08-18", businessDays: 11 },
    }]);
  });

  it("requires a reason only when a finalized ancestor schedule changes", () => {
    const changed = [{
      taskId: 1,
      before: { plannedStart: "2026-08-03", plannedEnd: "2026-08-14", businessDays: 9 },
      after: { plannedStart: "2026-08-03", plannedEnd: "2026-08-18", businessDays: 11 },
    }];
    expect(scheduleChangesRequireReason([base], changed)).toBe(true);
    expect(scheduleChangesRequireReason([{ ...base, finalized: false }], changed)).toBe(false);
    expect(scheduleChangesRequireReason([base], [])).toBe(false);
  });
});
