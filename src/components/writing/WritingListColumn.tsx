import { useEffect, useState } from 'react'
import { useStore } from '@/store'
import { ipc } from '@/lib/ipc'
import { writingTreeContainsPath, firstWritingFilePath, writingErrorText, writingRootOf } from '@/lib/writing-tree-utils'
import { WRITING_UI_STYLES } from '@/lib/briefing-font-size'
import { WritingTree } from './WritingTree'
import { PromptDialog } from './PromptDialog'
import { NotesShelf } from '../notes/NotesShelf'
import type { WritingRoot, WritingTreeNode } from '@shared/index'

interface PromptState {
  title: string
  defaultValue?: string
  onSubmit: (value: string) => void
}

/** 收集节点树中所有 file 节点的 path（用于仓库重新扫描前后对比）。 */
function collectWritingPaths(nodes: WritingTreeNode[] | undefined): string[] {
  if (!nodes) return []
  const out: string[] = []
  const walk = (ns: WritingTreeNode[]) => {
    for (const n of ns) {
      if (n.kind === 'file') out.push(n.path)
      else walk(n.children ?? [])
    }
  }
  walk(nodes)
  return out
}

export function WritingListColumn({ theme = 'academic', collapsed }: { theme?: 'academic' | 'newspaper'; collapsed?: boolean }) {
  const isAcademic = theme !== 'newspaper'
  const tab = useStore(s => s.writingListTab)
  const setTab = useStore(s => s.setWritingListTab)
  const loadWritingTree = useStore(s => s.loadWritingTree)
  const selectWritingFile = useStore(s => s.selectWritingFile)
  const tree = useStore(s => s.writingTree)
  const writingUISize = useStore(s => s.writingUIFontSize)
  const showToast = useStore(s => s.showToast)
  const appendWritingOrder = useStore(s => s.appendWritingOrder)

  const tabIdle = isAcademic ? 'text-parchment/50 hover:text-parchment/70' : 'text-[#6b5d52]/70 hover:text-[#6b5d52]'
  const borderCol = isAcademic ? 'border-parchment/15' : 'border-[#c9c3b8]'
  const primaryAction = isAcademic ? 'text-ember hover:text-ember/80' : 'text-[#8a3a3a] hover:text-[#6a2a2a]'
  const secondaryAction = isAcademic ? 'text-parchment/50 hover:text-ember' : 'text-[#6b5d52] hover:text-[#8a3a3a]'

  const [prompt, setPrompt] = useState<PromptState | null>(null)
  const [scanning, setScanning] = useState(false)

  const [inlineNew, setInlineNew] = useState<{ root: WritingRoot; dir: string; value: string; error?: string } | null>(null)

  const startInlineNew = (target: { root: WritingRoot; dir: string; value: string }) => setInlineNew({ ...target })
  const changeInlineNew = (value: string) => setInlineNew(s => (s ? { ...s, value } : s))
  const submitInlineNew = async (name: string) => {
    if (!inlineNew) return
    const r = await ipc.writingCreateFile({ root: inlineNew.root, dir: inlineNew.dir, name })
    if (r.ok) {
      setInlineNew(null)
      await loadWritingTree()
      void selectWritingFile(r.value.path)
      const dirKey = inlineNew.dir ? `${inlineNew.root}/${inlineNew.dir}` : inlineNew.root
      appendWritingOrder(dirKey, r.value.path)
    } else {
      setInlineNew({ ...inlineNew, value: name, error: writingErrorText(r.code) })
    }
  }
  const cancelInlineNew = () => setInlineNew(null)

  // 挂载时触发一次摘要 catalog 刷新（稳态 diff 为空，无多余 LLM 调用）
  useEffect(() => { void ipc.writingRefreshCatalog() }, [])

  // 挂载 + 切 tab 时重扫，拾取外部新增文件（两时机合并为一个 effect，避免进页面扫两遍）
  useEffect(() => { loadWritingTree() }, [tab, loadWritingTree])

  // 只在「没有选中文件」或「当前文件已不在树里」（被外部删除）时自动选中。
  // 优先恢复上次打开的文件(lastWritingFile,跨重启持久化,2026-09-22 用户反馈),
  // 不在树里(被外部删除)回退第一篇。否则新建文章后的 tree 刷新会把编辑器抢走。
  useEffect(() => {
    if (useStore.getState().writingListTab === 'notes') return
    const current = useStore.getState().writingFile
    if (current && writingTreeContainsPath(tree, current.path)) return
    const last = useStore.getState().lastWritingFile
    // 根守卫：lastWritingFile 可能是笔记路径（notes/），文章/仓库 tab 下不恢复
    if (last && writingRootOf(last) !== 'notes' && writingTreeContainsPath(tree, last)) { selectWritingFile(last); return }
    const first = tree ? firstWritingFilePath(tree.writing) : null
    if (first) selectWritingFile(first)
  }, [tree, selectWritingFile])

  // 收起即空（2026-10-22 用户反馈：w-14 窄栏里塞竖排文字+计数很怪）；
  // 博客栏的缩略图 rail 是另一套，互不影响。
  if (collapsed) {
    return <div data-testid="writing-list-collapsed-empty" className="h-full" />
  }

  const handleCreateFile = () => {
    startInlineNew({ root: 'writing', dir: '', value: '' })
  }

  const handleCreateFolder = () => {
    setPrompt({
      title: '分组名称:',
      onSubmit: async (name) => {
        const r = await ipc.writingCreateFolder({ root: 'writing', dir: '', name })
        if (r.ok) {
          await loadWritingTree()
          appendWritingOrder('writing', `writing/${name}`)
        }
      },
    })
  }

  const handleCreateRepoFolder = () => {
    setPrompt({
      title: '分组名称:',
      onSubmit: async (name) => {
        const r = await ipc.writingCreateFolder({ root: 'repository', dir: '', name })
        if (r.ok) {
          await loadWritingTree()
          appendWritingOrder('repository', `repository/${name}`)
        }
      },
    })
  }

  const handleImportFiles = async () => {
    const r = await ipc.writingImportFiles({ targetDir: 'repository' })
    if (r.ok) await loadWritingTree()
  }

  const handleRefreshRepo = async () => {
    const before = new Set(collectWritingPaths(useStore.getState().writingTree?.repository))
    setScanning(true)
    try {
      await loadWritingTree()
      void ipc.writingRefreshCatalog()
      const after = collectWritingPaths(useStore.getState().writingTree?.repository)
      const added = after.filter(p => !before.has(p))
      showToast(added.length > 0 ? `已扫描，新增 ${added.length} 篇` : '已扫描，没有新文件')
    } finally {
      setScanning(false)
    }
  }

  return (
    <div className="flex flex-col h-full" style={{ ['--writing-ui-size' as string]: WRITING_UI_STYLES[writingUISize] }}>
      <div className={`flex m-2 rounded-lg border ${borderCol} text-xs shrink-0 overflow-hidden`} role="tablist">
        {(['articles', 'repository', 'notes'] as const).map(t => (
          <button
            key={t}
            role="tab"
            aria-pressed={tab === t}
            data-testid={`writing-list-tab-${t}`}
            onClick={() => setTab(t)}
            className={`flex-1 py-1.5 transition-colors ${
              tab === t
                ? isAcademic ? 'bg-ember/20 text-ember' : 'bg-[#1a1a1a] text-white'
                : tabIdle
            }`}
            style={{ fontSize: 'var(--writing-ui-size)' }}
          >
            {t === 'articles' ? '文章' : t === 'repository' ? '仓库' : '笔记'}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        {tab === 'notes' ? (
          <NotesShelf theme={theme} />
        ) : tab === 'articles' ? (
          <div>
            <div className="p-2 flex gap-2 text-xs">
              <button data-testid="writing-new-file" title="新建文章" aria-label="新建文章" className={`px-1 text-xs ${primaryAction}`} onClick={handleCreateFile} style={{ fontSize: 'var(--writing-ui-size)' }}>＋</button>
              <button data-testid="writing-new-folder" title="新建分组" aria-label="新建分组" className={`px-1 text-xs ${secondaryAction}`} onClick={handleCreateFolder} style={{ fontSize: 'var(--writing-ui-size)' }}>🗀</button>
            </div>
            <WritingTree
              root="writing"
              theme={theme}
              inlineNew={inlineNew}
              onStartInlineNew={startInlineNew}
              onInlineNewChange={changeInlineNew}
              onInlineNewSubmit={submitInlineNew}
              onInlineNewCancel={cancelInlineNew}
            />
          </div>
        ) : (
          <div>
            <div className="p-2 flex gap-2 text-xs">
              <button data-testid="writing-repo-new-file" title="新建文章" aria-label="新建文章" className={`px-1 text-xs ${primaryAction}`} onClick={() => startInlineNew({ root: 'repository', dir: '', value: '' })} style={{ fontSize: 'var(--writing-ui-size)' }}>＋</button>
              <button data-testid="writing-import-files" title="导入文件…" aria-label="导入文件…" className={`px-1 text-xs ${primaryAction}`} onClick={handleImportFiles} style={{ fontSize: 'var(--writing-ui-size)' }}>⬆</button>
              <button data-testid="writing-repo-new-folder" title="新建分组" aria-label="新建分组" className={`px-1 text-xs ${secondaryAction}`} onClick={handleCreateRepoFolder} style={{ fontSize: 'var(--writing-ui-size)' }}>🗀</button>
              <button data-testid="writing-repo-refresh" title="重新扫描仓库（外部移入的文件）" aria-label="重新扫描仓库（外部移入的文件）" disabled={scanning} onClick={handleRefreshRepo} className={`px-1 text-xs ${scanning ? 'opacity-40 cursor-wait' : ''} ${secondaryAction}`} style={{ fontSize: 'var(--writing-ui-size)' }}>⟳</button>
            </div>
            <WritingTree
              root="repository"
              theme={theme}
              inlineNew={inlineNew}
              onStartInlineNew={startInlineNew}
              onInlineNewChange={changeInlineNew}
              onInlineNewSubmit={submitInlineNew}
              onInlineNewCancel={cancelInlineNew}
            />
          </div>
        )}
      </div>
      {prompt && (
        <PromptDialog
          title={prompt.title}
          defaultValue={prompt.defaultValue}
          onSubmit={(value) => {
            setPrompt(null)
            prompt.onSubmit(value)
          }}
          onCancel={() => setPrompt(null)}
        />
      )}
    </div>
  )
}
