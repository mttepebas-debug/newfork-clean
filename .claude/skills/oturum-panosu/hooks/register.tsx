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
const REFRESH_MS = 10_000
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
const projectAtom = atom({ plugin: 'oturum-panosu', key: 'project' } as const, '')
const selfAtom = atom({ plugin: 'oturum-panosu', key: 'selfId' } as const, '')
const minimizedAtom = atom({ plugin: 'oturum-panosu', key: 'isMinimized' } as const, false)

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
  { id: 'A', label: 'Ayrıntılı' },
  { id: 'B', label: 'Kompakt' },
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

/** The person's board choices, shared by every session and kept across them. */
type Saved = { layout?: OturumPanosuLayout; order?: OturumPanosuGroup[]; collapsed?: OturumPanosuGroup[]; isMinimized?: boolean }

function validOrder(order: unknown): OturumPanosuGroup[] | undefined {
  if (!Array.isArray(order) || order.length !== GROUPS.length) return undefined
  return GROUPS.every(g => order.includes(g)) ? (order as OturumPanosuGroup[]) : undefined
}

async function loadSaved($: EngineInterface): Promise<Saved> {
  const saved = ((await $.store.get(STORE_KEY)) ?? {}) as Saved
  if (saved.layout && LAYOUTS.some(l => l.id === saved.layout)) await update($, layoutAtom, () => saved.layout!)
  const order = validOrder(saved.order)
  if (order) await update($, orderAtom, () => order)
  if (Array.isArray(saved.collapsed)) await update($, collapsedAtom, () => saved.collapsed!.filter(g => GROUPS.includes(g)))
  await update($, minimizedAtom, () => saved.isMinimized === true)
  return saved
}

async function save($: EngineInterface) {
  const value: Saved = {
    layout: await read($, layoutAtom),
    order: await read($, orderAtom),
    collapsed: await read($, collapsedAtom),
    isMinimized: await read($, minimizedAtom),
  }
  await $.store.set(STORE_KEY, value)
}

// What the last refresh saw, to raise a toast only when a session changes into
// a state that needs the person. Lost on reload on purpose: no toast burst then.
let seen: Map<string, OturumPanosuStatus> | undefined
let selfCli: string | undefined
let accountDir = '-'
let refreshing: Promise<OturumPanosuRow[]> | undefined
let titles = new Map<string, string>()
let isWatching = false
// Did this session close the pane itself (minimize), so its ui.close is no person's?
let closingForMinimize = false

async function collect($: EngineInterface, isFresh: boolean): Promise<OturumPanosuRow[]> {
  if (selfCli === undefined) selfCli = (await $.env.get('CLAUDE_CODE_SESSION_ID')) ?? '-'
  const argv = ['node', `${$.plugin.root}/bin/collect.mjs`, selfCli || '-', accountDir, ...(isFresh ? ['--fresh'] : [])]
  const run = await $.process.run(argv, { timeoutMs: 20_000 })
  if (run.exitCode !== 0) throw new Error(run.stderr.trim().split('\n').pop() || `collect exited ${run.exitCode}`)
  const out = JSON.parse(run.stdout) as { now: number; project?: string; sessions: OturumPanosuRaw[]; staleCount: number; accountDir?: string }
  if (out.accountDir) accountDir = out.accountDir
  const self = out.sessions.find(s => s.cliId === selfCli)
  const rows = sortRows(out.sessions.map(s => classify(s, out.now)))
  titles = new Map(rows.map(r => [r.id, r.title]))
  await update($, rowsAtom, () => rows)
  await update($, refreshedAtom, () => out.now)
  await update($, staleAtom, () => out.staleCount)
  await update($, projectAtom, () => out.project ?? '')
  await update($, selfAtom, () => self?.id ?? '')
  await update($, errorAtom, () => '')
  return rows
}

function announce($: EngineInterface, rows: OturumPanosuRow[]) {
  const before = seen
  seen = new Map(rows.map(r => [r.id, r.status]))
  if (!before) return
  for (const r of rows) {
    const was = before.get(r.id)
    if (was === r.status) continue
    if (NEEDS_PERSON.has(r.status) || r.status === 'bitti') $.ui.toast(`${LABEL[r.status]} · ${r.title}`, { timeoutMs: 8000 })
  }
}

