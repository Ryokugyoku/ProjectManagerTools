import { describe, expect, it } from "vitest";
import {
  addCalendarDays, calculateEndDate, countries, formatISODate, holidayName,
  isBusinessDay, monthDays, parseISODate, shiftBusinessDate,
} from "../../src/lib/calendar";

describe("calendar methods", () => {
  it("formats and parses local ISO dates without a timezone shift", () => {
    const date = parseISODate("2026-08-06");
    expect(formatISODate(date)).toBe("2026-08-06");
  });

  it("adds positive and negative calendar days", () => {
    expect(addCalendarDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addCalendarDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("identifies public holidays and business days", () => {
    expect(holidayName("2026-08-11", "JP")).toBeTruthy();
    expect(isBusinessDay("2026-08-11", "JP")).toBe(false);
    expect(isBusinessDay("2026-08-12", "JP")).toBe(true);
  });

  it("returns an empty end date for incomplete input", () => {
    expect(calculateEndDate("", 5, "JP")).toBe("");
    expect(calculateEndDate("2026-08-06", 0, "JP")).toBe("");
  });

  it("excludes weekends and holidays from the planned end date", () => {
    expect(calculateEndDate("2026-08-06", 5, "JP")).toBe("2026-08-13");
  });

  it("shifts in both directions by business days and snaps zero from a holiday", () => {
    expect(shiftBusinessDate("2026-08-10", 1, "JP")).toBe("2026-08-12");
    expect(shiftBusinessDate("2026-08-12", -1, "JP")).toBe("2026-08-10");
    expect(shiftBusinessDate("2026-08-11", 0, "JP")).toBe("2026-08-12");
  });

  it("builds a six-week month grid with weekend and holiday metadata", () => {
    const days = monthDays(new Date(2026, 7, 1, 12), "JP");
    expect(days).toHaveLength(42);
    expect(days[0].date).toBe("2026-07-26");
    expect(days.find((day) => day.date === "2026-08-11")?.holidayName).toBeTruthy();
    expect(days.find((day) => day.date === "2026-08-08")?.isWeekend).toBe(true);
    expect(days.find((day) => day.date === "2026-08-01")?.inMonth).toBe(true);
  });

  it("provides a sorted country list containing Japan", () => {
    expect(countries.some((country) => country.code === "JP")).toBe(true);
    expect(countries).toEqual([...countries].sort((a, b) => a.name.localeCompare(b.name, "ja")));
  });
});
