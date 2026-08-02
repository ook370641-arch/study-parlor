import { useEffect, useState } from 'react'
import { useStore } from '@/store'
import { ipc } from '@/lib/ipc'
import { writingTreeContainsPath, countFiles, firstWritingFilePath } from '@/lib/writing-tree-utils'
import { WRITING_UI_STYLES } from '@/lib/briefing-font-size'
import { WritingTree } from './WritingTree'
import { PromptDialog } from './PromptDialog'

interface PromptState {
  title: string
  defaultValue?: string
  onSubmit: (value: string) => void
}

export function WritingListColumn({ theme = 'academic', collapsed }: { theme?: 'academic' | 'newspaper'; collapsed?: boolean }) {
  const isAcademic = theme !== 'newspaper'
  const tab = useStore(s => s.writingListTab)
  const setTab = useStore(s => s.setWritingListTab)
  const loadWritingTree = useStore(s => s.loadWritingTree)
  const selectWritingFile = useStore(s => s.selectWritingFile)
  const tree = useStore(s => s.writingTree)
  const writingUISize = useStore(s => s.writingUIFontSize)

  const dim = isAcademic ? 'text-parchment/60 hover:text-parchment/80' : 'text-[#6b5d52] hover:text-[#2a1f1a]'
  const tabIdle = isAcademic ? 'text-parchment/50 hover:text-parchment/70' : 'text-[#6b5d52]/70 hover:text-[#6b5d52]'
  const borderCol = isAcademic ? 'border-parchment/15' : 'border-[#c9c3b8]'

  const [prompt, setPrompt] = useState<PromptState | null>(null)

  useEffect(() => { loadWritingTree() }, [loadWritingTree])

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
          recentFiles.push({ name: n.name, path: n.path })
        } else if (n.children) {
          for (const c of n.children) {
            if (c.kind === 'file') recentFiles.push({ name: c.name, path: c.path })
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
    setPrompt({
      title: '文章名称:',
      onSubmit: async (name) => {
        const r = await ipc.writingCreateFile({ root: 'writing', dir: '', name })
        if (r.ok) {
          await loadWritingTree()
          selectWritingFile(r.value.path)
        }
      },
    })
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
              <button data-testid="writing-new-file" className={isAcademic ? 'text-ember hover:text-ember/80' : 'text-[#8a3a3a] hover:text-[#6a2a2a]'} onClick={handleCreateFile} style={{ fontSize: 'var(--writing-ui-size)' }}>＋ 新建文章</button>
              <button data-testid="writing-new-folder" className={dim} onClick={handleCreateFolder} style={{ fontSize: 'var(--writing-ui-size)' }}>新建分组</button>
            </div>
            <WritingTree root="writing" theme={theme} />
          </div>
        ) : (
          <div>
            <div className="p-2 flex gap-2 text-xs">
              <button data-testid="writing-import-files" className={isAcademic ? 'text-ember hover:text-ember/80' : 'text-[#8a3a3a] hover:text-[#6a2a2a]'} onClick={handleImportFiles} style={{ fontSize: 'var(--writing-ui-size)' }}>⬆ 导入文件…</button>
              <button data-testid="writing-repo-new-folder" className={dim} onClick={handleCreateRepoFolder} style={{ fontSize: 'var(--writing-ui-size)' }}>新建分组</button>
            </div>
            <WritingTree root="repository" theme={theme} />
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
