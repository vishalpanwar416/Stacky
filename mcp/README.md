# stacky-mcp

An MCP server that gives Claude typed hands on your Stacky data — file a bug,
move a ticket to in-progress, close it with a note, without leaving the editor.

```
you → Claude → stacky-mcp (stdio) → Firestore (Admin SDK) → stackyy.vercel.app
```

## Tools

| Tool | What it does |
| --- | --- |
| `list_workspaces` | Workspaces you own or belong to. Start here — everything else needs a `workspaceId`. |
| `create_workspace` | Create a workspace you own, including the `members` record the UI reads. |
| `create_project` | Create a project inside a workspace. |
| `list_projects` | Projects inside a workspace. |
| `list_tasks` | Tasks, newest first. Filter by workspace, project, status, or tag. Omit `workspaceId` to search everywhere. |
| `get_task` | One task in full, with comments and activity history. |
| `create_task` | File a task. Defaults to `backlog` / `P2`. |
| `update_task` | Change any field, including status. |
| `close_task` | Mark done, optionally with a completion note. |
| `comment_on_task` | Add a comment; appears in the task activity feed. |

### Bugs and tickets

Stacky's `Task` type has no `type` field, so classification rides on **tags** —
ask for a "bug" and Claude tags it `bug`; `list_tasks { tag: "bug" }` finds them.
These are ordinary Stacky tags, so the existing UI filters work on them
unchanged. If you later want a real `type` field, it means a schema change
across `src/types`, `NewTask.tsx`, `TaskDetail.tsx` and the Dashboard filters.

## Two ways to run it

| | Hosted (`/api/mcp`) | Local (stdio) |
| --- | --- | --- |
| Who can use it | Any Stacky user, as themselves | Only whoever holds the key file |
| Identity | From the access token, per request | `STACKY_USER_ID` in config |
| Credential | Held server-side on Vercel | A key file on your disk |
| Setup | Create a token in the app | Clone, build, generate a key |

**Hosted is the normal path.** Sign in to Stacky → avatar menu → **Connect to Claude** →
create a token → paste the command it gives you:

```bash
claude mcp add --transport http stacky https://stackyy.vercel.app/api/mcp \
  --header "Authorization: Bearer stk_…"
```

The token is shown once and stored only as a SHA-256 hash, so it cannot be recovered
later — create a new one if you lose it. Revoke from the same screen; revocation takes
effect on the next request.

### How the hosted server keeps users apart

The Admin SDK ignores `firestore.rules`, so over HTTP `src/scope.ts` is the *only*
boundary between one user's token and another's data. Two things make that safe to
rely on:

- **Identity is per request, never module state.** `createStackyServer(userId)` closes
  over the uid resolved from the token; one process serving many people cannot leak a
  "current user" across concurrent requests.
- **Every tool re-checks access against the database**, rather than trusting the
  workspace id it was handed.

`scripts/isolation.mjs` drives the live endpoint as two different users and asserts the
boundary — disjoint workspaces, reads and writes into another user's workspace refused,
nothing written, revoked tokens dead. Run it against any deployment:

```bash
node scripts/isolation.mjs https://stackyy.vercel.app
```

## Local setup

For the stdio server. Already done on this machine; this is for a rebuild or a second machine.

**1. Service account.** The server authenticates with a dedicated,
Firestore-only service account (`roles/datastore.user`) — deliberately *not* the
broad `firebase-adminsdk` one, so a leaked key can't touch Auth or Storage.

```bash
gcloud iam service-accounts keys create mcp/serviceAccountKey.json \
  --iam-account=stacky-mcp@stacky-f7f42.iam.gserviceaccount.com
chmod 600 mcp/serviceAccountKey.json
```

The key is gitignored (`**/serviceAccountKey.json`) and excluded from Vercel
uploads (`.vercelignore`). It must never reach the browser bundle.

**2. Build.**

```bash
cd mcp && npm install && npm run build
```

**3. Register with Claude Code.**

```bash
claude mcp add stacky --scope user -- node /absolute/path/to/Stacky/mcp/dist/index.js
claude mcp list   # expect: stacky - ✔ Connected
```

For **Claude Desktop**, add to `claude_desktop_config.json` instead:

```json
{
  "mcpServers": {
    "stacky": {
      "command": "node",
      "args": ["/absolute/path/to/Stacky/mcp/dist/index.js"]
    }
  }
}
```

## Configuration

| Env var | Default |
| --- | --- |
| `STACKY_USER_ID` | `gG3YSXzLDJY5i6KSd8xVLFIxGv33` (vishalpanwar416@gmail.com) |
| `STACKY_SERVICE_ACCOUNT` | `mcp/serviceAccountKey.json` |

## How access is scoped

This is the part worth understanding before extending the server.

The Admin SDK **bypasses `firestore.rules` completely**. Stacky's database is
shared — ten users, seven workspaces — so the rules that normally keep users
apart do nothing here. `src/scope.ts` is what replaces them:

- `list_workspaces` only ever queries `ownerId == STACKY_USER_ID` or
  `memberIds array-contains STACKY_USER_ID`.
- Every tool taking a `workspaceId`, `taskId`, or `projectId` re-checks
  reachability on each call, rather than trusting the argument the model passed.
- `create_task` additionally verifies the `projectId` really belongs to the
  `workspaceId` given, so a task can't be filed into a mismatched project.

**Any new tool must route through `assertWorkspace` / `assertTask`.** A direct
`db.collection(...)` call in a tool handler is an access-control hole, not a
shortcut.

## Parity with the web app

Writes mirror `src/lib/tasks.ts` field for field, so a task filed from Claude is
indistinguishable from one filed in the UI:

- `assignees`, `createdBy`, `isRecurring`, `timerEnabled` all set as `NewTask.tsx` sets them
- status → `in_progress` stamps `startedAt` and starts the timer
- status → `done` stamps `completedAt`
- every mutation writes a `tasks/{id}/activity` entry, so the feed stays honest

**Dates are parsed in local time, not UTC.** The app writes
`new Date(dateStr + 'T' + time)` and renders with `toLocaleDateString()`, so
`2026-09-01` is stored as local midnight — `2026-08-31T18:30Z` in IST. Reading
it as UTC would land tasks a day early on the Dashboard.

## Tests

```bash
npm run smoke
```

Drives the built server over real stdio MCP against the real Firestore project:
tool registration, workspace scoping (including a rejection check against
another user's workspace), create → read → comment → in-progress → close, date
handling, and error reporting. It tags everything `mcp-smoke-test` and deletes
what it created on the way out.
