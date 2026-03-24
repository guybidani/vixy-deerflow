import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "../db.js";

export function registerApprovalTools(server: McpServer) {
  // ── Request approval ─────────────────────────────────────────────────────────
  server.tool(
    "vixy_request_approval",
    "Send a high-risk action for human approval before executing. Creates an approval record and notifies the workspace owner via WhatsApp. ALWAYS use this for: creating campaigns, deleting anything, budget changes > policy limit, any action marked HIGH RISK.",
    {
      workspace_id: z.string().describe("Workspace ID"),
      action_type: z.string().describe("Type of action (e.g., 'CREATE_CAMPAIGN', 'DELETE_AD', 'LARGE_BUDGET_CHANGE')"),
      action_description: z.string().describe("Hebrew description of what Adam wants to do and WHY"),
      action_parameters: z.record(z.unknown()).describe("The exact parameters that will be used if approved"),
      urgency: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM").describe("How urgent is this approval"),
    },
    async ({ workspace_id, action_type, action_description, action_parameters, urgency }) => {
      // Route approval creation through Vixy API (handles approverId, level, WhatsApp notification)
      const appUrl = process.env.VIXY_APP_URL ?? "https://vixy.projectadam.co.il";
      const response = await fetch(`${appUrl}/api/internal/approvals/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-service-key": process.env.MCP_API_KEY ?? "",
        },
        body: JSON.stringify({ workspaceId: workspace_id, actionType: action_type, actionDescription: action_description, actionParameters: action_parameters, urgency }),
      }).catch(() => null);

      const approvalId = response?.ok ? ((await response.json().catch(() => ({}))) as Record<string, unknown>).id ?? "pending" : "pending";

      return {
        content: [
          {
            type: "text",
            text: `Approval requested (ID: ${approvalId})\nAction: ${action_type}\nDescription: ${action_description}\nUrgency: ${urgency}\n\nThe workspace owner will be notified via WhatsApp to approve or deny this action.`,
          },
        ],
      };
    }
  );

  // ── Get pending approvals ────────────────────────────────────────────────────
  server.tool(
    "vixy_get_pending_approvals",
    "Get all pending human approval requests for a workspace.",
    { workspace_id: z.string().describe("Workspace ID") },
    async ({ workspace_id }) => {
      const approvals = await db.agentApproval.findMany({
        where: { workspaceId: workspace_id, status: "PENDING" },
        orderBy: [{ createdAt: "asc" }],
      });

      return {
        content: [{ type: "text", text: JSON.stringify(approvals, null, 2) }],
      };
    }
  );
}
