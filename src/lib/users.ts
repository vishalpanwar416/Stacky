import { collection, query, where, getDocs, limit, doc, updateDoc, serverTimestamp } from 'firebase/firestore'
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

export async function searchUsers(searchTerm: string): Promise<UserProfile[]> {
  if (!searchTerm || searchTerm.length < 2) return []

  const db = getDb()
  const usersRef = collection(db, USERS)

  // Basic prefix search for displayName
  // Note: This is case-sensitive in Firestore.
  // To make it case-insensitive, we would need to store a lowercase version of the name.
  // For now, let's do a simple approach.

  const qByName = query(
    usersRef,
    where('displayName', '>=', searchTerm),
    where('displayName', '<=', searchTerm + '\uf8ff'),
    limit(5)
  )

  const qByEmail = query(
    usersRef,
    where('email', '>=', searchTerm),
    where('email', '<=', searchTerm + '\uf8ff'),
    limit(5)
  )

  const [snapName, snapEmail] = await Promise.all([
    getDocs(qByName),
    getDocs(qByEmail)
  ])

  const results = new Map<string, UserProfile>()

  snapName.docs.forEach(d => results.set(d.id, { id: d.id, ...d.data() } as UserProfile))
  snapEmail.docs.forEach(d => results.set(d.id, { id: d.id, ...d.data() } as UserProfile))

  return Array.from(results.values())
}
