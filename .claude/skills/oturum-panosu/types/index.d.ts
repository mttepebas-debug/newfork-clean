export type OturumPanosuEvent = {
  k: 'prompt' | 'text' | 'tool' | 'result' | 'stop' | 'api_error' | 'interrupt'
  t: number
  id?: string
  name?: string
  input?: string
  text?: string
  recap?: string
  ask?: string
  actions?: string[]
}

/** A job the session sent to the background (a test, a train, a worker agent) with no notification yet. */
export type OturumPanosuJob = { id: string; label: string; startedAt: number }

export type OturumPanosuRaw = {
  id: string
  cliId: string
  title: string
  cwd: string
  permissionMode: string
  lastFocusedAt: number
  activityAt: number
  mtimeMs: number
  lastPrompt: string
  events: OturumPanosuEvent[]
  background: OturumPanosuJob[]
}

export type OturumPanosuStatus = 'izin' | 'soru' | 'karar' | 'plan' | 'hata' | 'bitti' | 'durdu' | 'calisiyor'

/** The three status groups the board draws, in the order the person dragged them to. */
export type OturumPanosuGroup = 'bekleyen' | 'biten' | 'calisan'

/** A: two-line inbox rows · B: one-line compact rows; the person switches between them at will. */
export type OturumPanosuLayout = 'A' | 'B'

export type OturumPanosuRow = {
  id: string
  title: string
  status: OturumPanosuStatus
  /** One line saying what the person is asked or what happened. */
  detail: string
  /** Button labels the session offered, when it asked a decision. */
  options: string[]
  /** When the session's state last changed (turn end, pending call). */
  since: number
  /** The turn ended after the person last looked at the session. */
  isNew: boolean
  lastPrompt: string
  finalText: string
  /** Labels of the background jobs still running. */
  background: string[]
}

export type OturumPanosuSummaryItem = { id: string; title: string; bitti: string; acik: string; sonraki: string }

export type OturumPanosuSummary = {
  at: number
  items: OturumPanosuSummaryItem[]
  enOnemli: string
  error?: string
}

/** What the board's surface module draws from: plain data only. */
export type OturumPanosuBoardRow = {
  id: string
  title: string
  label: string
  color: string
  detail: string
  options: string
  age: string
  isNew: boolean
  isSelf: boolean
  next: string
}

export type OturumPanosuBoardProps = {
  layout: OturumPanosuLayout
  groups: { id: OturumPanosuGroup; title: string; color: string; isCollapsed: boolean; rows: OturumPanosuBoardRow[] }[]
}

/** What the board posts to the hooks module. */
export type OturumPanosuBoardMessage =
  | { type: 'open'; id: string }
  | { type: 'toggle'; group: OturumPanosuGroup }
  | { type: 'order'; order: OturumPanosuGroup[] }

declare module 'claude-code' {
  interface PluginState {
    'oturum-panosu': {
      rows: OturumPanosuRow[]
      refreshedAt: number
      staleCount: number
      error: string
      summary: OturumPanosuSummary | null
      isSummarizing: boolean
      layout: OturumPanosuLayout
      order: OturumPanosuGroup[]
      collapsed: OturumPanosuGroup[]
      project: string
      selfId: string
      isMinimized: boolean
    }
  }
}
