---
triggers: streaming-substrate, stream.publish, stream.tail, stream.subscribe, stream.list_channels, sse-channel, perception-bus-replacement, mcp-vs-stream, channel-naming, retention-defaults, /api/stream, vercel.deploys, status_board.writes, observer.signals, stripe.events, corazon.files, meetings.live, real-time-feed, late-subscribe-replay, mcp-not-streaming, kv_store.cowork.stream
---

# Streaming substrate complements MCP - publish event-shaped data, write state-shaped data via MCP

## The rule

EcodiaOS has TWO substrate-access primitives, not one. Use each for the shape of data it was built for.

- **MCP (`/api/mcp/cowork`, `/api/mcp/ecodia-full`)** is the substrate for **state-shaped, single-reader, durable** data: status_board rows, kv_store keys, Neo4j writes, factory dispatch, gmail send. Synchronous request -> response. Audited, scoped, rate-capped per call. The right shape when the conductor asks "what is X right now" or "make X true".

- **Streaming substrate (`/api/stream/<channel>`, `stream.*` MCP tools)** is the substrate for **event-shaped, broadcast-many, real-time** data: live vercel deploy progress, stripe webhook tail, observer signal feed, status_board write fan-out, corazon file save events, live meeting transcript chunks. Async fire-and-forget publish, multiple subscribers via SSE. The right shape when many surfaces need to react to "X just happened" without polling MCP.

Treat streaming substrate as a peer to MCP, not an afterthought. Authored 2026-05-15 as Phase 2 Lane 06.

## Why

MCP is the wrong shape for tailing a log, watching a webhook stream, fanning a single event out to many surfaces, or surfacing late-replay history. Forcing streaming through MCP either burns a tool call per event (token cost), or requires the consumer to long-poll (latency). The legacy VPS papered over this with the perceptionDispatcher in-process bus + WebSocket fan-out to the custom frontend. The frontend was deleted in Phase 1 Lane G, so the fan-out died with it. Streaming substrate is the replacement.

## When to publish to a stream

Publish to a stream when the data is:

1. Event-shaped: a discrete thing happened at a discrete time, and downstream surfaces want to know the moment it did.
2. Broadcast-many: more than one consumer surface might react (live dashboard, VS Code extension panel, conductor turn observer, ambient telemetry).
3. Real-time: latency from "happened" to "consumer sees it" should be sub-second.
4. Replayable for late-subscribers: a consumer that connects 5 minutes after the event still wants the last N.

Examples now wired (2026-05-15): vercel.deploys, status_board.writes, observer.signals.

## When to write to MCP / kv_store directly (NOT a stream)

Write via MCP when the data is:

1. State-shaped: "the current value of X is Y" - status_board status field, kv_store config, Neo4j Decision node.
2. Single-reader: only one consumer reads it, and they read on demand.
3. Durable-with-history: the substrate itself is the source of truth (Postgres rows, Neo4j nodes, kv_store strings).
4. Audited / scoped / rate-capped per call.

Streams are LOSSY by design (in-memory ring + capped LIFO persistence). They are NOT a database. If a consumer disappearing means the event must wait, it belongs in a queue (messageQueue) not a stream.

## Channel naming convention

`<domain>.<event-class>` in lower-case dot-separated form. Examples: `vercel.deploys`, `status_board.writes`, `observer.signals`, `corazon.files`, `meetings.live`, `stripe.events`. Domain on the left (the substrate or system the event originated from), event-class on the right (the noun for what changed). One channel per (domain, event-class) tuple. Do not split by event-type within an event-class - the consumer filters on event_type field.

## Retention defaults + when to override

Default in `streamingService.js`: 100 in-memory ring + matching kv_store LIFO cap, TTL governed by `retention_ttl_seconds` field per channel in `backend/streaming/channels.json`.

Override per channel:

- High-volume channels (status_board.writes, vercel.deploys) get `retention_count: 200`, TTL 24h.
- High-history-value channels (stripe.events) get `retention_count: 500`, TTL 7d.
- Low-volume / short-lived channels (meetings.live, corazon.files) get small caps (50-100) and TTL 10min - 1h.
- Match the cap to "how far back would a late-subscribing consumer realistically want history".

