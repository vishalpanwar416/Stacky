import { useCallback, useEffect, useState } from 'react'

import { getAuth } from '../lib/firebase'
import { useToast } from '../contexts/ToastContext'

/**
 * Manage access tokens for the hosted MCP server.
 *
 * A token is a credential for this account, so the server only ever returns it
 * once, at creation. There is no way to retrieve it later — the rest of the
 * time we can show metadata but never the value itself.
 */

interface TokenSummary {
  id: string
  label: string
  createdAt: string
  lastUsedAt: string | null
}

const MCP_URL = `${window.location.origin}/api/mcp`

async function authedFetch(path: string, init: RequestInit = {}) {
  const user = getAuth().currentUser
  if (!user) throw new Error('You need to be signed in.')
  const idToken = await user.getIdToken()
  const res = await fetch(path, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status}).`)
  return body
}

export function McpAccessModal({ onClose }: { onClose: () => void }) {
  const { toast } = useToast()
  const [tokens, setTokens] = useState<TokenSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [label, setLabel] = useState('Claude')
  /** Present only immediately after minting — never re-fetchable. */
  const [freshToken, setFreshToken] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { tokens } = await authedFetch('/api/mcp-token')
      setTokens(tokens ?? [])
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void load()
  }, [load])

  async function createToken() {
    setCreating(true)
    try {
      const res = await authedFetch('/api/mcp-token', {
        method: 'POST',
        body: JSON.stringify({ label: label.trim() || 'Claude' }),
      })
      setFreshToken(res.token)
      await load()
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setCreating(false)
    }
  }

  async function revoke(id: string) {
    try {
      await authedFetch('/api/mcp-token', { method: 'DELETE', body: JSON.stringify({ id }) })
      setTokens((t) => t.filter((x) => x.id !== id))
      toast('Token revoked', 'success')
    } catch (err) {
      toast((err as Error).message, 'error')
    }
  }

  const command = freshToken
    ? `claude mcp add --transport http stacky ${MCP_URL} --header "Authorization: Bearer ${freshToken}"`
    : ''

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast(`${what} copied`, 'success')
    } catch {
      toast('Could not copy — select and copy manually.', 'error')
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-[999] bg-black/50 backdrop-blur-md"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="fixed left-1/2 top-1/2 z-[1000] w-[min(38rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-3xl border theme-border glass-strong p-6">
        <div className="mb-1 flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold theme-text">Connect Claude to Stacky</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 theme-text-faint transition-colors hover:theme-text"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <p className="mb-5 text-sm theme-text-muted">
          Create an access token, then paste the command into your terminal. Claude will be able to
          read and file tasks in your workspaces — and only yours.
        </p>

        {freshToken ? (
          <div className="mb-5 rounded-2xl border theme-border p-4">
            <p className="mb-2 text-xs font-medium text-amber-400">
              Copy this now — it is not shown again.
            </p>
            <code className="block break-all rounded-xl theme-surface-bg p-3 text-xs theme-text">
              {command}
            </code>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void copy(command, 'Command')}
                className="rounded-xl border theme-border px-3 py-1.5 text-xs font-medium theme-text transition-colors theme-surface-hover-bg"
              >
                Copy command
              </button>
              <button
                type="button"
                onClick={() => void copy(freshToken, 'Token')}
                className="rounded-xl px-3 py-1.5 text-xs font-medium theme-text-faint transition-colors hover:theme-text"
              >
                Copy token only
              </button>
              <button
                type="button"
                onClick={() => setFreshToken(null)}
                className="ml-auto rounded-xl px-3 py-1.5 text-xs font-medium theme-text-faint transition-colors hover:theme-text"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="What is this for?"
              className="min-w-0 flex-1 rounded-2xl theme-input px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => void createToken()}
              disabled={creating}
              className="rounded-2xl border theme-border px-4 py-2 text-sm font-medium theme-text transition-colors theme-surface-hover-bg disabled:opacity-50"
            >
              {creating ? 'Creating…' : 'Create token'}
            </button>
          </div>
        )}

        <div className="border-t pt-4 theme-border">
          {loading ? (
            <p className="text-sm theme-text-faint">Loading…</p>
          ) : tokens.length === 0 ? (
            <p className="text-sm theme-text-faint">No tokens yet.</p>
          ) : (
            <ul className="space-y-2">
              {tokens.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-3 rounded-2xl theme-surface-bg px-4 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm theme-text">{t.label}</p>
                    <p className="text-xs theme-text-faint">
                      {t.lastUsedAt
                        ? `Last used ${new Date(t.lastUsedAt).toLocaleDateString()}`
                        : 'Never used'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void revoke(t.id)}
                    className="shrink-0 rounded-xl px-2.5 py-1 text-xs font-medium theme-text-faint transition-colors hover:text-rose-400"
                  >
                    Revoke
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  )
}
