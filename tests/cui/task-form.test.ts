import { describe, expect, it } from "vitest";

import { businessDaysOrDefault, missingProgressDates, parseBusinessDaysInput, requireDailyProgress } from "../../src/features/wbs/taskForm";

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

describe("日次進捗入力", () => {
  it("空欄は未入力として拒否する", () => {
    expect(() => requireDailyProgress("")).toThrow("その日に進んだ進捗を入力してください。");
  });

  it("明示的に入力した0は有効な進捗として扱う", () => {
    expect(requireDailyProgress(0)).toBe(0);
  });

  it("記録済み・休日を除いた過去の未入力日を新しい順で返す", () => {
    expect(missingProgressDates("2026-08-03", "2026-08-07", "JP", ["2026-08-04"])).toEqual(["2026-08-07", "2026-08-06", "2026-08-05", "2026-08-03"]);
  });
});
