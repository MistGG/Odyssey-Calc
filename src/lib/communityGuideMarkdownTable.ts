/** GitHub-flavored markdown tables in community guide bodies. */

export const COMMUNITY_GUIDE_TABLE_TEMPLATE = `| Column 1 | Column 2 | Column 3 |
| --- | --- | --- |
| Value | Value | Value |`

export const COMMUNITY_GUIDE_TABLE_WITH_ITEM_TEMPLATE = `### Section title
[[item:Item name]]
| Stat | Range | Max slots |
| --- | --- | --- |
| AT% | 1 – 6 | 2 |`

export type CommunityGuideTableItemHeader = {
  itemName: string
}

export type ParsedCommunityGuideTableBlock = {
  title?: string
  item?: CommunityGuideTableItemHeader
  headers: string[]
  rows: string[][]
}

const ITEM_LINE_RE = /^\[\[item:([^|\]]+)(?:\|([^\]]+))?\]\]$/

function splitTableRow(line: string): string[] {
  const trimmed = line.trim()
  if (!trimmed.startsWith('|')) return []
  const inner = trimmed.endsWith('|') ? trimmed.slice(1, -1) : trimmed.slice(1)
  return inner.split('|').map((cell) => cell.trim())
}

function isTableSeparatorRow(cells: string[]): boolean {
  if (!cells.length) return false
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s/g, '')))
}

function parseItemHeaderLine(line: string): CommunityGuideTableItemHeader | null {
  const match = line.trim().match(ITEM_LINE_RE)
  if (!match) return null
  const itemName = (match[2]?.trim() || match[1]?.trim() || '').trim()
  if (!itemName) return null
  return { itemName }
}

export function isCommunityGuideTablePreamble(chunk: string): boolean {
  const lines = chunk
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  if (!lines.length) return false
  if (lines.some((line) => line.startsWith('|'))) return false
  return lines.every(
    (line) => /^#{2,3}\s+/.test(line) || parseItemHeaderLine(line) !== null,
  )
}

export function mergeCommunityGuideTableChunks(chunks: string[]): string[] {
  const merged: string[] = []
  for (let i = 0; i < chunks.length; i += 1) {
    const chunk = chunks[i]!
    const next = chunks[i + 1]
    if (
      next &&
      isCommunityGuideTablePreamble(chunk) &&
      parseCommunityGuideTableBlock(`${chunk}\n${next}`)
    ) {
      merged.push(`${chunk}\n${next}`)
      i += 1
      continue
    }
    merged.push(chunk)
  }
  return merged
}

export function parseCommunityGuideTableBlock(chunk: string): ParsedCommunityGuideTableBlock | null {
  const lines = chunk
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines.length < 2) return null

  let tableStart = -1
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i]!.startsWith('|')) {
      tableStart = i
      break
    }
  }
  if (tableStart < 0) return null

  const preamble = lines.slice(0, tableStart)
  const tableLines = lines.slice(tableStart)
  if (tableLines.length < 2) return null

  const headers = splitTableRow(tableLines[0]!)
  const separator = splitTableRow(tableLines[1]!)
  if (!headers.length || !isTableSeparatorRow(separator)) return null

  const rows = tableLines
    .slice(2)
    .map(splitTableRow)
    .filter((row) => row.some((cell) => cell.length > 0))

  if (tableLines.slice(2).some((line) => !line.startsWith('|'))) return null

  let title: string | undefined
  let item: CommunityGuideTableItemHeader | undefined

  for (const line of preamble) {
    if (/^###\s+/.test(line)) {
      title = line.replace(/^###\s+/, '').trim()
      continue
    }
    if (/^##\s+/.test(line)) {
      title = line.replace(/^##\s+/, '').trim()
      continue
    }
    const itemHeader = parseItemHeaderLine(line)
    if (itemHeader) {
      item = itemHeader
      continue
    }
    return null
  }

  return { title, item, headers, rows }
}
