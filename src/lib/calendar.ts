import Holidays from "date-holidays";

export type CountryOption = { code: string; name: string };
export type CalendarDay = {
  date: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  isWeekend: boolean;
  holidayName: string | null;
};

const holidayInstances = new Map<string, Holidays>();

export const countries: CountryOption[] = Object.entries(
  new Holidays().getCountries("ja"),
)
  .map(([code, name]) => ({ code, name }))
  .sort((a, b) => a.name.localeCompare(b.name, "ja"));

export function formatISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseISODate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function holidayCalendar(countryCode: string) {
  let calendar = holidayInstances.get(countryCode);
  if (!calendar) {
    calendar = new Holidays(countryCode, { languages: ["ja", "en"] });
    holidayInstances.set(countryCode, calendar);
  }
  return calendar;
}

function weekendDays(countryCode: string): number[] {
  type LocaleWithWeekInfo = Intl.Locale & { weekInfo?: { weekend: number[] } };
  const locale = new Intl.Locale(`und-${countryCode}`) as LocaleWithWeekInfo;
  return locale.weekInfo?.weekend ?? [6, 7];
}

export function holidayName(value: string, countryCode: string): string | null {
  const holidays = holidayCalendar(countryCode).isHoliday(parseISODate(value));
  if (!holidays) return null;
  const publicHoliday = holidays.find((holiday) => holiday.type === "public");
  return publicHoliday?.name ?? null;
}

export function isBusinessDay(value: string, countryCode: string): boolean {
  const date = parseISODate(value);
  const weekday = date.getDay() === 0 ? 7 : date.getDay();
  return !weekendDays(countryCode).includes(weekday) && holidayName(value, countryCode) === null;
}

export function calculateEndDate(start: string, businessDays: number, countryCode: string): string {
  if (!start || businessDays < 1) return "";
  const cursor = parseISODate(start);
  let counted = 0;
  while (counted < businessDays) {
    const value = formatISODate(cursor);
    if (isBusinessDay(value, countryCode)) counted += 1;
    if (counted < businessDays) cursor.setDate(cursor.getDate() + 1);
  }
  return formatISODate(cursor);
}

export function addCalendarDays(value: string, amount: number): string {
  const date = parseISODate(value);
  date.setDate(date.getDate() + amount);
  return formatISODate(date);
}

export function shiftBusinessDate(value: string, amount: number, countryCode: string): string {
  if (amount === 0) return moveToBusinessDay(value, 1, countryCode);
  const cursor = parseISODate(value);
  const direction = amount > 0 ? 1 : -1;
  let remaining = Math.abs(amount);
  while (remaining > 0) {
    cursor.setDate(cursor.getDate() + direction);
    if (isBusinessDay(formatISODate(cursor), countryCode)) remaining -= 1;
  }
  return formatISODate(cursor);
}

function moveToBusinessDay(value: string, direction: 1 | -1, countryCode: string): string {
  const cursor = parseISODate(value);
  while (!isBusinessDay(formatISODate(cursor), countryCode)) cursor.setDate(cursor.getDate() + direction);
  return formatISODate(cursor);
}

export function monthDays(month: Date, countryCode: string): CalendarDay[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1, 12);
  const gridStart = new Date(first);
  gridStart.setDate(1 - first.getDay());
  const today = formatISODate(new Date());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    const value = formatISODate(date);
    const holiday = holidayName(value, countryCode);
    const weekday = date.getDay() === 0 ? 7 : date.getDay();
    return {
      date: value,
      day: date.getDate(),
      inMonth: date.getMonth() === month.getMonth(),
      isToday: value === today,
      isWeekend: weekendDays(countryCode).includes(weekday),
      holidayName: holiday,
    };
  });
}