## Architecture map

- `backend/streaming/channels.json` - channel registry. Source of truth. Anything not listed is rejected at publish/subscribe time. Edit + ship together.
- `backend/src/services/streamingService.js` - in-process channel hub. EventEmitter-backed pubsub + ring buffer + kv_store persistence + late-subscribe replay. NOT clustered (single-process). If we ever need multi-process, swap the EventEmitter for Redis pub/sub without changing the service interface.
- `backend/src/routes/streaming.js` - HTTP + SSE surface mounted at `/api/stream`. Bearer auth via `ecodiaFullAuth`.
- `backend/src/routes/mcp/cowork.js` - 4 MCP tool handlers: stream.list_channels, stream.tail, stream.subscribe, stream.publish. Surface re-exposed via ecodia-full automatically.
- Persistence shape: `kv_store.cowork.stream.<channel>.events` is a JSON array (most-recent first) capped to `retention_count`. `streamingService` rehydrates the in-memory ring from this on first publish/tail per channel after boot.
- pm2 reload rehydrate is verified end-to-end (06.6e, 2026-05-15).

## Wiring rules for new publishers

1. The publisher imports `require('../../services/streamingService')` and calls `streaming.publishSync(channel, { event_type, payload })` at the moment the event happens. Use `publishSync` (fire-and-forget) for hot paths like webhook handlers; use `await streaming.publish(...)` only when the caller needs the event id back.
2. Publishing is best-effort. Errors are logged at debug, never thrown to the caller. Streaming MUST NOT take down the primary path.
3. Add the channel to `channels.json` BEFORE the first publisher ships - publish to an unknown channel returns 404 / `unknown_channel`.
4. For webhook publishers, publish AFTER signature verification but BEFORE forwarding to the routine - so the live broadcast does not double-fire on duplicate webhooks.
5. For MCP tool publishers (e.g. status_board.writes), publish AFTER the durable substrate write succeeds - so the broadcast cannot leak phantom state that did not commit.

## SSE format on the wire

```
id: <event_id>
event: <event_type>
data: {"id":"...","channel":"...","event_type":"...","observed_at":"...","payload":{...}}

```

Late-subscriber replay is automatic: pass `?since=<event_id>` (or use the standard `Last-Event-ID` request header on reconnect) to get events from `since_id` to head before the live tail. Heartbeat: `: hb <ts>` comment every 25 seconds. Auto-close at 30 minute hard cap (re-connect from the client).

## Anti-patterns

- Reading a kv_store key in a poll loop to detect "did anything new happen". Use `stream.tail` once for catch-up, then SSE for live. Polling burns tokens and lags.
- Building a parallel pubsub with `pg_notify` or Redis when a channel will do. We have one channel hub on purpose - opinionated single substrate.
- Publishing free-form payloads with no `event_type`. Consumers filter on event_type. Always set it.
- Treating the stream as a queue for work the consumer must process. If the consumer has to do work that survives consumer downtime, use messageQueue (durable). Streams are observability, not orchestration.
- Authoring a publisher that publishes inside a try-block that swallows errors silently. Publishers fail to disk; consumers see the gap. Log at debug at minimum.
- Adding a channel without updating `channels.json`. Reject is correct; orphan channels are noise.

## Cross-references

- `D:/.code/EcodiaOS/backend/streaming/channels.json` (the registry)
- `D:/.code/EcodiaOS/backend/src/services/streamingService.js` (the hub)
- `D:/.code/EcodiaOS/backend/src/routes/streaming.js` (the HTTP / SSE surface)
- `D:/.code/EcodiaOS/backend/src/routes/mcp/cowork.js` (stream.* MCP handlers)
- `~/ecodiaos/src/services/perceptionBus.js` + `perceptionDispatcher.js` (the legacy in-process bus that streams complement; perception bus stays for derived event publishing into Postgres for promotion to Neo4j Episodes)
- `~/ecodiaos/patterns/use-anthropic-existing-tools-before-building-parallel-infrastructure.md` (related: streams are an opinionated substrate, not a parallel one)
- `C:/Users/tjdTa/.claude/projects/d---code/migration-lanes/phase2/06-streaming-substrate.md` (the dossier this implements)
