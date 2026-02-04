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
  signOut as firebaseSignOut,
  GoogleAuthProvider,
  type User,
} from 'firebase/auth'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { auth, db } from '../lib/firebase'
import type { UserProfile } from '../types'

interface AuthContextValue {
  user: User | null
  profile: UserProfile | null
  loading: boolean
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser)
      if (firebaseUser) {
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
    const provider = new GoogleAuthProvider()
    await signInWithPopup(auth, provider)
  }

  const signOut = async () => {
    await firebaseSignOut(auth)
  }

  return (
    <AuthContext.Provider
      value={{ user, profile, loading, signInWithGoogle, signOut }}
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
