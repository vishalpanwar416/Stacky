import { useState, useEffect, useRef } from 'react'
import { getWorkspaceMembers, createInvitation, updateMemberRole, removeMember, linkRepo } from '../lib/workspaces'
import { searchUsers } from '../lib/users'
import type { Workspace, WorkspaceMember, UserProfile, WorkspaceRole } from '../types'

const ROLE_LABEL: Record<WorkspaceRole, string> = {
    owner: 'Owner',
    member: 'Member',
    readonly: 'Read only',
}
import { useToast } from '../contexts/ToastContext'
import { useAuth } from '../contexts/AuthContext'

interface WorkspaceSettingsModalProps {
    isOpen: boolean
    onClose: () => void
    workspace: Workspace
    onUpdate: (id: string, name: string, description?: string) => Promise<void>
    initialTab?: 'general' | 'members'
}

export function WorkspaceSettingsModal({
    isOpen,
    onClose,
    workspace,
    onUpdate,
    initialTab = 'general',
}: WorkspaceSettingsModalProps) {
    const { toast } = useToast()
    const { user, profile } = useAuth()

    const [activeTab, setActiveTab] = useState<'general' | 'members'>(initialTab)

    useEffect(() => {
        if (isOpen) {
            setActiveTab(initialTab)
        }
    }, [isOpen, initialTab])

    const [name, setName] = useState(workspace.name)
    const [description, setDescription] = useState(workspace.description || '')
    const [loading, setLoading] = useState(false)
    const [members, setMembers] = useState<WorkspaceMember[]>([])
    const [membersLoading, setMembersLoading] = useState(false)

    const [inviteEmail, setInviteEmail] = useState('')
    const [inviting, setInviting] = useState(false)
    const [searchResults, setSearchResults] = useState<UserProfile[]>([])
    const [searching, setSearching] = useState(false)
    const [showResults, setShowResults] = useState(false)
    const searchRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        setName(workspace.name)
        setDescription(workspace.description || '')
    }, [workspace])

    useEffect(() => {
        if (isOpen && activeTab === 'members') {
            fetchMembers()
        }
    }, [isOpen, activeTab, workspace.id])

    // Close results when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
                setShowResults(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    const fetchMembers = async () => {
        setMembersLoading(true)
        try {
            const data = await getWorkspaceMembers(workspace.id)
            setMembers(data)
        } catch (error) {
            console.error('Failed to fetch members:', error)
            toast('Failed to load members', 'error')
        } finally {
            setMembersLoading(false)
        }
    }

    const [savingRole, setSavingRole] = useState<string | null>(null)
    const [repo, setRepo] = useState((workspace as { repo?: string }).repo ?? '')
    const [linkingRepo, setLinkingRepo] = useState(false)

    const handleLinkRepo = async (connect: boolean) => {
        setLinkingRepo(true)
        try {
            await linkRepo(workspace.id, repo.trim(), connect)
            toast(connect ? `Connected ${repo.trim()}` : 'Repository disconnected', 'success')
            if (!connect) setRepo('')
        } catch (error) {
            console.error(error)
            toast(error instanceof Error ? error.message : 'Could not update the repository', 'error')
        } finally {
            setLinkingRepo(false)
        }
    }
    const isOwner = workspace.ownerId === user?.uid

    /**
     * The workspace's ownerId is the authority on ownership, not the member
     * row's role field — those disagreed on older rows, which is why the owner
     * could appear as an ordinary member.
     */
    const roleOf = (member: WorkspaceMember): WorkspaceRole =>
        member.userId === workspace.ownerId ? 'owner' : (member.role ?? 'member')

    const handleRoleChange = async (userId: string, role: 'member' | 'readonly') => {
        setSavingRole(userId)
        try {
            await updateMemberRole(workspace.id, userId, role)
            setMembers((prev) => prev.map((m): WorkspaceMember => (m.userId === userId ? { ...m, role } : m)))
            toast(`Role updated to ${ROLE_LABEL[role]}`, 'success')
        } catch (error) {
            console.error(error)
            toast('Failed to update role', 'error')
        } finally {
            setSavingRole(null)
        }
    }

    const handleRemove = async (member: WorkspaceMember) => {
        const who = displayFor(member).name ?? displayFor(member).email ?? 'this person'
        if (!window.confirm(`Remove ${who} from ${workspace.name}? They lose access immediately and are unassigned from its tasks.`)) return
        setSavingRole(member.userId)
        try {
            const result = await removeMember(workspace.id, member.userId)
            setMembers((prev) => prev.filter((m) => m.userId !== member.userId))
            toast(
                result.unassignedTasks > 0
                    ? `${who} removed — unassigned from ${result.unassignedTasks} task${result.unassignedTasks === 1 ? '' : 's'}`
                    : `${who} removed`,
                'success'
            )
        } catch (error) {
            console.error(error)
            toast(error instanceof Error ? error.message : 'Could not remove them', 'error')
        } finally {
            setSavingRole(null)
        }
    }

    /**
     * Member rows render a denormalised copy of the member's name and email.
     * Older rows — and any written by a client that had no profile to hand —
     * stored nulls, which surfaced as "Unknown User". For the signed-in user we
     * always have the real profile, so prefer it over whatever was copied.
     */
    const displayFor = (member: WorkspaceMember) =>
        member.userId === user?.uid
            ? {
                name: member.displayName ?? profile?.displayName ?? user?.displayName ?? null,
                email: member.email ?? profile?.email ?? user?.email ?? null,
            }
            : { name: member.displayName ?? null, email: member.email ?? null }

    const handleSearch = async (val: string) => {
        setInviteEmail(val)
        if (val.trim().length >= 2) {
            setSearching(true)
            setShowResults(true)
            try {
                const results = await searchUsers(val.trim())
                setSearchResults(results)
            } catch (err) {
                console.error('Search error:', err)
            } finally {
                setSearching(false)
            }
        } else {
            setSearchResults([])
            setShowResults(false)
        }
    }

    const handleSaveGeneral = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!name.trim()) return

        setLoading(true)
        try {
            await onUpdate(workspace.id, name.trim(), description.trim())
            toast('Workspace updated', 'success')
            onClose()
        } catch (error) {
            console.error(error)
            toast('Failed to update workspace', 'error')
        } finally {
            setLoading(false)
        }
    }

    const handleInvite = async (e?: React.FormEvent, emailValue?: string) => {
        if (e) e.preventDefault()
        const email = (emailValue || inviteEmail).trim()
        if (!email) return
        if (!user) return

        setInviting(true)
        try {
            const result = await createInvitation(workspace.id, email, user.uid, profile?.displayName ?? undefined)
            // The invitation always exists; the email may not have gone out.
            // Saying "sent" either way would be a lie the inviter acts on.
            if (result.emailed) {
                toast(`Invitation emailed to ${email}`, 'success')
            } else if (result.hasAccount) {
                toast(`${email} was invited — they'll see it in Stacky. Email failed: ${result.emailError}`, 'success')
            } else {
                toast(`Invitation created, but the email could not be sent. ${result.emailError}`, 'error')
            }
            setInviteEmail('')
            setShowResults(false)
            setSearchResults([])
        } catch (error) {
            console.error(error)
            toast(error instanceof Error ? error.message : 'Failed to send invite', 'error')
        } finally {
            setInviting(false)
        }
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />

            <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border theme-border theme-surface-bg shadow-2xl animate-scale-in">
                <div className="flex items-center justify-between border-b theme-border px-6 py-4">
                    <h2 className="text-lg font-semibold theme-text">Workspace Settings</h2>
                    <button onClick={onClose} className="rounded-lg p-1 theme-text-muted hover:bg-white/5 hover:theme-text">
                        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="flex border-b theme-border">
                    <button
                        onClick={() => setActiveTab('general')}
                        className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${activeTab === 'general'
                            ? 'theme-surface-bg border-b-2 border-primary theme-text'
                            : 'bg-transparent theme-text-muted hover:theme-text hover:bg-white/5'
                            }`}
                    >
                        General
                    </button>
                    <button
                        onClick={() => setActiveTab('members')}
                        className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${activeTab === 'members'
                            ? 'theme-surface-bg border-b-2 border-primary theme-text'
                            : 'bg-transparent theme-text-muted hover:theme-text hover:bg-white/5'
                            }`}
                    >
                        Members
                    </button>
                </div>

                <div className="p-6">
                    {activeTab === 'general' ? (
                        <form onSubmit={handleSaveGeneral} className="space-y-4">
                            <div>
                                <label htmlFor="ws-name" className="mb-1.5 block text-sm font-medium theme-text">
                                    Workspace Name
                                </label>
                                <input
                                    id="ws-name"
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="w-full rounded-xl border theme-border bg-white/5 px-3 py-2.5 text-sm theme-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                                    placeholder="e.g. My Team"
                                    required
                                />
                            </div>

                            <div>
                                <label htmlFor="ws-desc" className="mb-1.5 block text-sm font-medium theme-text">
                                    Description
                                </label>
                                <textarea
                                    id="ws-desc"
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    className="w-full rounded-xl border theme-border bg-white/5 px-3 py-2.5 text-sm theme-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary min-h-[100px]"
                                    placeholder="What is this workspace for?"
                                />
                            </div>

                            <div className="flex justify-end pt-2">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="mr-3 rounded-xl px-4 py-2 text-sm font-medium theme-text-muted hover:theme-text"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading || !name.trim()}
                                    className="rounded-xl theme-bg-accent px-4 py-2 text-sm font-medium text-white shadow-lg shadow-accent/20 transition-all hover:brightness-110 disabled:opacity-50 disabled:shadow-none"
                                >
                                    {loading ? 'Saving…' : 'Save Changes'}
                                </button>
                            </div>
                        </form>
                    ) : (
                        <div className="space-y-6">
                            <form onSubmit={(e) => handleInvite(e)} className="flex gap-2">
                                <div className="relative flex-1" ref={searchRef}>
                                    <input
                                        type="email"
                                        value={inviteEmail}
                                        onChange={(e) => handleSearch(e.target.value)}
                                        onFocus={() => inviteEmail.length >= 2 && setShowResults(true)}
                                        placeholder="Type name or email..."
                                        className="w-full rounded-xl border theme-border bg-white/5 px-3 py-2 text-sm theme-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                                    />
                                    {searching && (
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                                        </div>
                                    )}

                                    {showResults && searchResults.length > 0 && (
                                        <div className="absolute left-0 right-0 top-full z-20 mt-2 max-h-60 overflow-y-auto rounded-xl border theme-border theme-bg-subtle backdrop-blur-xl shadow-2xl animate-scale-in ring-1 ring-black/5">
                                            {searchResults.map((res) => (
                                                <button
                                                    key={res.id}
                                                    type="button"
                                                    onClick={() => handleInvite(undefined, res.email)}
                                                    className="flex w-full items-center gap-3 p-3 text-left transition-all hover:bg-white/10 active:scale-[0.98]"
                                                >
                                                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-medium text-sm ${res.photoURL ? '' : 'bg-primary/20 theme-text'}`}>
                                                        {res.photoURL ? (
                                                            <img src={res.photoURL} alt="" className="h-full w-full rounded-xl object-cover" />
                                                        ) : (
                                                            (res.displayName?.[0] || res.email?.[0] || '?').toUpperCase()
                                                        )}
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <div className="truncate text-sm font-semibold theme-text">{res.displayName}</div>
                                                        <div className="truncate text-xs theme-text-muted">{res.email}</div>
                                                    </div>
                                                    <div className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
                                                        <svg className="h-4 w-4 theme-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                                        </svg>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    {showResults && !searching && searchResults.length === 0 && inviteEmail.length >= 2 && (
                                        <div className="absolute left-0 right-0 top-full z-20 mt-2 rounded-xl border theme-border theme-bg-subtle backdrop-blur-xl p-4 shadow-2xl animate-scale-in text-center text-sm theme-text-muted">
                                            No users found. Hit enter to invite via email.
                                        </div>
                                    )}
                                </div>
                                <button
                                    type="submit"
                                    disabled={inviting || !inviteEmail.trim()}
                                    className="rounded-xl theme-bg-accent px-4 py-2 text-sm font-medium text-white shadow-lg shadow-accent/20 transition-all hover:brightness-110 disabled:opacity-50 disabled:shadow-none"
                                >
                                    {inviting ? 'Sending…' : 'Invite'}
                                </button>
                            </form>

                            {isOwner && (
                                <div className="mb-5 rounded-xl border theme-border p-3">
                                    <p className="text-xs font-semibold uppercase tracking-wider theme-text-muted">GitHub repository</p>
                                    <p className="mt-1 text-xs theme-text-muted">
                                        Pushes and pull requests here are matched against this workspace's tasks, and Stacky suggests status changes for you to approve.
                                    </p>
                                    <div className="mt-3 flex gap-2">
                                        <input
                                            value={repo}
                                            onChange={(e) => setRepo(e.target.value)}
                                            placeholder="owner/repository"
                                            className="min-w-0 flex-1 rounded-xl theme-input px-3 py-2 text-sm"
                                        />
                                        <button
                                            type="button"
                                            disabled={linkingRepo || !repo.trim()}
                                            onClick={() => handleLinkRepo(true)}
                                            className="shrink-0 rounded-xl border theme-border px-3 py-2 text-xs font-medium theme-text transition-colors theme-surface-hover-bg disabled:opacity-40"
                                        >
                                            {linkingRepo ? 'Saving…' : 'Connect'}
                                        </button>
                                        <button
                                            type="button"
                                            disabled={linkingRepo || !repo.trim()}
                                            onClick={() => handleLinkRepo(false)}
                                            className="shrink-0 rounded-xl px-2 py-2 text-xs theme-text-faint transition-colors hover:text-red-400 disabled:opacity-40"
                                            title="Disconnect"
                                        >
                                            Remove
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div className="space-y-3">
                                <h3 className="text-xs font-semibold uppercase tracking-wider theme-text-muted">
                                    Members ({members.length})
                                </h3>

                                {membersLoading ? (
                                    <div className="space-y-3">
                                        <div className="h-10 animate-pulse rounded-lg bg-white/5" />
                                        <div className="h-10 animate-pulse rounded-lg bg-white/5" />
                                    </div>
                                ) : (
                                    <div className="max-height-60 overflow-y-auto space-y-1 -mx-2 px-2">
                                        {[...members].sort((a, b) => {
                                            if (a.userId === user?.uid) return -1
                                            if (b.userId === user?.uid) return 1
                                            if (roleOf(a) === 'owner') return -1
                                            if (roleOf(b) === 'owner') return 1
                                            return 0
                                        }).map((member) => (
                                            <div key={member.userId} className="flex items-center justify-between rounded-lg p-2 hover:bg-white/5">
                                                <div className="flex items-center gap-3">
                                                    <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium ${member.userId === user?.uid ? 'bg-primary text-white' : 'bg-primary/20 theme-text'}`}>
                                                        {(displayFor(member).name?.[0] || displayFor(member).email?.[0] || '?').toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <div className="text-sm font-medium theme-text">
                                                            {displayFor(member).name || 'Unknown member'}
                                                            {member.userId === user?.uid && <span className="ml-2 text-[10px] theme-text-muted opacity-60">(You)</span>}
                                                        </div>
                                                        <div className="text-xs theme-text-muted">
                                                            {displayFor(member).email || 'No email'}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                {roleOf(member) === 'owner' || !isOwner ? (
                                                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-tight ${roleOf(member) === 'owner'
                                                        ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                                                        : roleOf(member) === 'readonly'
                                                            ? 'bg-white/5 theme-text-faint border border-white/10'
                                                            : 'bg-white/10 theme-text-muted'
                                                        }`}>
                                                        {ROLE_LABEL[roleOf(member)]}
                                                    </span>
                                                ) : (
                                                    <select
                                                        value={roleOf(member)}
                                                        disabled={savingRole === member.userId}
                                                        onChange={(e) => handleRoleChange(member.userId, e.target.value as 'member' | 'readonly')}
                                                        className="select-input text-xs disabled:opacity-50"
                                                        aria-label={`Role for ${displayFor(member).name ?? displayFor(member).email ?? 'member'}`}
                                                    >
                                                        <option value="member">Member</option>
                                                        <option value="readonly">Read only</option>
                                                    </select>
                                                )}
                                                {isOwner && roleOf(member) !== 'owner' && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemove(member)}
                                                        disabled={savingRole === member.userId}
                                                        className="rounded-lg p-1.5 theme-text-faint transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"
                                                        title="Remove from workspace"
                                                        aria-label={`Remove ${displayFor(member).name ?? displayFor(member).email ?? 'member'}`}
                                                    >
                                                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                                        </svg>
                                                    </button>
                                                )}
                                                </div>
                                            </div>
                                        ))}

                                        {members.length === 0 && (
                                            <p className="py-4 text-center text-sm theme-text-muted">No members found.</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
