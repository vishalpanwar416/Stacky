import { collection, query, where, getDocs, limit, doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { getDb } from './firebase'
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

export async function getUserByEmail(email: string): Promise<UserProfile | null> {
  const q = query(
    collection(getDb(), USERS),
    where('email', '==', email),
    limit(1)
  )
  const snap = await getDocs(q)
  if (snap.empty) return null
  const d = snap.docs[0]
  return { id: d.id, ...d.data() } as UserProfile
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
