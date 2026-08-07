import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("../../src/App.tsx", import.meta.url), "utf8");

describe("WBSの操作文言", () => {
  it("ロードマップへのタスク追加とサブタスク追加を区別する", () => {
    expect(appSource).toContain("＋ ロードマップにタスクを追加");
    expect(appSource).toContain("＋ ロードマップ上でサブタスクを追加");
    expect(appSource).toContain('initialParentTaskId === null ? "ロードマップにタスクを追加" : "サブタスクを追加"');
  });

  it("5営業日以上ではサブタスクとしての分割を案内する", () => {
    expect(appSource).toContain("form.businessDays >= 5");
    expect(appSource).toContain("サブタスクへの分割をおすすめします");
    expect(appSource).toContain("小さなサブタスクとして分割すると");
  });
});
