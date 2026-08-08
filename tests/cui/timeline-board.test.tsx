import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TimelineBoard } from "../../src/features/wbs/TimelineBoard";
import { HomeScreen } from "../../src/features/home/HomeScreen";
import type { WbsTask } from "../../src/lib/wbs";

const task: WbsTask = {
  id: 1,
  title: "選択表示を確認する",
  description: "",
  projectId: null,
  projectName: null,
  parentTaskId: null,
  parentTaskTitle: null,
  assigneeId: null,
  assigneeName: null,
  status: "in_progress",
  progress: 40,
  countryCode: "JP",
  plannedStart: "2026-08-07",
  plannedEnd: "2026-08-07",
  businessDays: 1,
  actualStart: null,
  actualEnd: null,
  finalized: false,
};

function render(selectedId: number | null) {
  return renderToStaticMarkup(<TimelineBoard
    tasks={[task]}
    milestones={[]}
    assignees={[]}
    projects={[]}
    groupBy="project"
    countryCode="JP"
    selectedId={selectedId}
    onSelect={vi.fn()}
    onCreateSubtask={vi.fn()}
    onShowHistory={vi.fn()}
    onRecordProgress={vi.fn()}
    onSelectMilestone={vi.fn()}
    onScheduleChange={vi.fn()}
  />);
}

describe("WBSロードマップの選択表示", () => {
  it("編集中のタスクを選択すると行、文言、ARIAで選択済みと示す", () => {
    const markup = render(task.id);

    expect(markup).toContain('class="roadmap-row selected"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('class="task-selection-badge">選択中</span>');
    expect(markup).toContain("編集中");
  });

  it("未選択のタスクには選択中表示を付けない", () => {
    const markup = render(null);

    expect(markup).toContain('class="roadmap-row "');
    expect(markup).toContain('aria-pressed="false"');
    expect(markup).not.toContain("task-selection-badge");
  });

  it("日付セルはヘッダーだけに描画し、各タスク行では共有背景を使う", () => {
    const markup = render(null);
    const dayColumns = markup.match(/class="timeline-day/g) ?? [];

    expect(dayColumns).toHaveLength(42);
    expect(markup).toContain("repeating-linear-gradient");
    expect(markup).toContain('class="timeline-cells"');
    expect(markup).toContain('class="planned-progress"');
    expect(markup).toContain("予定 0%");
  });

  it("子を持つタスクを専用色の親タスク行として示す", () => {
    const child = { ...task, id: 2, title: "子", parentTaskId: 1, parentTaskTitle: task.title };
    const markup = renderToStaticMarkup(<TimelineBoard {...{
      tasks: [task], allTasks: [task, child], milestones: [], assignees: [], projects: [], groupBy: "project" as const,
      countryCode: "JP", selectedId: null, onSelect: vi.fn(), onCreateSubtask: vi.fn(), onShowHistory: vi.fn(),
      onRecordProgress: vi.fn(), onSelectMilestone: vi.fn(), onScheduleChange: vi.fn(),
    }} />);
    expect(markup).toContain('roadmap-row  parent-task');
    expect(markup).toContain('timeline-bar in_progress untracked has-children');
  });

  it("担当者の午前半休と午後半休を日付セルの左右で示す", () => {
    const withLeaves = { ...task, assigneeId: 2, assigneeName: "山田", assigneeLeaves: [
      { id: 1, userId: 2, userName: "山田", date: "2026-08-07", type: "planned" as const, unit: "morning" as const, reason: "" },
      { id: 2, userId: 2, userName: "山田", date: "2026-08-08", type: "unplanned" as const, unit: "afternoon" as const, reason: "体調不良" },
    ] };
    const markup = renderToStaticMarkup(<TimelineBoard {...{
      tasks: [withLeaves], milestones: [], assignees: [], projects: [], groupBy: "project" as const,
      countryCode: "JP", selectedId: null, onSelect: vi.fn(), onCreateSubtask: vi.fn(), onShowHistory: vi.fn(),
      onRecordProgress: vi.fn(), onSelectMilestone: vi.fn(), onScheduleChange: vi.fn(),
    }} />);
    expect(markup).toContain("task-leave-marker morning");
    expect(markup).toContain("task-leave-marker afternoon");
    expect(markup).toContain("午前半休");
    expect(markup).toContain("午後半休");
  });
});

describe("ホームの遅延表示", () => {
  it("遅延タスクに親階層と最新の遅延理由を表示する", () => {
    const parent = { ...task, id: 10, title: "親", finalized: true, plannedStart: "2026-01-01", plannedEnd: "2026-12-31" };
    const delayed = { ...task, id: 11, title: "遅延中", parentTaskId: 10, parentTaskTitle: "親", finalized: true, progress: 1, plannedStart: "2026-01-01", plannedEnd: "2026-12-31", latestDelayReason: "仕様回答待ち" };
    const markup = renderToStaticMarkup(<HomeScreen tasks={[parent, delayed]} projects={[]} users={[]} loading={false} onNavigate={vi.fn()} onOpenTask={vi.fn()} />);
    expect(markup).toContain("親: 親");
    expect(markup).toContain("親 › 遅延中");
    expect(markup).toContain("最新の遅延理由: 仕様回答待ち");
  });
});
