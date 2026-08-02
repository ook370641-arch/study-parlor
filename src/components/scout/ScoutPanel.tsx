import { useEffect, useMemo } from 'react'
import { useStore } from '@/store'
import { BriefingListColumn } from '@/components/BriefingListColumn'
import { AnthropicArticleReader } from '@/components/anthropic/AnthropicArticleReader'
import { ArticleAssistantPanel } from '@/components/article-assistant'
import { ScoutListColumn } from './ScoutListColumn'
import { ScoutChatView } from './ScoutChatView'
import type { BriefingTheme } from '@shared/index'

export function ScoutPanel({ theme = 'academic' }: { theme?: BriefingTheme }) {
  const initScout = useStore((s) => s.initScout)
  const scoutTab = useStore((s) => s.scoutTab)
  const readerFilePath = useStore((s) => s.scoutReaderFilePath)
  const readerBody = useStore((s) => s.scoutReaderBody)
  const readerTitle = useStore((s) => s.scoutReaderTitle)

  useEffect(() => { void initScout() }, [initScout])

  const isAcademic = theme !== 'newspaper'
  const themeClasses = useMemo(() => isAcademic
    ? {
        panelBg: 'bg-transparent',
        border: 'border-slate/30',
        text: 'text-parchment',
        muted: 'text-parchment/50',
        inputBg: 'bg-parchment/10',
        inputText: 'text-parchment',
        inputPlaceholder: 'placeholder:text-parchment/40',
        inputBorder: 'border-slate/30 focus:border-ember/50',
        button: 'bg-ember/20 text-parchment hover:bg-ember/30',
        emptyIcon: 'text-parchment/20',
        skeleton: 'bg-parchment/10',
      }
    : {
        panelBg: 'bg-white',
        border: 'border-[#c9c3b8]',
        text: 'text-[#1a1a1a]',
        muted: 'text-[#6b5d52]',
        inputBg: 'bg-white',
        inputText: 'text-[#1a1a1a]',
        inputPlaceholder: 'placeholder:text-[#6b5d52]/60',
        inputBorder: 'border-[#c9c3b8] focus:border-[#1a1a1a]/50',
        button: 'bg-[#1a1a1a] text-white hover:bg-[#333]',
        emptyIcon: 'text-[#c9c3b8]',
        skeleton: 'bg-[#e8e4de]',
      }, [isAcademic])

  const muted = themeClasses.muted

  return (
    <div data-testid="scout-panel" className="relative flex-1 flex min-w-0 overflow-hidden z-[5]">
      <BriefingListColumn collapsed={false} onToggle={() => {}} theme={theme} width={80} title="拾贝">
        <ScoutListColumn theme={theme} />
      </BriefingListColumn>

      <div className="flex-1 min-w-0 flex flex-col">
        {scoutTab === 'articles' && readerFilePath ? (
          <AnthropicArticleReader filePath={readerFilePath} theme={theme} />
        ) : scoutTab === 'chat' ? (
          <ScoutChatView theme={theme} />
        ) : (
          <div className={`flex-1 flex items-center justify-center text-sm ${muted}`}>
            从左侧列表选择一篇文章开始阅读
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
