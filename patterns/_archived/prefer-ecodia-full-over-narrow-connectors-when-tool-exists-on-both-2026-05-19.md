---
status: archived
archived_at: 2026-05-29
archived_reason: "Inverted by the 2026-05-29 MCP migration. ecodia-full is now deprecated; the narrow connectors are canonical. This pattern's original advice (prefer ecodia-full) would send future-me back to a sunset-pending surface."
superseded_by: mcp-narrow-connectors-are-canonical-cowork-v2-and-ecodia-full-deprecated-2026-05-29
triggers: ecodia-full-first, prefer-ecodia-full, claude-ai-connector-expired, requires-re-authorization, token-expired-mcp, mcp-narrow-vs-wide, mcp-routing-discipline, ecodia-full-bearer
---

# SUPERSEDED - prefer the narrow connectors, not ecodia-full

**This pattern is archived. Its original advice is now wrong.**

The 2026-05-19 rule said: when a tool exists on both ecodia-full and a narrow connector, try ecodia-full first (the narrow claude.ai connectors aged out their per-connector tokens). That made sense while ecodia-full was the stable wide surface.

The 2026-05-29 MCP migration reversed it. `ecodia-full` is now deprecated and sunset-pending (status_board `2bf2c734`). The narrow domain-scoped connectors are canonical and are loaded directly into the local seat's `.mcp.json` with their own scoped bearers, so they no longer hit the "token expired, re-authorize" failure that motivated the old rule.

**Correct rule now:** route every MCP call through the narrow connector that owns the tool. If a tool seems missing, load the matching narrow connector into `.mcp.json` rather than reaching for ecodia-full. See [[mcp-narrow-connectors-are-canonical-cowork-v2-and-ecodia-full-deprecated-2026-05-29]].

The original failure mode this pattern prevented (reporting a tool "blocked on re-auth" without trying the working surface) still holds in spirit: before declaring any MCP tool unavailable, check whether the right narrow connector is loaded. See [[when-a-tool-is-unavailable-solve-the-routing-problem-do-not-accept-the-block]] and [[route-around-block-means-fix-this-turn-not-log-for-later]].
