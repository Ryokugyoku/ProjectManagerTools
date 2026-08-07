import type { WbsTaskInput } from "../../lib/wbs";

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
  if (value === "") throw new Error("今日進んだ進捗を入力してください。");
  return value;
}
