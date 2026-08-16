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
  GithubAuthProvider,
  fetchSignInMethodsForEmail,
  linkWithCredential,
  linkWithPopup,
  unlink as firebaseUnlink,
  type User,
} from 'firebase/auth'
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'
import { auth, getAuth, getDb } from '../lib/firebase'
import {
  isCalendarConnected,
  clearCalendarStorage,
  connectCalendarWithCode,
  disconnectCalendar,
  buildGoogleOAuthUrl,
} from '../lib/googleCalendar'
import type { UserProfile } from '../types'

interface AuthContextValue {
  user: User | null
  profile: UserProfile | null
  loading: boolean
  signInWithGoogle: () => Promise<void>
  signInWithGoogleRedirect: () => Promise<void>
  signInWithGithub: () => Promise<void>
  linkGithub: () => Promise<void>
  unlinkProvider: (providerId: string) => Promise<void>
  signOut: () => Promise<void>
  authError: string | null
  clearAuthError: () => void
  connectGoogleCalendar: () => Promise<void>
  disconnectGoogleCalendar: () => Promise<void>
  calendarConnected: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)
  const [calendarConnected, setCalendarConnected] = useState(() => isCalendarConnected())

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
            // Backticks: this message contains both an apostrophe and double
            // quotes, so either quote style would have to be escaped.
            `Google sign-in is not configured. In Firebase Console → Authentication → Sign-in method, enable the Google provider and click Save. If you don't see Sign-in method, click "Get started" on the Authentication page first.`
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
          'Popup was blocked or failed. Use "Sign in with Google (redirect)" below instead.'
        )
      } else {
        setAuthError(message)
      }
    }
  }

  /**
   * GitHub sign-in.
   *
   * Two things need handling that Google never raises:
   *
   * A GitHub account can keep its address private, and this app is email-keyed
   * throughout — invitations are matched on it, and firestore.rules compares
   * against the token's email claim. So the `user:email` scope is requested and
   * sign-in is refused outright if no address comes back, rather than leaving
   * someone signed in but unable to receive or accept an invitation.
   *
   * And signing in with GitHub using an address already registered via Google
   * raises account-exists-with-different-credential. Left unhandled that reads
   * as "login is broken"; the GitHub credential is linked onto the existing
   * account instead, so one person keeps one identity and one set of workspaces.
   */
  const signInWithGithub = async () => {
    setAuthError(null)
    try {
      const authInstance = getAuth()
      const provider = new GithubAuthProvider()
      provider.addScope('user:email')
      const result = await signInWithPopup(authInstance, provider)

      if (!result.user.email) {
        await firebaseSignOut(authInstance)
        setAuthError(
          'Your GitHub account does not expose a verified email address, which Stacky needs to match invitations. Add one in GitHub email settings, or sign in with Google.'
        )
        return
      }
      try {
        sessionStorage.setItem('stacky_show_welcome', '1')
      } catch { }
    } catch (err: unknown) {
      const code = err && typeof err === 'object' && 'code' in err ? String((err as { code: string }).code) : ''
      const message = err instanceof Error ? err.message : String(err)

      if (code === 'auth/account-exists-with-different-credential') {
        const pending = GithubAuthProvider.credentialFromError(err as never)
        const email = (err as { customData?: { email?: string } }).customData?.email
        if (pending && email) {
          try {
            const methods = await fetchSignInMethodsForEmail(getAuth(), email)
            if (methods.includes('google.com')) {
              // Prove ownership through the provider that already holds the
              // address, then attach GitHub to that same account.
              const google = new GoogleAuthProvider()
              google.setCustomParameters({ login_hint: email })
              const existing = await signInWithPopup(getAuth(), google)
              await linkWithCredential(existing.user, pending)
              return
            }
          } catch (linkErr) {
            console.error('Could not link GitHub to the existing account:', linkErr)
          }
        }
        setAuthError(
          `${email ?? 'That address'} is already registered with a different sign-in method. Sign in that way first, then GitHub will be linked to it.`
        )
        return
      }

      console.error('GitHub sign-in error:', err)
      if (code === 'auth/popup-blocked' || code === 'auth/cancelled-popup-request') {
        setAuthError('The popup was blocked. Allow popups for this site and try again.')
      } else if (code === 'auth/operation-not-allowed') {
        setAuthError('GitHub sign-in is not enabled for this project.')
      } else {
        setAuthError(message)
      }
    }
  }

  /**
   * Attaches GitHub to the account that is already signed in.
   *
   * Distinct from signInWithGithub: that authenticates someone; this adds a
   * second way into an existing account. Using sign-in here would create a
   * separate account whenever the GitHub address differed from the Google one,
   * silently splitting a person's workspaces across two identities.
   */
  const linkGithub = async () => {
    const current = getAuth().currentUser
    if (!current) throw new Error('Sign in first.')
    const provider = new GithubAuthProvider()
    provider.addScope('user:email')
    try {
      await linkWithPopup(current, provider)
      setUser(getAuth().currentUser)
    } catch (err: unknown) {
      const code = err && typeof err === 'object' && 'code' in err ? String((err as { code: string }).code) : ''
      if (code === 'auth/credential-already-in-use') {
        throw new Error('That GitHub account is already linked to a different Stacky account.')
      }
      if (code === 'auth/provider-already-linked') {
        throw new Error('GitHub is already connected to this account.')
      }
      throw err instanceof Error ? err : new Error(String(err))
    }
  }

  /**
   * Removes a sign-in method. The last one is never removable — unlinking it
   * would leave an account nobody can get back into.
   */
  const unlinkProvider = async (providerId: string) => {
    const current = getAuth().currentUser
    if (!current) throw new Error('Sign in first.')
    if (current.providerData.length <= 1) {
      throw new Error('This is your only sign-in method, so it cannot be removed.')
    }
    await firebaseUnlink(current, providerId)
    setUser(getAuth().currentUser)
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

  /**
   * Open a Google OAuth popup to get an auth code, then exchange it server-side
   * for a refresh token. After this, tokens are refreshed automatically forever.
   */
  const connectGoogleCalendar = async () => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
    const redirectUri = import.meta.env.VITE_GOOGLE_REDIRECT_URI ?? `${window.location.origin}/gcal-callback`

    if (!clientId) {
      throw new Error('VITE_GOOGLE_CLIENT_ID is not set. Add it to your .env file.')
    }

    const oauthUrl = buildGoogleOAuthUrl(clientId, redirectUri)

    // Open a popup and wait for the redirect to bring back the code
    const code = await new Promise<string>((resolve, reject) => {
      const popup = window.open(oauthUrl, 'gcal-oauth', 'width=500,height=650,scrollbars=yes')
      if (!popup) {
        reject(new Error('Popup was blocked. Please allow popups for this site.'))
        return
      }

      const handler = (e: MessageEvent) => {
        if (e.origin !== window.location.origin) return
        if (e.data?.type !== 'gcal-oauth-code') return
        window.removeEventListener('message', handler)
        clearInterval(pollTimer)
        if (e.data.error) reject(new Error(e.data.error))
        else resolve(e.data.code)
      }
      window.addEventListener('message', handler)

      // Detect if the user closes the popup without completing
      const pollTimer = setInterval(() => {
        if (popup.closed) {
          clearInterval(pollTimer)
          window.removeEventListener('message', handler)
          reject(new Error('Google Calendar connection was cancelled.'))
        }
      }, 500)
    })

    // Exchange the code server-side
    const authInstance = getAuth()
    const idToken = await authInstance.currentUser?.getIdToken()
    if (!idToken) throw new Error('Not signed in')

    await connectCalendarWithCode(code, idToken)
    setCalendarConnected(true)
  }

  const disconnectGoogleCalendar = async () => {
    const authInstance = getAuth()
    const idToken = await authInstance.currentUser?.getIdToken()
    if (idToken) await disconnectCalendar(idToken)
    else clearCalendarStorage()
    setCalendarConnected(false)
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
        signInWithGithub,
        linkGithub,
        unlinkProvider,
        signOut,
        authError,
        clearAuthError,
        connectGoogleCalendar,
        disconnectGoogleCalendar,
        calendarConnected,
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
