import { describe, expect, it } from "vitest";
import type { WbsTask } from "../../src/lib/wbs";
import { availableWorkdays, deriveParentProgress, expectedProgress, isTaskDelayed } from "../../src/lib/wbsPlanning";

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

describe("休暇を含む計画進捗の組み合わせ", () => {
  // 因子: 取得単位（全休/午前半休/午後半休）、評価時点（午前終了/日終了）。
  // 期日は固定し、休暇分を残りの稼働可能時間へ再配分する。
  const plan = { ...base, plannedStart: "2026-08-03", plannedEnd: "2026-08-05", businessDays: 3 };

  it("3営業日のうち1日全休なら、稼働可能な2日へ50%ずつ配分する", () => {
    const assigneeLeaves = [{ id: 1, userId: 2, userName: "山田", date: "2026-08-04", type: "planned" as const, unit: "full_day" as const, reason: "", customerApproved: false, managerApproved: false, workflowApproved: false, createdAt: "2026-08-01T00:00:00Z" }];
    expect(availableWorkdays(plan.plannedStart, plan.plannedEnd, plan.countryCode, assigneeLeaves)).toBe(2);
    expect(expectedProgress({ ...plan, assigneeLeaves }, "2026-08-03")).toBe(50);
    expect(expectedProgress({ ...plan, assigneeLeaves }, "2026-08-04")).toBe(50);
    expect(expectedProgress({ ...plan, assigneeLeaves }, "2026-08-05")).toBe(100);
  });

  it("午前終了時は、午前半休と午後半休で期待進捗を分ける", () => {
    const leave = { id: 1, userId: 2, userName: "山田", date: "2026-08-04", type: "planned" as const, reason: "", customerApproved: false, managerApproved: false, workflowApproved: false, createdAt: "2026-08-01T00:00:00Z" };
    expect(expectedProgress({ ...plan, assigneeLeaves: [{ ...leave, unit: "morning" }] }, "2026-08-04", "morning")).toBe(40);
    expect(expectedProgress({ ...plan, assigneeLeaves: [{ ...leave, unit: "afternoon" }] }, "2026-08-04", "morning")).toBe(60);
  });
});

describe("parent progress combinations", () => {
  // 因子: 子の進捗（未着手/進行中/完了）、営業日数（同じ/異なる）、親の保留状態（通常/保留）。
  // 子を持つ親は常に営業日数で重み付けされ、保留だけは進捗から状態を変更しない。
  it.each([
    [0, 0, 1, 1, "in_progress", 0, "not_started"],
    [100, 0, 1, 1, "in_progress", 50, "in_progress"],
    [100, 0, 1, 3, "in_progress", 25, "in_progress"],
    [100, 100, 1, 3, "in_progress", 100, "completed"],
    [100, 0, 1, 1, "on_hold", 50, "on_hold"],
  ] as const)("progresses=%s/%s weights=%s/%s status=%s", (first, second, firstDays, secondDays, parentStatus, expected, expectedStatus) => {
    const parent = { ...base, status: parentStatus };
    const children = [
      { ...base, id: 2, parentTaskId: 1, progress: first, businessDays: firstDays },
      { ...base, id: 3, parentTaskId: 1, progress: second, businessDays: secondDays },
    ];
    expect(deriveParentProgress([parent, ...children])[0]).toMatchObject({ progress: expected, status: expectedStatus });
  });
});
