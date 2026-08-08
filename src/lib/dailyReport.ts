import { shiftBusinessDate } from "./calendar";
import type { Project } from "./projects";
import type { DailyProgressSnapshot, WbsTask } from "./wbs";
import { countBusinessDays, expectedProgress } from "./wbsPlanning";
import { ancestorTrail } from "./wbsView";

export type ScheduleVariance = {
  businessDays: number;
  actualProgress: number;
  plannedProgress: number;
  trackedTasks: number;
};

export type DailyReportPerson = {
  key: string;
  name: string;
  records: Array<{ task: WbsTask; snapshot: DailyProgressSnapshot }>;
};

export type DailyProjectReport = {
  project: Project;
  variance: ScheduleVariance;
  delayedTaskCount: number;
  people: DailyReportPerson[];
  activeTaskHierarchy: DailyReportHierarchyNode[];
  activeTaskCount: number;
};

export type DailyReportHierarchyNode = {
  task: WbsTask;
  active: boolean;
  omittedAncestorCount: number;
  children: DailyReportHierarchyNode[];
};

export type DelayImpact = {
  affectedTasks: WbsTask[];
  successorTasks: WbsTask[];
  projectedEnd: string;
};

export function previousBusinessDate(date: string, countryCode: string): string {
  return shiftBusinessDate(date, -1, countryCode);
}

export function calculateProjectScheduleVariance(
  tasks: WbsTask[],
  snapshots: DailyProgressSnapshot[],
  date: string,
): ScheduleVariance {
  const taskIdsWithChildren = new Set(tasks.flatMap((task) => task.parentTaskId === null ? [] : [task.parentTaskId]));
  const tracked = tasks.filter((task) => task.finalized && !taskIdsWithChildren.has(task.id));
  if (tracked.length === 0) return { businessDays: 0, actualProgress: 0, plannedProgress: 0, trackedTasks: 0 };
  const byTask = new Map(snapshots.map((snapshot) => [snapshot.taskId, snapshot]));
  const totalWeight = tracked.reduce((sum, task) => sum + Math.max(1, task.businessDays), 0);
  const actualProgress = tracked.reduce((sum, task) => sum + (byTask.get(task.id)?.cumulativeProgress ?? 0) * Math.max(1, task.businessDays), 0) / totalWeight;
  const plannedProgress = tracked.reduce((sum, task) => sum + expectedProgress(task, date) * Math.max(1, task.businessDays), 0) / totalWeight;
  const starts = tracked.map((task) => task.plannedStart).sort();
  const ends = tracked.map((task) => task.plannedEnd).sort();
  const projectBusinessDays = Math.max(1, countBusinessDays(starts[0], ends[ends.length - 1], tracked[0].countryCode));
  return {
    businessDays: Math.round(((actualProgress - plannedProgress) / 100) * projectBusinessDays * 10) / 10,
    actualProgress: Math.round(actualProgress * 10) / 10,
    plannedProgress: Math.round(plannedProgress * 10) / 10,
    trackedTasks: tracked.length,
  };
}

export function calculateTaskScheduleVariance(
  task: WbsTask,
  snapshot: DailyProgressSnapshot | undefined,
  date: string,
): number | null {
  if (!task.finalized || !snapshot) return null;
  const planned = expectedProgress(task, date);
  return Math.round(((snapshot.cumulativeProgress - planned) / 100) * Math.max(1, task.businessDays) * 10) / 10;
}

export function calculateDelayImpact(task: WbsTask, tasks: WbsTask[], delayBusinessDays: number): DelayImpact {
  const successorTasks = tasks.filter((candidate) => (candidate.prerequisiteTaskIds ?? (candidate.prerequisiteTaskId == null ? [] : [candidate.prerequisiteTaskId])).includes(task.id));
  const projectedEnd = shiftBusinessDate(task.plannedEnd, Math.ceil(Math.abs(delayBusinessDays)), task.countryCode);
  return {
    successorTasks,
    affectedTasks: successorTasks.filter((successor) => successor.plannedStart <= projectedEnd),
    projectedEnd,
  };
}

export function buildActiveTaskHierarchy(tasks: WbsTask[], ancestorDepth: number): DailyReportHierarchyNode[] {
  const maxAncestors = Math.max(0, Math.min(10, Math.trunc(ancestorDepth)));
  const activeTasks = tasks.filter((task) => task.status === "in_progress");
  const activeIds = new Set(activeTasks.map((task) => task.id));
  const nodes = new Map<number, DailyReportHierarchyNode>();
  const childIds = new Set<number>();

  for (const activeTask of activeTasks) {
    const chain = [...ancestorTrail(tasks, activeTask.id), activeTask];
    const visible = chain.slice(Math.max(0, chain.length - maxAncestors - 1));
    visible.forEach((task, index) => {
      const node = nodes.get(task.id) ?? { task, active: activeIds.has(task.id), omittedAncestorCount: 0, children: [] };
      node.active ||= activeIds.has(task.id);
      nodes.set(task.id, node);
      if (index === 0) return;
      const parent = nodes.get(visible[index - 1].id)!;
      if (!parent.children.some((child) => child.task.id === task.id)) parent.children.push(node);
      childIds.add(task.id);
    });
  }

  return [...nodes.values()].filter((node) => !childIds.has(node.task.id)).map((node) => ({
    ...node,
    omittedAncestorCount: ancestorTrail(tasks, node.task.id).length,
  }));
}

export function buildDailyProjectReports(
  projects: Project[],
  tasks: WbsTask[],
  snapshots: DailyProgressSnapshot[],
  date: string,
  ancestorDepth = 3,
): DailyProjectReport[] {
  const snapshotByTask = new Map(snapshots.map((snapshot) => [snapshot.taskId, snapshot]));
  return projects.map((project) => {
    const projectTasks = tasks.filter((task) => task.projectId === project.id);
    const people = new Map<string, DailyReportPerson>();
    for (const task of projectTasks) {
      const snapshot = snapshotByTask.get(task.id);
      if (!snapshot || (snapshot.dailyProgress === null && !snapshot.latestHistoryDetails && !snapshot.rescheduleReason && !snapshot.delayReason)) continue;
      const key = task.assigneeId === null ? "unset" : String(task.assigneeId);
      const group = people.get(key) ?? { key, name: task.assigneeName ?? "担当者未設定", records: [] };
      group.records.push({ task, snapshot });
      people.set(key, group);
    }
    const activeTasks = projectTasks.filter((task) => task.status === "in_progress");
    const parentIds = new Set(projectTasks.flatMap((task) => task.parentTaskId === null ? [] : [task.parentTaskId]));
    const delayedTaskCount = projectTasks.filter((task) => {
      if (parentIds.has(task.id)) return false;
      const variance = calculateTaskScheduleVariance(task, snapshotByTask.get(task.id), date);
      return variance !== null && variance < 0;
    }).length;
    return {
      project,
      variance: calculateProjectScheduleVariance(projectTasks, snapshots, date),
      delayedTaskCount,
      people: [...people.values()].sort((a, b) => a.name.localeCompare(b.name, "ja")),
      activeTaskHierarchy: buildActiveTaskHierarchy(projectTasks, ancestorDepth),
      activeTaskCount: activeTasks.length,
    };
  }).filter((report) => report.people.length > 0 || report.activeTaskCount > 0);
}
