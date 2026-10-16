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

export type OturumPanosuRaw = {
  id: string
  title: string
  cwd: string
  permissionMode: string
  lastFocusedAt: number
  activityAt: number
  mtimeMs: number
  lastPrompt: string
  events: OturumPanosuEvent[]
}

export type OturumPanosuStatus = 'izin' | 'soru' | 'karar' | 'plan' | 'hata' | 'bitti' | 'durdu' | 'calisiyor'

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
}

export type OturumPanosuSummaryItem = { id: string; title: string; bitti: string; acik: string; sonraki: string }

export type OturumPanosuSummary = {
  at: number
  items: OturumPanosuSummaryItem[]
  enOnemli: string
  error?: string
}

declare module 'claude-code' {
  interface PluginState {
    'oturum-panosu': {
      rows: OturumPanosuRow[]
      refreshedAt: number
      staleCount: number
      error: string
      summary: OturumPanosuSummary | null
      isSummarizing: boolean
    }
  }
}
