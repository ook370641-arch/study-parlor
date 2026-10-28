import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '@/store'
import { WritingTree } from '@/components/writing/WritingTree'
import { NoteCover } from '@/components/notes/NoteCover'
import { WRITING_UI_STYLES } from '@/lib/briefing-font-size'
import { sortNotes } from '@/lib/notes-list'
import type { BriefingTheme } from '@shared/index'
import type { ReactNode } from 'react'

// 博客/书籍共用的对照挑选器：对照 tab 下点来源栏「写作」后，替换左栏列表展示。
// 主区阅读器保持不动；点文件 = 放入该栏目对照槽（onPickFile 由各面板分派）。
// 笔记/仓库/文章三段平铺（免 tab 切换），均可折叠；笔记前置（2026-10-22 用户反馈）。
// 目标（博客文章 / 书籍章节）有则自动高亮对应笔记；无对应笔记时笔记段右侧给「＋ 新建」。
// 挑选器只做挑选，不提供重命名/删除（WritingTree 挑选模式已隐藏行内操作）。
type SectionKey = 'notes' | 'repository' | 'writing'

/** 当前对照目标：key 为 url（博客）或章节路径（书籍），label 用于展示与书籍笔记匹配 */
export type CompanionTarget = { key: string; label: string; noteExists: boolean }

const isUrlish = (key: string) => /^https?:\/\//i.test(key)

export function CompanionWritingPicker({ theme = 'academic', onPickFile, currentArticle, currentTarget, onCreateNote, emptyHint }: {
  theme?: BriefingTheme
  onPickFile: (path: string) => void
  /** @deprecated 旧的博客入参；内部转换成 currentTarget，博客侧可暂不改调用 */
  currentArticle?: { url: string; title: string } | null
  /** 当前对照目标（博客文章 / 书籍章节）；显式传 null 表示「还没有目标」 */
  currentTarget?: CompanionTarget | null
  /** 为目标新建笔记：返回新笔记路径（由调用方决定是否同时放入对照槽）；返回 null 表示未创建 */
  onCreateNote?: () => Promise<string | null>
  /** 无目标时顶部的提示文案（如书籍未选章节） */
  emptyHint?: string
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
  // 挑选场景忽略书架分类过滤：否则当前目标的对应笔记可能被滤掉，误判为「无对应笔记」
  const sortedNotes = useMemo(() => sortNotes(notesList ?? [], notesSortBy, 'all'), [notesList, notesSortBy])

  // 新 prop 优先；未传时把旧 currentArticle 转换成 target（博客可只改一处或暂不改）
  const target: CompanionTarget | null = currentTarget !== undefined
    ? currentTarget
    : currentArticle
      ? {
          key: currentArticle.url,
          label: currentArticle.title,
          noteExists: sortedNotes.some(n => n.meta.url === currentArticle.url),
        }
      : null
  const isUrlTarget = target ? isUrlish(target.key) : true
  // 旧 prop 仍保留内部创建能力（博客侧无需立刻改调用）
  const canCreate = !!onCreateNote || !!currentArticle

  const [open, setOpen] = useState<Record<SectionKey, boolean>>({ notes: true, repository: true, writing: true })
  const toggle = (k: SectionKey) => setOpen(s => ({ ...s, [k]: !s[k] }))

  // 目标对应笔记：命中则高亮 + 滚动到位（自动引导）
  const matchedNote = target
    ? sortedNotes.find(n => isUrlTarget
      ? n.meta.url === target.key
      : n.meta.source === 'book' && !!n.meta.book && n.meta.title === target.label)
    : undefined
  const matchedRef = useRef<HTMLButtonElement | null>(null)
  useEffect(() => { matchedRef.current?.scrollIntoView?.({ block: 'center' }) }, [matchedNote?.path])

  const [creating, setCreating] = useState(false)
  const createNoteForCurrent = async () => {
    if (!target || creating) return
    setCreating(true)
    try {
      let p: string | null = null
      if (onCreateNote) p = await onCreateNote()
      else if (currentArticle) p = (await findOrCreateArticleNote({ title: currentArticle.title, url: currentArticle.url })).path
      if (p) onPickFile(p)
    } catch {
      showToast('笔记创建失败')
    } finally {
      setCreating(false)
    }
  }

  const noop = () => {}
  const sectionCls = `px-3 pt-3 pb-1 text-[10px] tracking-[0.2em] font-serif ${isAcademic ? 'text-parchment/40' : 'text-[#6b5d52]/60'}`
  const hintText = target
    ? `为「${target.label}」新建笔记，或选择已有内容放入对照`
    : (emptyHint ?? '选择一篇文章放入对照')

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
      <p data-testid="picker-hint" className={`px-3 pt-3 text-[11px] leading-relaxed shrink-0 ${isAcademic ? 'text-parchment/50' : 'text-[#6b5d52]'}`}>
        {hintText}
      </p>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pb-3">
        {sectionHeader('notes', '笔记', target && !target.noteExists && canCreate ? (
          <button
            type="button"
            data-testid="picker-note-create"
            disabled={creating}
            onClick={() => void createNoteForCurrent()}
            title={`为「${target.label}」新建笔记`}
            className={`text-xs px-1 disabled:opacity-40 ${isAcademic ? 'text-ember hover:text-ember/80' : 'text-[#8a3a3a] hover:text-[#6a2a2a]'}`}
          >
            ＋ 新建
          </button>
        ) : undefined)}
        {open.notes && sortedNotes.map(entry => {
          const isMatch = matchedNote?.path === entry.path
          // 书籍笔记无 url，回退到文件名避免多条笔记共用 picker-note-note
          const testIdTail = entry.meta.url.split('/').pop() || entry.path.split('/').pop()?.replace(/\.md$/, '') || 'note'
          return (
            <button
              key={entry.path}
              ref={isMatch ? matchedRef : undefined}
              data-testid={`picker-note-${testIdTail}`}
              data-current={isMatch || undefined}
              className={`w-full flex items-center gap-2 px-3 py-1 text-left text-[11px] ${isMatch
                ? (isAcademic ? 'bg-ember/15 text-ember' : 'bg-[#8a3a3a]/10 text-[#8a3a3a]')
                : (isAcademic ? 'text-parchment/80 hover:bg-parchment/5' : 'text-[#2a1f1a] hover:bg-black/5')}`}
              onClick={() => onPickFile(entry.path)}
            >
              <NoteCover entry={entry} className="shrink-0 w-[14px] h-[19px] rounded-[2px]" />
              <span className="truncate">{entry.meta.title}</span>
              {isMatch && <span className="ml-auto shrink-0 text-[9px] opacity-70">{isUrlTarget ? '当前博客' : '当前章节'}</span>}
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
