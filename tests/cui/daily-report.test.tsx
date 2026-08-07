import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DailyReportScreen } from "../../src/features/reports/DailyReportScreen";
import { buildDailyProjectReports, previousBusinessDate } from "../../src/lib/dailyReport";
import type { Project } from "../../src/lib/projects";
import type { DailyProgressSnapshot, WbsTask } from "../../src/lib/wbs";

const project: Project = { id: 1, name: "基幹刷新", code: "CORE", clientName: "", description: "", status: "active", priority: "high", plannedStart: null, plannedEnd: null, members: [] };
const root: WbsTask = { id: 1, title: "設計", description: "全体設計", projectId: 1, projectName: "基幹刷新", parentTaskId: null, parentTaskTitle: null, assigneeId: 10, assigneeName: "山田", status: "in_progress", progress: 50, countryCode: "JP", plannedStart: "2026-08-03", plannedEnd: "2026-08-14", businessDays: 10, actualStart: null, actualEnd: null, finalized: true };
const child: WbsTask = { ...root, id: 2, title: "API設計", description: "API仕様を確定する", parentTaskId: 1, parentTaskTitle: "設計" };
const grandchild: WbsTask = { ...child, id: 3, title: "認証API", description: "認証方式を整理する", parentTaskId: 2, parentTaskTitle: "API設計" };
const snapshot: DailyProgressSnapshot = { taskId: 3, date: "2026-08-07", dailyProgress: 10, cumulativeProgress: 60, note: "認証方式をレビューしました" };

describe("daily project report", () => {
  it("selects the previous business day across a weekend", () => {
    expect(previousBusinessDate("2026-08-10", "JP")).toBe("2026-08-07");
  });

  it("groups work by person and retains every ancestor for active tasks", () => {
    const [report] = buildDailyProjectReports([project], [root, child, grandchild], [snapshot], "2026-08-07");
    expect(report.people[0]).toMatchObject({ name: "山田" });
    expect(report.people[0].records[0].snapshot.note).toContain("レビュー");
    expect(report.activeTaskChains.find((chain) => chain.at(-1)?.id === 3)?.map((task) => task.title)).toEqual(["設計", "API設計", "認証API"]);
  });

  it("renders a meeting-ready project summary, work note, and hierarchy summaries", () => {
    const markup = renderToStaticMarkup(<DailyReportScreen projects={[project]} tasks={[root, child, grandchild]} snapshots={[snapshot]} reportDate="2026-08-07" loading={false} />);
    expect(markup).toContain("案件全体進捗");
    expect(markup).toContain("認証方式をレビューしました");
    expect(markup).toContain("全体設計");
    expect(markup).toContain("API仕様を確定する");
    expect(markup).toContain("認証方式を整理する");
  });
});
