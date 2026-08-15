#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

import { STACKY_USER_ID } from './config.js'
import { createStackyServer } from './server.js'

/**
 * Local stdio entry point — one process, one user, spawned by the MCP client
 * on this machine. The identity comes from configuration because there is
 * exactly one caller.
 *
 * The hosted multi-user entry point is api/mcp.ts, which resolves the identity
 * from an access token per request and calls the same factory.
 */

const server = createStackyServer(STACKY_USER_ID)
await server.connect(new StdioServerTransport())
// stdout is the MCP channel — diagnostics must go to stderr.
console.error(`stacky-mcp ready (acting as ${STACKY_USER_ID})`)
