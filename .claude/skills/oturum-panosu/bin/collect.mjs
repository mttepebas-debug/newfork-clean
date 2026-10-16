// Collects this project's open desktop sessions and the tail of each transcript.
// Usage: node collect.mjs <own cli session id or -> [account dir or -] [--fresh]
// Prints one JSON object: { now, project, accountDir, sessions: RawSession[], staleCount }; the
// caller's own session is in the list too, told apart by its cliId.
// It reads the app's files and writes one thing: a shared cache of its answer in
// the temp folder, so the panes of several sessions cost one collection.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const SELF = process.argv[2] && process.argv[2] !== '-' ? process.argv[2] : ''
const IS_FRESH = process.argv.includes('--fresh')
const STALE_MS = 7 * 24 * 3600 * 1000
const CACHE_MS = 8_000
const TAIL_BYTES = [1 << 20, 6 << 20]
const MAX_EVENTS = 60
/** A background job with no notification counts as running while launched this recently… */
const BG_FRESH_MS = 45 * 60 * 1000
/** …or while its output file was written this recently, up to this age. */
const BG_OUTPUT_MS = 30 * 60 * 1000
const BG_MAX_MS = 6 * 3600 * 1000
const now = Date.now()

const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
const sessionsRoot = path.join(appData, 'Claude', 'claude-code-sessions')
const projectsRoot = path.join(os.homedir(), '.claude', 'projects')

function listDirs(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => path.join(dir, d.name))
  } catch {
    return []
  }
}
const metaIn = dir => {
  try {
    return fs.readdirSync(dir).filter(f => f.startsWith('local_') && f.endsWith('.json')).map(f => path.join(dir, f))
  } catch {
    return []
  }
}
const mtimeOf = f => {
  try {
    return fs.statSync(f).mtimeMs
  } catch {
    return 0
  }
}
const readJson = f => {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'))
  } catch {
    return undefined
  }
}

// The app keeps one folder per account and organization; the sidebar shows only
// the signed-in account's: the one holding this session's own file.
function findSelf() {
  const dirs = process.argv[3] && process.argv[3] !== '-' && fs.existsSync(process.argv[3]) ? [process.argv[3]] : listDirs(sessionsRoot).flatMap(listDirs)
  const files = dirs.flatMap(metaIn).map(f => ({ f, t: mtimeOf(f) }))
  files.sort((a, b) => b.t - a.t)
  if (SELF)
    for (const { f } of files.slice(0, 200)) {
      const m = readJson(f)
      if (m?.cliSessionId === SELF) return { dir: path.dirname(f), meta: m }
    }
  return { dir: files.length ? path.dirname(files[0].f) : '', meta: undefined }
}

const norm = p => (p || '').replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()
/** A session's project: its git common dir, so a worktree session counts as its repository's. */
const projectKey = m => norm(m?.gitAnchors?.[0]?.commonDir) || norm(m?.originCwd || m?.cwd)
const projectName = m => {
  const common = m?.gitAnchors?.[0]?.commonDir
  if (common) return path.basename(path.dirname(common))
  return path.basename(m?.originCwd || m?.cwd || '') || 'proje'
}

const self = findSelf()
const ACCOUNT_DIR = self.dir
const PROJECT = projectKey(self.meta)
const cacheFile = path.join(os.tmpdir(), 'oturum-panosu', `${Buffer.from(ACCOUNT_DIR + '|' + PROJECT).toString('base64url').slice(-40)}.json`)

if (!IS_FRESH) {
  const cached = readJson(cacheFile)
  if (cached && now - cached.now < CACHE_MS) {
    process.stdout.write(JSON.stringify(cached))
    process.exit(0)
  }
}

let transcriptIndex
function transcriptFor(cliId) {
  if (!transcriptIndex) {
    transcriptIndex = new Map()
    for (const d of listDirs(projectsRoot)) {
      let names = []
      try {
        names = fs.readdirSync(d)
      } catch {}
      for (const n of names) if (n.endsWith('.jsonl')) transcriptIndex.set(n.slice(0, -6), path.join(d, n))
    }
  }
  return transcriptIndex.get(cliId)
}

function readTail(file, bytes) {
  const fd = fs.openSync(file, 'r')
  try {
    const size = fs.fstatSync(fd).size
    const start = Math.max(0, size - bytes)
    const buf = Buffer.alloc(size - start)
    fs.readSync(fd, buf, 0, buf.length, start)
    const lines = buf.toString('utf8').split('\n')
    if (start > 0) lines.shift()
    return lines
  } finally {
    fs.closeSync(fd)
  }
}

const clip = (s, n) => (typeof s === 'string' ? (s.length > n ? s.slice(0, n) + '…' : s) : '')
const ts = o => (o.timestamp ? Date.parse(o.timestamp) || 0 : 0)

function shortInput(name, input) {
  if (!input || typeof input !== 'object') return ''
  if (name === 'AskUserQuestion') return (input.questions || []).map(q => q.question).join(' / ')
  if (name === 'ExitPlanMode') return clip(input.plan, 300)
  return clip(input.command || input.file_path || input.description || input.prompt || JSON.stringify(input), 160)
}

const textsOf = content => {
  if (typeof content === 'string') return [content]
  const out = []
  for (const b of content || []) {
    if (b.type === 'text') out.push(b.text)
    else if (b.type === 'tool_result') {
      if (typeof b.content === 'string') out.push(b.content)
      else for (const c of b.content || []) if (c?.type === 'text') out.push(c.text)
    }
  }
  return out
}

