import { useCallback, useEffect, useRef, useState } from 'react'

import {
  getOverviewInsight,
  readOverviewHistory,
  type OverviewInsight as Insight,
  type OverviewMetrics,
} from '../lib/ai'

/**
 * The AI read at the top of the Overview.
 *
 * The charts below say what happened; this says what it means. It is given the
 * aggregates the charts already compute rather than the task list, so the call
 * stays small.
 *
 * Past reads are kept and can be paged through: a single reading is a snapshot,
 * but "the backlog grew again" only becomes visible against what it said before.
 */

/** How often to take a fresh read while the dashboard is open. */
const REFRESH_INTERVAL_MS = 15 * 60 * 1000

/**
 * Status tones, each shipped with an icon and a word — never colour alone, so
 * the meaning survives colourblindness, greyscale printing and forced-colors.
 */
const TONE: Record<Insight['signals'][number]['tone'], { color: string; word: string; icon: string }> = {
  good:  { color: '#199e70', word: 'Healthy', icon: 'M5 13l4 4L19 7' },
  watch: { color: '#c98500', word: 'Watch',   icon: 'M12 9v4m0 4h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L14.7 3.9a2 2 0 00-3.4 0z' },
  risk:  { color: '#e66767', word: 'Act now', icon: 'M12 9v4m0 4h.01M12 3a9 9 0 100 18 9 9 0 000-18z' },
}

/** Direction of travel since the previous reading, as a word plus an arrow. */
const CHANGE: Record<Insight['change'], { label: string; color: string; arrow: string } | null> = {
  first: null,
  unchanged: { label: 'No change', color: 'var(--color-text-faint)', arrow: 'M5 12h14' },
  improved: { label: 'Improving', color: '#199e70', arrow: 'M5 15l7-7 7 7' },
  worse: { label: 'Slipping', color: '#c98500', arrow: 'M19 9l-7 7-7-7' },
}

function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (!Number.isFinite(mins) || mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

export function OverviewInsight({ metrics }: { metrics: OverviewMetrics | null }) {
  const [history, setHistory] = useState<Insight[]>([])
  const [index, setIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Re-renders the "x minutes ago" label without refetching anything. */
  const [, setTick] = useState(0)

  // Only the numbers decide whether a re-read is warranted.
  const key = metrics ? JSON.stringify(metrics) : ''
  const lastRun = useRef('')
  const metricsRef = useRef(metrics)
  metricsRef.current = metrics

  const run = useCallback(async (force: boolean) => {
    if (!metricsRef.current) return
    setLoading(true)
    setError(null)
    try {
      await getOverviewInsight(metricsRef.current, { force })
      setHistory(await readOverviewHistory())
      setIndex(0) // a fresh read is always what you want to see first
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  // Paint whatever was said last, immediately, before any network call.
  useEffect(() => {
    let cancelled = false
    void readOverviewHistory().then((past) => {
      if (!cancelled && past.length) setHistory((cur) => (cur.length ? cur : past))
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Re-read when the underlying numbers change.
  useEffect(() => {
    if (!key || lastRun.current === key) return
    lastRun.current = key
    void run(false)
  }, [key, run])

  // And on a timer, so a dashboard left open stays current. Skipped while the
  // tab is hidden — a background tab should not be spending API calls.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void run(true)
    }, REFRESH_INTERVAL_MS)
    return () => clearInterval(id)
  }, [run])

  // Keep the relative timestamp honest without touching the network.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60000)
    return () => clearInterval(id)
  }, [])

  if (!metrics || metrics.total === 0) return null

  const insight = history[index] ?? null
  const isLatest = index === 0
  const canGoOlder = index < history.length - 1

  return (
    <section
      className="rounded-2xl p-5"
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
            What this means
          </span>
          <span
            className="rounded-lg px-2 py-0.5 text-[11px]"
            style={{ background: 'var(--color-bg)', color: 'var(--color-text-faint)' }}
          >
            AI
          </span>
          {insight && CHANGE[insight.change] && (
            <span
              className="flex items-center gap-1 text-[11px] font-medium"
              style={{ color: CHANGE[insight.change]!.color }}
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d={CHANGE[insight.change]!.arrow} />
              </svg>
              {CHANGE[insight.change]!.label}
            </span>
          )}
          {insight && (
            <span className="text-[11px]" style={{ color: 'var(--color-text-faint)' }}>
              {timeAgo(insight.generatedAt)}
              {!isLatest && ` · ${index + 1} of ${history.length}`}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {history.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => setIndex((i) => Math.min(i + 1, history.length - 1))}
                disabled={!canGoOlder}
                title="Earlier read"
                aria-label="Earlier read"
                className="rounded-lg px-1.5 py-1 transition-colors disabled:opacity-30"
                style={{ color: 'var(--color-text-muted)' }}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setIndex((i) => Math.max(i - 1, 0))}
                disabled={isLatest}
                title="Later read"
                aria-label="Later read"
                className="rounded-lg px-1.5 py-1 transition-colors disabled:opacity-30"
                style={{ color: 'var(--color-text-muted)' }}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => void run(true)}
            disabled={loading}
            className="ml-1 rounded-xl border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
          >
            {loading ? 'Reading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {loading && !insight && (
        <div className="space-y-2">
          <div className="skeleton h-4 w-2/3 rounded" />
          <div className="skeleton h-3 w-full rounded" />
          <div className="skeleton h-3 w-4/5 rounded" />
        </div>
      )}

      {error && (
        <p className="text-sm" style={{ color: '#c98500' }}>
          {error}
        </p>
      )}

      {insight && !error && (
        <>
          <p className="text-base font-medium" style={{ color: 'var(--color-text)' }}>
            {insight.headline}
          </p>
          <p className="mt-1.5 text-sm leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            {insight.summary}
          </p>

          {insight.signals.length > 0 && (
            <ul className="mt-4 grid gap-2 sm:grid-cols-3">
              {insight.signals.map((s, i) => {
                const tone = TONE[s.tone] ?? TONE.watch
                return (
                  <li
                    key={`${s.label}-${i}`}
                    className="rounded-xl p-3"
                    style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}
                  >
                    <div className="flex items-center gap-1.5">
                      <svg
                        className="h-3.5 w-3.5 shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke={tone.color}
                        strokeWidth={2}
                        aria-hidden
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d={tone.icon} />
                      </svg>
                      <span className="text-xs font-medium" style={{ color: 'var(--color-text)' }}>
                        {s.label}
                      </span>
                      <span className="sr-only">{tone.word}</span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                      {s.detail}
                    </p>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}
    </section>
  )
}
