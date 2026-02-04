import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useWorkspace } from '../contexts/WorkspaceContext'
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
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create workspace')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <div className="glass-strong rounded-3xl p-8 animate-fade-in">
        <h1 className="text-2xl font-bold text-white tracking-tight">New workspace</h1>
        <p className="mt-1 text-neutral-400">Create Office, Personal, or a shared space for friends.</p>

        <div className="mt-6 flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.slug}
              type="button"
              onClick={() => applyPreset(p)}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-neutral-300 transition-all duration-200 hover:bg-white/10 hover:text-white"
            >
              {p.name}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-400">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                if (!slug || PRESETS.some((p) => p.slug === slug)) {
                  setSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'))
                }
              }}
              className="mt-1 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-white placeholder-neutral-500 transition-all duration-200 focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400"
              placeholder="e.g. Office"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-400">Slug (URL-friendly)</label>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
              className="mt-1 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-white placeholder-neutral-500 transition-all duration-200 focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400"
              placeholder="office"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-400">Visibility</label>
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as 'private' | 'shared')}
              className="mt-1 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-white transition-all duration-200 focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400"
            >
              <option value="private">Private (only me)</option>
              <option value="shared">Shared (invite friends)</option>
            </select>
          </div>
          {error && <p className="text-sm text-neutral-400">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="rounded-2xl bg-white/10 px-5 py-2.5 font-medium text-white border border-white/10 transition-all duration-300 hover:bg-white/15 hover:scale-[1.02] active:scale-[0.99] disabled:opacity-50"
            >
              {loading ? 'Creating…' : 'Create workspace'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="rounded-2xl border border-white/10 px-5 py-2.5 text-neutral-400 transition-all duration-200 hover:bg-white/5 hover:text-white"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
