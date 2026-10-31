// src/components/anthropic/BlogCollectionSection.tsx
import { useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'
import { useStore } from '@/store'
import { ipc } from '@/lib/ipc'
import { BRIEFING_LIST_STYLES } from '@/lib/briefing-font-size'
import { BookIcon, BookmarkIcon, HistoryIcon, RefreshIcon, UnimportIcon } from './blog-icons'
import { BlogRecommendDialog } from './BlogRecommendDialog'
import type { BlogCollectionEntry, BlogReadEntry, BriefingTheme } from '@shared/index'

const STAGE_TEXT: Record<string, string> = {
  context: '分析写作上下文…',
  profile: '构建你的画像…',
  search: '搜索前沿博客…',
  pick: '精选本地文章…',
}

interface RemoveRequest {
  kind: 'collection' | 'read'
  sourceUrl: string
  filePath: string
  title: string
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return '未知日期'
  try {
    return new Date(iso).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
  } catch {
    return iso
  }
}

function CardThumb({ imageUrl, isAcademic }: { imageUrl?: string | null; isAcademic: boolean }) {
  if (imageUrl) {
    return <img src={imageUrl} alt="" className="shrink-0 w-12 h-12 object-cover rounded" loading="lazy" decoding="async" />
  }
  return (
    <div className={`shrink-0 w-12 h-12 rounded flex items-center justify-center text-[9px] ${isAcademic ? 'bg-parchment/10 text-parchment/40' : 'bg-[#e8e4de] text-[#6b5d52]/60'}`}>
      无配图
    </div>
  )
}

export function BlogCollectionSection({ theme = 'academic', onRequestRemove }: {
  theme?: BriefingTheme
  onRequestRemove: (t: RemoveRequest) => void
}) {
  const isAcademic = theme !== 'newspaper'
  const collection = useStore((s) => s.blogCollection)
  const recommendRunning = useStore((s) => s.recommendRunning)
  const recommendStage = useStore((s) => s.recommendStage)
  const fontSize = useStore((s) => s.briefingFontSize)
  const cacheArticles = useStore((s) => s.anthropicBlogCache.articles)
  const startBlogRecommend = useStore((s) => s.startBlogRecommend)
  const cancelBlogRecommend = useStore((s) => s.cancelBlogRecommend)
  const removeBlogCollection = useStore((s) => s.removeBlogCollection)
  const removeBlogRead = useStore((s) => s.removeBlogRead)
  const toggleBlogRead = useStore((s) => s.toggleBlogRead)
  const openAnthropicReader = useStore((s) => s.openAnthropicReader)
  const openRecommendView = useStore((s) => s.openRecommendView)
  const showToast = useStore((s) => s.showToast)

  const [collapsed, setCollapsed] = useState(false)
  const [showRead, setShowRead] = useState(false)
  const [expandedReason, setExpandedReason] = useState<string | null>(null)
  const [recommendDialogOpen, setRecommendDialogOpen] = useState(false)

  // 已读/收藏列表拖拽延长（2026-10-22 用户反馈：固定 max-h 太短）。
  // null = 用默认 max-h 类；拖拽后改为显式 px 高度。
  const [readHeight, setReadHeight] = useState<number | null>(null)
  const [colHeight, setColHeight] = useState<number | null>(null)
  const readListRef = useRef<HTMLDivElement | null>(null)
  const colListRef = useRef<HTMLDivElement | null>(null)
  const startResize = (ref: RefObject<HTMLDivElement | null>, set: (h: number) => void) =>
    (e: ReactPointerEvent) => {
      e.preventDefault()
      const startY = e.clientY
      const startH = ref.current?.offsetHeight ?? 0
      const onMove = (ev: PointerEvent) => set(Math.min(560, Math.max(80, startH + ev.clientY - startY)))
      const onUp = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    }

  const entries = collection.entries
  const readList = collection.read
  const listStyles = BRIEFING_LIST_STYLES[fontSize]
  const border = isAcademic ? 'border-slate/30' : 'border-[#c9c3b8]'
  const muted = isAcademic ? 'text-parchment/50' : 'text-[#6b5d52]'

  const articleOf = (url: string) => cacheArticles.find((a) => a.url === url)

  // 排序：手动在前，推荐后置，组内保序（用户决策 2026-09-23）
  const sortedEntries = [...entries].sort(
    (a, b) => (a.origin === 'recommend' ? 1 : 0) - (b.origin === 'recommend' ? 1 : 0)
  )

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
    <>
    <div data-testid="blog-collection-section" className={`px-4 py-2 border-b ${border} shrink-0`}>
      {readList.length > 0 && (
        <div data-testid="blog-read-section" className="mb-1.5">
          <button
            type="button"
            data-testid="blog-read-toggle"
            title="已读"
            onClick={() => setShowRead(s => !s)}
            className={`flex items-center gap-2 w-full text-left ${muted} hover:text-ember`}
          >
            <span style={{ fontSize: listStyles.meta }}>{showRead ? '▾' : '▸'}</span>
            <BookIcon active size={13} className={isAcademic ? 'text-ember' : 'text-[#6b5d52]'} />
            <span data-testid="blog-read-count" className={isAcademic ? 'text-parchment' : 'text-[#1a1a1a]'} style={{ fontSize: listStyles.title }}>{readList.length}</span>
          </button>
          {showRead && (
            <>
              <div
                ref={readListRef}
                className={`mt-1.5 space-y-1.5 overflow-y-auto ${readHeight == null ? 'max-h-40' : ''}`}
                style={readHeight != null ? { height: readHeight } : undefined}
              >
                {readList.map((r) => (
                  <ReadCard
                    key={r.sourceUrl}
                    entry={r}
                    isAcademic={isAcademic}
                    titleSize={listStyles.title}
                    metaSize={listStyles.meta}
                    imageUrl={articleOf(r.sourceUrl)?.imageUrl}
                    dateIso={articleOf(r.sourceUrl)?.publishedAt ?? r.readAt}
                    onOpen={() => void openFile(r.filePath, () => removeBlogRead(r.sourceUrl), '该文件已被删除，已从已读移除')}
                    onRemove={() => onRequestRemove({ kind: 'read', sourceUrl: r.sourceUrl, filePath: r.filePath, title: r.title })}
                  />
                ))}
              </div>
              <div
                data-testid="blog-read-resize"
                title="拖拽调整列表高度"
                onPointerDown={startResize(readListRef, setReadHeight)}
                className="group flex items-center justify-center h-2 cursor-row-resize touch-none"
              >
                <span className={`w-10 border-t-2 border-dotted ${isAcademic ? 'border-parchment/25 group-hover:border-ember' : 'border-[#6b5d52]/30 group-hover:border-ember'}`} />
              </div>
            </>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button type="button" data-testid="blog-collection-collapse" onClick={() => setCollapsed(c => !c)} className={`${muted} hover:text-ember`} style={{ fontSize: listStyles.meta }}>
          {collapsed ? '▸' : '▾'}
        </button>
        <BookmarkIcon active size={13} className={isAcademic ? 'text-ember' : 'text-[#6b5d52]'} title="收藏夹" />
        <span data-testid="blog-collection-count" className={isAcademic ? 'text-parchment' : 'text-[#1a1a1a]'} style={{ fontSize: listStyles.title }}>{entries.length}</span>
        <div className="flex-1" />
        {recommendRunning && (
          <span className={muted} style={{ fontSize: listStyles.meta }}>{STAGE_TEXT[recommendStage ?? 'context']}</span>
        )}
        {collection.history.length > 0 && (
          <button
            type="button"
            data-testid="blog-rec-history"
            title="推荐记录"
            onClick={() => openRecommendView(collection.history[0].batch)}
            className={`w-[26px] h-[26px] rounded border flex items-center justify-center transition-colors ${
              isAcademic
                ? 'border-ember/40 text-ember hover:bg-ember/10'
                : 'border-[#6b5d52]/40 text-[#6b5d52] hover:bg-[#6b5d52]/10'
            }`}
          >
            <HistoryIcon size={13} />
          </button>
        )}
        <button
          type="button"
          data-testid="blog-recommend-button"
          title={recommendRunning ? '取消推荐' : '重新推荐'}
          onClick={() => (recommendRunning ? void cancelBlogRecommend() : setRecommendDialogOpen(true))}
          className={`w-[26px] h-[26px] rounded border flex items-center justify-center transition-colors ${
            isAcademic
              ? 'border-ember/40 text-ember hover:bg-ember/10'
              : 'border-[#6b5d52]/40 text-[#6b5d52] hover:bg-[#6b5d52]/10'
          }`}
        >
          {recommendRunning ? '✕' : <RefreshIcon size={13} />}
        </button>
      </div>

      {!collapsed && (
        <>
        <div
          ref={colListRef}
          className={`mt-2 space-y-1.5 overflow-y-auto ${colHeight == null ? 'max-h-64' : ''}`}
          style={colHeight != null ? { height: colHeight } : undefined}
        >
          {entries.length === 0 && !recommendRunning && (
            <p data-testid="blog-collection-empty" className={muted} style={{ fontSize: listStyles.meta }}>
              尚无收藏——点右侧 ↻ 生成第一批，或点文章行的书签手动收藏
            </p>
          )}
          {sortedEntries.map((e) => (
            <CollectionCard
              key={e.sourceUrl}
              entry={e}
              isAcademic={isAcademic}
              titleSize={listStyles.title}
              metaSize={listStyles.meta}
              imageUrl={articleOf(e.sourceUrl)?.imageUrl}
              dateText={formatDate(articleOf(e.sourceUrl)?.publishedAt ?? e.addedAt)}
              isRead={collection.read.some((r) => r.sourceUrl === e.sourceUrl)}
              expanded={expandedReason === e.sourceUrl}
              onToggleReason={() => setExpandedReason(expandedReason === e.sourceUrl ? null : e.sourceUrl)}
              onOpen={() => void openFile(e.filePath, () => removeBlogCollection(e.sourceUrl), '该文件已被删除，已从收藏夹移除')}
              onRemove={() => onRequestRemove({ kind: 'collection', sourceUrl: e.sourceUrl, filePath: e.filePath, title: e.title })}
              onToggleRead={() => void toggleBlogRead({ sourceUrl: e.sourceUrl, filePath: e.filePath, title: e.title })}
            />
          ))}
        </div>
        {sortedEntries.length > 0 && (
          <div
            data-testid="blog-collection-resize"
            title="拖拽调整列表高度"
            onPointerDown={startResize(colListRef, setColHeight)}
            className="group flex items-center justify-center h-2 cursor-row-resize touch-none"
          >
            <span className={`w-10 border-t-2 border-dotted ${isAcademic ? 'border-parchment/25 group-hover:border-ember' : 'border-[#6b5d52]/30 group-hover:border-ember'}`} />
          </div>
        )}
        </>
      )}
    </div>
    {recommendDialogOpen && (
      <BlogRecommendDialog
        theme={theme}
        onCancel={() => setRecommendDialogOpen(false)}
        onStart={(note) => {
          setRecommendDialogOpen(false)
          void startBlogRecommend(note)
        }}
      />
    )}
    </>
  )
}

function ReadCard({ entry, isAcademic, titleSize, metaSize, imageUrl, dateIso, onOpen, onRemove }: {
  entry: BlogReadEntry
  isAcademic: boolean
  titleSize: string
  metaSize: string
  imageUrl?: string | null
  dateIso: string
  onOpen: () => void
  onRemove: () => void
}) {
  return (
    <div className={`rounded border border-l-[3px] border-l-ember p-2 flex items-start gap-2 relative ${isAcademic ? 'bg-ink/30 border-parchment/10' : 'bg-white border-[#1a1a1a]/10'}`}>
      <CardThumb imageUrl={imageUrl} isAcademic={isAcademic} />
      <div className="flex-1 min-w-0 pr-5">
        <button type="button" data-testid={`blog-read-open-${entry.sourceUrl}`} onClick={onOpen}
          className={`block w-full text-left truncate ${isAcademic ? 'text-parchment hover:text-ember' : 'text-[#1a1a1a] hover:text-ember'}`}
          style={{ fontSize: titleSize }}>
          {entry.title}
        </button>
        <p className={isAcademic ? 'text-parchment/50' : 'text-[#6b5d52]'} style={{ fontSize: metaSize }}>
          {formatDate(dateIso)}
        </p>
      </div>
      <span data-testid={`blog-read-remove-${entry.sourceUrl}`} role="button" title="移出已读并删除文章"
        onClick={onRemove}
        className={`absolute top-1.5 right-1.5 ${isAcademic ? 'text-parchment/30 hover:text-red-400' : 'text-[#6b5d52]/40 hover:text-red-600'}`}>
        <UnimportIcon size={13} />
      </span>
    </div>
  )
}

function CollectionCard({ entry, isAcademic, titleSize, metaSize, imageUrl, dateText, isRead, expanded, onToggleReason, onOpen, onRemove, onToggleRead }: {
  entry: BlogCollectionEntry
  isAcademic: boolean
  titleSize: string
  metaSize: string
  imageUrl?: string | null
  dateText: string
  isRead: boolean
  expanded: boolean
  onToggleReason: () => void
  onOpen: () => void
  onRemove: () => void
  onToggleRead: () => void
}) {
  return (
    <div className={`rounded border border-l-[3px] border-l-ember p-2 relative ${isAcademic ? 'bg-ink/30 border-parchment/10' : 'bg-white border-[#1a1a1a]/10'}`}>
      <div className="flex items-start gap-2">
        {entry.origin === 'recommend' && (
          <button type="button" data-testid={`blog-collection-reason-${entry.sourceUrl}`} onClick={onToggleReason} className="shrink-0 mt-0.5" style={{ fontSize: titleSize }} title="推荐理由">💡</button>
        )}
        <CardThumb imageUrl={imageUrl} isAcademic={isAcademic} />
        <div className="flex-1 min-w-0 pr-11">
          <button type="button" data-testid={`blog-collection-open-${entry.sourceUrl}`} onClick={onOpen}
            className={`block w-full text-left truncate ${isAcademic ? 'text-parchment hover:text-ember' : 'text-[#1a1a1a] hover:text-ember'}`}
            style={{ fontSize: titleSize }}>
            {entry.title}
          </button>
          <p className={isAcademic ? 'text-parchment/50' : 'text-[#6b5d52]'} style={{ fontSize: metaSize }}>
            {dateText}{entry.origin === 'recommend' ? ' · 推荐' : ''}
          </p>
        </div>
        <span className="absolute top-1.5 right-1.5 flex items-center gap-2.5">
          <span data-testid={`blog-collection-remove-${entry.sourceUrl}`} role="button" title="移出收藏并删除文章" onClick={onRemove}
            className={isAcademic ? 'text-parchment/30 hover:text-red-400' : 'text-[#6b5d52]/40 hover:text-red-600'}>
            <UnimportIcon size={13} />
          </span>
          <span data-testid={`blog-collection-read-${entry.sourceUrl}`} role="button" aria-pressed={isRead}
            title={isRead ? '已读（点击取消）' : '标为已读'} onClick={onToggleRead}
            className={isRead ? 'text-ember' : `${isAcademic ? 'text-parchment/30' : 'text-[#6b5d52]/40'} hover:text-ember`}>
            <BookIcon active={isRead} size={13} />
          </span>
        </span>
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
