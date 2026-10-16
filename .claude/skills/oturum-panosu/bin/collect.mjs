// Collects the open desktop sessions and the tail of each transcript.
// Usage: node collect.mjs <own cli session id or ->
// Prints one JSON object: { now, sessions: RawSession[], staleCount }.
// Read only: it never writes anywhere.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const SELF = process.argv[2] && process.argv[2] !== '-' ? process.argv[2] : ''
const STALE_MS = 48 * 3600 * 1000
const TAIL_BYTES = [1 << 20, 6 << 20]
const MAX_EVENTS = 60
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

function metaFiles() {
  const out = []
  for (const a of listDirs(sessionsRoot))
    for (const b of listDirs(a))
      for (const f of fs.readdirSync(b)) if (f.startsWith('local_') && f.endsWith('.json')) out.push(path.join(b, f))
  return out
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

function eventsOf(lines) {
  const ev = []
  let lastPrompt = ''
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
    if (o.type === 'system') {
      if (o.subtype === 'stop_hook_summary') ev.push({ k: 'stop', t: ts(o) })
      else if (o.subtype === 'api_error') ev.push({ k: 'api_error', t: ts(o), text: clip(o.error?.formatted || o.error?.message, 160) })
      continue
    }
    const content = o.message?.content
    if (o.type === 'user') {
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
  return { events: ev.slice(-MAX_EVENTS), lastPrompt }
}

const sessions = []
let staleCount = 0
for (const f of metaFiles()) {
  let metaMtime = 0
  try {
    metaMtime = fs.statSync(f).mtimeMs
  } catch {
    continue
  }
  if (now - metaMtime > STALE_MS) {
    staleCount++
    continue
  }
  let m
  try {
    m = JSON.parse(fs.readFileSync(f, 'utf8'))
  } catch {
    continue
  }
  if (m.isArchived || !m.cliSessionId || m.cliSessionId === SELF) continue
  const file = transcriptFor(m.cliSessionId)
  let tail = { events: [], lastPrompt: '' }
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
  let mtimeMs = 0
  if (file) {
    try {
      mtimeMs = fs.statSync(file).mtimeMs
    } catch {}
  }
  sessions.push({
    id: m.sessionId,
    title: m.title || '(adsız oturum)',
    cwd: m.cwd || '',
    permissionMode: m.permissionMode || 'default',
    lastFocusedAt: m.lastFocusedAt || 0,
    activityAt,
    mtimeMs: Math.max(mtimeMs, activityAt),
    lastPrompt: tail.lastPrompt,
    events: tail.events,
  })
}

process.stdout.write(JSON.stringify({ now, sessions, staleCount }))
