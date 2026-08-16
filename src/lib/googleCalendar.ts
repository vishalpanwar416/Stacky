/**
 * Google Calendar API helper.
 *
 * Tokens are managed by /api/gcal-token (server-side refresh token flow).
 * The client never stores a long-lived secret — it only caches the short-lived
 * access token in localStorage and asks the API for a fresh one when needed.
 */

const GCAL_TOKEN_KEY = 'stacky_gcal_token'
const GCAL_EXPIRES_KEY = 'stacky_gcal_expires'
// Marker that the user has connected (refresh token stored server-side)
const GCAL_CONNECTED_KEY = 'stacky_gcal_connected'

export interface GCalEvent {
  id: string
  summary: string
  start: string   // ISO date or dateTime
  end: string     // ISO date or dateTime
  htmlLink: string
  colorId?: string
  allDay: boolean
}

// ─── Token storage (access token + expiry only) ───────────────────────────────

export function getStoredCalendarToken(): string | null {
  try { return localStorage.getItem(GCAL_TOKEN_KEY) } catch { return null }
}

export function isCalendarConnected(): boolean {
  try { return localStorage.getItem(GCAL_CONNECTED_KEY) === '1' } catch { return false }
}

export function markCalendarConnected(): void {
  try { localStorage.setItem(GCAL_CONNECTED_KEY, '1') } catch { /* ignore */ }
}

export function clearCalendarStorage(): void {
  try {
    localStorage.removeItem(GCAL_TOKEN_KEY)
    localStorage.removeItem(GCAL_EXPIRES_KEY)
    localStorage.removeItem(GCAL_CONNECTED_KEY)
    // also clear the old key name from the stub implementation
    localStorage.removeItem('stacky_gcal_token')
  } catch { /* ignore */ }
}

function cacheAccessToken(token: string, expiresAt: number): void {
  try {
    localStorage.setItem(GCAL_TOKEN_KEY, token)
    localStorage.setItem(GCAL_EXPIRES_KEY, String(expiresAt))
  } catch { /* ignore */ }
}

function isCachedTokenFresh(): boolean {
  try {
    const exp = localStorage.getItem(GCAL_EXPIRES_KEY)
    if (!exp) return false
    return Number(exp) - Date.now() > 5 * 60 * 1000  // > 5 min remaining
  } catch { return false }
}

// ─── API helpers ──────────────────────────────────────────────────────────────

/** Fetch a valid access token, refreshing server-side if needed. */
export async function getValidAccessToken(firebaseIdToken: string): Promise<string> {
  // Use the cached token if it's still fresh
  const cached = getStoredCalendarToken()
  if (cached && isCachedTokenFresh()) return cached

  // Ask the server to refresh
  const res = await fetch('/api/gcal-token', {
    headers: { Authorization: `Bearer ${firebaseIdToken}` },
  })
  if (res.status === 404) throw new CalendarNotConnectedError()
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as any
    throw new Error(body.error ?? `Token refresh failed (${res.status})`)
  }
  const { accessToken, expiresAt } = await res.json() as { accessToken: string; expiresAt: number }
  cacheAccessToken(accessToken, expiresAt)
  return accessToken
}

/** Exchange a one-time OAuth code for a stored refresh token. */
export async function connectCalendarWithCode(code: string, firebaseIdToken: string): Promise<string> {
  const res = await fetch('/api/gcal-token', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${firebaseIdToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ code }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as any
    throw new Error(body.error ?? `Connect failed (${res.status})`)
  }
  const { accessToken, expiresAt } = await res.json() as { accessToken: string; expiresAt: number }
  cacheAccessToken(accessToken, expiresAt)
  markCalendarConnected()
  return accessToken
}

/** Delete the server-side refresh token and clear local storage. */
export async function disconnectCalendar(firebaseIdToken: string): Promise<void> {
  await fetch('/api/gcal-token', {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${firebaseIdToken}` },
  }).catch(() => {})
  clearCalendarStorage()
}

// ─── Error types ──────────────────────────────────────────────────────────────

export class CalendarNotConnectedError extends Error {
  constructor() {
    super('Google Calendar not connected.')
    this.name = 'CalendarNotConnectedError'
  }
}

export class CalendarAuthError extends Error {
  constructor(msg = 'Google Calendar token expired. Please reconnect.') {
    super(msg)
    this.name = 'CalendarAuthError'
  }
}

// ─── Event fetching ───────────────────────────────────────────────────────────

export async function fetchCalendarEvents(
  monthStart: Date,
  accessToken: string
): Promise<GCalEvent[]> {
  const timeMin = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1)
  const timeMax = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0, 23, 59, 59)

  const params = new URLSearchParams({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250',
  })

  console.log('[GCal] Fetching events for', timeMin.toDateString(), '→', timeMax.toDateString())

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } }
  )

  if (!res.ok) {
    let errBody: unknown
    try { errBody = await res.json() } catch { errBody = null }
    console.error('[GCal] API error', res.status, errBody)

    if (res.status === 401) {
      clearCalendarStorage()
      throw new CalendarAuthError()
    }
    if (res.status === 403) {
      const msg = (errBody as any)?.error?.message ?? ''
      if (msg.includes('Calendar API has not been used') || msg.includes('disabled') || msg.includes('accessNotConfigured')) {
        throw new Error('Google Calendar API is not enabled. Go to console.cloud.google.com → APIs & Services → enable "Google Calendar API".')
      }
      clearCalendarStorage()
      throw new CalendarAuthError()
    }
    throw new Error(`Google Calendar API error ${res.status}`)
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

  console.log('[GCal] Got', data.items?.length ?? 0, 'events')

  return (data.items ?? []).map((item) => ({
    id: item.id,
    summary: item.summary ?? '(No title)',
    start: item.start?.dateTime ?? item.start?.date ?? '',
    end: item.end?.dateTime ?? item.end?.date ?? '',
    htmlLink: item.htmlLink,
    colorId: item.colorId,
    allDay: !item.start?.dateTime,
  }))
}

// ─── Date grouping ────────────────────────────────────────────────────────────

export function groupEventsByDate(events: GCalEvent[]): Map<string, GCalEvent[]> {
  const map = new Map<string, GCalEvent[]>()
  for (const event of events) {
    const dateStr = event.allDay
      ? event.start.slice(0, 10)
      : new Date(event.start).toLocaleDateString('en-CA')
    if (!map.has(dateStr)) map.set(dateStr, [])
    map.get(dateStr)!.push(event)
  }
  return map
}

// ─── Build Google OAuth URL ───────────────────────────────────────────────────
// Used by the frontend to start the code flow.

export function buildGoogleOAuthUrl(clientId: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly',
    access_type: 'offline',
    prompt: 'consent',  // always show consent so we get a refresh token
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}
