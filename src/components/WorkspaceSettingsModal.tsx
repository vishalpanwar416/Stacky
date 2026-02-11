import { useState, useEffect } from 'react'
import { getWorkspaceMembers, createInvitation } from '../lib/workspaces'
import type { Workspace, WorkspaceMember } from '../types'
import { useToast } from '../contexts/ToastContext'
import { useAuth } from '../contexts/AuthContext'

interface WorkspaceSettingsModalProps {
    isOpen: boolean
    onClose: () => void
    workspace: Workspace
    onUpdate: (id: string, name: string, description?: string) => Promise<void>
}

export function WorkspaceSettingsModal({
    isOpen,
    onClose,
    workspace,
    onUpdate,
}: WorkspaceSettingsModalProps) {
    const { toast } = useToast()
    const { user } = useAuth()

    const [activeTab, setActiveTab] = useState<'general' | 'members'>('general')
    const [name, setName] = useState(workspace.name)
    const [description, setDescription] = useState(workspace.description || '')
    const [loading, setLoading] = useState(false)
    const [members, setMembers] = useState<WorkspaceMember[]>([])
    const [membersLoading, setMembersLoading] = useState(false)

    const [inviteEmail, setInviteEmail] = useState('')
    const [inviting, setInviting] = useState(false)

    useEffect(() => {
        setName(workspace.name)
        setDescription(workspace.description || '')
    }, [workspace])

    useEffect(() => {
        if (isOpen && activeTab === 'members') {
            fetchMembers()
        }
    }, [isOpen, activeTab, workspace.id])

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

    const handleInvite = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!inviteEmail.trim()) return
        if (!user) return

        setInviting(true)
        try {
            await createInvitation(workspace.id, inviteEmail.trim(), user.uid)
            toast(`Invitation sent to ${inviteEmail}`, 'success')
            setInviteEmail('')
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
                            <form onSubmit={handleInvite} className="flex gap-2">
                                <input
                                    type="email"
                                    value={inviteEmail}
                                    onChange={(e) => setInviteEmail(e.target.value)}
                                    placeholder="Invite by email..."
                                    className="flex-1 rounded-xl border theme-border bg-white/5 px-3 py-2 text-sm theme-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                                />
                                <button
                                    type="submit"
                                    disabled={inviting || !inviteEmail.trim()}
                                    className="rounded-xl theme-bg-accent px-4 py-2 text-sm font-medium text-white shadow-lg shadow-accent/20 transition-all hover:brightness-110 disabled:opacity-50 disabled:shadow-none"
                                >
                                    {inviting ? 'Sending…' : 'Invite'}
                                </button>
                            </form>

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
                                    <div className="max-h-60 overflow-y-auto space-y-1 -mx-2 px-2">
                                        {members.map((member) => (
                                            <div key={member.userId} className="flex items-center justify-between rounded-lg p-2 hover:bg-white/5">
                                                <div className="flex items-center gap-3">
                                                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-xs font-medium theme-text">
                                                        {(member.displayName?.[0] || member.email?.[0] || '?').toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <div className="text-sm font-medium theme-text">
                                                            {member.displayName || 'Unknown User'}
                                                        </div>
                                                        <div className="text-xs theme-text-muted">
                                                            {member.email || 'No email'}
                                                        </div>
                                                    </div>
                                                </div>
                                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${member.role === 'owner'
                                                    ? 'bg-amber-500/10 text-amber-500'
                                                    : 'bg-white/10 theme-text-muted'
                                                    }`}>
                                                    {member.role}
                                                </span>
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
