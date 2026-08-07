import { describe, expect, it } from "vitest";
import type { WbsTask } from "../../src/lib/wbs";
import { isTaskDelayed } from "../../src/lib/wbsPlanning";

const base: WbsTask = {
  id: 1, title: "実装", description: "", projectId: 1, projectName: "案件", parentTaskId: null,
  parentTaskTitle: null, assigneeId: 2, assigneeName: "山田", status: "in_progress", progress: 20,
  countryCode: "JP", plannedStart: "2026-08-03", plannedEnd: "2026-08-14", businessDays: 10,
  actualStart: null, actualEnd: null, finalized: true,
};

describe("planned progress delay combinations", () => {
  // 因子: 確定状態（編集中/確定）、日付（開始前/期間中/終了日）、実績（計画未満/以上）、状態（進行中/完了）
  it.each([
    [false, "2026-08-07", 20, "in_progress", false],
    [true, "2026-08-01", 0, "in_progress", false],
    [true, "2026-08-07", 49, "in_progress", true],
    [true, "2026-08-07", 50, "in_progress", false],
    [true, "2026-08-14", 99, "in_progress", true],
    [true, "2026-08-14", 20, "completed", false],
  ] as const)("finalized=%s date=%s progress=%s status=%s", (finalized, date, progress, status, delayed) => {
    expect(isTaskDelayed({ ...base, finalized, progress, status }, date)).toBe(delayed);
  });
});
