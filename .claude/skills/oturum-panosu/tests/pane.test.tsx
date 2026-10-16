import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const NOW = 1_800_000_000_000
const DONE = 'local_00000000-0000-4000-8000-000000000001'
const ASK = 'local_00000000-0000-4000-8000-000000000002'
const COLLECTED = JSON.stringify({
  now: NOW,
  staleCount: 3,
  accountDir: 'C:\\acct',
  sessions: [
    {
      id: DONE,
      title: 'Sentry',
      cwd: 'C:\\x',
      permissionMode: 'bypassPermissions',
      lastFocusedAt: 0,
      activityAt: NOW - 120_000,
      mtimeMs: NOW - 120_000,
      lastPrompt: 'set up sentry',
      events: [
        { k: 'prompt', t: NOW - 300_000, text: 'set up sentry' },
        { k: 'text', t: NOW - 121_000, text: 'Sentry is live.' },
        { k: 'stop', t: NOW - 120_000 },
      ],
    },
    {
      id: ASK,
      title: 'Bildirim varyantları',
      cwd: 'C:\\x',
      permissionMode: 'bypassPermissions',
      lastFocusedAt: 0,
      activityAt: NOW - 5_000,
      mtimeMs: NOW - 5_000,
      lastPrompt: 'pick one',
      events: [
        { k: 'prompt', t: NOW - 60_000, text: 'pick one' },
        { k: 'tool', t: NOW - 5_000, id: 'q', name: 'AskUserQuestion', input: 'Which variant?' },
      ],
    },
  ],
})

const PANE = { component: 'Pane', requestId: 'oturum-panosu' } as const
const PROPS = { title: 'Oturum panosu', isFocused: true, bodyColumns: 80, placement: 'dock', scroll: { top: 0 }, view: {} } as never
const OK = { exitCode: 0, stdout: COLLECTED, stderr: '', isStdoutTruncated: false, isStderrTruncated: false }

function world(on: On) {
  const runs: string[][] = []
  const stored: unknown[] = []
  on('process.run', ($, e) => {
    runs.push([...e.argv])
    return { value: e.argv[0] === 'node' ? OK : { ...OK, stdout: '' } }
  })
  on('env.get', () => ({ value: 'self' }))
  on('clock.now', () => ({ value: NOW }))
  on('clock.every', () => ({ value: undefined }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', ($, e) => {
    stored.push(e.value)
    return { value: undefined }
  })
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('model.complete', () => ({
    value: {
      isAnswered: true,
      text: `{"items":[{"id":"${ASK}","bitti":"Üç varyant hazır.","acik":"Seçim bekliyor.","sonraki":"Varyantı seç."}],"enOnemli":"Bildirim varyantları oturumunda varyantı seç."}`,
      usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    },
  }))
  return { runs, stored }
}

const click = async (ui: { pointer: (e: never) => Promise<void> }, y: number) => {
  await ui.pointer({ type: 'down', x: 4, y, button: 'left', in: 'board' } as never)
  await ui.pointer({ type: 'up', x: 4, y, button: 'left', in: 'board' } as never)
}

// Layout A lines (the ask row has no options and, before Summarize, no next step): 0 Seni bekleyen · 1 ask row · 2 its detail · 3 gap · 4 Biten · 5 done row · 6 detail · 7 gap · 8 Çalışan · 9 empty
test('the board groups the sessions with their keywords', async ($, on) => {
  world(on)
  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ plugin: 'oturum-panosu', surface, ...PANE, props: PROPS })
    await ui.press({ key: 'refresh' })
    expect(await ui.find({ type: 'Text', text: /SORUYU CEVAPLA/, in: 'board' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /TASK BİTTİ/, in: 'board' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Which variant\?/, in: 'board' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /3 oturum gizli/ })).toBeDefined()
    await ui.unmount()
  }
})

test('clicking a session row opens that session in the app', async ($, on) => {
  const { runs } = world(on)
  const ui = await $.ui.mount({ plugin: 'oturum-panosu', surface: 'desktop', ...PANE, props: PROPS })
  await ui.press({ key: 'refresh' })
  await click(ui, 1)
  expect(runs.at(-1)).toEqual(['rundll32', 'url.dll,FileProtocolHandler', `claude://claude.ai/epitaxy/${ASK}`])
})

test('clicking a header closes and reopens its group, and it is remembered', async ($, on) => {
  const { stored } = world(on)
  const ui = await $.ui.mount({ plugin: 'oturum-panosu', surface: 'desktop', ...PANE, props: PROPS })
  await ui.press({ key: 'refresh' })
  await click(ui, 0)
  expect(await ui.find({ type: 'Text', text: /Which variant\?/, in: 'board' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /▸ Seni bekleyen/, in: 'board' })).toBeDefined()
  expect(stored.at(-1)).toMatchObject({ collapsed: ['bekleyen'] })
  await click(ui, 0)
  expect(await ui.find({ type: 'Text', text: /Which variant\?/, in: 'board' })).toBeDefined()
})

test('dragging a group header onto another reorders the groups', async ($, on) => {
  const { stored } = world(on)
  const ui = await $.ui.mount({ plugin: 'oturum-panosu', surface: 'desktop', ...PANE, props: PROPS })
  await ui.press({ key: 'refresh' })
  await ui.pointer({ type: 'down', x: 4, y: 4, button: 'left', in: 'board' } as never)
  await ui.pointer({ type: 'move', x: 4, y: 2, button: 'left', in: 'board' } as never)
  await ui.pointer({ type: 'move', x: 4, y: 0, button: 'left', in: 'board' } as never)
  expect(await ui.find({ type: 'Text', text: /buraya bırak/, in: 'board' })).toBeDefined()
  await ui.pointer({ type: 'up', x: 4, y: 0, button: 'left', in: 'board' } as never)
  expect(stored.at(-1)).toMatchObject({ order: ['biten', 'bekleyen', 'calisan'] })
  const headers = await ui.findAll({ type: 'Text', text: /^▾ /, in: 'board' })
  expect(headers.map(h => h.text)).toEqual(['▾ Biten', '▾ Seni bekleyen', '▾ Çalışan'])
})

test('the compact layout drops the detail lines; summarize adds the next step', async ($, on) => {
  world(on)
  const ui = await $.ui.mount({ plugin: 'oturum-panosu', surface: 'desktop', ...PANE, props: PROPS })
  await ui.press({ key: 'refresh' })
  await ui.press({ key: 'layout-B' })
  expect(await ui.find({ type: 'Text', text: /Which variant\?/, in: 'board' })).toBeUndefined()
  await ui.press({ key: 'layout-A' })
  await ui.press({ key: 'summarize' })
  expect(await ui.find({ type: 'Text', text: /varyantı seç\./ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Sıradaki: Varyantı seç/, in: 'board' })).toBeDefined()
})

test('/pano opens the pane with fresh rows', async ($, on) => {
  const { runs } = world(on)
  const opened: string[] = []
  on('ui.open', ($, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  const { text } = await $.command.run({ command: 'pano', args: '' } as never)
  expect(text).toContain('Oturum panosu açıldı')
  expect(opened).toEqual(['oturum-panosu'])
  expect(runs.filter(r => r[0] === 'node')).toHaveLength(1)
})
