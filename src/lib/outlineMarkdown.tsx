import type { ReactNode } from 'react'

function inlineMarkdown(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const pattern = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g
  let last = 0
  let match: RegExpExecArray | null
  let i = 0

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push(text.slice(last, match.index))
    }
    const token = match[0]
    if (token.startsWith('**')) {
      nodes.push(
        <strong key={`${keyPrefix}-b-${i}`}>{token.slice(2, -2)}</strong>,
      )
    } else {
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
      if (linkMatch) {
        nodes.push(
          <a
            key={`${keyPrefix}-a-${i}`}
            href={linkMatch[2]}
            target="_blank"
            rel="noreferrer noopener"
          >
            {linkMatch[1]}
          </a>,
        )
      } else {
        nodes.push(token)
      }
    }
    last = match.index + token.length
    i += 1
  }

  if (last < text.length) nodes.push(text.slice(last))
  return nodes.length ? nodes : [text]
}

function isTableDivider(line: string): boolean {
  return /^\|?[\s:-]+\|[\s|:-]+$/.test(line.trim())
}

function parseTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

function renderTable(lines: string[], key: string) {
  const header = parseTableRow(lines[0]!)
  const bodyRows = lines.slice(2).map(parseTableRow)
  return (
    <div key={key} className="patch-notes-table-wrap">
      <table className="patch-notes-table">
        <thead>
          <tr>
            {header.map((cell, i) => (
              <th key={`${key}-h-${i}`}>{inlineMarkdown(cell, `${key}-h-${i}`)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bodyRows.map((row, ri) => (
            <tr key={`${key}-r-${ri}`}>
              {row.map((cell, ci) => (
                <td key={`${key}-r-${ri}-c-${ci}`}>{inlineMarkdown(cell, `${key}-r-${ri}-c-${ci}`)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function OutlineMarkdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let i = 0
  let block = 0

  while (i < lines.length) {
    const line = lines[i]!
    const trimmed = line.trim()

    if (!trimmed) {
      i += 1
      continue
    }

    if (
      trimmed.startsWith('|') &&
      i + 1 < lines.length &&
      isTableDivider(lines[i + 1] ?? '')
    ) {
      const tableLines = [line]
      i += 2
      while (i < lines.length && lines[i]!.trim().startsWith('|')) {
        tableLines.push(lines[i]!)
        i += 1
      }
      blocks.push(renderTable(tableLines, `table-${block}`))
      block += 1
      continue
    }

    if (/^#{1,3}\s+/.test(trimmed)) {
      const level = trimmed.match(/^#+/)![0].length
      const content = trimmed.replace(/^#{1,3}\s+/, '')
      const Tag = level <= 2 ? 'h3' : 'h4'
      blocks.push(
        <Tag key={`h-${block}`} className={`patch-notes-md-h${Math.min(level, 3)}`}>
          {inlineMarkdown(content, `h-${block}`)}
        </Tag>,
      )
      block += 1
      i += 1
      continue
    }

    if (/^[-*•]\s+/.test(trimmed) || trimmed === '---') {
      const items: string[] = []
      while (i < lines.length) {
        const itemLine = lines[i]!.trim()
        if (!itemLine) break
        if (itemLine === '---') {
          i += 1
          break
        }
        if (/^[-*•]\s+/.test(itemLine)) {
          items.push(itemLine.replace(/^[-*•]\s+/, ''))
          i += 1
          continue
        }
        break
      }
      if (items.length) {
        blocks.push(
          <ul key={`ul-${block}`} className="patch-notes-md-list">
            {items.map((item, idx) => (
              <li key={`ul-${block}-${idx}`}>{inlineMarkdown(item, `ul-${block}-${idx}`)}</li>
            ))}
          </ul>,
        )
        block += 1
      }
      continue
    }

    const paraLines: string[] = [trimmed]
    i += 1
    while (i < lines.length) {
      const next = lines[i]!.trim()
      if (!next) break
      if (
        /^#{1,3}\s+/.test(next) ||
        /^[-*•]\s+/.test(next) ||
        (next.startsWith('|') && i + 1 < lines.length && isTableDivider(lines[i + 1] ?? ''))
      ) {
        break
      }
      paraLines.push(next)
      i += 1
    }
    blocks.push(
      <p key={`p-${block}`} className="patch-notes-md-p">
        {inlineMarkdown(paraLines.join(' '), `p-${block}`)}
      </p>,
    )
    block += 1
  }

  return <div className="patch-notes-md">{blocks}</div>
}
