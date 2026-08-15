import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { subscribeTasksByWorkspace } from '../lib/tasks'
import { getProjectsByWorkspace } from '../lib/projects'
import { AppHeader } from '../components/AppHeader'
import { WorkspaceSettingsModal } from '../components/WorkspaceSettingsModal'
import { updateWorkspace } from '../lib/workspaces'
import { useToast } from '../contexts/ToastContext'
import { OverviewInsight } from '../components/OverviewInsight'
import type { OverviewMetrics } from '../lib/ai'
import { DashboardSidebar } from '../components/DashboardSidebar'
import type { Task, Project, Workspace } from '../types'

/* ─── colour tokens ──────────────────────────────────────────── */
/**
 * Status colours, validated with the dataviz palette checker in both modes:
 * lightness band, chroma floor, CVD separation and normal-vision separation all
 * pass. The previous set failed three checks — notably grey↔blue at ΔE 13.3,
 * which full-colour readers struggle to tell apart.
 *
 * Segment order matters as much as the hues: the two warm colours are never
 * adjacent, because adjacent warm pairs were what failed CVD separation.
 * Backlog stays neutral on purpose — it is the "not started" bucket and should
 * recede rather than compete with active work.
 */
const STATUS_COLOR: Record<Task['status'], string> = {
  done:        '#199e70',
  in_progress: '#c98500',
  planned:     '#3987e5',
  blocked:     '#e66767',
  backlog:     '#8b8b93',
}

/** Draw order — keeps warm hues apart, so no adjacent pair fails CVD. */
const STATUS_ORDER: Task['status'][] = ['done', 'in_progress', 'planned', 'blocked', 'backlog']
// Kept for the legend/tooltips.
export const STATUS_LABEL: Record<Task['status'], string> = {
  in_progress: 'In Progress',
  planned:     'Planned',
  backlog:     'Backlog',
  blocked:     'Blocked',
  done:        'Done',
}
/**
 * Priority is ordinal — Critical through Low — so it reads as a single-hue
 * sequential ramp rather than four unrelated categories. The previous set paired
 * red with orange, which fails CVD separation and implied the levels were
 * unrelated kinds rather than degrees of the same thing.
 */
const PRIORITY_COLOR: Record<Task['priority'], string> = {
  P0: '#b91c1c',
  P1: '#dc5b3a',
  P2: '#e69465',
  P3: '#f0c3a8',
}
const PRIORITY_LABEL: Record<Task['priority'], string> = {
  P0: 'Critical',
  P1: 'High',
  P2: 'Medium',
  P3: 'Low',
}

/* ─── tiny SVG chart primitives ─────────────────────────────── */

