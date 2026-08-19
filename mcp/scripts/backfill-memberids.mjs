/**
 * Rebuilds memberIds from the members subcollection.
 *
 * memberIds is what isWorkspaceMember() checks, so it decides access, while the
 * members subcollection is what the UI lists. Some workspaces were created by a
 * path that never populated memberIds at all. Access still worked because the
 * rules test ownerId first, but anything trusting memberIds alone — the
 * workspace list query, the invite route's "already a member" check — saw an
 * empty workspace.
 *
 *   node scripts/backfill-memberids.mjs [--apply]
 */
import { db } from '../dist/firestore.js'

const apply = process.argv.includes('--apply')
let fixed = 0

for (const ws of (await db.collection('workspaces').get()).docs) {
  const data = ws.data()
  const current = data.memberIds ?? []
  const rows = (await ws.ref.collection('members').get()).docs.map((d) => d.data().userId ?? d.id)

  // The owner is a member of their own workspace whether or not a row exists.
  const want = [...new Set([data.ownerId, ...rows].filter(Boolean))]
  const missing = want.filter((id) => !current.includes(id))
  if (missing.length === 0) continue

  console.log(`${(data.name ?? ws.id).padEnd(20)} ${current.length} -> ${want.length}  (adding ${missing.length})`)
  if (apply) await ws.ref.update({ memberIds: want })
  fixed++
}

console.log(`\n${apply ? 'updated' : 'would update'} ${fixed} workspace(s)`)
if (!apply) console.log('dry run — re-run with --apply')
