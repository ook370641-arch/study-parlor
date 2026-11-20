import { useState } from 'react'
import type { DragEvent, ReactNode } from 'react'
import { useStore } from '@/store'
import { ipc } from '@/lib/ipc'
import { BRIEFING_LIST_STYLES } from '@/lib/briefing-font-size'
import { ANTHROPIC_SOURCES, LEGACY_SECTION_META, sectionOf } from '@/lib/anthropic-sections'
import type { AnthropicArticleMeta, BlogCollectionEntry, BlogMineGroup, BlogOrder, BlogReadEntry, BlogReorderRequest, BriefingTheme } from '@shared/index'
import { AnthropicArticleRow } from './AnthropicArticleRow'
import { BlogMineGroupSection } from './BlogMineGroupSection'
import { BlogRecommendationTools } from './BlogRecommendationTools'
import { BlogDeleteButton, BookIcon } from './blog-icons'

export type BlogDeleteRequest =
  | { kind: 'mine'; article: AnthropicArticleMeta }
  | { kind: 'collection' | 'read'; sourceUrl: string; filePath: string; title: string }

interface Props {
  theme?: BriefingTheme
  groups: Record<BlogMineGroup, AnthropicArticleMeta[]>
  order: BlogOrder
  collapsedGroups: Record<BlogMineGroup, boolean>
  onToggleGroup: (group: BlogMineGroup) => void
  onReorder: (request: BlogReorderRequest) => void
  onOpenArticle: (article: AnthropicArticleMeta) => void
  onRequestDelete: (request: BlogDeleteRequest) => void
}

const LABELS: Record<BlogMineGroup, string> = { saved: '已保存', read: '已读', favorite: '收藏' }
const EMPTY_TEXT: Record<BlogMineGroup, string> = {
  saved: '暂无已保存文章',
  read: '暂无已读文章',
  favorite: '尚无收藏——点右侧 ↻ 生成第一批，或点文章行的书签手动收藏',
}
const ARTICLE_MIME = 'application/x-blog-article'
const GROUP_MIME = 'application/x-blog-group'

function formatDate(iso: string | null | undefined) {
  if (!iso) return '未知日期'
  try {
    const date = new Date(iso)
    if (Number.isNaN(date.getTime())) return iso
    return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
  } catch {
    return iso
  }
}

function isRecent(iso: string | null | undefined) {
  if (!iso) return false
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return false
  const now = new Date()
  const cutoff = new Date(now)
  cutoff.setMonth(cutoff.getMonth() - 6)
  return date >= cutoff && date <= now
}

function CardThumb({ imageUrl, isAcademic, recent }: { imageUrl?: string | null; isAcademic: boolean; recent: boolean }) {
  return (
    <div className="relative h-14 w-14 shrink-0">
      {imageUrl
        ? <img src={imageUrl} alt="" className="h-14 w-14 rounded object-cover" loading="lazy" decoding="async" />
        : <div className={`flex h-14 w-14 items-center justify-center rounded text-xs ${isAcademic ? 'bg-parchment/10 text-parchment/40' : 'bg-[#e8e4de] text-[#6b5d52]/60'}`}>无配图</div>}
      {recent && <span data-testid="blog-recent-tag" className="absolute -right-1 -top-1 rounded bg-ember px-1 py-0.5 text-[8px] font-semibold leading-none text-white shadow-sm">NEW</span>}
    </div>
  )
}

