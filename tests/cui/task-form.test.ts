import { describe, expect, it } from "vitest";

import { businessDaysOrDefault, parseBusinessDaysInput, requireDailyProgress } from "../../src/features/wbs/taskForm";

describe("WBS営業日数入力", () => {
  it("空欄は入力中の状態として保持し、保存時には1営業日として扱う", () => {
    expect(parseBusinessDaysInput("")).toBe("");
    expect(businessDaysOrDefault("")).toBe(1);
  });

  it("入力された営業日数はそのまま使用する", () => {
    expect(parseBusinessDaysInput("2")).toBe(2);
    expect(businessDaysOrDefault(2)).toBe(2);
  });

  it("空欄以外の1未満は1営業日に補正する", () => {
    expect(parseBusinessDaysInput("0")).toBe(1);
  });
});

describe("今日進んだ進捗入力", () => {
  it("空欄は未入力として拒否する", () => {
    expect(() => requireDailyProgress("")).toThrow("今日進んだ進捗を入力してください。");
  });

  it("明示的に入力した0は有効な進捗として扱う", () => {
    expect(requireDailyProgress(0)).toBe(0);
  });
});
