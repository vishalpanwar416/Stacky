/**
 * Transactional email, via Resend.
 *
 * Sending is always best-effort: an invitation is a Firestore document, and the
 * email only tells someone it exists. So every failure here is reported back
 * rather than thrown — the caller decides what to say, and the invitation
 * stands either way. What must never happen is a silent failure, because the
 * inviter would believe someone was contacted when they were not.
 */

const ENDPOINT = 'https://api.resend.com/emails'

/**
 * Without a verified domain Resend only accepts its own shared sender, and will
 * deliver solely to the address that owns the account. Set RESEND_FROM once a
 * domain is verified at resend.com/domains.
 */
const FROM = process.env.RESEND_FROM ?? 'Stacky <onboarding@resend.dev>'

export type SendResult = { ok: true } | { ok: false; reason: string }

export async function sendEmail(input: {
  to: string
  subject: string
  html: string
  text: string
  replyTo?: string
}): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { ok: false, reason: 'Email is not configured on this deployment.' }

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
      }),
    })

    if (res.ok) return { ok: true }

    const body = (await res.json().catch(() => ({}))) as { message?: string }
    // Resend's own wording for the unverified-domain case is long and points at
    // its dashboard; say the operative part plainly instead.
    if (res.status === 403 && /only send testing emails/i.test(body.message ?? '')) {
      return {
        ok: false,
        reason:
          'This Resend key has no verified domain, so it can only email the account owner. Verify a domain at resend.com/domains to reach anyone else.',
      }
    }
    return { ok: false, reason: body.message ?? `Email provider returned ${res.status}.` }
  } catch (err) {
    console.error('sendEmail failed', err)
    return { ok: false, reason: 'Could not reach the email provider.' }
  }
}

const escape = (value: string) =>
  value.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!)
  )

/**
 * The invitation email. Deliberately plain: one sentence of context and one
 * link. Everything interpolated is escaped — workspace and inviter names are
 * user-supplied and end up inside markup.
 */
export function invitationEmail(input: {
  workspaceName: string
  inviterName: string | null
  appUrl: string
}) {
  const workspace = escape(input.workspaceName)
  const inviter = escape(input.inviterName ?? 'Someone')
  const subject = `${input.inviterName ?? 'Someone'} invited you to "${input.workspaceName}" on Stacky`

  const text = [
    `${input.inviterName ?? 'Someone'} invited you to join "${input.workspaceName}" on Stacky.`,
    '',
    `Sign in to accept: ${input.appUrl}`,
    '',
    'Stacky is a task tracker you can also drive from Claude. If you were not',
    'expecting this, you can ignore this email — nothing happens until you sign in.',
  ].join('\n')

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#0f0f11;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#17171a;border:1px solid #2a2a30;border-radius:16px;">
      <tr>
        <td style="padding:32px;">
          <p style="margin:0 0 24px;font-size:20px;font-weight:700;color:#fafafa;">Stacky</p>
          <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#fafafa;">
            <strong>${inviter}</strong> invited you to join
            <strong>${workspace}</strong>.
          </p>
          <p style="margin:0 0 28px;font-size:14px;line-height:1.6;color:#a1a1aa;">
            Sign in with the address this was sent to and the invitation will be waiting.
          </p>
          <a href="${input.appUrl}"
             style="display:inline-block;padding:12px 24px;background:#f97316;color:#0f0f11;font-size:14px;font-weight:600;text-decoration:none;border-radius:12px;">
            Accept invitation
          </a>
          <p style="margin:28px 0 0;font-size:12px;line-height:1.6;color:#71717a;">
            Not expecting this? Ignore the email — nothing happens until you sign in.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`

  return { subject, html, text }
}
