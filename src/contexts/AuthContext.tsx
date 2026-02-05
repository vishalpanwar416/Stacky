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
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'
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
  connectGoogleCalendar: () => Promise<any>
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
    getRedirectResult(auth)
      .then((result) => {
        if (result?.user) {
          try {
            sessionStorage.setItem('stacky_show_welcome', '1')
          } catch { }
        }
      })
      .catch((err: unknown) => {
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
      try {
        setUser(firebaseUser)
        if (firebaseUser) {
          const db = getDb()
          const profileRef = doc(db, 'users', firebaseUser.uid)
          const snap = await getDoc(profileRef)
          const now = new Date()
          // Profile photo and name from Google (Firebase Auth) – keep Firestore in sync
          const googleProfile = {
            displayName: firebaseUser.displayName ?? '',
            email: firebaseUser.email ?? '',
            photoURL: firebaseUser.photoURL ?? null,
            updatedAt: now,
          }
          if (snap.exists()) {
            await updateDoc(profileRef, googleProfile)
            const existing = snap.data() as Record<string, unknown>
            setProfile({
              id: snap.id,
              ...existing,
              displayName: googleProfile.displayName,
              email: googleProfile.email,
              photoURL: googleProfile.photoURL ?? existing.photoURL ?? undefined,
              updatedAt: existing.updatedAt,
            } as UserProfile)
          } else {
            const newProfile: Omit<UserProfile, 'id'> = {
              ...googleProfile,
              photoURL: googleProfile.photoURL ?? undefined,
              createdAt: { toDate: () => now } as UserProfile['createdAt'],
              updatedAt: { toDate: () => now } as UserProfile['updatedAt'],
            }
            await setDoc(profileRef, {
              displayName: newProfile.displayName,
              email: newProfile.email,
              photoURL: newProfile.photoURL ?? null,
              createdAt: now,
              updatedAt: now,
            })
            setProfile({ id: firebaseUser.uid, ...newProfile } as UserProfile)
          }
        } else {
          setProfile(null)
        }
      } catch (err) {
        console.error('Auth profile load error:', err)
        setProfile(null)
      } finally {
        setLoading(false)
      }
    })
    // If Firebase Auth never fires (e.g. network), stop loading after 10s
    const timeout = setTimeout(() => setLoading(false), 10000)
    return () => {
      clearTimeout(timeout)
      unsub()
    }
  }, [])

  const signInWithGoogle = async () => {
    setAuthError(null)
    try {
      const authInstance = getAuth()
      const provider = new GoogleAuthProvider()
      await signInWithPopup(authInstance, provider)
      try {
        sessionStorage.setItem('stacky_show_welcome', '1')
      } catch { }
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

  const connectGoogleCalendar = async () => {
    setAuthError(null)
    try {
      const authInstance = getAuth()
      const provider = new GoogleAuthProvider()
      provider.addScope('https://www.googleapis.com/auth/calendar.events')
      const result = await signInWithPopup(authInstance, provider)
      const credential = GoogleAuthProvider.credentialFromResult(result)
      return credential
    } catch (err: unknown) {
      console.error('Calendar connect error:', err)
      throw err
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
        connectGoogleCalendar,
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
