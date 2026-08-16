/**
 * Publishes firestore.rules through the Firebase Rules REST API.
 *
 * firebase-tools cannot be used here: it calls serviceusage.services.use to
 * "ensure the API is enabled", which the service account is not granted, so it
 * fails before it ever reaches the rules. The Rules API itself works fine with
 * the same credentials.
 *
 *   node scripts/deploy-rules.mjs
 */
import { execFileSync, } from 'node:child_process'
import { readFileSync } from 'node:fs'

const PROJECT = 'stacky-f7f42'
const OWNER_ACCOUNT = process.env.RULES_ACCOUNT ?? 'vishalpanwar416@gmail.com'

// The stacky-mcp service account has Firestore data access but not
// firebaserules.rulesets.create, so publishing rules uses the project owner's
// own gcloud credentials. Granting the service account that permission would
// let anything holding the key rewrite the security rules — the opposite of
// what the key is for.
const token = execFileSync(
  'gcloud',
  ['auth', 'print-access-token', `--account=${OWNER_ACCOUNT}`],
  { encoding: 'utf8' }
).trim()

const source = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8')

const api = (path, init) =>
  fetch(`https://firebaserules.googleapis.com/v1/projects/${PROJECT}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Goog-User-Project': PROJECT,
    },
  })

// 1. Compile and store the ruleset. A syntax error fails here, before release.
const created = await api('/rulesets', {
  method: 'POST',
  body: JSON.stringify({
    source: { files: [{ name: 'firestore.rules', content: source }] },
  }),
})
const body = await created.json()
if (!created.ok) {
  console.error(`ruleset rejected (HTTP ${created.status})`)
  console.error(JSON.stringify(body, null, 2).slice(0, 2000))
  process.exit(1)
}
console.log(`compiled ruleset ${body.name.split('/').pop()}`)

// 2. Point the live release at it.
// releases.patch takes an UpdateReleaseRequest, not a bare Release.
const released = await api('/releases/cloud.firestore', {
  method: 'PATCH',
  body: JSON.stringify({
    release: { name: `projects/${PROJECT}/releases/cloud.firestore`, rulesetName: body.name },
    updateMask: 'rulesetName',
  }),
})
const relBody = await released.text()
if (!released.ok) {
  console.error(`release failed (HTTP ${released.status})`)
  console.error(relBody.slice(0, 1000))
  process.exit(1)
}
console.log('firestore.rules is live')
