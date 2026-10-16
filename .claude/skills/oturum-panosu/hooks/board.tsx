// The board's surface module: draws the three status groups line by line and
// turns the pointer into the person's acts, posted to the hooks module:
// a header dragged onto another header reorders the groups, a header clicked
// opens or closes its group, a session row clicked opens that session.
// Every line is one cell tall, so the pointer's row names the line under it.
import type { ClientModule, ClientPointerEvent } from 'claude-code'

import type { OturumPanosuBoardMessage, OturumPanosuBoardProps, OturumPanosuBoardRow, OturumPanosuGroup } from '../types'

type Line =
  | { kind: 'header'; gi: number }
  | { kind: 'row'; gi: number; id: string; part: 'main' | 'detail' | 'extra' }
  | { kind: 'empty'; gi: number }
  | { kind: 'gap'; gi: number }

type BoardState = {
  press?: { y: number; line: Line | undefined }
  drag?: { gi: number; overY: number }
  hoverY?: number
}

function linesOf(p: OturumPanosuBoardProps): Line[] {
  const out: Line[] = []
  p.groups.forEach((g, gi) => {
    if (gi > 0) out.push({ kind: 'gap', gi: gi - 1 })
    out.push({ kind: 'header', gi })
    if (g.isCollapsed) return
    if (g.rows.length === 0) out.push({ kind: 'empty', gi })
    const isLarge = p.layout === 'A' || (p.layout === 'C' && g.id === 'bekleyen')
    for (const r of g.rows) {
      out.push({ kind: 'row', gi, id: r.id, part: 'main' })
      if (!isLarge) continue
      if (r.detail) out.push({ kind: 'row', gi, id: r.id, part: 'detail' })
      if (r.next || (p.layout === 'C' && r.options)) out.push({ kind: 'row', gi, id: r.id, part: 'extra' })
    }
  })
  return out
}

const Board: ClientModule<OturumPanosuBoardProps, BoardState> = (props, surface) => {
  const { Box, Text } = surface.elements
  const st = surface.state ?? {}
  const lines = linesOf(props)
  const groupAt = (y: number) => (y < 0 ? 0 : y >= lines.length ? props.groups.length - 1 : lines[y]!.gi)
  const post = (m: OturumPanosuBoardMessage) => surface.post(m)

  surface.onPointer((e: ClientPointerEvent) => {
    const line = lines[e.y]
    if (e.type === 'down' && e.button === 'left') {
      surface.setState({ ...st, press: { y: e.y, line }, drag: undefined })
      return
    }
    if (e.type === 'move' && e.button === 'left' && st.press?.line?.kind === 'header') {
      if (st.drag || Math.abs(e.y - st.press.y) >= 1) {
        if (st.drag?.overY !== e.y) surface.setState({ ...st, drag: { gi: st.press.line.gi, overY: e.y } })
      }
      return
    }
    if (e.type === 'move' && !e.button) {
      if (st.hoverY !== e.y) surface.setState({ ...st, hoverY: e.y })
      return
    }
    if (e.type === 'leave') {
      if (st.hoverY !== undefined) surface.setState({ ...st, hoverY: undefined })
      return
    }
    if (e.type !== 'up') return
    if (st.drag) {
      const to = groupAt(e.y)
      if (to !== st.drag.gi) {
        const order: OturumPanosuGroup[] = props.groups.map(g => g.id)
        const [moved] = order.splice(st.drag.gi, 1)
        order.splice(to, 0, moved!)
        post({ type: 'order', order })
      }
    } else if (st.press && st.press.y === e.y && line) {
      if (line.kind === 'header') post({ type: 'toggle', group: props.groups[line.gi]!.id })
      else if (line.kind === 'row') post({ type: 'open', id: line.id })
    }
    surface.setState({ hoverY: st.hoverY })
  })

  const hovered = st.hoverY === undefined ? undefined : lines[st.hoverY]
  const hoveredId = hovered?.kind === 'row' ? hovered.id : undefined
  const dropGi = st.drag ? groupAt(st.drag.overY) : undefined
  const rowById = new Map<string, OturumPanosuBoardRow>()
  for (const g of props.groups) for (const r of g.rows) rowById.set(r.id, r)

  const header = (gi: number) => {
    const g = props.groups[gi]!
    const isDragged = st.drag?.gi === gi
    const isDrop = dropGi === gi && !isDragged
    return (
      <Box height={1} flexDirection="row" gap={1}>
        <Text dimColor>⋮⋮</Text>
        <Text color={g.color} bold inverse={isDragged}>
          {`${g.isCollapsed ? '▸' : '▾'} ${g.title}`}
        </Text>
        <Text dimColor>{String(g.rows.length)}</Text>
        {isDrop && (
          <Text color="suggestion" bold>
            ← buraya bırak
          </Text>
        )}
      </Box>
    )
  }

  const chip = (r: OturumPanosuBoardRow) => (
    <Text backgroundColor={r.color} color="inverseText" bold>
      {` ${r.label} `}
    </Text>
  )

  const main = (r: OturumPanosuBoardRow, compact: boolean) => {
    const isHover = hoveredId === r.id
    return (
      <Box height={1} flexDirection="row" gap={1} paddingLeft={2}>
        {compact ? <Text color={r.color}>●</Text> : chip(r)}
        <Text bold={!compact || isHover} underline={isHover} wrap="truncate-end">
          {r.title}
        </Text>
        {r.isNew && (
          <Text color="warning" bold>
            YENİ
          </Text>
        )}
        <Box flexGrow={1} />
        {compact && (
          <Text color={r.color} bold>
            {r.label}
          </Text>
        )}
        <Text dimColor>{r.age}</Text>
        <Text dimColor={!isHover} color={isHover ? 'suggestion' : undefined}>
          ↗
        </Text>
      </Box>
    )
  }

  const body = lines.map(line => {
    if (line.kind === 'gap') return <Box height={1} />
    if (line.kind === 'header') return header(line.gi)
    if (line.kind === 'empty')
      return (
        <Box height={1} paddingLeft={2}>
          <Text dimColor>Şu an yok</Text>
        </Box>
      )
    const r = rowById.get(line.id)!
    const g = props.groups[line.gi]!
    const compact = props.layout === 'B' || (props.layout === 'C' && g.id !== 'bekleyen')
    if (line.part === 'main') return main(r, compact)
    if (line.part === 'detail')
      return (
        <Box height={1} paddingLeft={4}>
          <Text dimColor wrap="truncate-end">
            {r.detail}
          </Text>
        </Box>
      )
    const extra = r.next ? `→ Sıradaki: ${r.next}` : `Seçenekler: ${r.options}`
    return (
      <Box height={1} paddingLeft={4}>
        <Text wrap="truncate-end" bold={!!r.next}>
          {extra}
        </Text>
      </Box>
    )
  })

  return <Box flexDirection="column">{body}</Box>
}

export default Board
