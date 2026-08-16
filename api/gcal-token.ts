import { getApps, initializeApp, cert } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

/**
 * GET  /api/gcal-token  → return a fresh Google Calendar access token for the
 *                         signed-in user, silently refreshing via the stored
 *                         refresh token.
 *
 * POST /api/gcal-token  → exchange a one-time OAuth authorisation code for a
 *                         refresh token, store it in Firestore, return a first
 *                         access token.
 *
 * DELETE /api/gcal-token → revoke & delete the stored refresh token.
 *
 * All routes require a Firebase ID token (Bearer) so only the token owner can
 * read or revoke their own credential.
 *
 * The refresh token is stored in Firestore under
 *   users/{uid}/private/gcalRefresh
 * which is outside the normal security rules path and only readable by
 * server-side admin SDK code.
 *
 * Required environment variables:
 *   GOOGLE_CLIENT_ID      – Web application client ID from Cloud Console
 *   GOOGLE_CLIENT_SECRET  – Web application client secret from Cloud Console
 *   GOOGLE_REDIRECT_URI   – Must match the URI registered in Cloud Console
 *                           (e.g. https://yourapp.vercel.app/gcal-callback
 *                            or http://localhost:5173/gcal-callback for dev)
 */

const COLLECTION = 'gcalTokens'  // top-level collection, one doc per uid

// ─── Firebase Admin ───────────────────────────────────────────────────────────
function getAdminApp() {
  const name = 'gcal-token-admin'
  const existing = getApps().find((a) => a.name === name)
  if (existing) return existing
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT
  if (sa) {
    return initializeApp({ credential: cert(JSON.parse(sa)) }, name)
  }
  // Fallback: project-id-only (works on Cloud Run / GCP with ADC)
  return initializeApp({ projectId: process.env.VITE_FIREBASE_PROJECT_ID ?? 'stacky-f7f42' }, name)
}

function adminDb() {
  return getFirestore(getAdminApp())
}

async function verifyIdToken(authHeader: string | undefined): Promise<string | null> {
  if (!authHeader?.startsWith('Bearer ')) return null
  const idToken = authHeader.slice(7)
  try {
    const decoded = await getAuth(getAdminApp()).verifyIdToken(idToken)
    return decoded.uid
  } catch {
    return null
  }
}

// ─── Google OAuth helpers ─────────────────────────────────────────────────────
const GCAL_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
].join(' ')

function clientId() { return process.env.GOOGLE_CLIENT_ID ?? '' }
function clientSecret() { return process.env.GOOGLE_CLIENT_SECRET ?? '' }
function redirectUri() { return process.env.GOOGLE_REDIRECT_URI ?? '' }

/** Exchange an authorization code for access + refresh tokens. */
async function exchangeCode(code: string): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: redirectUri(),
      grant_type: 'authorization_code',
    }),
  })
  const data = await res.json() as any
  if (!res.ok || data.error) throw new Error(data.error_description ?? data.error ?? 'Token exchange failed')
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in ?? 3600,
  }
}

/** Use a stored refresh token to get a new access token. */
async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresIn: number }> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId(),
      client_secret: clientSecret(),
      grant_type: 'refresh_token',
    }),
  })
  const data = await res.json() as any
  if (!res.ok || data.error) throw new Error(data.error_description ?? data.error ?? 'Token refresh failed')
  return { accessToken: data.access_token, expiresIn: data.expires_in ?? 3600 }
}

// ─── Handler ──────────────────────────────────────────────────────────────────
export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()

  const uid = await verifyIdToken(req.headers.authorization)
  if (!uid) return res.status(401).json({ error: 'Unauthorized' })

  const db = adminDb()
  const docRef = db.collection(COLLECTION).doc(uid)

  try {
    // ── GET: return a fresh access token ─────────────────────────────────────
    if (req.method === 'GET') {
      const snap = await docRef.get()
      if (!snap.exists) return res.status(404).json({ error: 'not_connected' })

      const stored = snap.data() as { refreshToken: string; accessToken?: string; expiresAt?: number }

      // Return cached token if still valid (> 5 min remaining)
      if (stored.accessToken && stored.expiresAt && stored.expiresAt - Date.now() > 5 * 60 * 1000) {
        return res.status(200).json({ accessToken: stored.accessToken, expiresAt: stored.expiresAt })
      }

      // Refresh
      const { accessToken, expiresIn } = await refreshAccessToken(stored.refreshToken)
      const expiresAt = Date.now() + expiresIn * 1000
      await docRef.update({ accessToken, expiresAt })
      return res.status(200).json({ accessToken, expiresAt })
    }

    // ── POST: exchange auth code, store refresh token ─────────────────────────
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {})
      const { code } = body
      if (!code) return res.status(400).json({ error: 'code required' })

      const { accessToken, refreshToken, expiresIn } = await exchangeCode(code)
      const expiresAt = Date.now() + expiresIn * 1000
      await docRef.set({ refreshToken, accessToken, expiresAt, connectedAt: new Date().toISOString() })
      return res.status(200).json({ accessToken, expiresAt })
    }

    // ── DELETE: disconnect ────────────────────────────────────────────────────
    if (req.method === 'DELETE') {
      const snap = await docRef.get()
      if (snap.exists) {
        // Revoke the token at Google before deleting
        const stored = snap.data() as { refreshToken: string }
        await fetch(`https://oauth2.googleapis.com/revoke?token=${stored.refreshToken}`, { method: 'POST' }).catch(() => {})
        await docRef.delete()
      }
      return res.status(200).json({ disconnected: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err: any) {
    console.error('[gcal-token]', err)
    return res.status(500).json({ error: err.message ?? 'Internal error' })
  }
}
