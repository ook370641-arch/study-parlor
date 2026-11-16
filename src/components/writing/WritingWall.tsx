import { useMemo, useState, type ReactNode } from 'react'
import type { BriefingTheme, WritingRoot, WritingTreeNode } from '@shared/index'
import { AlbumCard } from '@/components/album-wall/AlbumCard'
import { AlbumGrid, AlbumWall } from '@/components/album-wall/AlbumWall'
import { AlbumGroupSection } from '@/components/album-wall/AlbumGroupSection'
import { CoverGenerator } from '@/components/album-wall/CoverGenerator'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { ipc } from '@/lib/ipc'
import { useStore } from '@/store'
import { buildWritingWallGroups, type WritingWallGroup, type WritingWallSort } from '@/lib/writing-wall'
import { displayWritingName } from '@/lib/writing-tree-utils'
import { WRITING_UI_STYLES } from '@/lib/briefing-font-size'

const COVER_COLORS = ['#956243', '#516b62', '#80617e', '#8b794a', '#536b87', '#8a554f']

function coverColor(filePath: string): string {
  const hash = [...filePath].reduce((total, char) => total + char.charCodeAt(0), 0)
  return COVER_COLORS[hash % COVER_COLORS.length]
}

function groupFileCount(group: WritingWallGroup): number {
  return group.files.length + group.children.reduce((total, child) => total + groupFileCount(child), 0)
}

