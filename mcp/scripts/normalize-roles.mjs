/**
 * Brings the role field on member rows in line with the new role set.
 *
 * The workspace's ownerId is the authority on ownership; some owner rows were
 * written with role 'member', which now renders the wrong badge and would offer
 * the owner a role selector for themselves. Anything unrecognised becomes
 * 'member', which is what the rules already assume for a missing value.
 *
 *   node scripts/normalize-roles.mjs [--apply]
 */
import { db } from '../dist/firestore.js'

const apply = process.argv.includes('--apply')
const VALID = ['owner', 'member', 'readonly']
let n = 0

for (const ws of (await db.collection('workspaces').get()).docs) {
  const ownerId = ws.data().ownerId
  for (const m of (await ws.ref.collection('members').get()).docs) {
    const uid = m.data().userId ?? m.id
    const current = m.data().role
    const want = uid === ownerId ? 'owner' : VALID.includes(current) && current !== 'owner' ? current : 'member'
    if (current === want) continue
    console.log(`${ws.data().name} / ${m.data().email ?? uid}: ${JSON.stringify(current)} -> ${want}`)
    if (apply) await m.ref.update({ role: want })
    n++
  }
}
console.log(`\n${apply ? 'updated' : 'would update'} ${n} row(s)`)
if (!apply) console.log('dry run — re-run with --apply')
