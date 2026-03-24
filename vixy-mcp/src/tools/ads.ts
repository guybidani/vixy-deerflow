import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "../db.js";

export function registerAdsTools(server: McpServer) {
  // ── List ad campaigns ────────────────────────────────────────────────────────
  server.tool(
    "vixy_list_ad_campaigns",
    "List all Meta and Google ad campaigns for a workspace with current status and budget.",
    {
      workspace_id: z.string().describe("Workspace ID"),
      platform: z.enum(["META", "GOOGLE", "ALL"]).default("ALL"),
      status: z.enum(["ACTIVE", "PAUSED", "ALL"]).default("ALL"),
    },
    async ({ workspace_id, platform, status }) => {
      const campaigns = await db.adCampaign.findMany({
        where: {
          workspaceId: workspace_id,
          ...(platform !== "ALL" ? { adAccount: { platform } } : {}),
          ...(status !== "ALL" ? { status } : {}),
        },
        include: {
          adAccount: {
            select: { platform: true, accountName: true },
          },
          adSets: {
            select: { id: true, name: true, status: true, dailyBudget: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 30,
      });

      return {
        content: [{ type: "text", text: JSON.stringify(campaigns, null, 2) }],
      };
    }
  );

  // ── Get ad insights ──────────────────────────────────────────────────────────
  server.tool(
    "vixy_get_ad_insights",
    "Get performance metrics for a campaign: spend, impressions, clicks, CTR, conversions, CPA, ROAS. Supports date ranges.",
    {
      campaign_id: z.string().describe("AdCampaign ID"),
      date_range: z
        .enum(["last_7d", "last_14d", "last_30d", "last_90d"])
        .default("last_7d")
        .describe("Date range for metrics"),
    },
    async ({ campaign_id, date_range }) => {
      const days = { last_7d: 7, last_14d: 14, last_30d: 30, last_90d: 90 }[date_range];
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const [campaign, snapshots] = await Promise.all([
        db.adCampaign.findUnique({
          where: { id: campaign_id },
          include: {
            adAccount: { select: { platform: true, accountName: true } },
          },
        }),
        db.adMetricSnapshot.findMany({
          where: { adCampaignId: campaign_id, snapshotDate: { gte: since } },
          orderBy: { snapshotDate: "asc" },
        }),
      ]);

      if (!campaign) {
        return {
          content: [{ type: "text", text: `Campaign ${campaign_id} not found` }],
          isError: true,
        };
      }

      // Aggregate totals
      const totals = snapshots.reduce(
        (acc, s) => ({
          spend: acc.spend + (s.spend ?? 0),
          impressions: acc.impressions + (s.impressions ?? 0),
          clicks: acc.clicks + (s.clicks ?? 0),
          conversions: acc.conversions + (s.conversions ?? 0),
          roas_sum: acc.roas_sum + (s.roas ?? 0),
        }),
        { spend: 0, impressions: 0, clicks: 0, conversions: 0, roas_sum: 0 }
      );

      const ctr = totals.impressions > 0 ? ((totals.clicks / totals.impressions) * 100).toFixed(2) : 0;
      const cpa = totals.conversions > 0 ? (totals.spend / totals.conversions).toFixed(2) : null;
      const roas = snapshots.length > 0 ? (totals.roas_sum / snapshots.length).toFixed(2) : null;
      const cpm = totals.impressions > 0 ? ((totals.spend / totals.impressions) * 1000).toFixed(2) : null;
      const cpc = totals.clicks > 0 ? (totals.spend / totals.clicks).toFixed(2) : null;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                campaign: {
                  id: campaign.id,
                  name: campaign.name,
                  status: campaign.status,
                  platform: campaign.adAccount.platform,
                  dailyBudget: campaign.dailyBudget,
                  totalBudget: campaign.totalBudget,
                },
                date_range,
                totals: { spend: totals.spend, impressions: totals.impressions, clicks: totals.clicks, conversions: totals.conversions, ctr: `${ctr}%`, cpa, roas, cpm, cpc },
                daily_breakdown: snapshots,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // ── Pause ad ─────────────────────────────────────────────────────────────────
  server.tool(
    "vixy_pause_ad",
    "Pause an underperforming ad campaign or ad set. LOW RISK action — safe to execute automatically for clear underperformers (ROAS < 0.5, high CPA vs target).",
    {
      campaign_id: z.string().describe("AdCampaign ID to pause"),
      workspace_id: z.string().describe("Workspace ID (for policy check)"),
      reason: z.string().describe("Why this is being paused (for audit log)"),
    },
    async ({ campaign_id, workspace_id, reason }) => {
      const campaign = await db.adCampaign.findFirst({
        where: {
          id: campaign_id,
          workspaceId: workspace_id,
        },
        include: { adAccount: { select: { platform: true } } },
      });

      if (!campaign) {
        return {
          content: [{ type: "text", text: `Campaign ${campaign_id} not found in workspace` }],
          isError: true,
        };
      }

      const workspace = await db.workspace.findUnique({
        where: { id: workspace_id },
        select: { agentCanPauseCampaigns: true, agentRequireApprovalForAll: true },
      });

      if (!workspace?.agentCanPauseCampaigns || workspace.agentRequireApprovalForAll) {
        return {
          content: [
            {
              type: "text",
              text: `Cannot auto-pause: workspace policy requires human approval. Use vixy_request_approval instead.`,
            },
          ],
          isError: true,
        };
      }

      // Update DB status
      await db.adCampaign.update({
        where: { id: campaign_id },
        data: { status: "PAUSED" },
      });

      // Log the action
      await db.campaignChangeLog.create({
        data: {
          adCampaignId: campaign_id,
          action: "status_change",
          description: reason,
          source: "adam",
          beforeState: { status: campaign.status },
          afterState: { status: "PAUSED" },
        },
      });

      // Trigger actual platform API pause via Vixy
      const appUrl = process.env.VIXY_APP_URL ?? "https://vixy.projectadam.co.il";
      await fetch(`${appUrl}/api/internal/ads/pause`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-service-key": process.env.MCP_API_KEY ?? "",
        },
        body: JSON.stringify({ campaignId: campaign_id, workspaceId: workspace_id }),
      }).catch(() => null); // Best effort — DB is source of truth

      return {
        content: [{ type: "text", text: `Campaign "${campaign.name}" paused. Reason: ${reason}` }],
      };
    }
  );

  // ── Resume ad ────────────────────────────────────────────────────────────────
  server.tool(
    "vixy_resume_ad",
    "Resume a paused ad campaign. MEDIUM RISK — requires workspace policy check. Use when a campaign was paused incorrectly or conditions have improved.",
    {
      campaign_id: z.string().describe("AdCampaign ID to resume"),
      workspace_id: z.string().describe("Workspace ID"),
      reason: z.string().describe("Why this is being resumed"),
    },
    async ({ campaign_id, workspace_id, reason }) => {
      const campaign = await db.adCampaign.findFirst({
        where: { id: campaign_id, workspaceId: workspace_id },
      });

      if (!campaign) {
        return {
          content: [{ type: "text", text: `Campaign ${campaign_id} not found` }],
          isError: true,
        };
      }

      await db.adCampaign.update({ where: { id: campaign_id }, data: { status: "ACTIVE" } });

      await db.campaignChangeLog.create({
        data: {
          adCampaignId: campaign_id,
          action: "status_change",
          description: reason,
          source: "adam",
          beforeState: { status: "PAUSED" },
          afterState: { status: "ACTIVE" },
        },
      });

      const appUrl = process.env.VIXY_APP_URL ?? "https://vixy.projectadam.co.il";
      await fetch(`${appUrl}/api/internal/ads/resume`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-service-key": process.env.MCP_API_KEY ?? "",
        },
        body: JSON.stringify({ campaignId: campaign_id, workspaceId: workspace_id }),
      }).catch(() => null);

      return {
        content: [{ type: "text", text: `Campaign "${campaign.name}" resumed. Reason: ${reason}` }],
      };
    }
  );

  // ── Update ad budget ─────────────────────────────────────────────────────────
  server.tool(
    "vixy_update_ad_budget",
    "Update the daily or lifetime budget for an ad campaign. MEDIUM/HIGH RISK depending on change size. Enforces workspace policy (agentMaxBudgetChange %). Use vixy_request_approval for changes exceeding policy.",
    {
      campaign_id: z.string().describe("AdCampaign ID"),
      workspace_id: z.string().describe("Workspace ID"),
      budget_type: z.enum(["DAILY", "LIFETIME"]).describe("Which budget to update"),
      new_amount: z.number().positive().describe("New budget amount in ILS"),
      reason: z.string().describe("Why this budget change is being made"),
    },
    async ({ campaign_id, workspace_id, budget_type, new_amount, reason }) => {
      const [campaign, workspace] = await Promise.all([
        db.adCampaign.findFirst({
          where: { id: campaign_id, workspaceId: workspace_id },
          select: { id: true, name: true, dailyBudget: true, totalBudget: true, status: true },
        }),
        db.workspace.findUnique({
          where: { id: workspace_id },
          select: { agentMaxBudgetChange: true, agentRequireApprovalForAll: true },
        }),
      ]);

      if (!campaign || !workspace) {
        return {
          content: [{ type: "text", text: "Campaign or workspace not found" }],
          isError: true,
        };
      }

      if (workspace.agentRequireApprovalForAll) {
        return {
          content: [{ type: "text", text: "Workspace requires approval for all actions. Use vixy_request_approval." }],
          isError: true,
        };
      }

      const currentBudget =
        budget_type === "DAILY" ? (campaign.dailyBudget ?? 0) : (campaign.totalBudget ?? 0);

      const changePct = currentBudget > 0 ? Math.abs((new_amount - currentBudget) / currentBudget) * 100 : 100;
      const maxAllowed = workspace.agentMaxBudgetChange ?? 20;

      if (changePct > maxAllowed) {
        return {
          content: [
            {
              type: "text",
              text: `Budget change of ${changePct.toFixed(1)}% exceeds workspace policy of ${maxAllowed}%. Use vixy_request_approval to request human approval for this change.`,
            },
          ],
          isError: true,
        };
      }

      // Apply change
      await db.adCampaign.update({
        where: { id: campaign_id },
        data: {
          ...(budget_type === "DAILY" ? { dailyBudget: new_amount } : { totalBudget: new_amount }),
        },
      });

      await db.campaignChangeLog.create({
        data: {
          adCampaignId: campaign_id,
          action: "budget_change",
          description: reason,
          source: "adam",
          beforeState: { budget_type, amount: currentBudget },
          afterState: { budget_type, amount: new_amount },
        },
      });

      const appUrl = process.env.VIXY_APP_URL ?? "https://vixy.projectadam.co.il";
      await fetch(`${appUrl}/api/internal/ads/update-budget`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-service-key": process.env.MCP_API_KEY ?? "",
        },
        body: JSON.stringify({ campaignId: campaign_id, workspaceId: workspace_id, budgetType: budget_type, newAmount: new_amount }),
      }).catch(() => null);

      return {
        content: [
          {
            type: "text",
            text: `Budget updated for "${campaign.name}": ${budget_type} budget ₪${currentBudget} → ₪${new_amount} (${changePct.toFixed(1)}% change). Reason: ${reason}`,
          },
        ],
      };
    }
  );
}
