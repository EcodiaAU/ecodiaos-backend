const { google } = require('googleapis')
const env = require('../config/env')
const db = require('../config/db')
const logger = require('../config/logger')
const deepseekService = require('./deepseekService')
const { createNotification } = require('../db/queries/transactions')
const { findClientByEmail } = require('../db/queries/clients')
const { createTask } = require('../db/queries/tasks')
const kgHooks = require('./kgIngestionHooks')
const { seedFollowupNudges } = require('./seedFollowupNudges')

const GMAIL_ENABLED = (env.GMAIL_ENABLED || 'false').toLowerCase() === 'true'
const MAX_TRIAGE_ATTEMPTS = parseInt(env.GMAIL_MAX_TRIAGE_ATTEMPTS || '0', 10) || Infinity

// ── Follow-up nudge seeding helpers ──────────────────────────────────────────
// Called fire-and-forget on every successful external-recipient outbound send.
// Internal-domain sends (@ecodia.au, @ecodia.com.au) do NOT seed nudges.
// seedFollowupNudges is idempotent (status_board UNIQUE-name-per-thread guard).

const _INTERNAL_DOMAINS = new Set(['ecodia.au', 'ecodia.com.au'])

function _extractDomain(emailAddr) {
  if (!emailAddr || typeof emailAddr !== 'string') return ''
  // Accept "Name <user@host>" or bare "user@host".
  const angle = emailAddr.match(/<([^>]+)>/)
  const raw = angle ? angle[1] : emailAddr
  const at = raw.indexOf('@')
  if (at < 0) return ''
  return raw.slice(at + 1).trim().toLowerCase()
}

function _firstRecipient(to) {
  if (Array.isArray(to)) return to.find(Boolean) || null
  return to || null
}

function _normaliseRecipient(emailAddr) {
  if (!emailAddr || typeof emailAddr !== 'string') return null
  const angle = emailAddr.match(/<([^>]+)>/)
  const raw = angle ? angle[1] : emailAddr
  return raw.trim().toLowerCase()
}

function _isExternalRecipient(emailAddr) {
  const domain = _extractDomain(emailAddr)
  if (!domain) return false
  return !_INTERNAL_DOMAINS.has(domain)
}

// Best-effort client_slug lookup by recipient email domain. Returns undefined
// when no match - seedFollowupNudges accepts undefined client_slug.
// Heuristic: exact domain match against clients.contact_email, then
// LIKE-match against clients.notes / name (case-insensitive). Never throws.
async function _lookupClientSlug(recipientEmail) {
  if (!recipientEmail) return undefined
  const domain = _extractDomain(recipientEmail)
  if (!domain) return undefined
  if (_INTERNAL_DOMAINS.has(domain)) return undefined
  try {
    const rows = await db`
      SELECT slug, name
      FROM clients
      WHERE archived_at IS NULL
        AND (
          lower(contact_email) LIKE ${'%@' + domain}
          OR lower(email) LIKE ${'%@' + domain}
        )
      LIMIT 1
    `
    if (rows && rows[0]) {
      return (rows[0].slug || rows[0].name || '').toString().toLowerCase().trim() || undefined
    }
  } catch (err) {
    logger.debug('gmailService._lookupClientSlug: clients query failed', {
      domain, error: err.message,
    })
  }
  return undefined
}

// Fire-and-forget: update clients.last_contact_at on every external outbound
// send. Root cause of the 42-day silent-stale issue (Coexist + Hello Lendy +
// Denise Marsh all showing last_contact_at=2026-04-06 despite active comms):
// gmailService never wrote to this column. Surfaced 2026-05-18 audit + ship.
// Doctrine: client-dossier-must-update-on-every-touch + stale-client-threshold.
function _updateClientLastContactPostSend({ recipient, sent_at }) {
  const primary = _normaliseRecipient(_firstRecipient(recipient))
  if (!primary) return
  if (!_isExternalRecipient(primary)) return
  const sentIso = sent_at || new Date().toISOString()
  Promise.resolve()
    .then(async () => {
      // Match by exact contact_email OR email column (some clients have one,
      // some have the other). Only advance last_contact_at - never roll back.
      const result = await db`
        UPDATE clients
           SET last_contact_at = ${sentIso}
         WHERE archived_at IS NULL
           AND (
             lower(contact_email) = ${primary}
             OR lower(email) = ${primary}
           )
           AND (last_contact_at IS NULL OR last_contact_at < ${sentIso})
        RETURNING id, name
      `
      if (result && result.length > 0) {
        logger.info('gmailService: bumped client.last_contact_at', {
          client: result[0].name, recipient: primary, sent_at: sentIso,
        })
      }
    })
    .catch((err) => {
      logger.warn('gmailService: last_contact_at update failed (non-blocking)', {
        recipient: primary, error: err.message,
      })
    })
}

// Fire-and-forget nudge seeding. Never throws back to caller. Skips
// internal-domain recipients. Idempotent at the status_board layer.
function _seedFollowupNudgesPostSend({ thread_id, recipient, sent_at }) {
  const primary = _normaliseRecipient(_firstRecipient(recipient))
  if (!primary) return
  if (!_isExternalRecipient(primary)) return
  Promise.resolve()
    .then(async () => {
      const client_slug = await _lookupClientSlug(primary)
      return seedFollowupNudges({
        thread_id: thread_id || undefined,
        recipient: primary,
        client_slug,
        sent_at: sent_at || new Date().toISOString(),
      })
    })
    .catch((err) => {
      logger.warn('gmailService: seedFollowupNudges failed (non-blocking)', {
        thread_id, recipient: primary, error: err.message,
      })
    })
}

// Inboxes live in the gmail_inboxes DB table so the OS can add/remove them at runtime.
// Falls back to GMAIL_INBOXES env var then GOOGLE_PRIMARY_ACCOUNT (pre-migration safety).
async function getInboxes() {
  try {
    const rows = await db`SELECT email FROM gmail_inboxes WHERE enabled = true ORDER BY added_at`
    if (rows.length > 0) return rows.map(r => r.email)
  } catch { /* table not yet migrated - fall through */ }
  return (env.GMAIL_INBOXES
    ? env.GMAIL_INBOXES.split(',').map(s => s.trim()).filter(Boolean)
    : [env.GOOGLE_PRIMARY_ACCOUNT]).filter(Boolean)
}

// ─── Gmail Client ────────────────────────────────────────────────────────────

function getGmailClient(userEmail) {
  const credentials = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON)
  const privateKey = credentials.private_key.replace(/\\n/g, '\n')
  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: privateKey,
    scopes: [
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/gmail.compose',
    ],
    subject: userEmail,
  })
  return google.gmail({ version: 'v1', auth })
}

// ─── Poll All Inboxes ────────────────────────────────────────────────────────

async function pollInbox() {
  if (!GMAIL_ENABLED) {
    logger.debug('Gmail polling disabled (GMAIL_ENABLED=false) - set to "true" in .env to re-enable')
    return
  }
  for (const inbox of await getInboxes()) {
    try {
      logger.info(`Polling inbox: ${inbox}`)
      const gmail = getGmailClient(inbox)
      await gmail.users.getProfile({ userId: 'me' }) // auth check

      const [syncState] = await db`
        SELECT * FROM gmail_sync_state WHERE id = ${inbox}
      `

      if (syncState) {
        await incrementalSync(gmail, inbox, syncState.history_id)
      } else {
        await fullSync(gmail, inbox)
      }
    } catch (err) {
      logger.error(`Failed to poll ${inbox}`, { error: err.message })
      // Continue to next inbox - don't let one failure block others
    }
  }

  // After sync, triage any pending emails
  await triagePendingEmails()
}

// ─── Full Sync ───────────────────────────────────────────────────────────────

async function fullSync(gmail, inbox) {
  // Audit 2026-05-13 P0 #22: previously fetched 200 threads and stamped
  // historyId as if the sync were complete. Any inbox >200 threads
  // silently lost everything older forever. Paginate via nextPageToken
  // and capture the profile.historyId BEFORE the first page so the
  // stamped cursor doesn't skip anything that arrives during sync.
  // Cap at a generous safety ceiling (env-configurable) so a truly
  // unbounded inbox doesn't run forever on first boot.
  const FULL_SYNC_MAX_THREADS = parseInt(process.env.GMAIL_FULL_SYNC_MAX_THREADS || '10000', 10)
  const FULL_SYNC_PAGE_SIZE = 200
  const profileBefore = await gmail.users.getProfile({ userId: 'me' })
  const historyIdAnchor = profileBefore.data.historyId
  let pageToken
  let totalProcessed = 0
  do {
    const res = await gmail.users.threads.list({
      userId: 'me',
      maxResults: FULL_SYNC_PAGE_SIZE,
      pageToken,
    })
    const threads = res.data.threads || []
    if (threads.length === 0) break
    for (const thread of threads) {
      if (totalProcessed >= FULL_SYNC_MAX_THREADS) break
      await processThread(gmail, inbox, thread.id)
      totalProcessed++
    }
    pageToken = res.data.nextPageToken || null
    logger.info(`Full sync [${inbox}]: page processed`, {
      threadsThisPage: threads.length,
      totalProcessed,
      hasMore: !!pageToken,
    })
    if (totalProcessed >= FULL_SYNC_MAX_THREADS) {
      logger.warn(`Full sync [${inbox}]: hit FULL_SYNC_MAX_THREADS cap`, {
        cap: FULL_SYNC_MAX_THREADS, hasMore: !!pageToken,
      })
      break
    }
  } while (pageToken)

  // Use the historyId captured BEFORE the paginated walk so any thread
  // that arrived during the walk is picked up by the next incremental
  // sync (Gmail's historyId is monotonic).
  await db`
    INSERT INTO gmail_sync_state (id, history_id)
    VALUES (${inbox}, ${historyIdAnchor})
    ON CONFLICT (id) DO UPDATE SET history_id = ${historyIdAnchor}, updated_at = now()
  `
  logger.info(`Full sync [${inbox}]: complete`, { totalProcessed })
}

