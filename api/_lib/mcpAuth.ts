import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

import { db } from '../../mcp/src/firestore.js'

/**
 * Access tokens for the hosted MCP server.
 *
 * A token is the only thing standing between a caller and their Stacky data,
 * so it is stored hashed: the SHA-256 of the token is the document id, and the
 * raw value is shown to the user exactly once at creation. Reading the whole
 * collection therefore yields no usable credential.
 *
 * Looking a token up by its hash also means verification is a key lookup
 * rather than a comparison, so there is no string-compare timing signal.
 */

export const TOKENS = 'mcpTokens'

const PREFIX = 'stk_'

export interface TokenRecord {
  userId: string
  label: string
  createdAt: string
  lastUsedAt: string | null
  revokedAt: string | null
}

export function hashToken(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex')
}

/** Returns the raw token (shown once) and the id it is stored under. */
export function generateToken(): { raw: string; id: string } {
  const raw = PREFIX + randomBytes(32).toString('base64url')
  return { raw, id: hashToken(raw) }
}

/** A short, non-secret fragment so a user can tell their tokens apart. */
export function fingerprint(raw: string): string {
  return `${raw.slice(0, PREFIX.length + 4)}…${raw.slice(-4)}`
}

export function readBearer(header: string | undefined): string | null {
  if (!header) return null
  const [scheme, ...rest] = header.split(' ')
  if (scheme?.toLowerCase() !== 'bearer') return null
  const value = rest.join(' ').trim()
  return value.length > 0 ? value : null
}

/**
 * Resolves a raw token to the user it belongs to, or null.
 *
 * Returns null for every failure mode — unknown, malformed, revoked — so the
 * caller cannot distinguish "no such token" from "revoked token" and probe the
 * collection.
 */
export async function resolveToken(raw: string | null): Promise<string | null> {
  if (!raw || !raw.startsWith(PREFIX)) return null

  const snap = await db.collection(TOKENS).doc(hashToken(raw)).get()
  if (!snap.exists) return null

  const record = snap.data() as TokenRecord
  if (record.revokedAt) return null
  if (typeof record.userId !== 'string' || record.userId.length === 0) return null

  // Defence in depth: the document id is derived from the token, but confirm
  // the stored id matches what we computed before trusting the record.
  const expected = Buffer.from(snap.id, 'utf8')
  const actual = Buffer.from(hashToken(raw), 'utf8')
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null

  // Best effort: never let usage bookkeeping fail an otherwise valid request.
  void snap.ref
    .update({ lastUsedAt: new Date().toISOString() })
    .catch(() => {})

  return record.userId
}
