import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TimelineBoard } from "../../src/features/wbs/TimelineBoard";
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
});
