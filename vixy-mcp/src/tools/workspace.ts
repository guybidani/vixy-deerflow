import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "../db.js";

export function registerWorkspaceTools(server: McpServer) {
  // ── List workspaces ─────────────────────────────────────────────────────────
  server.tool(
    "vixy_list_workspaces",
    "List all active Vixy workspaces (brands/clients). Returns id, name, industry, platform connections, agent policies.",
    {},
    async () => {
      const workspaces = await db.workspace.findMany({
        select: {
          id: true,
          name: true,
          organizationId: true,
          agentTier: true,
          agentMaxBudgetChange: true,
          agentCanPauseCampaigns: true,
          agentCanCreateCampaigns: true,
          agentRequireApprovalForAll: true,
          workspaceProfile: {
            select: {
              industry: true,
              targetAudience: true,
              products: true,
            },
          },
        },
        orderBy: { name: "asc" },
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(workspaces, null, 2),
          },
        ],
      };
    }
  );

  // ── Get full workspace context ───────────────────────────────────────────────
  server.tool(
    "vixy_get_workspace_context",
    "Get comprehensive context for a workspace: active ad campaigns, recent metrics (last 7 days), workspace profile, and agent policies. Call this first before taking any actions.",
    { workspace_id: z.string().describe("Workspace ID") },
    async ({ workspace_id }) => {
      const [workspace, adCampaigns, recentMetrics] = await Promise.all([
        db.workspace.findUnique({
          where: { id: workspace_id },
          include: {
            workspaceProfile: true,
          },
        }),

        db.adCampaign.findMany({
          where: {
            workspaceId: workspace_id,
            status: { in: ["ACTIVE", "PAUSED"] },
          },
          select: {
            id: true,
            name: true,
            status: true,
            objective: true,
            dailyBudget: true,
            totalBudget: true,
            platformId: true,
            adAccount: { select: { platform: true, accountName: true } },
          },
          take: 20,
        }),

        db.adMetricSnapshot.findMany({
          where: {
            adCampaign: { workspaceId: workspace_id },
            snapshotDate: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
          },
          select: {
            adCampaignId: true,
            snapshotDate: true,
            spend: true,
            impressions: true,
            clicks: true,
            conversions: true,
            roas: true,
          },
          orderBy: { snapshotDate: "desc" },
          take: 100,
        }),
      ]);

      if (!workspace) {
        return {
          content: [{ type: "text", text: `Workspace ${workspace_id} not found` }],
          isError: true,
        };
      }

      // Aggregate metrics per campaign
      const metricsMap = recentMetrics.reduce(
        (acc: Record<string, { spend: number; impressions: number; clicks: number; conversions: number; roas_sum: number; count: number }>, m: any) => {
          if (!acc[m.adCampaignId]) {
            acc[m.adCampaignId] = {
              spend: 0,
              impressions: 0,
              clicks: 0,
              conversions: 0,
              roas_sum: 0,
              count: 0,
            };
          }
          acc[m.adCampaignId].spend += m.spend ?? 0;
          acc[m.adCampaignId].impressions += m.impressions ?? 0;
          acc[m.adCampaignId].clicks += m.clicks ?? 0;
          acc[m.adCampaignId].conversions += m.conversions ?? 0;
          acc[m.adCampaignId].roas_sum += m.roas ?? 0;
          acc[m.adCampaignId].count += 1;
          return acc;
        },
        {} as Record<string, { spend: number; impressions: number; clicks: number; conversions: number; roas_sum: number; count: number }>
      );

      const campaignsWithMetrics = adCampaigns.map((c: any) => {
        const m = metricsMap[c.id] ?? { spend: 0, impressions: 0, clicks: 0, conversions: 0, roas_sum: 0, count: 0 };
        const ctr = m.impressions > 0 ? ((m.clicks / m.impressions) * 100).toFixed(2) : "0";
        const cpa = m.conversions > 0 ? (m.spend / m.conversions).toFixed(2) : null;
        const roas = m.count > 0 ? (m.roas_sum / m.count).toFixed(2) : null;
        return { ...c, metrics_7d: { spend: m.spend, impressions: m.impressions, clicks: m.clicks, conversions: m.conversions, ctr: `${ctr}%`, cpa, roas } };
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                workspace: {
                  id: workspace.id,
                  name: workspace.name,
                  organizationId: workspace.organizationId,
                  profile: workspace.workspaceProfile,
                  agentPolicy: {
                    tier: workspace.agentTier,
                    maxBudgetChangePct: workspace.agentMaxBudgetChange,
                    canPauseCampaigns: workspace.agentCanPauseCampaigns,
                    canCreateCampaigns: workspace.agentCanCreateCampaigns,
                    requireApprovalAll: workspace.agentRequireApprovalForAll,
                  },
                },
                campaigns: campaignsWithMetrics,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // ── Get pending proactive insights ──────────────────────────────────────────
  server.tool(
    "vixy_get_pending_insights",
    "Get unprocessed proactive insights for a workspace (performance alerts, anomalies, opportunities detected by the system).",
    { workspace_id: z.string().describe("Workspace ID") },
    async ({ workspace_id }) => {
      const insights = await db.proactiveInsight.findMany({
        where: { workspaceId: workspace_id, isDismissed: false, isRead: false },
        orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
        take: 20,
      });

      return {
        content: [{ type: "text", text: JSON.stringify(insights, null, 2) }],
      };
    }
  );

  // ── Mark insight as processed ────────────────────────────────────────────────
  server.tool(
    "vixy_mark_insight_processed",
    "Mark a proactive insight as processed after it has been acted upon.",
    { insight_id: z.string().describe("Insight ID to mark as processed") },
    async ({ insight_id }) => {
      await db.proactiveInsight.update({
        where: { id: insight_id },
        data: { isDismissed: true },
      });

      return {
        content: [{ type: "text", text: `Insight ${insight_id} marked as processed.` }],
      };
    }
  );
}
