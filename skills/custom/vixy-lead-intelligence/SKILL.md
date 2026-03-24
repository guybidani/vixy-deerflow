---
name: vixy-lead-intelligence
description: Use this skill for conversation intelligence — analyzing WhatsApp leads, understanding intent, suggesting replies, identifying hot leads, and generating bulk conversation insights. Use when asked to "analyze conversations", "who are the hot leads", "suggest replies", or "what are leads asking about".
license: MIT
allowed-tools:
  - vixy_get_unread_conversations
  - vixy_bulk_analyze_conversations
  - vixy_recall
  - vixy_remember
  - vixy_reply_to_lead
  - vixy_request_approval
version: "1.0"
author: "vixy"
---

# Vixy Lead Intelligence Skill

## Purpose
Analyze WhatsApp conversations at scale to identify hot leads, understand common objections, and generate reply suggestions.

## CRITICAL RULE
**Never analyze conversations one by one.** Always use `vixy_bulk_analyze_conversations` which processes all open conversations in a single AI call. This saves 90% of API tokens.

## Execution Flow

### Step 1: Context
```
vixy_recall(workspace_id, query="common objections, hot lead signals, reply patterns")
vixy_get_unread_conversations(workspace_id)
```

### Step 2: Bulk Analysis
```
vixy_bulk_analyze_conversations(workspace_id)
```

This returns for each conversation:
- Intent classification: `interested` / `objection` / `question` / `not_relevant` / `closed`
- Sentiment: `positive` / `neutral` / `negative`
- Suggested reply in Hebrew
- Urgency level: `hot` / `warm` / `cold`
- Key topics discussed

### Step 3: Prioritize

Sort conversations by:
1. 🔥 HOT: high intent + positive sentiment → reply immediately
2. 🌡️ WARM: interested but has objections → needs personalized handling
3. ❄️ COLD: not relevant or negative → lower priority

### Step 4: Actions

**Hot leads (🔥):**
- Draft reply using suggested_reply from bulk analysis
- Use `vixy_request_approval` for human to review before sending
- Include: what the lead asked, why they're hot, proposed reply

**Warm leads with objections (🌡️):**
- Identify common objections across all conversations
- Generate objection-handling script
- Request approval for batch reply strategy

**Patterns to surface:**
- Most common questions this week → update FAQ/templates
- Price objections → flag to human for consideration
- Product-specific questions → suggest ad copy improvements

### Step 5: Insights Report

Deliver Hebrew summary:

**סיכום שיחות (Conversation Summary)**
- Total unread, breakdown by intent
- Top 3 hot leads (name, what they want, urgency)

**תמות עיקריות (Main Themes)**
- What are most leads asking about?
- What objections are coming up most?

**המלצות (Recommendations)**
- Immediate: who to reply to now
- Template updates needed
- Campaign messaging adjustments based on real feedback

**תשובות מוצעות (Suggested Replies)**
- For each hot lead: lead name, context, Hebrew reply draft

### Step 6: Memory
```
vixy_remember(workspace_id, key="conversation_patterns", value="[date]: Common objections: X, Y. Hot lead signals: Z. What's converting: ...")
```
