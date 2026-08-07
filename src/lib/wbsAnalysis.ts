import { addCalendarDays, parseISODate } from "./calendar";
import type { WbsTask } from "./wbs";
import { expectedProgress, progressHealth } from "./wbsPlanning";

export type DependencyNode = {
  task: WbsTask;
  layer: number;
  earliestStart: number;
  earliestFinish: number;
  totalFloat: number;
  critical: boolean;
};

export type DependencyEdge = { from: number; to: number; critical: boolean };
export type DependencyAnalysis = {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
  projectDuration: number;
  criticalTaskIds: number[];
  hasCycle: boolean;
};

export type DependencyScope = {
  parentTask: WbsTask | null;
  breadcrumbs: WbsTask[];
  tasks: WbsTask[];
};

export type BurndownPoint = { date: string; plannedRemaining: number };

export function dependencyIds(task: WbsTask): number[] {
  return task.prerequisiteTaskIds ?? (task.prerequisiteTaskId == null ? [] : [task.prerequisiteTaskId]);
}

export function buildDependencyScope(tasks: WbsTask[], parentTaskId: number | null): DependencyScope {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const parentTask = parentTaskId === null ? null : byId.get(parentTaskId) ?? null;
  const effectiveParentId = parentTask?.id ?? null;
  const breadcrumbs: WbsTask[] = [];
  const visited = new Set<number>();
  let current: WbsTask | undefined = parentTask ?? undefined;
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    breadcrumbs.unshift(current);
    current = current.parentTaskId === null ? undefined : byId.get(current.parentTaskId);
  }
  return {
    parentTask,
    breadcrumbs,
    tasks: tasks.filter((task) => task.parentTaskId === effectiveParentId),
  };
}

export function buildDependencyAnalysis(tasks: WbsTask[]): DependencyAnalysis {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const predecessors = new Map<number, number[]>();
  const successors = new Map<number, number[]>();
  const indegree = new Map<number, number>();
  const edges: DependencyEdge[] = [];
  for (const task of tasks) {
    const valid = dependencyIds(task).filter((id) => byId.has(id));
    predecessors.set(task.id, valid);
    indegree.set(task.id, valid.length);
    for (const prerequisiteId of valid) {
      successors.set(prerequisiteId, [...(successors.get(prerequisiteId) ?? []), task.id]);
    }
  }

  const queue = tasks.filter((task) => indegree.get(task.id) === 0)
    .sort(compareTasks).map((task) => task.id);
  const ordered: number[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    ordered.push(id);
    for (const successorId of successors.get(id) ?? []) {
      const next = (indegree.get(successorId) ?? 1) - 1;
      indegree.set(successorId, next);
      if (next === 0) queue.push(successorId);
    }
  }
  const hasCycle = ordered.length !== tasks.length;
  for (const task of tasks) if (!ordered.includes(task.id)) ordered.push(task.id);

  const earliestStart = new Map<number, number>();
  const earliestFinish = new Map<number, number>();
  const layer = new Map<number, number>();
  for (const id of ordered) {
    const prerequisiteIds = predecessors.get(id) ?? [];
    const start = Math.max(0, ...prerequisiteIds.map((value) => earliestFinish.get(value) ?? 0));
    earliestStart.set(id, start);
    earliestFinish.set(id, start + Math.max(1, byId.get(id)?.businessDays ?? 1));
    layer.set(id, Math.max(0, ...prerequisiteIds.map((value) => (layer.get(value) ?? 0) + 1)));
  }
  const projectDuration = Math.max(0, ...earliestFinish.values());
  const latestFinish = new Map<number, number>();
  for (const id of [...ordered].reverse()) {
    const nextIds = successors.get(id) ?? [];
    const finish = nextIds.length === 0
      ? projectDuration
      : Math.min(...nextIds.map((value) => (latestFinish.get(value) ?? projectDuration) - Math.max(1, byId.get(value)?.businessDays ?? 1)));
    latestFinish.set(id, finish);
  }

  const nodes = ordered.map((id) => {
    const task = byId.get(id)!;
    const totalFloat = Math.max(0, (latestFinish.get(id) ?? projectDuration) - (earliestFinish.get(id) ?? 0));
    return { task, layer: layer.get(id) ?? 0, earliestStart: earliestStart.get(id) ?? 0, earliestFinish: earliestFinish.get(id) ?? 0, totalFloat, critical: totalFloat === 0 };
  });
  const criticalIds = new Set(nodes.filter((node) => node.critical).map((node) => node.task.id));
  for (const [from, nextIds] of successors) {
    for (const to of nextIds) {
      edges.push({
        from, to,
        critical: criticalIds.has(from) && criticalIds.has(to) && earliestFinish.get(from) === earliestStart.get(to),
      });
    }
  }
  return { nodes, edges, projectDuration, criticalTaskIds: nodes.filter((node) => node.critical).map((node) => node.task.id), hasCycle };
}

export function buildBurndownSeries(tasks: WbsTask[], today: string): BurndownPoint[] {
  const parentIds = new Set(tasks.flatMap((task) => task.parentTaskId === null ? [] : [task.parentTaskId]));
  const tracked = tasks.filter((task) => !parentIds.has(task.id));
  if (tracked.length === 0) return [];
  const dates = tracked.flatMap((task) => [task.plannedStart, task.plannedEnd]).sort();
  const start = dates[0];
  const end = [dates[dates.length - 1], today].sort()[1];
  const totalDays = Math.max(0, Math.round((parseISODate(end).getTime() - parseISODate(start).getTime()) / 86_400_000));
  const step = Math.max(1, Math.ceil((totalDays + 1) / 64));
  const points: BurndownPoint[] = [];
  for (let offset = 0; offset <= totalDays; offset += step) {
    const date = addCalendarDays(start, offset);
    points.push({ date, plannedRemaining: remainingEffort(tracked, date, true) });
  }
  if (points[points.length - 1]?.date !== end) points.push({ date: end, plannedRemaining: remainingEffort(tracked, end, true) });
  return points;
}

export function currentRemainingEffort(tasks: WbsTask[]): number {
  const parentIds = new Set(tasks.flatMap((task) => task.parentTaskId === null ? [] : [task.parentTaskId]));
  return round(tasks.filter((task) => !parentIds.has(task.id)).reduce((sum, task) => sum + Math.max(1, task.businessDays) * (1 - task.progress / 100), 0));
}

export function summarizeProgressHealth(tasks: WbsTask[], today: string) {
  const relevant = tasks.filter((task) => task.finalized && task.status !== "completed");
  return {
    ahead: relevant.filter((task) => progressHealth(task, today) === "ahead").length,
    onTrack: relevant.filter((task) => progressHealth(task, today) === "on-track").length,
    behind: relevant.filter((task) => progressHealth(task, today) === "behind").length,
    draft: tasks.filter((task) => !task.finalized).length,
  };
}

function remainingEffort(tasks: WbsTask[], date: string, planned: boolean) {
  return round(tasks.reduce((sum, task) => {
    const progress = planned ? expectedProgress(task, date) : task.progress;
    return sum + Math.max(1, task.businessDays) * (1 - progress / 100);
  }, 0));
}

function round(value: number) { return Math.round(value * 10) / 10; }
function compareTasks(a: WbsTask, b: WbsTask) { return a.plannedStart.localeCompare(b.plannedStart) || a.id - b.id; }
