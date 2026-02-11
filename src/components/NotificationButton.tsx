import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { subscribeUserInvitations } from '../lib/workspaces'
import { subscribeNotifications } from '../lib/notifications'

interface NotificationButtonProps {
    onClick: () => void
    active?: boolean
}

export function NotificationButton({ onClick, active }: NotificationButtonProps) {
    const { user } = useAuth()
    const [inviteCount, setInviteCount] = useState(0)
    const [notifCount, setNotifCount] = useState(0)

    useEffect(() => {
        if (!user?.email || !user?.uid) return

        const unsubInvites = subscribeUserInvitations(user.email, (invites) => {
            setInviteCount(invites.length)
        })

        const unsubNotifs = subscribeNotifications(user.uid, (notifs) => {
            setNotifCount(notifs.filter(n => !n.read).length)
        })

        return () => {
            unsubInvites()
            unsubNotifs()
        }
    }, [user])

    const count = inviteCount + notifCount

    return (
        <button
            type="button"
            onClick={onClick}
            className={`relative rounded-xl p-2 transition-colors hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-(--color-accent) focus:ring-offset-2 focus:ring-offset-(--color-bg) ${active ? 'theme-surface-hover-bg' : ''
                }`}
            style={{ color: 'var(--color-text-muted)' }}
            aria-label="Notifications"
        >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
            </svg>
            {count > 0 && (
                <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white ring-2 ring-(--color-bg)">
                    {count}
                </span>
            )}
        </button>
    )
}
