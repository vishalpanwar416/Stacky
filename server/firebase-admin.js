/**
 * Firebase Admin SDK – server-side only.
 * Never use this or the service account key in the frontend.
 */
import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const serviceAccountPath =
  process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
  join(__dirname, 'serviceAccountKey.json');

let app;
try {
  const key = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
  app = admin.initializeApp({ credential: admin.credential.cert(key) });
} catch (e) {
  console.error(
    'Firebase Admin init failed. Set FIREBASE_SERVICE_ACCOUNT_PATH or add server/serviceAccountKey.json'
  );
  throw e;
}

export const auth = app.auth();
export const db = app.firestore();
export default app;
