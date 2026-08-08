import { describe, expect, it } from "vitest";

import { REASON_CATEGORY_OPTIONS, reasonCategoryLabel, requireReasonCategory } from "../../src/lib/reasonCategories";

describe("変更理由の区分", () => {
  it("分析用の保存値と利用者向け表示名を一意に保つ", () => {
    expect(new Set(REASON_CATEGORY_OPTIONS.map((option) => option.value)).size).toBe(REASON_CATEGORY_OPTIONS.length);
    expect(reasonCategoryLabel("scope_omission")).toBe("考慮漏れ");
    expect(reasonCategoryLabel("requirement_addition")).toBe("要件追加");
  });

  it("未選択または定義外の区分を拒否する", () => {
    expect(() => requireReasonCategory("")).toThrow("区分");
    expect(() => requireReasonCategory("unknown" as never)).toThrow("区分");
  });
});
