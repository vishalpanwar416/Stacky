import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'

import { createStackyServer } from '../mcp/src/server.js'
import { readBearer, resolveToken } from './_lib/mcpAuth.js'

/**
 * The hosted Stacky MCP server.
 *
 * Every request is authenticated to a single Stacky user, and that uid is
 * passed into createStackyServer so the tools can only ever see that user's
 * workspaces. The Admin SDK bypasses firestore.rules, so the scope layer is
 * the boundary here — which is why the identity is per-request and never
 * module state.
 *
 * The transport runs stateless (no session id): each invocation builds a
 * server, answers one request, and exits. Serverless functions do not persist
 * between calls, so a session-based transport would hand out ids that the next
 * invocation could not honour.
 */

export default async function handler(req: any, res: any) {
  if (req.method === 'GET' || req.method === 'DELETE') {
    // Both belong to the session-based transport, which stateless mode does
    // not implement. Answer plainly instead of letting the SDK 500.
    return res.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'This server is stateless; use POST.' },
      id: null,
    })
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST.' })
  }

  const userId = await resolveToken(readBearer(req.headers.authorization))
  if (!userId) {
    // 401 with WWW-Authenticate is what MCP clients expect for a bad token.
    res.setHeader('WWW-Authenticate', 'Bearer realm="stacky"')
    return res.status(401).json({
      jsonrpc: '2.0',
      error: { code: -32001, message: 'Invalid or missing MCP access token.' },
      id: null,
    })
  }

  const server = createStackyServer(userId)
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })

  // Tie the transport's lifetime to the response so nothing is left open when
  // the function is frozen between invocations.
  res.on('close', () => {
    void transport.close()
    void server.close()
  })

  try {
    await server.connect(transport)
    await transport.handleRequest(req, res, req.body)
  } catch (err) {
    console.error('MCP request failed', err)
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error.' },
        id: null,
      })
    }
  }
}
