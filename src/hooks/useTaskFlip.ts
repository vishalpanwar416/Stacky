import { useLayoutEffect, useRef } from 'react'

/**
 * FLIP animation for task cards when one moves between the queue and the
 * in-progress list.
 *
 * The two lists are separate DOM subtrees, so the moved card is unmounted from
 * one and mounted in the other — there is nothing for CSS to transition.
 *
 * Every visible card is measured, not just the one that moved: when a card
 * leaves the queue the cards below it close the gap, and the in-progress list
 * makes room. Animating only the travelling card leaves it gliding through a
 * layout that snapped instantly around it, which is what reads as janky.
 *
 * Call `capture(taskId)` immediately before triggering the status change.
 */

/** Give up on a capture that never resulted in a move. */
const STALE_AFTER_MS = 1500
/** Below this, a "move" is layout noise and not worth animating. */
const MIN_DISTANCE_PX = 4

const DURATION_MS = 380
/** Overshoot-free ease-out: fast to leave, gentle to land. */
const EASING = 'cubic-bezier(0.22, 1, 0.36, 1)'

function allCards(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-flip-task]'))
}

function cardFor(taskId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-flip-task="${CSS.escape(taskId)}"]`)
}

export function useTaskFlip(watch: unknown) {
  const pending = useRef<{ primary: string; rects: Map<string, DOMRect>; at: number } | null>(null)

  function capture(taskId: string) {
    const rects = new Map<string, DOMRect>()
    for (const el of allCards()) {
      const id = el.dataset.flipTask
      if (id) rects.set(id, el.getBoundingClientRect())
    }
    if (rects.has(taskId)) pending.current = { primary: taskId, rects, at: Date.now() }
  }

  useLayoutEffect(() => {
    const p = pending.current
    if (!p) return

    const expire = () => {
      if (Date.now() - p.at > STALE_AFTER_MS) pending.current = null
    }

    const primaryEl = cardFor(p.primary)
    // Card is mid-transit between lists, or filtered out entirely.
    if (!primaryEl) return expire()

    const primaryBefore = p.rects.get(p.primary)!
    const primaryNow = primaryEl.getBoundingClientRect()
    const movedFar =
      Math.abs(primaryBefore.left - primaryNow.left) >= MIN_DISTANCE_PX ||
      Math.abs(primaryBefore.top - primaryNow.top) >= MIN_DISTANCE_PX

    // This render was some other task's update — keep the capture so the real
    // move still animates when it lands.
    if (!movedFar) return expire()

    pending.current = null

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

    for (const el of allCards()) {
      const id = el.dataset.flipTask
      if (!id) continue
      const before = p.rects.get(id)
      if (!before) continue // newly rendered card, nothing to animate from

      const now = el.getBoundingClientRect()
      const dx = before.left - now.left
      const dy = before.top - now.top
      if (Math.abs(dx) < MIN_DISTANCE_PX && Math.abs(dy) < MIN_DISTANCE_PX) continue

      const isPrimary = id === p.primary

      // The travelling card crosses over its neighbours, so lift it while in
      // flight rather than letting it slide underneath them.
      if (isPrimary) el.style.zIndex = '20'

      const anim = el.animate(
        [
          { transform: `translate(${dx}px, ${dy}px)`, ...(isPrimary ? { opacity: 0.7 } : null) },
          { transform: 'translate(0, 0)', ...(isPrimary ? { opacity: 1 } : null) },
        ],
        {
          duration: isPrimary ? DURATION_MS : Math.round(DURATION_MS * 0.8),
          easing: EASING,
        }
      )

      if (isPrimary) {
        anim.finished.catch(() => {}).finally(() => {
          el.style.zIndex = ''
        })
      }
    }
  }, [watch])

  return capture
}
