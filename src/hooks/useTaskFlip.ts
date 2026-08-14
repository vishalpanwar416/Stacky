import { useLayoutEffect, useRef } from 'react'

/**
 * FLIP animation for a task card moving between the queue and the in-progress
 * list.
 *
 * The two lists are separate DOM subtrees, so the card is unmounted from one
 * and mounted in the other — there is nothing for CSS to transition. Instead we
 * record where the card was before the move, and once React has painted it in
 * its new home we animate it from the old position back to the new one, so it
 * reads as the same object travelling across the dashboard.
 *
 * Call `capture(taskId)` immediately before triggering the status change.
 */

/** Give up on a capture that never resulted in a move. */
const STALE_AFTER_MS = 1500
/** Below this, the "move" is layout noise and not worth animating. */
const MIN_DISTANCE_PX = 4

function find(taskId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-flip-task="${CSS.escape(taskId)}"]`)
}

export function useTaskFlip(watch: unknown) {
  const pending = useRef<{ id: string; rect: DOMRect; at: number } | null>(null)

  function capture(taskId: string) {
    const el = find(taskId)
    if (el) pending.current = { id: taskId, rect: el.getBoundingClientRect(), at: Date.now() }
  }

  useLayoutEffect(() => {
    const p = pending.current
    if (!p) return

    const el = find(p.id)
    if (!el) {
      // Card is between lists, or filtered out entirely. Keep waiting, but
      // don't hold a stale capture forever.
      if (Date.now() - p.at > STALE_AFTER_MS) pending.current = null
      return
    }

    const next = el.getBoundingClientRect()
    const dx = p.rect.left - next.left
    const dy = p.rect.top - next.top

    if (Math.abs(dx) < MIN_DISTANCE_PX && Math.abs(dy) < MIN_DISTANCE_PX) {
      // Hasn't moved yet — this render was some other task update. Leave the
      // capture in place so the real move still animates.
      if (Date.now() - p.at > STALE_AFTER_MS) pending.current = null
      return
    }

    pending.current = null

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

    el.animate(
      [
        { transform: `translate(${dx}px, ${dy}px)`, opacity: 0.65 },
        { transform: 'translate(0, 0)', opacity: 1 },
      ],
      { duration: 420, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
    )
  }, [watch])

  return capture
}