function DonutChart({ segments }: { segments: { value: number; color: string; label: string }[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0)
  if (total === 0) {
    return (
      <svg viewBox="0 0 100 100" className="w-full h-full">
        <circle cx="50" cy="50" r="36" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="16" />
        <text x="50" y="54" textAnchor="middle" fontSize="10" fill="rgba(255,255,255,0.3)">No data</text>
      </svg>
    )
  }
  let cursor = -90 // start from top
  const arcs = segments.map((seg) => {
    const pct = seg.value / total
    const startAngle = cursor
    cursor += pct * 360
    const endAngle = cursor
    const r = 36
    const toRad = (deg: number) => (deg * Math.PI) / 180
    const x1 = 50 + r * Math.cos(toRad(startAngle))
    const y1 = 50 + r * Math.sin(toRad(startAngle))
    const x2 = 50 + r * Math.cos(toRad(endAngle))
    const y2 = 50 + r * Math.sin(toRad(endAngle))
    const largeArc = pct > 0.5 ? 1 : 0
    return { ...seg, pct, d: `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}` }
  })
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <circle cx="50" cy="50" r="36" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="16" />
      {arcs.filter(a => a.pct > 0).map((arc, i) => (
        <path
          key={i}
          d={arc.d}
          fill="none"
          stroke={arc.color}
          strokeWidth="16"
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 4px ${arc.color}60)` }}
        >
          <title>{arc.label}: {arc.value}</title>
        </path>
      ))}
      <text x="50" y="47" textAnchor="middle" fontSize="16" fontWeight="700" fill="rgba(255,255,255,0.9)">{total}</text>
      <text x="50" y="58" textAnchor="middle" fontSize="7" fill="rgba(255,255,255,0.4)">TOTAL</text>
    </svg>
  )
}

export function BarChart({ bars, maxValue }: { bars: { label: string; value: number; color: string }[]; maxValue: number }) {
  const effectiveMax = Math.max(maxValue, 1)
  return (
    <div className="flex items-end gap-2 h-full w-full">
      {bars.map((bar, i) => (
        <div key={i} className="flex flex-col items-center gap-1 flex-1 min-w-0 h-full">
          <span style={{ color: 'var(--color-text)', fontSize: '11px', fontWeight: 600, lineHeight: 1 }}>{bar.value > 0 ? bar.value : ''}</span>
          <div className="relative w-full flex-1 flex items-end">
            <div
              className="w-full rounded-t-lg transition-all duration-700 ease-out"
              style={{
                height: `${Math.max((bar.value / effectiveMax) * 100, bar.value > 0 ? 6 : 0)}%`,
                background: `linear-gradient(to top, ${bar.color}cc, ${bar.color}55)`,
                boxShadow: bar.value > 0 ? `0 0 8px ${bar.color}44` : 'none',
              }}
            />
          </div>
          <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.35)', textAlign: 'center', lineHeight: 1.2 }}>{bar.label}</span>
        </div>
      ))}
    </div>
  )
}

/* ─── stat card ────────────────────────────────────────────── */
function StatCard({ label, value, sub, accent, icon }: {
  label: string; value: string | number; sub?: string; accent?: string; icon: React.ReactNode
}) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl p-5 flex flex-col gap-3 group"
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
    >
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{ background: `radial-gradient(ellipse 80% 60% at 50% 0%, ${accent ?? 'var(--color-accent)'}0d, transparent)` }}
      />
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wider whitespace-nowrap" style={{ color: 'var(--color-text-faint)' }}>{label}</span>
        <div className="rounded-xl p-2" style={{ background: `${accent ?? 'var(--color-accent)'}15` }}>
          <div style={{ color: accent ?? 'var(--color-accent)' }}>{icon}</div>
        </div>
      </div>
      <div>
        <p className="text-3xl font-bold tracking-tight font-display" style={{ color: 'var(--color-text)' }}>{value}</p>
        {sub && <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>{sub}</p>}
      </div>
    </div>
  )
}

/* ─── section wrapper ────────────────────────────────────────── */
function ChartCard({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl p-5 ${className}`}
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
    >
      <h3 className="mb-4 text-sm font-semibold tracking-tight" style={{ color: 'var(--color-text)' }}>{title}</h3>
      {children}
    </div>
  )
}

/* ─── helpers ────────────────────────────────────────────────── */
function getLast7DayLabels() {
  const labels: string[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    labels.push(d.toLocaleDateString('en-US', { weekday: 'short' }))
  }
  return labels
}

function getDateKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

/* ─── main component ─────────────────────────────────────────── */
export function Analytics() {
  const navigate = useNavigate()
  const { workspaces, currentWorkspace, setCurrentWorkspaceId, refreshWorkspaces, loading: wsLoading } = useWorkspace()
  const { toast } = useToast()
  // Overview is the landing page, so workspace administration has to be
  // reachable from here. It used to bounce to /tasks, which looked like a
  // dead menu item: the click navigated away and opened nothing.
  const [editingWorkspace, setEditingWorkspace] = useState<Workspace | null>(null)
  const [editingTab, setEditingTab] = useState<'general' | 'members'>('general')
  const [tasks, setTasks] = useState<Task[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [tasksLoading, setTasksLoading] = useState(true)
  const [now] = useState(new Date())
  const [scopeId, setScopeId] = useState('')
  const [projectFilter, setProjectFilter] = useState('')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('stacky_sidebar_collapsed') === 'true'
    } catch {
      return false
    }
  })

  function toggleSidebar() {
    setSidebarCollapsed((c) => {
      const next = !c
      try {
        localStorage.setItem('stacky_sidebar_collapsed', String(next))
      } catch {
        /* private mode — keep the in-memory value */
      }
      return next
    })
  }

  // Workspaces in scope: one when chosen, otherwise every one the user can reach.
  const scoped = scopeId ? workspaces.filter((w) => w.id === scopeId) : workspaces
  const scopeKey = scoped.map((w) => w.id).sort().join(',')

  useEffect(() => {
    const ids = scopeKey ? scopeKey.split(',') : []
    if (ids.length === 0) { setTasks([]); setTasksLoading(false); return }
    setTasksLoading(true)
    // Each workspace has its own listener; results are merged by workspace so a
    // late update from one never drops the others.
    const byWorkspace = new Map<string, Task[]>()
    const unsubs = ids.map((id) =>
      subscribeTasksByWorkspace(id, (t) => {
        byWorkspace.set(id, t)
        setTasks(Array.from(byWorkspace.values()).flat())
        setTasksLoading(false)
      })
    )
    const timeout = setTimeout(() => setTasksLoading(false), 10000)
    return () => { unsubs.forEach((u) => u()); clearTimeout(timeout) }
  }, [scopeKey])

  useEffect(() => {
    const ids = scopeKey ? scopeKey.split(',') : []
    if (ids.length === 0) { setProjects([]); return }
    let cancelled = false
    Promise.all(ids.map((id) => getProjectsByWorkspace(id).catch(() => [])))
      .then((lists) => { if (!cancelled) setProjects(lists.flat()) })
    return () => { cancelled = true }
  }, [scopeKey])

  /* ─── derived stats ──────────────────────────────────────── */
  const stats = useMemo(() => {
    const total = tasks.length
    const done = tasks.filter(t => t.status === 'done').length
    const inProgress = tasks.filter(t => t.status === 'in_progress').length
    const blocked = tasks.filter(t => t.status === 'blocked').length
    const planned = tasks.filter(t => t.status === 'planned').length
    const backlog = tasks.filter(t => t.status === 'backlog').length
    const completionRate = total > 0 ? Math.round((done / total) * 100) : 0

    // overdue
    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0)
    const overdue = tasks.filter(t =>
      t.status !== 'done' && t.dueDate && typeof t.dueDate.toMillis === 'function' &&
      t.dueDate.toMillis() < startOfToday.getTime()
    ).length

    // completions by day (last 7)
    const dayKeys: string[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i); dayKeys.push(getDateKey(d))
    }
    const completionsByDay = dayKeys.map(key =>
      tasks.filter(t => {
        const ts = t.completedAt ?? t.updatedAt
        if (!ts || typeof ts.toDate !== 'function') return false
        if (t.status !== 'done') return false
        return getDateKey(ts.toDate()) === key
      }).length
    )

    // created by day (last 7)
    const createdByDay = dayKeys.map(key =>
      tasks.filter(t => {
        if (!t.createdAt || typeof t.createdAt.toDate !== 'function') return false
        return getDateKey(t.createdAt.toDate()) === key
      }).length
    )

    // priority breakdown
    const byPriority: Record<Task['priority'], number> = { P0: 0, P1: 0, P2: 0, P3: 0 }
    tasks.forEach(t => { byPriority[t.priority]++ })

    // project task counts
    const byProject = projects.map(p => ({
      project: p,
      total: tasks.filter(t => t.projectId === p.id).length,
      done: tasks.filter(t => t.projectId === p.id && t.status === 'done').length,
      inProgress: tasks.filter(t => t.projectId === p.id && t.status === 'in_progress').length,
      blocked: tasks.filter(t => t.projectId === p.id && t.status === 'blocked').length,
    })).sort((a, b) => b.total - a.total)

    // avg time to complete (ms)
    const durations: number[] = tasks
      .filter(t => t.status === 'done' && t.completedAt && t.createdAt &&
        typeof t.completedAt.toMillis === 'function' && typeof t.createdAt.toMillis === 'function')
      .map(t => t.completedAt!.toMillis() - t.createdAt.toMillis())
    // Median, not mean: cycle times are heavily skewed by a few long-lived
    // tasks. On this data the mean reads 95 days against a median of 6 — the
    // mean describes one forgotten task, not how long work usually takes.
    const sortedDurations = [...durations].sort((a, b) => a - b)
    const medianMs = sortedDurations.length > 0
      ? sortedDurations.length % 2
        ? sortedDurations[(sortedDurations.length - 1) / 2]
        : (sortedDurations[sortedDurations.length / 2 - 1] + sortedDurations[sortedDurations.length / 2]) / 2
      : null
    const avgDays = medianMs !== null ? (medianMs / (1000 * 60 * 60 * 24)).toFixed(1) : null

    // timer / focus time
    // timerElapsed is already milliseconds — toggleTaskTimer banks
    // `Date.now() - start`. It used to be multiplied by 1000 as if it were
    // seconds, which reported ~18 years of focus time across 23 tasks.
    const totalTimerMs = tasks.reduce((acc, t) => acc + (t.timerElapsed ?? 0), 0)
    const focusMinutes = Math.round(totalTimerMs / 60000)
    const totalHours = focusMinutes >= 60
      ? `${Math.floor(focusMinutes / 60)}h ${focusMinutes % 60}m`
      : `${focusMinutes}m`

    return {
      total, done, inProgress, blocked, planned, backlog, completionRate, overdue,
      completionsByDay, createdByDay,
      byPriority, byProject,
      avgDays, totalHours,
    }
  }, [tasks, projects, now])

  /**
   * What the AI read receives — the aggregates, not the task list. The charts
   * have already derived all of this, so the call stays a few hundred tokens
   * and re-runs only when a number actually moves.
   */
  const overviewMetrics: OverviewMetrics | null = useMemo(() => {
    if (stats.total === 0) return null
    const tagCounts = new Map<string, number>()
    for (const t of tasks) for (const tag of t.tags ?? []) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
    return {
      workspaces: scoped.length,
      total: stats.total,
      done: stats.done,
      inProgress: stats.inProgress,
      blocked: stats.blocked,
      planned: stats.planned,
      backlog: stats.backlog,
      overdue: stats.overdue,
      completionRate: stats.completionRate,
      medianDaysToComplete: stats.avgDays,
      completedLast7Days: stats.completionsByDay,
      createdLast7Days: stats.createdByDay,
      focusMinutes: Math.round(
        tasks.reduce((acc, t) => acc + (t.timerElapsed ?? 0), 0) / 60000
      ),
      topTags: [...tagCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([tag, count]) => ({ tag, count })),
      projects: stats.byProject
        .slice(0, 6)
        .map((p) => ({ name: p.project.name, total: p.total, done: p.done })),
    }
  }, [stats, tasks, scoped.length])

  const dayLabels = getLast7DayLabels()
  const maxDayVal = Math.max(...stats.completionsByDay, ...stats.createdByDay, 1)
  const statusSegments = [
    ...STATUS_ORDER.map((k) => ({
      value: ({ done: stats.done, in_progress: stats.inProgress, planned: stats.planned, blocked: stats.blocked, backlog: stats.backlog } as Record<Task['status'], number>)[k],
      color: STATUS_COLOR[k],
      label: STATUS_LABEL[k],
    })),
  ]
  const priorityBars = (['P0', 'P1', 'P2', 'P3'] as Task['priority'][]).map(p => ({
    label: PRIORITY_LABEL[p],
    value: stats.byPriority[p],
    color: PRIORITY_COLOR[p],
  }))

  const isLoading = wsLoading || tasksLoading

  return (
    <div className="flex min-h-screen flex-col" style={{ background: 'var(--color-bg)' }}>
      {editingWorkspace && (
        <WorkspaceSettingsModal
          isOpen={!!editingWorkspace}
          onClose={() => setEditingWorkspace(null)}
          workspace={editingWorkspace}
          initialTab={editingTab}
          onUpdate={async (id, name, description) => {
            await updateWorkspace(id, { name, description })
            await refreshWorkspaces()
            setEditingWorkspace(null)
            toast('Workspace updated', 'success')
          }}
        />
      )}
      <AppHeader onMenuClick={() => setMobileMenuOpen(true)}>
        {workspaces.length > 1 && (
          <select
            value={scopeId}
            onChange={(e) => setScopeId(e.target.value)}
            className="select-input min-w-0 max-w-[8rem] text-sm sm:max-w-none"
            aria-label="Workspaces included"
          >
            <option value="">All workspaces</option>
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        )}
      </AppHeader>
      <div className="flex flex-1">
      <DashboardSidebar
        workspaces={workspaces}
        currentWorkspace={currentWorkspace}
        // Picking a workspace in the sidebar also narrows the charts to it —
        // otherwise the click would appear to do nothing on this page.
        setCurrentWorkspaceId={(id) => {
          setCurrentWorkspaceId(id)
          setScopeId(id ?? '')
        }}
        projects={projects}
        projectFilter={projectFilter}
        setProjectFilter={setProjectFilter}
        onNewWorkspace={() => navigate('/workspaces/new')}
        onNewProject={() => navigate('/tasks')}
        loading={wsLoading}
        collapsed={sidebarCollapsed}
        onToggleCollapse={toggleSidebar}
        mobileOpen={mobileMenuOpen}
        setMobileOpen={setMobileMenuOpen}
        onEditWorkspace={(id, _name, tab) => {
          const ws = workspaces.find((w) => w.id === id)
          if (!ws) return
          setEditingWorkspace(ws)
          setEditingTab(tab ?? 'general')
          setMobileMenuOpen(false)
        }}
        onDeleteWorkspace={() => navigate('/tasks')}
      />

      <div className="flex min-w-0 flex-1 flex-col">

      <main className="w-full px-4 py-6 sm:px-6 lg:px-8">
        {isLoading ? (
          <AnalyticsSkeleton />
        ) : scoped.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="text-5xl">📊</div>
            <p className="text-lg font-medium" style={{ color: 'var(--color-text)' }}>No workspaces yet</p>
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Create a workspace and your analytics will appear here.</p>
            <button onClick={() => navigate('/workspaces/new')} className="mt-2 rounded-2xl px-5 py-2.5 text-sm font-medium transition-all" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}>
              New workspace
            </button>
          </div>
        ) : (
          <div className="space-y-6 animate-fade-in">
            {/* page title */}
            <div>
              <p className="text-2xl font-bold font-display tracking-tight" style={{ color: 'var(--color-text)' }}>
                {scopeId ? (scoped[0]?.name ?? 'Workspace') : 'All workspaces'}
              </p>
              <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                {scopeId
                  ? 'Workspace analytics'
                  : `Across ${scoped.length} workspace${scoped.length !== 1 ? 's' : ''}`}
                {' · '}{stats.total} task{stats.total !== 1 ? 's' : ''} total
              </p>
            </div>

            {/* ── KPI row ── */}
            <OverviewInsight metrics={overviewMetrics} />

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6 xl:gap-5">
              <StatCard label="Total Tasks" value={stats.total} accent="#60a5fa"
                icon={<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>}
              />
              <StatCard label="Completed" value={stats.done} sub={`${stats.completionRate}% completion`} accent="#22c55e"
                icon={<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
              />
              <StatCard label="In Progress" value={stats.inProgress} accent="#f97316"
                icon={<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
              />
              <StatCard label="Blocked" value={stats.blocked} accent="#ef4444"
                icon={<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>}
              />
              <StatCard label="Overdue" value={stats.overdue} accent="#f59e0b"
                icon={<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
              />
              <StatCard label="Focus Hours" value={stats.totalHours} sub="Total tracked time" accent="#a78bfa"
                icon={<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
              />
            </div>

            {/* ── completion rate bar ── */}
            <ChartCard title="Overall Completion">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="flex items-end justify-between mb-2">
                    <span className="text-3xl font-bold font-display" style={{ color: 'var(--color-text)' }}>{stats.completionRate}%</span>
                    <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{stats.done} / {stats.total} tasks</span>
                  </div>
                  <div className="relative h-3 w-full rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <div
                      className="absolute inset-y-0 left-0 rounded-full transition-all duration-1000"
                      style={{
                        width: `${stats.completionRate}%`,
                        background: 'linear-gradient(90deg, #22c55e, #4ade80)',
                        boxShadow: '0 0 12px #22c55e55',
                      }}
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3">
                    {statusSegments.map((s) => (
                      <div key={s.label} className="flex items-center gap-1.5">
                        <div className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: s.color, boxShadow: `0 0 4px ${s.color}80` }} />
                        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{s.label} <span style={{ color: 'var(--color-text)' }}>{s.value}</span></span>
                      </div>
                    ))}
                  </div>
                </div>
                {stats.avgDays && (
                  <div className="hidden sm:flex flex-col items-center justify-center rounded-2xl p-4 shrink-0 min-w-[100px]" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--color-border)' }}>
                    <span className="text-2xl font-bold font-display" style={{ color: 'var(--color-accent)' }}>{stats.avgDays}d</span>
                    <span className="text-xs text-center mt-1" style={{ color: 'var(--color-text-muted)' }}>median to complete</span>
                  </div>
                )}
              </div>
            </ChartCard>

            {/* ── charts row ── */}
            <div className="grid gap-4 lg:grid-cols-2">
              {/* Status donut */}
              <ChartCard title="Status Breakdown">
                <div className="flex items-center gap-4">
                  <div className="h-36 w-36 shrink-0">
                    <DonutChart segments={statusSegments} />
                  </div>
                  <div className="flex flex-col gap-2 flex-1 min-w-0">
                    {statusSegments.filter(s => s.value > 0).map((s) => (
                      <div key={s.label} className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />
                          <span className="text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>{s.label}</span>
                        </div>
                        <span className="text-xs font-semibold shrink-0" style={{ color: 'var(--color-text)' }}>{s.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </ChartCard>

              {/* Priority bars */}
              <ChartCard title="Priority Breakdown">
                <div className="flex flex-col gap-3">
                  {priorityBars.map((bar) => (
                    <div key={bar.label} className="flex items-center gap-3">
                      <span className="w-16 text-xs shrink-0" style={{ color: 'var(--color-text-muted)' }}>{bar.label}</span>
                      <div className="flex-1 relative h-5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                        <div
                          className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
                          style={{
                            width: `${stats.total > 0 ? (bar.value / stats.total) * 100 : 0}%`,
                            background: `linear-gradient(90deg, ${bar.color}cc, ${bar.color}66)`,
                            boxShadow: `0 0 6px ${bar.color}44`,
                          }}
                        />
                      </div>
                      <span className="text-xs font-semibold w-6 text-right tabular-nums" style={{ color: bar.value > 0 ? 'var(--color-text)' : 'var(--color-text-faint)' }}>{bar.value}</span>
                    </div>
                  ))}
                  {stats.total === 0 && <p className="text-xs text-center py-4" style={{ color: 'var(--color-text-faint)' }}>No tasks yet</p>}
                </div>
              </ChartCard>

              {/* Backlog vs active */}
            </div>

            {/* ── daily bar chart ── */}
            <ChartCard title="Activity — last 7 days">
              <div className="flex gap-4 mb-4">
                {[{ color: STATUS_COLOR.done, label: 'Completed' }, { color: STATUS_COLOR.planned, label: 'Created' }].map(l => (
                  <div key={l.label} className="flex items-center gap-1.5">
                    <div className="h-2 w-4 rounded-full" style={{ background: l.color }} />
                    <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{l.label}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 h-32">
                {dayLabels.map((_day, i) => (
                  <div key={i} className="flex-1 flex gap-1 items-end">
                    {/* completed */}
                    <div className="flex-1 flex h-full flex-col items-center justify-end gap-0.5">
                      <div
                        className="w-full rounded-t-md transition-all duration-700"
                        style={{
                          height: `${Math.max((stats.completionsByDay[i] / maxDayVal) * 100, stats.completionsByDay[i] > 0 ? 6 : 0)}%`,
                          background: `linear-gradient(to top, ${STATUS_COLOR.done}, ${STATUS_COLOR.done}88)`,
                          
                        }}
                      />
                    </div>
                    {/* created */}
                    <div className="flex-1 flex h-full flex-col items-center justify-end gap-0.5">
                      <div
                        className="w-full rounded-t-md transition-all duration-700"
                        style={{
                          height: `${Math.max((stats.createdByDay[i] / maxDayVal) * 100, stats.createdByDay[i] > 0 ? 6 : 0)}%`,
                          background: `linear-gradient(to top, ${STATUS_COLOR.planned}, ${STATUS_COLOR.planned}88)`,
                          
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-1 flex gap-2">
                {dayLabels.map((d, i) => (
                  <div key={i} className="flex-1 text-center">
                    <span className="text-xs" style={{ color: 'var(--color-text-faint)' }}>{d}</span>
                  </div>
                ))}
              </div>
            </ChartCard>

            {/* ── project breakdown ── */}
            {projects.length > 0 && (
              <ChartCard title="Projects Overview">
                <div className="space-y-3">
                  {stats.byProject.map(({ project, total, done, inProgress, blocked }) => {
                    const pct = total > 0 ? Math.round((done / total) * 100) : 0
                    return (
                      <div key={project.id} className="group">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <div
                              className="h-2 w-2 rounded-full shrink-0"
                              style={{
                                background: project.health === 'behind' ? '#ef4444' : project.health === 'at_risk' ? '#f59e0b' : '#22c55e',
                              }}
                            />
                            <span className="text-sm font-medium truncate" style={{ color: 'var(--color-text)' }}>{project.name}</span>
                            {project.status && (
                              <span className="text-xs px-2 py-0.5 rounded-full shrink-0" style={{
                                background: project.status === 'completed' ? '#22c55e15' : project.status === 'on_hold' ? '#f59e0b15' : '#60a5fa15',
                                color: project.status === 'completed' ? '#22c55e' : project.status === 'on_hold' ? '#f59e0b' : '#60a5fa',
                              }}>
                                {project.status.replace('_', ' ')}
                              </span>
                            )}
                          </div>
                          <span className="text-xs font-semibold shrink-0" style={{ color: 'var(--color-text-muted)' }}>{pct}%</span>
                        </div>
                        <div className="relative h-1.5 w-full rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                          <div
                            className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
                            style={{
                              width: `${pct}%`,
                              background: `linear-gradient(90deg, #22c55e, #4ade80)`,
                              boxShadow: '0 0 8px #22c55e55',
                            }}
                          />
                        </div>
                        <div className="mt-1.5 flex items-center gap-3">
                          <span className="text-xs" style={{ color: 'var(--color-text-faint)' }}>{total} tasks</span>
                          {inProgress > 0 && <span className="text-xs" style={{ color: STATUS_COLOR.in_progress }}>· {inProgress} active</span>}
                          {blocked > 0 && <span className="text-xs" style={{ color: STATUS_COLOR.blocked }}>· {blocked} blocked</span>}
                          {done > 0 && <span className="text-xs" style={{ color: STATUS_COLOR.done }}>· {done} done</span>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </ChartCard>
            )}

            {/* ── tags cloud ── */}
            <TagsChart tasks={tasks} />

            {/* ── recent completions ── */}
            <RecentCompletions tasks={tasks} />
          </div>
        )}
      </main>
      </div>
      </div>
    </div>
  )
}

/* ─── tags chart ─────────────────────────────────────────────── */
function TagsChart({ tasks }: { tasks: Task[] }) {
  const tagCounts = useMemo(() => {
    const map = new Map<string, number>()
    tasks.forEach(t => t.tags.forEach(tag => map.set(tag, (map.get(tag) ?? 0) + 1)))
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)
  }, [tasks])

  if (tagCounts.length === 0) return null
  const max = tagCounts[0][1]

  const tagColors = ['#f97316', '#60a5fa', '#22c55e', '#a78bfa', '#f59e0b', '#ec4899', '#14b8a6']

  return (
    <ChartCard title="Top Tags">
      <div className="flex flex-wrap gap-2">
        {tagCounts.map(([tag, count], i) => {
          const color = tagColors[i % tagColors.length]
          const size = 0.7 + (count / max) * 0.5
          return (
            <span
              key={tag}
              className="rounded-full px-3 py-1 text-xs font-medium transition-all hover:scale-105"
              style={{
                background: `${color}15`,
                color,
                border: `1px solid ${color}30`,
                fontSize: `${Math.round(size * 12)}px`,
              }}
              title={`${count} task${count > 1 ? 's' : ''}`}
            >
              {tag} <span style={{ opacity: 0.6 }}>{count}</span>
            </span>
          )
        })}
      </div>
    </ChartCard>
  )
}

/* ─── recent completions ─────────────────────────────────────── */
function RecentCompletions({ tasks }: { tasks: Task[] }) {
  const recent = useMemo(() =>
    tasks
      .filter(t => t.status === 'done')
      .sort((a, b) => {
        const at = a.completedAt?.toMillis?.() ?? a.updatedAt?.toMillis?.() ?? 0
        const bt = b.completedAt?.toMillis?.() ?? b.updatedAt?.toMillis?.() ?? 0
        return bt - at
      })
      .slice(0, 5),
    [tasks]
  )

  if (recent.length === 0) return null

  return (
    <ChartCard title="Recently Completed">
      <ul className="space-y-2">
        {recent.map((t) => {
          const ts = t.completedAt ?? t.updatedAt
          const when = ts && typeof ts.toDate === 'function'
            ? ts.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
            : ''
          return (
            <li key={t.id} className="flex items-center justify-between gap-4 rounded-xl px-3 py-2.5 transition-colors" style={{ background: 'rgba(255,255,255,0.02)' }}>
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: '#22c55e', boxShadow: '0 0 4px #22c55e80' }} />
                <span className="text-sm truncate" style={{ color: 'var(--color-text)' }}>{t.title}</span>
                <span className="text-xs shrink-0 hidden sm:block px-2 py-0.5 rounded" style={{ background: `${PRIORITY_COLOR[t.priority]}15`, color: PRIORITY_COLOR[t.priority] }}>{t.priority}</span>
              </div>
              {when && <span className="text-xs shrink-0" style={{ color: 'var(--color-text-faint)' }}>{when}</span>}
            </li>
          )
        })}
      </ul>
    </ChartCard>
  )
}

/* ─── skeleton ───────────────────────────────────────────────── */
function AnalyticsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6 xl:gap-5">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="skeleton rounded-2xl h-24" />
        ))}
      </div>
      <div className="skeleton rounded-2xl h-24" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[...Array(3)].map((_, i) => <div key={i} className="skeleton rounded-2xl h-52" />)}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {[...Array(2)].map((_, i) => <div key={i} className="skeleton rounded-2xl h-44" />)}
      </div>
    </div>
  )
}
