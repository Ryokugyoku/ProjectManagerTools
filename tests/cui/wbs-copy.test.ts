import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("../../src/App.tsx", import.meta.url), "utf8");

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

  it("タスク入力では担当者と表示し、営業日数の1はプレースホルダーにする", () => {
    expect(appSource).toContain("<label>担当者<select");
    expect(appSource).toContain('placeholder="1" value={form.businessDays}');
    expect(appSource).toContain("未入力の場合は1営業日です。");
    expect(appSource).not.toContain("Math.max(1, Number(e.currentTarget.value))");
  });
});
