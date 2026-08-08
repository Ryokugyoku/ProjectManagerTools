import type { WbsTaskInput } from "../../lib/wbs";
import { addCalendarDays, isBusinessDay } from "../../lib/calendar";

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

export function missingProgressDates(start: string, end: string, countryCode: string, recordedDates: string[]): string[] {
  if (!start || !end || start > end) return [];
  const recorded = new Set(recordedDates);
  const result: string[] = [];
  for (let date = start; date <= end; date = addCalendarDays(date, 1)) {
    if (isBusinessDay(date, countryCode) && !recorded.has(date)) result.push(date);
  }
  return result.reverse();
}
