import type { Project } from "./projects";
import { addCalendarDays, calculateEndDate, parseISODate, shiftBusinessDate } from "./calendar";
import type { Milestone } from "./milestones";
import type { UserProfile, WbsStatus, WbsTask } from "./wbs";
import { isTaskDelayed } from "./wbsPlanning";

export type WbsGroupBy = "project" | "user";
export type WbsFilterValue = "all" | "unset" | number;
export type WbsAttentionFilter = "all" | "open" | "overdue" | "unassigned" | "schedule_unassigned";
export type WbsFilters = {
  query: string;
  projectId: WbsFilterValue;
  ownerUserId: WbsFilterValue;
  status: "all" | WbsStatus;
  attention: WbsAttentionFilter;
};

export type WbsGroup = {
  key: string;
  label: string;
  detail: string;
  initials: string;
  tasks: WbsTask[];
};

export type WbsTreeItem = { task: WbsTask; depth: number };
export type DescendantAttention = {
  count: number;
  overdue: number;
  delayed: number;
  unassigned: number;
  scheduleUnassigned: number;
};

export type TimelineDateRange = { start: string; end: string; days: number };
export type TimelineMonth = { key: string; label: string; days: number };
export type SchedulePreview = { plannedStart: string; plannedEnd: string; businessDays: number };

export function calculateSchedulePreview(task: Pick<WbsTask, "plannedStart" | "businessDays">, mode: "move" | "left" | "right", delta: number, countryCode: string): SchedulePreview {
  let plannedStart = task.plannedStart;
  let businessDays = task.businessDays;
  if (mode === "move") plannedStart = shiftBusinessDate(task.plannedStart, delta, countryCode);
  else if (mode === "right") businessDays = Math.max(1, task.businessDays + delta);
  else {
    businessDays = Math.max(1, task.businessDays - delta);
    plannedStart = shiftBusinessDate(task.plannedStart, task.businessDays - businessDays, countryCode);
  }
  return { plannedStart, businessDays, plannedEnd: calculateEndDate(plannedStart, businessDays, countryCode) };
}

export function buildTimelineDateRange(
  tasks: WbsTask[],
  milestones: Milestone[],
  today: string,
  minimumDays = 42,
): TimelineDateRange {
  const values = [
    today,
    ...tasks.filter((task) => task.scheduleAssigned !== false).flatMap((task) => [task.plannedStart, task.plannedEnd]),
    ...milestones.map((milestone) => milestone.dueDate),
  ].filter(Boolean).sort();
  const start = addCalendarDays(values[0] ?? today, -7);
  const latest = addCalendarDays(values[values.length - 1] ?? today, 7);
  const span = Math.round((parseISODate(latest).getTime() - parseISODate(start).getTime()) / 86_400_000) + 1;
  const days = Math.max(minimumDays, span);
  return { start, end: addCalendarDays(start, days - 1), days };
}

export function buildTimelineMonths(dates: string[]): TimelineMonth[] {
  const months: TimelineMonth[] = [];
  for (const date of dates) {
    const key = date.slice(0, 7);
    const current = months[months.length - 1];
    if (current?.key === key) current.days += 1;
    else {
      const parsed = parseISODate(date);
      months.push({
        key,
        label: `${parsed.getFullYear()}年${parsed.getMonth() + 1}月`,
        days: 1,
      });
    }
  }
  return months;
}

export function filterWbsTasks(tasks: WbsTask[], filters: WbsFilters, today = new Date().toLocaleDateString("sv-SE")): WbsTask[] {
  const query = filters.query.trim().toLocaleLowerCase("ja-JP");
  return tasks.filter((task) => {
    const searchable = [task.title, task.description, task.projectName ?? "", task.ownerUserName ?? ""]
      .join(" ")
      .toLocaleLowerCase("ja-JP");
    return (!query || searchable.includes(query))
      && matchesId(task.projectId, filters.projectId)
      && matchesId(task.ownerUserId, filters.ownerUserId)
      && (filters.status === "all" || task.status === filters.status)
      && matchesAttention(task, filters.attention, today);
  });
}

export function withoutAttention(filters: WbsFilters): WbsFilters {
  return { ...filters, attention: "all" };
}

export function includeMatchingAncestors(tasks: WbsTask[], matches: WbsTask[]): WbsTask[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const visible = new Set(matches.map((task) => task.id));
  for (const match of matches) {
    const visited = new Set<number>([match.id]);
    let parentId = match.parentTaskId;
    while (parentId !== null && !visited.has(parentId)) {
      visited.add(parentId);
      const parent = byId.get(parentId);
      if (!parent) break;
      visible.add(parent.id);
      parentId = parent.parentTaskId;
    }
  }
  return tasks.filter((task) => visible.has(task.id));
}

