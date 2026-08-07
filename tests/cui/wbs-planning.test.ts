import { describe, expect, it } from "vitest";
import type { WbsTask } from "../../src/lib/wbs";
import { buildScheduleCascade, countBusinessDays, expectedProgress } from "../../src/lib/wbsPlanning";

const base: WbsTask = {
  id: 1, title: "親", description: "", projectId: 1, projectName: "案件", parentTaskId: null,
  parentTaskTitle: null, assigneeId: null, assigneeName: null, status: "not_started", progress: 0,
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

  it("expands and shrinks every ancestor to contain its direct children", () => {
    const child = { ...base, id: 2, title: "子A", parentTaskId: 1, parentTaskTitle: "親", plannedStart: "2026-08-03", plannedEnd: "2026-08-07", businessDays: 5 };
    const sibling = { ...base, id: 3, title: "子B", parentTaskId: 1, parentTaskTitle: "親", plannedStart: "2026-08-10", plannedEnd: "2026-08-14", businessDays: 5 };
    const changes = buildScheduleCascade([base, child, sibling], 2, { plannedStart: "2026-08-05", plannedEnd: "2026-08-06", businessDays: 2 });
    expect(changes).toHaveLength(2);
    expect(changes[1].after).toEqual({ plannedStart: "2026-08-05", plannedEnd: "2026-08-14", businessDays: 7 });
  });
});
