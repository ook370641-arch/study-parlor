import { useEffect, useState } from 'react'
import { useStore } from '@/store'
import { ipc } from '@/lib/ipc'
import { writingTreeContainsPath } from '@/lib/writing-tree-utils'
import { WritingTree } from './WritingTree'
import { PromptDialog } from './PromptDialog'

interface PromptState {
  title: string
  defaultValue?: string
  onSubmit: (value: string) => void
}

export function WritingListColumn() {
  const tab = useStore(s => s.writingListTab)
  const setTab = useStore(s => s.setWritingListTab)
  const loadWritingTree = useStore(s => s.loadWritingTree)
  const selectWritingFile = useStore(s => s.selectWritingFile)
  const tree = useStore(s => s.writingTree)

  const [prompt, setPrompt] = useState<PromptState | null>(null)

  useEffect(() => { loadWritingTree() }, [loadWritingTree])

  // Re-scan on tab switch to pick up externally-added files
  useEffect(() => { loadWritingTree() }, [tab, loadWritingTree])

  // 只在「没有选中文件」或「当前文件已不在树里」（被外部删除）时自动选中第一篇。
  // 否则新建文章后的 tree 刷新会把编辑器从新文件抢走（时序竞争）。
  useEffect(() => {
    const current = useStore.getState().writingFile
    if (current && writingTreeContainsPath(tree, current.path)) return
    if (tree?.writing?.[0]) {
      const first = tree.writing[0]
      if (first.kind === 'file') {
        selectWritingFile(first.path)
      } else if (first.children?.[0]?.kind === 'file') {
        selectWritingFile(first.children[0].path)
      }
    }
  }, [tree, selectWritingFile])

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
    <div className="flex flex-col h-full">
      <div className="flex border-b border-parchment/15 text-xs shrink-0">
        {(['articles', 'repository'] as const).map(t => (
          <button
            key={t}
            data-testid={t === 'articles' ? 'writing-list-tab-articles' : 'writing-list-tab-repository'}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 transition-colors ${tab === t ? 'text-ember border-b-2 border-ember' : 'text-parchment/50 hover:text-parchment/70'}`}
          >
            {t === 'articles' ? '文章' : 'repository'}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        {tab === 'articles' ? (
          <div>
            <div className="p-2 flex gap-2 text-xs">
              <button data-testid="writing-new-file" className="text-ember hover:text-ember/80" onClick={handleCreateFile}>＋ 新建文章</button>
              <button data-testid="writing-new-folder" className="text-parchment/60 hover:text-parchment/80" onClick={handleCreateFolder}>新建分组</button>
            </div>
            <WritingTree root="writing" />
          </div>
        ) : (
          <div>
            <div className="p-2 flex gap-2 text-xs">
              <button data-testid="writing-import-files" className="text-ember hover:text-ember/80" onClick={handleImportFiles}>⬆ 导入文件…</button>
              <button data-testid="writing-repo-new-folder" className="text-parchment/60 hover:text-parchment/80" onClick={handleCreateRepoFolder}>新建分组</button>
            </div>
            <WritingTree root="repository" />
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
