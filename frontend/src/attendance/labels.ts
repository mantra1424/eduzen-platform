import type { AttendanceStatus } from '../api/types'

export const STATUSES: AttendanceStatus[] = ['present', 'absent', 'late', 'excused']

export const STATUS_LABELS: Record<AttendanceStatus, string> = {
  present: 'Present',
  absent: 'Absent',
  late: 'Late',
  excused: 'Excused',
}

/** "18 present · 2 absent · 1 late · 3 not marked", skipping zeros. */
export function countsText(counts: Record<AttendanceStatus | 'unmarked', number>): string {
  const parts = [
    ...STATUSES.map((s) => [counts[s], s] as const),
    [counts.unmarked, 'not marked'] as const,
  ]
    .filter(([n]) => n > 0)
    .map(([n, label]) => `${n} ${label}`)
  return parts.length > 0 ? parts.join(' · ') : 'Nobody to mark'
}
