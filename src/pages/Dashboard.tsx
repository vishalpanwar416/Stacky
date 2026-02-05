import { useEffect, useRef, useState } from 'react'
import { Timestamp } from 'firebase/firestore'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { subscribeTasksByWorkspace, updateTask, toggleTaskTimer } from '../lib/tasks'
import { getCountdown as getTaskCountdown } from '../lib/taskUtils'
import { deleteWorkspace } from '../lib/workspaces'
import { getProjectsByWorkspace, createProject } from '../lib/projects'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import { ShortcutsModal } from '../components/ShortcutsModal'
import { ShortcutsButton } from '../components/ShortcutsButton'
import { CommandBar } from '../components/CommandBar'
import { Logo } from '../components/Logo'
import { ThemeToggle } from '../components/ThemeToggle'
import { ProfilePopup } from '../components/ProfilePopup'
import { useToast } from '../contexts/ToastContext'
import { DashboardSkeleton } from '../components/Skeleton'
import { DashboardSidebar } from '../components/DashboardSidebar'
import { WelcomeOverlay } from '../components/WelcomeOverlay'
import { TaskTimer } from '../components/TaskTimer'
import type { Task, Project } from '../types'

const statusOrder: Task['status'][] = ['in_progress', 'blocked', 'planned', 'backlog', 'done']
const priorityOrder: Task['priority'][] = ['P0', 'P1', 'P2', 'P3']
const MAX_IN_PROGRESS = 5

const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function buildCalendarDays(monthStart: Date): Date[] {
  const first = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1)
  const startOffset = first.getDay()
  const gridStart = new Date(first)
  gridStart.setDate(first.getDate() - startOffset)
  const days: Date[] = []
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(gridStart)
    d.setDate(gridStart.getDate() + i)
    days.push(d)
  }
  return days
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function formatDateKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function addMonths(base: Date, delta: number): Date {
  return new Date(base.getFullYear(), base.getMonth() + delta, 1)
}

function formatDue(task: Task): { label: string; isOverdue: boolean } | null {
  const ts = task.dueDate
  if (!ts || typeof ts.toMillis !== 'function') return null
  const ms = ts.toMillis()
  const d = new Date(ms)
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const startOfTomorrow = new Date(startOfToday)
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1)
  if (ms < startOfToday.getTime()) {
    const short = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    return { label: `Overdue ${short}`, isOverdue: true }
  }
  if (ms < startOfTomorrow.getTime()) {
    const time = task.dueTime ? ` ${task.dueTime}` : ''
    return { label: `Due today${time}`, isOverdue: false }
  }
  const tomorrowEnd = new Date(startOfTomorrow)
  tomorrowEnd.setDate(tomorrowEnd.getDate() + 1)
  if (ms < tomorrowEnd.getTime()) {
    const time = task.dueTime ? ` ${task.dueTime}` : ''
    return { label: `Due tomorrow${time}`, isOverdue: false }
  }
  const short = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const time = task.dueTime ? ` ${task.dueTime}` : ''
  return { label: `Due ${short}${time}`, isOverdue: false }
}