export function summarizeWbsTasks(tasks: WbsTask[], today: string) {
  const open = tasks.filter((task) => task.status !== "completed");
  return {
    total: tasks.length,
    open: open.length,
    overdue: open.filter((task) => task.scheduleAssigned !== false && task.plannedEnd < today).length,
    delayed: open.filter((task) => isTaskDelayed(task, today)).length,
    unassigned: tasks.filter((task) => task.ownerUserId === null).length,
    scheduleUnassigned: tasks.filter((task) => task.scheduleAssigned === false).length,
    averageProgress: tasks.length
      ? Math.round(tasks.reduce((sum, task) => sum + task.progress, 0) / tasks.length)
      : 0,
  };
}

export function buildWbsGroups(
  tasks: WbsTask[],
  groupBy: WbsGroupBy,
  projects: Project[],
  users: UserProfile[],
): WbsGroup[] {
  const definitions = groupBy === "project"
    ? projects.map((project) => ({
      id: project.id,
      label: project.name,
      detail: `${project.code} · ${project.members.length}人`,
    }))
    : users.map((person) => ({
      id: person.id,
      label: person.name,
      detail: person.role || person.department || "役割未設定",
    }));
  const idFor = (task: WbsTask) => groupBy === "project" ? task.projectId : task.ownerUserId;
  const groups = definitions.map((definition) => ({
    key: `${groupBy}-${definition.id}`,
    label: definition.label,
    detail: definition.detail,
    initials: initials(definition.label),
    tasks: flattenWbsTaskTree(tasks.filter((task) => idFor(task) === definition.id)).map((item) => item.task),
  })).filter((group) => group.tasks.length > 0);
  const unset = tasks.filter((task) => idFor(task) === null);
  if (unset.length > 0) {
    groups.push({
      key: `${groupBy}-unset`,
      label: groupBy === "project" ? "案件未設定" : "責任者未設定",
      detail: groupBy === "project" ? "案件との紐づけが必要です" : "責任者の設定が必要です",
      initials: "–",
      tasks: unset,
    });
  }
  return groups;
}

export function flattenWbsTaskTree(tasks: WbsTask[]): WbsTreeItem[] {
  const taskIds = new Set(tasks.map((task) => task.id));
  const children = new Map<number | null, WbsTask[]>();
  for (const task of tasks) {
    const parentId = task.parentTaskId !== null && taskIds.has(task.parentTaskId) ? task.parentTaskId : null;
    children.set(parentId, [...(children.get(parentId) ?? []), task]);
  }
  const result: WbsTreeItem[] = [];
  const visited = new Set<number>();
  function append(task: WbsTask, depth: number) {
    if (visited.has(task.id)) return;
    visited.add(task.id);
    result.push({ task, depth });
    for (const child of children.get(task.id) ?? []) append(child, depth + 1);
  }
  for (const root of children.get(null) ?? []) append(root, 0);
  for (const task of tasks) {
    if (visited.has(task.id)) continue;
    let parentId = task.parentTaskId;
    const ancestorIds = new Set<number>();
    let hiddenByVisitedAncestor = false;
    while (parentId !== null && taskIds.has(parentId) && !ancestorIds.has(parentId)) {
      if (visited.has(parentId)) { hiddenByVisitedAncestor = true; break; }
      ancestorIds.add(parentId);
      parentId = tasks.find((candidate) => candidate.id === parentId)?.parentTaskId ?? null;
    }
    if (hiddenByVisitedAncestor) continue;
    append(task, 0);
  }
  return result;
}

export function visibleWbsTaskTree(tasks: WbsTask[], collapsedIds: ReadonlySet<number>, revealedIds: ReadonlySet<number> = new Set()): WbsTreeItem[] {
  const taskIds = new Set(tasks.map((task) => task.id));
  const children = new Map<number | null, WbsTask[]>();
  for (const task of tasks) {
    const parentId = task.parentTaskId !== null && taskIds.has(task.parentTaskId) ? task.parentTaskId : null;
    children.set(parentId, [...(children.get(parentId) ?? []), task]);
  }
  const hasRevealedDescendant = new Set<number>();
  for (const task of tasks) {
    if (!revealedIds.has(task.id)) continue;
    let parentId = task.parentTaskId;
    const visited = new Set<number>();
    while (parentId !== null && !visited.has(parentId)) {
      visited.add(parentId);
      hasRevealedDescendant.add(parentId);
      parentId = taskIds.has(parentId) ? tasks.find((candidate) => candidate.id === parentId)?.parentTaskId ?? null : null;
    }
  }
  const result: WbsTreeItem[] = [];
  const visited = new Set<number>();
  function append(task: WbsTask, depth: number) {
    if (visited.has(task.id)) return;
    visited.add(task.id);
    result.push({ task, depth });
    if (collapsedIds.has(task.id) && !hasRevealedDescendant.has(task.id)) return;
    for (const child of children.get(task.id) ?? []) append(child, depth + 1);
  }
  for (const root of children.get(null) ?? []) append(root, 0);
  for (const task of tasks) {
    if (visited.has(task.id)) continue;
    let parentId = task.parentTaskId;
    const ancestorIds = new Set<number>();
    let hiddenByVisitedAncestor = false;
    while (parentId !== null && taskIds.has(parentId) && !ancestorIds.has(parentId)) {
      if (visited.has(parentId)) { hiddenByVisitedAncestor = true; break; }
      ancestorIds.add(parentId);
      parentId = tasks.find((candidate) => candidate.id === parentId)?.parentTaskId ?? null;
    }
    if (hiddenByVisitedAncestor) continue;
    append(task, 0);
  }
  return result;
}

