import { useEffect } from 'react'
import { useStore } from '@/store'
import { ipc } from '@/lib/ipc'

export function WritingListColumn() {
  const tab = useStore(s => s.writingListTab)
  const setTab = useStore(s => s.setWritingListTab)
  const loadWritingTree = useStore(s => s.loadWritingTree)
  const selectWritingFile = useStore(s => s.selectWritingFile)
  const tree = useStore(s => s.writingTree)

  useEffect(() => { loadWritingTree() }, [loadWritingTree])

  useEffect(() => {
    if (tree?.writing?.[0]) {
      const first = tree.writing[0]
      if (first.kind === 'file') {
        selectWritingFile(first.path)
      } else if (first.children?.[0]?.kind === 'file') {
        selectWritingFile(first.children[0].path)
      }
    }
  }, [tree, selectWritingFile])

  const handleCreateFile = async () => {
    const r = await ipc.writingCreateFile({ root: 'writing', dir: '', name: '新文章.md' })
    if (r.ok) {
      await loadWritingTree()
      selectWritingFile(r.value.path)
    }
  }

  const handleCreateFolder = async () => {
    const r = await ipc.writingCreateFolder({ root: 'writing', dir: '', name: '新分组' })
    if (r.ok) await loadWritingTree()
  }

  const handleImportFiles = async () => {
    const r = await ipc.writingImportFiles({ targetDir: '' })
    if (r.ok) await loadWritingTree()
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b border-parchment/15 text-xs shrink-0">
        {(['articles', 'repository'] as const).map(t => (
          <button
            key={t}
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
              <button className="text-ember hover:text-ember/80" onClick={handleCreateFile}>＋ 新建文章</button>
              <button className="text-parchment/60 hover:text-parchment/80" onClick={handleCreateFolder}>🗀 新建分组</button>
            </div>
            <div className="px-3 py-2 text-xs text-parchment/40">树组件将在 Task 6 实现</div>
          </div>
        ) : (
          <div>
            <div className="p-2">
              <button className="text-xs text-ember hover:text-ember/80" onClick={handleImportFiles}>⬆ 导入文件…</button>
            </div>
            <div className="px-3 py-2 text-xs text-parchment/40">repository 树将在 Task 6 实现</div>
          </div>
        )}
      </div>
    </div>
  )
}