async function refresh($: EngineInterface, isFresh = false): Promise<OturumPanosuRow[]> {
  if (refreshing) return refreshing
  refreshing = (async () => {
    try {
      const rows = await collect($, isFresh)
      announce($, rows)
      await followMinimized($)
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

/** Another session minimized or restored the board: this one follows. */
async function followMinimized($: EngineInterface) {
  const was = await read($, minimizedAtom)
  const saved = ((await $.store.get(STORE_KEY)) ?? {}) as Saved
  const is = saved.isMinimized === true
  if (is === was) return
  await update($, minimizedAtom, () => is)
  if (is) await hidePane($)
  else void $.ui.open({ id: PANE, title: TITLE })
}

async function hidePane($: EngineInterface) {
  const open = await $.ui.panes()
  if (!open.some(p => p.id === PANE)) return
  closingForMinimize = true
  try {
    await $.ui.close({ id: PANE })
  } finally {
    closingForMinimize = false
  }
}

async function minimize($: EngineInterface) {
  await update($, minimizedAtom, () => true)
  await save($)
  await hidePane($)
}

async function restore($: EngineInterface) {
  await update($, minimizedAtom, () => false)
  await save($)
  await $.ui.open({ id: PANE, title: TITLE })
}

/** One button: fetch the sessions afresh, then ask for done / open / next. */
async function summarize($: EngineInterface) {
  if (await read($, busyAtom)) return
  await update($, busyAtom, () => true)
  try {
    const rows = await refresh($, true)
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

/** Refreshes the moment a session is opened, archived or renamed; lives as long as the module. */
function watch($: EngineInterface) {
  if (isWatching || accountDir === '-') return
  isWatching = true
  void (async () => {
    try {
      const stream = $.process.spawn({ argv: ['node', `${$.plugin.root}/bin/watch.mjs`, accountDir] })
      for await (const piece of stream) {
        if ('text' in piece && piece.text.includes('change')) {
          // Every open session hears the same change; a jitter lets one collect and the rest read its cache.
          await $.clock.sleep(Math.floor(Math.random() * 1500))
          void refresh($, true)
        }
      }
    } catch {
      // The watcher is a nicety: the poll still refreshes.
    } finally {
      isWatching = false
    }
  })()
}

let poll: { cancel: () => void } | undefined
async function start($: EngineInterface) {
  poll ??= $.clock.every(REFRESH_MS, () => void refresh($))
  await refresh($)
  watch($)
}

function counts(rows: OturumPanosuRow[]) {
  return {
    waiting: rows.filter(r => NEEDS_PERSON.has(r.status)).length,
    running: rows.filter(r => r.status === 'calisiyor').length,
    done: rows.filter(r => r.status === 'bitti' || r.status === 'durdu').length,
  }
}

function boardProps(
  rows: OturumPanosuRow[],
  layout: OturumPanosuLayout,
  order: OturumPanosuGroup[],
  collapsed: OturumPanosuGroup[],
  summary: OturumPanosuSummary | null,
  selfId: string,
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
          isSelf: r.id === selfId,
          next: next.get(r.id) ?? '',
        })),
    })),
  }
}

export const register: Register = on => {
  // The mod lives in the project's .claude/skills, so it loads in this project's
  // sessions alone, and in each it opens the board unless the person minimized it.
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({ name: 'pano', description: 'Oturum panosunu açar ya da küçültülmüşse büyütür' })
    if (!e.isInteractive) return started
    const saved = await loadSaved($)
    if (!saved.isMinimized) void $.ui.open({ id: PANE, title: TITLE })
    void start($)
    return started
  })

  on('command.run', { command: 'pano' }, async $ => {
    await loadSaved($)
    await restore($)
    await start($)
    return { text: 'Oturum panosu açık. 10 saniyede bir ve oturum açılıp kapanınca yenilenir.' }
  })

  // The person's close is a minimize: the band above the prompt keeps the counts and a way back.
  on('ui.close', async ($, e, next) => {
    if (e.id === PANE && !closingForMinimize) {
      await update($, minimizedAtom, () => true)
      await save($)
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

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || !(await read($, minimizedAtom))) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const rows = await read($, rowsAtom)
    const project = await read($, projectAtom)
    const c = counts(rows)
    return (
      <Box flexDirection="row" gap={1} alignItems="center">
        <Text bold>Pano</Text>
        {project !== '' && <Text dimColor>{project}</Text>}
        <Text color={c.waiting ? 'warning' : undefined} bold={c.waiting > 0} dimColor={c.waiting === 0}>
          {c.waiting} seni bekliyor
        </Text>
        <Text dimColor>· {c.running} çalışıyor · {c.done} bitti</Text>
        <Button key="restore" variant="primary" onPress={() => restore($)}>
          Büyüt
        </Button>
      </Box>
    )
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
    const project = await read($, projectAtom)
    const selfId = await read($, selfAtom)
    const now = refreshedAt || Date.now()
    const c = counts(rows)
    const props = boardProps(rows, layout, order, collapsed, summary, selfId, now)

    const pickLayout = async (id: OturumPanosuLayout) => {
      await update($, layoutAtom, () => id)
      await save($)
    }
    // The board is a Client (pointer: drag, click); only desktop and terminal draw one.
    const board = (pe: typeof e & { surface: 'desktop' | 'terminal' }) => {
      const { Client } = $.ui.resolve(pe)
      return <Client key="board" module="./board.tsx" props={props} width="100%" />
    }

    return (
      <Box flexDirection="column" gap={1} paddingX={1}>
        <Box flexDirection="row" gap={1} alignItems="center">
          <Text bold>{project || 'Proje'}</Text>
          <Text dimColor>{rows.length} oturum</Text>
          <Box flexGrow={1} />
          {LAYOUTS.map(l => (
            <Button key={`layout-${l.id}`} plain dimColor={l.id !== layout} onPress={() => pickLayout(l.id)}>
              <Text bold={l.id === layout} underline={l.id === layout}>
                {l.label}
              </Text>
            </Button>
          ))}
          <Button key="minimize" plain onPress={() => minimize($)}>
            <Text dimColor>— Küçült</Text>
          </Button>
        </Box>
        <Box flexDirection="row" gap={1} alignItems="center" flexWrap="wrap">
          <Button key="summarize" variant="primary" onPress={() => summarize($)}>
            {isBusy ? 'Özetleniyor…' : 'Summarize'}
          </Button>
          <Text color={c.waiting ? 'warning' : undefined} bold={c.waiting > 0} dimColor={c.waiting === 0}>
            {c.waiting} seni bekliyor
          </Text>
          <Text dimColor>
            · {c.running} çalışıyor · {c.done} bitti · {clockTime(refreshedAt)}
          </Text>
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
          {staleCount > 0 ? ` · 7 günden eski ${staleCount} oturum gizli` : ''}
        </Text>
      </Box>
    )
  })
}
