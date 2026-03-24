import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "../db.js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export function registerConversationTools(server: McpServer) {
  // ── Get unread conversations ─────────────────────────────────────────────────
  server.tool(
    "vixy_get_unread_conversations",
    "Get all conversations with unread WhatsApp messages for a workspace. Returns lead info, message preview, and unread count.",
    { workspace_id: z.string().describe("Workspace ID") },
    async ({ workspace_id }) => {
      const conversations = await db.conversation.findMany({
        where: {
          workspaceId: workspace_id,
          unreadCount: { gt: 0 },
          status: { not: "CLOSED" },
        },
        include: {
          lead: {
            select: {
              id: true,
              name: true,
              phone: true,
              businessName: true,
              status: true,
            },
          },
          messages: {
            orderBy: { createdAt: "desc" },
            take: 3,
            select: {
              id: true,
              content: true,
              direction: true,
              createdAt: true,
            },
          },
        },
        orderBy: { lastMessageAt: "desc" },
        take: 50,
      });

      return {
        content: [{ type: "text", text: JSON.stringify(conversations, null, 2) }],
      };
    }
  );

  // ── Bulk analyze conversations ───────────────────────────────────────────────
  server.tool(
    "vixy_bulk_analyze_conversations",
    "Analyze ALL open conversations for a workspace in a single AI call. Returns intent, sentiment, urgency, and suggested reply for each conversation. Much more efficient than analyzing one by one.",
    { workspace_id: z.string().describe("Workspace ID") },
    async ({ workspace_id }) => {
      // Fetch all open conversations with their last 5 messages
      const conversations = await db.conversation.findMany({
        where: {
          workspaceId: workspace_id,
          status: { not: "CLOSED" },
        },
        include: {
          lead: {
            select: { id: true, name: true, phone: true, businessName: true, status: true },
          },
          messages: {
            orderBy: { createdAt: "desc" },
            take: 5,
            select: { content: true, direction: true, createdAt: true },
          },
        },
        orderBy: { lastMessageAt: "desc" },
        take: 50,
      });

      if (conversations.length === 0) {
        return { content: [{ type: "text", text: "No open conversations found." }] };
      }

      // Build bulk analysis prompt
      const conversationSummaries = conversations.map((conv, i) => {
        const messages = [...conv.messages].reverse();
        const transcript = messages.map((m) => `[${m.direction === "INBOUND" ? "Lead" : "Us"}]: ${m.content}`).join("\n");
        return `--- Conversation ${i + 1} ---\nLead: ${conv.lead.name || conv.lead.phone} (${conv.lead.businessName || ""})\nStatus: ${conv.lead.status}\nMessages:\n${transcript}`;
      });

      const prompt = `Analyze these ${conversations.length} WhatsApp business conversations. For each, return a JSON array with:
- conversation_index (0-based)
- lead_id
- intent: "interested" | "objection" | "question" | "not_relevant" | "closed"
- sentiment: "positive" | "neutral" | "negative"
- urgency: "hot" | "warm" | "cold"
- key_topics: string[] (main things discussed)
- suggested_reply: string (Hebrew, WhatsApp style, max 100 words)
- needs_attention: boolean

Return ONLY a valid JSON array, no explanation.

Conversations:
${conversationSummaries.join("\n\n")}`;

      const response = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      });

      const analysisText = response.content[0].type === "text" ? response.content[0].text : "[]";

      let analysis: unknown[] = [];
      try {
        const jsonMatch = analysisText.match(/\[[\s\S]*\]/);
        analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
      } catch {
        analysis = [];
      }

      // Enrich with actual lead IDs
      const enriched = (analysis as Record<string, unknown>[]).map((a) => ({
        ...a,
        lead_id: conversations[a.conversation_index as number]?.lead.id,
        lead_name: conversations[a.conversation_index as number]?.lead.name,
        conversation_id: conversations[a.conversation_index as number]?.id,
      }));

      return {
        content: [{ type: "text", text: JSON.stringify(enriched, null, 2) }],
      };
    }
  );

  // ── Reply to lead ────────────────────────────────────────────────────────────
  server.tool(
    "vixy_reply_to_lead",
    "Send a WhatsApp message reply to a lead. This sends a real message — always verify the content before calling. For high-stakes replies, use vixy_request_approval first.",
    {
      lead_id: z.string().describe("Lead ID to reply to"),
      workspace_id: z.string().describe("Workspace ID"),
      message: z.string().describe("Message content in Hebrew (WhatsApp style, concise)"),
    },
    async ({ lead_id, workspace_id, message }) => {
      // Verify lead belongs to workspace
      const lead = await db.lead.findFirst({
        where: { id: lead_id, workspaceId: workspace_id },
        include: {
          conversations: {
            orderBy: { updatedAt: "desc" },
            take: 1,
          },
        },
      });

      if (!lead) {
        return {
          content: [{ type: "text", text: `Lead ${lead_id} not found in workspace ${workspace_id}` }],
          isError: true,
        };
      }

      // Record the outbound message in DB
      // (Actual WhatsApp API send is handled by Vixy's webhook system)
      const appUrl = process.env.VIXY_APP_URL ?? "https://vixy.projectadam.co.il";
      const response = await fetch(`${appUrl}/api/internal/send-message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-service-key": process.env.MCP_API_KEY ?? "",
        },
        body: JSON.stringify({ leadId: lead_id, workspaceId: workspace_id, message }),
      });

      if (!response.ok) {
        const error = await response.text();
        return {
          content: [{ type: "text", text: `Failed to send message: ${error}` }],
          isError: true,
        };
      }

      return {
        content: [{ type: "text", text: `Message sent to ${lead.name || lead.phone}: "${message}"` }],
      };
    }
  );

  // ── Get optimization recommendations ────────────────────────────────────────
  server.tool(
    "vixy_get_optimization_recommendations",
    "Get pending AI optimization recommendations for a workspace. These are suggested actions (budget changes, pauses, keyword updates) waiting to be applied.",
    {
      workspace_id: z.string().describe("Workspace ID"),
      status: z.enum(["PENDING", "APPLIED", "DISMISSED", "ALL"]).default("PENDING"),
    },
    async ({ workspace_id, status }) => {
      const recommendations = await db.optimizationRecommendation.findMany({
        where: {
          workspaceId: workspace_id,
          ...(status !== "ALL" ? { status } : {}),
        },
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
        take: 20,
      });

      return {
        content: [{ type: "text", text: JSON.stringify(recommendations, null, 2) }],
      };
    }
  );
}
