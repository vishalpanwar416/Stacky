import { initializeApp } from 'firebase/app'
import { getAnalytics } from 'firebase/analytics'
import {
  getAuth as getFirebaseAuth,
  connectAuthEmulator,
  type Auth,
} from 'firebase/auth'
import {
  getFirestore,
  connectFirestoreEmulator,
  type Firestore,
} from 'firebase/firestore'
import type { FirebaseApp } from 'firebase/app'

const apiKey = import.meta.env.VITE_FIREBASE_API_KEY
const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID
const hasConfig =
  typeof apiKey === 'string' &&
  apiKey.length > 0 &&
  typeof projectId === 'string' &&
  projectId.length > 0

let app: FirebaseApp | null = null
let authInstance: Auth | null = null
let dbInstance: Firestore | null = null

if (hasConfig) {
  app = initializeApp({
    apiKey,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
  })
  authInstance = getFirebaseAuth(app)
  dbInstance = getFirestore(app)
  if (typeof window !== 'undefined' && import.meta.env.VITE_FIREBASE_MEASUREMENT_ID) {
    getAnalytics(app)
  }
  if (import.meta.env.DEV && import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true') {
    connectAuthEmulator(authInstance, 'http://127.0.0.1:9099')
    connectFirestoreEmulator(dbInstance, '127.0.0.1', 8080)
  }
}

export const isFirebaseConfigured = hasConfig

/** Use in app code when Firebase is configured (e.g. inside AuthProvider). Throws if not configured. */
export function getAuth(): Auth {
  if (!authInstance) throw new Error('Firebase not configured')
  return authInstance
}

/** Use in app code when Firebase is configured. Throws if not configured. */
export function getDb(): Firestore {
  if (!dbInstance) throw new Error('Firebase not configured')
  return dbInstance
}

export const auth = authInstance
export const db = dbInstance
export default app
