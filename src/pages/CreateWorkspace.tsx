import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { useToast } from '../contexts/ToastContext'
import { createWorkspace } from '../lib/workspaces'

const PRESETS = [
  { name: 'Office', slug: 'office', visibility: 'private' as const },
  { name: 'Personal', slug: 'personal', visibility: 'private' as const },
  { name: 'Side Projects', slug: 'side-projects', visibility: 'private' as const },
  { name: 'Shared (Friends)', slug: 'shared', visibility: 'shared' as const },
]

export function CreateWorkspace() {
  const navigate = useNavigate()
  const { user, profile } = useAuth()
  const { refreshWorkspaces, setCurrentWorkspaceId } = useWorkspace()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [visibility, setVisibility] = useState<'private' | 'shared'>('private')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { toast } = useToast()

  const applyPreset = (p: (typeof PRESETS)[0]) => {
    setName(p.name)
    setSlug(p.slug)
    setVisibility(p.visibility)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !name.trim() || !slug.trim()) return
    setError('')
    setLoading(true)
    try {
      const id = await createWorkspace(
        { name: name.trim(), slug: slug.trim().toLowerCase().replace(/\s+/g, '-'), visibility },
        user.uid,
        profile?.displayName,
        profile?.email
      )
      await refreshWorkspaces()
      setCurrentWorkspaceId(id)
      toast('Workspace created', 'success')
      navigate('/')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create workspace'
      setError(msg)
      toast(msg, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <div className="glass-strong rounded-3xl p-8 animate-fade-in">
        <h1 className="text-2xl font-bold theme-text tracking-tight">New workspace</h1>
        <p className="mt-1 theme-text-muted">Create Office, Personal, or a shared space for friends.</p>

        <div className="mt-6 flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.slug}
              type="button"
              onClick={() => applyPreset(p)}
              className="rounded-2xl border theme-border theme-surface-bg px-4 py-2 text-sm theme-text-muted transition-all duration-200 theme-surface-hover-bg hover:theme-text"
            >
              {p.name}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium theme-text-muted">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                if (!slug || PRESETS.some((p) => p.slug === slug)) {
                  setSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'))
                }
              }}
              className="mt-1 w-full rounded-2xl theme-input px-4 py-2.5"
              placeholder="e.g. Office"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium theme-text-muted">Slug (URL-friendly)</label>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
              className="mt-1 w-full rounded-2xl theme-input px-4 py-2.5"
              placeholder="office"
            />
          </div>
          <div>
            <label className="block text-sm font-medium theme-text-muted">Visibility</label>
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as 'private' | 'shared')}
              className="select-input mt-1 w-full"
            >
              <option value="private">Private (only me)</option>
              <option value="shared">Shared (invite friends)</option>
            </select>
          </div>
          {error && <p className="text-sm theme-text-muted">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="rounded-2xl theme-surface-bg theme-border border px-5 py-2.5 font-medium theme-text transition-all duration-300 theme-surface-hover-bg hover:scale-[1.02] active:scale-[0.99] disabled:opacity-50"
            >
              {loading ? 'Creating…' : 'Create workspace'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="rounded-2xl border theme-border px-5 py-2.5 theme-text-muted theme-surface-hover-bg hover:theme-text transition-all duration-200"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