// ─── Incremental Sync ────────────────────────────────────────────────────────

async function incrementalSync(gmail, inbox, historyId) {
  try {
    const res = await gmail.users.history.list({
      userId: 'me',
      startHistoryId: historyId,
      historyTypes: ['messageAdded', 'labelAdded', 'labelRemoved'],
    })

    const history = res.data.history || []
    const threadIds = new Set()
    for (const h of history) {
      for (const msg of (h.messagesAdded || [])) {
        threadIds.add(msg.message.threadId)
      }
      // Also track label changes (archive, read, trash, star, etc.)
      for (const msg of (h.labelsAdded || [])) {
        threadIds.add(msg.message.threadId)
      }
      for (const msg of (h.labelsRemoved || [])) {
        threadIds.add(msg.message.threadId)
      }
    }

    logger.info(`Incremental sync [${inbox}]: ${threadIds.size} updated threads`)

    for (const threadId of threadIds) {
      await processThread(gmail, inbox, threadId)
    }

    if (res.data.historyId) {
      await db`UPDATE gmail_sync_state SET history_id = ${res.data.historyId}, updated_at = now() WHERE id = ${inbox}`
    }
  } catch (err) {
    if (err.code === 404) {
      logger.warn(`History ID expired for ${inbox}, falling back to full sync`)
      await db`DELETE FROM gmail_sync_state WHERE id = ${inbox}`
      await fullSync(gmail, inbox)
    } else {
      throw err
    }
  }
}

// ─── Process Thread ──────────────────────────────────────────────────────────

async function processThread(gmail, inbox, threadId) {
  const thread = await gmail.users.threads.get({
    userId: 'me',
    id: threadId,
    format: 'full',
  })

  const messages = thread.data.messages || []
  if (messages.length === 0) return

  const firstMsg = messages[0]
  const lastMsg = messages[messages.length - 1]
  const headers = firstMsg.payload.headers || []
  const getHeader = (name) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || ''

  const fromRaw = getHeader('From')
  const fromEmail = fromRaw.match(/<(.+)>/)?.[1] || fromRaw
  const fromName = fromRaw.match(/^"?([^"<]+)"?\s*</)?.[1]?.trim() || null

  const subject = getHeader('Subject')
  const snippet = firstMsg.snippet || ''
  const body = extractBody(lastMsg)

  const messageIds = messages.map(m => m.id)
  const allLabels = [...new Set(messages.flatMap(m => m.labelIds || []))]
  const isUnread = allLabels.includes('UNREAD')
  const isInInbox = allLabels.includes('INBOX')
  const isTrashed = allLabels.includes('TRASH')
  const isSpam = allLabels.includes('SPAM')
  const receivedAt = new Date(parseInt(firstMsg.internalDate))

  // Derive status from labels
  let status = 'triaged'
  if (isTrashed) status = 'trashed'
  else if (isSpam) status = 'spam'
  else if (isUnread) status = 'unread'
  else if (!isInInbox) status = 'archived'

  const client = await findClientByEmail(fromEmail)

  // ─── Listener producer: emit email_events rows for inbound messages ──
  // Wires the emailArrival listener (subscribesTo db:event on email_events INSERT)
  // to actual Gmail traffic. Idempotency: ON CONFLICT (gmail_message_id) DO NOTHING
  // means the AFTER INSERT trigger only fires for genuinely-new messages, so the
  // listener will only fire once per message even if processThread is re-run on
  // every poll. SENT messages are skipped (no need to wake the OS for our own outbound).
  // Hybrid mode: this runs side-by-side with the existing cron-driven triagePendingEmails
  // path. Cron is decommissioned in a later wave.
  await _emitEmailEvents({ messages, inbox, fallbackFrom: fromEmail, fallbackSubject: subject, clientId: client?.id || null })

  const [existing] = await db`SELECT id FROM email_threads WHERE gmail_thread_id = ${threadId}`

  if (existing) {
    // Update labels, status, message count - track archive/read/trash changes
    await db`
      UPDATE email_threads SET
        gmail_message_ids = ${messageIds}, labels = ${allLabels}, status = ${status},
        snippet = ${snippet}, full_body = ${body}, updated_at = now()
      WHERE id = ${existing.id}`
    return
  }

  await db`
    INSERT INTO email_threads (
      gmail_thread_id, gmail_message_ids, subject, from_email, from_name,
      snippet, full_body, labels, client_id, received_at, status, inbox
    ) VALUES (
      ${threadId}, ${messageIds}, ${subject}, ${fromEmail}, ${fromName},
      ${snippet}, ${body}, ${allLabels}, ${client?.id || null}, ${receivedAt},
      ${status}, ${inbox}
    )
  `

  // Fire-and-forget KG ingestion - only for new threads
  kgHooks.onEmailProcessed({ threadId, fromEmail, fromName, subject, body, snippet, inbox, clientId: client?.id }).catch(() => {})

  logger.info(`[${inbox}] Processed: ${subject} from ${fromEmail}`)
}

// ─── Claude Triage ──────────────────────────────────────────────────────────

