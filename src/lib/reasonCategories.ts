export const REASON_CATEGORY_OPTIONS = [
  { value: "scope_omission", label: "考慮漏れ" },
  { value: "requirement_addition", label: "要件追加" },
  { value: "requirement_change", label: "要件変更" },
  { value: "estimate_variance", label: "見積誤差" },
  { value: "technical_issue", label: "技術課題" },
  { value: "external_dependency", label: "外部依存（顧客・ベンダー等）" },
  { value: "resource_constraint", label: "要員・リソース" },
  { value: "priority_change", label: "優先度変更" },
  { value: "quality_response", label: "品質対応" },
  { value: "other", label: "その他" },
] as const;

export type ReasonCategory = typeof REASON_CATEGORY_OPTIONS[number]["value"];

const reasonCategories = new Set<string>(REASON_CATEGORY_OPTIONS.map((option) => option.value));

export function isReasonCategory(value: string): value is ReasonCategory {
  return reasonCategories.has(value);
}

export function reasonCategoryLabel(value: ReasonCategory | ""): string {
  return REASON_CATEGORY_OPTIONS.find((option) => option.value === value)?.label ?? "未分類";
}

export function requireReasonCategory(value: ReasonCategory | ""): ReasonCategory {
  if (!isReasonCategory(value)) throw new Error("理由の区分を選択してください。");
  return value;
}
