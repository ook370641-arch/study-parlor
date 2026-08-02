import { useEffect, useMemo, useState } from 'react'
import { useStore } from '@/store'
import { BriefingListColumn } from '@/components/BriefingListColumn'
import { AnthropicArticleReader } from '@/components/anthropic/AnthropicArticleReader'
import { ArticleAssistantPanel } from '@/components/article-assistant'
import { ScoutListColumn } from './ScoutListColumn'
import { ScoutChatView } from './ScoutChatView'
import { SwapPaintingButton } from '@/components/SwapPaintingButton'
import type { BriefingTheme } from '@shared/index'

export function ScoutPanel({ theme = 'academic' }: { theme?: BriefingTheme }) {
  const initScout = useStore((s) => s.initScout)
  const scoutTab = useStore((s) => s.scoutTab)
  const readerFilePath = useStore((s) => s.scoutReaderFilePath)
  const readerBody = useStore((s) => s.scoutReaderBody)
  const readerTitle = useStore((s) => s.scoutReaderTitle)
  const fontSize = useStore((s) => s.briefingFontSize)
  const increaseFontSize = useStore((s) => s.increaseBriefingFontSize)
  const decreaseFontSize = useStore((s) => s.decreaseBriefingFontSize)

  const [listCollapsed, setListCollapsed] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    setIsLoading(true)
    const result = initScout()
    if (result && typeof (result as Promise<void>).then === 'function') {
      ;(result as Promise<void>).finally(() => setIsLoading(false))
    } else {
      setIsLoading(false)
    }
  }, [initScout])

  const isAcademic = theme !== 'newspaper'
  const themeClasses = useMemo(() => isAcademic
    ? {
        muted: 'text-parchment/50',
        emptyIcon: 'text-parchment/20',
        skeleton: 'bg-parchment/10',
      }
    : {
        muted: 'text-[#6b5d52]',
        emptyIcon: 'text-[#c9c3b8]',
        skeleton: 'bg-[#e8e4de]',
      }, [isAcademic])

  const muted = themeClasses.muted
  const fontSizeBtnCls = isAcademic
    ? 'border-parchment/25 text-parchment/50 hover:text-parchment hover:border-parchment/40'
    : 'border-[#2a1f1a]/25 text-[#2a1f1a]/50 hover:text-[#2a1f1a] hover:border-[#2a1f1a]/40'

  return (
    <div data-testid="scout-panel" className="relative flex-1 flex min-w-0 overflow-hidden z-[5]">
      <BriefingListColumn collapsed={listCollapsed} onToggle={() => setListCollapsed(c => !c)} theme={theme} width={80} title="拾贝">
        <ScoutListColumn theme={theme} />
      </BriefingListColumn>

      <div className="flex-1 min-w-0 flex flex-col">
        {isLoading ? (
          <div className="flex-1 p-4 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className={`h-24 rounded animate-pulse ${themeClasses.skeleton}`} />
            ))}
          </div>
        ) : scoutTab === 'articles' && readerFilePath ? (
          <AnthropicArticleReader filePath={readerFilePath} theme={theme} />
        ) : scoutTab === 'chat' ? (
          <ScoutChatView theme={theme} />
        ) : (
          <div className={`relative flex-1 flex flex-col items-center justify-center px-6 ${muted}`}>
            <div className="absolute top-4 right-4 z-20 flex items-start gap-1">
              <button type="button" data-testid="briefing-font-size-decrease"
                disabled={fontSize === 'sm'}
                onClick={() => void decreaseFontSize()}
                className={`w-9 h-9 rounded-full border flex items-center justify-center text-sm disabled:opacity-20 disabled:cursor-not-allowed ${fontSizeBtnCls}`}
                title="减小字号">−</button>
              <button type="button" data-testid="briefing-font-size-increase"
                disabled={fontSize === '7xl'}
                onClick={() => void increaseFontSize()}
                className={`w-9 h-9 rounded-full border flex items-center justify-center text-sm disabled:opacity-20 disabled:cursor-not-allowed ${fontSizeBtnCls}`}
                title="增大字号">+</button>
              {isAcademic && (
                <SwapPaintingButton
                  surface="briefing"
                  data-testid="scout-swap-painting-button"
                  className="text-parchment/70 hover:text-parchment"
                />
              )}
            </div>
            <svg
              className={`w-12 h-12 mb-4 ${themeClasses.emptyIcon}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
              />
            </svg>
            <p className="text-sm">从左侧列表选择一篇文章开始阅读</p>
          </div>
        )}
      </div>

      {scoutTab === 'articles' && readerFilePath && readerBody && (
        <ArticleAssistantPanel
          articleType="web-article"
          parentPath={readerFilePath}
          articleTitle={readerTitle ?? undefined}
          articleContent={readerBody}
          autoGenerateGuide
          theme={theme}
        />
      )}
    </div>
  )
}
