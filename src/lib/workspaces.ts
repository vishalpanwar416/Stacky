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
  onSnapshot,
} from 'firebase/firestore'
import type { Unsubscribe } from 'firebase/firestore'
import { getAuth, getDb } from './firebase'
import { createNotification } from './notifications'
import type { WorkspaceRole, Workspace, WorkspaceMember } from '../types'

const WORKSPACES = 'workspaces'
const MEMBERS = 'members'

export async function createWorkspace(
  data: Omit<Workspace, 'id' | 'createdAt' | 'updatedAt' | 'ownerId' | 'memberIds'> & { ownerId?: string },
  ownerId: string,
  ownerDisplayName?: string,
  ownerEmail?: string
): Promise<string> {
  const ref = await addDoc(collection(getDb(), WORKSPACES), {
    ...data,
    ownerId,
    memberIds: [ownerId],
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
  const ownedQ = query(
    collection(getDb(), WORKSPACES),
    where('ownerId', '==', userId)
  )

  const memberQ = query(
    collection(getDb(), WORKSPACES),
    where('memberIds', 'array-contains', userId)
  )

  console.log('Fetching workspaces for:', userId)

  try {
    const ownedSnap = await getDocs(ownedQ).catch(err => {
      console.error('Owned query failed:', err)
      return { docs: [] } as any
    })

    const memberSnap = await getDocs(memberQ).catch(err => {
      console.error('Member query failed:', err)
      return { docs: [] } as any
    })

    const ownedList = ownedSnap.docs.map((d: any) => ({ id: d.id, ...d.data() } as Workspace))
    const memberList = memberSnap.docs.map((d: any) => ({ id: d.id, ...d.data() } as Workspace))

    const map = new Map<string, Workspace>()
    ownedList.forEach((w: Workspace) => map.set(w.id, w))
    memberList.forEach((w: Workspace) => map.set(w.id, w))

    const list = Array.from(map.values())
    list.sort((a, b) => {
      const aTime = a.updatedAt && typeof a.updatedAt.toMillis === 'function' ? a.updatedAt.toMillis() : 0
      const bTime = b.updatedAt && typeof b.updatedAt.toMillis === 'function' ? b.updatedAt.toMillis() : 0
      return bTime - aTime
    })

    console.log(`Found ${list.length} workspaces (${ownedList.length} owned, ${memberList.length} joined)`)
    return list
  } catch (err) {
    console.error('Unexpected error in getWorkspacesForUser:', err)
    return []
  }
}

export function subscribeWorkspaces(userId: string, callback: (workspaces: Workspace[]) => void): Unsubscribe {
  const ownedQ = query(
    collection(getDb(), WORKSPACES),
    where('ownerId', '==', userId)
  )

  const memberQ = query(
    collection(getDb(), WORKSPACES),
    where('memberIds', 'array-contains', userId)
  )

  let ownedList: Workspace[] = []
  let memberList: Workspace[] = []
  // Two independent listeners feed one merged list. Emitting after the first
  // one resolves publishes a list that is missing every workspace the other
  // query would have supplied — for a user whose workspaces come from
  // membership rather than ownership, that is all of them. Wait for both.
  let ownedReady = false
  let memberReady = false

  const update = () => {
    if (!ownedReady || !memberReady) return
    const map = new Map<string, Workspace>()
    ownedList.forEach((w) => map.set(w.id, w))
    memberList.forEach((w) => map.set(w.id, w))

    const list = Array.from(map.values())
    list.sort((a, b) => {
      const aTime = a.updatedAt && typeof a.updatedAt.toMillis === 'function' ? a.updatedAt.toMillis() : 0
      const bTime = b.updatedAt && typeof b.updatedAt.toMillis === 'function' ? b.updatedAt.toMillis() : 0
      return bTime - aTime
    })
    callback(list)
  }

  const unsubOwned = onSnapshot(ownedQ, (snap) => {
    ownedList = snap.docs.map(d => ({ id: d.id, ...d.data() } as Workspace))
    ownedReady = true
    update()
  }, (err) => {
    console.error('Owned workspaces subscription error:', err)
    ownedList = []
    ownedReady = true
    update()
  })

  const unsubMember = onSnapshot(memberQ, (snap) => {
    memberList = snap.docs.map(d => ({ id: d.id, ...d.data() } as Workspace))
    memberReady = true
    update()
  }, (err) => {
    console.error('Member workspaces subscription error:', err)
    memberList = []
    memberReady = true
    update()
  })

  return () => {
    unsubOwned()
    unsubMember()
  }
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

/**
 * Changes a member's role. Owner-only, enforced by firestore.rules — this
 * function failing with a permission error is the rule doing its job.
 *
 * The owner's own role is not changeable: ownership is the workspaces document's
 * ownerId, not this field, so demoting it here would misreport rather than
 * remove their access.
 */
export async function updateMemberRole(
  workspaceId: string,
  userId: string,
  role: Exclude<WorkspaceRole, 'owner'>
) {
  await updateDoc(doc(getDb(), WORKSPACES, workspaceId, MEMBERS, userId), {
    role,
    updatedAt: serverTimestamp(),
  })
}

/**
 * Removes someone from a workspace, or removes yourself.
 *
 * Server-side: membership lives in `memberIds`, which only the owner may write,
 * so a member has no way to leave from the client. The server also unassigns
 * the person from that workspace's tasks — an assignee keeps access to their
 * task regardless of membership, so removal without it would be cosmetic.
 */
export async function removeMember(
  workspaceId: string,
  userId?: string
): Promise<{ workspaceName: string | null; unassignedTasks: number }> {
  const user = getAuth().currentUser
  if (!user) throw new Error('Sign in first.')

  const res = await fetch('/api/remove-member', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await user.getIdToken()}`,
    },
    body: JSON.stringify({ workspaceId, userId: userId ?? user.uid }),
  })
  const payload = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(payload.error ?? 'Could not complete the removal.')
  return payload
}

/** Leaving is removing yourself. */
export const leaveWorkspace = (workspaceId: string) => removeMember(workspaceId)

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

export interface InviteResult {
  invitationId: string
  /** False when the invitation was created but no email went out. */
  emailed: boolean
  emailError: string | null
  hasAccount: boolean
}

/**
 * Invites someone to a workspace and emails them.
 *
 * Runs on the server: an invitee without an account cannot be notified in-app,
 * so until this existed they were never told anything. The server also owns the
 * duplicate check and the permission check, since it writes with the Admin SDK.
 */
export async function createInvitation(
  workspaceId: string,
  email: string,
  _invitedBy?: string,
  _invitedByName?: string
): Promise<InviteResult> {
  const user = getAuth().currentUser
  if (!user) throw new Error('Sign in first.')

  const res = await fetch('/api/invite', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await user.getIdToken()}`,
    },
    body: JSON.stringify({ workspaceId, email: email.toLowerCase().trim() }),
  })
  const payload = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(payload.error ?? 'Could not send the invitation.')
  return payload as InviteResult
}