async function triagePendingEmails() {
  if (!env.ANTHROPIC_API_KEY) return

  // Use FOR UPDATE SKIP LOCKED to prevent concurrent workers from triaging the same email
  const pending = await db`
    SELECT * FROM email_threads
    WHERE triage_status IN ('pending', 'pending_retry')
      ${MAX_TRIAGE_ATTEMPTS === Infinity ? db`` : db`AND triage_attempts < ${MAX_TRIAGE_ATTEMPTS}`}
    ORDER BY received_at DESC
    LIMIT 10
    FOR UPDATE SKIP LOCKED
  `

  if (pending.length === 0) return
  logger.info(`Triaging ${pending.length} emails`)

  for (const thread of pending) {
    try {
      const client = thread.client_id
        ? (await db`SELECT name, status FROM clients WHERE id = ${thread.client_id}`)[0]
        : null

      // Pull client's active projects + linked codebases - gives the AI
      // codebase awareness when deciding if an email is a code request
      let projectCodebaseContext = null
      try {
        if (thread.client_id) {
          const projectCodebases = await db`
            SELECT p.name AS project_name, p.description AS project_desc,
                   cb.name AS codebase_name, cb.language, cb.repo_path,
                   (SELECT count(*)::int FROM cc_sessions WHERE codebase_id = cb.id
                    AND started_at > now() - interval '14 days') AS recent_sessions
            FROM projects p
            LEFT JOIN codebases cb ON cb.project_id = p.id
            WHERE p.client_id = ${thread.client_id} AND p.status = 'active'
          `
          if (projectCodebases.length > 0) {
            projectCodebaseContext = projectCodebases.map(pc =>
              `- Project "${pc.project_name}"${pc.project_desc ? ` (${pc.project_desc.slice(0, 100)})` : ''}: ` +
              (pc.codebase_name
                ? `codebase "${pc.codebase_name}" (${pc.language || 'unknown'}, ${pc.repo_path || 'no path'}, ${pc.recent_sessions} sessions last 14d)`
                : 'no linked codebase')
            ).join('\n')
          }
        } else {
          // Unknown sender - provide full codebase list so AI can still match
          const allCodebases = await db`
            SELECT name, language, repo_path FROM codebases ORDER BY name LIMIT 10
          `
          if (allCodebases.length > 0) {
            projectCodebaseContext = 'Sender not a known client. Available codebases:\n' +
              allCodebases.map(cb => `- "${cb.name}" (${cb.language || '?'}, ${cb.repo_path || '?'})`).join('\n')
          }
        }
      } catch (ctxErr) {
        logger.debug('Failed to load project/codebase context for triage', { error: ctxErr.message, threadId: thread.id })
      }

      // Pull knowledge graph context for richer triage
      let kgContext = null
      try {
        const kgService = require('./knowledgeGraphService')
        const ctx = await kgService.getContext(
          `${thread.from_name || thread.from_email} ${thread.subject}`,
          { maxSeeds: 15, maxDepth: 5, minSimilarity: 0.4 }
        )
        if (ctx.summary) kgContext = ctx.summary
      } catch (kgErr) {
        logger.debug('KG context not available for triage', { error: kgErr.message })
      }

      // Pull existing pending actions for this sender - helps the LLM
      // avoid re-surfacing the same topic that's already queued
      let pendingActionsContext = null
      let decisionContext = null
      try {
        const actionQueue = require('./actionQueueService')
        const [pending, triageCtx] = await Promise.all([
          actionQueue.getPendingForSender(thread.from_email, thread.from_name),
          actionQueue.getTriageContext({ senderEmail: thread.from_email, senderName: thread.from_name, source: 'gmail' }),
        ])
        if (pending.length > 0) {
          pendingActionsContext = pending.map(p =>
            `- [${p.priority}] "${p.title}" - ${p.summary || 'no summary'}${p.context?.consolidated_count > 1 ? ` (${p.context.consolidated_count} signals consolidated)` : ''}`
          ).join('\n')
        }
        decisionContext = triageCtx
      } catch (aqErr) {
        logger.debug('Failed to load pending actions for triage', { error: aqErr.message })
      }

      // Pull active conversations on other channels (Meta Messenger, Instagram, LinkedIn)
      // so the AI knows if this topic is already being handled elsewhere
      let activeChannelsContext = null
      try {
        const senderName = thread.from_name
        const senderEmail = thread.from_email

        // Check Meta conversations for this person (by name match)
        // Guard: only search if first name is at least 2 chars to avoid matching everything
        const firstName = senderName?.split(' ')[0] || ''
        const metaConvs = firstName.length >= 2 ? await db`
          SELECT mc.participant_name, mc.platform, mc.last_message_at, mc.triage_summary,
            (SELECT message_text FROM meta_messages
             WHERE conversation_id = mc.id ORDER BY created_time DESC LIMIT 1) AS last_message
          FROM meta_conversations mc
          WHERE mc.last_message_at > now() - interval '7 days'
            AND (mc.participant_name ILIKE ${`%${firstName}%`})
          ORDER BY mc.last_message_at DESC
          LIMIT 3
        ` : []

        // Check LinkedIn DMs for this person (same firstName guard)
        const linkedinConvs = firstName.length >= 2 ? await db`
          SELECT ld.participant_name, ld.last_message_at, ld.last_message_preview
          FROM linkedin_dms ld
          WHERE ld.last_message_at > now() - interval '7 days'
            AND (ld.participant_name ILIKE ${`%${firstName}%`})
          ORDER BY ld.last_message_at DESC
          LIMIT 2
        `.catch(() => []) : []

        const allChannels = [
          ...metaConvs.map(c => `- ${c.platform || 'Messenger'} with ${c.participant_name} (last message: ${c.last_message_at ? new Date(c.last_message_at).toISOString() : 'unknown'}${c.last_message ? `: "${c.last_message.slice(0, 150)}"` : ''}${c.triage_summary ? ` | Summary: ${c.triage_summary}` : ''})`),
          ...linkedinConvs.map(c => `- LinkedIn DM with ${c.participant_name} (last: ${c.last_message_at ? new Date(c.last_message_at).toISOString() : 'unknown'}${c.last_message_preview ? `: "${c.last_message_preview.slice(0, 150)}"` : ''})`),
        ]

        if (allChannels.length > 0) {
          activeChannelsContext = allChannels.join('\n')
        }
      } catch (chErr) {
        logger.debug('Failed to load cross-channel context for triage', { error: chErr.message })
      }

      const triage = await deepseekService.triageEmail({
        subject: thread.subject,
        from: `${thread.from_name || ''} <${thread.from_email}>`,
        body: thread.full_body,
        snippet: thread.snippet,
        inbox: thread.inbox,
        clientContext: client,
        kgContext,
        pendingActionsContext,
        activeChannelsContext,
        projectCodebaseContext,
        decisionContext,
        receivedAt: thread.received_at,
      })

      await db`
        UPDATE email_threads SET
          triage_priority = ${triage.priority},
          triage_summary = ${triage.summary},
          triage_action = ${triage.autonomousAction || triage.suggestedAction},
          draft_reply = ${triage.draftReply || null},
          triage_status = 'complete',
          triage_attempts = triage_attempts + 1,
          updated_at = now()
        WHERE id = ${thread.id}
      `

      // Auto-create task if Claude says so
      if (triage.shouldCreateTask && triage.taskTitle) {
        await createTask({
          title: triage.taskTitle,
          description: triage.taskDescription,
          source: 'gmail',
          sourceRefId: thread.id,
          clientId: thread.client_id,
          priority: triage.taskPriority || 'medium',
        })
        logger.info(`Auto-created task: ${triage.taskTitle}`)
      }

      // ─── AUTONOMOUS ACTIONS ──────────────────────────────────────────
      // Act on the triage result automatically. Only urgent/high need human review.
      await autoAct(thread, triage)

      // ─── DELEGATION: Route to bookkeeping (receipts), factory (dev), CRM ──
      try {
        const delegation = require('./emailDelegationService')
        delegation.delegateEmail(thread, triage).catch(err =>
          logger.debug('Email delegation failed (non-blocking)', { error: err.message })
        )
      } catch { /* delegation service not loaded - non-blocking */ }

      // Fire-and-forget KG ingestion of triage results
      kgHooks.onEmailTriaged({
        threadId: thread.id, subject: thread.subject, fromEmail: thread.from_email,
        triageSummary: triage.summary, triageAction: triage.autonomousAction || triage.suggestedAction, triagePriority: triage.priority,
      }).catch(() => {})

      // Fire-and-forget CRM activity logging for client-linked emails
      if (thread.client_id) {
        try {
          const crmService = require('./crmService')
          crmService.logActivity({
            clientId: thread.client_id,
            activityType: 'email_received',
            title: `Email: ${thread.subject}`,
            description: triage.summary,
            source: 'gmail',
            sourceRefId: thread.id,
            sourceRefType: 'email_thread',
            actor: thread.from_name || thread.from_email,
            metadata: { priority: triage.priority, action: triage.autonomousAction || triage.suggestedAction },
          }).catch(() => {})
        } catch {}
      }

      const triageAction = triage.autonomousAction || triage.suggestedAction
      logger.info(`Triaged [${triage.priority}/${triage.confidence ?? '?'}] → ${triageAction}${triage.surfaceToHuman ? ' (surfaced)' : ''}: ${thread.subject}`)
    } catch (err) {
      logger.warn(`Triage failed for ${thread.id}`, { error: err.message })
      const newStatus = thread.triage_attempts + 1 >= MAX_TRIAGE_ATTEMPTS ? 'failed' : 'pending_retry'
      await db`
        UPDATE email_threads SET
          triage_status = ${newStatus},
          triage_attempts = triage_attempts + 1,
          updated_at = now()
        WHERE id = ${thread.id}
      `
    }
  }
}

// ─── Autonomous Actions ──────────────────────────────────────────────────────
// Philosophy: ACT, don't alert. The AI decides what to do. Surface to human
// only when the AI genuinely can't handle it or confidence is too low.

