#!/usr/bin/env bash
# Skill arsenal build-out 2026-05-19 - plugin marketplace adds
# Run once from any Claude Code session: /plugin commands are session-local
# but marketplace registrations persist to ~/.claude/plugins/known_marketplaces.json
#
# Phase 2 Tier-1 marketplaces (load-bearing, install in order)

set -e

echo "Phase 2 — Track A Tier 1 marketplaces"

# A4: Geoffrey Huntley's Superpowers (197k stars, doctrine-mirror)
claude /plugin marketplace add obra/superpowers

# A5: wshobson/agents (35.6k, 185 agents, 80 plugins, 153 skills)
claude /plugin marketplace add wshobson/agents

# A6: anthropics/skills (137k, official skills library)
claude /plugin marketplace add anthropics/skills

# A7: jarrodwatts/claude-hud (23.1k, statusline + HUD)
claude /plugin marketplace add jarrodwatts/claude-hud

# A14: trailofbits/skills (security gold)
claude /plugin marketplace add trailofbits/skills

# A15: NeoLabHQ context-engineering-kit (SADD dispatch_worker upgrade)
claude /plugin marketplace add NeoLabHQ/context-engineering-kit

echo ""
echo "Then install specific plugins:"
echo "  claude /plugin install skill-creator@claude-plugins-official"
echo "  claude /plugin install claude-md-management@claude-plugins-official"
echo "  claude /plugin install hookify@claude-plugins-official"
echo "  claude /plugin install webapp-testing@claude-plugins-official"
echo "  claude /plugin install mcp-builder@claude-plugins-official"
echo "  claude /plugin install superpowers@obra/superpowers"
echo "  claude /plugin install claude-hud@jarrodwatts/claude-hud"
echo "  claude /plugin install subagent-driven-development@NeoLabHQ/context-engineering-kit"
echo ""
echo "Restart Claude Code session to pick up enabled plugins."
