import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { getAuth, getDb } from './firebase'
import type { UserProfile } from '../types'

const USERS = 'users'

export async function updateUserPreferences(
  userId: string,
  preferences: Partial<NonNullable<UserProfile['preferences']>>
) {
  const userRef = doc(getDb(), USERS, userId)
  const updates: Record<string, any> = {
    updatedAt: serverTimestamp(),
  }

  Object.entries(preferences).forEach(([key, val]) => {
    updates[`preferences.${key}`] = val
  })

  await updateDoc(userRef, updates)
}

/**
 * Resolves an email to a user id, if that person has an account.
 *
 * Goes through the server rather than querying the users collection directly:
 * Firestore rules are per-document, so permitting this query would permit
 * reading any profile. The route returns an id and nothing else.
 */
export async function getUserByEmail(email: string): Promise<{ id: string } | null> {
  const user = getAuth().currentUser
  if (!user) return null
  const res = await fetch('/api/user-lookup', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await user.getIdToken()}`,
    },
    body: JSON.stringify({ email }),
  })
  if (!res.ok) return null
  const { userId } = await res.json()
  return userId ? { id: userId } : null
}

/*
 * searchUsers used to live here: a prefix query over displayName and email
 * across every user in the system, backing an invite typeahead. One keystroke
 * enumerated the directory, and it was the only reason the users collection had
 * to be readable by any signed-in account.
 *
 * It is gone rather than moved server-side, because a global directory search
 * leaks the same thing wherever it runs. Inviting works on an exact address —
 * which is how invitations were always addressed — via getUserByEmail above.
 */
