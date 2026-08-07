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
  people: DailyReportPerson[];
  activeTaskChains: WbsTask[][];
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

export function buildDailyProjectReports(
  projects: Project[],
  tasks: WbsTask[],
  snapshots: DailyProgressSnapshot[],
  date: string,
): DailyProjectReport[] {
  const snapshotByTask = new Map(snapshots.map((snapshot) => [snapshot.taskId, snapshot]));
  return projects.map((project) => {
    const projectTasks = tasks.filter((task) => task.projectId === project.id);
    const people = new Map<string, DailyReportPerson>();
    for (const task of projectTasks) {
      const snapshot = snapshotByTask.get(task.id);
      if (!snapshot || snapshot.dailyProgress === null) continue;
      const key = task.assigneeId === null ? "unset" : String(task.assigneeId);
      const group = people.get(key) ?? { key, name: task.assigneeName ?? "担当者未設定", records: [] };
      group.records.push({ task, snapshot });
      people.set(key, group);
    }
    const activeTasks = projectTasks.filter((task) => task.status === "in_progress");
    return {
      project,
      variance: calculateProjectScheduleVariance(projectTasks, snapshots, date),
      people: [...people.values()].sort((a, b) => a.name.localeCompare(b.name, "ja")),
      activeTaskChains: activeTasks.map((task) => [...ancestorTrail(projectTasks, task.id), task]),
    };
  }).filter((report) => report.people.length > 0 || report.activeTaskChains.length > 0);
}
