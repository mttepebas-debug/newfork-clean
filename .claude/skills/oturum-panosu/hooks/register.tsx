import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type {
  OturumPanosuBoardMessage,
  OturumPanosuBoardProps,
  OturumPanosuGroup,
  OturumPanosuLayout,
  OturumPanosuRaw,
  OturumPanosuRow,
  OturumPanosuStatus,
  OturumPanosuSummary,
} from '../types'
import { LABEL, NEEDS_PERSON, ago, classify, parseSummary, sortRows, summaryPrompt } from './classify'

const PANE = 'oturum-panosu'
const TITLE = 'Oturum panosu'
const REFRESH_MS = 20_000
const STORE_KEY = 'board'
const GROUPS: readonly OturumPanosuGroup[] = ['bekleyen', 'biten', 'calisan']

const rowsAtom = atom({ plugin: 'oturum-panosu', key: 'rows' } as const, [])
const refreshedAtom = atom({ plugin: 'oturum-panosu', key: 'refreshedAt' } as const, 0)
const staleAtom = atom({ plugin: 'oturum-panosu', key: 'staleCount' } as const, 0)
const errorAtom = atom({ plugin: 'oturum-panosu', key: 'error' } as const, '')
const summaryAtom = atom({ plugin: 'oturum-panosu', key: 'summary' } as const, null)
const busyAtom = atom({ plugin: 'oturum-panosu', key: 'isSummarizing' } as const, false)
const layoutAtom = atom({ plugin: 'oturum-panosu', key: 'layout' } as const, 'A')
const orderAtom = atom({ plugin: 'oturum-panosu', key: 'order' } as const, [...GROUPS])
const collapsedAtom = atom({ plugin: 'oturum-panosu', key: 'collapsed' } as const, [])

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

const GROUP_INFO: Record<OturumPanosuGroup, { title: string; color: string; has: (s: OturumPanosuStatus) => boolean }> = {
  bekleyen: { title: 'Seni bekleyen', color: 'warning', has: s => NEEDS_PERSON.has(s) },
  biten: { title: 'Biten', color: 'success', has: s => s === 'bitti' || s === 'durdu' },
  calisan: { title: 'Çalışan', color: 'claude', has: s => s === 'calisiyor' },
}

const LAYOUTS: { id: OturumPanosuLayout; label: string }[] = [
  { id: 'A', label: 'A · Gelen kutusu' },
  { id: 'B', label: 'B · Kompakt' },
  { id: 'C', label: 'C · Odak' },
]

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

/** The person's board choices outlive the session: layout, group order, closed groups. */
type Saved = { layout?: OturumPanosuLayout; order?: OturumPanosuGroup[]; collapsed?: OturumPanosuGroup[] }

function validOrder(order: unknown): OturumPanosuGroup[] | undefined {
  if (!Array.isArray(order) || order.length !== GROUPS.length) return undefined
  return GROUPS.every(g => order.includes(g)) ? (order as OturumPanosuGroup[]) : undefined
}

async function loadSaved($: EngineInterface) {
  const saved = ((await $.store.get(STORE_KEY)) ?? {}) as Saved
  if (saved.layout && LAYOUTS.some(l => l.id === saved.layout)) await update($, layoutAtom, () => saved.layout!)
  const order = validOrder(saved.order)
  if (order) await update($, orderAtom, () => order)
  if (Array.isArray(saved.collapsed)) await update($, collapsedAtom, () => saved.collapsed!.filter(g => GROUPS.includes(g)))
}

async function save($: EngineInterface) {
  const value: Saved = { layout: await read($, layoutAtom), order: await read($, orderAtom), collapsed: await read($, collapsedAtom) }
  await $.store.set(STORE_KEY, value)
}

// What the last refresh saw, to raise a toast only when a session changes into
// a state that needs the person. Lost on reload on purpose: no toast burst then.
let seen: Map<string, OturumPanosuStatus> | undefined
let selfId: string | undefined
let accountDir = '-'
let refreshing: Promise<OturumPanosuRow[]> | undefined
let titles = new Map<string, string>()

