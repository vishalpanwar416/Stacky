import {
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore'
import { getDb } from './firebase'
import type { Workspace, WorkspaceMember } from '../types'

const WORKSPACES = 'workspaces'
const MEMBERS = 'members'

export async function createWorkspace(
  data: Omit<Workspace, 'id' | 'createdAt' | 'updatedAt' | 'ownerId'> & { ownerId?: string },
  ownerId: string,
  ownerDisplayName?: string,
  ownerEmail?: string
): Promise<string> {
  const ref = await addDoc(collection(getDb(), WORKSPACES), {
    ...data,
    ownerId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  await setDoc(doc(getDb(), WORKSPACES, ref.id, MEMBERS, ownerId), {
    userId: ownerId,
    role: 'owner',
    joinedAt: serverTimestamp(),
    displayName: ownerDisplayName ?? null,
    email: ownerEmail ?? null,
  })
  return ref.id
}

export async function getWorkspace(id: string): Promise<Workspace | null> {
  const snap = await getDoc(doc(getDb(), WORKSPACES, id))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() } as Workspace
}

export async function getWorkspacesForUser(userId: string): Promise<Workspace[]> {
  const q = query(
    collection(getDb(), WORKSPACES),
    where('ownerId', '==', userId),
    orderBy('updatedAt', 'desc')
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Workspace))
}

export async function getWorkspacesWhereMember(userId: string): Promise<Workspace[]> {
  // Firestore doesn't support "where doc id in subcollection". So we need to query members subcollections or store member ids on workspace. For MVP, we only list workspaces where ownerId === userId. Later add workspace.memberIds array for "shared" workspaces.
  const q = query(
    collection(getDb(), WORKSPACES),
    where('ownerId', '==', userId),
    orderBy('updatedAt', 'desc')
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Workspace))
}

export async function updateWorkspace(
  id: string,
  data: Partial<Pick<Workspace, 'name' | 'slug' | 'visibility' | 'updatedAt'>>
) {
  await updateDoc(doc(getDb(), WORKSPACES, id), {
    ...data,
    updatedAt: serverTimestamp(),
  })
}

export async function deleteWorkspace(id: string) {
  const batch = writeBatch(getDb())
  const membersSnap = await getDocs(collection(getDb(), WORKSPACES, id, MEMBERS))
  membersSnap.docs.forEach((d) => batch.delete(d.ref))
  batch.delete(doc(getDb(), WORKSPACES, id))
  await batch.commit()
}

export async function getWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]> {
  const snap = await getDocs(collection(getDb(), WORKSPACES, workspaceId, MEMBERS))
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as WorkspaceMember))
}

export async function inviteMember(
  workspaceId: string,
  userId: string,
  displayName?: string,
  email?: string
) {
  const ref = doc(getDb(), WORKSPACES, workspaceId, MEMBERS, userId)
  const { setDoc } = await import('firebase/firestore')
  await setDoc(ref, {
    userId,
    role: 'member',
    joinedAt: serverTimestamp(),
    displayName: displayName ?? null,
    email: email ?? null,
  })
}
