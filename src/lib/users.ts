import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { getDb } from './firebase'
import type { UserProfile } from '../types'

export async function updateUserPreferences(
  userId: string,
  patch: NonNullable<UserProfile['preferences']>
): Promise<void> {
  const ref = doc(getDb(), 'users', userId)
  const snap = await getDoc(ref)
  const existing = snap.data()
  const currentPrefs = (existing?.preferences as UserProfile['preferences']) ?? {}
  await updateDoc(ref, {
    preferences: { ...currentPrefs, ...patch },
    updatedAt: serverTimestamp(),
  })
}
