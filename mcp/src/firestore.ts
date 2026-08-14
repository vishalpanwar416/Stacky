import { readFileSync } from 'node:fs'
import { cert, initializeApp } from 'firebase-admin/app'
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore'

import { SERVICE_ACCOUNT_PATH } from './config.js'

function loadCredential() {
  try {
    return cert(JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, 'utf8')))
  } catch (err) {
    throw new Error(
      `Could not read the Firestore service account at ${SERVICE_ACCOUNT_PATH}. ` +
        'Set STACKY_SERVICE_ACCOUNT to its path, or regenerate it with:\n' +
        '  gcloud iam service-accounts keys create mcp/serviceAccountKey.json \\\n' +
        '    --iam-account=stacky-mcp@stacky-f7f42.iam.gserviceaccount.com\n' +
        `Original error: ${(err as Error).message}`
    )
  }
}

const app = initializeApp({ credential: loadCredential() })

export const db = getFirestore(app)
export { FieldValue, Timestamp }

/** Collection names, mirroring src/lib/*.ts in the web app. */
export const TASKS = 'tasks'
export const PROJECTS = 'projects'
export const WORKSPACES = 'workspaces'
export const COMMENTS = 'comments'
export const ACTIVITY = 'activity'
