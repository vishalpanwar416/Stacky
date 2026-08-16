import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { AppHeader } from '../components/AppHeader'
import { McpAccessModal } from '../components/McpAccessModal'
import { doc, getDoc } from 'firebase/firestore'

import { useAuth } from '../contexts/AuthContext'
import { useTheme, type ThemePreference } from '../contexts/ThemeContext'
import { useToast } from '../contexts/ToastContext'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { getDb } from '../lib/firebase'
import { updateUserPreferences } from '../lib/users'
import { acceptInvitation, declineInvitation, leaveWorkspace, subscribeUserInvitations } from '../lib/workspaces'
import type { WorkspaceRole } from '../types'

/**
 * Account settings.
 *
 * The profile menu linked to an alert() reading "Settings coming soon!", while
 * `UserProfile.preferences` already declared theme, maxInProgress and
 * weekStartsOn — two of which nothing could set. This is the screen those
 * fields were always modelled for.
 */

const THEME_OPTIONS: { value: ThemePreference; label: string; hint: string }[] = [
  { value: 'light', label: 'Light', hint: 'Always light' },
  { value: 'dark', label: 'Dark', hint: 'Always dark' },
  { value: 'system', label: 'System', hint: 'Follow your device' },
]

const WEEK_OPTIONS = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 6, label: 'Saturday' },
]

const ROLE_LABEL: Record<WorkspaceRole, string> = {
  owner: 'Owner',
  member: 'Member',
  readonly: 'Read only',
}

