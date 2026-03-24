import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "../db.js";

export function registerMemoryTools(server: McpServer) {
  // ── Remember ──────────────────────────────────────────────────────────────────
  server.tool(
    "vixy_remember",
    "Store an important fact, pattern, or decision in workspace memory. Persists across agent runs. Use for: client preferences, what works, what doesn't, important decisions made.",
    {
      workspace_id: z.string().describe("Workspace ID"),
      key: z.string().describe("Memory key/topic (e.g., 'campaign_patterns', 'client_preferences', 'budget_notes')"),
      value: z.string().describe("What to remember — be specific and include context"),
      importance: z.number().min(1).max(10).default(5).describe("Importance 1-10 (10 = most important, always retrieved)"),
      expires_days: z.number().optional().describe("Days until this memory expires (omit for permanent)"),
    },
    async ({ workspace_id, key, value, importance, expires_days }) => {
      const expiresAt = expires_days
        ? new Date(Date.now() + expires_days * 24 * 60 * 60 * 1000)
        : null;

      // Upsert: update existing key or create new
      const existing = await db.agentMemory.findFirst({
        where: { workspaceId: workspace_id, key },
      });

      if (existing) {
        await db.agentMemory.update({
          where: { id: existing.id },
          data: { value, importance, expiresAt, updatedAt: new Date() },
        });
        return {
          content: [{ type: "text", text: `Memory updated: [${key}] = "${value}"` }],
        };
      }

      await db.agentMemory.create({
        data: { workspaceId: workspace_id, key, value, importance, expiresAt },
      });

      return {
        content: [{ type: "text", text: `Memory saved: [${key}] = "${value}"` }],
      };
    }
  );

  // ── Recall ────────────────────────────────────────────────────────────────────
  server.tool(
    "vixy_recall",
    "Retrieve memories for a workspace. Optionally filter by key/topic. Always call this at the start of working with a workspace to load relevant context.",
    {
      workspace_id: z.string().describe("Workspace ID"),
      query: z.string().optional().describe("Optional: filter by key containing this string (e.g., 'campaign', 'budget')"),
      limit: z.number().default(15).describe("Max memories to return (ordered by importance)"),
    },
    async ({ workspace_id, query, limit }) => {
      const memories = await db.agentMemory.findMany({
        where: {
          workspaceId: workspace_id,
          ...(query ? { key: { contains: query, mode: "insensitive" } } : {}),
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        orderBy: [{ importance: "desc" }, { updatedAt: "desc" }],
        take: limit,
        select: {
          key: true,
          value: true,
          importance: true,
          updatedAt: true,
          expiresAt: true,
        },
      });

      if (memories.length === 0) {
        return {
          content: [{ type: "text", text: `No memories found for workspace ${workspace_id}${query ? ` matching "${query}"` : ""}.` }],
        };
      }

      return {
        content: [{ type: "text", text: JSON.stringify(memories, null, 2) }],
      };
    }
  );
}
