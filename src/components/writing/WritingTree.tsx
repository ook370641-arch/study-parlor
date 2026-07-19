import { useState, useEffect } from 'react'
import { useStore } from '@/store'
import { ipc } from '@/lib/ipc'
import type { WritingTreeNode, WritingRoot } from '@shared/index'

function TreeNode({ node, depth, root }: { node: WritingTreeNode; depth: number; root: WritingRoot }) {
  const selectedPath = useStore(s => s.writingFile?.path)
  const selectWritingFile = useStore(s => s.selectWritingFile)
  const loadWritingTree = useStore(s => s.loadWritingTree)

  const [open, setOpen] = useState(depth === 0)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const isSelected = selectedPath === node.path
  const isDir = node.kind === 'dir'

  const handleClick = () => {
    if (isDir) { setOpen(!open); return }
    selectWritingFile(node.path)
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY })
  }

  // Close menu on outside click
  useEffect(() => {
    if (!menu) return
    const h = () => setMenu(null)
    document.addEventListener('click', h)
    return () => document.removeEventListener('click', h)
  }, [menu])

  const closeMenu = () => setMenu(null)

  const doRename = async () => {
    closeMenu()
    const newName = window.prompt('新名称:', node.name)
    if (!newName || newName === node.name) return
    await ipc.writingRename({ path: node.path, newName })
    await loadWritingTree()
  }

  const doDelete = async () => {
    closeMenu()
    if (!window.confirm(`确定删除「${node.name}」？此操作不可撤销。`)) return
    const r = await ipc.writingDelete({ path: node.path })
    if (r.ok) await loadWritingTree()
  }

  const doNewFile = async () => {
    closeMenu()
    const name = window.prompt('文章名称:')
    if (!name) return
    await ipc.writingCreateFile({ root, dir: node.path, name })
    await loadWritingTree()
    // Auto-expand to show new child
    if (!open) setOpen(true)
  }

  const doNewFolder = async () => {
    closeMenu()
    const name = window.prompt('分组名称:')
    if (!name) return
    await ipc.writingCreateFolder({ root, dir: node.path, name })
    await loadWritingTree()
    if (!open) setOpen(true)
  }

  return (
    <div>
      <div
        data-testid="writing-tree-node"
        className={`flex items-center gap-1 px-2 py-1 cursor-pointer text-xs rounded transition-colors select-none
          ${isSelected ? 'bg-ember/10 text-ember' : 'text-parchment/70 hover:text-parchment hover:bg-parchment/5'}
          ${dragOver ? 'ring-1 ring-ember/50' : ''}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('text/writing-path', node.path)
        }}
        onDragOver={(e) => {
          if (isDir) {
            e.preventDefault()
            setDragOver(true)
          }
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={async (e) => {
          e.preventDefault()
          setDragOver(false)
          const src = e.dataTransfer.getData('text/writing-path')
          if (src && src !== node.path) {
            await ipc.writingMove({ path: src, targetDir: node.path })
            await loadWritingTree()
          }
        }}
      >
        <span className="w-4 text-center shrink-0">{isDir ? (open ? '▾' : '▸') : '·'}</span>
        <span className="truncate">{node.name}</span>
      </div>

      {isDir && open && node.children?.map(child => (
        <TreeNode key={child.path} node={child} depth={depth + 1} root={root} />
      ))}

      {/* Context menu */}
      {menu && (
        <div
          className="fixed z-50 bg-ink border border-parchment/20 rounded shadow-lg py-1 text-xs"
          style={{ left: menu.x, top: menu.y }}
        >
          {isDir && (
            <button
              className="block w-full text-left px-3 py-1.5 hover:bg-parchment/10 text-parchment/80"
              onClick={doNewFile}
            >
              ＋ 新建文章
            </button>
          )}
          {isDir && (
            <button
              className="block w-full text-left px-3 py-1.5 hover:bg-parchment/10 text-parchment/80"
              onClick={doNewFolder}
            >
              新建子分组
            </button>
          )}
          <button
            className="block w-full text-left px-3 py-1.5 hover:bg-parchment/10 text-parchment/80"
            onClick={doRename}
          >
            重命名
          </button>
          <button
            className="block w-full text-left px-3 py-1.5 hover:bg-parchment/10 text-red-400"
            onClick={doDelete}
          >
            删除
          </button>
        </div>
      )}
    </div>
  )
}

export function WritingTree({ root }: { root: WritingRoot }) {
  const tree = useStore(s => s.writingTree)
  const nodes = tree?.[root] ?? []

  if (nodes.length === 0) {
    return (
      <div className="px-3 py-4 text-xs text-parchment/40 text-center">
        {root === 'writing' ? '还没有文章，点击上方 ＋ 新建' : '还没有导入文件，点击上方 ⬆ 导入'}
      </div>
    )
  }

  return (
    <div className="py-1">
      {nodes.map(n => (
        <TreeNode key={n.path} node={n} depth={0} root={root} />
      ))}
    </div>
  )
}
