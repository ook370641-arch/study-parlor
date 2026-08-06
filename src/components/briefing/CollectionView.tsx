import { useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { useStore } from '@/store'
import { MarkdownRenderer } from '@/components/md/MarkdownRenderer'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { createAssistantMdComponents } from '@/lib/assistant-md-components'
import type { BriefingCollectionEntry, BriefingTheme } from '@shared/index'

function formatGroupLabel(date: string): string {
  const [, m, d] = date.split('-')
  return m && d ? `${Number(m)}月${Number(d)}日 夜航简报` : date
}

/** 条目底部备注：无备注显示添加入口，有备注点击编辑；失焦/Ctrl+Enter 保存，Esc 取消 */
function CollectionNote({ entry, isAcademic, textMuted }: { entry: BriefingCollectionEntry; isAcademic: boolean; textMuted: string }) {
  const updateCollectionNote = useStore((s) => s.updateCollectionNote)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const cancelled = useRef(false)

  const startEdit = () => {
    cancelled.current = false
    setDraft(entry.note ?? '')
    setEditing(true)
  }
  const save = () => {
    if (!cancelled.current && draft.trim() !== (entry.note ?? '')) {
      void updateCollectionNote(entry.id, draft)
    }
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="mt-3">
        <textarea
          data-testid={`collection-note-input-${entry.id}`}
          autoFocus
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault()
              save()
            } else if (e.key === 'Escape') {
              cancelled.current = true
              setEditing(false)
            }
          }}
          placeholder="写下你的备注…"
          className={`w-full rounded border p-2 text-sm outline-none resize-y ${
            isAcademic
              ? 'bg-ink/80 border-parchment/20 text-parchment/90 placeholder:text-parchment/30 focus:border-ember/60'
              : 'bg-white border-[#1a1a1a]/20 text-[#1a1a1a] placeholder:text-[#1a1a1a]/30 focus:border-[#d97757]/60'
          }`}
        />
        <div className={`mt-1 text-[10px] ${textMuted}`}>Ctrl+Enter 保存 · Esc 取消</div>
      </div>
    )
  }

  if (entry.note) {
    return (
      <button
        type="button"
        data-testid={`collection-note-${entry.id}`}
        onClick={startEdit}
        title="点击编辑备注"
        className={`mt-3 block w-full text-left border-l-2 border-ember/40 pl-3 py-1 text-sm leading-relaxed transition-colors ${textMuted} hover:text-ember`}
      >
        <span className="text-ember/70 mr-1">✎</span>
        {entry.note}
      </button>
    )
  }

  return (
    <button
      type="button"
      data-testid={`collection-note-add-${entry.id}`}
      onClick={startEdit}
      className={`mt-3 text-xs transition-colors ${textMuted} hover:text-ember`}
    >
      ＋ 添加备注
    </button>
  )
}