function eventsOf(lines) {
  const ev = []
  let lastPrompt = ''
  const tools = new Map()
  const launched = new Map()
  const finished = new Set()
  for (const line of lines) {
    if (!line || line[0] !== '{') continue
    let o
    try {
      o = JSON.parse(line)
    } catch {
      continue
    }
    if (o.isSidechain) continue
    if (o.type === 'last-prompt') {
      lastPrompt = clip(o.lastPrompt, 600)
      continue
    }
    if (o.type === 'queue-operation') {
      for (const m of String(o.content || '').matchAll(/<task-id>(\w+)<\/task-id>/g)) finished.add(m[1])
      continue
    }
    if (o.type === 'system') {
      if (o.subtype === 'stop_hook_summary') ev.push({ k: 'stop', t: ts(o) })
      else if (o.subtype === 'api_error') ev.push({ k: 'api_error', t: ts(o), text: clip(o.error?.formatted || o.error?.message, 160) })
      continue
    }
    const content = o.message?.content
    if (o.type === 'user') {
      for (const t of textsOf(content)) for (const m of t.matchAll(/<task-id>(\w+)<\/task-id>/g)) finished.add(m[1])
      for (const b of Array.isArray(content) ? content : []) {
        if (b.type !== 'tool_result') continue
        const text = textsOf([b]).join('\n')
        const id = text.match(/running in background with ID: (\w+)/)?.[1] || text.match(/agentId: (\w+)/)?.[1]
        if (id) {
          const out = text.match(/Output is being written to: (.+?\.output)/)?.[1] || text.match(/output_file: (.+?\.output)/)?.[1]
          launched.set(id, { t: ts(o), label: tools.get(b.tool_use_id) || 'arka plan işi', output: out?.trim() })
        }
      }
      if (o.isMeta) continue
      if (typeof content === 'string') {
        if (content.startsWith('<task-notification>')) continue
        if (content.includes('[Request interrupted by user')) ev.push({ k: 'interrupt', t: ts(o) })
        else ev.push({ k: 'prompt', t: ts(o), text: clip(content, 600) })
        continue
      }
      for (const b of content || []) {
        if (b.type === 'tool_result') ev.push({ k: 'result', t: ts(o), id: b.tool_use_id })
        else if (b.type === 'text') {
          if (b.text.includes('[Request interrupted by user')) ev.push({ k: 'interrupt', t: ts(o) })
          else if (!b.text.startsWith('<')) ev.push({ k: 'prompt', t: ts(o), text: clip(b.text, 600) })
        }
      }
      continue
    }
    if (o.type === 'assistant') {
      if (o.isApiErrorMessage) {
        ev.push({ k: 'api_error', t: ts(o), text: clip(content?.[0]?.text, 160) })
        continue
      }
      for (const b of content || []) {
        if (b.type === 'text' && b.text.trim()) ev.push({ k: 'text', t: ts(o), text: clip(b.text, 3000) })
        else if (b.type === 'tool_use') {
          tools.set(b.id, clip(b.input?.description || b.input?.command || b.name, 80))
          if (b.name === 'TaskStop' && b.input?.task_id) finished.add(b.input.task_id)
          const e = { k: 'tool', t: ts(o), id: b.id, name: b.name, input: shortInput(b.name, b.input) }
          if (b.name.endsWith('__wrap_up')) {
            e.recap = clip(b.input?.recap, 600)
            e.ask = clip(b.input?.ask, 300)
            e.actions = (b.input?.actions || []).map(a => a.label || a.action).filter(Boolean)
          }
          ev.push(e)
        }
      }
    }
  }
  const background = []
  for (const [id, job] of launched) {
    if (finished.has(id) || now - job.t > BG_MAX_MS) continue
    const wrote = job.output ? mtimeOf(job.output) : 0
    if (now - job.t < BG_FRESH_MS || (wrote && now - wrote < BG_OUTPUT_MS)) background.push({ id, label: job.label, startedAt: job.t })
  }
  return { events: ev.slice(-MAX_EVENTS), lastPrompt, background }
}

const sessions = []
let staleCount = 0
for (const f of ACCOUNT_DIR ? metaIn(ACCOUNT_DIR) : []) {
  if (now - mtimeOf(f) > STALE_MS) continue
  const m = readJson(f)
  if (!m || m.isArchived || !m.cliSessionId) continue
  if (PROJECT && projectKey(m) !== PROJECT) continue
  const file = transcriptFor(m.cliSessionId)
  let tail = { events: [], lastPrompt: '', background: [] }
  if (file) {
    for (const bytes of TAIL_BYTES) {
      try {
        tail = eventsOf(readTail(file, bytes))
      } catch {}
      if (tail.events.some(e => e.k === 'prompt')) break
    }
  }
  const lastEventAt = tail.events.reduce((t, e) => Math.max(t, e.t || 0), 0)
  const activityAt = Math.max(m.lastActivityAt || 0, lastEventAt)
  if (now - activityAt > STALE_MS) {
    staleCount++
    continue
  }
  sessions.push({
    id: m.sessionId,
    cliId: m.cliSessionId,
    title: m.title || '(adsız oturum)',
    cwd: m.cwd || '',
    permissionMode: m.permissionMode || 'default',
    lastFocusedAt: m.lastFocusedAt || 0,
    activityAt,
    mtimeMs: Math.max(file ? mtimeOf(file) : 0, activityAt),
    lastPrompt: tail.lastPrompt,
    events: tail.events,
    background: tail.background,
  })
}

const answer = { now, project: projectName(self.meta), accountDir: ACCOUNT_DIR, sessions, staleCount }
try {
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true })
  const tmp = `${cacheFile}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(answer))
  fs.renameSync(tmp, cacheFile)
} catch {}
process.stdout.write(JSON.stringify(answer))
