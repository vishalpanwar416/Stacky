import { db } from './firebase-admin.js';

async function main() {
  const snap = await db.collection('workspaces').limit(5).get();
  console.log('Firebase Admin + Firestore OK');
  console.log('Workspaces:', snap.size);
  snap.docs.forEach((d) => console.log(' ', d.id, d.data().name));
}

main().catch((e) => {
  if (e.code === 5 || e.message?.includes('NOT_FOUND')) {
    console.error(
      'Firestore database not created yet. In Firebase Console go to Build → Firestore → Create database (start in test or production mode), then run this again.'
    );
  } else {
    console.error(e);
  }
});
