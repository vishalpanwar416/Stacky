/**
 * Switches invitation email over to a verified domain.
 *
 * Run this once the domain shows "Verified" in the Resend dashboard. It proves
 * the sender works before changing anything, so a half-finished DNS setup
 * cannot take the working configuration away: the current key can already email
 * the account owner, and pointing RESEND_FROM at an unverified domain would
 * break even that.
 *
 *   node scripts/set-email-domain.mjs vishalpanwar.in [test-recipient]
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const domain = process.argv[2]
const recipient = process.argv[3] ?? 'vishalpanwar416@gmail.com'
if (!domain) {
  console.error('usage: node scripts/set-email-domain.mjs <domain> [test-recipient]')
  process.exit(1)
}

const envPath = new URL('../../.env', import.meta.url)
const env = readFileSync(envPath, 'utf8')
const apiKey = env.split('\n').find((l) => l.startsWith('RESEND_API_KEY='))?.split('"')[1]
if (!apiKey) {
  console.error('RESEND_API_KEY is not in .env')
  process.exit(1)
}

const from = `Stacky <invites@${domain}>`

// --- prove it before adopting it ----------------------------------------
console.log(`testing ${from} -> ${recipient}`)
const res = await fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    from,
    to: [recipient],
    subject: 'Stacky email is live',
    html: '<p>Invitation email is now sending from your own domain. Nothing else to do.</p>',
    text: 'Invitation email is now sending from your own domain. Nothing else to do.',
  }),
})

if (!res.ok) {
  const body = await res.json().catch(() => ({}))
  console.error(`\nnot ready — Resend refused this sender (HTTP ${res.status})`)
  console.error(`  ${body.message ?? 'unknown error'}`)
  console.error('\nNothing was changed. Finish verifying the domain, then run this again.')
  process.exit(1)
}

console.log(`sent — check ${recipient}\n`)

// --- adopt it -------------------------------------------------------------
const next = env.includes('RESEND_FROM=')
  ? env.replace(/RESEND_FROM=.*/, `RESEND_FROM="${from}"`)
  : `${env.trimEnd()}\nRESEND_FROM="${from}"\n`
writeFileSync(envPath, next)
console.log('.env updated')

for (const target of ['production', 'preview', 'development']) {
  try {
    execFileSync('npx', ['vercel', 'env', 'rm', 'RESEND_FROM', target, '--yes'], {
      cwd: new URL('../../', import.meta.url).pathname,
      stdio: 'ignore',
    })
  } catch {
    // Not set yet; nothing to remove.
  }
  execFileSync('npx', ['vercel', 'env', 'add', 'RESEND_FROM', target], {
    cwd: new URL('../../', import.meta.url).pathname,
    input: from,
    stdio: ['pipe', 'ignore', 'ignore'],
  })
  console.log(`vercel ${target} updated`)
}

console.log('\nRedeploy for it to take effect:  npx vercel --prod')
console.log('Then invitations reach any address.')
