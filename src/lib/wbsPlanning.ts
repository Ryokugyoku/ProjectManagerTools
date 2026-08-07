import { addCalendarDays, isBusinessDay, parseISODate } from "./calendar";
import type { WbsTask } from "./wbs";

export type TaskSchedule = { plannedStart: string; plannedEnd: string; businessDays: number };
export type ScheduleChange = { taskId: number; before: TaskSchedule; after: TaskSchedule };

export function countBusinessDays(start: string, end: string, countryCode: string): number {
  if (!start || !end || parseISODate(start) > parseISODate(end)) return 0;
  let cursor = start;
  let count = 0;
  while (cursor <= end) {
    if (isBusinessDay(cursor, countryCode)) count += 1;
    cursor = addCalendarDays(cursor, 1);
  }
  return count;
}

export function expectedProgress(task: Pick<WbsTask, "plannedStart" | "plannedEnd" | "businessDays" | "countryCode">, date: string): number {
  if (date < task.plannedStart) return 0;
  if (date >= task.plannedEnd) return 100;
  const elapsed = countBusinessDays(task.plannedStart, date, task.countryCode);
  return Math.min(100, Math.round((elapsed / task.businessDays) * 100));
}

export function isTaskDelayed(task: Pick<WbsTask, "finalized" | "status" | "progress" | "plannedStart" | "plannedEnd" | "businessDays" | "countryCode">, date: string): boolean {
  return task.finalized && task.status !== "completed" && task.progress < expectedProgress(task, date);
}

export type ProgressHealth = "untracked" | "ahead" | "on-track" | "behind";

export function progressHealth(task: Pick<WbsTask, "finalized" | "progress" | "plannedStart" | "plannedEnd" | "businessDays" | "countryCode">, date: string): ProgressHealth {
  if (!task.finalized) return "untracked";
  const planned = expectedProgress(task, date);
  if (task.progress > planned) return "ahead";
  if (task.progress < planned) return "behind";
  return "on-track";
}

export function buildScheduleCascade(tasks: WbsTask[], taskId: number, schedule: TaskSchedule): ScheduleChange[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const target = byId.get(taskId);
  if (!target) throw new Error("変更対象のタスクが見つかりません。");
  const schedules = new Map(tasks.map((task) => [task.id, taskSchedule(task)]));
  schedules.set(taskId, schedule);
  const changes: ScheduleChange[] = [{ taskId, before: taskSchedule(target), after: schedule }];
  let parentId = target.parentTaskId;
  const visited = new Set<number>();
  while (parentId !== null && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) break;
    const children = tasks.filter((task) => task.parentTaskId === parentId);
    const childSchedules = children.map((child) => schedules.get(child.id) ?? taskSchedule(child));
    const plannedStart = childSchedules.map((item) => item.plannedStart).sort()[0];
    const sortedEnds = childSchedules.map((item) => item.plannedEnd).sort();
    const plannedEnd = sortedEnds[sortedEnds.length - 1];
    if (!plannedStart || !plannedEnd) break;
    const after = {
      plannedStart,
      plannedEnd,
      businessDays: Math.max(1, countBusinessDays(plannedStart, plannedEnd, parent.countryCode)),
    };
    const before = schedules.get(parent.id) ?? taskSchedule(parent);
    schedules.set(parent.id, after);
    if (before.plannedStart !== after.plannedStart || before.plannedEnd !== after.plannedEnd || before.businessDays !== after.businessDays) {
      changes.push({ taskId: parent.id, before, after });
    }
    parentId = parent.parentTaskId;
  }
  return changes;
}

export function buildScheduleCascadeForNewChild(tasks: WbsTask[], parentTaskId: number | null, schedule: TaskSchedule): ScheduleChange[] {
  if (parentTaskId === null) return [];
  const byId = new Map(tasks.map((task) => [task.id, task]));
  if (!byId.has(parentTaskId)) throw new Error("親タスクが見つかりません。");
  const schedules = new Map(tasks.map((task) => [task.id, taskSchedule(task)]));
  const changes: ScheduleChange[] = [];
  let currentParentId: number | null = parentTaskId;
  let addedChildSchedule: TaskSchedule | null = schedule;
  const visited = new Set<number>();
  while (currentParentId !== null && !visited.has(currentParentId)) {
    visited.add(currentParentId);
    const parent = byId.get(currentParentId);
    if (!parent) break;
    const childSchedules = tasks
      .filter((task) => task.parentTaskId === currentParentId)
      .map((child) => schedules.get(child.id) ?? taskSchedule(child));
    if (addedChildSchedule) childSchedules.push(addedChildSchedule);
    const plannedStart = childSchedules.map((item) => item.plannedStart).sort()[0];
    const sortedEnds = childSchedules.map((item) => item.plannedEnd).sort();
    const plannedEnd = sortedEnds[sortedEnds.length - 1];
    if (!plannedStart || !plannedEnd) break;
    const after = {
      plannedStart,
      plannedEnd,
      businessDays: Math.max(1, countBusinessDays(plannedStart, plannedEnd, parent.countryCode)),
    };
    const before = schedules.get(parent.id) ?? taskSchedule(parent);
    schedules.set(parent.id, after);
    if (before.plannedStart !== after.plannedStart || before.plannedEnd !== after.plannedEnd || before.businessDays !== after.businessDays) {
      changes.push({ taskId: parent.id, before, after });
    }
    addedChildSchedule = null;
    currentParentId = parent.parentTaskId;
  }
  return changes;
}

export function scheduleChangesRequireReason(tasks: WbsTask[], changes: ScheduleChange[]): boolean {
  const changedTaskIds = new Set(changes.map((change) => change.taskId));
  return tasks.some((task) => changedTaskIds.has(task.id) && task.finalized);
}

function taskSchedule(task: WbsTask): TaskSchedule {
  return { plannedStart: task.plannedStart, plannedEnd: task.plannedEnd, businessDays: task.businessDays };
}
