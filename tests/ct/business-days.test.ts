import { describe, expect, it } from "vitest";
import { addCalendarDays, calculateEndDate, isBusinessDay } from "../../src/lib/calendar";

type Combination = { country: string; startKind: string; start: string; days: number };

// Pairwise CT matrix: country x start-day kind x duration boundary.
const combinations: Combination[] = [
  { country: "JP", startKind: "business", start: "2026-08-06", days: 1 },
  { country: "JP", startKind: "holiday", start: "2026-08-11", days: 5 },
  { country: "US", startKind: "weekend", start: "2026-07-04", days: 1 },
  { country: "US", startKind: "business", start: "2026-07-02", days: 5 },
  { country: "GB", startKind: "holiday", start: "2026-12-25", days: 1 },
  { country: "GB", startKind: "weekend", start: "2026-12-26", days: 5 },
];

describe.each(combinations)("business-day CT: $country / $startKind / $days days", ({ country, start, days }) => {
  it("ends on a business day after counting exactly the requested business days", () => {
    const end = calculateEndDate(start, days, country);
    expect(isBusinessDay(end, country)).toBe(true);
    expect(countBusinessDays(start, end, country)).toBe(days);
  });
});

function countBusinessDays(start: string, end: string, country: string) {
  let cursor = start;
  let count = 0;
  while (cursor <= end) {
    if (isBusinessDay(cursor, country)) count += 1;
    cursor = addCalendarDays(cursor, 1);
  }
  return count;
}
