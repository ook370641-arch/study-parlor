import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '@/store'
import { WritingTree } from '@/components/writing/WritingTree'
import { NoteCover } from '@/components/notes/NoteCover'
import { WRITING_UI_STYLES } from '@/lib/briefing-font-size'
import { sortNotes } from '@/lib/notes-list'
import type { BriefingTheme } from '@shared/index'
import type { ReactNode } from 'react'

// 博客对照挑选器：对照 tab 下点来源栏「写作」后，替换左栏文章列表展示。
// 主区阅读器保持不动；点文件 = 放入该栏目对照槽（onPickFile 由各面板分派）。
// 笔记/仓库/文章三段平铺（免 tab 切换），均可折叠；笔记前置（2026-10-22 用户反馈）。
// A 社博客场景：自动高亮并滚动到当前博客的对应笔记；无对应笔记时笔记段右侧给「＋ 新建」。
// 挑选器只做挑选，不提供重命名/删除（WritingTree 挑选模式已隐藏行内操作）。
type SectionKey = 'notes' | 'repository' | 'writing'

export function CompanionWritingPicker({ theme = 'academic', onPickFile, currentArticle }: {
  theme?: BriefingTheme
  onPickFile: (path: string) => void
  /** 当前在读的 A 社博客（有则自动引导对应笔记；无对应笔记时提供新建入口） */
  currentArticle?: { url: string; title: string } | null
}) {
  const loadWritingTree = useStore(s => s.loadWritingTree)
  const writingUISize = useStore(s => s.writingUIFontSize)
  const isAcademic = theme !== 'newspaper'

  useEffect(() => { void loadWritingTree() }, [loadWritingTree])

  const notesList = useStore(s => s.notesList)
  const notesSortBy = useStore(s => s.notesSortBy)
  const loadNotes = useStore(s => s.loadNotes)
  const findOrCreateArticleNote = useStore(s => s.findOrCreateArticleNote)
  const showToast = useStore(s => s.showToast)
  useEffect(() => { void loadNotes() }, [loadNotes])
  // 挑选场景忽略书架分类过滤：否则当前博客的对应笔记可能被滤掉，误判为「无对应笔记」
  const sortedNotes = useMemo(() => sortNotes(notesList ?? [], notesSortBy, 'all'), [notesList, notesSortBy])

  const [open, setOpen] = useState<Record<SectionKey, boolean>>({ notes: true, repository: true, writing: true })
  const toggle = (k: SectionKey) => setOpen(s => ({ ...s, [k]: !s[k] }))

  // 当前博客对应笔记：命中则高亮 + 滚动到位（自动引导）
  const matchedNote = currentArticle ? sortedNotes.find(n => n.meta.url === currentArticle.url) : undefined
  const matchedRef = useRef<HTMLButtonElement | null>(null)
  useEffect(() => { matchedRef.current?.scrollIntoView?.({ block: 'center' }) }, [matchedNote?.path])

  const [creating, setCreating] = useState(false)
  const createNoteForCurrent = async () => {
    if (!currentArticle || creating) return
    setCreating(true)
    try {
      const r = await findOrCreateArticleNote({ title: currentArticle.title, url: currentArticle.url })
      onPickFile(r.path)
    } catch {
      showToast('笔记创建失败')
    } finally {
      setCreating(false)
    }
  }

  const noop = () => {}
  const sectionCls = `px-3 pt-3 pb-1 text-[10px] tracking-[0.2em] font-serif ${isAcademic ? 'text-parchment/40' : 'text-[#6b5d52]/60'}`

  const sectionHeader = (key: SectionKey, label: string, extra?: ReactNode) => (
    <div className="flex items-center pr-2">
      <button
        type="button"
        data-testid={`picker-section-${key}`}
        aria-expanded={open[key]}
        onClick={() => toggle(key)}
        className={`${sectionCls} flex items-center gap-1 hover:opacity-80`}
      >
        <span>{open[key] ? '▾' : '▸'}</span>
        <span>{label}</span>
      </button>
      <div className="flex-1" />
      {extra}
    </div>
  )

  // WritingTree 行样式读 --writing-ui-size，与写作页左栏同一来源
  return (
    <div data-testid="companion-writing-picker" className="flex flex-col h-full min-h-0"
      style={{ ['--writing-ui-size' as string]: WRITING_UI_STYLES[writingUISize] }}>
      <p className={`px-3 pt-3 text-[11px] leading-relaxed shrink-0 ${isAcademic ? 'text-parchment/50' : 'text-[#6b5d52]'}`}>
        选择一篇文章放入对照
      </p>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pb-3">
        {sectionHeader('notes', '笔记', currentArticle && !matchedNote ? (
          <button
            type="button"
            data-testid="picker-note-create"
            disabled={creating}
            onClick={() => void createNoteForCurrent()}
            title={`为当前博客新建笔记：${currentArticle.title}`}
            className={`text-xs px-1 disabled:opacity-40 ${isAcademic ? 'text-ember hover:text-ember/80' : 'text-[#8a3a3a] hover:text-[#6a2a2a]'}`}
          >
            ＋ 新建
          </button>
        ) : undefined)}
        {open.notes && sortedNotes.map(entry => {
          const isMatch = matchedNote?.path === entry.path
          return (
            <button
              key={entry.path}
              ref={isMatch ? matchedRef : undefined}
              data-testid={`picker-note-${entry.meta.url.split('/').pop() || 'note'}`}
              data-current={isMatch || undefined}
              className={`w-full flex items-center gap-2 px-3 py-1 text-left text-[11px] ${isMatch
                ? (isAcademic ? 'bg-ember/15 text-ember' : 'bg-[#8a3a3a]/10 text-[#8a3a3a]')
                : (isAcademic ? 'text-parchment/80 hover:bg-parchment/5' : 'text-[#2a1f1a] hover:bg-black/5')}`}
              onClick={() => onPickFile(entry.path)}
            >
              <NoteCover entry={entry} className="shrink-0 w-[14px] h-[19px] rounded-[2px]" />
              <span className="truncate">{entry.meta.title}</span>
              {isMatch && <span className="ml-auto shrink-0 text-[9px] opacity-70">当前博客</span>}
            </button>
          )
        })}
        {sectionHeader('repository', '仓库')}
        {open.repository && (
          <WritingTree
            root="repository"
            theme={theme}
            inlineNew={null}
            onStartInlineNew={noop}
            onInlineNewChange={noop}
            onInlineNewSubmit={noop}
            onInlineNewCancel={noop}
            onPickFile={onPickFile}
          />
        )}
        {sectionHeader('writing', '文章')}
        {open.writing && (
          <WritingTree
            root="writing"
            theme={theme}
            inlineNew={null}
            onStartInlineNew={noop}
            onInlineNewChange={noop}
            onInlineNewSubmit={noop}
            onInlineNewCancel={noop}
            onPickFile={onPickFile}
          />
        )}
      </div>
    </div>
  )
}