async function autoAct(thread, triage) {
  const action = triage.autonomousAction || triage.suggestedAction // backwards compat
  const priority = triage.priority
  const confidence = typeof triage.confidence === 'number' ? triage.confidence : parseFloat(env.GMAIL_TRIAGE_DEFAULT_CONFIDENCE || '0.8')
  const actionQueue = require('./actionQueueService')

  try {
    // LLM decides if human should review - no confidence threshold override
    const shouldSurface = triage.surfaceToHuman

    // ── SURFACE PATH: AI can't handle this, or isn't confident enough ──
    if (shouldSurface) {
      // Still save draft if we have one - human can approve sending
      if (triage.draftReply) {
        await saveDraftToGmail(thread, triage.draftReply).catch(err =>
          logger.warn(`Failed to save Gmail draft for ${thread.id}`, { error: err.message })
        )
      }

      await actionQueue.enqueue({
        source: 'gmail',
        sourceRefId: thread.id,
        actionType: triage.draftReply ? 'send_reply' : (action === 'create_task' ? 'create_task' : 'follow_up'),
        title: `${thread.from_name || thread.from_email}: ${thread.subject || 'No subject'}`,
        summary: triage.surfaceReason || triage.summary,
        preparedData: {
          draft: triage.draftReply || null,
          subject: thread.subject,
          title: triage.taskTitle || null,
          description: triage.taskDescription || null,
        },
        context: {
          from: thread.from_name || thread.from_email,
          email: thread.from_email,
          inbox: thread.inbox,
          confidence,
          surfacedBecause: 'ai_requested',
        },
        priority,
      }).catch(() => {})
      return
    }

    // ── AUTONOMOUS PATH: AI is confident, just do it ──

    if (action === 'send_reply' && triage.draftReply) {
      // Actually send the reply - the AI is confident, act on it
      await sendReplyToThread(thread, triage.draftReply)
      await silentArchive(thread)
      // Log to CRM activity timeline for linked clients
      if (thread.client_id) {
        try {
          const crmService = require('./crmService')
          await crmService.logActivity({
            clientId: thread.client_id,
            activityType: 'email_sent',
            title: `Reply sent: ${thread.subject}`,
            description: triage.draftReply.slice(0, 200),
            source: 'gmail',
            sourceRefId: thread.id,
            sourceRefType: 'email_thread',
            actor: 'ai',
          })
        } catch {}
      }
      logger.info(`Auto-sent reply & archived: ${thread.subject}`)

    } else if (action === 'create_task' && triage.shouldCreateTask) {
      // Task already created in triagePendingEmails - just archive the email
      await silentArchive(thread)
      logger.info(`Task created, auto-archived: ${thread.subject}`)

    } else if (action === 'snooze') {
      // Repeated signal about something acknowledged - log to KG, archive, don't nag
      await silentArchive(thread)
      kgHooks.onEmailSnoozed({
        threadId: thread.id,
        subject: thread.subject,
        fromEmail: thread.from_email,
        summary: triage.summary,
      }).catch(() => {})
      logger.info(`Snoozed (repeated signal): ${thread.subject}`)

    } else {
      // archive, ignore, spam, or anything else - just archive
      await silentArchive(thread)
      logger.info(`Auto-archived [${priority}/${action}]: ${thread.subject}`)
    }

    // ── CODE WORK PATH: email requests code changes ──
    // Runs alongside (not instead of) the normal action - an email might need
    // a reply AND a Factory session. The code request service decides whether
    // to auto-dispatch or surface for confirmation based on confidence.
    // Validate: isCodeWorkRequest must be truthy AND factoryPrompt must be a
    // non-empty string (AI can return empty string, "null", or boolean by mistake)
    const hasCodeWork = triage.isCodeWorkRequest === true
      && typeof triage.factoryPrompt === 'string'
      && triage.factoryPrompt.trim().length >= 10
    if (hasCodeWork) {
      const codeRequestService = require('./codeRequestService')
      await codeRequestService.createFromEmail({
        threadId: thread.id,
        clientId: thread.client_id,
        summary: triage.summary || triage.factoryPrompt.slice(0, 200),
        factoryPrompt: triage.factoryPrompt.trim(),
        codeWorkType: triage.codeWorkType,
        suggestedCodebase: (typeof triage.suggestedCodebase === 'string' && triage.suggestedCodebase.trim()) || null,
        confidence: typeof triage.confidence === 'number' ? triage.confidence : 0.5,
        surfaceToHuman: triage.surfaceToHuman,
      }).catch(err => logger.warn(`Code request creation failed for ${thread.id}`, { error: err.message }))
    }
  } catch (err) {
    logger.error(`Auto-act failed for ${thread.id}`, { error: err.message })
  }
}

// ─── Send reply autonomously ────────────────────────────────────────────────

async function sendReplyToThread(thread, body) {
  if (!GMAIL_ENABLED) throw new Error('Gmail disabled (GMAIL_ENABLED=false)')
  const inbox = thread.inbox || (await getInboxes())[0]
  const subject = `Re: ${thread.subject || ''}`

  // Route through the composite Tier-3 gate per SECURITY_HARDENING §3.2.
  // This is the autonomous-triage path - the `autonomous_thread_reply`
  // pattern (migration 081) auto-issues tokens when body_length <= 2000.
  // Longer bodies or high-risk commitment content fall through to the
  // SMS-OTP path; the email stays unsent and Tate is paged.
  const result = await module.exports.sendEmailAuto({
    from: inbox,
    to: thread.from_email,
    subject,
    body,
    threadId: thread.gmail_thread_id,
    sessionId: `triage-reply-${thread.id}`,
    context: { is_thread_reply: true, autonomous: true, source: 'triage-reply' },
  })

  if (result?.pending_otp) {
    logger.warn('sendReplyToThread: pending OTP - reply NOT sent', {
      thread_id: thread.id, subject, otp_id: result.otp_id,
    })
    return result
  }
  if (result?.queued || result?.deferred) {
    logger.info('sendReplyToThread: queued/deferred by composite gate', {
      thread_id: thread.id, subject, reason: result.reason || (result.queued ? 'unknown_recipient' : 'calendar'),
    })
    return result
  }

  await db`UPDATE email_threads SET status = 'replied', updated_at = now() WHERE id = ${thread.id}`
  logger.info(`Autonomous reply sent from ${inbox} to ${thread.from_email}: ${thread.subject}`)
  return result
}

async function silentArchive(thread) {
  try {
    const gmail = getGmailClient(thread.inbox || (await getInboxes())[0])
    await gmail.users.threads.modify({
      userId: 'me',
      id: thread.gmail_thread_id,
      requestBody: { removeLabelIds: ['INBOX', 'UNREAD'] },
    })
    await db`UPDATE email_threads SET status = 'archived', updated_at = now() WHERE id = ${thread.id}`
  } catch (err) {
    logger.warn(`Silent archive failed for ${thread.id}`, { error: err.message })
  }
}

async function saveDraftToGmail(thread, draftBody) {
  const inbox = thread.inbox || (await getInboxes())[0]
  const gmail = getGmailClient(inbox)

  const raw = createRawEmail({
    to: thread.from_email,
    from: inbox,
    subject: `Re: ${thread.subject || ''}`,
    body: draftBody,
    inReplyTo: thread.gmail_message_ids?.[thread.gmail_message_ids.length - 1],
  })

  const draft = await gmail.users.drafts.create({
    userId: 'me',
    requestBody: {
      message: {
        raw,
        threadId: thread.gmail_thread_id,
      },
    },
  })

  await db`
    UPDATE email_threads SET draft_gmail_id = ${draft.data.id}, updated_at = now()
    WHERE id = ${thread.id}
  `

  logger.info(`Saved Gmail draft for: ${thread.subject} (draft ID: ${draft.data.id})`)
}

// ─── Email Actions ───────────────────────────────────────────────────────────

async function archiveThread(threadId) {
  if (!GMAIL_ENABLED) throw new Error('Gmail disabled (GMAIL_ENABLED=false)')
  const [thread] = await db`SELECT * FROM email_threads WHERE id = ${threadId}`
  if (!thread) throw new Error('Thread not found')

  const gmail = getGmailClient(thread.inbox || (await getInboxes())[0])
  await gmail.users.threads.modify({
    userId: 'me',
    id: thread.gmail_thread_id,
    requestBody: { removeLabelIds: ['INBOX'] },
  })

  await db`UPDATE email_threads SET status = 'archived', updated_at = now() WHERE id = ${threadId}`
  logger.info(`Archived thread: ${thread.subject}`)
}

async function markRead(threadId) {
  const [thread] = await db`SELECT * FROM email_threads WHERE id = ${threadId}`
  if (!thread) throw new Error('Thread not found')

  const gmail = getGmailClient(thread.inbox || (await getInboxes())[0])
  await gmail.users.threads.modify({
    userId: 'me',
    id: thread.gmail_thread_id,
    requestBody: { removeLabelIds: ['UNREAD'] },
  })

  await db`UPDATE email_threads SET status = 'triaged', updated_at = now() WHERE id = ${threadId}`
}

async function trashThread(threadId) {
  const [thread] = await db`SELECT * FROM email_threads WHERE id = ${threadId}`
  if (!thread) throw new Error('Thread not found')

  const gmail = getGmailClient(thread.inbox || (await getInboxes())[0])
  await gmail.users.threads.trash({
    userId: 'me',
    id: thread.gmail_thread_id,
  })

  await db`UPDATE email_threads SET status = 'archived', updated_at = now() WHERE id = ${threadId}`
  logger.info(`Trashed thread: ${thread.subject}`)
}

