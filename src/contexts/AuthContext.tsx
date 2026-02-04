import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut as firebaseSignOut,
  GoogleAuthProvider,
  type User,
} from 'firebase/auth'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { auth, getAuth, getDb } from '../lib/firebase'
import type { UserProfile } from '../types'

interface AuthContextValue {
  user: User | null
  profile: UserProfile | null
  loading: boolean
  signInWithGoogle: () => Promise<void>
  signInWithGoogleRedirect: () => Promise<void>
  signOut: () => Promise<void>
  authError: string | null
  clearAuthError: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)

  useEffect(() => {
    if (!auth) {
      setLoading(false)
      return
    }
    // Consume redirect result when returning from Google sign-in (avoids "action invalid" popup issues)
    getRedirectResult(auth).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err)
      const code = err && typeof err === 'object' && 'code' in err ? String((err as { code: string }).code) : ''
      if (code === 'auth/configuration-not-found' || msg.includes('configuration-not-found')) {
        setAuthError(
          'Google sign-in is not configured. In Firebase Console → Authentication → Sign-in method, enable the Google provider and click Save. If you don’t see Sign-in method, click “Get started” on the Authentication page first.'
        )
      } else {
        setAuthError(msg)
      }
    })
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser)
      if (firebaseUser) {
        const db = getDb()
        const profileRef = doc(db, 'users', firebaseUser.uid)
        const snap = await getDoc(profileRef)
        if (snap.exists()) {
          setProfile({ id: snap.id, ...snap.data() } as UserProfile)
        } else {
          const now = new Date()
          const newProfile: Omit<UserProfile, 'id'> = {
            displayName: firebaseUser.displayName ?? '',
            email: firebaseUser.email ?? '',
            photoURL: firebaseUser.photoURL ?? undefined,
            createdAt: { toDate: () => now } as UserProfile['createdAt'],
            updatedAt: { toDate: () => now } as UserProfile['updatedAt'],
          }
          await setDoc(profileRef, {
            ...newProfile,
            createdAt: now,
            updatedAt: now,
          })
          setProfile({ id: firebaseUser.uid, ...newProfile } as UserProfile)
        }
      } else {
        setProfile(null)
      }
      setLoading(false)
    })
    return () => unsub()
  }, [])

  const signInWithGoogle = async () => {
    setAuthError(null)
    try {
      const authInstance = getAuth()
      const provider = new GoogleAuthProvider()
      await signInWithPopup(authInstance, provider)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      const code = err && typeof err === 'object' && 'code' in err ? String((err as { code: string }).code) : ''
      console.error('Sign-in error:', err)
      if (
        code === 'auth/configuration-not-found' ||
        message.includes('configuration-not-found')
      ) {
        setAuthError(
          'Google sign-in not configured. Firebase Console → Authentication → Sign-in method → enable Google and Save.'
        )
      } else if (
        code === 'auth/popup-blocked' ||
        code === 'auth/cancelled-popup-request' ||
        message.includes('requested action is invalid') ||
        message.includes('redirect_uri')
      ) {
        setAuthError(
          'Popup was blocked or failed. Use “Sign in with Google (redirect)” below instead.'
        )
      } else {
        setAuthError(message)
      }
    }
  }

  const signInWithGoogleRedirect = async () => {
    setAuthError(null)
    try {
      const authInstance = getAuth()
      const provider = new GoogleAuthProvider()
      await signInWithRedirect(authInstance, provider)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('Redirect sign-in error:', err)
      setAuthError(message)
    }
  }

  const clearAuthError = () => setAuthError(null)

  const signOut = async () => {
    const authInstance = getAuth()
    await firebaseSignOut(authInstance)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        signInWithGoogle,
        signInWithGoogleRedirect,
        signOut,
        authError,
        clearAuthError,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
