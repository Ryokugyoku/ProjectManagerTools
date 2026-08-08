import { addCalendarDays, calculateEndDate, isBusinessDay, parseISODate, shiftBusinessDate } from "./calendar";
import type { UserLeave, WbsTask } from "./wbs";

export type TaskSchedule = { plannedStart: string; plannedEnd: string; businessDays: number };
export type ScheduleChange = { taskId: number; before: TaskSchedule; after: TaskSchedule; historyContext?: string };

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

type ProgressPlan = Pick<WbsTask, "plannedStart" | "plannedEnd" | "businessDays" | "countryCode" | "scheduleAssigned"> & { ownerLeaves?: UserLeave[] };
export type DayCheckpoint = "none" | "morning" | "day";

export function availableWorkdays(start: string, end: string, countryCode: string, leaves: UserLeave[] = []): number {
  if (!start || !end || parseISODate(start) > parseISODate(end)) return 0;
  const leaveByDate = new Map(leaves.map((leave) => [leave.date, leave.unit === "full_day" ? 1 : .5]));
  let cursor = start;
  let capacity = 0;
  while (cursor <= end) {
    if (isBusinessDay(cursor, countryCode)) capacity += Math.max(0, 1 - (leaveByDate.get(cursor) ?? 0));
    cursor = addCalendarDays(cursor, 1);
  }
  return capacity;
}

export function expectedProgress(task: ProgressPlan, date: string, checkpoint: DayCheckpoint = "day"): number {
  if (task.scheduleAssigned === false) return 0;
  if (date < task.plannedStart) return 0;
  if (date > task.plannedEnd || (date === task.plannedEnd && checkpoint === "day")) return 100;
  const leaveReduction = (task.ownerLeaves ?? []).reduce((sum, leave) => {
    if (leave.date < task.plannedStart || leave.date > task.plannedEnd || !isBusinessDay(leave.date, task.countryCode)) return sum;
    return sum + (leave.unit === "full_day" ? 1 : .5);
  }, 0);
  const available = Math.max(0, task.businessDays - leaveReduction);
  if (available <= 0) return 0;
  const previousDate = addCalendarDays(date, -1);
  const elapsedBeforeToday = availableWorkdays(task.plannedStart, previousDate, task.countryCode, task.ownerLeaves);
  const elapsed = elapsedBeforeToday + availableCapacityAtCheckpoint(date, task.countryCode, task.ownerLeaves, checkpoint);
  return Math.min(100, Math.round((elapsed / available) * 100));
}

export function isTaskDelayed(task: Pick<WbsTask, "finalized" | "status" | "progress" | "plannedStart" | "plannedEnd" | "businessDays" | "countryCode" | "scheduleAssigned" | "ownerLeaves">, date: string): boolean {
  if (task.scheduleAssigned === false) return false;
  return task.finalized && task.status !== "completed" && task.progress < expectedProgress(task, date);
}

export type ProgressHealth = "untracked" | "ahead" | "on-track" | "behind";

export function progressHealth(task: Pick<WbsTask, "finalized" | "progress" | "plannedStart" | "plannedEnd" | "businessDays" | "countryCode" | "scheduleAssigned" | "ownerLeaves">, date: string): ProgressHealth {
  if (!task.finalized || task.scheduleAssigned === false) return "untracked";
  const planned = expectedProgress(task, date);
  if (task.progress > planned) return "ahead";
  if (task.progress < planned) return "behind";
  return "on-track";
}

export function currentDayCheckpoint(now = new Date()): DayCheckpoint {
  return now.getHours() < 12 ? "none" : "morning";
}

function availableCapacityAtCheckpoint(date: string, countryCode: string, leaves: UserLeave[] | undefined, checkpoint: DayCheckpoint): number {
  if (!isBusinessDay(date, countryCode) || checkpoint === "none") return 0;
  const leave = leaves?.find((item) => item.date === date);
  if (checkpoint === "day") return leave?.unit === "full_day" ? 0 : leave ? .5 : 1;
  return leave?.unit === "full_day" || leave?.unit === "morning" ? 0 : .5;
}

