/**
 * Repairs member rows that were stored without a name or email.
 *
 * The members subcollection denormalises identity, and the UI renders it
 * directly, so a null there shows as "Unknown User" forever. Anything missing
 * is refilled from the owning user's profile.
 *
 *   node scripts/backfill-members.mjs [--apply]
 */
import { db } from '../dist/firestore.js'

const apply = process.argv.includes('--apply')
const profiles = new Map()

async function profileFor(uid) {
  if (!profiles.has(uid)) {
    const snap = await db.collection('users').doc(uid).get()
    profiles.set(uid, snap.exists ? snap.data() : null)
  }
  return profiles.get(uid)
}

let repaired = 0
let unfixable = 0

for (const ws of (await db.collection('workspaces').get()).docs) {
  for (const member of (await ws.ref.collection('members').get()).docs) {
    const data = member.data()
    if (data.displayName && data.email) continue

    const profile = await profileFor(data.userId ?? member.id)
    const patch = {}
    if (!data.displayName && profile?.displayName) patch.displayName = profile.displayName
    if (!data.email && profile?.email) patch.email = profile.email

    if (Object.keys(patch).length === 0) {
      console.log(`SKIP  ${ws.data().name} / ${member.id} — no profile to copy from`)
      unfixable++
      continue
    }

    console.log(`FIX   ${ws.data().name} / ${member.id} → ${JSON.stringify(patch)}`)
    if (apply) await member.ref.update(patch)
    repaired++
  }
}

console.log(
  `\n${apply ? 'repaired' : 'would repair'} ${repaired} member row(s)` +
    (unfixable ? `, ${unfixable} left alone` : '')
)
if (!apply) console.log('dry run — re-run with --apply to write')