export function WritingWall({ root, theme = 'academic' }: { root: WritingRoot; theme?: BriefingTheme }) {
  const tree = useStore(state => state.writingTree)
  const writingOrder = useStore(state => state.writingOrder)
  const selectWritingFile = useStore(state => state.selectWritingFile)
  const loadWritingTree = useStore(state => state.loadWritingTree)
  const showToast = useStore(state => state.showToast)
  const writingUISize = useStore(state => state.writingUIFontSize)
  const [sortByRoot, setSortByRoot] = useState<Record<WritingRoot, WritingWallSort>>({ writing: 'default', repository: 'default' })
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [pendingDelete, setPendingDelete] = useState<WritingTreeNode | null>(null)
  const [deleting, setDeleting] = useState(false)
  const sort = sortByRoot[root]
  const groups = useMemo(() => buildWritingWallGroups(tree?.[root] ?? [], sort, writingOrder, root === 'repository'), [tree, root, sort, writingOrder])
  const uiSize = WRITING_UI_STYLES[writingUISize]
  const coverMinWidth = Math.round(150 * Number.parseInt(uiSize, 10) / 12)
  const isAcademic = theme !== 'newspaper'
  const label = root === 'writing' ? '文章' : '仓库'

  const confirmDelete = async () => {
    if (!pendingDelete || deleting) return
    setDeleting(true)
    try {
      const result = await ipc.writingDelete({ path: pendingDelete.path })
      if (!result.ok) {
        showToast(result.message)
        return
      }
      setPendingDelete(null)
      await loadWritingTree()
    } finally {
      setDeleting(false)
    }
  }

  const renderGroup = (group: WritingWallGroup, depth = 0): ReactNode => {
    const defaultCollapsed = depth > 0
    const isCollapsed = collapsed[group.key] ?? defaultCollapsed
    return (
      <AlbumGroupSection
        key={group.key}
        groupKey={group.key}
        testIdPrefix={`writing-wall-${root}`}
        label={group.label}
        count={groupFileCount(group)}
        collapsed={isCollapsed}
        onToggle={() => setCollapsed(current => ({ ...current, [group.key]: !(current[group.key] ?? defaultCollapsed) }))}
      >
        {group.files.length > 0 && (
          <AlbumGrid minWidth={coverMinWidth} testId={`writing-wall-grid-${group.key}`} order={group.files.map(file => file.path).join(',')}>
            {group.files.map(file => {
              const title = displayWritingName(file)
              const extension = file.name.includes('.') ? file.name.split('.').pop()?.toUpperCase() : ''
              return (
                <AlbumCard
                  key={file.path}
                  testId={`writing-wall-card-${file.path}`}
                  title={title}
                  onOpen={() => { void selectWritingFile(file.path) }}
                  className="transition-transform hover:-translate-y-0.5"
                  style={{ background: `linear-gradient(135deg, ${coverColor(file.path)}99, ${coverColor(file.path)}22 58%, #1a120d)` }}
                  fallback={<div className="absolute inset-0 flex items-center justify-center p-5 text-center font-serif text-lg text-white/65">{extension === 'MD' ? label : extension}</div>}
                  cover={file.coverUrl ? <img src={file.coverUrl} alt={`${file.name} 封面`} className="absolute inset-0 h-full w-full object-cover" /> : undefined}
                  footerClassName="p-2.5"
                  titleClassName="line-clamp-2 text-[1em] text-[#f0e2c8]"
                  hoverMeta={typeof file.wordCount === 'number' ? <span data-testid={`writing-wall-word-count-${file.path}`}>{file.wordCount.toLocaleString('zh-CN')} 字</span> : undefined}
                  topLeft={/\.(?:md|html)$/i.test(file.name) ? (
                    <CoverGenerator
                      hasCover={!!file.coverUrl}
                      subject={root === 'writing' ? '文章' : '文档'}
                      testIdPrefix="writing-cover"
                      fillCover
                      className="absolute left-2 top-2 z-20 opacity-0 transition-opacity group-hover:opacity-100"
                      onGenerate={async () => {
                        const result = await ipc.writingGenerateCovers({ path: file.path })
                        if (!result.ok) throw new Error(result.message)
                        return result.value.candidates
                      }}
                      onSave={async design => {
                        const result = await ipc.writingSaveCover({ path: file.path, design })
                        if (!result.ok) throw new Error(result.message)
                        await loadWritingTree()
                      }}
                      onError={showToast}
                    />
                  ) : undefined}
                  topRight={<button
                    type="button"
                    data-testid={`writing-wall-delete-${file.path}`}
                    title="删除文章"
                    aria-label={`删除${title}`}
                    className="absolute right-2 top-2 z-20 rounded bg-black/45 px-1.5 py-0.5 text-xs text-white/80 opacity-0 transition-opacity hover:text-red-300 group-hover:opacity-100"
                    onClick={event => { event.stopPropagation(); setPendingDelete(file) }}
                  >🗑</button>}
                />
              )
            })}
          </AlbumGrid>
        )}
        {group.children.length > 0 && (
          <div className={`ml-3 mt-2 space-y-3 border-l pl-4 ${isAcademic ? 'border-parchment/10' : 'border-[#1a1a1a]/10'}`}>
            {group.children.map(child => renderGroup(child, depth + 1))}
          </div>
        )}
      </AlbumGroupSection>
    )
  }

  return (
    <AlbumWall
      domain={root}
      testId={`writing-wall-${root}`}
      style={{ fontSize: uiSize }}
      className={isAcademic ? 'text-parchment' : 'text-[#1a1a1a]'}
      toolbar={
        <div data-testid={`writing-wall-toolbar-${root}`} className="flex items-center gap-2 pb-5 pr-32">
          <span className="font-serif text-[1.1em]">{label}专辑墙</span>
          <span className="text-[0.833em] opacity-45">{groups.reduce((total, group) => total + groupFileCount(group), 0)} 篇</span>
          <span className="flex-1" />
          <select
            data-testid={`writing-wall-sort-${root}`}
            aria-label="排序专辑"
            value={sort}
            onChange={event => setSortByRoot(current => ({ ...current, [root]: event.target.value as WritingWallSort }))}
            className={`rounded border px-1.5 py-1 text-[0.833em] outline-none ${isAcademic ? 'border-parchment/20 bg-[#2a1f1a] text-parchment/70' : 'border-[#c9c3b8] bg-[#f5f2ed] text-[#2a1f1a]'}`}
          >
            <option value="default">默认顺序</option>
            <option value="modified">最近修改</option>
            <option value="words">按字数</option>
          </select>
        </div>
      }
    >
      {tree === null ? (
        <div className="flex h-[calc(100%-3rem)] items-center justify-center text-[1em] opacity-40">正在整理专辑…</div>
      ) : groups.length === 0 ? (
        <div data-testid={`writing-wall-empty-${root}`} className="flex h-[calc(100%-3rem)] items-center justify-center px-6 text-center text-[1em] opacity-40">
          {root === 'writing' ? '还没有文章，点左侧 ＋ 新建第一篇' : '仓库还空着，点左侧导入或新建'}
        </div>
      ) : (
        <div className="space-y-7">
          {groups.map(group => renderGroup(group))}
        </div>
      )}
      <ConfirmDialog
        open={pendingDelete !== null}
        title="删除"
        icon="trash"
        confirmLabel={deleting ? '删除中…' : '删除'}
        confirmVariant="danger"
        onCancel={() => { if (!deleting) setPendingDelete(null) }}
        onConfirm={() => { void confirmDelete() }}
      >
        <p>确定删除《{pendingDelete ? displayWritingName(pendingDelete) : ''}》？文件将被永久删除，无法恢复。</p>
      </ConfirmDialog>
    </AlbumWall>
  )
}
