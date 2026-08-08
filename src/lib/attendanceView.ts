import type { UserLeave } from "./wbs";
import { summarizeLeaveApprovals, type LeaveApprovalSummary } from "./leaveApprovals";

export type AttendanceStatusFilter = "all" | "attention" | "approved";

export type AttendanceFilters = {
  userId: number | "all";
  status: AttendanceStatusFilter;
};

export type AttendanceLeave = {
  leave: UserLeave;
  approval: LeaveApprovalSummary;
};

export function buildAttendanceLeaves(leaves: UserLeave[], filters: AttendanceFilters, today: string, countryCode: string): AttendanceLeave[] {
  const priority = { urgent: 0, pending: 1, complete: 2 } as const;
  return leaves
    .map((leave) => ({ leave, approval: summarizeLeaveApprovals(leave, today, countryCode) }))
    .filter(({ leave }) => filters.userId === "all" || leave.userId === filters.userId)
    .filter(({ approval }) => filters.status === "all" || (filters.status === "attention" ? approval.state !== "complete" : approval.state === "complete"))
    .sort((left, right) => priority[left.approval.state] - priority[right.approval.state] || left.leave.date.localeCompare(right.leave.date) || left.leave.userName.localeCompare(right.leave.userName, "ja"));
}

export function summarizeAttendance(leaves: UserLeave[], today: string, countryCode: string) {
  const approvals = leaves.map((leave) => summarizeLeaveApprovals(leave, today, countryCode));
  return {
    urgent: approvals.filter((approval) => approval.state === "urgent").length,
    pending: approvals.filter((approval) => approval.state === "pending").length,
    approved: approvals.filter((approval) => approval.state === "complete").length,
  };
}
