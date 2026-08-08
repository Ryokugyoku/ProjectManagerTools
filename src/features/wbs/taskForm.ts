import type { WbsTaskInput } from "../../lib/wbs";
import { addCalendarDays, isBusinessDay, shiftBusinessDate } from "../../lib/calendar";
import type { WbsStatus, WbsTask } from "../../lib/wbs";

export type WbsTaskForm = Omit<WbsTaskInput, "businessDays"> & {
  businessDays: number | "";
};

export function parseBusinessDaysInput(value: string): number | "" {
  return value === "" ? "" : Math.max(1, Number(value));
}

export function businessDaysOrDefault(value: number | ""): number {
  return value === "" ? 1 : value;
}

export function requireDailyProgress(value: number | ""): number {
  if (value === "") throw new Error("その日に進んだ進捗を入力してください。");
  return value;
}

export function earliestPrerequisiteStart(tasks: WbsTask[], prerequisiteTaskIds: number[], countryCode: string): string | null {
  const plannedEnds = prerequisiteTaskIds
    .map((id) => tasks.find((task) => task.id === id)?.plannedEnd)
    .filter((value): value is string => Boolean(value));
  if (plannedEnds.length === 0) return null;
  plannedEnds.sort();
  return shiftBusinessDate(plannedEnds[plannedEnds.length - 1], 1, countryCode);
}

export function requiresEarlyStartReason(dailyProgress: number | "", prerequisites: Array<{ status: WbsStatus }>): boolean {
  return dailyProgress !== "" && dailyProgress > 0 && prerequisites.some((task) => task.status !== "completed");
}

export function missingProgressDates(start: string, end: string, countryCode: string, recordedDates: string[]): string[] {
  if (!start || !end || start > end) return [];
  const recorded = new Set(recordedDates);
  const result: string[] = [];
  for (let date = start; date <= end; date = addCalendarDays(date, 1)) {
    if (isBusinessDay(date, countryCode) && !recorded.has(date)) result.push(date);
  }
  return result.reverse();
}
