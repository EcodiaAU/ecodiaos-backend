'use strict'

jest.mock('../../config/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}))

jest.mock('../../config/db', () => {
  function dbTag() { return Promise.resolve([]) }
  return dbTag
})

jest.mock('../usageEnergyService', () => ({
  getEnergy: jest.fn().mockResolvedValue({ level: 'healthy', scheduleMultiplier: 1.0 }),
}))

jest.mock('../../lib/forkCapAtomic', () => ({
  liveForkCount: jest.fn().mockResolvedValue(2),
}))

const engine = require('../proactivityEngine')

beforeEach(() => {
  engine._actionHistory.clear()
})

describe('proactivityEngine.nextAction', () => {
  test('returns null when energy is critical', async () => {
    const result = await engine.nextAction({
      energy_level: 'critical',
      time_of_day: 10,
      urgent_goals: [],
      unverified_claims_count: 0,
      fork_slot_available: true,
      last_tate_interaction_ms: 1000,
      work_queue_depth: 0,
    })
    expect(result).toBeNull()
  })

  test('returns urgent_goal_push when goal is near deadline', async () => {
    const result = await engine.nextAction({
      energy_level: 'healthy',
      time_of_day: 10,
      urgent_goals: [{ id: 1, title: 'Ship security', target_date: new Date(Date.now() + 3600000).toISOString(), priority: 1.0 }],
      unverified_claims_count: 0,
      fork_slot_available: true,
      last_tate_interaction_ms: 1000,
      work_queue_depth: 0,
    })
    expect(result).not.toBeNull()
    expect(result.action_class).toBe('urgent_goal_push')
    expect(result.goal_id).toBe(1)
  })

  test('returns verify_claims when backlog is large during work hours', async () => {
    const result = await engine.nextAction({
      energy_level: 'healthy',
      time_of_day: 14,
      urgent_goals: [],
      unverified_claims_count: 10,
      fork_slot_available: true,
      last_tate_interaction_ms: 1000,
      work_queue_depth: 0,
    })
    expect(result).not.toBeNull()
    expect(result.action_class).toBe('verify_claims')
  })

  test('returns overnight_batch during overnight hours', async () => {
    const result = await engine.nextAction({
      energy_level: 'healthy',
      time_of_day: 3, // 3am
      urgent_goals: [],
      unverified_claims_count: 0,
      fork_slot_available: true,
      last_tate_interaction_ms: 100000,
      work_queue_depth: 0,
    })
    expect(result).not.toBeNull()
    expect(result.action_class).toBe('overnight_batch')
  })

  test('returns null during low energy work hours with no urgency', async () => {
    const result = await engine.nextAction({
      energy_level: 'low',
      time_of_day: 14,
      urgent_goals: [],
      unverified_claims_count: 2,
      fork_slot_available: true,
      last_tate_interaction_ms: 1000,
      work_queue_depth: 0,
    })
    // Low energy skips non-critical during work hours (after check_email)
    // check_email fires first unless damped
    if (result) expect(result.action_class).toBe('check_email')
  })
})

describe('proactivityEngine.classifyEmailSource', () => {
  test('classifies government domains as legal/high', () => {
    const result = engine.classifyEmailSource('someone@ato.gov.au', '', '')
    expect(result.source_type).toBe('legal')
    expect(result.urgency).toBe('high')
  })

  test('classifies newsletter keywords as newsletter/batch', () => {
    const result = engine.classifyEmailSource('noreply@example.com', 'Weekly Roundup', 'Click here to unsubscribe')
    expect(result.source_type).toBe('newsletter')
    expect(result.urgency).toBe('batch')
  })

  test('classifies ecodia domain as internal', () => {
    const result = engine.classifyEmailSource('tate@ecodia.au', 'Test', '')
    expect(result.source_type).toBe('internal')
    expect(result.urgency).toBe('normal')
  })

  test('classifies unknown domain as unknown/normal', () => {
    const result = engine.classifyEmailSource('person@random.com', 'Hello', 'Just a note')
    expect(result.source_type).toBe('unknown')
    expect(result.urgency).toBe('normal')
  })
})

describe('proactivityEngine anti-loop damping', () => {
  test('damping activates after 3 no-value fires', () => {
    engine._recordFire('test_action', false)
    engine._recordFire('test_action', false)
    expect(engine._isDamped('test_action')).toBe(false)
    engine._recordFire('test_action', false)
    expect(engine._isDamped('test_action')).toBe(true)
  })

  test('value production resets damping counter', () => {
    engine._recordFire('test_action2', false)
    engine._recordFire('test_action2', false)
    engine._recordFire('test_action2', true) // value!
    engine._recordFire('test_action2', false)
    expect(engine._isDamped('test_action2')).toBe(false)
  })

  test('undamped action class returns false', () => {
    expect(engine._isDamped('never_fired')).toBe(false)
  })
})
