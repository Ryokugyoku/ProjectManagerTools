import { describe, expect, it } from "vitest";

import { businessDaysOrDefault, earliestPrerequisiteStart, missingProgressDates, parseBusinessDaysInput, requireDailyProgress } from "../../src/features/wbs/taskForm";
import type { WbsTask } from "../../src/lib/wbs";

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

describe("完了前提タスクの開始可能日", () => {
  const base: WbsTask = { id: 1, title: "設計", description: "", projectId: 1, projectName: "案件", parentTaskId: null, parentTaskTitle: null, ownerUserId: null, ownerUserName: null, status: "not_started", progress: 0, countryCode: "JP", plannedStart: "2026-08-03", plannedEnd: "2026-08-07", businessDays: 5, actualStart: null, actualEnd: null, finalized: true };

  it("最も遅い完了予定日の次の営業日を返す", () => {
    const tasks = [base, { ...base, id: 2, plannedEnd: "2026-08-10" }];
    expect(earliestPrerequisiteStart(tasks, [1, 2], "JP")).toBe("2026-08-12");
  });

  it("前提タスクがなければ開始可能日を指定しない", () => {
    expect(earliestPrerequisiteStart([base], [], "JP")).toBeNull();
  });
});
