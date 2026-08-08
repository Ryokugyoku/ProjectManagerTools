import { describe, expect, it } from "vitest";
import { buildTimelineDateRange, filterWbsTasks, summarizeDescendants, visibleWbsTaskTree, parentTaskCandidates, prerequisiteTaskCandidates, type WbsFilters } from "../../src/lib/wbsView";
import type { Milestone } from "../../src/lib/milestones";
import type { WbsTask } from "../../src/lib/wbs";

// 因子: 案件（全件/指定/未設定）、責任者（全員/指定/未設定）、状態（全て/指定）。
// 水準を直交的に組み合わせ、すべての有効なフィルターがAND条件として保たれることを確認する。
const base: WbsTask = { id: 1, title: "設計", description: "", projectId: 1, projectName: "案件A", parentTaskId: null, parentTaskTitle: null, ownerUserId: 2, ownerUserName: "山田", status: "in_progress", progress: 30, countryCode: "JP", plannedStart: "2026-08-06", plannedEnd: "2026-08-07", businessDays: 2, actualStart: null, actualEnd: null, finalized: false };
const tasks = [base, { ...base, id: 2, projectId: null, projectName: null }, { ...base, id: 3, ownerUserId: null, ownerUserName: null }, { ...base, id: 4, status: "completed" as const }];
const cases: Array<{ filters: WbsFilters; ids: number[] }> = [
  { filters: { query: "", projectId: "all", ownerUserId: "all", status: "all", attention: "all" }, ids: [1, 2, 3, 4] },
  { filters: { query: "", projectId: 1, ownerUserId: 2, status: "in_progress", attention: "all" }, ids: [1] },
  { filters: { query: "", projectId: "unset", ownerUserId: 2, status: "all", attention: "all" }, ids: [2] },
  { filters: { query: "", projectId: 1, ownerUserId: "unset", status: "all", attention: "unassigned" }, ids: [3] },
  { filters: { query: "", projectId: 1, ownerUserId: 2, status: "completed", attention: "open" }, ids: [] },
];

describe("WBS filter combinations", () => {
  for (const { filters, ids } of cases) {
    it(`returns ${ids.join(",") || "none"} for ${JSON.stringify(filters)}`, () => {
      expect(filterWbsTasks(tasks, filters).map((task) => task.id)).toEqual(ids);
    });
  }
});

// 因子: 選択案件（同一/別/未設定）、編集中タスク（新規/親/子）。
// 同一案件だけを候補にし、編集中タスクとその全子孫を常に除外することを確認する。
describe("parent task candidate combinations", () => {
  const root = base;
  const child = { ...base, id: 5, title: "子", parentTaskId: 1, parentTaskTitle: "設計" };
  const grandchild = { ...base, id: 6, title: "孫", parentTaskId: 5, parentTaskTitle: "子" };
  const otherProject = { ...base, id: 7, title: "別案件", projectId: 2, projectName: "案件B" };
  const tree = [root, child, grandchild, otherProject];

  it.each([
    [1, null, [1, 5, 6]],
    [1, 1, []],
    [1, 5, [1]],
    [2, null, [7]],
    [null, null, []],
  ] as const)("project=%s current=%s returns valid parents", (projectId, currentTaskId, ids) => {
    expect(parentTaskCandidates(tree, projectId, currentTaskId).map((task) => task.id)).toEqual(ids);
  });
});

// 因子: 案件（一致/不一致/未設定）、階層（最上位/同じ親/別の親）、自己・循環（なし/あり）。
// 完了前提候補は常に同じ案件・同じ階層に限定され、自己参照と循環候補を除外する。
describe("prerequisite task candidate combinations", () => {
  const sibling = { ...base, id: 8, title: "同階層" };
  const child = { ...base, id: 9, title: "子", parentTaskId: 20, parentTaskTitle: "親" };
  const childSibling = { ...child, id: 10, title: "同じ親の子" };
  const otherProject = { ...base, id: 11, projectId: 2, projectName: "案件B" };
  const cyclic = { ...base, id: 12, title: "循環候補", prerequisiteTaskIds: [1] };
  const candidates = [base, sibling, child, childSibling, otherProject, cyclic];

  it.each([
    [1, null, 1, [8]],
    [1, 20, 9, [10]],
    [2, null, 11, []],
    [null, null, null, []],
  ] as const)("project=%s parent=%s current=%s", (projectId, parentTaskId, currentTaskId, ids) => {
    expect(prerequisiteTaskCandidates(candidates, projectId, parentTaskId, currentTaskId).map((task) => task.id)).toEqual(ids);
  });
});

// 因子: WBS日程（なし/短期/長期）、マイルストーン（なし/期間外）、最小表示日数（既定/指定）。
// どの組み合わせでも全日程を含み、短い期間は横操作に必要な最小幅を確保する。
describe("timeline date range combinations", () => {
  const milestone = { id: 1, projectId: 1, projectName: "案件A", projectCode: "A", name: "公開", description: "", dueDate: "2026-10-01", completed: false, color: "amber" } satisfies Milestone;

  it.each([
    [[], [], 42, "2026-07-30", "2026-09-09"],
    [[base], [], 42, "2026-07-30", "2026-09-09"],
    [[{ ...base, plannedStart: "2026-01-01", plannedEnd: "2026-12-31" }], [], 42, "2025-12-25", "2027-01-07"],
    [[base], [milestone], 60, "2026-07-30", "2026-10-08"],
  ] as const)("tasks=%s milestones=%s minimum=%s", (rangeTasks, rangeMilestones, minimumDays, start, end) => {
    const result = buildTimelineDateRange([...rangeTasks], [...rangeMilestones], "2026-08-06", minimumDays);
    expect(result.start).toBe(start);
    expect(result.end).toBe(end);
    expect(result.days).toBeGreaterThanOrEqual(minimumDays);
  });
});

// 因子: 折りたたみ（なし/親/親子）、一致（なし/子/孫）、要確認（期限/遅延/責任者/日程）。
// 折りたたみ時も一致した子孫への経路を残し、親の要確認件数を組み合わせどおり集計する。
describe("hierarchy visibility and descendant attention combinations", () => {
  const child = { ...base, id: 20, parentTaskId: 1, parentTaskTitle: "設計", ownerUserId: null, ownerUserName: null, plannedEnd: "2026-08-01" };
  const grandchild = { ...base, id: 21, parentTaskId: 20, parentTaskTitle: "子", scheduleAssigned: false };
  const tree = [base, child, grandchild];

  it.each([
    [[], [], [1, 20, 21]],
    [[1], [], [1]],
    [[1], [20], [1, 20, 21]],
    [[1, 20], [21], [1, 20, 21]],
  ] as const)("collapsed=%s matching=%s", (collapsed, matching, ids) => {
    expect(visibleWbsTaskTree(tree, new Set(collapsed), new Set(matching)).map(({ task }) => task.id)).toEqual(ids);
  });

  it("combines descendant warning conditions", () => {
    expect(summarizeDescendants(tree, 1, "2026-08-08")).toMatchObject({ count: 2, overdue: 1, unassigned: 1, scheduleUnassigned: 1 });
  });
});
