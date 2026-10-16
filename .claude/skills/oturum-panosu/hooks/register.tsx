import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { OturumPanosuRaw, OturumPanosuRow, OturumPanosuStatus, OturumPanosuSummary } from '../types'
import { LABEL, NEEDS_PERSON, ago, classify, parseSummary, sortRows, summaryPrompt } from './classify'

const PANE = 'oturum-panosu'
const TITLE = 'Oturum panosu'
const REFRESH_MS = 20_000

const rowsAtom = atom({ plugin: 'oturum-panosu', key: 'rows' } as const, [])
const refreshedAtom = atom({ plugin: 'oturum-panosu', key: 'refreshedAt' } as const, 0)
const staleAtom = atom({ plugin: 'oturum-panosu', key: 'staleCount' } as const, 0)
const errorAtom = atom({ plugin: 'oturum-panosu', key: 'error' } as const, '')
const summaryAtom = atom({ plugin: 'oturum-panosu', key: 'summary' } as const, null)
const busyAtom = atom({ plugin: 'oturum-panosu', key: 'isSummarizing' } as const, false)

const COLOR: Record<OturumPanosuStatus, string> = {
  izin: 'permission',
  soru: 'warning',
  karar: 'warning',
  plan: 'planMode',
  hata: 'error',
  bitti: 'success',
  durdu: 'inactive',
  calisiyor: 'claude',
}

