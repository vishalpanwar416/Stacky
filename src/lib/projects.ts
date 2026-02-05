import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore'
import { getDb } from './firebase'
import type { Project } from '../types'

const PROJECTS = 'projects'

export async function createProject(
  data: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const payload: Record<string, unknown> = {
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) payload[key] = value
  }
  const ref = await addDoc(collection(getDb(), PROJECTS), payload)
  return ref.id
}

export async function getProject(id: string): Promise<Project | null> {
  const snap = await getDoc(doc(getDb(), PROJECTS, id))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() } as Project
}

export async function getProjectsByWorkspace(workspaceId: string): Promise<Project[]> {
  const q = query(
    collection(getDb(), PROJECTS),
    where('workspaceId', '==', workspaceId),
    orderBy('updatedAt', 'desc')
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Project))
}

export async function updateProject(
  id: string,
  data: Partial<Pick<Project, 'name' | 'description' | 'status' | 'health'>>
) {
  const payload: Record<string, unknown> = { updatedAt: serverTimestamp() }
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) payload[key] = value
  }
  await updateDoc(doc(getDb(), PROJECTS, id), payload)
}

export async function deleteProject(id: string) {
  await deleteDoc(doc(getDb(), PROJECTS, id))
}
