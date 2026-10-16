import { expect, test } from 'claude-code/testing'

const NOW = 1_800_000_000_000
const COLLECTED = JSON.stringify({
  now: NOW,
  staleCount: 3,
  sessions: [
    {
      id: 'local_done',
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
      id: 'local_ask',
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

test('the pane shows each session with its keyword and summarizes on press', async ($, on) => {
  on('process.run', () => ({ value: { exitCode: 0, stdout: COLLECTED, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('env.get', () => ({ value: 'self' }))
  on('clock.now', () => ({ value: NOW }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('model.complete', () => ({ value: {
    isAnswered: true,
    text: '{"items":[{"id":"local_ask","bitti":"Üç varyant hazır.","acik":"Seçim bekliyor.","sonraki":"Varyantı seç."}],"enOnemli":"Bildirim varyantları oturumunda varyantı seç."}',
    usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
  } }))

  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ plugin: 'oturum-panosu', surface, ...PANE, props: PROPS })
    await ui.press({ key: 'refresh' })
    expect(await ui.find({ type: 'Text', text: /SORUYU CEVAPLA/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /TASK BİTTİ/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Which variant\?/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /3 oturum gösterilmiyor/ })).toBeDefined()

    await ui.press({ key: 'summarize' })
    expect(await ui.find({ type: 'Text', text: /varyantı seç\./ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Sıradaki: Varyantı seç/ })).toBeDefined()
    await ui.unmount()
  }
})

test('/pano opens the pane with fresh rows and says who waits', async ($, on) => {
  const opened: string[] = []
  const statuses: (string | undefined)[] = []
  let runs = 0
  on('ui.open', ($, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('process.run', () => {
    runs++
    return { value: { exitCode: 0, stdout: COLLECTED, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('env.get', () => ({ value: 'self' }))
  on('ui.status', ($, e) => {
    statuses.push(e.text)
    return { value: undefined }
  })
  on('ui.toast', () => ({ value: undefined }))
  on('clock.every', () => ({ value: undefined }))

  const { text } = await $.command.run({ command: 'pano', args: '' } as never)
  expect(text).toContain('Oturum panosu açıldı')
  expect(opened).toEqual(['oturum-panosu'])
  expect(runs).toBe(1)
  expect(statuses.at(-1)).toBe('Pano: 1 oturum seni bekliyor')
})
