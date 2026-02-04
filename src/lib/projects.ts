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
import { db } from './firebase'
import type { Project } from '../types'

const PROJECTS = 'projects'

export async function createProject(
  data: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const ref = await addDoc(collection(db, PROJECTS), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

export async function getProject(id: string): Promise<Project | null> {
  const snap = await getDoc(doc(db, PROJECTS, id))
  if (!snap.exists()) return null
  return { id: snap.id, ...snap.data() } as Project
}

export async function getProjectsByWorkspace(workspaceId: string): Promise<Project[]> {
  const q = query(
    collection(db, PROJECTS),
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
  await updateDoc(doc(db, PROJECTS, id), {
    ...data,
    updatedAt: serverTimestamp(),
  })
}

export async function deleteProject(id: string) {
  await deleteDoc(doc(db, PROJECTS, id))
}
