import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../contexts/AuthContext'

interface ProfilePopupProps {
    onClose: () => void
}

export function ProfilePopup({ onClose }: ProfilePopupProps) {
    const { user, profile, signOut } = useAuth()
    const photoURL = profile?.photoURL ?? user?.photoURL
    useEffect(() => {
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose()
            }
        }
        document.addEventListener('keydown', handleEscape)
        return () => document.removeEventListener('keydown', handleEscape)
    }, [onClose])

    const initial = profile?.displayName?.[0] || profile?.email?.[0] || '?'

    return createPortal(
        <>
            <div className="fixed inset-0 z-[999] bg-black/50 backdrop-blur-md transition-opacity" onClick={onClose} aria-hidden="true" />

            <div
                className="fixed top-16 right-4 sm:right-6 w-80 rounded-2xl border theme-border theme-bg-subtle shadow-2xl ring-1 theme-border animate-scale-in z-[1000] flex flex-col max-h-[80vh]"
            >
                <div className="p-4 border-b theme-border shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-semibold border theme-accent-bg text-(--color-accent)">
                            {photoURL ? (
                                <img
                                    src={photoURL}
                                    alt={profile?.displayName || 'User'}
                                    className="h-full w-full rounded-full object-cover"
                                />
                            ) : (
                                <span className="text-lg">{initial.toUpperCase()}</span>
                            )}
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium theme-text font-display">
                                {profile?.displayName || 'Stacky User'}
                            </p>
                            <p className="truncate text-xs theme-text-muted font-mono">
                                {profile?.email}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto min-h-0">
                    <div className="p-2 space-y-1">
                        <button
                            type="button"
                            onClick={() => {
                                // Placeholder for future settings
                                alert('Settings coming soon!')
                                onClose()
                            }}
                            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm theme-text-muted transition-colors theme-surface-hover-bg hover:theme-text text-left"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            Settings
                        </button>
                    </div>
                </div>

                <div className="border-t theme-border p-2 shrink-0">
                    <button
                        type="button"
                        onClick={() => {
                            signOut()
                            onClose()
                        }}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-rose-400 transition-colors hover:bg-rose-500/10 hover:text-rose-300 text-left"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        Sign out
                    </button>
                </div>
            </div>
        </>,
        document.body
    )
}
