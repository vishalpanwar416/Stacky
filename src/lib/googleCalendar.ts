/**
 * Google Calendar API helper.
 *
 * Fetches events for a given month using the stored OAuth access token.
 * The token is short-lived (~1h); if it's expired the fetch returns a 401
 * and we clear the stored token so the user is prompted to reconnect.
 */

const GCAL_TOKEN_KEY = 'stacky_gcal_token'

export interface GCalEvent {
  id: string
  summary: string
  start: string   // ISO date or dateTime
  end: string     // ISO date or dateTime
  htmlLink: string
  colorId?: string
  allDay: boolean
}

/** Returns the stored access token, or null if not connected. */
export function getStoredCalendarToken(): string | null {
  try {
    return localStorage.getItem(GCAL_TOKEN_KEY)
  } catch {
    return null
  }
}

/** Persists the access token. */
export function storeCalendarToken(token: string): void {
  try {
    localStorage.setItem(GCAL_TOKEN_KEY, token)
  } catch { /* ignore */ }
}

/** Removes the stored token (called on 401 or user disconnect). */
export function clearCalendarToken(): void {
  try {
    localStorage.removeItem(GCAL_TOKEN_KEY)
  } catch { /* ignore */ }
}

/**
 * Fetches events from the primary Google Calendar for the given month.
 * Returns an empty array if the user is not connected.
 * Throws a `CalendarAuthError` if the token has expired.
 */
export class CalendarAuthError extends Error {
  constructor() {
    super('Google Calendar token expired. Please reconnect.')
    this.name = 'CalendarAuthError'
  }
}

export async function fetchCalendarEvents(
  monthStart: Date,
  token: string
): Promise<GCalEvent[]> {
  const timeMin = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1)
  const timeMax = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0, 23, 59, 59)

  const params = new URLSearchParams({
    calendarId: 'primary',
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250',
  })

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    }
  )

  if (res.status === 401 || res.status === 403) {
    clearCalendarToken()
    throw new CalendarAuthError()
  }

  if (!res.ok) {
    throw new Error(`Google Calendar API error: ${res.status}`)
  }

  const data = await res.json() as {
    items?: Array<{
      id: string
      summary?: string
      htmlLink: string
      colorId?: string
      start?: { date?: string; dateTime?: string }
      end?: { date?: string; dateTime?: string }
    }>
  }

  return (data.items ?? []).map((item) => {
    const startRaw = item.start?.dateTime ?? item.start?.date ?? ''
    const endRaw = item.end?.dateTime ?? item.end?.date ?? ''
    const allDay = !item.start?.dateTime

    return {
      id: item.id,
      summary: item.summary ?? '(No title)',
      start: startRaw,
      end: endRaw,
      htmlLink: item.htmlLink,
      colorId: item.colorId,
      allDay,
    }
  })
}

/**
 * Groups a list of GCal events by YYYY-MM-DD key.
 * All-day events use their date directly; timed events use the local date.
 */
export function groupEventsByDate(events: GCalEvent[]): Map<string, GCalEvent[]> {
  const map = new Map<string, GCalEvent[]>()
  for (const event of events) {
    const dateStr = event.allDay
      ? event.start.slice(0, 10)                         // "2026-08-16"
      : new Date(event.start).toLocaleDateString('en-CA') // "2026-08-16" in local tz
    if (!map.has(dateStr)) map.set(dateStr, [])
    map.get(dateStr)!.push(event)
  }
  return map
}