export function CollectionView({ theme = 'academic' }: { theme?: BriefingTheme }) {
  const isAcademic = theme !== 'newspaper'
  const entries = useStore((s) => s.collection.entries)
  const removeCollectionEntry = useStore((s) => s.removeCollectionEntry)
  const briefingFontSize = useStore((s) => s.briefingFontSize)
  const [pendingRemove, setPendingRemove] = useState<string | null>(null)
  const qaComponents = useMemo(() => createAssistantMdComponents(briefingFontSize), [briefingFontSize])

  const groups = useMemo(() => {
    const map = new Map<string, BriefingCollectionEntry[]>()
    for (const e of entries) {
      const list = map.get(e.briefingDate) ?? []
      list.push(e)
      map.set(e.briefingDate, list)
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [entries])

  const cardCls = isAcademic
    ? 'bg-ink/60 border border-parchment/10'
    : 'bg-white border border-[#1a1a1a]/10'
  const textMain = isAcademic ? 'text-parchment/90' : 'text-[#1a1a1a]'
  const textMuted = isAcademic ? 'text-parchment/60' : 'text-[#6b5d52]'

  return (
    <main data-testid="collection-view" className="relative z-[5] flex-1 overflow-y-auto px-6 py-6">
      <div className="w-[95%] max-w-[900px] min-w-[520px] mx-auto">
        <h1 className={`text-[24px] font-bold font-serif mb-6 ${isAcademic ? 'text-[#f5e6cc]' : 'text-[#1a1a1a]'}`}>
          ✦ 精选集
        </h1>
        {entries.length === 0 && (
          <div data-testid="collection-empty" className={`text-sm ${textMuted}`}>
            尚无收藏。阅读今日简报时，点块标题旁的 ☆ 收入精选集。
          </div>
        )}
        {groups.map(([date, list]) => (
          <section key={date} className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-ember text-sm tracking-[0.2em]" style={{ fontVariant: 'small-caps' }}>
                {formatGroupLabel(date)}
              </span>
              <span className="flex-1 border-t border-ember/40" />
            </div>
            <div className="space-y-4">
              {list.map((entry) => (
                <article key={entry.id} data-testid={`collection-entry-${entry.id}`} className={`rounded p-4 ${cardCls}`}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h2 className={`font-serif font-bold ${textMain}`}>{entry.chunkHeading}</h2>
                    <button
                      type="button"
                      data-testid={`collection-remove-${entry.id}`}
                      onClick={() => setPendingRemove(entry.id)}
                      className={`shrink-0 text-xs ${textMuted} hover:text-ember`}
                    >
                      移出精选集
                    </button>
                  </div>
                  <div className={textMain} style={{ fontSize: 'var(--briefing-body-size)' }}>
                    <MarkdownRenderer content={entry.chunkBody} fileName="collection.md" hideHeader briefingStyle={theme} />
                  </div>
                  <div className={`mt-3 rounded p-3 ${isAcademic ? 'bg-ink/80 border border-parchment/10' : 'bg-[#f5f2ed] border border-[#1a1a1a]/10'}`}>
                    <div className={`leading-relaxed ${textMuted}`}>{entry.guide.context || entry.guide.summary}</div>
                    {entry.guide.terms.map((t, i) => (
                      <div key={i} className={`mt-1 text-sm ${textMuted}`}>
                        <span className="text-ember font-medium">{t.term}</span>
                        <span className="mx-1">·</span>
                        <span>{t.translation}</span>
                        {t.explanation && (
                          <div className={`mt-0.5 ${isAcademic ? 'text-parchment/50' : 'text-[#999]'}`}>{t.explanation}</div>
                        )}
                      </div>
                    ))}
                  </div>
                  {entry.qa.length > 0 && (
                    <div className="mt-3 space-y-2 border-t border-parchment/10 pt-3">
                      {entry.qa.map((m, i) => (
                        <div key={i} className={m.role === 'user' ? 'text-ember' : textMain}>
                          {m.role === 'user' && m.selection && (
                            <div className={`text-xs italic border-l-2 border-ember/40 pl-2 mb-1 ${textMuted}`}>
                              「{m.selection}」
                            </div>
                          )}
                          <ReactMarkdown components={qaComponents}>{m.content}</ReactMarkdown>
                        </div>
                      ))}
                    </div>
                  )}
                  <CollectionNote entry={entry} isAcademic={isAcademic} textMuted={textMuted} />
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
      <ConfirmDialog
        open={pendingRemove !== null}
        title="移出精选集"
        icon="trash"
        confirmLabel="移出"
        confirmVariant="danger"
        onConfirm={() => {
          if (pendingRemove) void removeCollectionEntry(pendingRemove)
          setPendingRemove(null)
        }}
        onCancel={() => setPendingRemove(null)}
      >
        移出后该块的收藏按钮将恢复可点，可重新收藏。
      </ConfirmDialog>
    </main>
  )
}
