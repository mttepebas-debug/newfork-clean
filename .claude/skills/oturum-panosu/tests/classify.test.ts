import { expect, test } from 'claude-code/testing'

import type { OturumPanosuEvent, OturumPanosuRaw } from '../types'
import { classify, parseSummary, sortRows } from '../hooks/classify'

const NOW = 1_000_000_000
const raw = (events: OturumPanosuEvent[], over: Partial<OturumPanosuRaw> = {}): OturumPanosuRaw => ({
  id: 'local_x',
  title: 'X',
  cwd: 'C:\\x',
  permissionMode: 'bypassPermissions',
  lastFocusedAt: 0,
  activityAt: NOW - 60_000,
  mtimeMs: NOW - 60_000,
  lastPrompt: 'do it',
  events,
  cliId: 'cli_x',
  background: [],
  ...over,
})
const prompt: OturumPanosuEvent = { k: 'prompt', t: NOW - 120_000, text: 'do it' }

test('a turn that ended with plain text is TASK BİTTİ', () => {
  const r = classify(raw([prompt, { k: 'text', t: NOW - 61_000, text: 'Done. Pushed.' }, { k: 'stop', t: NOW - 60_000 }]), NOW)
  expect(r.status).toBe('bitti')
  expect(r.isNew).toBe(true)
})

test('a turn that ended with a question is SORUYU CEVAPLA', () => {
  const r = classify(raw([prompt, { k: 'text', t: NOW - 61_000, text: 'Two ways.\n\nWhich one do you want?' }, { k: 'stop', t: NOW - 60_000 }]), NOW)
  expect(r.status).toBe('soru')
  expect(r.detail).toContain('Which one')
})

test('a wrap-up that asks is KARAR VER with its buttons', () => {
  const r = classify(
    raw([
      prompt,
      { k: 'tool', t: NOW - 61_000, id: 'w', name: 'mcp__ccd_turn__wrap_up', ask: 'Commit now?', actions: ['Commit', 'Not now'] },
      { k: 'result', t: NOW - 60_500, id: 'w' },
    ]),
    NOW,
  )
  expect(r.status).toBe('karar')
  expect(r.options).toEqual(['Commit', 'Not now'])
})

test('an open AskUserQuestion is SORUYU CEVAPLA even while fresh', () => {
  const r = classify(raw([prompt, { k: 'tool', t: NOW - 1000, id: 'q', name: 'AskUserQuestion', input: 'Where?' }], { mtimeMs: NOW - 1000 }), NOW)
  expect(r.status).toBe('soru')
})

test('a quiet pending call outside bypass mode is İZİN VER, inside bypass it runs', () => {
  const events: OturumPanosuEvent[] = [prompt, { k: 'tool', t: NOW - 45_000, id: 'b', name: 'Bash', input: 'rm x' }]
  expect(classify(raw(events, { permissionMode: 'default', mtimeMs: NOW - 45_000 }), NOW).status).toBe('izin')
  expect(classify(raw(events, { mtimeMs: NOW - 45_000 }), NOW).status).toBe('calisiyor')
})

test('an interrupt is DURDURULDU and a looked-at finish is not new', () => {
  expect(classify(raw([prompt, { k: 'interrupt', t: NOW - 60_000 }]), NOW).status).toBe('durdu')
  const r = classify(raw([prompt, { k: 'text', t: NOW - 61_000, text: 'ok' }, { k: 'stop', t: NOW - 60_000 }], { lastFocusedAt: NOW - 1000 }), NOW)
  expect(r.isNew).toBe(false)
})

test('waiting sessions sort above finished above running', () => {
  const done = classify(raw([prompt, { k: 'text', t: NOW - 61_000, text: 'ok' }, { k: 'stop', t: NOW - 60_000 }], { id: 'a' }), NOW)
  const run = classify(raw([prompt, { k: 'tool', t: NOW - 1000, id: 'b', name: 'Bash' }], { id: 'b', mtimeMs: NOW - 1000 }), NOW)
  const ask = classify(raw([prompt, { k: 'tool', t: NOW - 1000, id: 'q', name: 'AskUserQuestion' }], { id: 'c' }), NOW)
  expect(sortRows([run, done, ask]).map(r => r.id)).toEqual(['c', 'a', 'b'])
})

test('the summary reply is read from fenced JSON', () => {
  const s = parseSummary('```json\n{"items":[{"id":"a","bitti":"b","acik":"c","sonraki":"d"}],"enOnemli":"e"}\n```')
  expect(s.items[0]?.sonraki).toBe('d')
  expect(s.enOnemli).toBe('e')
})

test('a finished turn with a background job still running is ÇALIŞIYOR', () => {
  const ended: OturumPanosuEvent[] = [prompt, { k: 'text', t: NOW - 61_000, text: 'Train is running.' }, { k: 'stop', t: NOW - 60_000 }]
  const r = classify(raw(ended, { background: [{ id: 'b1', label: 'Run the train', startedAt: NOW - 70_000 }] }), NOW)
  expect(r.status).toBe('calisiyor')
  expect(r.detail).toContain('Run the train')
  const ask = classify(raw([prompt, { k: 'tool', t: NOW - 1000, id: 'q', name: 'AskUserQuestion', input: 'Where?' }], { background: [{ id: 'b1', label: 'tests', startedAt: NOW }] }), NOW)
  expect(ask.status).toBe('soru')
  expect(ask.detail).toContain('arka planda 1 iş')
})
