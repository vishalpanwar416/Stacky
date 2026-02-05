import { useState, useEffect, useRef } from 'react'
import { createTask } from '../lib/tasks'
import { useToast } from '../contexts/ToastContext'
import type { Workspace } from '../types'

interface CommandBarProps {
  currentWorkspace: Workspace | null
  userId: string
  onClose: () => void
  onNavigate: (path: string) => void
}

export function CommandBar({ currentWorkspace, userId, onClose, onNavigate }: CommandBarProps) {
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const title = query.trim()
    if (!title || !currentWorkspace) return
    setCreating(true)
    try {
      await createTask(
        {
          workspaceId: currentWorkspace.id,
          title,
          status: 'backlog',
          priority: 'P1',
          tags: [],
          isRecurring: false,
          createdBy: userId,
          assignees: { ownerId: userId, watcherIds: [] },
        },
        userId
      )
      toast('Task added', 'success')
      onClose()
      onNavigate('/')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to add task', 'error')
      setCreating(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] theme-overlay backdrop-blur-sm p-4"
      onClick={onClose}
      role="dialog"
      aria-label="Quick add"
    >
      <div
        className="glass-strong w-full max-w-xl rounded-2xl shadow-xl animate-scale-in overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={handleSubmit} className="p-2">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={currentWorkspace ? `Add task to ${currentWorkspace.name}…` : 'Select a workspace first'}
            disabled={!currentWorkspace}
            className="w-full rounded-xl border-0 bg-transparent px-4 py-3 theme-text focus:outline-none focus:ring-0"
          />
          <p className="px-4 pb-2 text-xs theme-text-muted">Press Enter to add, Escape to close</p>
        </form>
      </div>
    </div>
  )
}
