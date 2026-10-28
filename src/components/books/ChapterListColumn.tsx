import { useStore } from '@/store'
import type { BriefingTheme } from '@shared/index'
import { Tooltip } from '@/components/Tooltip'

/** 章节列：当前选中书的目录（book.json.toc）。 */
export function ChapterListColumn({ theme }: { theme: BriefingTheme }) {
  const toc = useStore((s) => s.activeBookToc)
  const activePath = useStore((s) => s.activeChapter?.path ?? null)
  const selectChapter = useStore((s) => s.selectChapter)
  const bookDir = useStore((s) => s.activeBookDir)
  const isAcademic = theme !== 'newspaper'

  return (
    <div data-testid="chapter-list-column" className="flex flex-col h-full min-h-0 overflow-y-auto overscroll-contain p-2 space-y-1">
      {toc.length === 0 && (
        <div className={`text-xs px-2 py-4 leading-relaxed ${isAcademic ? 'text-parchment/50' : 'text-[#6b5d52]'}`}>
          先在左侧选一本书
        </div>
      )}
      {toc.map((c, i) => {
        const abs = bookDir ? `${bookDir}/${c.chapterFile}` : c.chapterFile
        const active = activePath === abs
        return (
          <Tooltip key={c.chapterFile} content={c.title} theme={isAcademic ? 'academic' : 'newspaper'}>
            <button
              type="button"
              data-testid={`chapter-row-${i}`}
              onClick={() => void selectChapter(abs)}
              className={`w-full text-left rounded px-3 py-1.5 text-sm truncate transition-colors ${
                active
                  ? isAcademic
                    ? 'bg-ember/15 text-ember'
                    : 'bg-[#1a1a1a]/[0.08] text-[#2a1f1a]'
                  : isAcademic
                    ? 'text-parchment/80 hover:bg-parchment/10'
                    : 'text-[#2a1f1a]/80 hover:bg-[#1a1a1a]/[0.04]'
              }`}
            >
              {i + 1}. {c.title}
            </button>
          </Tooltip>
        )
      })}
    </div>
  )
}
