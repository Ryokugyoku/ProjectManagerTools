import { describe, expect, it } from "vitest";
import { summarizeLeaveApprovals } from "../../src/lib/leaveApprovals";
import type { UserLeave } from "../../src/lib/wbs";

const leave: UserLeave = {
  id: 1, userId: 2, userName: "山田", date: "2026-08-17", type: "planned", unit: "full_day", reason: "",
  customerApproved: false, managerApproved: false, workflowApproved: false, createdAt: "2026-08-03T00:00:00Z",
};

describe("休暇承認の組合せ判定", () => {
  it.each([
    ["すべて承認済み", { ...leave, customerApproved: true, managerApproved: true, workflowApproved: true }, "2026-08-10", "complete", 0],
    ["5営業日前より前の顧客・上長未承認", { ...leave, workflowApproved: true }, "2026-08-06", "pending", 0],
    ["5営業日前当日の顧客・上長未承認", { ...leave, workflowApproved: true }, "2026-08-07", "urgent", 2],
    ["登録から2営業日の業務フロー未承認", { ...leave, customerApproved: true, managerApproved: true, createdAt: "2026-08-06T00:00:00Z" }, "2026-08-10", "pending", 0],
    ["登録から3営業日の業務フロー未承認", { ...leave, customerApproved: true, managerApproved: true, createdAt: "2026-08-06T00:00:00Z" }, "2026-08-12", "urgent", 1],
  ] as const)("%s", (_name, input, today, state, urgentCount) => {
    const result = summarizeLeaveApprovals(input, today, "JP");
    expect(result.state).toBe(state);
    expect(result.urgent).toHaveLength(urgentCount);
  });

  it("一部承認済みの場合は未承認項目だけを返す", () => {
    const result = summarizeLeaveApprovals({ ...leave, customerApproved: true, workflowApproved: true }, "2026-08-10", "JP");
    expect(result.pending).toEqual(["managerApproved"]);
    expect(result.urgent).toEqual(["managerApproved"]);
  });
});
