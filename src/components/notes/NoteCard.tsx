import { useState } from 'react'
import type { CSSProperties } from 'react'
import { useStore } from '@/store'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { StarRating } from './StarRating'
import type { NoteEntry, NoteSource } from '@shared/index'

/** 来源四色（academic 书脊棱线着色） */
const SOURCE_COLOR: Record<NoteSource, string> = {
  anthropic: '#d97757',
  web: '#7a9cc6',
  book: '#8fae8b',
  unknown: '#6b5d52',
}
const SOURCE_LABEL: Record<NoteSource, string> = {
  anthropic: 'Anthropic',
  web: '网页',
  book: '书籍',
  unknown: '未知',
}

function urlSlug(url: string): string {
  return url.split('/').pop() || 'note'
}

export function NoteCard({ entry, theme = 'academic' }: { entry: NoteEntry; theme?: 'academic' | 'newspaper' }) {
  const isAcademic = theme !== 'newspaper'
  const selected = useStore(s => s.writingFile?.path === entry.path)
  const selectWritingFile = useStore(s => s.selectWritingFile)
  const deleteNoteAction = useStore(s => s.deleteNoteAction)
  const [confirming, setConfirming] = useState(false)

  const { title, url, source, rating, summary } = entry.meta
  const slug = urlSlug(url)

  const cardStyle: CSSProperties = {
    margin: '8px 4px 0',
    padding: '10px 12px 10px 16px',
    borderRadius: '3px 8px 8px 3px',
    ...(isAcademic
      ? {
          background: selected ? 'linear-gradient(90deg, #3a291d, #2b1e14 70%)' : 'linear-gradient(90deg, #2e2118, #251a12 70%)',
          border: '1px solid rgba(232,213,183,.14)',
          borderLeft: `3px solid ${selected ? '#d97757' : SOURCE_COLOR[source]}`,
          boxShadow: selected
            ? '0 0 0 1px rgba(217,119,87,.35), 2px 6px 14px rgba(0,0,0,.5)'
            : '2px 4px 10px rgba(0,0,0,.45), inset 0 1px 0 rgba(232,213,183,.06)',
        }
      : {
          background: selected ? '#f7f0df' : '#f1ead8',
          border: '1px solid #c9c3b8',
          borderLeft: `3px solid ${selected ? '#8a3a3a' : '#b3a68d'}`,
          boxShadow: '1px 2px 6px rgba(42,31,26,.18)',
        }),
  }

  const badgeBase: CSSProperties = { fontSize: 9, padding: '0 5px', lineHeight: '14px', borderRadius: 9999 }
  const badgeBySource: Record<NoteSource, CSSProperties> = isAcademic
    ? {
        anthropic: { background: 'rgba(217,119,87,.18)', color: '#e09a7e', border: '1px solid rgba(217,119,87,.45)' },
        web: { background: 'rgba(122,156,198,.16)', color: '#9db8d8', border: '1px solid rgba(122,156,198,.4)' },
        book: { background: 'rgba(143,174,139,.16)', color: '#a9c4a5', border: '1px solid rgba(143,174,139,.4)' },
        unknown: { background: 'rgba(107,93,82,.22)', color: '#a3938a', border: '1px solid rgba(107,93,82,.5)' },
      }
    : {
        anthropic: { background: 'rgba(138,58,58,.1)', color: '#8a3a3a', border: '1px solid rgba(138,58,58,.35)' },
        web: { background: 'rgba(90,100,136,.1)', color: '#5a6488', border: '1px solid rgba(90,100,136,.3)' },
        book: { background: 'rgba(96,116,86,.1)', color: '#607456', border: '1px solid rgba(96,116,86,.3)' },
        unknown: { background: 'rgba(107,93,82,.1)', color: '#6b5d52', border: '1px solid rgba(107,93,82,.3)' },
      }

  return (
    <>
      <div
        data-testid={`note-card-${slug}`}
        className="group relative cursor-pointer"
        style={cardStyle}
        onClick={() => { void selectWritingFile(entry.path) }}
      >
        <div
          style={{
            fontSize: 12.5,
            lineHeight: 1.35,
            color: isAcademic ? '#e8d5b7' : '#2a1f1a',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {title}
        </div>
        <div className="flex items-center" style={{ gap: 6, marginTop: 5 }}>
          <StarRating value={rating} size={10} />
          <span data-testid={`note-badge-${source}`} style={{ ...badgeBase, ...badgeBySource[source] }}>{SOURCE_LABEL[source]}</span>
        </div>
        {summary && (
          <div
            style={{
              marginTop: 5,
              fontSize: 10.5,
              fontStyle: 'italic',
              color: isAcademic ? 'rgba(232,213,183,.42)' : 'rgba(107,93,82,.85)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {summary}
          </div>
        )}
        <button
          data-testid={`note-delete-${slug}`}
          title="删除笔记"
          aria-label="删除笔记"
          className="absolute opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ top: 4, right: 6, fontSize: 11, lineHeight: 1, color: isAcademic ? 'rgba(232,213,183,.45)' : 'rgba(107,93,82,.7)' }}
          onClick={(e) => { e.stopPropagation(); setConfirming(true) }}
        >
          ✕
        </button>
      </div>
      <ConfirmDialog
        open={confirming}
        title="删除笔记"
        icon="trash"
        confirmLabel="删除"
        confirmVariant="danger"
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false)
          void deleteNoteAction(entry.path)
        }}
      >
        <p>确定删除笔记《{title}》？文件将被永久删除，无法恢复。</p>
      </ConfirmDialog>
    </>
  )
}
