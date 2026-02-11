import type { Timestamp } from 'firebase/firestore'

export type TaskStatus = 'backlog' | 'planned' | 'in_progress' | 'blocked' | 'done'
export type TaskPriority = 'P0' | 'P1' | 'P2' | 'P3'

export interface TaskAssignees {
  ownerId: string
  watcherIds: string[]
}

export interface Task {
  id: string
  workspaceId: string
  projectId?: string
  title: string
  description?: string
  status: TaskStatus
  priority: TaskPriority
  dueDate?: Timestamp
  dueTime?: string
  estimatedMinutes?: number
  reminderAt?: Timestamp
  tags: string[]
  isRecurring: boolean
  recurringRule?: string
  createdBy: string
  createdAt: Timestamp
  updatedAt: Timestamp
  completedAt?: Timestamp
  completionNote?: string
  startedAt?: Timestamp
  assignees: TaskAssignees
  blockedReason?: string
  blockedByTaskId?: string
  timerElapsed?: number
  timerLastStartedAt?: Timestamp
  timerEnabled?: boolean
}

export interface TaskCreate
  extends Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'assignees'> {
  assignees?: Partial<TaskAssignees>
}

export interface Workspace {
  id: string
  name: string
  slug: string
  description?: string
  ownerId: string
  visibility: 'private' | 'shared'
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface WorkspaceMember {
  id: string
  userId: string
  role: 'owner' | 'member'
  joinedAt: Timestamp
  displayName?: string
  email?: string
}

export interface Project {
  id: string
  workspaceId: string
  name: string
  description?: string
  createdBy: string
  createdAt: Timestamp
  updatedAt: Timestamp
  status?: 'active' | 'on_hold' | 'completed'
  health?: 'on_track' | 'at_risk' | 'behind'
}

export interface UserProfile {
  id: string
  displayName: string
  email: string
  photoURL?: string
  createdAt: Timestamp
  updatedAt: Timestamp
  defaultWorkspaceId?: string
  preferences?: {
    theme?: 'light' | 'dark' | 'system'
    maxInProgress?: number
    weekStartsOn?: number
  }
}

export interface TaskComment {
  id: string
  userId: string
  displayName?: string
  body: string
  createdAt: Timestamp
  updatedAt?: Timestamp
  mentions?: string[]
}

export type TaskActivityAction =
  | 'created'
  | 'status_change'
  | 'assigned'
  | 'comment'
  | 'completed'
  | 'reopened'
  | 'blocked'
  | 'due_set'

export interface TaskActivity {
  id: string
  userId: string
  displayName?: string
  action: TaskActivityAction
  payload?: Record<string, unknown>
  createdAt: Timestamp
}

export interface WorkspaceInvitation {
  id: string
  workspaceId: string
  invitedEmail: string
  status: 'pending' | 'accepted' | 'declined'
  role: 'member' | 'admin'
  invitedBy: string // user id of who sent the invite
  createdAt: Timestamp
  updatedAt: Timestamp
}
