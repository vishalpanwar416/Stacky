#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

import { STACKY_USER_ID } from './config.js'
import { PROJECTS, TASKS, db } from './firestore.js'
import { AccessError, assertTask, assertWorkspace, chunk, listWorkspaces } from './scope.js'
import { addComment, createTask, serializeTask, updateTask } from './tasks.js'

const server = new McpServer({ name: 'stacky', version: '0.1.0' })

const statusEnum = z.enum(['backlog', 'planned', 'in_progress', 'blocked', 'done'])
const priorityEnum = z.enum(['P0', 'P1', 'P2', 'P3'])

const ok = (payload: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
})

/**
 * Access failures come back as readable tool errors rather than stack traces,
 * so the model can correct course instead of retrying the same rejected call.
 */
function guard<A>(handler: (args: A) => Promise<ReturnType<typeof ok>>) {
  return async (args: A) => {
    try {
      return await handler(args)
    } catch (err) {
      const message = err instanceof AccessError ? err.message : (err as Error).message
      return {
        content: [{ type: 'text' as const, text: `Error: ${message}` }],
        isError: true,
      }
    }
  }
}

server.registerTool(
  'list_workspaces',
  {
    title: 'List workspaces',
    description:
      'List Stacky workspaces you can reach. Call this first — every other tool needs a workspaceId.',
    inputSchema: {},
  },
  guard(async () => {
    const workspaces = await listWorkspaces()
    return ok(
      workspaces.map((w) => ({
        id: w.id,
        name: w.name,
        role: w.ownerId === STACKY_USER_ID ? 'owner' : 'member',
      }))
    )
  })
)

server.registerTool(
  'list_projects',
  {
    title: 'List projects',
    description: 'List the projects inside a workspace.',
    inputSchema: { workspaceId: z.string().describe('From list_workspaces') },
  },
  guard(async ({ workspaceId }) => {
    await assertWorkspace(workspaceId)
    const snap = await db.collection(PROJECTS).where('workspaceId', '==', workspaceId).get()
    return ok(
      snap.docs.map((d) => ({
        id: d.id,
        name: d.data().name,
        status: d.data().status ?? null,
        health: d.data().health ?? null,
      }))
    )
  })
)

server.registerTool(
  'list_tasks',
  {
    title: 'List tasks',
    description:
      'List tasks, newest first. Omit workspaceId to search every workspace you can reach. ' +
      'Use tag "bug" or "ticket" to filter those out of the backlog.',
    inputSchema: {
      workspaceId: z.string().optional(),
      projectId: z.string().optional(),
      status: statusEnum.optional(),
      tag: z.string().optional().describe('Single tag to filter by, e.g. "bug"'),
      limit: z.number().int().min(1).max(100).default(25),
    },
  },
  guard(async ({ workspaceId, projectId, status, tag, limit }) => {
    let scopeIds: string[]
    if (workspaceId) {
      await assertWorkspace(workspaceId)
      scopeIds = [workspaceId]
    } else {
      scopeIds = (await listWorkspaces()).map((w) => w.id)
    }
    if (scopeIds.length === 0) return ok([])

    // Equality-only filters keep this on Firestore's automatic single-field
    // indexes; ordering happens below so no composite index is needed.
    const batches = await Promise.all(
      chunk(scopeIds).map((ids) => {
        let q = db.collection(TASKS).where('workspaceId', 'in', ids)
        if (projectId) q = q.where('projectId', '==', projectId)
        if (status) q = q.where('status', '==', status)
        if (tag) q = q.where('tags', 'array-contains', tag)
        return q.get()
      })
    )

    const tasks = batches
      .flatMap((snap) => snap.docs)
      .map((d) => serializeTask(d.id, d.data()))
      .sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')))
      .slice(0, limit)

    return ok(
      tasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        tags: t.tags,
        dueDate: t.dueDate ?? null,
        projectId: t.projectId ?? null,
        workspaceId: t.workspaceId,
      }))
    )
  })
)

server.registerTool(
  'get_task',
  {
    title: 'Get task',
    description: 'Fetch one task in full, with its comments and activity history.',
    inputSchema: { taskId: z.string() },
  },
  guard(async ({ taskId }) => {
    const { ref, data } = await assertTask(taskId)
    const [comments, activity] = await Promise.all([
      ref.collection('comments').get(),
      ref.collection('activity').get(),
    ])
    return ok({
      task: serializeTask(taskId, data),
      comments: comments.docs.map((d) => serializeTask(d.id, d.data())),
      activity: activity.docs
        .map((d) => serializeTask(d.id, d.data()))
        .sort((a, b) => String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? ''))),
    })
  })
)

server.registerTool(
  'create_task',
  {
    title: 'Create task',
    description:
      'File a new task, bug, or ticket. Tag it "bug" or "ticket" to classify it — ' +
      'Stacky has no separate type field. Defaults to backlog / P2.',
    inputSchema: {
      workspaceId: z.string().describe('From list_workspaces'),
      title: z.string().min(1),
      projectId: z.string().optional(),
      description: z.string().optional(),
      status: statusEnum.optional(),
      priority: priorityEnum.optional(),
      dueDate: z.string().optional().describe('YYYY-MM-DD or ISO timestamp'),
      dueTime: z.string().optional().describe('HH:MM'),
      estimatedMinutes: z.number().int().positive().optional(),
      tags: z.array(z.string()).optional(),
    },
  },
  guard(async (args) => {
    const id = await createTask(args)
    return ok({ id, created: true, title: args.title, url: `/tasks/${id}` })
  })
)

server.registerTool(
  'update_task',
  {
    title: 'Update task',
    description:
      'Change any field on a task, including moving its status. Setting status to ' +
      'in_progress starts the timer; done stamps completedAt — same as the web UI.',
    inputSchema: {
      taskId: z.string(),
      title: z.string().optional(),
      description: z.string().optional(),
      status: statusEnum.optional(),
      priority: priorityEnum.optional(),
      projectId: z.string().optional(),
      dueDate: z.string().optional(),
      dueTime: z.string().optional(),
      estimatedMinutes: z.number().int().positive().optional(),
      tags: z.array(z.string()).optional(),
      blockedReason: z.string().optional(),
    },
  },
  guard(async ({ taskId, ...rest }) => {
    const { previousStatus, title } = await updateTask(taskId, rest)
    return ok({ ...rest, id: taskId, title: rest.title ?? title, updated: true, previousStatus })
  })
)

server.registerTool(
  'close_task',
  {
    title: 'Close task',
    description: 'Mark a task done, optionally with a note on how it was resolved.',
    inputSchema: {
      taskId: z.string(),
      completionNote: z.string().optional(),
    },
  },
  guard(async ({ taskId, completionNote }) => {
    const { previousStatus, title } = await updateTask(taskId, { status: 'done', completionNote })
    if (previousStatus === 'done') {
      return ok({ id: taskId, title, closed: true, note: 'Task was already done.' })
    }
    return ok({ id: taskId, title, closed: true, previousStatus })
  })
)

server.registerTool(
  'comment_on_task',
  {
    title: 'Comment on task',
    description: 'Add a comment to a task. Shows up in the task activity feed in Stacky.',
    inputSchema: { taskId: z.string(), body: z.string().min(1) },
  },
  guard(async ({ taskId, body }) => {
    const id = await addComment(taskId, body)
    return ok({ commentId: id, taskId, added: true })
  })
)

const transport = new StdioServerTransport()
await server.connect(transport)
// stdout is the MCP channel — diagnostics must go to stderr.
console.error(`stacky-mcp ready (acting as ${STACKY_USER_ID})`)
