---
name: vixy-campaign-analysis
description: Use this skill for deep campaign analysis — comparing performance across platforms, identifying what's working, diagnosing issues, and generating actionable recommendations. Use when asked to "analyze campaigns", "why is X underperforming", "compare Meta vs Google", or "deep dive" on a workspace.
license: MIT
allowed-tools:
  - vixy_get_workspace_context
  - vixy_list_ad_campaigns
  - vixy_get_ad_campaign_details
  - vixy_get_ad_insights
  - vixy_recall
  - vixy_remember
  - vixy_request_approval
  - web_search
  - bash
version: "1.0"
author: "vixy"
---

# Vixy Campaign Analysis Skill

## Purpose
Perform a structured deep-dive into campaign performance for a workspace. Produces actionable insights and concrete recommendations.

## When to Use Sub-agents
If the workspace has both Meta and Google campaigns, **spawn two sub-agents in parallel:**
- `task(description="Analyze Meta Ads campaigns", subagent_type="general-purpose", prompt="...")`
- `task(description="Analyze Google Ads campaigns", subagent_type="general-purpose", prompt="...")`

Then synthesize both results.

## Analysis Framework

### 1. Context Gathering
```
vixy_recall(workspace_id, query="campaign performance history")
vixy_get_workspace_context(workspace_id)
vixy_list_ad_campaigns(workspace_id)
```

### 2. Performance Pull (last 30 days + last 7 days)
For each campaign:
```
vixy_get_ad_insights(campaign_id, date_range="last_30d")
vixy_get_ad_insights(campaign_id, date_range="last_7d")
```

### 3. Analysis Dimensions

**Volume metrics:**
- Impressions, reach, frequency
- Clicks, CTR
- Conversions, conversion rate

**Efficiency metrics:**
- CPM (cost per 1000 impressions)
- CPC (cost per click)
- CPA (cost per acquisition)
- ROAS (return on ad spend)

**Trend analysis:**
- Week-over-week change on each metric
- Learning phase status (Google: needs 50 conversions/7 days)
- Audience fatigue signals (rising frequency, falling CTR)

### 4. Diagnosis Template

For each underperforming campaign, identify:
```
Issue: [what's wrong]
Root cause: [why it's wrong]
Evidence: [specific numbers]
Recommendation: [what to do]
Risk level: [low/medium/high]
Expected impact: [what will change]
```

### 5. Cross-Platform Comparison (if applicable)
```
| Metric | Meta | Google | Winner |
|--------|------|--------|--------|
| CPA    | ₪X   | ₪Y     | ?      |
| ROAS   | X    | Y      | ?      |
| Volume | X    | Y      | ?      |
```

Budget reallocation recommendation: if one platform has significantly better CPA/ROAS, recommend shifting budget.

### 6. Output Format

Deliver a Hebrew summary with:

**סיכום ביצועים (Performance Summary)**
- Overall ROAS, total spend, total revenue this period
- Trend vs last period

**מה עובד (What's Working)**
- Top 3 performing campaigns/ad sets with metrics

**בעיות (Issues)**
- Ranked by financial impact (biggest waste first)

**המלצות מיידיות (Immediate Recommendations)**
- Ordered by impact, with risk level and expected result

**המלצות ארוכות טווח (Long-term Recommendations)**
- Strategic shifts, new tests to run, audience expansions

### 7. Save Learnings
Always call `vixy_remember` with:
- Key performance patterns discovered
- What's working for this client's audience
- Confirmed hypotheses from previous recommendations
