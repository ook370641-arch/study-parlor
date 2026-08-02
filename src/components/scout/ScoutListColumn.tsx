import { useState } from 'react'
import { useStore } from '@/store'
import { ScoutConversationList } from './ScoutConversationList'
import { ArticleRow } from '@/components/article/ArticleRow'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import type { BriefingTheme, ScoutArticleMeta } from '@shared/index'

export function ScoutListColumn({ theme = 'academic' }: { theme?: BriefingTheme }) {
  const tab = useStore((s) => s.scoutTab)
  const setTab = useStore((s) => s.setScoutTab)
  const articles = useStore((s) => s.scoutArticles)
  const openScoutReader = useStore((s) => s.openScoutReader)
  const deleteScoutArticle = useStore((s) => s.deleteScoutArticle)
  const [pendingDelete, setPendingDelete] = useState<ScoutArticleMeta | null>(null)
  const isAcademic = theme !== 'newspaper'
  const borderCol = isAcademic ? 'border-parchment/15' : 'border-[#c9c3b8]'
  const tabIdle = isAcademic ? 'text-parchment/50 hover:text-parchment/70' : 'text-[#6b5d52]/70 hover:text-[#6b5d52]'

  return (
    <div className="flex flex-col h-full">
      <div className={`flex m-2 rounded-lg border ${borderCol} text-xs shrink-0 overflow-hidden`} role="tablist">
        {(['chat', 'articles'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-pressed={tab === t}
            data-testid={t === 'chat' ? 'scout-tab-chat' : 'scout-tab-articles'}
            onClick={() => void setTab(t)}
            className={`flex-1 py-1.5 transition-colors ${
              tab === t ? (isAcademic ? 'bg-ember/20 text-ember' : 'bg-[#1a1a1a] text-white') : tabIdle
            }`}
          >
            {t === 'chat' ? '💬 聊天' : '📄 文章'}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        {tab === 'chat' ? (
          <ScoutConversationList theme={theme} />
        ) : (
          <div className="px-2 space-y-2 pb-2">
            {articles.length === 0 && (
              <p className={`text-center py-8 text-xs ${isAcademic ? 'text-parchment/40' : 'text-[#6b5d52]/60'}`}>
                还没有文章，去聊天 Tab 让拾贝帮你找
              </p>
            )}
            {articles.map((a) => (
              <ArticleRow
                key={a.url}
                title={a.title}
                summary={a.summary}
                dateText={a.publishedAt ? new Date(a.publishedAt).toLocaleDateString('zh-CN') : '未知日期'}
                sourceName={a.sourceName}
                theme={theme}
                testId={`scout-article-row`}
                onOpen={() => openScoutReader(a.filePath)}
                onRequestDelete={() => setPendingDelete(a)}
              />
            ))}
          </div>
        )}
      </div>
      <ConfirmDialog
        open={pendingDelete !== null}
        title="删除文章"
        icon="trash"
        confirmLabel="删除"
        confirmVariant="danger"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          const target = pendingDelete
          setPendingDelete(null)
          if (target) void deleteScoutArticle(target.filePath)
        }}
      >
        <p>即将删除「{pendingDelete?.title}」，文章卡片将从列表移除。</p>
        <p className="mt-2">将同时删除该文章的旁注对话、标注与导读。</p>
      </ConfirmDialog>
    </div>
  )
}
