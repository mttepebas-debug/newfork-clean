// Watches the app's session folder for this account and prints one line,
// "change", when a session is opened, archived, renamed or removed, so the
// board refreshes at once instead of at its next poll.
// Usage: node watch.mjs <account dir>. Read only; runs until its parent ends it.
import fs from 'node:fs'
import path from 'node:path'

const DIR = process.argv[2]
if (!DIR || !fs.existsSync(DIR)) process.exit(2)

const keyOf = file => {
  try {
    const m = JSON.parse(fs.readFileSync(file, 'utf8'))
    return `${m.isArchived ? 1 : 0}|${m.title ?? ''}`
  } catch {
    return undefined
  }
}

// What each session file said last; built lazily, so a file first seen after
// the start counts as a session that just appeared or woke up.
const known = new Map()
const WEEK = 7 * 24 * 3600 * 1000
for (const f of fs.readdirSync(DIR)) {
  if (!f.startsWith('local_') || !f.endsWith('.json')) continue
  const file = path.join(DIR, f)
  try {
    if (Date.now() - fs.statSync(file).mtimeMs > WEEK) continue
  } catch {
    continue
  }
  known.set(f, keyOf(file))
}

let timer
const changed = () => {
  clearTimeout(timer)
  timer = setTimeout(() => process.stdout.write('change\n'), 600)
}

fs.watch(DIR, (_event, name) => {
  if (!name || !name.startsWith('local_') || !name.endsWith('.json')) return
  const key = keyOf(path.join(DIR, name))
  if (key === undefined && !fs.existsSync(path.join(DIR, name))) {
    if (known.delete(name)) changed()
    return
  }
  if (key === undefined || known.get(name) === key) return
  known.set(name, key)
  changed()
})

// The engine ends this child with the session; should the session die
// without ending it, stop once the parent process is gone.
const parent = process.ppid
setInterval(() => {
  try {
    process.kill(parent, 0)
  } catch {
    process.exit(0)
  }
}, 30_000)
