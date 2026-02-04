# Stacky

A personal productivity tracker with workspaces (Office, Personal, Side Projects, Shared), task queue, shared tasks with friends, comments, activity history, and Firebase backend.

## Features

- **Workspaces** – Office, Personal, Side Projects, Shared (friends)
- **Tasks** – Priority (P0–P3), status (Backlog → Planned → In Progress → Blocked → Done), tags, due date
- **Task queue** – Focus on a small set of in-progress tasks; rest in queue
- **Shared tasks** – Owner + watchers; only owner can mark done; comments and activity
- **History** – Activity log and completion notes per task
- **Firebase** – Auth (Google) + Firestore

## Setup

### 1. Firebase project

1. Go to [Firebase Console](https://console.firebase.google.com/) and create a project.
2. Enable **Authentication** → Sign-in method → **Google**.
3. Create a **Firestore** database (start in test mode for dev; then deploy rules).
4. Register a **Web app** and copy the config object.

### 2. Environment

```bash
cp .env.example .env
```

Fill `.env` with your Firebase config:

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

### 3. Firestore indexes

In Firestore → Indexes, add a composite index:

- Collection: `tasks`
- Fields: `workspaceId` (Ascending), `updatedAt` (Descending)

### 4. Security rules

Deploy the rules from this repo:

```bash
firebase deploy --only firestore:rules
```

Or copy `firestore.rules` into your Firebase project and deploy from the console.

### 5. Install and run

```bash
npm install
npm run dev
```

Open the URL shown (e.g. http://localhost:5173). Sign in with Google, create a workspace, then add tasks.

## Data model

See [docs/DATA_MODEL.md](docs/DATA_MODEL.md) for collections (users, workspaces, projects, tasks, comments, activity) and security rules summary.

## Tech stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS 4, React Router
- **Backend:** Firebase Auth, Firestore

## Roadmap (ideas)

- Projects under workspaces (Epics → Tasks)
- Due dates + reminders + calendar view
- Recurring tasks
- Task dependencies (blocked by)
- Invite friends to shared workspace (link/email)
- Notifications (assigned, due, blocked)
- Basic analytics (tasks/week, focus time)
- Dark/light theme toggle
- Keyboard shortcuts + command bar
