// src/components/anthropic/BlogCollectionSection.tsx
import { useState } from 'react'
import { useStore } from '@/store'
import { ipc } from '@/lib/ipc'
import { BRIEFING_LIST_STYLES } from '@/lib/briefing-font-size'
import type { BlogCollectionEntry, BlogReadEntry, BriefingTheme } from '@shared/index'

const STAGE_TEXT: Record<string, string> = {
  context: '分析写作上下文…',
  profile: '构建你的画像…',
  search: '搜索前沿博客…',
  pick: '精选本地文章…',
}

export function BlogCollectionSection({ theme = 'academic' }: { theme?: BriefingTheme }) {
  const isAcademic = theme !== 'newspaper'
  const collection = useStore((s) => s.blogCollection)
  const recommendRunning = useStore((s) => s.recommendRunning)
  const recommendStage = useStore((s) => s.recommendStage)
  const fontSize = useStore((s) => s.briefingFontSize)
  const startBlogRecommend = useStore((s) => s.startBlogRecommend)
  const cancelBlogRecommend = useStore((s) => s.cancelBlogRecommend)
  const removeBlogCollection = useStore((s) => s.removeBlogCollection)
  const removeBlogRead = useStore((s) => s.removeBlogRead)
  const openAnthropicReader = useStore((s) => s.openAnthropicReader)
  const showToast = useStore((s) => s.showToast)

  const [collapsed, setCollapsed] = useState(false)
  const [showRead, setShowRead] = useState(false)
  const [expandedReason, setExpandedReason] = useState<string | null>(null)

  const entries = collection.entries
  const readList = collection.read
  const listStyles = BRIEFING_LIST_STYLES[fontSize]
  const border = isAcademic ? 'border-slate/30' : 'border-[#c9c3b8]'
  const muted = isAcademic ? 'text-parchment/50' : 'text-[#6b5d52]'

  const openFile = async (filePath: string, onGone: () => Promise<void>, goneMsg: string) => {
    try {
      await ipc.readMd(filePath)
      await openAnthropicReader(filePath)
    } catch {
      showToast(goneMsg)
      await onGone()
    }
  }

  return (
    <div data-testid="blog-collection-section" className={`px-4 py-2 border-b ${border} shrink-0`}>
      {readList.length > 0 && (
        <div data-testid="blog-read-section" className="mb-1.5">
          <button
            type="button"
            data-testid="blog-read-toggle"
            onClick={() => setShowRead(s => !s)}
            className={`block ${muted} hover:text-ember`}
            style={{ fontSize: listStyles.meta }}
          >
            ✓ 已读（{readList.length}） {showRead ? '▴' : '▾'}
          </button>
          {showRead && (
            <div className="mt-1.5 space-y-1.5 max-h-40 overflow-y-auto">
              {readList.map((r) => (
                <ReadRow
                  key={r.sourceUrl}
                  entry={r}
                  isAcademic={isAcademic}
                  titleSize={listStyles.title}
                  onOpen={() => void openFile(r.filePath, () => removeBlogRead(r.sourceUrl), '该文件已被删除，已从已读移除')}
                  onRemove={() => void removeBlogRead(r.sourceUrl)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button type="button" data-testid="blog-collection-collapse" onClick={() => setCollapsed(c => !c)} className={`${muted} hover:text-ember`} style={{ fontSize: listStyles.meta }}>
          {collapsed ? '▸' : '▾'}
        </button>
        <span className={`font-serif ${isAcademic ? 'text-ember' : 'text-[#6b5d52]'}`} style={{ fontSize: listStyles.title }}>★ 收藏夹 ({entries.length})</span>
        <div className="flex-1" />
        <button
          type="button"
          data-testid="blog-recommend-button"
          onClick={() => (recommendRunning ? cancelBlogRecommend() : startBlogRecommend())}
          style={{ fontSize: listStyles.meta }}
          className={`px-2 py-1 rounded border transition-colors ${
            recommendRunning
              ? (isAcademic ? 'border-ember text-ember' : 'border-[#6b5d52] text-[#6b5d52]')
              : (isAcademic ? 'border-ember/40 text-ember hover:bg-ember/10' : 'border-[#6b5d52]/40 text-[#6b5d52] hover:bg-[#6b5d52]/10')
          }`}
        >
          {recommendRunning ? `${STAGE_TEXT[recommendStage ?? 'context']} ✕` : '重新推荐'}
        </button>
      </div>

      {!collapsed && (
        <div className="mt-2 space-y-1.5 max-h-64 overflow-y-auto">
          {entries.length === 0 && !recommendRunning && (
            <p data-testid="blog-collection-empty" className={muted} style={{ fontSize: listStyles.meta }}>
              尚无收藏——点「重新推荐」生成第一批，或点文章行的 ☆ 手动收藏
            </p>
          )}
          {entries.map((e) => (
            <CollectionRow
              key={e.sourceUrl}
              entry={e}
              isAcademic={isAcademic}
              titleSize={listStyles.title}
              metaSize={listStyles.meta}
              expanded={expandedReason === e.sourceUrl}
              onToggleReason={() => setExpandedReason(expandedReason === e.sourceUrl ? null : e.sourceUrl)}
              onOpen={() => void openFile(e.filePath, () => removeBlogCollection(e.sourceUrl), '该文件已被删除，已从收藏夹移除')}
              onRemove={() => void removeBlogCollection(e.sourceUrl)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ReadRow({ entry, isAcademic, titleSize, onOpen, onRemove }: {
  entry: BlogReadEntry
  isAcademic: boolean
  titleSize: string
  onOpen: () => void
  onRemove: () => void
}) {
  return (
    <div className={`rounded border p-2 flex items-center gap-2 ${isAcademic ? 'bg-ink/60 border-parchment/10' : 'bg-white border-[#1a1a1a]/10'}`}>
      <button type="button" data-testid={`blog-read-open-${entry.sourceUrl}`} onClick={onOpen}
        className={`flex-1 min-w-0 text-left truncate ${isAcademic ? 'text-parchment/70 hover:text-ember' : 'text-[#1a1a1a]/70 hover:text-ember'}`}
        style={{ fontSize: titleSize }}>
        {entry.title}
      </button>
      <button type="button" data-testid={`blog-read-remove-${entry.sourceUrl}`} onClick={onRemove}
        className={`shrink-0 ${isAcademic ? 'text-parchment/40 hover:text-ember' : 'text-[#6b5d52]/50 hover:text-ember'}`}
        style={{ fontSize: titleSize }}>
        ×
      </button>
    </div>
  )
}

function CollectionRow({ entry, isAcademic, titleSize, metaSize, expanded, onToggleReason, onOpen, onRemove }: {
  entry: BlogCollectionEntry
  isAcademic: boolean
  titleSize: string
  metaSize: string
  expanded: boolean
  onToggleReason: () => void
  onOpen: () => void
  onRemove: () => void
}) {
  return (
    <div className={`rounded border p-2 ${isAcademic ? 'bg-ink/60 border-parchment/10' : 'bg-white border-[#1a1a1a]/10'}`}>
      <div className="flex items-center gap-2">
        {entry.origin === 'recommend' && (
          <button type="button" data-testid={`blog-collection-reason-${entry.sourceUrl}`} onClick={onToggleReason} className="shrink-0" style={{ fontSize: titleSize }} title="查看推荐理由">💡</button>
        )}
        <button type="button" data-testid={`blog-collection-open-${entry.sourceUrl}`} onClick={onOpen}
          className={`flex-1 min-w-0 text-left truncate ${isAcademic ? 'text-parchment/90 hover:text-ember' : 'text-[#1a1a1a] hover:text-ember'}`}
          style={{ fontSize: titleSize }}>
          {entry.title}
        </button>
        <button type="button" data-testid={`blog-collection-remove-${entry.sourceUrl}`} onClick={onRemove}
          className={`shrink-0 ${isAcademic ? 'text-parchment/40 hover:text-ember' : 'text-[#6b5d52]/50 hover:text-ember'}`}
          style={{ fontSize: titleSize }}>
          ×
        </button>
      </div>
      {expanded && entry.origin === 'recommend' && (
        <div className={`mt-1.5 leading-relaxed ${isAcademic ? 'text-parchment/60' : 'text-[#6b5d52]'}`} style={{ fontSize: metaSize }}>
          {entry.guide && <p><span className="text-ember">导读：</span>{entry.guide}</p>}
          <p><span className="text-ember">为什么推荐：</span>{entry.reason}</p>
          {entry.gap && <p className="mt-0.5"><span className="text-ember">补上缺口：</span>{entry.gap}</p>}
        </div>
      )}
    </div>
  )
}