export function summarizeDescendants(tasks: WbsTask[], parentId: number, today: string): DescendantAttention {
  const descendants: WbsTask[] = [];
  const pending = [parentId];
  const visited = new Set<number>();
  while (pending.length > 0) {
    const id = pending.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    for (const task of tasks) if (task.parentTaskId === id) { descendants.push(task); pending.push(task.id); }
  }
  const open = descendants.filter((task) => task.status !== "completed");
  return {
    count: descendants.length,
    overdue: open.filter((task) => task.scheduleAssigned !== false && task.plannedEnd < today).length,
    delayed: open.filter((task) => isTaskDelayed(task, today)).length,
    unassigned: descendants.filter((task) => task.ownerUserId === null).length,
    scheduleUnassigned: descendants.filter((task) => task.scheduleAssigned === false).length,
  };
}

export function parentTaskCandidates(tasks: WbsTask[], projectId: number | null, currentTaskId: number | null): WbsTask[] {
  if (projectId === null) return [];
  const excluded = new Set<number>();
  if (currentTaskId !== null) {
    const pending = [currentTaskId];
    while (pending.length > 0) {
      const id = pending.pop()!;
      if (excluded.has(id)) continue;
      excluded.add(id);
      for (const task of tasks) if (task.parentTaskId === id) pending.push(task.id);
    }
  }
  return flattenWbsTaskTree(tasks.filter((task) => task.projectId === projectId && !excluded.has(task.id)))
    .map((item) => item.task);
}

export function prerequisiteTaskCandidates(tasks: WbsTask[], projectId: number | null, parentTaskId: number | null, currentTaskId: number | null): WbsTask[] {
  if (projectId === null) return [];
  const byId = new Map(tasks.map((task) => [task.id, task]));
  return tasks.filter((candidate) => {
    if (candidate.projectId !== projectId || (candidate.parentTaskId ?? null) !== parentTaskId || candidate.id === currentTaskId) return false;
    if (currentTaskId === null) return true;
    const visited = new Set<number>();
    const pending = [...dependencyIds(candidate)];
    while (pending.length > 0) {
      const prerequisiteId = pending.pop()!;
      if (prerequisiteId === currentTaskId) return false;
      if (visited.has(prerequisiteId)) continue;
      visited.add(prerequisiteId);
      const prerequisite = byId.get(prerequisiteId);
      if (prerequisite) pending.push(...dependencyIds(prerequisite));
    }
    return true;
  }).sort((a, b) => a.plannedStart.localeCompare(b.plannedStart) || a.id - b.id);
}

function dependencyIds(task: WbsTask): number[] {
  return task.prerequisiteTaskIds ?? [];
}

export function ancestorTrail(tasks: WbsTask[], taskId: number): WbsTask[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const result: WbsTask[] = [];
  const visited = new Set<number>([taskId]);
  let parentId = byId.get(taskId)?.parentTaskId ?? null;
  while (parentId !== null && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) break;
    result.unshift(parent);
    parentId = parent.parentTaskId;
  }
  return result;
}

export function dailyProgressActionLabel(task: Pick<WbsTask, "todayDailyProgress">, hasChildren: boolean, hasPastMissing = false): string | null {
  if (hasChildren) return null;
  if (hasPastMissing) return "過去の進捗を入力";
  return task.todayDailyProgress == null ? "今日進んだ進捗を入力" : "今日の進捗を編集";
}

export function taskActionLabels(task: Pick<WbsTask, "todayDailyProgress">, hasChildren: boolean, hasPastMissing = false): string[] {
  const progress = dailyProgressActionLabel(task, hasChildren, hasPastMissing);
  return ["タスクを編集", ...(progress ? [progress] : []), "作業経緯を表示", "＋ サブタスクを追加"];
}

function matchesId(actual: number | null, filter: WbsFilterValue) {
  if (filter === "all") return true;
  if (filter === "unset") return actual === null;
  return actual === filter;
}

function matchesAttention(task: WbsTask, filter: WbsAttentionFilter, today: string) {
  if (filter === "all") return true;
  if (filter === "open") return task.status !== "completed";
  if (filter === "overdue") return task.status !== "completed" && task.scheduleAssigned !== false && task.plannedEnd < today;
  if (filter === "unassigned") return task.ownerUserId === null;
  return task.scheduleAssigned === false;
}

function initials(name: string) {
  return name.trim().slice(0, 2).toUpperCase();
}
