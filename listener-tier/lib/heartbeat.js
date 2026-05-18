'use strict'

const axios = require('axios')

const MCP_URL = process.env.ECODIA_MCP_URL || 'https://api.admin.ecodia.au/api/mcp/cowork'
const BEARER = process.env.COWORK_MCP_BEARER || process.env.ECODIA_FULL_BEARER || ''

const _failedRecently = new Set()

async function writeHealth(listenerName, payload) {
  if (!BEARER) {
    return
  }
  const key = `health.eos_listener_tier.${listenerName}`
  const value = {
    listener: listenerName,
    host: process.env.HOSTNAME || 'corazon',
    ts: new Date().toISOString(),
    ...payload,
  }
  try {
    await axios.post(
      `${MCP_URL}/kv_store.set`,
      { key, value },
      {
        timeout: 5000,
        headers: { Authorization: `Bearer ${BEARER}` },
      },
    )
    _failedRecently.delete(listenerName)
  } catch (err) {
    if (!_failedRecently.has(listenerName)) {
      _failedRecently.add(listenerName)
      process.stderr.write(
        `[listener-tier] kv_store.set health failed for ${listenerName}: ${err.message}\n`,
      )
    }
  }
}

async function statusBoardP3(listenerName, message, context) {
  if (!BEARER) return
  try {
    await axios.post(
      `${MCP_URL}/status_board.upsert`,
      {
        entity_type: 'task',
        name: `listener-tier ${listenerName} surfaced`,
        status: 'in-progress',
        next_action: message,
        next_action_by: 'ecodiaos',
        priority: 3,
        context: context || null,
      },
      {
        timeout: 5000,
        headers: { Authorization: `Bearer ${BEARER}` },
      },
    )
  } catch (err) {
    process.stderr.write(
      `[listener-tier] status_board.upsert failed for ${listenerName}: ${err.message}\n`,
    )
  }
}

module.exports = { writeHealth, statusBoardP3 }
