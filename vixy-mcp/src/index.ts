/**
 * Vixy MCP Server
 *
 * Exposes Vixy's campaign management, ad platform, and CRM tools
 * via the Model Context Protocol (Streamable HTTP transport).
 *
 * Used by DeerFlow / Adam agent to manage campaigns autonomously.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express, { type Request, type Response, type NextFunction } from "express";
import { randomUUID } from "crypto";
import { registerWorkspaceTools } from "./tools/workspace.js";
import { registerConversationTools } from "./tools/conversations.js";
import { registerAdsTools } from "./tools/ads.js";
import { registerMemoryTools } from "./tools/memory.js";
import { registerApprovalTools } from "./tools/approvals.js";

const PORT = parseInt(process.env.PORT ?? "3005", 10);
const MCP_API_KEY = process.env.MCP_API_KEY;

if (!MCP_API_KEY) {
  console.error("FATAL: MCP_API_KEY environment variable is required");
  process.exit(1);
}

// Session store (stateful MCP sessions)
const sessions = new Map<string, { server: McpServer; transport: StreamableHTTPServerTransport }>();

function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "vixy-mcp",
    version: "1.0.0",
  });

  // Register all tool groups
  registerWorkspaceTools(server);
  registerConversationTools(server);
  registerAdsTools(server);
  registerMemoryTools(server);
  registerApprovalTools(server);

  return server;
}

// ── Express app ──────────────────────────────────────────────────────────────

const app = express();
app.use(express.json({ limit: "4mb" }));

// Auth middleware
function requireAuth(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${MCP_API_KEY}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

// Health check (no auth)
app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "vixy-mcp", sessions: sessions.size });
});

// ── MCP endpoints (Streamable HTTP) ─────────────────────────────────────────

// POST /mcp — main request handler
app.post("/mcp", requireAuth, async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  let session = sessionId ? sessions.get(sessionId) : undefined;

  if (!session) {
    // Create new session
    const newSessionId = randomUUID();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => newSessionId,
    });
    const server = createMcpServer();

    await server.connect(transport);

    session = { server, transport };
    sessions.set(newSessionId, session);

    transport.onclose = () => {
      sessions.delete(newSessionId);
    };
  }

  await session.transport.handleRequest(req, res, req.body);
});

// GET /mcp — SSE stream for server-initiated notifications
app.get("/mcp", requireAuth, async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId) {
    res.status(400).json({ error: "mcp-session-id header required" });
    return;
  }

  const session = sessions.get(sessionId);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  await session.transport.handleRequest(req, res);
});

// DELETE /mcp — terminate session
app.delete("/mcp", requireAuth, async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (sessionId) {
    const session = sessions.get(sessionId);
    if (session) {
      await session.transport.close();
      sessions.delete(sessionId);
    }
  }
  res.status(200).json({ ok: true });
});

// ── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Vixy MCP Server running on port ${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
  console.log(`MCP endpoint: http://localhost:${PORT}/mcp`);
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("Shutting down...");
  for (const [id, { transport }] of sessions) {
    await transport.close().catch(() => null);
    sessions.delete(id);
  }
  process.exit(0);
});
