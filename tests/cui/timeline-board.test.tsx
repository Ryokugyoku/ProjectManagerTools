import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TimelineBoard } from "../../src/features/wbs/TimelineBoard";
import { HomeScreen } from "../../src/features/home/HomeScreen";
import { AttendanceScreen } from "../../src/features/attendance/AttendanceScreen";
import type { WbsTask } from "../../src/lib/wbs";

const task: WbsTask = {
  id: 1,
  title: "選択表示を確認する",
  description: "",
  projectId: null,
  projectName: null,
  parentTaskId: null,
  parentTaskTitle: null,
  ownerUserId: null,
  ownerUserName: null,
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
    users={[]}
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

    expect(markup).toMatch(/class="roadmap-row selected\s*"/);
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('class="task-selection-badge">選択中</span>');
    expect(markup).toContain("編集中");
  });

  it("未選択のタスクには選択中表示を付けない", () => {
    const markup = render(null);

    expect(markup).toMatch(/class="roadmap-row\s+"/);
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
    expect(markup).toMatch(/予定 \d+%/);
  });

  it("子を持つタスクを専用色の親タスク行として示す", () => {
    const child = { ...task, id: 2, title: "子", parentTaskId: 1, parentTaskTitle: task.title };
    const markup = renderToStaticMarkup(<TimelineBoard {...{
      tasks: [task], allTasks: [task, child], milestones: [], users: [], projects: [], groupBy: "project" as const,
      countryCode: "JP", selectedId: null, onSelect: vi.fn(), onCreateSubtask: vi.fn(), onShowHistory: vi.fn(),
      onRecordProgress: vi.fn(), onSelectMilestone: vi.fn(), onScheduleChange: vi.fn(),
    }} />);
    expect(markup).toContain('roadmap-row  parent-task');
    expect(markup).toContain('timeline-bar in_progress untracked has-children');
  });

  it("担当者の午前半休と午後半休を日付セルの左右で示す", () => {
    const withLeaves = { ...task, ownerUserId: 2, ownerUserName: "山田", ownerLeaves: [
      { id: 1, userId: 2, userName: "山田", date: "2026-08-07", type: "planned" as const, unit: "morning" as const, reason: "", customerApproved: true, managerApproved: true, workflowApproved: true, createdAt: "2026-08-01T00:00:00Z" },
      { id: 2, userId: 2, userName: "山田", date: "2026-08-08", type: "unplanned" as const, unit: "afternoon" as const, reason: "体調不良", customerApproved: false, managerApproved: false, workflowApproved: false, createdAt: "2026-08-01T00:00:00Z" },
    ] };
    const markup = renderToStaticMarkup(<TimelineBoard {...{
      tasks: [withLeaves], milestones: [], users: [], projects: [], groupBy: "project" as const,
      countryCode: "JP", selectedId: null, onSelect: vi.fn(), onCreateSubtask: vi.fn(), onShowHistory: vi.fn(),
      onRecordProgress: vi.fn(), onSelectMilestone: vi.fn(), onScheduleChange: vi.fn(),
    }} />);
    expect(markup).toContain("task-leave-marker morning");
    expect(markup).toContain("task-leave-marker afternoon");
    expect(markup).toContain("午前半休");
    expect(markup).toContain("午後半休");
    expect(markup).toContain("本日中に承認対応");
  });

  it("日程未割り当てのサブタスクはバーの代わりに入力導線を示す", () => {
    const markup = renderToStaticMarkup(<TimelineBoard {...{
      tasks: [{ ...task, scheduleAssigned: false }], milestones: [], users: [], projects: [], groupBy: "project" as const,
      countryCode: "JP", selectedId: null, onSelect: vi.fn(), onCreateSubtask: vi.fn(), onShowHistory: vi.fn(),
      onRecordProgress: vi.fn(), onSelectMilestone: vi.fn(), onScheduleChange: vi.fn(),
    }} />);
    expect(markup).toContain("日程未割り当て");
    expect(markup).toContain("日程を入力");
    expect(markup).toContain("開始予定日と営業日数が未設定です");
    expect(markup).not.toContain('class="timeline-bar');
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

  it("未承認休暇を本日中と承認待ちに分けて表示する", () => {
    const leaves = [
      { id: 1, userId: 2, userName: "山田", date: "2026-08-14", type: "planned" as const, unit: "full_day" as const, reason: "", customerApproved: false, managerApproved: true, workflowApproved: true, createdAt: "2026-08-07T00:00:00Z" },
      { id: 2, userId: 3, userName: "佐藤", date: "2026-09-30", type: "planned" as const, unit: "full_day" as const, reason: "", customerApproved: true, managerApproved: false, workflowApproved: true, createdAt: "2026-08-08T00:00:00Z" },
    ];
    const markup = renderToStaticMarkup(<HomeScreen tasks={[]} projects={[]} users={[]} leaves={leaves} countryCode="JP" today="2026-08-08" loading={false} onNavigate={vi.fn()} onOpenTask={vi.fn()} />);
    expect(markup).toContain("休暇の承認対応");
    expect(markup).toContain("本日中");
    expect(markup).toContain("顧客承認");
    expect(markup).toContain("承認待ち");
    expect(markup).toContain("上長承認");
  });
});

describe("勤怠画面の休暇承認", () => {
  it("3種類の承認を任意チェックとして表示する", () => {
    const users = [{ id: 1, name: "山田", email: "yamada@example.com", birthday: null, department: "開発", role: "担当", timezone: "Asia/Tokyo", interests: "", skills: "", workStyle: "", notes: "" }];
    const markup = renderToStaticMarkup(<AttendanceScreen users={users} leaves={[]} countryCode="JP" today="2026-08-08" onChanged={vi.fn()} onError={vi.fn()} onOpenUsers={vi.fn()} />);
    expect(markup).toContain("勤怠・休暇");
    expect(markup).toContain("承認状況");
    expect(markup).toContain("顧客承認");
    expect(markup).toContain("上長承認");
    expect(markup).toContain("業務フロー承認");
    expect(markup.match(/type="checkbox"/g)).toHaveLength(3);
  });

  it("ユーザーがいない場合は登録導線を表示して休暇登録を無効にする", () => {
    const markup = renderToStaticMarkup(<AttendanceScreen users={[]} leaves={[]} countryCode="JP" today="2026-08-08" onChanged={vi.fn()} onError={vi.fn()} onOpenUsers={vi.fn()} />);
    expect(markup).toContain("先にユーザーを登録してください");
    expect(markup).toContain("ユーザー画面を開く");
    expect(markup).toContain("disabled");
  });
});