async function sendReply(threadId, body) {
  if (!GMAIL_ENABLED) throw new Error('Gmail disabled (GMAIL_ENABLED=false)')
  const [thread] = await db`SELECT * FROM email_threads WHERE gmail_thread_id = ${threadId}`
  if (!thread) throw new Error('Thread not found')

  const inbox = thread.inbox || (await getInboxes())[0]
  const gmail = getGmailClient(inbox)

  const raw = createRawEmail({
    to: thread.from_email,
    from: inbox,
    subject: `Re: ${thread.subject || ''}`,
    body,
    inReplyTo: thread.gmail_message_ids?.[thread.gmail_message_ids.length - 1],
  })

  // Verified send: records the action, sends via Gmail, verifies the message is
  // visible in the SENT label, marks the audit row accordingly. Idempotency
  // key dedupes accidental double-fires within the same minute.
  const actionVerification = require('../lib/actionVerification')
  const bodyHash = require('crypto').createHash('sha256').update(String(body || '')).digest('hex').slice(0, 16)
  const action_key = `gmail:${threadId}:${bodyHash}:${Math.floor(Date.now() / 60000)}`

  const result = await actionVerification.withVerification(
    {
      action_type: 'email_send',
      action_key,
      target: thread.from_email,
      payload: { threadId, to: thread.from_email, subject: thread.subject || '', body_chars: (body || '').length },
      metadata: { inbox, kind: 'reply' },
    },
    async () => {
      const r = await gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw, threadId },
      })
      return { external_id: r?.data?.id || null, metadata: { gmail_thread_id: r?.data?.threadId || threadId } }
    },
    async ({ external_id }) => {
      if (!external_id) return { ok: false, detail: 'no message id returned' }
      try {
        const meta = await gmail.users.messages.get({ userId: 'me', id: external_id, format: 'metadata' })
        const labels = meta?.data?.labelIds || []
        return { ok: labels.includes('SENT'), detail: `labels=${labels.join(',')}` }
      } catch (err) {
        return { ok: false, detail: `messages.get failed: ${err.message}` }
      }
    },
    { timeoutMs: 60_000, initialDelayMs: 2000, maxDelayMs: 15_000 }
  )

  if (result.replayed) {
    logger.info('sendReply: replayed (idempotency key matched), skipping re-send', { threadId, action_id: result.id })
    return
  }

  await db`UPDATE email_threads SET status = 'replied', updated_at = now() WHERE gmail_thread_id = ${threadId}`
  logger.info(`Reply sent from ${inbox} to ${thread.from_email}`, { action_id: result.id, external_id: result.external_id })

  // Seed +2d / +7d / +14d follow-up nudges on external-recipient sends.
  // Fire-and-forget; internal-domain recipients are filtered inside.
  const _sentAt = new Date().toISOString()
  _seedFollowupNudgesPostSend({
    thread_id: threadId,
    recipient: thread.from_email,
    sent_at: _sentAt,
  })
  // Bump clients.last_contact_at on external sends. Fixes the 42-day silent-
  // stale issue surfaced in 2026-05-18 audit. Fire-and-forget.
  _updateClientLastContactPostSend({
    recipient: thread.from_email,
    sent_at: _sentAt,
  })
}

