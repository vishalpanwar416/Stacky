import {
    collection,
    doc,
    addDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    limit,
    onSnapshot,
    serverTimestamp,
} from 'firebase/firestore'
import type { Unsubscribe } from 'firebase/firestore'
import { getDb } from './firebase'
import type { AppNotification } from '../types'

const NOTIFICATIONS = 'notifications'

export async function createNotification(
    data: Omit<AppNotification, 'id' | 'createdAt' | 'read'>
) {
    const db = getDb()
    return addDoc(collection(db, NOTIFICATIONS), {
        ...data,
        read: false,
        createdAt: serverTimestamp(),
    })
}

export function subscribeNotifications(
    userId: string,
    callback: (notifications: AppNotification[]) => void
): Unsubscribe {
    const q = query(
        collection(getDb(), NOTIFICATIONS),
        where('userId', '==', userId),
        orderBy('createdAt', 'desc'),
        limit(50)
    )

    return onSnapshot(q, (snap) => {
        callback(snap.docs.map(d => ({ id: d.id, ...d.data() } as AppNotification)))
    }, (err) => {
        console.error('Notifications subscription error:', err)
        callback([])
    })
}

export async function markNotificationAsRead(id: string) {
    const ref = doc(getDb(), NOTIFICATIONS, id)
    await updateDoc(ref, {
        read: true,
    })
}

export async function markAllNotificationsAsRead(userId: string) {
    // Simple implementation: fetch all unread and update. 
    // In production, you might want to use a writeBatch.
    const q = query(
        collection(getDb(), NOTIFICATIONS),
        where('userId', '==', userId),
        where('read', '==', false)
    )
    const snap = await (import('firebase/firestore').then(f => f.getDocs(q)))
    const batch = await (import('firebase/firestore').then(f => f.writeBatch(getDb())))
    snap.docs.forEach(d => {
        batch.update(d.ref, { read: true })
    })
    await batch.commit()
}

export async function deleteNotification(id: string) {
    await deleteDoc(doc(getDb(), NOTIFICATIONS, id))
}
