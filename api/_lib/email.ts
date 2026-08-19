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

/** Do the From and Reply-To addresses sit on the same domain? */
function sameDomain(from: string, replyTo: string): boolean {
  const domainOf = (value: string) => value.match(/@([^>\s]+)/)?.[1]?.toLowerCase() ?? ''
  const a = domainOf(from)
  const b = domainOf(replyTo)
  return !!a && a === b
}

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
        // Reply-To is only set when it shares the sending domain.
        //
        // Pointing it at the inviter's personal address looked helpful and cost
        // 2.7 SpamAssassin points: a branded From with a freemail Reply-To is a
        // phishing signature (FREEMAIL_FORGED_REPLYTO), and it was the single
        // largest reason invitations were landing in spam. The inviter's address
        // is still in the body, where it informs without impersonating.
        ...(input.replyTo && sameDomain(FROM, input.replyTo)
          ? { reply_to: input.replyTo }
          : {}),
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
 * The invitation email.
 *
 * Built as nested tables with inline styles, because that is what email clients
 * actually render — flexbox, grid and <style> blocks are unreliable across
 * Outlook and Gmail. Two constraints shape the rest:
 *
 * Images are blocked by default in most clients, so the logo is decorative: the
 * "Stacky" wordmark beside it is live text, and the mail reads completely with
 * every image suppressed. SVG is stripped outright, hence a hosted PNG.
 *
 * Everything interpolated is escaped — workspace names, member names and roles
 * are user-supplied and land inside markup.
 */
export function invitationEmail(input: {
  workspaceName: string
  inviterName: string | null
  inviterEmail?: string | null
  role?: string
  appUrl: string
}) {
  const workspace = escape(input.workspaceName)
  const inviter = escape(input.inviterName ?? 'Someone')
  const inviterEmail = input.inviterEmail ? escape(input.inviterEmail) : null
  const roleLabel = escape(
    input.role === 'readonly' ? 'Read only' : input.role === 'owner' ? 'Owner' : 'Member'
  )
  const subject = `${input.inviterName ?? 'Someone'} invited you to "${input.workspaceName}" on Stacky`

  const text = [
    `${input.inviterName ?? 'Someone'} invited you to join "${input.workspaceName}" on Stacky.`,
    inviterEmail ? `Invited by: ${input.inviterName ?? 'Someone'} <${inviterEmail}>` : '',
    `Your access: ${input.role === 'readonly' ? 'Read only — you can see everything and change nothing' : 'Member — full access to the workspace'}`,
    '',
    `Accept: ${input.appUrl}`,
    '',
    'Stacky is a task tracker with a queue you pull one task from at a time, an',
    'overview that summarises where work stands, and an MCP server so Claude can',
    'file and close tasks while you work.',
    '',
    'Sign in with this email address and the invitation will be waiting.',
    'Not expecting this? Ignore it — nothing happens until you sign in.',
  ]
    .filter(Boolean)
    .join('\n')

  const detail = (label: string, value: string) => `
              <tr>
                <td style="padding:0 0 10px;font-size:13px;color:#8b8b93;width:96px;" valign="top">${label}</td>
                <td style="padding:0 0 10px;font-size:13px;color:#e4e4e7;" valign="top">${value}</td>
              </tr>`

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:24px 12px;background:#0f0f11;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr><td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:540px;background:#17171a;border:1px solid #2a2a30;border-radius:16px;">

          <tr>
            <td style="padding:28px 32px 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding-right:10px;" valign="middle">
                    <img src="${input.appUrl}/stacky-logo.png" width="28" height="28" alt=""
                         style="display:block;border:0;outline:none;text-decoration:none;" />
                  </td>
                  <td valign="middle">
                    <span style="font-size:19px;font-weight:700;color:#fafafa;letter-spacing:-0.02em;">Stacky</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:24px 32px 0;">
              <p style="margin:0 0 8px;font-size:19px;line-height:1.45;color:#fafafa;font-weight:600;">
                ${inviter} invited you to ${workspace}
              </p>
              <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#a1a1aa;">
                Sign in with this address and the invitation will be waiting for you.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:0 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
                     style="background:#1e1e22;border:1px solid #2a2a30;border-radius:12px;">
                <tr><td style="padding:16px 18px 6px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                    ${detail('Workspace', workspace)}
                    ${detail('Invited by', inviterEmail ? `${inviter} &middot; ${inviterEmail}` : inviter)}
                    ${detail('Your access', roleLabel)}
                  </table>
                </td></tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:24px 32px 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="background:#f97316;border-radius:12px;">
                  <a href="${input.appUrl}"
                     style="display:inline-block;padding:13px 28px;font-size:14px;font-weight:600;color:#0f0f11;text-decoration:none;">
                    Accept invitation
                  </a>
                </td></tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:26px 32px 0;">
              <div style="height:1px;background:#2a2a30;line-height:1px;font-size:0;">&nbsp;</div>
            </td>
          </tr>

          <tr>
            <td style="padding:20px 32px 4px;">
              <p style="margin:0 0 12px;font-size:12px;font-weight:600;color:#8b8b93;text-transform:uppercase;letter-spacing:0.06em;">
                What you are joining
              </p>
              <p style="margin:0 0 8px;font-size:13px;line-height:1.65;color:#a1a1aa;">
                <strong style="color:#e4e4e7;">A queue, not a backlog.</strong>
                Pull one task into progress at a time and let the timer run.
              </p>
              <p style="margin:0 0 8px;font-size:13px;line-height:1.65;color:#a1a1aa;">
                <strong style="color:#e4e4e7;">An overview that explains itself.</strong>
                A plain-language read on what is stalling and what changed.
              </p>
              <p style="margin:0 0 4px;font-size:13px;line-height:1.65;color:#a1a1aa;">
                <strong style="color:#e4e4e7;">Claude can work the board.</strong>
                An MCP server lets it file and close tasks while you build.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:22px 32px 28px;">
              <p style="margin:0;font-size:11px;line-height:1.6;color:#71717a;">
                Sent by Stacky &middot; <a href="${input.appUrl}" style="color:#71717a;text-decoration:underline;">${input.appUrl.replace(/^https?:\/\//, '')}</a><br />
                You received this because ${inviter} entered this address. Not expecting it?
                Ignore this email &mdash; nothing happens until you sign in.
              </p>
            </td>
          </tr>

        </table>
      </td></tr>
    </table>
  </body>
</html>`

  return { subject, html, text }
}
