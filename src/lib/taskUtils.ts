import type { Task } from '../types'

/**
 * Get due date + time as milliseconds (start of due day + optional time).
 */
export function getDueMillis(task: Task): number | null {
  const ts = task.dueDate
  if (!ts || typeof ts.toMillis !== 'function') return null
  const ms = ts.toMillis()
  if (!task.dueTime) return ms
  const [h = 0, m = 0] = task.dueTime.split(':').map(Number)
  const d = new Date(ms)
  d.setHours(h, m, 0, 0)
  return d.getTime()
}

/**
 * Format a countdown string from a reference time to dueMs.
 * refTimeMs defaults to Date.now().
 */
export function getCountdownFromMs(
  dueMs: number,
  refTimeMs: number = Date.now()
): { text: string; isOverdue: boolean } {
  const diff = dueMs - refTimeMs
  const isOverdue = diff < 0
  const abs = Math.abs(diff)
  const mins = Math.floor(abs / 60_000)
  const hours = Math.floor(mins / 60)
  const days = Math.floor(hours / 24)
  const remainderHours = hours % 24
  const remainderMins = mins % 60

  const parts: string[] = []
  if (days > 0) parts.push(`${days}d`)
  if (remainderHours > 0) parts.push(`${remainderHours}h`)
  if (remainderMins > 0 || parts.length === 0) parts.push(`${remainderMins}m`)

  const short = parts.join(' ')
  return {
    text: isOverdue ? `${short} overdue` : `${short} left`,
    isOverdue,
  }
}

/**
 * Get due ms from raw dueDate (Timestamp-like) and optional dueTime string.
 */
export function getDueMsFrom(
  dueDate: { toMillis: () => number } | undefined | null,
  dueTime?: string | null
): number | null {
  if (!dueDate || typeof dueDate.toMillis !== 'function') return null
  let ms = dueDate.toMillis()
  if (dueTime) {
    const [h = 0, m = 0] = dueTime.split(':').map(Number)
    const d = new Date(ms)
    d.setHours(h, m, 0, 0)
    ms = d.getTime()
  }
  return ms
}

/**
 * Format due date for activity label (e.g. "Jan 15, 2:00 PM").
 */
export function formatDueLabel(dueMs: number): string {
  const d = new Date(dueMs)
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
    hour: d.getHours() !== 0 || d.getMinutes() !== 0 ? 'numeric' : undefined,
    minute: d.getMinutes() !== 0 ? '2-digit' : undefined,
  })
}

/**
 * Get countdown for a task (time until due or overdue).
 */
export function getCountdown(
  task: Task,
  refTime: Date = new Date()
): { text: string; isOverdue: boolean } | null {
  const dueMs = getDueMillis(task)
  if (dueMs == null) return null
  return getCountdownFromMs(dueMs, refTime.getTime())
}
