# Firebase Admin (server-side)

Use this only in Node scripts or backends. **Never** in the React frontend.

## First-time: enable Firestore API

If you see `Cloud Firestore API has not been used...`, enable it once:

https://console.developers.google.com/apis/api/firestore.googleapis.com/overview?project=stacky-f7f42

(Or in Firebase Console: create a Firestore database if you haven’t already.)

## Setup

1. Service account key is at `server/serviceAccountKey.json` (already copied from your Downloads).
2. From project root run: `npm install` then `npm run server:example`.

## Run example

```bash
# From project root (uses server/serviceAccountKey.json)
npm run server:example
```

Or with a custom key path:

```bash
FIREBASE_SERVICE_ACCOUNT_PATH=/path/to/your-key.json node server/example-usage.mjs
```

## Use in your own script

```javascript
import { db, auth } from './firebase-admin.js';

// e.g. Firestore
const snap = await db.collection('workspaces').get();

// e.g. verify ID token from frontend
const decoded = await auth.verifyIdToken(idToken);
```
