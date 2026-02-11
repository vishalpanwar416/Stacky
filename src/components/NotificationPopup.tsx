import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { subscribeUserInvitations, acceptInvitation, declineInvitation } from '../lib/workspaces'
import { subscribeNotifications, markNotificationAsRead, deleteNotification } from '../lib/notifications'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import type { AppNotification } from '../types'

interface NotificationPopupProps {
    onClose: () => void
}

export function NotificationPopup({ onClose }: NotificationPopupProps) {
    const { user, profile } = useAuth()
    const { toast } = useToast()
    const [invitations, setInvitations] = useState<any[]>([])
    const [notifications, setNotifications] = useState<AppNotification[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (!user?.email || !user?.uid) {
            setLoading(false)
            return
        }

        const unsubInvites = subscribeUserInvitations(user.email, (data) => {
            setInvitations(data)
        })

        const unsubNotifs = subscribeNotifications(user.uid, (data) => {
            setNotifications(data)
            setLoading(false)
        })

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose()
            }
        }
        document.addEventListener('keydown', handleEscape)
        return () => {
            document.removeEventListener('keydown', handleEscape)
            unsubInvites()
            unsubNotifs()
        }
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
        } catch (err) {
            console.error(err)
            toast('Failed to decline', 'error')
        }
    }

    const handleMarkAsRead = async (notifId: string) => {
        try {
            await markNotificationAsRead(notifId)
        } catch (err) {
            console.error(err)
        }
    }

    const handleDeleteNotif = async (notifId: string) => {
        try {
            await deleteNotification(notifId)
        } catch (err) {
            console.error(err)
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
                    {loading ? (
                        <div className="space-y-2 p-2">
                            <div className="h-16 rounded-xl bg-white/5 animate-pulse" />
                            <div className="h-16 rounded-xl bg-white/5 animate-pulse" />
                        </div>
                    ) : (invitations.length === 0 && notifications.length === 0) ? (
                        <div className="py-8 text-center">
                            <svg className="mx-auto h-8 w-8 theme-text-muted opacity-20 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                            </svg>
                            <p className="text-sm theme-text-muted">No new notifications</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {invitations.length > 0 && (
                                <div className="space-y-1">
                                    <div className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider theme-text-faint">Invitations</div>
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

                            {notifications.length > 0 && (
                                <div className="space-y-1">
                                    <div className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wider theme-text-faint">Activity</div>
                                    {notifications.map(notif => (
                                        <div
                                            key={notif.id}
                                            className={`group relative p-3 rounded-xl border transition-colors ${notif.read ? 'theme-border bg-transparent opacity-60' : 'theme-border bg-white/5'}`}
                                        >
                                            {!notif.read && (
                                                <div className="absolute top-3 right-3 h-2 w-2 rounded-full bg-primary" />
                                            )}
                                            <div className="pr-6">
                                                <h3 className="text-xs font-semibold theme-text">{notif.title}</h3>
                                                <p className="text-[11px] theme-text-muted mt-0.5">{notif.body}</p>
                                            </div>
                                            <div className="mt-2 flex items-center justify-between">
                                                <span className="text-[10px] theme-text-faint">
                                                    {notif.createdAt?.toDate ? new Date(notif.createdAt.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                                </span>
                                                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    {!notif.read && (
                                                        <button
                                                            onClick={() => handleMarkAsRead(notif.id)}
                                                            className="text-[10px] font-medium theme-text-muted hover:theme-text"
                                                        >
                                                            Mark read
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => handleDeleteNotif(notif.id)}
                                                        className="text-[10px] font-medium text-red-400 hover:text-red-300"
                                                    >
                                                        Delete
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </>,
        document.body
    )
}
