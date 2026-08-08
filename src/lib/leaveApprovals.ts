import { formatISODate, shiftBusinessDate } from "./calendar";
import type { UserLeave } from "./wbs";

export type LeaveApprovalKey = "customerApproved" | "managerApproved" | "workflowApproved";
export type LeaveApprovalState = "complete" | "pending" | "urgent";
export type LeaveApprovalSummary = {
  state: LeaveApprovalState;
  pending: LeaveApprovalKey[];
  urgent: LeaveApprovalKey[];
};

export const leaveApprovalLabels: Record<LeaveApprovalKey, string> = {
  customerApproved: "顧客承認",
  managerApproved: "上長承認",
  workflowApproved: "業務フロー承認",
};

export function summarizeLeaveApprovals(
  leave: UserLeave,
  today = formatISODate(new Date()),
  countryCode = "JP",
): LeaveApprovalSummary {
  const pending = (Object.keys(leaveApprovalLabels) as LeaveApprovalKey[]).filter((key) => !leave[key]);
  if (pending.length === 0) return { state: "complete", pending, urgent: [] };

  const approvalDeadline = shiftBusinessDate(leave.date, -5, countryCode);
  const workflowDeadline = shiftBusinessDate(leave.createdAt.slice(0, 10), 3, countryCode);
  const urgent = pending.filter((key) => key === "workflowApproved"
    ? today >= workflowDeadline
    : today >= approvalDeadline);
  return { state: urgent.length > 0 ? "urgent" : "pending", pending, urgent };
}

export function pendingApprovalLabel(keys: LeaveApprovalKey[]): string {
  return keys.map((key) => leaveApprovalLabels[key]).join("・");
}
