/**
 * Google Calendar OAuth callback handler.
 *
 * Google redirects to /gcal-callback?code=…&state=… after the user approves
 * the calendar permission. This page runs inside a popup window opened by
 * AuthContext.connectGoogleCalendar(). It extracts the code from the URL,
 * posts it to the opener via postMessage, then closes itself.
 *
 * No secrets live here — the code exchange happens server-side in
 * /api/gcal-token so the client_secret is never exposed to the browser.
 */

export function GcalCallback() {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  const error = params.get('error')

  if (window.opener) {
    window.opener.postMessage(
      { type: 'gcal-oauth-code', code, error },
      window.location.origin
    )
    window.close()
  }

  // Fallback if opener is gone (e.g. user navigated the popup instead of it closing)
  return (
    <div style={{ fontFamily: 'system-ui', padding: '2rem', textAlign: 'center' }}>
      {error ? (
        <p>Connection cancelled: {error}. You can close this window.</p>
      ) : code ? (
        <p>Connecting Google Calendar… this window will close automatically.</p>
      ) : (
        <p>No code received. You can close this window.</p>
      )}
    </div>
  )
}
