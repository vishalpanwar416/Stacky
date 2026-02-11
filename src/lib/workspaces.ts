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
    where('ownerId', '==', userId)
  )
  const snap = await getDocs(q)
  const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Workspace))
  list.sort((a, b) => {
    const aTime = a.updatedAt && typeof a.updatedAt.toMillis === 'function' ? a.updatedAt.toMillis() : 0
    const bTime = b.updatedAt && typeof b.updatedAt.toMillis === 'function' ? b.updatedAt.toMillis() : 0
    return bTime - aTime
  })
  return list
}

export async function getWorkspacesWhereMember(userId: string): Promise<Workspace[]> {
  const q = query(
    collection(getDb(), WORKSPACES),
    where('ownerId', '==', userId)
  )
  const snap = await getDocs(q)
  const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Workspace))
  list.sort((a, b) => {
    const aTime = a.updatedAt && typeof a.updatedAt.toMillis === 'function' ? a.updatedAt.toMillis() : 0
    const bTime = b.updatedAt && typeof b.updatedAt.toMillis === 'function' ? b.updatedAt.toMillis() : 0
    return bTime - aTime
  })
  return list
}

export async function updateWorkspace(
  id: string,
  data: Partial<Pick<Workspace, 'name' | 'slug' | 'description' | 'visibility' | 'updatedAt'>>
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
  await setDoc(ref, {
    userId,
    role: 'member',
    joinedAt: serverTimestamp(),
    displayName: displayName ?? null,
    email: email ?? null,
  })
}

const INVITATIONS = 'invitations'

export async function createInvitation(workspaceId: string, email: string, invitedBy: string) {
  const invitationsRef = collection(getDb(), INVITATIONS)
  // Check if invitation already exists?
  const q = query(
    invitationsRef,
    where('workspaceId', '==', workspaceId),
    where('invitedEmail', '==', email),
    where('status', '==', 'pending')
  )
  const existing = await getDocs(q)
  if (!existing.empty) {
    throw new Error('Invitation already pending for this email')
  }

  await addDoc(invitationsRef, {
    workspaceId,
    invitedEmail: email,
    status: 'pending',
    role: 'member',
    invitedBy,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

export async function getWorkspaceInvitations(workspaceId: string): Promise<any[]> {
  // Use 'any' or proper type if imported. I should import WorkspaceInvitation.
  // Actually, let's keep it simple and just return the data.
  // Ideally I should update imports to include WorkspaceInvitation.
  const q = query(
    collection(getDb(), INVITATIONS),
    where('workspaceId', '==', workspaceId),
    where('status', '==', 'pending')
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function getUserInvitations(email: string): Promise<any[]> {
  const q = query(
    collection(getDb(), INVITATIONS),
    where('invitedEmail', '==', email),
    where('status', '==', 'pending')
  )
  const snap = await getDocs(q)

  // We ideally need workspace details too. 
  // For now, let's just return the invitation data. 
  // The UI can fetch workspace details if needed, or we can enrich it here.
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function acceptInvitation(invitationId: string, userId: string, displayName?: string) {
  const invRef = doc(getDb(), INVITATIONS, invitationId)
  const invSnap = await getDoc(invRef)
  if (!invSnap.exists()) throw new Error('Invitation not found')

  const invData = invSnap.data()
  if (invData.status !== 'pending') throw new Error('Invitation is no longer pending')

  // Add member to workspace
  await inviteMember(invData.workspaceId, userId, displayName, invData.invitedEmail)

  // Update invitation status
  await updateDoc(invRef, {
    status: 'accepted',
    updatedAt: serverTimestamp()
  })

  return invData.workspaceId
}

export async function declineInvitation(invitationId: string) {
  await updateDoc(doc(getDb(), INVITATIONS, invitationId), {
    status: 'declined',
    updatedAt: serverTimestamp()
  })
}
