import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

import { getAuth } from '../lib/firebase'
import { useToast } from '../contexts/ToastContext'

/**
 * Self-serve setup for connecting an MCP client to Stacky.
 *
 * Rendered through a portal to document.body: the trigger lives inside the
 * header, and a `fixed` overlay nested there is positioned against the header's
 * containing block rather than the viewport.
 *
 * The token is a credential for this account, so the server returns it exactly
 * once at creation. There is no way to show it again later — hence the config
 * snippets are only offered while it is still in memory.
 */

interface TokenSummary {
  id: string
  label: string
  createdAt: string
  lastUsedAt: string | null
}

type ClientKind = 'claude-code' | 'desktop' | 'raw'

const CLIENTS: { id: ClientKind; name: string; note: string }[] = [
  { id: 'claude-code', name: 'Claude Code', note: 'One command in your terminal.' },
  { id: 'desktop', name: 'Claude Desktop', note: 'Add to claude_desktop_config.json, then restart.' },
  { id: 'raw', name: 'Other clients', note: 'Anything that speaks streamable HTTP MCP.' },
]

async function authedFetch(path: string, init: RequestInit = {}) {
  const user = getAuth().currentUser
  if (!user) throw new Error('You need to be signed in.')
  const idToken = await user.getIdToken()
  const res = await fetch(path, {
    ...init,
    headers: { ...(init.headers ?? {}), 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status}).`)
  return body
}

function snippet(kind: ClientKind, endpoint: string, token: string): string {
  const auth = `Authorization: Bearer ${token}`
  if (kind === 'claude-code') {
    return `claude mcp add --transport http stacky ${endpoint} \\\n  --header "${auth}"`
  }
  if (kind === 'desktop') {
    return JSON.stringify(
      {
        mcpServers: {
          stacky: { command: 'npx', args: ['-y', 'mcp-remote', endpoint, '--header', auth] },
        },
      },
      null,
      2
    )
  }
  return `POST ${endpoint}\n${auth}`
}

export function McpAccessModal({ onClose }: { onClose: () => void }) {
  const { toast } = useToast()
  const endpoint = `${window.location.origin}/api/mcp`

  const [tokens, setTokens] = useState<TokenSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [label, setLabel] = useState('Claude')
  const [client, setClient] = useState<ClientKind>('claude-code')
  /** Only present immediately after minting — never re-fetchable. */
  const [freshToken, setFreshToken] = useState<string | null>(null)

  const load = useCallback(async () => {
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

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

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast(`${what} copied`, 'success')
    } catch {
      toast('Could not copy — select the text and copy manually.', 'error')
    }
  }

  return createPortal(
    <>
      <div className="fixed inset-0 z-[1999] bg-black/60 backdrop-blur-md" onClick={onClose} aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Connect a client to Stacky"
        className="fixed left-1/2 top-1/2 z-[2000] flex max-h-[85vh] w-[min(42rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-3xl border theme-border theme-bg-subtle shadow-2xl"
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b theme-border p-5">
          <div>
            <h2 className="text-lg font-semibold theme-text">Connect to Claude</h2>
            <p className="mt-0.5 text-sm theme-text-muted">
              Let Claude read and file tasks in your workspaces — and only yours.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-2 py-1 theme-text-faint transition-colors hover:theme-text"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {/* Step 1 — the credential */}
          <div className="mb-6">
            <p className="mb-2 text-xs font-medium uppercase tracking-widest theme-text-faint">
              Step 1 · Create a token
            </p>

            {freshToken ? (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3">
                <p className="text-xs text-amber-400">
                  Copy it below — for your security it is never shown again.
                </p>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="What is this for? e.g. laptop"
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
          </div>

          {/* Step 2 — client-specific setup */}
          <div className="mb-6">
            <p className="mb-2 text-xs font-medium uppercase tracking-widest theme-text-faint">
              Step 2 · Add it to your client
            </p>

            <div className="mb-3 flex flex-wrap gap-1.5">
              {CLIENTS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setClient(c.id)}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors ${
                    client === c.id
                      ? 'theme-border theme-text theme-surface-bg'
                      : 'border-transparent theme-text-faint hover:theme-text'
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>

            <p className="mb-2 text-xs theme-text-muted">
              {CLIENTS.find((c) => c.id === client)!.note}
            </p>

            <div className="relative">
              <pre className="max-h-52 overflow-auto rounded-2xl theme-surface-bg p-3 text-xs leading-relaxed theme-text">
                {snippet(client, endpoint, freshToken ?? 'YOUR_TOKEN')}
              </pre>
              <button
                type="button"
                onClick={() => void copy(snippet(client, endpoint, freshToken ?? 'YOUR_TOKEN'), 'Snippet')}
                className="absolute right-2 top-2 rounded-lg border theme-border px-2 py-1 text-[11px] font-medium theme-text transition-colors theme-surface-hover-bg"
              >
                Copy
              </button>
            </div>

            {!freshToken && (
              <p className="mt-2 text-xs theme-text-faint">
                Create a token above and it will be filled in here automatically.
              </p>
            )}
          </div>

          {/* Existing tokens */}
          <div className="border-t pt-4 theme-border">
            <p className="mb-2 text-xs font-medium uppercase tracking-widest theme-text-faint">
              Your tokens
            </p>
            {loading ? (
              <div className="h-10 animate-pulse rounded-2xl theme-surface-bg" />
            ) : tokens.length === 0 ? (
              <p className="text-sm theme-text-faint">None yet.</p>
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
                          ? `Last used ${new Date(t.lastUsedAt).toLocaleString()}`
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

        <div className="shrink-0 border-t theme-border px-5 py-3">
          <p className="text-xs theme-text-faint">
            A token acts as you. Revoking one takes effect on the next request.
          </p>
        </div>
      </div>
    </>,
    document.body
  )
}