export function BlogCollectionSection({
  theme = 'academic', groups, order, collapsedGroups, onToggleGroup, onReorder, onOpenArticle, onRequestDelete,
}: Props) {
  const isAcademic = theme !== 'newspaper'
  const collection = useStore(state => state.blogCollection)
  const recommendRunning = useStore(state => state.recommendRunning)
  const fontSize = useStore(state => state.briefingFontSize)
  const toggleBlogCollection = useStore(state => state.toggleBlogCollection)
  const toggleBlogRead = useStore(state => state.toggleBlogRead)
  const removeBlogCollection = useStore(state => state.removeBlogCollection)
  const removeBlogRead = useStore(state => state.removeBlogRead)
  const showToast = useStore(state => state.showToast)
  const [expandedReason, setExpandedReason] = useState<string | null>(null)
  const [draggingArticleUrl, setDraggingArticleUrl] = useState<string | null>(null)
  const [dragOverArticleUrl, setDragOverArticleUrl] = useState<string | null>(null)
  const listStyles = BRIEFING_LIST_STYLES[fontSize]
  const muted = isAcademic ? 'text-parchment/50' : 'text-[#6b5d52]'

  const openMarkedFile = async (article: AnthropicArticleMeta, onGone: () => Promise<void>, message: string) => {
    try {
      await ipc.readMd(article.filePath ?? '')
    } catch {
      showToast(message)
      await onGone()
      return
    }
    onOpenArticle(article)
  }

  const dropArticle = (event: DragEvent<HTMLElement>, group: BlogMineGroup, targetUrl: string) => {
    if (!event.dataTransfer.types.includes(ARTICLE_MIME)) return
    event.preventDefault()
    event.stopPropagation()
    try {
      const payload = JSON.parse(event.dataTransfer.getData(ARTICLE_MIME)) as { group: BlogMineGroup; sourceUrl: string }
      if (payload.group !== group || payload.sourceUrl === targetUrl) return
      const rect = event.currentTarget.getBoundingClientRect()
      onReorder({ kind: 'article', group, sourceUrl: payload.sourceUrl, targetUrl, placement: event.clientY > rect.top + rect.height / 2 ? 'after' : 'before' })
    } catch { return }
  }

  const dropGroup = (event: DragEvent<HTMLElement>, target: BlogMineGroup) => {
    if (!event.dataTransfer.types.includes(GROUP_MIME)) return
    event.preventDefault()
    const source = event.dataTransfer.getData(GROUP_MIME) as BlogMineGroup
    if (!LABELS[source] || source === target) return
    const rect = event.currentTarget.getBoundingClientRect()
    onReorder({ kind: 'group', source, target, placement: event.clientY > rect.top + rect.height / 2 ? 'after' : 'before' })
  }

  const clearArticleDrag = () => {
    setDraggingArticleUrl(null)
    setDragOverArticleUrl(null)
  }

  const renderCard = (group: BlogMineGroup, article: AnthropicArticleMeta) => {
    let card: ReactNode
    const sectionKey = sectionOf(article)
    const section = article.local === 'constitution'
      ? null
      : ANTHROPIC_SOURCES.find(item => item.key === sectionKey) ?? LEGACY_SECTION_META[sectionKey] ?? null
    if (group === 'saved') {
      card = <AnthropicArticleRow article={article} theme={theme} showUnimport inCollection={false}
        onToggleCollection={() => void toggleBlogCollection({ sourceUrl: article.url, filePath: article.filePath!, title: article.title })}
        isRead={false} onToggleRead={() => void toggleBlogRead({ sourceUrl: article.url, filePath: article.filePath!, title: article.title })}
        onOpenArticle={onOpenArticle} onRequestDelete={target => onRequestDelete({ kind: 'mine', article: target })} />
    } else if (group === 'read') {
      const entry = collection.read.find(item => item.sourceUrl === article.url)
      if (!entry) return null
      card = <ReadCard entry={entry} isAcademic={isAcademic} titleSize={listStyles.title}
        imageUrl={article.imageUrl} dateIso={article.publishedAt ?? entry.readAt} section={section}
        onOpen={() => void openMarkedFile(article, () => removeBlogRead(article.url), '该文件已被删除，已从已读移除')}
        onRemove={() => onRequestDelete({ kind: 'read', sourceUrl: article.url, filePath: entry.filePath, title: entry.title })} />
    } else {
      const entry = collection.entries.find(item => item.sourceUrl === article.url)
      if (!entry) return null
      card = <CollectionCard entry={entry} isAcademic={isAcademic} titleSize={listStyles.title} metaSize={listStyles.meta}
        imageUrl={article.imageUrl} recommendedAt={formatDate(entry.addedAt)} section={section}
        recent={isRecent(article.publishedAt ?? entry.addedAt)}
        isRead={collection.read.some(item => item.sourceUrl === article.url)} expanded={expandedReason === article.url}
        onToggleReason={() => setExpandedReason(current => current === article.url ? null : article.url)}
        onOpen={() => void openMarkedFile(article, () => removeBlogCollection(article.url), '该文件已被删除，已从收藏夹移除')}
        onRemove={() => onRequestDelete({ kind: 'collection', sourceUrl: article.url, filePath: entry.filePath, title: entry.title })}
        onToggleRead={() => void toggleBlogRead({ sourceUrl: article.url, filePath: entry.filePath, title: entry.title })} />
    }
    return (
      <div key={article.url} data-testid={`blog-${group}-card-${article.url}`}
        className={`group/article relative ${draggingArticleUrl === article.url ? 'opacity-40' : ''} ${dragOverArticleUrl === article.url ? 'rounded ring-1 ring-ember' : ''}`}
        onDragOver={event => {
          if (!event.dataTransfer.types.includes(ARTICLE_MIME)) return
          event.preventDefault()
          event.dataTransfer.dropEffect = 'move'
          setDragOverArticleUrl(article.url)
        }}
        onDrop={event => { clearArticleDrag(); dropArticle(event, group, article.url) }}>
        <span data-testid={`blog-list-article-handle-${article.url}`} title="拖拽排序" draggable onClick={event => event.stopPropagation()}
          onDragStart={event => {
            event.stopPropagation()
            event.dataTransfer.setData(ARTICLE_MIME, JSON.stringify({ group, sourceUrl: article.url }))
            event.dataTransfer.effectAllowed = 'move'
            setDraggingArticleUrl(article.url)
          }}
          onDragEnd={clearArticleDrag}
          className="absolute left-0 top-1 z-20 flex h-6 w-4 cursor-grab items-center justify-center rounded opacity-0 transition-opacity active:cursor-grabbing group-hover/article:opacity-100">⠿</span>
        {card}
      </div>
    )
  }

  return (
    <div data-testid="blog-collection-section" className={`shrink-0 border-b px-0 py-2 ${isAcademic ? 'border-slate/30' : 'border-[#c9c3b8]'}`}>
      {order.groups.map(group => (
        <BlogMineGroupSection key={group} area="list" group={group} label={LABELS[group]} count={groups[group].length}
          collapsed={collapsedGroups[group]} onToggle={() => onToggleGroup(group)}
          onGroupDragStart={event => { event.dataTransfer.setData(GROUP_MIME, group); event.dataTransfer.effectAllowed = 'move' }}
          onGroupDragOver={event => { if (event.dataTransfer.types.includes(GROUP_MIME)) event.preventDefault() }}
          onGroupDrop={event => dropGroup(event, group)}
          recommendationTools={group === 'favorite' ? <BlogRecommendationTools theme={theme} /> : undefined}>
          <div data-testid={`blog-list-${group}-order`}
            data-order={groups[group].map(article => article.url).join(',')}
            className="mt-1.5 space-y-1.5">
            {groups[group].length === 0 && (!recommendRunning || group !== 'favorite') && (
              <p data-testid={group === 'favorite' ? 'blog-collection-empty' : `blog-${group}-empty`} className={muted} style={{ fontSize: listStyles.meta }}>{EMPTY_TEXT[group]}</p>
            )}
            {groups[group].map(article => renderCard(group, article))}
          </div>
        </BlogMineGroupSection>
      ))}
    </div>
  )
}

