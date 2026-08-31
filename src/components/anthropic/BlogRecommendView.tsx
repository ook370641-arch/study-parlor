// src/components/anthropic/BlogRecommendView.tsx
import { useStore } from '@/store'
import { ipc } from '@/lib/ipc'
import { BRIEFING_LIST_STYLES } from '@/lib/briefing-font-size'
import type { BlogRecommendPick, BriefingTheme } from '@shared/index'

export function BlogRecommendView({ theme = 'academic' }: { theme?: BriefingTheme }) {
  const isAcademic = theme !== 'newspaper'
  const collection = useStore((s) => s.blogCollection)
  const viewBatch = useStore((s) => s.recommendViewBatch)
  const fontSize = useStore((s) => s.briefingFontSize)
  const openRecommendView = useStore((s) => s.openRecommendView)
  const closeRecommendView = useStore((s) => s.closeRecommendView)
  const removeBlogBatch = useStore((s) => s.removeBlogBatch)
  const toggleBlogCollection = useStore((s) => s.toggleBlogCollection)
  const toggleBlogRead = useStore((s) => s.toggleBlogRead)
  const openAnthropicReader = useStore((s) => s.openAnthropicReader)
  const showToast = useStore((s) => s.showToast)

  const listStyles = BRIEFING_LIST_STYLES[fontSize]
  const muted = isAcademic ? 'text-parchment/50' : 'text-[#6b5d52]'
  const text = isAcademic ? 'text-parchment' : 'text-[#1a1a1a]'

  const history = collection.history
  const idx = history.findIndex(b => b.batch === viewBatch)

  if (idx < 0) {
    return (
      <div data-testid="blog-rec-empty" className={`flex-1 flex items-center justify-center ${muted}`} style={{ fontSize: listStyles.title }}>
        没有推荐批次——点左栏「重新推荐」生成第一批
      </div>
    )
  }

  const b = history[idx]
  const hasPrev = idx < history.length - 1  // 更旧
  const hasNext = idx > 0                    // 更新

  const openPick = async (p: BlogRecommendPick) => {
    try {
      await ipc.readMd(p.filePath)
      await openAnthropicReader(p.filePath)
    } catch {
      showToast('该文件已被删除，无法打开')
    }
  }

  const onDelete = () => {
    const neighbor = hasNext ? history[idx - 1].batch : hasPrev ? history[idx + 1].batch : null
    void removeBlogBatch(b.batch)
    if (neighbor != null) openRecommendView(neighbor)
    else closeRecommendView()
  }

  return (
    <div data-testid="blog-rec-view" className="flex-1 overflow-y-auto px-6 py-4">
      <div className="flex items-center gap-2">
        <button type="button" data-testid="blog-rec-prev" disabled={!hasPrev}
          onClick={() => hasPrev && openRecommendView(history[idx + 1].batch)}
          className={`${muted} hover:text-ember disabled:opacity-20 disabled:cursor-not-allowed`} style={{ fontSize: listStyles.meta }}>
          ‹ 上一批
        </button>
        <span className={muted} style={{ fontSize: listStyles.meta }}>
          第 {b.batch} 批 · {new Date(b.generatedAt).toLocaleString('zh-CN')}{b.searchUsed ? '' : ' · 未使用网络搜索'}
        </span>
        <button type="button" data-testid="blog-rec-next" disabled={!hasNext}
          onClick={() => hasNext && openRecommendView(history[idx - 1].batch)}
          className={`${muted} hover:text-ember disabled:opacity-20 disabled:cursor-not-allowed`} style={{ fontSize: listStyles.meta }}>
          下一批 ›
        </button>
        <div className="flex-1" />
        <button type="button" data-testid="blog-rec-delete-batch" onClick={onDelete}
          className={`${muted} hover:text-red-400`} style={{ fontSize: listStyles.meta }} title="删除本批推荐历史">
          🗑 删除本批
        </button>
        <button type="button" data-testid="blog-rec-close" onClick={closeRecommendView}
          className={`${muted} hover:text-ember`} style={{ fontSize: listStyles.meta }} title="关闭推荐页">
          ✕
        </button>
      </div>

      {b.focus ? (
        <>
          <p className={`mt-4 font-serif ${isAcademic ? 'text-ember' : 'text-[#6b5d52]'}`} style={{ fontSize: listStyles.title }}>◆ {b.focus}</p>
          <div className="mt-4">
            <p className={muted} style={{ fontSize: listStyles.meta }}>画像分析</p>
            <p className={`mt-1 leading-relaxed ${text}`} style={{ fontSize: listStyles.meta }}>{b.profile}</p>
          </div>
          <div className="mt-3">
            <p className={muted} style={{ fontSize: listStyles.meta }}>知识缺口</p>
            <p className={`mt-1 ${text}`} style={{ fontSize: listStyles.meta }}>{b.gaps.join('；')}</p>
          </div>
          <div className="mt-4 space-y-2">
            {(b.picks ?? []).map((p) => {
              const inCol = collection.entries.some(e => e.sourceUrl === p.sourceUrl)
              const isRead = collection.read.some(r => r.sourceUrl === p.sourceUrl)
              return (
                <div key={p.sourceUrl} className={`rounded border p-3 ${isAcademic ? 'bg-ink/60 border-parchment/10' : 'bg-white border-[#1a1a1a]/10'}`}>
                  <div className="flex items-center gap-2">
                    <button type="button" data-testid={`blog-rec-pick-${p.sourceUrl}`} onClick={() => void openPick(p)}
                      className={`flex-1 min-w-0 text-left font-serif ${isAcademic ? 'text-parchment hover:text-ember' : 'text-[#1a1a1a] hover:text-ember'}`}
                      style={{ fontSize: listStyles.title }}>
                      {p.title}
                    </button>
                    <button type="button" data-testid={`blog-rec-fav-${p.sourceUrl}`} title={inCol ? '已收藏' : '收藏'}
                      onClick={() => void toggleBlogCollection({ sourceUrl: p.sourceUrl, filePath: p.filePath, title: p.title })}
                      className={inCol ? 'text-ember' : `${muted} hover:text-ember`} style={{ fontSize: listStyles.title }}>
                      {inCol ? '★' : '☆'}
                    </button>
                    <button type="button" data-testid={`blog-rec-read-${p.sourceUrl}`} title={isRead ? '已读（点击取消）' : '标为已读'}
                      onClick={() => void toggleBlogRead({ sourceUrl: p.sourceUrl, filePath: p.filePath, title: p.title })}
                      className={isRead ? 'text-ember' : `${muted} hover:text-ember`} style={{ fontSize: listStyles.title }}>
                      {isRead ? '✓' : '○'}
                    </button>
                  </div>
                  {p.guide && <p className={`mt-1.5 leading-relaxed ${isAcademic ? 'text-parchment/70' : 'text-[#6b5d52]'}`} style={{ fontSize: listStyles.meta }}>{p.guide}</p>}
                  <p className={`mt-1 ${muted}`} style={{ fontSize: listStyles.meta }}>
                    {p.reason}{p.gap ? `（挂上：${p.gap}）` : ''}
                  </p>
                </div>
              )
            })}
          </div>
          <p className={`mt-4 ${muted}`} style={{ fontSize: listStyles.meta }}>检索方向：{b.queries.join('、')}</p>
        </>
      ) : (
        <>
          <p className={`mt-4 leading-relaxed ${text}`} style={{ fontSize: listStyles.meta }}>{b.profile}</p>
          <p className={`mt-2 ${muted}`} style={{ fontSize: listStyles.meta }}>认知缺口：{b.gaps.join('、')}</p>
          <p className={`mt-1 ${muted}`} style={{ fontSize: listStyles.meta }}>检索方向：{b.queries.join('、')}</p>
        </>
      )}
    </div>
  )
}
