/**
 * Reconciles the two places membership is recorded.
 *
 * `memberIds` on the workspace is what isWorkspaceMember() checks, so it decides
 * access. The members subcollection is what the settings modal lists. The old
 * accept flow could write either without the other, so both directions drifted:
 *
 *   member row + accepted invitation, not in memberIds  → they joined and are
 *       locked out. Grant access; the invitation is the evidence.
 *   member row + pending invitation, not in memberIds   → the accept failed
 *       halfway. Drop the row; accepting recreates it properly.
 *
 * Anything else is reported and left alone — it needs a human.
 *
 *   node scripts/reconcile-members.mjs [--apply]
 */
import { db, FieldValue } from '../dist/firestore.js'

const apply = process.argv.includes('--apply')
let granted = 0
let pruned = 0
let flagged = 0

for (const ws of (await db.collection('workspaces').get()).docs) {
  const data = ws.data()
  const memberIds = data.memberIds ?? []
  const ownerId = data.ownerId

  const invites = await db.collection('invitations').where('workspaceId', '==', ws.id).get()

  for (const m of (await ws.ref.collection('members').get()).docs) {
    const uid = m.data().userId ?? m.id
    if (uid === ownerId || memberIds.includes(uid)) continue

    const email = String(m.data().email ?? '').toLowerCase()
    const matching = invites.docs.filter(
      (d) => String(d.data().invitedEmail ?? '').toLowerCase() === email
    )
    const accepted = matching.find((d) => d.data().status === 'accepted')
    const pending = matching.find((d) => d.data().status === 'pending')

    if (accepted) {
      console.log(`GRANT ${data.name} / ${email} — accepted ${accepted.id} but never given access`)
      if (apply) {
        await ws.ref.update({
          memberIds: FieldValue.arrayUnion(uid),
          updatedAt: FieldValue.serverTimestamp(),
        })
      }
      granted++
    } else if (pending) {
      console.log(`PRUNE ${data.name} / ${email} — ${pending.id} still pending, row written by a failed accept`)
      if (apply) await m.ref.delete()
      pruned++
    } else {
      console.log(`FLAG  ${data.name} / ${email} — member row with no invitation to explain it`)
      flagged++
    }
  }
}

const verb = apply ? ['granted', 'removed'] : ['would grant', 'would remove']
console.log(`\n${verb[0]} access to ${granted}, ${verb[1]} ${pruned} stale row(s)${flagged ? `, flagged ${flagged}` : ''}`)
if (!apply) console.log('dry run — re-run with --apply to write')
