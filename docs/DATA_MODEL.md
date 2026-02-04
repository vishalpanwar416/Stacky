# Stacky – Firestore Data Model

Personal + shared productivity tracker. Firebase Auth + Firestore.

---

## Collections

### `users` (document ID = Firebase Auth UID)

Stores profile and preferences. Created on first sign-in.

```ts
{
  displayName: string;
  email: string;
  photoURL?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  defaultWorkspaceId?: string;
  preferences?: {
    theme: 'light' | 'dark' | 'system';
    maxInProgress?: number;  // default 5
    weekStartsOn?: number;   // 0 = Sunday
  };
}
```

---

### `workspaces`

One doc per workspace. Owner is in `ownerId`; members in `workspace_members` subcollection.

```ts
{
  name: string;           // "Office", "Personal", "Side Projects", "Shared (Friends)"
  slug: string;           // "office", "personal", etc.
  ownerId: string;        // Firebase UID
  visibility: 'private' | 'shared';  // shared = friends can be invited
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**Subcollection: `workspaces/{workspaceId}/members`**

```ts
{
  userId: string;
  role: 'owner' | 'member';
  joinedAt: Timestamp;
  displayName?: string;
  email?: string;
}
```

---

### `projects`

Scoped to a workspace. Optional for tasks (tasks can be workspace-level only).

```ts
{
  workspaceId: string;
  name: string;
  description?: string;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  status?: 'active' | 'on_hold' | 'completed';
  health?: 'on_track' | 'at_risk' | 'behind';
}
```

---

### `tasks`

Core entity. Can belong to workspace only or workspace + project. Supports shared tasks via `assignees`.

```ts
{
  workspaceId: string;
  projectId?: string;

  title: string;
  description?: string;
  status: 'backlog' | 'planned' | 'in_progress' | 'blocked' | 'done';
  priority: 'P0' | 'P1' | 'P2' | 'P3';

  dueDate?: Timestamp;      // date only, time 00:00
  dueTime?: string;         // optional "14:30"
  estimatedMinutes?: number;
  reminderAt?: Timestamp;

  tags: string[];           // ["office", "urgent", "learning"]
  isRecurring: boolean;
  recurringRule?: string;   // e.g. "daily", "weekly", "FREQ=WEEKLY;BYDAY=MO,WE"

  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  completedAt?: Timestamp;
  completionNote?: string;

  // Shared task: single owner + watchers
  assignees: {
    ownerId: string;        // one owner, responsible
    watcherIds: string[];   // can see/comment
  };

  blockedReason?: string;   // required when status === 'blocked'
  blockedByTaskId?: string; // optional dependency
}
```

**Subcollection: `tasks/{taskId}/comments`**

```ts
{
  userId: string;
  displayName?: string;
  body: string;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
  mentions?: string[];  // user IDs
}
```

**Subcollection: `tasks/{taskId}/activity`**

```ts
{
  userId: string;
  displayName?: string;
  action: 'created' | 'status_change' | 'assigned' | 'comment' | 'completed' | 'reopened' | 'blocked';
  payload?: Record<string, unknown>;  // e.g. { from: 'in_progress', to: 'done' }
  createdAt: Timestamp;
}
```

---

### `task_dependencies`

Simple "blocked by" relation. Task A is blocked by Task B until B is done.

```ts
{
  taskId: string;         // task that is blocked
  blockedByTaskId: string;
  createdAt: Timestamp;
}
```

---

## Indexes (Composite)

Create in Firestore Console as needed:

- `tasks`: `workspaceId` (ASC) + `status` (ASC) + `updatedAt` (DESC)
- `tasks`: `workspaceId` (ASC) + `assignees.ownerId` (ASC) + `status` (ASC)
- `tasks`: `workspaceId` (ASC) + `dueDate` (ASC)
- `projects`: `workspaceId` (ASC) + `updatedAt` (DESC)

---

## Security Rules (Summary)

- **users**: User can read/write only their own document (`request.auth.uid === userId`).
- **workspaces**: Owner can read/write; members can read (and write if we add write for members). Members list checked via `workspaces/{id}/members/{uid}`.
- **projects**: Read/write if user is member of `workspaceId`.
- **tasks**: Read if user is workspace member or in `assignees.ownerId` or `assignees.watcherIds`. Write: same + only owner can set status to `done` for shared tasks.
- **task_dependencies**: Same as tasks for linked taskIds.
- **comments / activity**: Read with task; write if user can read task.

Full rules in `firestore.rules`.
