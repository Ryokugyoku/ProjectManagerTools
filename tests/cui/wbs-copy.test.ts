import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("../../src/App.tsx", import.meta.url), "utf8");
const timelineSource = readFileSync(new URL("../../src/features/wbs/TimelineBoard.tsx", import.meta.url), "utf8");
const taskFormSource = readFileSync(new URL("../../src/features/wbs/taskForm.ts", import.meta.url), "utf8");

describe("WBSの操作文言", () => {
  it("ロードマップへのタスク追加とサブタスク追加を区別する", () => {
    expect(appSource).toContain("＋ ロードマップにタスクを追加");
    expect(appSource).toContain("＋ ロードマップ上でサブタスクを追加");
    expect(appSource).toContain('initialParentTaskId === null ? "ロードマップにタスクを追加" : "サブタスクを追加"');
    expect(appSource).toContain("onCreateSubtask={(task) => openTaskCreate(task.id)}");
    expect(appSource).toContain("parentTask?.projectId ?? initialProjectId");
  });

  it("5営業日以上ではサブタスクとしての分割を案内する", () => {
    expect(appSource).toContain("businessDays >= 5");
    expect(appSource).toContain("サブタスクへの分割をおすすめします");
    expect(appSource).toContain("小さなサブタスクとして分割すると");
  });

  it("サブタスク追加時に日程を設定し、親を超える場合は確認する", () => {
    expect(appSource).toContain("親の開始予定日を引き継いでいます");
    expect(appSource).toContain("開始予定日と必要営業日数を設定してください");
    expect(appSource).toContain("<label>必要営業日数<input");
    expect(appSource).toContain("親タスクの日程を超えます");
    expect(appSource).toContain("buildAncestorEndExtensions");
    expect(taskFormSource).toContain("親日程を延長して登録");
    expect(appSource).not.toContain("window.confirm");
    expect(appSource).toContain("サブタスク追加の理由");
    expect(appSource).toContain("changeReasonRequired");
  });

  it("確定・リスケ・遅延の理由区分を入力できる", () => {
    expect(appSource).toContain("理由の区分");
    expect(appSource).toContain("REASON_CATEGORY_OPTIONS");
    expect(appSource).toContain("親子の状態を確定");
  });

  it("WBSの削除確認をTauri内で操作できる", () => {
    expect(appSource).toContain("マイルストーンを削除しますか？");
    expect(appSource).toContain("このタスクを削除しますか？");
    expect(appSource).toContain("削除しない");
  });

  it("タスク入力では担当者と表示し、営業日数の1はプレースホルダーにする", () => {
    expect(appSource).toContain("<label>担当者<select");
    expect(appSource).toContain('placeholder="1" value={form.businessDays}');
    expect(appSource).toContain("未入力の場合は1営業日です。");
    expect(appSource).not.toContain("Math.max(1, Number(e.currentTarget.value))");
  });

  it("親の進捗と作業経緯を段階的に集約表示する", () => {
    expect(timelineSource).toContain("子タスクから自動集計");
    expect(appSource).toContain("配下を含む");
    expect(appSource).toContain("親自身のみ");
    expect(appSource).toContain("さらに${filtered.length - 8}件を表示");
  });

  it("DETAILドロワーを使わず右クリックからタスクを編集する", () => {
    expect(appSource).not.toContain('className="task-drawer"');
    expect(appSource).not.toContain("DETAIL");
    expect(appSource).not.toContain('aria-label="進捗率" type="range"');
    expect(timelineSource).toContain(">タスクを編集</button>");
    expect(timelineSource).toContain("onEdit(task)");
  });

  it("同階層から完了前提タスクを選べる", () => {
    expect(appSource).toContain("完了が前提となるタスク");
    expect(appSource).toContain("同じ案件・同じ親タスク配下");
    expect(appSource).toContain("prerequisiteTaskCandidates");
  });
});
