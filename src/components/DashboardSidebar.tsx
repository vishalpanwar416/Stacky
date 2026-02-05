import { useState } from 'react'
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
  collapsed,
  onToggleCollapse,
}: DashboardSidebarProps) {
  const [workspacesOpen, setWorkspacesOpen] = useState(true)
  const [projectsOpen, setProjectsOpen] = useState(true)
  const [hovered, setHovered] = useState(false)
  const expanded = !collapsed || hovered

  return (
    <aside
      className={`flex shrink-0 flex-col border-r theme-border theme-bg-subtle transition-[width] duration-200 ease-out ${
        expanded ? 'w-64' : 'w-14'
      }`}
      aria-label="Workspaces and projects"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex flex-1 flex-col overflow-y-auto overflow-x-hidden py-4 pl-4 pr-2">
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
                onClick={onNewWorkspace}
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
                      <li key={w.id} className="space-y-0.5">
                        <button
                          type="button"
                          onClick={() => setCurrentWorkspaceId(w.id)}
                          className={`w-full rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
                            currentWorkspace?.id === w.id
                              ? 'theme-surface-bg font-medium theme-text'
                              : 'theme-text-muted theme-surface-hover-bg hover:theme-text'
                          }`}
                        >
                          <span className="block truncate">{w.name}</span>
                        </button>
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
                                    onClick={() => setProjectFilter('')}
                                    className={`w-full rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                                      !projectFilter
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
                                      onClick={() => setProjectFilter(p.id)}
                                      className={`w-full rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                                        projectFilter === p.id
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
                                    onClick={onNewProject}
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
      <div className="border-t theme-border p-2">
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
  )
}