function ReadCard({ entry, isAcademic, titleSize, imageUrl, dateIso, section, onOpen, onRemove }: {
  entry: BlogReadEntry
  isAcademic: boolean
  titleSize: string
  imageUrl?: string | null
  dateIso: string
  section: { label: string; color: string } | null
  onOpen: () => void
  onRemove: () => void
}) {
  return (
    <div className={`group relative rounded border border-l-[3px] border-l-ember p-4 ${isAcademic ? 'bg-ink/30 border-parchment/10' : 'bg-white border-[#1a1a1a]/10'}`}>
      <div className="flex items-start gap-3">
        <CardThumb imageUrl={imageUrl} isAcademic={isAcademic} recent={isRecent(dateIso)} />
        <div className="min-w-0 flex-1">
          <button type="button" data-testid={`blog-read-open-${entry.sourceUrl}`} onClick={onOpen}
            className={`block w-full text-left ${isAcademic ? 'text-parchment hover:text-ember' : 'text-[#1a1a1a] hover:text-ember'}`}
            style={{ fontSize: titleSize }}><span className="line-clamp-2 group-hover:line-clamp-none">{entry.title}</span></button>
          <div className="mt-1 flex items-center gap-1">
            {section && <span data-testid={`blog-read-source-${entry.sourceUrl}`}
              className="inline-block shrink-0 rounded-full border px-1 py-0.5 text-[9px]"
              style={{ borderColor: `${section.color}66`, color: section.color }}>{section.label}</span>}
            <span data-testid={`blog-read-actions-${entry.sourceUrl}`} className="ml-auto flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
              <BlogDeleteButton theme={isAcademic ? 'academic' : 'newspaper'} testId={`blog-read-remove-${entry.sourceUrl}`}
                title="移出已读并删除文章" onClick={onRemove} />
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

function CollectionCard({ entry, isAcademic, titleSize, metaSize, imageUrl, recommendedAt, recent, section, isRead, expanded, onToggleReason, onOpen, onRemove, onToggleRead }: {
  entry: BlogCollectionEntry
  isAcademic: boolean
  titleSize: string
  metaSize: string
  imageUrl?: string | null
  recommendedAt: string
  recent: boolean
  section: { label: string; color: string } | null
  isRead: boolean
  expanded: boolean
  onToggleReason: () => void
  onOpen: () => void
  onRemove: () => void
  onToggleRead: () => void
}) {
  return (
    <div className={`group relative rounded border border-l-[3px] border-l-ember p-4 ${isAcademic ? 'bg-ink/30 border-parchment/10' : 'bg-white border-[#1a1a1a]/10'}`}>
      <div className="flex items-start gap-3">
        <CardThumb imageUrl={imageUrl} isAcademic={isAcademic} recent={recent} />
        <div className="min-w-0 flex-1">
          <button type="button" data-testid={`blog-collection-open-${entry.sourceUrl}`} onClick={onOpen}
            className={`block w-full text-left ${isAcademic ? 'text-parchment hover:text-ember' : 'text-[#1a1a1a] hover:text-ember'}`}
            style={{ fontSize: titleSize }}><span className="line-clamp-2 group-hover:line-clamp-none">{entry.title}</span></button>
          <div className="mt-1 flex items-center gap-1">
            {entry.origin === 'recommend' && <button type="button" data-testid={`blog-collection-reason-${entry.sourceUrl}`} onClick={onToggleReason}
              className="inline-flex shrink-0 items-center justify-center rounded-full border border-ember/40 px-1 py-0.5 text-[10px] leading-none text-ember hover:bg-ember/10"
              title="推荐理由">&#128161;</button>}
            {section && <span data-testid={`blog-collection-source-${entry.sourceUrl}`}
              className="inline-block shrink-0 rounded-full border px-1 py-0.5 text-[9px]"
              style={{ borderColor: `${section.color}66`, color: section.color }}>{section.label}</span>}
            <span data-testid={`blog-collection-actions-${entry.sourceUrl}`} className="ml-auto flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
              <span data-testid={`blog-collection-read-${entry.sourceUrl}`} role="button" aria-pressed={isRead}
                title={isRead ? '已读（点击取消）' : '标为已读'} onClick={onToggleRead}
                className={`flex h-7 w-7 items-center justify-center ${isRead ? 'text-ember' : `${isAcademic ? 'text-parchment/30' : 'text-[#6b5d52]/40'} hover:text-ember`}`}>
                <BookIcon active={isRead} size={13} />
              </span>
              <BlogDeleteButton theme={isAcademic ? 'academic' : 'newspaper'} testId={`blog-collection-remove-${entry.sourceUrl}`}
                title="移出收藏并删除文章" onClick={onRemove} />
            </span>
          </div>
        </div>
      </div>
      {expanded && entry.origin === 'recommend' && (
        <div className={`mt-1.5 leading-relaxed ${isAcademic ? 'text-parchment/60' : 'text-[#6b5d52]'}`} style={{ fontSize: metaSize }}>
          <p><span className="text-ember">推荐日期：</span>{recommendedAt}</p>
          {entry.guide && <p><span className="text-ember">导读：</span>{entry.guide}</p>}
          <p><span className="text-ember">为什么推荐：</span>{entry.reason}</p>
          {entry.gap && <p className="mt-0.5"><span className="text-ember">补上缺口：</span>{entry.gap}</p>}
        </div>
      )}
    </div>
  )
}