// ─── Listener Producer ──────────────────────────────────────────────────────
// Insert one email_events row per inbound message. Idempotent via UNIQUE
// constraint on gmail_message_id - ON CONFLICT DO NOTHING means the trigger
// (AFTER INSERT) fires only for genuinely-new rows, so the emailArrival
// listener wakes the OS exactly once per email arrival.
async function _emitEmailEvents({ messages, inbox, fallbackFrom, fallbackSubject, clientId }) {
  if (!messages || messages.length === 0) return
  for (const msg of messages) {
    try {
      const labels = msg.labelIds || []
      // Skip outbound (sent), drafts, chat, spam, trash - we only wake the OS
      // for genuinely-new inbound traffic that needs triage.
      if (labels.includes('SENT') || labels.includes('DRAFT') || labels.includes('CHAT')) continue
      if (labels.includes('TRASH') || labels.includes('SPAM')) continue

      const msgHeaders = msg.payload?.headers || []
      const getMsgHeader = (n) => msgHeaders.find(h => h.name.toLowerCase() === n.toLowerCase())?.value || ''
      const fromRaw = getMsgHeader('From')
      const fromEmail = fromRaw.match(/<(.+)>/)?.[1] || fromRaw || fallbackFrom || 'unknown@unknown'
      const subject = getMsgHeader('Subject') || fallbackSubject || ''
      const bodyPreview = (msg.snippet || '').slice(0, 500)
      const receivedAt = msg.internalDate ? new Date(parseInt(msg.internalDate)) : new Date()

      // category is NOT NULL - set 'pending' to indicate the row hasn't been classified
      // by triage yet. Downstream consumers (listener -> OS triage) update this later.
      await db`
        INSERT INTO email_events (
          inbox, gmail_message_id, from_address, to_address,
          subject, body_preview, received_at, category, client_id, processed
        ) VALUES (
          ${inbox}, ${msg.id}, ${fromEmail}, ${inbox},
          ${subject}, ${bodyPreview}, ${receivedAt}, 'pending', ${clientId}, false
        )
        ON CONFLICT (gmail_message_id) DO NOTHING
      `
    } catch (err) {
      // Producer failures are non-blocking - the cron-driven triagePendingEmails
      // path still handles the email even if the listener wake fails.
      logger.warn(`email_events producer: insert failed for msg ${msg?.id}`, { error: err.message })
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractBody(message) {
  for (const mimeType of ['text/plain', 'text/html']) {
    const part = findPart(message.payload, mimeType)
    if (part?.body?.data) {
      return Buffer.from(part.body.data, 'base64url').toString('utf8')
    }
  }
  if (message.payload?.body?.data) {
    return Buffer.from(message.payload.body.data, 'base64url').toString('utf8')
  }
  return message.snippet || ''
}

function findPart(payload, mimeType) {
  if (payload.mimeType === mimeType) return payload
  for (const part of (payload.parts || [])) {
    const found = findPart(part, mimeType)
    if (found) return found
  }
  return null
}

// RFC 2047 encoded-word encoding for non-ASCII header values (RFC 2822 §2.2).
// Without this, raw UTF-8 bytes in the Subject header are misread as Latin-1
// by receiving clients, producing mojibake (e.g. Ã¢Â€Â" instead of - ).
function encodeHeaderValue(str) {
  if (!str || !/[^\x00-\x7F]/.test(str)) return str
  return `=?UTF-8?B?${Buffer.from(str, 'utf-8').toString('base64')}?=`
}

function createRawEmail({ to, from, subject, body, inReplyTo, cc, bcc }) {
  const lines = [
    `To: ${Array.isArray(to) ? to.join(', ') : to}`,
    `From: ${from}`,
    `Subject: ${encodeHeaderValue(subject)}`,
    'Content-Type: text/plain; charset=utf-8',
  ]
  if (cc) {
    lines.splice(1, 0, `Cc: ${Array.isArray(cc) ? cc.join(', ') : cc}`)
  }
  if (bcc) {
    lines.splice(1, 0, `Bcc: ${Array.isArray(bcc) ? bcc.join(', ') : bcc}`)
  }
  if (inReplyTo) {
    lines.push(`In-Reply-To: ${inReplyTo}`)
    lines.push(`References: ${inReplyTo}`)
  }
  lines.push('', body)
  return Buffer.from(lines.join('\r\n')).toString('base64url')
}

// ─── Extended Actions ────────────────────────────────────────────────────────

async function listThreads({ status, priority, inbox, search, limit = 50, offset = 0 } = {}) {
  const conditions = []
  const params = []
  if (status) conditions.push(`status = $${params.push(status)}`)
  if (priority) conditions.push(`triage_priority = $${params.push(priority)}`)
  if (inbox) conditions.push(`inbox = $${params.push(inbox)}`)
  if (search) conditions.push(`(subject ILIKE '%' || $${params.push(search)} || '%' OR from_email ILIKE '%' || $${params.push(search)} || '%' OR from_name ILIKE '%' || $${params.push(search)} || '%')`)
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''
  return db.unsafe(
    `SELECT id, gmail_thread_id, subject, from_email, from_name, snippet, triage_priority, triage_summary, triage_action, status, inbox, received_at, client_id
     FROM email_threads ${where} ORDER BY received_at DESC LIMIT $${params.push(limit)} OFFSET $${params.push(offset)}`,
    params,
  )
}

async function searchThreads(query, limit = 20) {
  if (!query || query.length < 2) return []
  const local = await db`
    SELECT id, gmail_thread_id, subject, from_email, from_name, snippet, triage_priority, status, inbox, received_at
    FROM email_threads
    WHERE subject ILIKE ${'%' + query + '%'} OR from_email ILIKE ${'%' + query + '%'}
       OR from_name ILIKE ${'%' + query + '%'} OR snippet ILIKE ${'%' + query + '%'}
    ORDER BY received_at DESC LIMIT ${limit}`
  if (local.length > 0) return local

  // Local DB empty - search Gmail API directly and sync matching threads
  const remoteResults = []
  for (const inbox of await getInboxes()) {
    try {
      const gmail = getGmailClient(inbox)
      const res = await gmail.users.threads.list({ userId: 'me', q: query, maxResults: Math.min(limit, 10) })
      const threads = res.data.threads || []
      for (const t of threads) {
        await processThread(gmail, inbox, t.id)
      }
      if (threads.length > 0) {
        const synced = await db`
          SELECT id, gmail_thread_id, subject, from_email, from_name, snippet, triage_priority, status, inbox, received_at
          FROM email_threads WHERE inbox = ${inbox} AND gmail_thread_id = ANY(${threads.map(t => t.id)})
          ORDER BY received_at DESC`
        remoteResults.push(...synced)
      }
    } catch (err) {
      logger.warn(`Gmail API search failed for ${inbox}`, { error: err.message, query })
    }
  }
  return remoteResults.slice(0, limit)
}

async function batchArchive(threadIds) {
  if (!threadIds?.length) return { archived: 0 }
  let archived = 0
  for (const id of threadIds) {
    try { await archiveThread(id); archived++ }
    catch (err) { logger.warn(`Batch archive failed for ${id}`, { error: err.message }) }
  }
  return { archived, total: threadIds.length }
}

async function batchTrash(threadIds) {
  if (!threadIds?.length) return { trashed: 0 }
  let trashed = 0
  for (const id of threadIds) {
    try { await trashThread(id); trashed++ }
    catch (err) { logger.warn(`Batch trash failed for ${id}`, { error: err.message }) }
  }
  return { trashed, total: threadIds.length }
}

async function labelThread(threadId, labelName) {
  if (!GMAIL_ENABLED) throw new Error('Gmail disabled')
  const [thread] = await db`SELECT * FROM email_threads WHERE id = ${threadId}`
  if (!thread) throw new Error('Thread not found')

  const gmail = getGmailClient(thread.inbox || (await getInboxes())[0])

  // Resolve label name to ID (create if it doesn't exist)
  const labelId = await _resolveOrCreateLabel(gmail, labelName)

  await gmail.users.threads.modify({
    userId: 'me',
    id: thread.gmail_thread_id,
    requestBody: { addLabelIds: [labelId] },
  })

  // Store in our DB as well
  const currentLabels = thread.labels || []
  if (!currentLabels.includes(labelName)) {
    await db`UPDATE email_threads SET labels = array_append(labels, ${labelName}), updated_at = now() WHERE id = ${threadId}`
  }
  return { labeled: true, label: labelName }
}

async function removeLabel(threadId, labelName) {
  if (!GMAIL_ENABLED) throw new Error('Gmail disabled')
  const [thread] = await db`SELECT * FROM email_threads WHERE id = ${threadId}`
  if (!thread) throw new Error('Thread not found')

  const gmail = getGmailClient(thread.inbox || (await getInboxes())[0])
  const labelId = await _resolveLabel(gmail, labelName)
  if (!labelId) return { removed: false, reason: 'Label not found' }

  await gmail.users.threads.modify({
    userId: 'me',
    id: thread.gmail_thread_id,
    requestBody: { removeLabelIds: [labelId] },
  })

  await db`UPDATE email_threads SET labels = array_remove(labels, ${labelName}), updated_at = now() WHERE id = ${threadId}`
  return { removed: true, label: labelName }
}

async function starThread(threadId) {
  return labelThread(threadId, 'STARRED')
}

async function unstarThread(threadId) {
  return removeLabel(threadId, 'STARRED')
}

async function forwardThread(threadId, toEmail) {
  if (!GMAIL_ENABLED) throw new Error('Gmail disabled')
  const [thread] = await db`SELECT * FROM email_threads WHERE id = ${threadId}`
  if (!thread) throw new Error('Thread not found')

  const inbox = thread.inbox || (await getInboxes())[0]
  const gmail = getGmailClient(inbox)

  const forwardBody = `---------- Forwarded message ----------
From: ${thread.from_name || thread.from_email} <${thread.from_email}>
Date: ${thread.received_at}
Subject: ${thread.subject}

${thread.full_body || thread.snippet || ''}`

  const raw = createRawEmail({
    to: toEmail,
    from: inbox,
    subject: `Fwd: ${thread.subject || ''}`,
    body: forwardBody,
  })

  await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })
  logger.info(`Forwarded "${thread.subject}" from ${inbox} to ${toEmail}`)
  return { forwarded: true, to: toEmail }
}

async function sendNewEmail(inbox, to, subject, body, opts = {}) {
  if (!GMAIL_ENABLED) throw new Error('Gmail disabled')
  const fromInbox = inbox || (await getInboxes())[0]

  // Route through the composite Tier-3 gate. For mail to Ecodia domains
  // (tate@ecodia.au alerts, intra-org messages) the `internal_ecodia_comms`
  // pattern auto-issues. Anything else requires SMS-OTP - the returned
  // `pending_otp: true` response tells the caller to surface to Tate.
  // Legacy callers that don't pass sessionId get a synthetic one tagged
  // with the source.
  const result = await module.exports.sendEmailAuto({
    from: fromInbox,
    to,
    subject,
    body,
    sessionId: opts.sessionId || `new-email-${opts.source || 'unknown'}-${Date.now()}`,
    urgency: opts.urgency || 'normal',
    context: { is_thread_reply: false, autonomous: !!opts.autonomous, source: opts.source || 'sendNewEmail' },
  })

  if (result?.pending_otp || result?.queued || result?.deferred) {
    logger.info(`sendNewEmail: held by gate (${result.pending_otp ? 'otp' : result.queued ? 'queued' : 'deferred'})`, {
      to, subject, source: opts.source,
    })
    return result
  }
  return result
}

/**
 * sendEmail - extended sender supporting cc, bcc, and threadId.
 * Used by Cowork V2 MCP gmail.send endpoint.
 */
async function sendEmail({ from, to, cc, bcc, subject, body, threadId }) {
  if (!GMAIL_ENABLED) throw new Error('Gmail disabled')
  const fromInbox = from || (await getInboxes())[0]
  const gmail = getGmailClient(fromInbox)

  // Per-recipient rate limiter — AUTONOMY_AUDIT_2026-05-13 finding 16.
  // Protects against runaway loops re-sending to the same address.
  await _checkEmailRateLimit(Array.isArray(to) ? to : [to])

  const raw = createRawEmail({ to, from: fromInbox, cc, bcc, subject, body })
  const requestBody = { raw }
  if (threadId) requestBody.threadId = threadId

  // Verified send with idempotency. The action_key collapses re-fires within
  // the same minute (recipient + subject + body hash) so accidental double-
  // dispatches return the original message_id instead of duplicating.
  const actionVerification = require('../lib/actionVerification')
  const crypto = require('crypto')
  const recipientHash = crypto.createHash('sha256')
    .update(JSON.stringify({ to, cc, bcc })).digest('hex').slice(0, 12)
  const bodyHash = crypto.createHash('sha256')
    .update(String(body || '') + '|' + String(subject || '')).digest('hex').slice(0, 16)
  const action_key = `gmail_new:${recipientHash}:${bodyHash}:${Math.floor(Date.now() / 60000)}`

  // Captured from the gmail.users.messages.send response inside the send
  // closure - used to seed follow-up nudges with the real thread id when
  // gmail allocates a new one for a non-reply send.
  let _capturedThreadId = null

  const wrapped = await actionVerification.withVerification(
    {
      action_type: 'email_send',
      action_key,
      target: Array.isArray(to) ? to[0] : to,
      payload: { to, cc, bcc, subject, body_chars: (body || '').length, threadId: threadId || null },
      metadata: { kind: threadId ? 'thread' : 'new', from: fromInbox },
    },
    async () => {
      const r = await gmail.users.messages.send({ userId: 'me', requestBody })
      _capturedThreadId = r?.data?.threadId || null
      return {
        external_id: r?.data?.id || null,
        metadata: { gmail_thread_id: r?.data?.threadId || null },
      }
    },
    async ({ external_id }) => {
      if (!external_id) return { ok: false, detail: 'no message id returned' }
      try {
        const meta = await gmail.users.messages.get({ userId: 'me', id: external_id, format: 'metadata' })
        const labels = meta?.data?.labelIds || []
        return { ok: labels.includes('SENT'), detail: `labels=${labels.join(',')}` }
      } catch (err) {
        return { ok: false, detail: `messages.get failed: ${err.message}` }
      }
    },
    { timeoutMs: 60_000, initialDelayMs: 2000, maxDelayMs: 15_000 }
  )

  if (wrapped.replayed) {
    logger.info('sendEmail: replayed (idempotency match), skipping re-send', { to, action_id: wrapped.id })
  } else {
    logger.info(`Email sent from ${fromInbox} to ${Array.isArray(to) ? to.join(',') : to}: ${subject}`, {
      action_id: wrapped.id, external_id: wrapped.external_id,
    })
    // Seed +2d / +7d / +14d follow-up nudges on external-recipient sends.
    // Fire-and-forget; internal-domain recipients are filtered inside.
    // _capturedThreadId is the gmail-allocated thread id from the send
    // response; threadId param is the upstream hint (already-known thread).
    const _sentAt = new Date().toISOString()
    _seedFollowupNudgesPostSend({
      thread_id: _capturedThreadId || threadId || null,
      recipient: to,
      sent_at: _sentAt,
    })
    // Bump clients.last_contact_at on external sends. Fixes the 42-day
    // silent-stale issue surfaced in 2026-05-18 audit. Fire-and-forget.
    _updateClientLastContactPostSend({
      recipient: to,
      sent_at: _sentAt,
    })
  }
  return {
    sent: !wrapped.replayed,
    replayed: !!wrapped.replayed,
    message_id: wrapped.external_id || null,
    action_id: wrapped.id,
    from: fromInbox,
  }
}

// ─── Per-recipient send rate limiter ────────────────────────────────────
// Sliding 1-hour window. Default caps: 10 sends per recipient per hour,
// 50 sends total per hour across all recipients. Configurable via env.
// AUTONOMY_AUDIT_2026-05-13 finding 16.
const _EMAIL_RATE_PER_RECIPIENT = parseInt(process.env.GMAIL_RATE_LIMIT_PER_RECIPIENT_PER_HOUR, 10) || 10
const _EMAIL_RATE_GLOBAL = parseInt(process.env.GMAIL_RATE_LIMIT_GLOBAL_PER_HOUR, 10) || 50
const _emailSendBuckets = new Map()      // recipient -> [timestamp_ms]
const _emailSendGlobal = []              // [timestamp_ms]

async function _checkEmailRateLimit(recipients) {
  const now = Date.now()
  const cutoff = now - 60 * 60 * 1000
  // Prune global
  while (_emailSendGlobal.length > 0 && _emailSendGlobal[0] < cutoff) _emailSendGlobal.shift()
  if (_emailSendGlobal.length >= _EMAIL_RATE_GLOBAL) {
    const err = new Error(`gmail rate limit: global cap ${_EMAIL_RATE_GLOBAL}/hr reached`)
    err.code = 'rate_limit_exceeded'
    throw err
  }
  for (const recipient of (recipients || []).filter(Boolean)) {
    let arr = _emailSendBuckets.get(recipient)
    if (!arr) { arr = []; _emailSendBuckets.set(recipient, arr) }
    while (arr.length > 0 && arr[0] < cutoff) arr.shift()
    if (arr.length >= _EMAIL_RATE_PER_RECIPIENT) {
      const err = new Error(`gmail rate limit: ${_EMAIL_RATE_PER_RECIPIENT}/hr cap reached for ${recipient}`)
      err.code = 'rate_limit_exceeded'
      throw err
    }
    arr.push(now)
  }
  _emailSendGlobal.push(now)
}

/**
 * sendEmailGated - Tier-3 gated external-recipient send per
 * SECURITY_HARDENING.md §3.2/§3.3/§3.4/§7.1.
 *
 * Flow (fail-closed on every error path):
 *   1. commitmentDetector.analyze(body) - if requiresManualTier3(result) is
 *      true, the caller must have gone through the SMS-OTP path to get a
 *      token (the pattern-issued token won't verify because the detector
 *      finding causes verifyAndConsume to fail via mismatched target).
 *   2. outboundEmailDelayQueue.routeOutbound - if `action === 'queued'`,
 *      return { queued: true, row } without sending. 24h delay queue is
 *      the failsafe for unknown recipients.
 *   3. tier3GateService.verifyAndConsume - if false, throw with
 *      code 'tier3_gate_denied'. Single-use token is consumed atomically.
 *   4. Internal sendEmail() - unchanged existing dispatcher.
 *   5. securityAuditLog.append - records every external send with
 *      HMAC-signed content hash.
 *
 * Token acquisition (caller responsibility, not this function):
 * - authorized_action_patterns row match (e.g. `internal_ecodia_comms`
 *     for to_domain in {ecodia.au, ecodia.com.au}) → synchronous token.
 * - Otherwise tier3GateService.issueToken({ ... }) kicks off the SMS-OTP
 *     challenge; Tate replies, then the token is issued via
 *     completeOtpChallenge. Callers pass the resulting token here.
 *
 * The internal sendEmail(...) export is retained for non-external paths
 * (thread replies via sendReplyToThread, listeners, etc.); anything that
 * mails an external recipient MUST migrate to this function.
 */
// Single source of truth for the Tier-3 target payload. Issuer and
// verifier MUST see the same canonical shape or HMAC verification fails.
// Callers pass `context` to declare thread-reply / autonomous status so
// the autonomous_thread_reply pattern can match; field omission means
// "don't assert this property", not "false".
function _buildSendTarget({ to, subject, body, threadId, context }) {
  const primaryTo = Array.isArray(to) ? to[0] : to
  const toStr = String(primaryTo || '')
  const domain = (toStr.split('@')[1] || '').toLowerCase()
  const subjectHash = require('crypto')
    .createHash('sha256')
    .update(String(subject || ''))
    .digest('hex')
  return {
    to: primaryTo,
    to_domain: domain,
    subject_hash: subjectHash,
    body_length: String(body || '').length,
    is_thread_reply: !!(threadId || context?.is_thread_reply),
    autonomous: !!context?.autonomous,
  }
}

async function sendEmailGated({ from, to, cc, bcc, subject, body, threadId, sessionId, gate_token, urgency, context }) {
  if (!to) throw new Error('sendEmailGated: `to` is required')
  if (!sessionId) throw new Error('sendEmailGated: `sessionId` is required (for audit log)')
  if (!gate_token) {
    const err = new Error('tier3_gate_denied: missing gate_token')
    err.code = 'tier3_gate_denied'
    throw err
  }

  const timeSense = require('./timeSenseService')
  const calendarResult = await timeSense.calendarGate({ type: 'gmail_send', urgency: urgency || 'normal' })
  if (!calendarResult.proceed) {
    logger.info('sendEmailGated: deferred by calendar gate', {
      to: Array.isArray(to) ? to[0] : to, subject, defer_until: calendarResult.defer_until, reason: calendarResult.reason,
    })
    return { deferred: true, defer_until: calendarResult.defer_until, reason: calendarResult.reason }
  }

  // Require deps at call-time to keep the existing gmailService surface
  // and test mocks unchanged when sendEmailGated isn't used.
  const commitmentDetector = require('./commitmentDetector')
  const outboundEmailDelayQueue = require('./outboundEmailDelayQueue')
  const tier3GateService = require('./tier3GateService')
  const securityAuditLog = require('./securityAuditLog')

  const primaryTo = Array.isArray(to) ? to[0] : to
  const target = _buildSendTarget({ to, subject, body, threadId, context })

  // 1. Commitment detection. High-risk / contains-commitment content must
  //    go through the manual SMS-OTP path (pattern-match tokens won't
  //    satisfy verifyAndConsume because this caller shape implies the
  //    token was OTP-issued; the commitment detector here surfaces the
  //    classification for audit+logging).
  const detection = await commitmentDetector.analyze(body || '').catch((err) => {
    logger.warn('sendEmailGated: commitmentDetector.analyze threw - fail-closed', { error: err.message })
    throw Object.assign(new Error('tier3_gate_denied: commitment detector unavailable'), {
      code: 'tier3_gate_denied',
    })
  })
  const manualRequired = commitmentDetector.requiresManualTier3(detection)

  // 2. Delay queue for unknown recipients (routeOutbound also does the
  //    known-recipient check; it returns { action: 'send' } when known).
  const route = await outboundEmailDelayQueue.routeOutbound({
    from, to, cc, bcc, subject, body, threadId, sessionId, commitment: detection,
  })
  if (route.action === 'queued') {
    logger.info('sendEmailGated: queued for 24h delay (unknown recipient)', {
      to: primaryTo, subject, sessionId, manual_tier3_required: manualRequired,
    })
    return { queued: true, row: route.row, manual_tier3_required: manualRequired }
  }

  // 3. Tier-3 verify. Fails closed on any mismatch (mis-typed target,
  //    mismatched session, consumed, expired).
  const verified = await tier3GateService.verifyAndConsume({
    token: gate_token,
    action_type: 'gmail_send_external',
    target,
    session_id: sessionId,
  })
  if (!verified) {
    const err = new Error('tier3_gate_denied: token failed verifyAndConsume')
    err.code = 'tier3_gate_denied'
    throw err
  }

  // 4. Internal dispatch (unchanged sender). Called via module.exports so
  //    test suites can stub it without exercising googleapis.
  const result = await module.exports.sendEmail({ from, to, cc, bcc, subject, body, threadId })

  // 5. Audit log - best-effort, non-blocking. If HMAC signing or the
  //    INSERT throws, we log but don't reverse the send (email already
  //    left the building). `.append()` failing is its own incident signal
  //    that bootstrap monitoring should catch.
  try {
    await securityAuditLog.append({
      action_type: 'gmail_send_external',
      target: { to: primaryTo, subject },
      session_id: sessionId,
      trigger_source: 'gmailService.sendEmailGated',
      content: body || '',
    })
  } catch (err) {
    logger.error('sendEmailGated: audit append failed AFTER successful send', {
      error: err.message, sessionId, message_id: result.message_id,
    })
  }

  return result
}

/**
 * sendEmailAuto - attempts auto-token issuance via tier3GateService
 * pattern matching, then invokes sendEmailGated. Used by internal paths
 * (triagePendingEmails, certMonitor, osAlertingService) that have no
 * upstream human session but still need to go through the composite gate.
 *
 * Returns one of:
 *   { sent: true, ... } - pattern matched, token consumed, sent.
 *   { queued: true, row } - delay queue took it (unknown recipient).
 *   { deferred: true, ... } - calendar gate deferred.
 *   { pending_otp: true, otp_id } - no pattern matched, SMS dispatched to Tate.
 *                                   Caller records the otp_id and retries
 *                                   after Tate replies Y <code>.
 *
 * Security: the target built here is byte-for-byte identical to the one
 * sendEmailGated builds internally. HMAC verification depends on that.
 * If you change the target shape in one place, change _buildSendTarget.
 */
async function sendEmailAuto({ from, to, cc, bcc, subject, body, threadId, sessionId, urgency, context }) {
  if (!to) throw new Error('sendEmailAuto: `to` is required')
  const effectiveSessionId = sessionId || `autonomous-${context?.source || 'gmail'}-${Date.now()}`

  // Calendar gate - applies to all autonomous sends (thread replies, new emails,
  // alert sends). calendarGate.urgency='critical' bypasses (alert paths set this).
  // sendEmailGated also has this gate for external Tier-3 sends, so external sends
  // get it twice - acceptable; the first gate here catches all auto paths uniformly.
  try {
    const timeSense = require('./timeSenseService')
    const calResult = await timeSense.calendarGate({ type: 'gmail_send', urgency: urgency || 'normal' })
    if (!calResult.proceed) {
      logger.info('sendEmailAuto: deferred by calendar gate', {
        to: Array.isArray(to) ? to[0] : to,
        subject,
        reason: calResult.reason,
        defer_until: calResult.defer_until,
        source: context?.source,
      })
      return { deferred: true, reason: calResult.reason, defer_until: calResult.defer_until }
    }
  } catch (err) {
    // Calendar gate failure → fail-open (don't block sends on gate errors)
    logger.debug('sendEmailAuto: calendar gate error, proceeding', { error: err.message })
  }

  const tier3 = require('./tier3GateService')
  const target = _buildSendTarget({ to, subject, body, threadId, context })

  const issue = await tier3.issueToken({
    action_type: 'gmail_send_external',
    target,
    session_id: effectiveSessionId,
  })

  if (issue.status === 'pending_otp') {
    // No matching authorized_action_patterns row. SMS-OTP challenge has
    // been recorded in tier3_otp_pending; we now dispatch the code to
    // Tate via Twilio so he can reply "Y <code>" (inbound SMS reflex
    // routes to a Corazon Claude Code tab that calls
    // tier3GateService.completeOtpChallenge + retries the send).
    //
    // 2026-05-18: this used to silently strip otp_code and return -
    // the comment said "caller should surface it to Tate via sms_tate"
    // but no caller did. Net effect: external sends to non-allowlisted
    // domains stalled forever. Wiring the dispatch directly here is the
    // single shortest path that closes the loop without coupling tier3
    // itself to Twilio (tier3 still returns the code; we, the caller,
    // dispatch).
    const recipient = Array.isArray(to) ? to[0] : to
    const subjectPreview = String(subject || '').slice(0, 60)
    const smsBody = `OTP ${issue.otp_code}: email send to ${recipient} - "${subjectPreview}". Reply Y ${issue.otp_code} to confirm (10min).`
    try {
      const alerting = require('./osAlertingService')
      const ok = await alerting.sendSmsToTate(smsBody)
      logger.info('sendEmailAuto: OTP SMS dispatched', {
        to: recipient, subject, otp_id: issue.otp_id, sms_ok: !!ok,
      })
    } catch (err) {
      logger.error('sendEmailAuto: OTP SMS dispatch failed (gate still pending)', {
        to: recipient, subject, otp_id: issue.otp_id, error: err.message,
      })
    }

    return {
      pending_otp: true,
      otp_id: issue.otp_id,
      expires_at: issue.expires_at,
      target_hash: issue.target_hash,
    }
  }

  if (issue.status !== 'issued' || !issue.token) {
    const err = new Error('sendEmailAuto: tier3 issueToken returned unexpected status')
    err.code = 'tier3_issue_failed'
    err.details = { status: issue.status }
    throw err
  }

  // Hand off to the composite gate with the freshly-issued token.
  return module.exports.sendEmailGated({
    from, to, cc, bcc, subject, body, threadId,
    sessionId: effectiveSessionId,
    gate_token: issue.token,
    urgency,
    context,
  })
}

async function createFollowUpTask(threadId, title, description, priority = 'medium') {
  const [thread] = await db`SELECT * FROM email_threads WHERE id = ${threadId}`
  if (!thread) throw new Error('Thread not found')

  const [task] = await db`
    INSERT INTO tasks (title, description, source, source_ref_id, client_id, priority, status)
    VALUES (${title || thread.subject}, ${description || thread.triage_summary || thread.snippet},
      'gmail', ${thread.id}, ${thread.client_id || null}, ${priority}, 'open')
    RETURNING id, title`

  logger.info(`Follow-up task created from email`, { taskId: task.id, threadId })
  return { task_id: task.id, title: task.title }
}

async function unsubscribe(threadId) {
  // Check for List-Unsubscribe header, or just trash + label as unsubscribed
  const [thread] = await db`SELECT * FROM email_threads WHERE id = ${threadId}`
  if (!thread) throw new Error('Thread not found')

  // Trash the email
  await trashThread(threadId)

  // Auto-learn: mark this sender domain for future auto-trash
  const domain = (thread.from_email || '').split('@')[1]
  if (domain) {
    // Store unsubscribe preference
    await db`
      INSERT INTO email_sender_prefs (domain, from_email, action, reason, created_at)
      VALUES (${domain}, ${thread.from_email}, 'trash', 'unsubscribed', now())
      ON CONFLICT (from_email) DO UPDATE SET action = 'trash', reason = 'unsubscribed', created_at = now()
    `.catch(() => {
      // Table might not exist yet - non-blocking
      logger.debug('email_sender_prefs table not available, skipping sender pref')
    })
  }

  logger.info(`Unsubscribed from ${thread.from_email}: ${thread.subject}`)
  return { unsubscribed: true, from: thread.from_email, domain }
}

async function getThreadsByClient(clientId, limit = 20) {
  return db`
    SELECT id, gmail_thread_id, subject, from_email, from_name, snippet, triage_priority, status, received_at
    FROM email_threads WHERE client_id = ${clientId}
    ORDER BY received_at DESC LIMIT ${limit}`
}

async function getInboxStats() {
  const [stats] = await db`
    SELECT
      count(*) FILTER (WHERE status = 'unread')::int AS unread,
      count(*) FILTER (WHERE status = 'unread' AND triage_priority = 'urgent')::int AS urgent,
      count(*) FILTER (WHERE status = 'unread' AND triage_priority = 'high')::int AS high,
      count(*) FILTER (WHERE triage_status = 'pending')::int AS pending_triage,
      count(*) FILTER (WHERE triage_status = 'failed')::int AS failed_triage,
      count(*) FILTER (WHERE status = 'unread' AND received_at > now() - interval '1 hour')::int AS last_hour,
      count(DISTINCT from_email) FILTER (WHERE status = 'unread')::int AS unique_senders
    FROM email_threads
    WHERE received_at > now() - interval '7 days'`

  // Per-inbox breakdown
  const perInbox = await db`
    SELECT inbox, count(*) FILTER (WHERE status = 'unread')::int AS unread,
      count(*)::int AS total
    FROM email_threads WHERE received_at > now() - interval '7 days'
    GROUP BY inbox`

  return { ...stats, per_inbox: perInbox }
}

async function listLabels(inbox) {
  if (!GMAIL_ENABLED) throw new Error('Gmail disabled')
  const gmail = getGmailClient(inbox || (await getInboxes())[0])
  const res = await gmail.users.labels.list({ userId: 'me' })
  return (res.data.labels || []).map(l => ({ id: l.id, name: l.name, type: l.type }))
}

// ─── Label Helpers ──────────────────────────────────────────────────────────

let _labelCache = {}

async function _resolveLabel(gmail, name) {
  if (_labelCache[name]) return _labelCache[name]
  const res = await gmail.users.labels.list({ userId: 'me' })
  const label = (res.data.labels || []).find(l => l.name.toLowerCase() === name.toLowerCase())
  if (label) { _labelCache[name] = label.id; return label.id }
  return null
}

async function _resolveOrCreateLabel(gmail, name) {
  const existing = await _resolveLabel(gmail, name)
  if (existing) return existing
  // System labels can't be created
  if (['INBOX', 'SENT', 'DRAFT', 'TRASH', 'SPAM', 'STARRED', 'UNREAD', 'IMPORTANT'].includes(name.toUpperCase())) {
    return name.toUpperCase()
  }
  const res = await gmail.users.labels.create({ userId: 'me', requestBody: { name, labelListVisibility: 'labelShow', messageListVisibility: 'show' } })
  _labelCache[name] = res.data.id
  return res.data.id
}

module.exports = {
  pollInbox, sendReply, archiveThread, markRead, trashThread, triagePendingEmails,
  // New
  listThreads, searchThreads, batchArchive, batchTrash,
  labelThread, removeLabel, starThread, unstarThread,
  forwardThread, sendNewEmail, sendEmail, sendEmailGated, sendEmailAuto, sendReplyToThread, createFollowUpTask, unsubscribe,
  getThreadsByClient, getInboxStats, listLabels, saveDraftToGmail,
}
