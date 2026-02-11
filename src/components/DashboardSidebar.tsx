import { useState, useEffect } from 'react'
import type { Workspace, Project } from '../types'

interface DashboardSidebarProps {
  workspaces: Workspace[]
  currentWorkspace: Workspace | null
  setCurrentWorkspaceId: (id: string | null) => void
  projects: Project[]
  projectFilter: string
  setProjectFilter: (id: string) => void
  onNewWorkspace: () => void
  onNewProject: () => void
  loading: boolean
  deletingId?: string | null
  collapsed: boolean
  onToggleCollapse: () => void
}

const chevronDown = (
  <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
  </svg>
)
const chevronRight = (
  <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
  </svg>
)

export function DashboardSidebar({
  workspaces,
  currentWorkspace,
  setCurrentWorkspaceId,
  projects,
  projectFilter,
  setProjectFilter,
  onNewWorkspace,
  onNewProject,
  loading,
  deletingId,
  collapsed,
  onToggleCollapse,
  mobileOpen,
  setMobileOpen,
  onEditWorkspace,
  onDeleteWorkspace,
}: DashboardSidebarProps & {
  mobileOpen: boolean
  setMobileOpen: (open: boolean) => void
  onEditWorkspace: (id: string, name: string) => void
  onDeleteWorkspace: (id: string, name: string) => void
}) {
  const [workspacesOpen, setWorkspacesOpen] = useState(true)
  const [projectsOpen, setProjectsOpen] = useState(true)
  const [hovered, setHovered] = useState(false)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)

  // When mobile drawer is open, we force expansion so the user sees all items
  const expanded = mobileOpen || (!collapsed || hovered)

  useEffect(() => {
    const onClick = () => setMenuOpenId(null)
    window.addEventListener('click', onClick)
    return () => window.removeEventListener('click', onClick)
  }, [])

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-full flex-col border-r theme-border theme-bg-subtle transition-all duration-300 ease-in-out lg:static lg:z-0 lg:h-auto lg:transition-[width] lg:duration-200 lg:translate-x-0 ${mobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
          } ${expanded ? 'lg:w-64' : 'lg:w-14'
          } w-64`}
        aria-label="Workspaces and projects"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div className="flex flex-1 flex-col overflow-y-auto overflow-x-hidden py-4 pl-4 pr-2">
          <div className="mb-4 flex items-center justify-between px-2 lg:hidden">
            <span className="text-sm font-semibold theme-text">Menu</span>
            <button
              onClick={() => setMobileOpen(false)}
              className="rounded-lg p-1.5 theme-text-muted hover:bg-white/5"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {expanded && (
            <section>
              <div className="mb-2 flex items-center justify-between gap-1 px-2">
                <button
                  type="button"
                  onClick={() => setWorkspacesOpen((o) => !o)}
                  className="flex flex-1 items-center gap-1 rounded-lg py-0.5 text-left text-xs font-medium uppercase tracking-wider theme-text-muted transition-colors theme-surface-hover-bg hover:theme-text-muted"
                  aria-expanded={workspacesOpen}
                >
                  {workspacesOpen ? chevronDown : chevronRight}
                  <span>Workspaces</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onNewWorkspace()
                    setMobileOpen(false)
                  }}
                  className="rounded-lg p-1.5 theme-text-muted transition-colors theme-surface-hover-bg hover:theme-text"
                  title="New workspace"
                  aria-label="New workspace"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              </div>
              {workspacesOpen && (
                <>
                  {loading ? (
                    <p className="px-2 text-xs theme-text-muted">Loading…</p>
                  ) : workspaces.length === 0 ? (
                    <p className="px-2 text-xs theme-text-muted">No workspaces</p>
                  ) : (
                    <ul className="space-y-0.5">
                      {workspaces.map((w) => (
                        <li key={w.id} className="space-y-0.5 group relative">
                          <div className={`flex items-center rounded-xl transition-colors pr-1 ${currentWorkspace?.id === w.id
                            ? 'theme-surface-bg'
                            : 'theme-surface-hover-bg'
                            }`}>
                            <button
                              type="button"
                              onClick={() => {
                                setCurrentWorkspaceId(w.id)
                                setMobileOpen(false)
                              }}
                              className={`flex-1 px-3 py-2.5 text-left text-sm whitespace-nowrap overflow-hidden text-ellipsis ${currentWorkspace?.id === w.id
                                ? 'font-medium theme-text'
                                : 'theme-text-muted hover:theme-text'
                                }`}
                            >
                              {w.name}
                            </button>
                            <div className="relative shrink-0">
                              <button
                                type="button"
                                disabled={deletingId === w.id}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setMenuOpenId(menuOpenId === w.id ? null : w.id)
                                }}
                                className={`p-1.5 rounded-lg theme-text-muted hover:theme-text transition-colors ${menuOpenId === w.id ? 'bg-white/5 theme-text' : ''} ${deletingId === w.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                                aria-label="Workspace options"
                                title="Workspace options"
                              >
                                {deletingId === w.id ? (
                                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                  </svg>
                                ) : (
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                                  </svg>
                                )}
                              </button>
                              {menuOpenId === w.id && (
                                <div
                                  className="absolute right-0 top-full z-50 mt-1 w-32 origin-top-right rounded-xl border theme-surface-bg theme-border shadow-lg p-1 focus:outline-none bg-[#111] dark:bg-[#111]"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <button
                                    onClick={() => {
                                      onEditWorkspace(w.id, w.name)
                                      setMenuOpenId(null)
                                    }}
                                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-left theme-text hover:bg-white/5 transition-colors"
                                  >
                                    <svg className="w-3.5 h-3.5 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                    </svg>
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => {
                                      onDeleteWorkspace(w.id, w.name)
                                      setMenuOpenId(null)
                                    }}
                                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-left text-red-400 hover:bg-red-500/10 transition-colors"
                                  >
                                    <svg className="w-3.5 h-3.5 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                    Delete
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                          {currentWorkspace?.id === w.id && (
                            <div className="border-l-2 theme-border pl-3 ml-2 space-y-0.5">
                              <button
                                type="button"
                                onClick={() => setProjectsOpen((o) => !o)}
                                className="mb-1.5 flex w-full items-center gap-1 px-1 text-left text-[11px] font-medium uppercase tracking-wider theme-text-muted transition-colors theme-surface-hover-bg hover:theme-text-muted"
                                aria-expanded={projectsOpen}
                              >
                                {projectsOpen ? chevronDown : chevronRight}
                                <span>Projects</span>
                              </button>
                              {projectsOpen && (
                                <ul className="space-y-0.5">
                                  <li>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setProjectFilter('')
                                        setMobileOpen(false)
                                      }}
                                      className={`w-full rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${!projectFilter
                                        ? 'theme-surface-bg font-medium theme-text'
                                        : 'theme-text-muted theme-surface-hover-bg hover:theme-text'
                                        }`}
                                    >
                                      All projects
                                    </button>
                                  </li>
                                  {projects.map((p) => (
                                    <li key={p.id}>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setProjectFilter(p.id)
                                          setMobileOpen(false)
                                        }}
                                        className={`w-full rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${projectFilter === p.id
                                          ? 'theme-surface-bg font-medium theme-text'
                                          : 'theme-text-muted theme-surface-hover-bg hover:theme-text'
                                          }`}
                                      >
                                        <span className="block truncate">{p.name}</span>
                                      </button>
                                    </li>
                                  ))}
                                  <li>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        onNewProject()
                                        setMobileOpen(false)
                                      }}
                                      className="w-full rounded-lg px-2.5 py-2 text-left text-sm theme-text-muted transition-colors theme-surface-hover-bg hover:theme-text"
                                      title="New project"
                                    >
                                      <span className="flex items-center gap-1.5">
                                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                                        </svg>
                                        New project
                                      </span>
                                    </button>
                                  </li>
                                </ul>
                              )}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </section>
          )}
        </div>
        <div className="border-t theme-border p-2 hidden lg:block">
          <button
            type="button"
            onClick={onToggleCollapse}
            className="flex w-full items-center justify-center rounded-lg py-2 theme-text-muted transition-colors theme-surface-hover-bg hover:theme-text"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <svg
              className={`h-5 w-5 transition-transform duration-200 ${collapsed ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          </button>
        </div>
      </aside>
    </>
  )
}