async function collect($: EngineInterface): Promise<OturumPanosuRow[]> {
  if (selfId === undefined) selfId = (await $.env.get('CLAUDE_CODE_SESSION_ID')) ?? '-'
  const run = await $.process.run(['node', `${$.plugin.root}/bin/collect.mjs`, selfId || '-', accountDir], { timeoutMs: 20_000 })
  if (run.exitCode !== 0) throw new Error(run.stderr.trim().split('\n').pop() || `collect exited ${run.exitCode}`)
  const out = JSON.parse(run.stdout) as { now: number; sessions: OturumPanosuRaw[]; staleCount: number; accountDir?: string }
  if (out.accountDir) accountDir = out.accountDir
  const rows = sortRows(out.sessions.map(s => classify(s, out.now)))
  titles = new Map(rows.map(r => [r.id, r.title]))
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
        const known = new Map(rows.map(r => [r.id, r.title]))
        summary = {
          at,
          items: parsed.items.filter(i => known.has(i.id)).map(i => ({ ...i, title: known.get(i.id) ?? '' })),
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

const SESSION_ID = /^local_[0-9a-f-]{36}$/

/** Opens the session in the desktop app through its own `claude://` link. */
async function openSession($: EngineInterface, id: string) {
  if (!SESSION_ID.test(id)) return
  $.ui.toast(`Açılıyor: ${titles.get(id) ?? id}`, { timeoutMs: 3000 })
  await $.process.run(['rundll32', 'url.dll,FileProtocolHandler', `claude://claude.ai/epitaxy/${id}`], { timeoutMs: 10_000 })
}

function boardProps(
  rows: OturumPanosuRow[],
  layout: OturumPanosuLayout,
  order: OturumPanosuGroup[],
  collapsed: OturumPanosuGroup[],
  summary: OturumPanosuSummary | null,
  now: number,
): OturumPanosuBoardProps {
  const next = new Map((summary?.items ?? []).map(i => [i.id, i.sonraki]))
  return {
    layout,
    groups: order.map(id => ({
      id,
      title: GROUP_INFO[id].title,
      color: GROUP_INFO[id].color,
      isCollapsed: collapsed.includes(id),
      rows: rows
        .filter(r => GROUP_INFO[id].has(r.status))
        .map(r => ({
          id: r.id,
          title: r.title,
          label: LABEL[r.status],
          color: COLOR[r.status],
          detail: r.detail,
          options: r.options.join(' · '),
          age: ago(r.since, now),
          isNew: r.isNew,
          next: next.get(r.id) ?? '',
        })),
    })),
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
    await loadSaved($)
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
  }).catch(($, e, next) => next(e))

  on('ui.message', async ($, e, next) => {
    if (e.requestId !== PANE || e.element !== 'board') return next(e)
    const m = e.data as OturumPanosuBoardMessage
    if (m?.type === 'open' && typeof m.id === 'string') await openSession($, m.id)
    else if (m?.type === 'toggle' && GROUPS.includes(m.group)) {
      await update($, collapsedAtom, list => (list.includes(m.group) ? list.filter(g => g !== m.group) : [...list, m.group]))
      await save($)
    } else if (m?.type === 'order') {
      const order = validOrder(m.order)
      if (order) {
        await update($, orderAtom, () => order)
        await save($)
      }
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
    const layout = await read($, layoutAtom)
    const order = await read($, orderAtom)
    const collapsed = await read($, collapsedAtom)
    const now = refreshedAt || Date.now()
    const waiting = rows.filter(r => NEEDS_PERSON.has(r.status)).length

    const props = boardProps(rows, layout, order, collapsed, summary, now)
    // The board is a Client (pointer: drag, click); only desktop and terminal draw one.
    const board = (pe: typeof e & { surface: 'desktop' | 'terminal' }) => {
      const { Client } = $.ui.resolve(pe)
      return <Client key="board" module="./board.tsx" props={props} width="100%" />
    }

    const pickLayout = async (id: OturumPanosuLayout) => {
      await update($, layoutAtom, () => id)
      await save($)
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
            {rows.length} oturum · {waiting} seni bekliyor · {clockTime(refreshedAt)}
          </Text>
        </Box>
        <Box flexDirection="row" gap={1} alignItems="center" flexWrap="wrap">
          <Text dimColor>Görünüm</Text>
          {LAYOUTS.map(l => (
            <Button key={`layout-${l.id}`} variant={l.id === layout ? 'primary' : 'secondary'} onPress={() => pickLayout(l.id)}>
              {l.label}
            </Button>
          ))}
        </Box>
        {error !== '' && <Text color="error">{error}</Text>}
        {summary && (
          <Box flexDirection="column" borderStyle="round" borderColor="claude" paddingX={1}>
            <Text bold>Şimdi en önemli iş</Text>
            {summary.error ? <Text color="error">{summary.error}</Text> : <Text wrap="wrap">{summary.enOnemli || '—'}</Text>}
            <Text dimColor>Özet {clockTime(summary.at)} · her oturumun "Sıradaki" satırı listede</Text>
          </Box>
        )}
        {e.surface === 'desktop' || e.surface === 'terminal' ? (
          board(e)
        ) : (
          <Box flexDirection="column">
            {props.groups.map(g => (
              <Box key={g.id} flexDirection="column">
                <Text bold color={g.color}>
                  {g.title} ({g.rows.length})
                </Text>
                {g.rows.map(r => (
                  <Text key={r.id} wrap="truncate-end">
                    {r.label} · {r.title} · {r.age}
                  </Text>
                ))}
              </Box>
            ))}
          </Box>
        )}
        <Text dimColor>
          Başlığı sürükle: grupları sırala · başlığa tıkla: aç/kapat · satıra tıkla: oturuma git
          {staleCount > 0 ? ` · 48 saatten eski ${staleCount} oturum gizli` : ''}
        </Text>
      </Box>
    )
  })
}