export function subscribeUserInvitations(email: string, callback: (invites: any[]) => void): Unsubscribe {
  const normalizedEmail = email.toLowerCase().trim()
  const q = query(
    collection(getDb(), INVITATIONS),
    where('invitedEmail', '==', normalizedEmail),
    where('status', '==', 'pending')
  )

  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  }, (err) => {
    console.error('Invitations subscription error:', err)
    callback([])
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
  const normalizedEmail = email.toLowerCase().trim()
  const q = query(
    collection(getDb(), INVITATIONS),
    where('invitedEmail', '==', normalizedEmail),
    where('status', '==', 'pending')
  )
  const snap = await getDocs(q)

  // We ideally need workspace details too. 
  // For now, let's just return the invitation data. 
  // The UI can fetch workspace details if needed, or we can enrich it here.
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function acceptInvitation(invitationId: string, _userId?: string, _displayName?: string) {
  // Joining requires writing the workspace's memberIds, which only its owner
  // may do — and must stay that way, or anyone could add themselves to any
  // workspace. The server holds an identity the rules trust and applies every
  // write in one batch, so acceptance can no longer half-succeed.
  const user = getAuth().currentUser
  if (!user) throw new Error('Sign in first.')

  const res = await fetch('/api/accept-invite', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await user.getIdToken()}`,
    },
    body: JSON.stringify({ invitationId }),
  })
  const payload = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(payload.error ?? 'Could not accept the invitation.')
  return payload.workspaceId as string
}

export async function declineInvitation(invitationId: string) {
  const invRef = doc(getDb(), INVITATIONS, invitationId)
  const invSnap = await getDoc(invRef)
  if (!invSnap.exists()) return

  const invData = invSnap.data()

  await updateDoc(invRef, {
    status: 'declined',
    updatedAt: serverTimestamp()
  })

  // Notify the inviter
  const ws = await getWorkspace(invData.workspaceId)
  await createNotification({
    userId: invData.invitedBy,
    type: 'system',
    title: 'Invitation Declined',
    body: `${invData.invitedEmail} declined your invitation to "${ws?.name}".`,
    metadata: { workspaceId: invData.workspaceId }
  })
}
