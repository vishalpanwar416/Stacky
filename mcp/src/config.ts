import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

/**
 * The Stacky user the MCP server acts as. Everything it writes is attributed
 * to this uid, and every read is scoped to workspaces this uid can reach.
 *
 * This matters more than it looks: the Admin SDK bypasses firestore.rules
 * entirely, so this constant — not the rules — is what keeps the server out
 * of other people's workspaces.
 */
export const STACKY_USER_ID =
  process.env.STACKY_USER_ID ?? 'gG3YSXzLDJY5i6KSd8xVLFIxGv33' // vishalpanwar416@gmail.com

export const SERVICE_ACCOUNT_PATH = resolve(
  process.env.STACKY_SERVICE_ACCOUNT ?? join(here, '..', 'serviceAccountKey.json')
)

/** Firestore caps `in` / `array-contains-any` disjunctions; chunk below it. */
export const QUERY_CHUNK = 10
