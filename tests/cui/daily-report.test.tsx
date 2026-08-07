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
const snapshot: DailyProgressSnapshot = { taskId: 3, date: "2026-08-07", dailyProgress: 10, cumulativeProgress: 40, note: "認証方式をレビューしました", latestHistoryType: "progress", latestHistoryDetails: "今日 +10% / 累計 40%", rescheduleReason: "顧客レビュー日変更", delayReason: "セキュリティ回答待ち" };

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

  it("includes a latest history report even when no daily progress was entered", () => {
    const historyOnly = { ...snapshot, dailyProgress: null, note: "", latestHistoryType: "rescheduled" as const, latestHistoryDetails: "日程を見直しました", rescheduleReason: "顧客都合", delayReason: "" };
    const [report] = buildDailyProjectReports([project], [root, child, grandchild], [historyOnly], "2026-08-07");
    expect(report.people[0].records[0].snapshot.latestHistoryDetails).toBe("日程を見直しました");
  });

  it("renders a meeting-ready project summary, work note, and hierarchy summaries", () => {
    const markup = renderToStaticMarkup(<DailyReportScreen projects={[project]} tasks={[root, child, grandchild]} snapshots={[snapshot]} reportDate="2026-08-07" loading={false} />);
    expect(markup).toContain("案件全体進捗");
    expect(markup).toContain("認証方式をレビューしました");
    expect(markup).toContain("最新の作業履歴");
    expect(markup).toContain("リスケ理由");
    expect(markup).toContain("顧客レビュー日変更");
    expect(markup).toContain("セキュリティ回答待ち");
    expect(markup).toContain("1.0営業日遅延");
    expect(markup).toContain("後続タスクは設定されていません");
    expect(markup).toContain("is-delayed");
    expect(markup).toContain("全体設計");
    expect(markup).toContain("API仕様を確定する");
    expect(markup).toContain("認証方式を整理する");
  });

  it("warns when project progress is on schedule but an individual task is delayed", () => {
    const delayed = { ...root, id: 21, title: "遅延作業", businessDays: 10 };
    const ahead = { ...root, id: 22, title: "前倒し作業", businessDays: 10 };
    const delayedSnapshot = { ...snapshot, taskId: 21, cumulativeProgress: 40, rescheduleReason: "", delayReason: "確認待ち" };
    const aheadSnapshot = { ...snapshot, taskId: 22, cumulativeProgress: 60, rescheduleReason: "", delayReason: "" };
    const markup = renderToStaticMarkup(<DailyReportScreen projects={[project]} tasks={[delayed, ahead]} snapshots={[delayedSnapshot, aheadSnapshot]} reportDate="2026-08-07" loading={false} />);
    expect(markup).toContain("計画どおり・個別遅延1件");
    expect(markup).toContain('variance warning');
  });

  it("names successor tasks when a delayed prerequisite reaches their planned start", () => {
    const successor = { ...grandchild, id: 30, title: "結合テスト", prerequisiteTaskId: 3, plannedStart: "2026-08-14" };
    const markup = renderToStaticMarkup(<DailyReportScreen projects={[project]} tasks={[root, child, grandchild, successor]} snapshots={[snapshot]} reportDate="2026-08-07" loading={false} />);
    expect(markup).toContain("影響あり");
    expect(markup).toContain("「結合テスト」の開始予定に重なる見込み");
  });
});