export function buildScheduleCascade(tasks: WbsTask[], taskId: number, schedule: TaskSchedule): ScheduleChange[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const target = byId.get(taskId);
  if (!target) throw new Error("変更対象のタスクが見つかりません。");
  const schedules = new Map(tasks.map((task) => [task.id, taskSchedule(task)]));
  schedules.set(taskId, schedule);
  const changes: ScheduleChange[] = [{ taskId, before: taskSchedule(target), after: schedule }];
  const movedWithoutResizing = target.scheduleAssigned !== false && target.plannedStart !== schedule.plannedStart && target.businessDays === schedule.businessDays;
  if (movedWithoutResizing) {
    const offset = businessDayOffset(target.plannedStart, schedule.plannedStart, target.countryCode);
    const pending = tasks.filter((task) => task.parentTaskId === target.id && task.scheduleAssigned !== false);
    const visitedDescendants = new Set<number>();
    while (pending.length > 0) {
      const child = pending.shift();
      if (!child || visitedDescendants.has(child.id)) continue;
      visitedDescendants.add(child.id);
      const plannedStart = shiftBusinessDate(child.plannedStart, offset, child.countryCode);
      const after = {
        plannedStart,
        plannedEnd: calculateEndDate(plannedStart, child.businessDays, child.countryCode),
        businessDays: child.businessDays,
      };
      schedules.set(child.id, after);
      changes.push({
        taskId: child.id,
        before: taskSchedule(child),
        after,
        historyContext: `親タスク「${target.title}」の移動に連動`,
      });
      pending.push(...tasks.filter((task) => task.parentTaskId === child.id && task.scheduleAssigned !== false));
    }
  }
  let parentId = target.parentTaskId;
  const visited = new Set<number>();
  while (parentId !== null && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) break;
    const children = tasks.filter((task) => task.parentTaskId === parentId && (task.scheduleAssigned !== false || task.id === taskId));
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

export function buildAncestorEndExtensions(tasks: WbsTask[], parentTaskId: number | null, requiredEnd: string, childTitle: string): ScheduleChange[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const changes: ScheduleChange[] = [];
  const visited = new Set<number>();
  let parentId = parentTaskId;
  let descendantEnd = requiredEnd;
  while (parentId !== null && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) break;
    const before = taskSchedule(parent);
    const plannedEnd = before.plannedEnd < descendantEnd ? descendantEnd : before.plannedEnd;
    if (plannedEnd !== before.plannedEnd) {
      changes.push({
        taskId: parent.id,
        before,
        after: {
          plannedStart: before.plannedStart,
          plannedEnd,
          businessDays: Math.max(1, countBusinessDays(before.plannedStart, plannedEnd, parent.countryCode)),
        },
        historyContext: `サブタスク「${childTitle}」の追加に連動`,
      });
    }
    descendantEnd = plannedEnd;
    parentId = parent.parentTaskId;
  }
  return changes;
}

export function deriveParentProgress(tasks: WbsTask[]): WbsTask[] {
  const children = new Map<number, WbsTask[]>();
  for (const task of tasks) {
    if (task.parentTaskId !== null && task.scheduleAssigned !== false) children.set(task.parentTaskId, [...(children.get(task.parentTaskId) ?? []), task]);
  }
  const progressById = new Map<number, number>();
  const visiting = new Set<number>();
  function progress(task: WbsTask): number {
    const cached = progressById.get(task.id);
    if (cached !== undefined) return cached;
    if (visiting.has(task.id)) return task.progress;
    visiting.add(task.id);
    const directChildren = children.get(task.id) ?? [];
    const totalWeight = directChildren.reduce((sum, child) => sum + Math.max(1, child.businessDays), 0);
    const value = directChildren.length === 0
      ? task.progress
      : Math.round(directChildren.reduce((sum, child) => sum + progress(child) * Math.max(1, child.businessDays), 0) / totalWeight);
    visiting.delete(task.id);
    progressById.set(task.id, value);
    return value;
  }
  return tasks.map((task) => {
    if (!children.has(task.id)) return task;
    const derived = progress(task);
    const status = task.status === "on_hold" ? task.status : derived === 100 ? "completed" : derived > 0 ? "in_progress" : "not_started";
    return { ...task, progress: derived, status };
  });
}

export function scheduleChangesRequireReason(tasks: WbsTask[], changes: ScheduleChange[]): boolean {
  const changedTaskIds = new Set(changes.map((change) => change.taskId));
  return tasks.some((task) => changedTaskIds.has(task.id) && task.finalized);
}

function taskSchedule(task: WbsTask): TaskSchedule {
  return { plannedStart: task.plannedStart, plannedEnd: task.plannedEnd, businessDays: task.businessDays };
}

function businessDayOffset(start: string, end: string, countryCode: string): number {
  if (start === end) return 0;
  const direction = start < end ? 1 : -1;
  let cursor = start;
  let offset = 0;
  while (cursor !== end) {
    cursor = addCalendarDays(cursor, direction);
    if (isBusinessDay(cursor, countryCode)) offset += direction;
  }
  return offset;
}