function clockTime(ms: number): string {
  if (!ms) return '—'
  try {
    return new Date(ms).toLocaleTimeString('tr-TR', {
      timeZone: 'America/Los_Angeles',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return new Date(ms).toISOString().slice(11, 16)
  }
}

// What the last refresh saw, to raise a toast only when a session changes into
// a state that needs the person. Lost on reload on purpose: no toast burst then.
let seen: Map<string, OturumPanosuStatus> | undefined
let selfId: string | undefined
let refreshing: Promise<OturumPanosuRow[]> | undefined

async function collect($: EngineInterface): Promise<OturumPanosuRow[]> {
  if (selfId === undefined) selfId = (await $.env.get('CLAUDE_CODE_SESSION_ID')) ?? '-'
  const run = await $.process.run(['node', `${$.plugin.root}/bin/collect.mjs`, selfId || '-'], { timeoutMs: 20_000 })
  if (run.exitCode !== 0) throw new Error(run.stderr.trim().split('\n').pop() || `collect exited ${run.exitCode}`)
  const out = JSON.parse(run.stdout) as { now: number; sessions: OturumPanosuRaw[]; staleCount: number }
  const rows = sortRows(out.sessions.map(s => classify(s, out.now)))
  await update($, rowsAtom, () => rows)
  await update($, refreshedAtom, () => out.now)
  await update($, staleAtom, () => out.staleCount)
  await update($, errorAtom, () => '')
  return rows
}

function announce($: EngineInterface, rows: OturumPanosuRow[]) {
  const waiting = rows.filter(r => NEEDS_PERSON.has(r.status))
  $.ui.status(waiting.length ? `Pano: ${waiting.length} oturum seni bekliyor` : undefined)
  const before = seen
  seen = new Map(rows.map(r => [r.id, r.status]))
  if (!before) return
  for (const r of rows) {
    const was = before.get(r.id)
    if (was === r.status) continue
    if (NEEDS_PERSON.has(r.status) || r.status === 'bitti') $.ui.toast(`${LABEL[r.status]} · ${r.title}`, { timeoutMs: 8000 })
  }
}

async function refresh($: EngineInterface): Promise<OturumPanosuRow[]> {
  if (refreshing) return refreshing
  refreshing = (async () => {
    try {
      const rows = await collect($)
      announce($, rows)
      return rows
    } catch (err) {
      await update($, errorAtom, () => `Yenilenemedi: ${err instanceof Error ? err.message : String(err)}`)
      return read($, rowsAtom)
    } finally {
      refreshing = undefined
    }
  })()
  return refreshing
}

async function summarize($: EngineInterface) {
  if (await read($, busyAtom)) return
  await update($, busyAtom, () => true)
  try {
    const rows = await refresh($)
    const at = await $.clock.now()
    if (rows.length === 0) {
      await update($, summaryAtom, () => ({ at, items: [], enOnemli: 'Açık oturum yok.' }))
      return
    }
    const reply = await $.model.complete({
      model: 'sonnet',
      system: 'Kısa, sade Türkçe yazan bir proje asistanısın. Yalnız istenen JSON\'u döndürürsün.',
      prompt: summaryPrompt(rows),
      maxTokens: 4000,
      timeoutMs: 120_000,
    })
    let summary: OturumPanosuSummary
    if (!reply.isAnswered) {
      summary = { at, items: [], enOnemli: '', error: `Özet alınamadı (${reply.reason}).` }
    } else {
      try {
        const parsed = parseSummary(reply.text)
        const titles = new Map(rows.map(r => [r.id, r.title]))
        summary = {
          at,
          items: parsed.items.filter(i => titles.has(i.id)).map(i => ({ ...i, title: titles.get(i.id) ?? '' })),
          enOnemli: parsed.enOnemli,
        }
      } catch (err) {
        summary = { at, items: [], enOnemli: '', error: `Özet okunamadı: ${err instanceof Error ? err.message : String(err)}` }
      }
    }
    await update($, summaryAtom, () => summary)
  } finally {
    await update($, busyAtom, () => false)
  }
}

// The pane polls only in the session that opened it with /pano: the mod loads
// in every newfork-clean session, and the others should carry no load for it.
let poll: { cancel: () => void } | undefined

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({ name: 'pano', description: 'Oturum panosunu açar: açık oturumların durumu ve Summarize' })
    return started
  })

  on('command.run', { command: 'pano' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE, focus: true })
    poll ??= $.clock.every(REFRESH_MS, () => void refresh($))
    await refresh($)
    return { text: 'Oturum panosu açıldı. 20 saniyede bir yenilenir; kapatınca durur.' }
  })

  on('ui.close', async ($, e, next) => {
    if (e.id === PANE) {
      poll?.cancel()
      poll = undefined
      seen = undefined
      $.ui.status(undefined)
    }
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const rows = await read($, rowsAtom)
    const refreshedAt = await read($, refreshedAtom)
    const staleCount = await read($, staleAtom)
    const error = await read($, errorAtom)
    const summary = await read($, summaryAtom)
    const isBusy = await read($, busyAtom)
    const now = refreshedAt || Date.now()
    const byId = new Map((summary?.items ?? []).map(i => [i.id, i]))

    const groups: { title: string; rows: OturumPanosuRow[] }[] = [
      { title: 'Seni bekleyen', rows: rows.filter(r => NEEDS_PERSON.has(r.status)) },
      { title: 'Biten', rows: rows.filter(r => r.status === 'bitti' || r.status === 'durdu') },
      { title: 'Çalışan', rows: rows.filter(r => r.status === 'calisiyor') },
    ]

    const card = (r: OturumPanosuRow) => {
      const s = byId.get(r.id)
      return (
        <Box key={r.id} flexDirection="column" borderStyle="round" borderColor={COLOR[r.status]} paddingX={1}>
          <Box flexDirection="row" gap={1} flexWrap="wrap">
            <Text backgroundColor={COLOR[r.status]} color="inverseText" bold>
              {` ${LABEL[r.status]} `}
            </Text>
            <Text bold>{r.title}</Text>
            {r.isNew && (
              <Text color="warning" bold>
                • YENİ
              </Text>
            )}
            <Text dimColor>{ago(r.since, now)}</Text>
          </Box>
          {r.detail !== '' && <Text wrap="wrap">{r.detail}</Text>}
          {r.options.length > 0 && <Text dimColor>Seçenekler: {r.options.join(' · ')}</Text>}
          {s && (
            <Box flexDirection="column" marginTop={1}>
              {s.bitti !== '' && <Text wrap="wrap">✓ Biten: {s.bitti}</Text>}
              {s.acik !== '' && <Text wrap="wrap">○ Açık: {s.acik}</Text>}
              {s.sonraki !== '' && (
                <Text wrap="wrap" bold>
                  → Sıradaki: {s.sonraki}
                </Text>
              )}
            </Box>
          )}
        </Box>
      )
    }

    return (
      <Box flexDirection="column" gap={1} paddingX={1}>
        <Box flexDirection="row" gap={1} alignItems="center" flexWrap="wrap">
          <Button key="summarize" variant="primary" onPress={() => summarize($)}>
            {isBusy ? 'Özetleniyor…' : 'Summarize'}
          </Button>
          <Button key="refresh" onPress={() => void refresh($)}>
            Yenile
          </Button>
          <Text dimColor>
            {clockTime(refreshedAt)} güncellendi · 20 sn'de bir yenilenir
          </Text>
        </Box>
        {error !== '' && <Text color="error">{error}</Text>}
        {summary && (
          <Box flexDirection="column" borderStyle="double" borderColor="claude" paddingX={1}>
            <Text bold>Şimdi en önemli iş</Text>
            {summary.error ? (
              <Text color="error">{summary.error}</Text>
            ) : (
              <Text wrap="wrap">{summary.enOnemli || '—'}</Text>
            )}
            <Text dimColor>Özet saati {clockTime(summary.at)}</Text>
          </Box>
        )}
        {rows.length === 0 && <Text dimColor>Son 48 saatte açık oturum yok.</Text>}
        {groups
          .filter(g => g.rows.length > 0)
          .map(g => (
            <Box key={g.title} flexDirection="column" gap={1}>
              <Text bold>
                {g.title} ({g.rows.length})
              </Text>
              {g.rows.map(card)}
            </Box>
          ))}
        {staleCount > 0 && <Text dimColor>48 saatten eski {staleCount} oturum gösterilmiyor.</Text>}
      </Box>
    )
  })
}
