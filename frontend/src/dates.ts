/**
 * Attendance dates are calendar days ("2026-10-26") with no time or time zone.
 * `new Date("2026-10-26")` would mean midnight UTC, which shows as the 25th in
 * the Americas, so these helpers build dates from the parts instead.
 */

export function parseCalendarDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/** "Mon, 26 Oct 2026" in the browser's language. */
export function formatCalendarDate(isoDate: string, locale?: string): string {
  return parseCalendarDate(isoDate).toLocaleDateString(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** Today in the browser's own time zone, as "YYYY-MM-DD". */
export function localToday(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}
