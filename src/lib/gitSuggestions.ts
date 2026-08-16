import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore'

import { getAuth, getDb } from './firebase'
import { updateTask } from './tasks'
import type { TaskStatus } from '../types'

/**
 * Status changes proposed by the GitHub webhook when a push or pull request
 * looks related to a task.
 *
 * Nothing here moves a task on its own. The webhook writes suggestions and a
 * person accepts them, for the same reason priority suggestions ask first: code
 * that appears to close a task frequently does not, and a board that quietly
 * marks work done is worse than one that never noticed.
 */

const COLLECTION = 'gitSuggestions'

export interface GitSuggestion {
  id: string
  workspaceId: string
  taskId: string
  taskTitle: string
  currentStatus: TaskStatus
  suggestedStatus: TaskStatus
  confidence: 'high' | 'medium' | 'low'
  reason: string
  source: {
    kind: 'push' | 'pull_request'
    title: string
    branch: string
    author: string
    url: string
    merged: boolean
  }
  status: 'pending' | 'applied' | 'dismissed'
}

export function subscribeGitSuggestions(
  workspaceId: string,
  callback: (suggestions: GitSuggestion[]) => void
): Unsubscribe {
  const q = query(
    collection(getDb(), COLLECTION),
    where('workspaceId', '==', workspaceId),
    where('status', '==', 'pending')
  )
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as GitSuggestion)),
    (err) => {
      console.error('Git suggestions subscription error:', err)
      callback([])
    }
  )
}

async function resolve(id: string, status: 'applied' | 'dismissed') {
  const uid = getAuth().currentUser?.uid
  await updateDoc(doc(getDb(), COLLECTION, id), {
    status,
    resolvedBy: uid ?? null,
    resolvedAt: serverTimestamp(),
  })
}

/**
 * Moves the task, then records the decision. In that order: if the status
 * change is refused, the suggestion stays pending rather than being marked
 * applied for a move that never happened.
 */
export async function applyGitSuggestion(suggestion: GitSuggestion) {
  const uid = getAuth().currentUser?.uid
  if (!uid) throw new Error('Sign in first.')
  await updateTask(suggestion.taskId, { status: suggestion.suggestedStatus }, uid)
  await resolve(suggestion.id, 'applied')
}

export const dismissGitSuggestion = (suggestion: GitSuggestion) =>
  resolve(suggestion.id, 'dismissed')
