/**
 * Fills in workspaceName / invitedByName on invitations written before those
 * fields existed. Without them the notification renders a raw user id.
 *
 *   node scripts/backfill-invitations.mjs [--apply]
 */
import { db } from '../dist/firestore.js'

const apply = process.argv.includes('--apply')
let n = 0

for (const d of (await db.collection('invitations').get()).docs) {
  const inv = d.data()
  if (inv.workspaceName && inv.invitedByName) continue

  const patch = {}
  if (!inv.workspaceName) {
    const ws = await db.collection('workspaces').doc(String(inv.workspaceId)).get()
    if (ws.exists) patch.workspaceName = ws.data().name ?? null
  }
  if (!inv.invitedByName) {
    const u = await db.collection('users').doc(String(inv.invitedBy)).get()
    if (u.exists) patch.invitedByName = u.data().displayName ?? null
  }
  if (!Object.keys(patch).length) continue

  console.log(`${d.id} (${inv.status}) → ${JSON.stringify(patch)}`)
  if (apply) await d.ref.update(patch)
  n++
}
console.log(`\n${apply ? 'updated' : 'would update'} ${n} invitation(s)`)
if (!apply) console.log('dry run — re-run with --apply')
