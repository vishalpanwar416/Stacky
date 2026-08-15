import { FieldValue, db } from '../../mcp/src/firestore.js'

/**
 * Spend ceiling for the AI features, enforced here because it cannot be
 * enforced upstream: the OpenRouter key is an inference key, so it has no
 * authority to set its own limit (PATCH /api/v1/key is 404, and the key
 * management API rejects it). An account-level cap is a dashboard-only
 * control, which leaves the application as the place a limit can actually live.
 *
 * Accounting uses the cost OpenRouter reports on each response, not an
 * estimate, so the ledger reflects real spend rather than a guess at token
 * prices.
 */

const BUDGET = 'aiBudget'

/** Total spend allowed per day across all users, in USD. */
const DAILY_USD_LIMIT = Number(process.env.AI_DAILY_USD_LIMIT ?? '1')
/** Calls allowed per user per day — the backstop against one person looping. */
const USER_DAILY_CALLS = Number(process.env.AI_USER_DAILY_CALLS ?? '100')

const today = () => new Date().toISOString().slice(0, 10)

export interface BudgetVerdict {
  allowed: boolean
  reason?: string
  spentToday: number
}

/** Checked before every model call. Fails open so a ledger outage can't break the feature. */
export async function checkBudget(userId: string): Promise<BudgetVerdict> {
  try {
    const snap = await db.collection(BUDGET).doc(today()).get()
    const data = snap.exists ? (snap.data() as any) : {}
    const spent: number = data.spent ?? 0
    const userCalls: number = data.byUser?.[userId] ?? 0

    if (spent >= DAILY_USD_LIMIT) {
      return {
        allowed: false,
        spentToday: spent,
        reason: `The daily AI budget of $${DAILY_USD_LIMIT.toFixed(2)} is used up. It resets at midnight UTC.`,
      }
    }
    if (userCalls >= USER_DAILY_CALLS) {
      return {
        allowed: false,
        spentToday: spent,
        reason: `You have used today's ${USER_DAILY_CALLS} AI requests. They reset at midnight UTC.`,
      }
    }
    return { allowed: true, spentToday: spent }
  } catch (err) {
    // A budget read failing should not take the feature down; the per-call
    // token cap still bounds the damage.
    console.warn('Budget check unavailable, allowing the call:', err)
    return { allowed: true, spentToday: 0 }
  }
}

/** Records real spend after a call. Best effort — never fails the user's request. */
export async function recordSpend(userId: string, costUsd: number) {
  try {
    await db
      .collection(BUDGET)
      .doc(today())
      .set(
        {
          spent: FieldValue.increment(Number.isFinite(costUsd) ? costUsd : 0),
          calls: FieldValue.increment(1),
          byUser: { [userId]: FieldValue.increment(1) },
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      )
  } catch (err) {
    console.warn('Could not record AI spend:', err)
  }
}
