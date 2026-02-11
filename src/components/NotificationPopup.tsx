import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { getUserInvitations, acceptInvitation, declineInvitation } from '../lib/workspaces'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'

interface NotificationPopupProps {
    onClose: () => void
}

export function NotificationPopup({ onClose }: NotificationPopupProps) {
    const { user, profile } = useAuth()
    const { toast } = useToast()
    const [invitations, setInvitations] = useState<any[]>([])
    const [loadingInvites, setLoadingInvites] = useState(true)

    useEffect(() => {
        const fetchInvites = async () => {
            if (user?.email) {
                try {
                    const data = await getUserInvitations(user.email)
                    setInvitations(data)
                } catch (err) {
                    console.error('Failed to load invitations', err)
                } finally {
                    setLoadingInvites(false)
                }
            }
        }
        fetchInvites()

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose()
            }
        }
        document.addEventListener('keydown', handleEscape)
        return () => document.removeEventListener('keydown', handleEscape)
    }, [user, onClose])

    const handleAccept = async (inviteId: string) => {
        if (!user) return
        try {
            await acceptInvitation(inviteId, user.uid, profile?.displayName || user.displayName || 'User')
            toast('Invitation accepted', 'success')
            setInvitations(prev => prev.filter(i => i.id !== inviteId))
            window.location.reload()
        } catch (err) {
            console.error(err)
            toast('Failed to accept invitation', 'error')
        }
    }

    const handleDecline = async (inviteId: string) => {
        try {
            await declineInvitation(inviteId)
            toast('Invitation declined', 'info')
            setInvitations(prev => prev.filter(i => i.id !== inviteId))
        } catch (err) {
            console.error(err)
            toast('Failed to decline', 'error')
        }
    }

    return createPortal(
        <>
            <div className="fixed inset-0 z-[1100] bg-black/50 backdrop-blur-md transition-opacity" onClick={onClose} aria-hidden="true" />

            <div
                className="fixed top-16 right-4 sm:right-24 w-80 rounded-2xl border theme-border theme-bg-subtle shadow-2xl ring-1 theme-border animate-scale-in z-[1200] flex flex-col max-h-[80vh]"
            >
                <div className="p-4 border-b theme-border shrink-0">
                    <h2 className="text-sm font-semibold theme-text font-display">Notifications</h2>
                </div>

                <div className="flex-1 overflow-y-auto min-h-0 p-2">
                    {loadingInvites ? (
                        <div className="space-y-2 p-2">
                            <div className="h-16 rounded-xl bg-white/5 animate-pulse" />
                            <div className="h-16 rounded-xl bg-white/5 animate-pulse" />
                        </div>
                    ) : invitations.length === 0 ? (
                        <div className="py-8 text-center">
                            <svg className="mx-auto h-8 w-8 theme-text-muted opacity-20 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                            </svg>
                            <p className="text-sm theme-text-muted">No new notifications</p>
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {invitations.map(invite => (
                                <div key={invite.id} className="p-3 rounded-xl bg-white/5 border theme-border">
                                    <p className="text-xs theme-text mb-3">
                                        <span className="font-semibold">{invite.invitedBy}</span> invited you to join a workspace.
                                    </p>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => handleAccept(invite.id)}
                                            className="flex-1 rounded-lg bg-primary py-1.5 text-xs font-semibold text-white hover:opacity-90 transition-opacity"
                                        >
                                            Accept
                                        </button>
                                        <button
                                            onClick={() => handleDecline(invite.id)}
                                            className="flex-1 rounded-lg bg-white/10 hover:bg-white/20 py-1.5 text-xs font-medium theme-text transition-colors"
                                        >
                                            Decline
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </>,
        document.body
    )
}