function Section({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section
      className="rounded-2xl border p-5 sm:p-6"
      style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
    >
      <h2 className="text-sm font-semibold tracking-tight theme-text">{title}</h2>
      {description && <p className="mt-1 text-xs theme-text-muted">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  )
}

function Row({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 border-t py-4 first:border-t-0 first:pt-0 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: 'var(--color-border)' }}>
      <div className="min-w-0">
        <p className="text-sm theme-text">{label}</p>
        {hint && <p className="mt-0.5 text-xs theme-text-muted">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

export function Settings() {
  const navigate = useNavigate()
  const { user, profile } = useAuth()
  const { preference, setPreference } = useTheme()
  const { toast } = useToast()
  const { workspaces } = useWorkspace()

  const [mcpOpen, setMcpOpen] = useState(false)
  const [invitations, setInvitations] = useState<any[]>([])
  const [roles, setRoles] = useState<Record<string, WorkspaceRole>>({})
  const [busyInvite, setBusyInvite] = useState<string | null>(null)
  const [leaving, setLeaving] = useState<string | null>(null)

  // Preferences are written straight through; the value shown is whatever the
  // profile currently holds, so a failed write cannot leave the UI lying.
  const maxInProgress = profile?.preferences?.maxInProgress ?? 5
  const weekStartsOn = profile?.preferences?.weekStartsOn ?? 0

  useEffect(() => {
    if (!user?.email) return
    return subscribeUserInvitations(user.email, setInvitations)
  }, [user?.email])

  // Each workspace's role has to be read from its own member row. The context
  // only tracks the selected workspace, so reusing that value here would label
  // every other workspace with a role it may not have.
  useEffect(() => {
    if (!user) return
    let cancelled = false
    Promise.all(
      workspaces.map(async (w) => {
        if (w.ownerId === user.uid) return [w.id, 'owner'] as const
        try {
          const snap = await getDoc(doc(getDb(), 'workspaces', w.id, 'members', user.uid))
          return [w.id, ((snap.data()?.role as WorkspaceRole) ?? 'member')] as const
        } catch {
          return [w.id, 'member'] as const
        }
      })
    ).then((pairs) => {
      if (!cancelled) setRoles(Object.fromEntries(pairs))
    })
    return () => {
      cancelled = true
    }
  }, [user, workspaces])

  const savePreference = async (patch: Record<string, unknown>, label: string) => {
    if (!user) return
    try {
      await updateUserPreferences(user.uid, patch)
      toast(`${label} saved`, 'success')
    } catch (err) {
      console.error(err)
      toast(`Could not save ${label.toLowerCase()}`, 'error')
    }
  }

  const leave = async (workspaceId: string, name: string) => {
    if (!window.confirm(`Leave ${name}? You lose access immediately and are unassigned from its tasks. You would need a new invitation to return.`)) return
    setLeaving(workspaceId)
    try {
      const result = await leaveWorkspace(workspaceId)
      toast(
        result.unassignedTasks > 0
          ? `Left ${name} — unassigned from ${result.unassignedTasks} task${result.unassignedTasks === 1 ? '' : 's'}`
          : `Left ${name}`,
        'success'
      )
    } catch (err) {
      console.error(err)
      toast(err instanceof Error ? err.message : 'Could not leave', 'error')
    } finally {
      setLeaving(null)
    }
  }

  const respond = async (id: string, accept: boolean) => {
    setBusyInvite(id)
    try {
      if (accept) {
        await acceptInvitation(id)
        toast('Invitation accepted', 'success')
      } else {
        await declineInvitation(id)
        toast('Invitation declined', 'success')
      }
    } catch (err) {
      console.error(err)
      toast(err instanceof Error ? err.message : 'Something went wrong', 'error')
    } finally {
      setBusyInvite(null)
    }
  }

  return (
    <div className="flex min-h-screen flex-col" style={{ background: 'var(--color-bg)' }}>
      {mcpOpen && <McpAccessModal onClose={() => setMcpOpen(false)} />}

      <AppHeader onMenuClick={() => navigate('/')} />

      <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="mb-6 inline-flex items-center gap-1.5 text-xs theme-text-muted transition-colors hover:theme-text"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Overview
        </button>

        <h1 className="text-2xl font-bold tracking-tight theme-text font-display">Settings</h1>
        <p className="mt-1 text-sm theme-text-muted">Your account, how Stacky behaves, and who you share with.</p>

        <div className="mt-8 flex flex-col gap-5">

          <Section title="Profile" description="Comes from the Google account you signed in with.">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full theme-bg-subtle text-lg theme-text-muted">
                {profile?.photoURL ?? user?.photoURL ? (
                  <img src={(profile?.photoURL ?? user?.photoURL)!} alt="" className="h-full w-full object-cover" />
                ) : (
                  (profile?.displayName?.[0] ?? profile?.email?.[0] ?? '?').toUpperCase()
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium theme-text">{profile?.displayName ?? 'Unnamed'}</p>
                <p className="truncate text-xs theme-text-muted">{profile?.email ?? user?.email}</p>
              </div>
            </div>
          </Section>

          <Section title="Preferences" description="Saved to your account and applied everywhere you sign in.">
            <Row label="Theme" hint="System follows your device setting.">
              <div className="flex gap-1 rounded-xl border p-1" style={{ borderColor: 'var(--color-border)' }}>
                {THEME_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    title={opt.hint}
                    onClick={() => setPreference(opt.value)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      preference === opt.value ? 'theme-accent-bg' : 'theme-text-muted hover:theme-text'
                    }`}
                    style={preference === opt.value ? { color: 'var(--color-accent)' } : undefined}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </Row>

            <Row
              label="Tasks in progress at once"
              hint="The board stops you starting another once you hit this."
            >
              <input
                type="number"
                min={1}
                max={20}
                defaultValue={maxInProgress}
                onBlur={(e) => {
                  const next = Math.min(20, Math.max(1, Number(e.target.value) || 1))
                  e.target.value = String(next)
                  if (next !== maxInProgress) void savePreference({ maxInProgress: next }, 'Limit')
                }}
                className="w-20 rounded-xl theme-input px-3 py-2 text-sm"
                aria-label="Maximum tasks in progress"
              />
            </Row>

            <Row label="Week starts on" hint="Used by the calendar.">
              <select
                value={weekStartsOn}
                onChange={(e) => void savePreference({ weekStartsOn: Number(e.target.value) }, 'Week start')}
                className="select-input text-sm"
              >
                {WEEK_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </Row>
          </Section>

          <Section
            title="Claude / MCP access"
            description="Tokens let an MCP client act on your tasks as you. Revoke one and it stops working immediately."
          >
            <button
              type="button"
              onClick={() => setMcpOpen(true)}
              className="rounded-xl border px-4 py-2 text-sm font-medium theme-text transition-colors theme-surface-hover-bg"
              style={{ borderColor: 'var(--color-border)' }}
            >
              Manage access tokens
            </button>
          </Section>

          <Section title="Workspaces" description="Everywhere you have access, and what you can do there.">
            {workspaces.length === 0 ? (
              <p className="text-sm theme-text-muted">You are not in any workspace yet.</p>
            ) : (
              <div>
                {workspaces.map((w) => {
                  const role: WorkspaceRole = w.ownerId === user?.uid ? 'owner' : roles[w.id] ?? 'member'
                  return (
                    <Row key={w.id} label={w.name} hint={w.description || undefined}>
                      <div className="flex items-center gap-3">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-tight ${
                            role === 'owner'
                              ? 'border border-amber-500/20 bg-amber-500/10 text-amber-500'
                              : role === 'readonly'
                                ? 'border theme-border theme-text-faint'
                                : 'border theme-border theme-text-muted'
                          }`}
                        >
                          {ROLE_LABEL[role]}
                        </span>
                        {/* Owners cannot leave their own workspace — there would
                            be nobody left to administer it. They delete it. */}
                        {role !== 'owner' && (
                          <button
                            type="button"
                            disabled={leaving === w.id}
                            onClick={() => leave(w.id, w.name)}
                            className="rounded-lg px-2.5 py-1 text-xs font-medium theme-text-muted transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"
                          >
                            {leaving === w.id ? 'Leaving…' : 'Leave'}
                          </button>
                        )}
                      </div>
                    </Row>
                  )
                })}
              </div>
            )}
          </Section>

          {invitations.length > 0 && (
            <Section title="Pending invitations" description="Someone has asked you to join.">
              {invitations.map((inv) => (
                <Row
                  key={inv.id}
                  label={inv.workspaceName ?? 'A workspace'}
                  hint={inv.invitedByName ? `Invited by ${inv.invitedByName}` : undefined}
                >
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busyInvite === inv.id}
                      onClick={() => respond(inv.id, true)}
                      className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      disabled={busyInvite === inv.id}
                      onClick={() => respond(inv.id, false)}
                      className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium theme-text transition-colors hover:bg-white/20 disabled:opacity-50"
                    >
                      Decline
                    </button>
                  </div>
                </Row>
              ))}
            </Section>
          )}
        </div>
      </main>
    </div>
  )
}
