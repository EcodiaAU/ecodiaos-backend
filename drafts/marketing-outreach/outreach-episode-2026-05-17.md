---
type: pending_neo4j_write
node_label: Episode
created: 2026-05-17T00:00:00+10:00
status: pending_mcp_reconnect
---

# Pending Neo4j episode write - marketing-outreach 2026-05-17

## Episode payload

```json
{
  "name": "marketing-outreach 2026-05-17T00:00:00+10:00",
  "description": "Pipeline scan: MCP servers (ecodia-core, ecodia-comms, ecodia-crm) token-expired, fell back to filesystem + remote API discovery. LinkedIn post drafted (category: B - tech insight: AHK reflex substrate vs failed URI handler). LinkedIn DMs: skipped (LinkedIn tools not in session scope; cowork bearer required for tools/call). Portfolio audit: skipped (Vercel/ecodia.au not accessible without authenticated MCP). CRM follow-ups: skipped (CRM MCP expired). Blocked substrates logged as pending writes in drafts/marketing-outreach/. Next marketing-outreach in 72h.",
  "type": "cowork_realisation"
}
```

## kv_store pending writes

Apply these once MCP tokens are refreshed:

```json
{
  "ceo.last_marketing_action": "2026-05-17T00:00:00+10:00",
  "cowork.marketing-outreach.linkedin_drafts.recent": [
    {
      "timestamp": "2026-05-17T00:00:00+10:00",
      "category": "B",
      "title": "AHK macro vs VS Code URI handler - cron substrate pivot",
      "status": "pending_tate_review"
    }
  ]
}
```

## status_board pending rows

Apply these once MCP tokens are refreshed:

```json
[
  {
    "entity_type": "task",
    "entity_ref": "linkedin-post-2026-05-17",
    "name": "LinkedIn post draft pending Tate review - tech insight (AHK reflex substrate)",
    "status": "draft_ready",
    "next_action": "Review draft at drafts/marketing-outreach/linkedin-post-draft-2026-05-17.md, edit if needed, post to LinkedIn",
    "next_action_by": "tate",
    "priority": 3
  },
  {
    "entity_type": "infrastructure",
    "entity_ref": "mcp-token-expiry-2026-05-17",
    "name": "MCP server tokens expired - ecodia-core, ecodia-comms, ecodia-crm",
    "status": "blocked",
    "next_action": "Refresh bearer tokens for remote MCP servers; marketing-outreach cron ran on degraded substrate (filesystem only) this fire",
    "next_action_by": "tate",
    "priority": 2
  }
]
```

## Infrastructure blocker note

The three remote MCP servers (ecodia-core, ecodia-comms, ecodia-crm) returned `requires re-authorization (token expired)` on this fire. The cowork endpoint at `api.admin.ecodia.au/api/mcp/cowork/` is reachable (health OK, initialize OK, tools/list OK) but `tools/call` requires the bearer stored at `kv_store.creds.cowork_mcp_bearer` which is inaccessible without a working MCP session. This is a circular dependency. Tate needs to refresh the MCP server auth tokens to restore full substrate access.
