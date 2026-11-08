import { useEffect, useState } from 'react'
import { noteChapter } from '@/lib/notes-list'
import type { BookNoteDisplayItem } from '@/lib/notes-list'

function optionLabel(entry: BookNoteDisplayItem['entries'][number]): string {
  const annotation = entry.meta.title.match(/ · (标注(?: \d+)?)$/)?.[1]
  return `${noteChapter(entry)}${annotation ? ` · ${annotation}` : ''}`
}

export function BookChapterSelect({ group, currentPath, onPick, testId, className = '', fontSize }: {
  group: BookNoteDisplayItem
  currentPath?: string
  onPick: (path: string) => void
  testId?: string
  className?: string
  fontSize?: string
}) {
  const [selectedPath, setSelectedPath] = useState(currentPath ?? group.latest.path)

  useEffect(() => {
    setSelectedPath(currentPath ?? group.latest.path)
  }, [currentPath, group.latest.path])

  return (
    <select
      data-testid={testId ?? `book-chapter-select-${group.book}`}
      aria-label={`选择《${group.book}》章节`}
      value={selectedPath}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onChange={(event) => {
        event.stopPropagation()
        setSelectedPath(event.target.value)
        onPick(event.target.value)
      }}
      className={`rounded border border-parchment/20 bg-[#1a120d]/90 px-1.5 py-0.5 text-[10px] text-parchment/75 outline-none ${className}`}
      style={{ fontSize }}
    >
      {group.entries.map((entry) => (
        <option key={entry.path} value={entry.path}>{optionLabel(entry)}</option>
      ))}
    </select>
  )
}
