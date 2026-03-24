---
name: vixy-patrol
description: Use this skill when performing an autonomous patrol of Vixy workspaces — checking campaign performance, analyzing unread conversations, and executing safe optimizations. Triggered automatically or when asked to "scan", "patrol", or "run daily check".
license: MIT
allowed-tools:
  - vixy_list_workspaces
  - vixy_get_workspace_context
  - vixy_get_unread_conversations
  - vixy_get_optimization_recommendations
  - vixy_get_pending_insights
  - vixy_list_ad_campaigns
  - vixy_get_ad_insights
  - vixy_pause_ad
  - vixy_update_ad_budget
  - vixy_bulk_analyze_conversations
  - vixy_remember
  - vixy_recall
  - vixy_request_approval
  - vixy_mark_insight_processed
version: "1.0"
author: "vixy"
---

# Vixy Autonomous Patrol Skill

## Purpose
Perform a comprehensive autonomous patrol of all Vixy workspaces. This is the daily/twice-daily autonomous run.

## Execution Flow

### Step 1: List workspaces
Call `vixy_list_workspaces` to get all active workspaces.

### Step 2: For each workspace (can parallelize with sub-agents)
For each workspace, gather context in a single pass:
1. `vixy_recall` — retrieve workspace memory (what has worked, client preferences, known issues)
2. `vixy_get_workspace_context` — full context: campaigns, recent metrics, platform connections
3. `vixy_get_unread_conversations` — unread WhatsApp messages
4. `vixy_get_optimization_recommendations` — pending AI recommendations
5. `vixy_get_pending_insights` — unprocessed proactive insights

### Step 3: Analyze everything TOGETHER
**IMPORTANT:** Do NOT analyze each conversation separately. Build a single situation report:

```
Workspace: [name]
Connected platforms: [Meta / Google / both]
Active campaigns: [count, budgets]
Performance vs last week: [up/down %]
Unread conversations: [count, main themes]
Pending optimizations: [count, risk levels]
Memory context: [relevant past learnings]
```

### Step 4: Take safe actions automatically
Execute LOW RISK actions without asking:
- Pause ads with ROAS < 0.5 (spending without returns)
- Apply pending optimization recommendations with risk=LOW
- Mark processed insights as done

For MEDIUM RISK actions: execute if within workspace policy (check agentMaxBudgetChange)

For HIGH RISK actions: use `vixy_request_approval` with clear Hebrew explanation of what and why.

### Step 5: Save learnings
Use `vixy_remember` to persist:
- Any new patterns discovered
- Decisions made and the reasoning
- Unusual performance data worth watching

### Step 6: Summary
Return a Hebrew summary of actions taken per workspace:
- ✅ Actions executed automatically
- ⏳ Approvals requested (and why)
- 💡 Key insights discovered
- ⚠️ Issues that need human attention

## Important Rules
- Batch conversations — never call `vixy_get_conversation_messages` in a loop
- Use `vixy_bulk_analyze_conversations` for conversation analysis
- Don't duplicate work — if an optimization recommendation already exists for something, skip it
- Israeli time context: morning patrol (09:00) focuses on overnight performance; evening patrol (17:00) focuses on day results