function sortTasks(tasks: Task[]) {
  return [...tasks].sort((a, b) => {
    const statusA = statusOrder.indexOf(a.status)
    const statusB = statusOrder.indexOf(b.status)
    if (statusA !== statusB) return statusA - statusB
    const priA = priorityOrder.indexOf(a.priority)
    const priB = priorityOrder.indexOf(b.priority)
    return priA - priB
  })
}

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export function Dashboard() {
  const navigate = useNavigate()
  const { user, profile, connectGoogleCalendar } = useAuth()
  const { toast } = useToast()
  const { workspaces, currentWorkspace, setCurrentWorkspaceId, refreshWorkspaces, loading: wsLoading } = useWorkspace()
  const maxInProgress = profile?.preferences?.maxInProgress ?? MAX_IN_PROGRESS
  const [tasks, setTasks] = useState<Task[]>([])
  const [tasksLoading, setTasksLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null)
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [commandBarOpen, setCommandBarOpen] = useState(false)
  const [completingTaskId, setCompletingTaskId] = useState<string | null>(null)
  const [completionNote, setCompletionNote] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [projectFilter, setProjectFilter] = useState('')
  const [projects, setProjects] = useState<Project[]>([])
  const [newProjectOpen, setNewProjectOpen] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [newProjectDesc, setNewProjectDesc] = useState('')
  const [creatingProject, setCreatingProject] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const searchBarRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('stacky_sidebar_collapsed') === 'true'
    } catch {
      return false
    }
  })
  const [introShown, setIntroShown] = useState(false)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(() => new Date())
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [queueFilterDays, setQueueFilterDays] = useState(1)

  useEffect(() => {
    const t = setTimeout(() => setIntroShown(true), 2000)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    // Avoid stacking overlays: close calendar when other popups are open
    if (completingTaskId || commandBarOpen || newProjectOpen || shortcutsOpen || profileOpen) {
      setCalendarOpen(false)
    }
  }, [completingTaskId, commandBarOpen, newProjectOpen, shortcutsOpen, profileOpen])

  const toggleSidebar = () => {
    setSidebarCollapsed((c) => {
      const next = !c
      try {
        localStorage.setItem('stacky_sidebar_collapsed', String(next))
      } catch {
        /* ignore persistence errors */
      }
      return next
    })
  }

  useEffect(() => {
    if (!currentWorkspace) return
    getProjectsByWorkspace(currentWorkspace.id).then(setProjects).catch(() => setProjects([]))
  }, [currentWorkspace])

  const filterTasksBySearch = (list: Task[]) => {
    if (!searchQuery.trim()) return list
    const q = searchQuery.trim().toLowerCase()
    return list.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        (t.description?.toLowerCase().includes(q) ?? false) ||
        t.tags.some((tag) => tag.toLowerCase().includes(q))
    )
  }

  const workspaceIndex = currentWorkspace ? workspaces.findIndex((w) => w.id === currentWorkspace.id) : -1
  const projectOptions: string[] = ['', ...projects.map((p) => p.id)]
  const projectIndex = !projectFilter ? 0 : projects.findIndex((p) => p.id === projectFilter) + 1

  useKeyboardShortcuts({
    onNewTask: currentWorkspace ? () => navigate(`/workspaces/${currentWorkspace.id}/tasks/new`) : undefined,
    onNewWorkspace: () => navigate('/workspaces/new'),
    onShortcutsHelp: () => setShortcutsOpen(true),
    onSearch: () => setCommandBarOpen(true),
    onPrevWorkspace:
      workspaces.length > 0
        ? () => {
          const idx = workspaceIndex <= 0 ? workspaces.length - 1 : workspaceIndex - 1
          handleSetWorkspaceId(workspaces[idx].id)
        }
        : undefined,
    onNextWorkspace:
      workspaces.length > 0
        ? () => {
          const idx = workspaceIndex < 0 || workspaceIndex >= workspaces.length - 1 ? 0 : workspaceIndex + 1
          handleSetWorkspaceId(workspaces[idx].id)
        }
        : undefined,
    onAllProjects: () => setProjectFilter(''),
    onPrevProject:
      projectOptions.length > 0
        ? () => {
          const idx = projectIndex <= 0 ? projectOptions.length - 1 : projectIndex - 1
          setProjectFilter(projectOptions[idx])
        }
        : undefined,
    onNextProject:
      projectOptions.length > 0
        ? () => {
          const idx = projectIndex < 0 || projectIndex >= projectOptions.length - 1 ? 0 : projectIndex + 1
          setProjectFilter(projectOptions[idx])
        }
        : undefined,
  })

  useEffect(() => {
    if (!searchOpen) return
    const onMouseDown = (e: MouseEvent) => {
      if (searchBarRef.current && !searchBarRef.current.contains(e.target as Node)) {
        setSearchOpen(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [searchOpen])

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus()
  }, [searchOpen])

  useEffect(() => {
    if (!currentWorkspace) return
    setTasksLoading(true)
    const unsub = subscribeTasksByWorkspace(currentWorkspace.id, (newTasks) => {
      setTasks(newTasks)
      setTasksLoading(false)
    })
    const timeout = setTimeout(() => setTasksLoading(false), 10000)
    return () => {
      unsub()
      clearTimeout(timeout)
    }
  }, [currentWorkspace])

  useEffect(() => {
    if (!completingTaskId) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCompletingTaskId(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [completingTaskId])

  const tasksByProject = projectFilter ? tasks.filter((t) => t.projectId === projectFilter) : tasks
  const inProgress = filterTasksBySearch(tasksByProject.filter((t) => t.status === 'in_progress'))
  const queue = filterTasksBySearch(sortTasks(tasksByProject.filter((t) => t.status !== 'done')))
  const completed = filterTasksBySearch(
    tasksByProject
      .filter((t) => t.status === 'done')
      .sort((a, b) => {
        const aTime = a.completedAt && typeof a.completedAt.toMillis === 'function' ? a.completedAt.toMillis() : (a.updatedAt && typeof a.updatedAt.toMillis === 'function' ? a.updatedAt.toMillis() : 0)
        const bTime = b.completedAt && typeof b.completedAt.toMillis === 'function' ? b.completedAt.toMillis() : (b.updatedAt && typeof b.updatedAt.toMillis === 'function' ? b.updatedAt.toMillis() : 0)
        return bTime - aTime
      })
  )
  const projectMap = new Map(projects.map((p) => [p.id, p]))
  const calendarDays = buildCalendarDays(calendarMonth)
  const tasksByDate = tasksByProject.reduce((map, t) => {
    const rawDue = t.dueDate as unknown
    let due: Date | null = null
    if (rawDue && typeof (rawDue as { toDate?: () => Date }).toDate === 'function') {
      due = (rawDue as { toDate: () => Date }).toDate()
    } else if (rawDue instanceof Date) {
      due = rawDue
    }
    if (!due) return map
    const key = formatDateKey(due)
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(t)
    return map
  }, new Map<string, Task[]>())
  const selectedDateKey = formatDateKey(selectedDate)
  const tasksOnSelectedDate = tasksByDate.get(selectedDateKey) ?? []

  const handleSetWorkspaceId = (id: string | null) => {
    setCurrentWorkspaceId(id)
    try {
      if (id) localStorage.setItem('stacky_last_workspace_id', id)
    } catch {
      /* ignore persistence errors */
    }
  }

  const handleConnectCalendar = async () => {
    try {
      const credential = await connectGoogleCalendar()
      if (credential?.accessToken) {
        localStorage.setItem('stacky_gcal_token', credential.accessToken)
        toast('Connected! Tasks will now sync.', 'success')
      }
    } catch (err) {
      console.error(err)
      toast('Failed to connect to Google Calendar', 'error')
    }
  }

  const openDoneModal = (taskId: string) => {
    setCompletingTaskId(taskId)
    setCompletionNote('')
  }

  const submitDoneWithNote = async () => {
    if (!user || !completingTaskId) return
    setUpdatingTaskId(completingTaskId)
    try {
      await updateTask(
        completingTaskId,
        { status: 'done', completionNote: completionNote.trim() || undefined },
        user.uid
      )
      toast('Task marked done', 'success')
      setCompletingTaskId(null)
      setCompletionNote('')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Update failed', 'error')
    } finally {
      setUpdatingTaskId(null)
    }
  }

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !currentWorkspace || !newProjectName.trim()) return
    setCreatingProject(true)
    try {
      await createProject({
        workspaceId: currentWorkspace.id,
        name: newProjectName.trim(),
        description: newProjectDesc.trim() || undefined,
        createdBy: user.uid,
      })
      const list = await getProjectsByWorkspace(currentWorkspace.id)
      setProjects(list)
      setNewProjectOpen(false)
      setNewProjectName('')
      setNewProjectDesc('')
      toast('Project created', 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to create project', 'error')
    } finally {
      setCreatingProject(false)
    }
  }

  const handleDeleteWorkspace = async (id: string, name: string) => {
    if (!confirm(`Delete workspace "${name}"? Its tasks will no longer be listed in this app.`)) return
    setDeletingId(id)
    try {
      await deleteWorkspace(id)
      await refreshWorkspaces()
      const next = workspaces.filter((w) => w.id !== id)
      handleSetWorkspaceId(next[0]?.id ?? null)
      toast('Workspace deleted', 'success')
    } catch (err) {
      console.error(err)
      toast(err instanceof Error ? err.message : 'Failed to delete workspace', 'error')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-bg)' }}>
      <WelcomeOverlay />
      <header className="sticky top-0 z-10 glass border-b theme-border">
        <div className="mx-auto flex h-14 w-full items-center justify-between gap-4 px-4 sm:px-6">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex shrink-0 items-center gap-2 rounded-xl py-2 pl-2 pr-2 transition-colors theme-surface-hover-bg"
          >
            <Logo className="w-8 h-8 ml-1 text-(--color-accent)" />
            <span className="text-xl font-bold tracking-tight theme-text">Stacky</span>
          </button>

          <nav className="flex flex-1 items-center justify-end gap-2 sm:gap-3">
            <div className="h-6 w-px theme-bg-subtle" style={{ background: 'var(--color-border)' }} aria-hidden />

            <div className="flex items-center gap-2">
              <ThemeToggle />
              <ShortcutsButton
                onClick={() => setShortcutsOpen(true)}
                aria-expanded={shortcutsOpen}
              />
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setProfileOpen(!profileOpen)}
                  className="flex items-center gap-2 rounded-xl py-1 pl-2 pr-3 transition-colors theme-surface-hover-bg"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-full theme-bg-subtle text-xs theme-text-muted">
                    {(profile?.photoURL ?? user?.photoURL ?? null) ? (
                      <img src={profile?.photoURL ?? user?.photoURL ?? ''} alt="" className="h-full w-full rounded-full object-cover" />
                    ) : (
                      (profile?.displayName?.[0] || profile?.email?.[0] || '?').toUpperCase()
                    )}
                  </div>
                  <span className="hidden max-w-[100px] truncate text-sm theme-text-muted sm:block">
                    {profile?.displayName?.split(' ')[0] || 'User'}
                  </span>
                  <svg className="h-4 w-4 theme-text-faint" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {profileOpen && <ProfilePopup onClose={() => setProfileOpen(false)} />}
              </div>
            </div>
          </nav>
        </div>
      </header>


      <div className="flex min-h-[calc(100vh-3.5rem)] flex-1">
        <DashboardSidebar
          workspaces={workspaces}
          currentWorkspace={currentWorkspace}
          setCurrentWorkspaceId={handleSetWorkspaceId}
          projects={projects}
          projectFilter={projectFilter}
          setProjectFilter={setProjectFilter}
          onNewWorkspace={() => navigate('/workspaces/new')}
          onNewProject={() => setNewProjectOpen(true)}
          loading={wsLoading}
          collapsed={sidebarCollapsed}
          onToggleCollapse={toggleSidebar}
        />
        <main className="min-w-0 flex-1 overflow-auto px-4 py-6 sm:px-6">
          {wsLoading && <DashboardSkeleton />}
          {!wsLoading && !currentWorkspace && workspaces.length === 0 && (
            <div className="glass-strong rounded-3xl p-10 sm:p-12 text-center animate-fade-in">
              <div
                className="inline-flex rounded-2xl border py-3 px-5"
                style={{
                  background: 'var(--color-surface)',
                  borderColor: 'var(--color-border)',
                  borderLeftWidth: '4px',
                  borderLeftColor: 'var(--color-accent)',
                }}
              >
                <h1
                  className="text-2xl font-semibold tracking-tight sm:text-3xl font-display"
                  style={{ color: 'var(--color-text)' }}
                >
                  {getGreeting()}, <span className="animate-wave">👋</span>{' '}
                  <span className="text-gradient-shimmer">
                    {profile?.displayName?.trim().split(/\s+/)[0] || 'there'}
                  </span>
                </h1>
              </div>
              <p className="mt-6 text-xl font-medium theme-text">Welcome to Stacky</p>
              <p className="mt-2 theme-text-muted">Create a workspace from the sidebar to start adding tasks.</p>
              <button
                type="button"
                onClick={() => navigate('/workspaces/new')}
                className="mt-6 rounded-2xl theme-surface-bg theme-border border px-6 py-3 text-sm font-medium theme-text transition-all duration-300 theme-surface-hover-bg hover:scale-[1.02] active:scale-[0.99]"
              >
                Create your first workspace
              </button>
            </div>
          )}
          {!wsLoading && currentWorkspace === null && workspaces.length > 0 && (
            <div className="glass-strong rounded-3xl p-8 text-center animate-fade-in">
              <p className="text-xl font-medium theme-text">Select a workspace</p>
              <p className="mt-2 theme-text-muted">Choose a workspace from the sidebar to see tasks.</p>
            </div>
          )}
          {currentWorkspace && tasksLoading && <DashboardSkeleton />}
          {currentWorkspace && !tasksLoading && (
            <>
              <div
                className={`mb-8 rounded-2xl border py-6 pl-6 pr-6 relative overflow-hidden group ${!introShown ? 'animate-card-enter' : ''}`}
                style={{
                  background: 'var(--color-surface)',
                  borderColor: 'var(--color-border)',
                }}
              >
                <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-[var(--color-accent)] to-transparent opacity-80" />
                <div
                  className="absolute inset-0 bg-gradient-to-r from-[var(--color-accent-muted)]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                  style={{ pointerEvents: 'none' }}
                />

                <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <div className={`mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider theme-text-faint ${!introShown ? 'animate-fade-in' : ''}`}>
                      <span>{currentTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
                      <span className="h-1 w-1 rounded-full bg-current opacity-50" />
                      <span>{currentTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
                    </div>

                    <h1
                      className="text-2xl font-semibold tracking-tight sm:text-3xl font-display"
                      style={{ color: 'var(--color-text)' }}
                    >
                      {getGreeting()}, <span className="animate-wave">👋</span>{' '}
                      <span className="text-gradient-shimmer">
                        {profile?.displayName?.trim().split(/\s+/)[0] || 'there'}
                      </span>
                    </h1>
                    <p className={`mt-1 text-sm theme-text-muted ${!introShown ? 'animate-reveal-slide' : ''}`}>
                      Ready to conquer your tasks today?
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setCalendarOpen(true)}
                      className="rounded-2xl theme-surface-bg theme-border border p-3.5 text-sm font-medium theme-text transition-all duration-200 theme-surface-hover-bg hover:scale-[1.05] active:scale-[0.98] flex items-center justify-center"
                      aria-label="Open calendar"
                    >
                      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
                        <path d="M3.5 9.5h17" />
                        <path d="M8.5 3.5v3" />
                        <path d="M15.5 3.5v3" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={handleConnectCalendar}
                      className="rounded-2xl theme-surface-bg theme-border border p-3.5 text-sm font-medium theme-text transition-all duration-200 theme-surface-hover-bg hover:scale-[1.05] active:scale-[0.98] flex items-center justify-center"
                      title="Sync with Google Calendar"
                    >
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        <circle cx="12" cy="13" r="2" fill="currentColor" className="opacity-50" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3 animate-fade-in">
                <h2 className="text-xl font-semibold theme-text tracking-tight">{currentWorkspace.name}</h2>
                <div className="flex items-center gap-2">
                  <div ref={searchBarRef} className="flex items-center">
                    <button
                      type="button"
                      onClick={() => setSearchOpen((o) => !o)}
                      className="rounded-xl p-2.5 theme-text-muted transition-colors theme-surface-hover-bg hover:theme-text shrink-0"
                      title="Search tasks"
                      aria-label="Search tasks"
                    >
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </button>
                    <div
                      className={`overflow-hidden transition-all duration-200 ease-out ${searchOpen ? 'w-48 sm:w-64 opacity-100 ml-2' : 'w-0 opacity-0 ml-0'
                        }`}
                    >
                      <input
                        ref={searchInputRef}
                        type="search"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search tasks…"
                        className="w-48 rounded-2xl theme-input px-3 py-2 text-sm sm:w-64 min-w-0"
                        aria-label="Search tasks"
                        aria-expanded={searchOpen}
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate(`/workspaces/${currentWorkspace.id}/tasks/new`)}
                    className="rounded-2xl theme-surface-bg theme-border border px-5 py-2.5 text-sm font-medium theme-text transition-all duration-300 theme-surface-hover-bg hover:scale-[1.02] active:scale-[0.99]"
                  >
                    New task
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteWorkspace(currentWorkspace.id, currentWorkspace.name)}
                    disabled={deletingId === currentWorkspace.id}
                    className="rounded-2xl border border-red-500/40 px-4 py-2.5 text-sm text-red-400 transition-colors hover:bg-red-500/10 hover:border-red-500/60 hover:text-red-300 disabled:opacity-50"
                    title="Delete this workspace"
                  >
                    {deletingId === currentWorkspace.id ? 'Deleting…' : 'Delete workspace'}
                  </button>
                </div>
              </div>

              <div className="grid gap-8 xl:grid-cols-2">
                <section>
                  <h3 className="mb-4 text-xs font-medium uppercase tracking-widest theme-text-muted">
                    In progress ({inProgress.length})
                  </h3>
                  {inProgress.length >= maxInProgress && (
                    <p className="mb-3 text-xs text-amber-400/90">
                      At limit ({maxInProgress}) — mark one done to start another.
                    </p>
                  )}
                  <ul className="space-y-3 animate-stagger">
                    {inProgress.slice(0, maxInProgress).map((t) => (
                      <li
                        key={t.id}
                        className="glass-strong flex items-center justify-between gap-3 rounded-2xl px-5 py-4 transition-all duration-300 theme-surface-hover-bg"
                      >
                        <div className="min-w-0 flex-1">
                          <button
                            type="button"
                            onClick={() => navigate(`/tasks/${t.id}`)}
                            className="text-left font-medium theme-text hover:underline theme-text-muted decoration-current"
                          >
                            {t.title}
                          </button>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs theme-text-muted">
                            {t.projectId && projectMap.get(t.projectId) && (
                              <span className="rounded-lg theme-surface-bg px-1.5 py-0.5 theme-text-muted">
                                {projectMap.get(t.projectId)!.name}
                              </span>
                            )}
                            {t.startedAt && (
                              <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-2 py-0.5 text-amber-500">
                                <TaskTimer
                                  startedAt={t.startedAt}
                                  timerLastStartedAt={t.timerLastStartedAt}
                                  elapsed={t.timerElapsed}
                                  isRunning={!!t.timerLastStartedAt}
                                />
                                {t.timerEnabled !== false && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      toggleTaskTimer(t)
                                    }}
                                    className="rounded-full p-0.5 hover:bg-amber-500/20 active:scale-95 transition-colors"
                                    title={t.timerLastStartedAt ? "Pause timer" : "Resume timer"}
                                  >
                                    {t.timerLastStartedAt ? (
                                      <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
                                    ) : (
                                      <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                                    )}
                                  </button>
                                )}
                              </div>
                            )}
                            {(() => {
                              const due = formatDue(t)
                              const countdown = getTaskCountdown(t)
                              return (
                                <>
                                  {due && (
                                    <span className={due.isOverdue ? 'text-amber-400' : ''}>{due.label}</span>
                                  )}
                                  {countdown && (
                                    <span className={countdown.isOverdue ? 'text-amber-400' : 'theme-text-faint'}>
                                      · {countdown.text}
                                    </span>
                                  )}
                                </>
                              )
                            })()}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="rounded-xl theme-surface-bg theme-border border px-2.5 py-1 text-xs font-medium theme-text-muted">
                            {t.priority}
                          </span>
                          <button
                            type="button"
                            onClick={() => navigate(`/tasks/${t.id}`)}
                            className="rounded-xl p-1.5 text-xs font-medium theme-text-muted hover:theme-text hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                            title="Edit task"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => openDoneModal(t.id)}
                            disabled={updatingTaskId === t.id}
                            className="rounded-xl theme-surface-bg theme-border border px-3 py-1.5 text-xs font-medium theme-text theme-surface-hover-bg disabled:opacity-50"
                            title="Mark done"
                          >
                            {updatingTaskId === t.id ? 'Completing…' : 'Done'}
                          </button>
                        </div>
                      </li>
                    ))}
                    {inProgress.length === 0 && (
                      <li className="glass rounded-2xl border border-dashed theme-border py-8 text-center">
                        <p className="theme-text-muted">No tasks in progress.</p>
                        <p className="mt-1 text-sm theme-text-faint">Click <strong className="theme-text-muted">Start</strong> on a task in the queue below to begin working on it.</p>
                      </li>
                    )}
                  </ul>
                </section>

                <section>
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-xs font-medium uppercase tracking-widest theme-text-muted">
                      Queue
                    </h3>
                    <select
                      value={queueFilterDays}
                      onChange={(e) => setQueueFilterDays(Number(e.target.value))}
                      className="rounded-lg border-none bg-transparent text-xs font-medium theme-text-muted focus:ring-0 cursor-pointer hover:theme-text p-0 pr-6"
                      style={{ backgroundImage: 'none' }}
                    >
                      <option value={1}>Today only</option>
                      <option value={2}>Next 2 days</option>
                      <option value={3}>Next 3 days</option>
                      <option value={7}>Next 7 days</option>
                      <option value={100}>All upcoming</option>
                    </select>
                  </div>
                  <ul className="space-y-3 animate-stagger">
                    {queue
                      .filter((t) => t.status !== 'in_progress')
                      .filter((t) => {
                        if (queueFilterDays === 100) return true
                        if (!t.dueDate) return false
                        const date = t.dueDate.toDate() // Firestore Timestamp
                        const now = new Date()
                        now.setHours(0, 0, 0, 0)
                        const cutoff = new Date(now)
                        cutoff.setDate(now.getDate() + queueFilterDays)
                        return date < cutoff
                      })
                      .map((t) => (
                        <li
                          key={t.id}
                          className="glass-strong flex items-center justify-between gap-3 rounded-2xl px-5 py-4 transition-all duration-300 theme-surface-hover-bg"
                        >
                          <div className="min-w-0 flex-1">
                            <button
                              type="button"
                              onClick={() => navigate(`/tasks/${t.id}`)}
                              className="text-left theme-text hover:underline theme-text-faint decoration-current"
                            >
                              {t.title}
                            </button>
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs theme-text-muted">
                              {t.projectId && projectMap.get(t.projectId) && (
                                <span className="rounded-lg theme-surface-bg px-1.5 py-0.5 theme-text-muted">
                                  {projectMap.get(t.projectId)!.name}
                                </span>
                              )}
                              {(() => {
                                const due = formatDue(t)
                                const countdown = getTaskCountdown(t)
                                return (
                                  <>
                                    {due && (
                                      <span className={due.isOverdue ? 'text-amber-400' : ''}>{due.label}</span>
                                    )}
                                    {countdown && (
                                      <span className={countdown.isOverdue ? 'text-amber-400' : 'theme-text-faint'}>
                                        · {countdown.text}
                                      </span>
                                    )}
                                  </>
                                )
                              })()}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="relative group">
                              <select
                                value={t.priority}
                                onChange={(e) => {
                                  e.stopPropagation()
                                  updateTask(t.id, { priority: e.target.value as 'P1' | 'P2' | 'P3' }, user?.uid || '')
                                }}
                                className="appearance-none rounded-xl theme-surface-bg theme-border border px-2.5 py-1 text-xs font-medium theme-text-muted cursor-pointer hover:theme-text hover:border-zinc-400 transition-colors pr-2 text-center focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                                title="Change priority"
                              >
                                <option value="P1">P1</option>
                                <option value="P2">P2</option>
                                <option value="P3">P3</option>
                              </select>
                            </div>
                            <button
                              type="button"
                              onClick={() => navigate(`/tasks/${t.id}`)}
                              className="rounded-xl p-1.5 text-xs font-medium theme-text-muted hover:theme-text hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                              title="Edit task"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => updateTask(t.id, { status: 'in_progress', startedAt: Timestamp.now() }, user?.uid || '')}
                              disabled={updatingTaskId === t.id || inProgress.length >= maxInProgress}
                              className="rounded-xl theme-surface-bg theme-border border px-3 py-1.5 text-xs font-medium theme-text theme-surface-hover-bg disabled:opacity-50"
                              title={inProgress.length >= maxInProgress ? 'At limit — mark a task done first' : 'Start working'}
                            >
                              {updatingTaskId === t.id ? '…' : 'Start'}
                            </button>
                          </div>
                        </li>
                      ))}
                    {queue.length === 0 && (
                      <li className="glass rounded-2xl border border-dashed theme-border py-8 text-center">
                        <p className="theme-text-muted">No tasks in queue.</p>
                        <p className="mt-1 text-sm theme-text-faint">Add a task with <strong className="theme-text-muted">New task</strong> or press <kbd className="rounded theme-surface-bg px-1.5 py-0.5 text-xs theme-text-muted">N</kbd> to get started.</p>
                      </li>
                    )}
                  </ul>
                </section>
              </div>

              <div className="mt-10">
                <button
                  onClick={() => setIsHistoryExpanded(!isHistoryExpanded)}
                  className="flex items-center gap-2 mb-4 text-xs font-medium uppercase tracking-widest theme-text-muted hover:theme-text transition-colors"
                >
                  <span className={`transform transition-transform ${isHistoryExpanded ? 'rotate-90' : ''}`}>▶</span>
                  History — completed ({completed.length})
                </button>

                {isHistoryExpanded && (
                  <ul className="space-y-2 animate-fade-in">
                    {completed.map((t) => {
                      const completedDate = t.completedAt?.toDate?.() || t.updatedAt?.toDate?.() || new Date()
                      const duration = t.timerElapsed ? Math.floor(t.timerElapsed / 1000) : 0
                      const hours = Math.floor(duration / 3600)
                      const minutes = Math.floor((duration % 3600) / 60)

                      return (
                        <li key={t.id} className="group glass rounded-2xl p-4 transition-all hover:bg-white/5 relative">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <h3 className="font-medium theme-text decoration-zinc-500/50 line-through opacity-75">{t.title}</h3>
                              {t.description && <p className="mt-1 text-sm theme-text-muted line-clamp-1 opacity-75">{t.description}</p>}
                              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs theme-text-muted">
                                <span title={completedDate.toLocaleString()}>
                                  Completed {completedDate.toLocaleDateString()}
                                </span>
                                {(hours > 0 || minutes > 0) && (
                                  <span className="flex items-center gap-1 text-emerald-500/80">
                                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8 8-8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z" /></svg>
                                    Took {hours > 0 ? `${hours}h ` : ''}{minutes}m
                                  </span>
                                )}
                                {t.estimatedMinutes && (
                                  <span>Est. {t.estimatedMinutes}m</span>
                                )}
                              </div>
                            </div>
                            <button
                              onClick={() => updateTask(t.id, { status: 'in_progress', completedAt: undefined }, user?.uid || '')}
                              className="rounded-xl border theme-border px-3 py-1.5 text-xs font-medium theme-text opacity-0 group-hover:opacity-100 transition-opacity hover:theme-surface-hover-bg"
                            >
                              Reopen
                            </button>
                          </div>
                        </li>
                      )
                    })}
                    {completed.length === 0 && (
                      <li className="glass rounded-2xl border border-dashed theme-border py-8 text-center">
                        <p className="theme-text-muted">No completed tasks yet.</p>
                      </li>
                    )}
                  </ul>
                )}
              </div>
            </>
          )}
        </main>
      </div>
      {shortcutsOpen && <ShortcutsModal onClose={() => setShortcutsOpen(false)} />}
      {completingTaskId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center theme-overlay backdrop-blur-sm p-4"
          onClick={() => setCompletingTaskId(null)}
          role="dialog"
          aria-label="Add completion note"
        >
          <div
            className="glass-strong w-full max-w-md rounded-2xl p-6 shadow-xl animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold theme-text">Mark task done</h3>
            <p className="mt-1 text-sm theme-text-muted">Add an optional note (e.g. what was shipped).</p>
            <textarea
              value={completionNote}
              onChange={(e) => setCompletionNote(e.target.value)}
              placeholder="Completion note (optional)"
              rows={3}
              className="mt-4 w-full rounded-2xl theme-input px-4 py-3"
              autoFocus
            />
            <div className="mt-4 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setCompletingTaskId(null)}
                className="rounded-2xl border theme-border px-4 py-2 text-sm theme-text-muted theme-surface-hover-bg hover:theme-text"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitDoneWithNote}
                disabled={updatingTaskId === completingTaskId}
                className="rounded-2xl theme-surface-bg theme-border border px-4 py-2 text-sm font-medium theme-text hover:opacity-90 disabled:opacity-50"
              >
                {updatingTaskId === completingTaskId ? 'Completing…' : 'Mark done'}
              </button>
            </div>
          </div>
        </div>
      )}
      {commandBarOpen && user && (
        <CommandBar
          currentWorkspace={currentWorkspace}
          userId={user.uid}
          onClose={() => setCommandBarOpen(false)}
          onNavigate={navigate}
        />
      )}

      {calendarOpen && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center theme-overlay backdrop-blur-sm p-4"
          onClick={() => setCalendarOpen(false)}
          role="dialog"
          aria-label="Task calendar"
        >
          <div
            className="glass-strong w-full max-w-3xl rounded-2xl p-6 shadow-2xl animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-widest theme-text-muted">Schedule</p>
                <p className="text-lg font-semibold theme-text">
                  {calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCalendarOpen(false)}
                  className="rounded-xl px-3 py-1.5 text-sm theme-text-muted hover:theme-text theme-surface-hover-bg"
                  aria-label="Close calendar"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-4 lg:flex-row">
              <div className="lg:w-2/3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setCalendarMonth((m) => addMonths(m, -1))}
                      className="rounded-lg px-2 py-1 text-sm theme-text-muted hover:theme-text theme-surface-hover-bg"
                      aria-label="Previous month"
                    >
                      ‹
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const now = new Date()
                        setCalendarMonth(new Date(now.getFullYear(), now.getMonth(), 1))
                        setSelectedDate(new Date(now.getFullYear(), now.getMonth(), now.getDate()))
                      }}
                      className="rounded-lg px-2 py-1 text-xs font-medium theme-text-muted hover:theme-text theme-surface-hover-bg"
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      onClick={() => setCalendarMonth((m) => addMonths(m, 1))}
                      className="rounded-lg px-2 py-1 text-sm theme-text-muted hover:theme-text theme-surface-hover-bg"
                      aria-label="Next month"
                    >
                      ›
                    </button>
                  </div>
                  <p className="text-sm theme-text-muted">
                    Showing tasks for {calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                  </p>
                </div>

                <div className="mt-3 grid grid-cols-7 text-[11px] uppercase tracking-wide text-center theme-text-muted">
                  {weekdayLabels.map((d) => (
                    <span key={d}>{d}</span>
                  ))}
                </div>

                <div className="mt-2 grid grid-cols-7 gap-1 text-sm">
                  {calendarDays.map((day) => {
                    const isCurrentMonth = day.getMonth() === calendarMonth.getMonth()
                    const isSelected = isSameDay(day, selectedDate)
                    const key = formatDateKey(day)
                    const hasTasks = tasksByDate.has(key)
                    return (
                      <button
                        key={`${key}-${day.getMonth()}`}
                        type="button"
                        onClick={() => {
                          setSelectedDate(new Date(day))
                          setCalendarMonth(new Date(day.getFullYear(), day.getMonth(), 1))
                        }}
                        className={`relative aspect-square w-full rounded-xl text-center transition-colors duration-150 ${isSelected
                          ? 'bg-[var(--color-accent)] text-black font-semibold shadow-sm'
                          : 'theme-surface-bg theme-border border hover:theme-surface-hover-bg'
                          } ${!isCurrentMonth ? 'opacity-60' : ''}`}
                      >
                        {day.getDate()}
                        {hasTasks && (
                          <span className="absolute bottom-1 left-1.5 h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" aria-hidden />
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="lg:w-1/3 rounded-2xl border theme-border bg-black/5 dark:bg-white/5 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs uppercase tracking-widest theme-text-muted">Selected</p>
                    <p className="text-sm font-medium theme-text">
                      {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                  {currentWorkspace && (
                    <button
                      type="button"
                      onClick={() => {
                        setCalendarOpen(false)
                        navigate(`/workspaces/${currentWorkspace.id}/tasks/new?due=${selectedDateKey}`)
                      }}
                      className="rounded-lg px-3 py-1.5 text-xs font-medium theme-surface-bg theme-border border theme-text transition-colors theme-surface-hover-bg"
                    >
                      Schedule task
                    </button>
                  )}
                </div>
                {tasksOnSelectedDate.length === 0 && (
                  <p className="text-sm theme-text-muted">No tasks scheduled.</p>
                )}
                {tasksOnSelectedDate.length > 0 && (
                  <ul className="space-y-2 max-h-64 overflow-auto pr-1">
                    {tasksOnSelectedDate.map((t) => (
                      <li key={t.id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1 theme-surface-hover-bg">
                        <button
                          type="button"
                          onClick={() => {
                            setCalendarOpen(false)
                            navigate(`/tasks/${t.id}`)
                          }}
                          className="text-sm theme-text text-left truncate hover:underline"
                        >
                          {t.title}
                        </button>
                        <span className="text-[11px] uppercase tracking-wide theme-text-muted">{t.priority}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {newProjectOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center theme-overlay backdrop-blur-sm p-4"
          onClick={() => setNewProjectOpen(false)}
          role="dialog"
          aria-label="New project"
        >
          <form
            onSubmit={handleCreateProject}
            className="glass-strong w-full max-w-md rounded-2xl p-6 shadow-xl animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold theme-text">New project</h3>
            <p className="mt-1 text-sm theme-text-muted">Group tasks under a project.</p>
            <div className="mt-4">
              <label className="block text-sm font-medium theme-text-muted">Name</label>
              <input
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="e.g. Q1 Launch"
                className="mt-1 w-full rounded-2xl theme-input px-4 py-2.5"
                required
              />
            </div>
            <div className="mt-3">
              <label className="block text-sm font-medium theme-text-muted">Description (optional)</label>
              <input
                type="text"
                value={newProjectDesc}
                onChange={(e) => setNewProjectDesc(e.target.value)}
                placeholder="Short description"
                className="mt-1 w-full rounded-2xl theme-input px-4 py-2.5"
              />
            </div>
            <div className="mt-4 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setNewProjectOpen(false)}
                className="rounded-2xl border theme-border px-4 py-2 text-sm theme-text-muted theme-surface-hover-bg hover:theme-text"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creatingProject || !newProjectName.trim()}
                className="rounded-2xl theme-surface-bg theme-border border px-4 py-2 text-sm font-medium theme-text theme-surface-hover-bg disabled:opacity-50"
              >
                {creatingProject ? 'Creating…' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
