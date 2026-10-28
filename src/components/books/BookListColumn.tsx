import { useRef, useState } from 'react'
import { useStore } from '@/store'
import { Tooltip } from '@/components/Tooltip'
import { DemoInfoButton, DemoNotePopover } from '@/components/demo/DemoNotePopover'
import type { DemoNote } from '@/lib/demo-notes'
import type { BriefingTheme } from '@shared/index'

interface Props {
  theme: BriefingTheme
  onRequestDelete?: (dir: string, title: string) => void
}

/** 书架列：书卡 + 导入入口。 */
export function BookListColumn({ theme, onRequestDelete }: Props) {
  const books = useStore((s) => s.booksList)
  const loading = useStore((s) => s.booksLoading)
  const importing = useStore((s) => s.booksImporting)
  const reparsing = useStore((s) => s.booksReparsing)
  const activeDir = useStore((s) => s.activeBookDir)
  const selectBook = useStore((s) => s.selectBook)
  const importBook = useStore((s) => s.importBook)
  const reparseBook = useStore((s) => s.reparseBook)
  const importStructuredDemo = useStore((s) => s.importStructuredDemo)
  const isAcademic = theme !== 'newspaper'
  const tipTheme = isAcademic ? 'academic' : 'newspaper'
  const [openNote, setOpenNote] = useState<DemoNote['id'] | null>(null)
  const docflowInfoRef = useRef<HTMLSpanElement>(null)

  return (
    <div data-testid="book-list-column" className="flex flex-col h-full min-h-0">
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-2 space-y-2">
        {loading && books.length === 0 && (
          <div className={`text-xs px-2 py-4 ${isAcademic ? 'text-parchment/50' : 'text-[#6b5d52]'}`}>加载中…</div>
        )}
        {!loading && books.length === 0 && (
          <div className={`text-xs px-2 py-4 leading-relaxed ${isAcademic ? 'text-parchment/50' : 'text-[#6b5d52]'}`}>
            还没有书籍，点击下方导入一本 PDF。
          </div>
        )}
        {books.map((b, i) => {
          const active = activeDir === b.dir
          return (
            <div key={b.dir} className="relative group">
              <button
                type="button"
                data-testid={`book-card-${i}`}
                onClick={() => void selectBook(b.dir)}
                className={`w-full text-left rounded px-3 py-2 transition-colors ${
                  active
                    ? isAcademic
                      ? 'bg-ember/15 border border-ember/40'
                      : 'bg-[#1a1a1a]/[0.08] border border-[#1a1a1a]/20'
                    : isAcademic
                      ? 'bg-parchment/5 hover:bg-parchment/10 border border-parchment/10'
                      : 'hover:bg-[#1a1a1a]/[0.04] border border-transparent'
                }`}
              >
                <Tooltip content={b.title} theme={tipTheme}>
                  <div className={`text-sm font-serif truncate ${isAcademic ? 'text-parchment' : 'text-[#2a1f1a]'}`}>
                    {b.title}
                    {!b.hasToc && (
                      <span className={`ml-1 text-[10px] ${isAcademic ? 'text-parchment/40' : 'text-[#6b5d52]'}`}>无目录</span>
                    )}
                  </div>
                </Tooltip>
                <div className={`text-[11px] mt-0.5 ${isAcademic ? 'text-parchment/50' : 'text-[#6b5d52]'}`}>
                  {b.chapterCount} 章
                  {b.parserKind === 'docflow-bundle' && (
                    <span
                      data-testid={`book-parser-badge-${i}`}
                      className={`ml-1 text-[10px] ${isAcademic ? 'text-ember/80' : 'text-[#b0503c]'}`}
                      title={b.parserNote ?? '外部结构化产物'}
                    >
                      · 结构化来源
                    </span>
                  )}
                </div>
                {/* 旧解析器产物：正文档落会挤在一起 / 无标题层级，提示并允许原地重解析 */}
                {/* 阈值与 electron/lib/books.ts 的 BOOK_PARSER_VERSION 保持一致 */}
                {(b.parserVersion ?? 1) < 3 && (
                  <div data-testid={`book-reparse-hint-${i}`} className="mt-1 flex items-center gap-1 text-[10px] leading-relaxed">
                    <span className={isAcademic ? 'text-parchment/40' : 'text-[#6b5d52]/70'}>解析格式较旧</span>
                    <button
                      type="button"
                      data-testid={`book-reparse-${i}`}
                      disabled={reparsing}
                      onClick={(e) => {
                        e.stopPropagation()
                        void reparseBook(b.dir)
                      }}
                      className={`shrink-0 rounded px-1 disabled:opacity-40 ${
                        isAcademic ? 'text-ember hover:bg-ember/10' : 'text-[#b0503c] hover:bg-[#1a1a1a]/[0.05]'
                      }`}
                    >
                      {reparsing ? '重解析中…' : '重新解析'}
                    </button>
                  </div>
                )}
                {b.bookGuide && (
                  <Tooltip content={b.bookGuide} theme={tipTheme}>
                    <div className={`text-[11px] mt-1 line-clamp-2 leading-relaxed ${isAcademic ? 'text-parchment/60' : 'text-[#6b5d52]'}`}>
                      {b.bookGuide}
                    </div>
                  </Tooltip>
                )}
              </button>
              {active && onRequestDelete && (
                <button
                  type="button"
                  data-testid={`book-delete-${i}`}
                  title="从书架移除"
                  onClick={(e) => {
                    e.stopPropagation()
                    onRequestDelete(b.dir, b.title)
                  }}
                  className={`absolute top-1.5 right-1.5 px-1 text-[10px] rounded transition-opacity ${
                    isAcademic ? 'text-parchment/40 hover:text-wine' : 'text-[#6b5d52]/60 hover:text-[#8a3a3a]'
                  }`}
                >
                  删除
                </button>
              )}
            </div>
          )
        })}
      </div>
      <div className={`p-2 border-t shrink-0 space-y-1 ${isAcademic ? 'border-parchment/10' : 'border-[#1a1a1a]/10'}`}>
        <button
          type="button"
          data-testid="book-import-button"
          disabled={importing}
          onClick={() => void importBook()}
          className={`w-full text-xs py-2 rounded transition-colors disabled:opacity-50 ${
            isAcademic ? 'text-ember hover:bg-ember/10' : 'text-[#b0503c] hover:bg-[#1a1a1a]/[0.04]'
          }`}
        >
          {importing ? '导入中…' : '+ 导入书籍'}
        </button>
        <div className="flex items-center gap-1">
          <span ref={docflowInfoRef} className="contents">
            <DemoInfoButton
              testId="demo-info-docflow"
              size="icon"
              label="结构化导入在验证什么"
              theme={theme}
              active={openNote === 'docflow'}
              onClick={() => setOpenNote((v) => (v === 'docflow' ? null : 'docflow'))}
            />
          </span>
          <button
            type="button"
            data-testid="book-import-structured-demo"
            disabled={importing}
            onClick={() => void importStructuredDemo()}
            className={`flex-1 text-[11px] py-1.5 rounded border transition-colors disabled:opacity-50 ${
              isAcademic
                ? 'border-parchment/20 text-parchment/70 hover:border-parchment/40 hover:text-parchment'
                : 'border-[#1a1a1a]/15 text-[#6b5d52] hover:border-[#1a1a1a]/30 hover:text-[#1a1a1a]'
            }`}
          >
            结构化样本
          </button>
        </div>
        <DemoNotePopover noteId={openNote} anchorRef={docflowInfoRef} onClose={() => setOpenNote(null)} theme={theme} />
      </div>
    </div>
  )
}
