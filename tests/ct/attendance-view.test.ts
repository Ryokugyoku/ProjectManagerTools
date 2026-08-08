import { describe, expect, it } from "vitest";
import { buildAttendanceLeaves, type AttendanceFilters } from "../../src/lib/attendanceView";
import type { UserLeave } from "../../src/lib/wbs";

const leaves: UserLeave[] = [
  { id: 1, userId: 1, userName: "山田", date: "2026-08-14", type: "planned", unit: "full_day", reason: "", customerApproved: false, managerApproved: true, workflowApproved: true, createdAt: "2026-08-01T00:00:00Z" },
  { id: 2, userId: 2, userName: "佐藤", date: "2026-09-30", type: "planned", unit: "morning", reason: "", customerApproved: true, managerApproved: false, workflowApproved: true, createdAt: "2026-08-08T00:00:00Z" },
  { id: 3, userId: 1, userName: "山田", date: "2026-08-20", type: "planned", unit: "afternoon", reason: "", customerApproved: true, managerApproved: true, workflowApproved: true, createdAt: "2026-08-08T00:00:00Z" },
];

// 因子: ユーザー（全員/指定）と承認状況（全件/要対応/承認済み）。
// どの組み合わせでも両条件をANDで適用し、対象外の休暇を混在させない。
describe("attendance filter combinations", () => {
  const cases: Array<{ filters: AttendanceFilters; ids: number[] }> = [
    { filters: { userId: "all", status: "all" }, ids: [1, 2, 3] },
    { filters: { userId: "all", status: "attention" }, ids: [1, 2] },
    { filters: { userId: "all", status: "approved" }, ids: [3] },
    { filters: { userId: 1, status: "all" }, ids: [1, 3] },
    { filters: { userId: 1, status: "attention" }, ids: [1] },
    { filters: { userId: 1, status: "approved" }, ids: [3] },
  ];

  for (const { filters, ids } of cases) {
    it(`${String(filters.userId)} / ${filters.status}`, () => {
      expect(buildAttendanceLeaves(leaves, filters, "2026-08-08", "JP").map(({ leave }) => leave.id)).toEqual(ids);
    });
  }
});
