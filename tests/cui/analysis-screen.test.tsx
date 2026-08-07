import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AnalysisScreen } from "../../src/features/analysis/AnalysisScreen";
import type { Project } from "../../src/lib/projects";
import type { WbsTask } from "../../src/lib/wbs";

const project: Project = { id: 1, name: "基幹刷新", code: "CORE", clientName: "", description: "", status: "active", priority: "high", plannedStart: null, plannedEnd: null, members: [] };
const base: WbsTask = { id: 1, title: "遅延中の設計", description: "", projectId: 1, projectName: "基幹刷新", parentTaskId: null, parentTaskTitle: null, assigneeId: null, assigneeName: null, status: "in_progress", progress: 10, countryCode: "JP", plannedStart: "2026-08-03", plannedEnd: "2026-08-07", businessDays: 5, actualStart: null, actualEnd: null, finalized: true, latestDelayReason: "顧客レビュー待ち" };

describe("analysis screen", () => {
  it("shows chart switching, delayed propagation, reason callout, and status colors", () => {
    const tasks: WbsTask[] = [base, { ...base, id: 2, title: "影響を受ける実装", progress: 0, plannedStart: "2026-08-10", plannedEnd: "2026-08-14", prerequisiteTaskIds: [1], latestDelayReason: "" }, { ...base, id: 3, title: "完了済み", status: "completed", progress: 100 }, { ...base, id: 4, title: "前倒し作業", progress: 80, plannedStart: "2026-08-10", plannedEnd: "2026-08-21", businessDays: 10 }];
    const markup = renderToStaticMarkup(<AnalysisScreen projects={[project]} tasks={tasks} today="2026-08-08" loading={false} />);
    expect(markup).toContain("クリティカルパス");
    expect(markup).toContain("バーンダウン");
    expect(markup).toContain("進捗健全性");
    expect(markup).toContain("delay-node");
    expect(markup).toContain("delay-impact-edge");
    expect(markup).toContain("顧客レビュー待ち");
    expect(markup).toContain("completed-node");
    expect(markup).toContain("ahead-node");
    expect(markup).toContain("network-inspector");
    expect(markup).toContain("network-stage");
    expect(markup).toContain("node-chip");
    expect(markup).toContain('role="button"');
    expect(markup).not.toContain("delay-callout");
  });
});
