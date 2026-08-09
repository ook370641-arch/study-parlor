import { useEffect, useState } from 'react'
import { useStore } from '@/store'
import { ipc } from '@/lib/ipc'
import { writingTreeContainsPath, countFiles, firstWritingFilePath, displayWritingName, writingErrorText } from '@/lib/writing-tree-utils'
import { WRITING_UI_STYLES } from '@/lib/briefing-font-size'
import { WritingTree } from './WritingTree'
import { PromptDialog } from './PromptDialog'
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

  const dim = isAcademic ? 'text-parchment/60 hover:text-parchment/80' : 'text-[#6b5d52] hover:text-[#2a1f1a]'
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
    } else {
      setInlineNew({ ...inlineNew, value: name, error: writingErrorText(r.code) })
    }
  }
  const cancelInlineNew = () => setInlineNew(null)

  useEffect(() => {
    loadWritingTree()
    // 摘要第二触发时机：tree 加载时刷新 catalog（稳态 diff 为空，无多余 LLM 调用）
    void ipc.writingRefreshCatalog()
  }, [loadWritingTree])

  // Re-scan on tab switch to pick up externally-added files
  useEffect(() => { loadWritingTree() }, [tab, loadWritingTree])

  // 只在「没有选中文件」或「当前文件已不在树里」（被外部删除）时自动选中第一篇。
  // 否则新建文章后的 tree 刷新会把编辑器从新文件抢走（时序竞争）。
  useEffect(() => {
    const current = useStore.getState().writingFile
    if (current && writingTreeContainsPath(tree, current.path)) return
    const first = tree ? firstWritingFilePath(tree.writing) : null
    if (first) selectWritingFile(first)
  }, [tree, selectWritingFile])

  if (collapsed) {
    // Collect up to 3 recent file names for mini-navigation
    const recentFiles: { name: string; path: string }[] = []
    const collect = (nodes: typeof tree) => {
      if (!nodes) return
      for (const n of nodes.writing ?? []) {
        if (n.kind === 'file') {
          recentFiles.push({ name: displayWritingName(n), path: n.path })
        } else if (n.children) {
          for (const c of n.children) {
            if (c.kind === 'file') recentFiles.push({ name: displayWritingName(c), path: c.path })
            if (recentFiles.length >= 3) return
          }
        }
        if (recentFiles.length >= 3) return
      }
    }
    collect(tree)

    return (
      <div className="flex flex-col items-center py-3 gap-3 h-full">
        <span className={dim} style={{ writingMode: 'vertical-rl' }}>文章</span>
        <span data-testid="writing-collapsed-articles-count" className="min-w-[18px] px-1 py-0.5 rounded-full text-[10px] text-center bg-ember text-white">
          {countFiles(tree?.writing)}
        </span>
        {recentFiles.map((f, i) => (
          <button
            key={i}
            data-testid={`writing-collapsed-recent-${i}`}
            onClick={() => selectWritingFile(f.path)}
            className={`text-[10px] truncate max-w-[40px] ${isAcademic ? 'text-parchment/40 hover:text-parchment/70' : 'text-[#6b5d52]/50 hover:text-[#6b5d52]'}`}
            style={{ writingMode: 'vertical-rl' }}
            title={f.name}
          >{f.name.length > 6 ? f.name.slice(0, 6) + '…' : f.name}</button>
        ))}
        <div className="flex-1" />
        <span className={dim} style={{ writingMode: 'vertical-rl' }}>仓库</span>
        <span data-testid="writing-collapsed-repository-count" className={`min-w-[18px] px-1 py-0.5 rounded-full text-[10px] text-center ${isAcademic ? 'bg-parchment/20 text-parchment' : 'bg-[#1a1a1a] text-white'}`}>
          {countFiles(tree?.repository)}
        </span>
      </div>
    )
  }

  const handleCreateFile = () => {
    startInlineNew({ root: 'writing', dir: '', value: '' })
  }

  const handleCreateFolder = () => {
    setPrompt({
      title: '分组名称:',
      onSubmit: async (name) => {
        const r = await ipc.writingCreateFolder({ root: 'writing', dir: '', name })
        if (r.ok) await loadWritingTree()
      },
    })
  }

  const handleCreateRepoFolder = () => {
    setPrompt({
      title: '分组名称:',
      onSubmit: async (name) => {
        const r = await ipc.writingCreateFolder({ root: 'repository', dir: '', name })
        if (r.ok) await loadWritingTree()
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
        {(['articles', 'repository'] as const).map(t => (
          <button
            key={t}
            role="tab"
            aria-pressed={tab === t}
            data-testid={t === 'articles' ? 'writing-list-tab-articles' : 'writing-list-tab-repository'}
            onClick={() => setTab(t)}
            className={`flex-1 py-1.5 transition-colors ${
              tab === t
                ? isAcademic ? 'bg-ember/20 text-ember' : 'bg-[#1a1a1a] text-white'
                : tabIdle
            }`}
            style={{ fontSize: 'var(--writing-ui-size)' }}
          >
            {t === 'articles' ? '文章' : '仓库'}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        {tab === 'articles' ? (
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
