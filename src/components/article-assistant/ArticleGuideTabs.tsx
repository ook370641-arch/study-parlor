import { useStore } from '@/store'
import { GuideSidebar } from './GuideSidebar'
import { ArticleCompanionBoard } from './ArticleCompanionBoard'
import type { BriefingTheme } from '@shared/index'

export type ArticleSideSource = 'anthropic' | 'scout' | 'job'
export type ArticlePanelMode = 'guide' | 'companion'

export function ArticleGuideTabs({ source, theme = 'academic' }: { source: ArticleSideSource; theme?: BriefingTheme }) {
  const mode = useStore((s) => s.articlePanelMode[source])
  const setMode = useStore((s) => s.setArticlePanelMode)

  const tabCls = (m: ArticlePanelMode) =>
    `text-[11px] tracking-[0.2em] font-serif px-2 py-1 rounded transition-colors ${mode === m ? 'text-ember bg-ember/10' : 'text-parchment/60 hover:text-parchment/90'}`

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="h-9 flex items-center gap-1 px-3 border-b border-parchment/10 shrink-0">
        <button data-testid={`article-panel-tab-guide-${source}`} className={tabCls('guide')} onClick={() => setMode(source, 'guide')}>导读</button>
        <button data-testid={`article-panel-tab-companion-${source}`} className={tabCls('companion')} onClick={() => setMode(source, 'companion')}>对照</button>
      </div>
      {mode === 'guide' ? (
        <div className="flex-1 min-h-0 overflow-hidden"><GuideSidebar theme={theme} /></div>
      ) : (
        <ArticleCompanionBoard theme={theme} />
      )}
    </div>
  )
}
