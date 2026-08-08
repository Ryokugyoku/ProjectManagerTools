import { describe, expect, it } from "vitest";
import { buildAttendanceLeaves, summarizeAttendance } from "../../src/lib/attendanceView";
import type { UserLeave } from "../../src/lib/wbs";

const leaves: UserLeave[] = [
  { id: 1, userId: 1, userName: "山田", date: "2026-08-14", type: "planned", unit: "full_day", reason: "", customerApproved: false, managerApproved: true, workflowApproved: true, createdAt: "2026-08-01T00:00:00Z" },
  { id: 2, userId: 2, userName: "佐藤", date: "2026-09-30", type: "planned", unit: "morning", reason: "通院", customerApproved: true, managerApproved: false, workflowApproved: true, createdAt: "2026-08-08T00:00:00Z" },
  { id: 3, userId: 1, userName: "山田", date: "2026-08-20", type: "planned", unit: "afternoon", reason: "", customerApproved: true, managerApproved: true, workflowApproved: true, createdAt: "2026-08-08T00:00:00Z" },
];

describe("attendance view methods", () => {
  it("orders urgent, pending, and approved records for action", () => {
    expect(buildAttendanceLeaves(leaves, { userId: "all", status: "all" }, "2026-08-08", "JP").map(({ leave }) => leave.id)).toEqual([1, 2, 3]);
  });

  it("summarizes approval work without dropping approved leave", () => {
    expect(summarizeAttendance(leaves, "2026-08-08", "JP")).toEqual({ urgent: 1, pending: 1, approved: 1 });
  });
});
