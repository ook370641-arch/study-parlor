import { useState, useEffect } from 'react'
import { useStore } from '@/store'
import { ipc } from '@/lib/ipc'
import { sortNodesByOrder, countFiles, displayWritingName, normalizeWritingFileName, diaryPrefillName, sortedInsertIndexForFile, writingErrorText } from '@/lib/writing-tree-utils'
import type { WritingTreeNode, WritingRoot } from '@shared/index'
import { PromptDialog } from './PromptDialog'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { InlineNameInput } from './InlineNameInput'

interface PromptState {
  title: string
  defaultValue?: string
  onSubmit: (value: string) => void
}

function TreeNode({ node, depth, root, parentDir, siblingPaths, theme = 'academic', inlineNew, onStartInlineNew, onInlineNewChange, onInlineNewSubmit, onInlineNewCancel }: {
  node: WritingTreeNode; depth: number; root: WritingRoot; parentDir: string; siblingPaths: string[];
  theme?: 'academic' | 'newspaper'
  inlineNew: { root: WritingRoot; dir: string; value: string; error?: string } | null
  onStartInlineNew: (t: { root: WritingRoot; dir: string; value: string }) => void
  onInlineNewChange: (v: string) => void
  onInlineNewSubmit: (v: string) => void
  onInlineNewCancel: () => void
}) {
  const isAcademic = theme !== 'newspaper'
  const selectedPath = useStore(s => s.writingFile?.path)
  const selectWritingFile = useStore(s => s.selectWritingFile)
  const loadWritingTree = useStore(s => s.loadWritingTree)
  const writingOrder = useStore(s => s.writingOrder)
  const reorderWritingSibling = useStore(s => s.reorderWritingSibling)
  const moveWritingNode = useStore(s => s.moveWritingNode)
  const writingRenamed = useStore(s => s.writingRenamed)

  const [open, setOpen] = useState(depth === 0)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [dropPos, setDropPos] = useState<'before' | 'after' | null>(null)
  const [prompt, setPrompt] = useState<PromptState | null>(null)

  const isSelected = selectedPath === node.path
  const isDir = node.kind === 'dir'

  const handleClick = () => {
    if (editing) return
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

  const doRename = () => {
    closeMenu()
    setPrompt({
      title: '新名称:',
      defaultValue: displayWritingName(node),
      onSubmit: async (newName) => {
        const normalized = normalizeWritingFileName(newName.trim(), node.kind === 'file')
        if (normalized === node.name) return
        const r = await ipc.writingRename({ path: node.path, newName: normalized })
        if (r.ok) writingRenamed(node.path, r.value.path)
        await loadWritingTree()
      },
    })
  }

  const doRenameSubmit = async (value: string) => {
    const normalized = normalizeWritingFileName(value, node.kind === 'file')
    if (normalized === node.name) { setRenameError(''); setEditing(false); return }
    const r = await ipc.writingRename({ path: node.path, newName: normalized })
    if (r.ok) {
      setRenameError('')
      setEditing(false)
      writingRenamed(node.path, r.value.path)
      await loadWritingTree()
    } else {
      setRenameError(writingErrorText(r.code))
    }
  }

  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [editing, setEditing] = useState(false)
  const [renameError, setRenameError] = useState('')
  const doDelete = () => {
    closeMenu()
    setConfirmingDelete(true)
  }

  const doNewFile = () => {
    closeMenu()
    const dir = node.path.slice(root.length + 1)
    const prefill = diaryPrefillName(root, dir, node.children)
    onStartInlineNew({ root, dir, value: prefill })
    if (!open) setOpen(true)
  }

  const doNewFolder = () => {
    closeMenu()
    setPrompt({
      title: '分组名称:',
      onSubmit: async (name) => {
        const dir = node.path.slice(root.length + 1)
        await ipc.writingCreateFolder({ root, dir, name })
        await loadWritingTree()
        if (!open) setOpen(true)
      },
    })
  }

  return (
    <div>
      <div
        data-testid="writing-tree-node"
        className={`group flex items-center gap-1 px-2 py-1 cursor-pointer rounded transition-colors select-none
          ${isSelected
            ? isAcademic ? 'bg-ember/10 text-ember' : 'bg-[#1a1a1a]/10 text-[#1a1a1a]'
            : isAcademic ? 'text-parchment/70 hover:text-parchment hover:bg-parchment/5' : 'text-[#6b5d52] hover:text-[#2a1f1a] hover:bg-black/5'}
          ${dragOver ? 'ring-1 ring-ember/50' : ''}
          ${dropPos === 'before' ? 'border-t-2 border-ember' : ''}
          ${dropPos === 'after' ? 'border-b-2 border-ember' : ''}`}
        style={{ fontSize: 'var(--writing-ui-size)', paddingLeft: `${depth * 16 + 8}px` }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('text/writing-path', node.path)
        }}
        onDragOver={(e) => {
          e.preventDefault()
          const rect = e.currentTarget.getBoundingClientRect()
          const r = (e.clientY - rect.top) / rect.height
          if (isDir && r > 0.25 && r < 0.75) { setDragOver(true); setDropPos(null); return }
          setDragOver(false)
          setDropPos(r < 0.5 ? 'before' : 'after')
        }}
        onDragLeave={() => { setDragOver(false); setDropPos(null) }}
        onDrop={async (e) => {
          e.preventDefault()
          const src = e.dataTransfer.getData('text/writing-path')
          const into = dragOver && isDir && !dropPos
          setDragOver(false); setDropPos(null)
          if (!src || src === node.path) return
          // 禁止把分组拖到自己的后代里(移入自己)
          if (node.path.startsWith(src + '/')) return
          if (into) {
            await moveWritingNode({ src, targetDir: node.path, index: null })
            return
          }
          // 横线落点:同父 = 纯排序;跨父 = move + 定位
          const srcParent = src.includes('/') ? src.slice(0, src.lastIndexOf('/')) : root
          if (srcParent === parentDir) {
            reorderWritingSibling({ dir: parentDir, src, target: node.path, position: dropPos ?? 'after', siblings: siblingPaths })
          } else {
            const base = siblingPaths.filter(p => p !== src)
            const idx = base.indexOf(node.path)
            if (idx === -1) return
            await moveWritingNode({ src, targetDir: parentDir, index: dropPos === 'before' ? idx : idx + 1 })
          }
        }}
      >
        <span className="w-4 text-center shrink-0">{isDir ? (open ? '▾' : '▸') : '·'}</span>
        <div className="min-w-0 flex-1">
          {editing ? (
            <InlineNameInput
              dataTestid="writing-inline-rename"
              defaultValue={displayWritingName(node)}
              theme={theme}
              error={renameError}
              onValueChange={() => setRenameError('')}
              onSubmit={doRenameSubmit}
              onCancel={() => { setRenameError(''); setEditing(false) }}
            />
          ) : (
            <span className="truncate block">{displayWritingName(node)}</span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            data-testid="writing-node-rename"
            data-path={node.path}
            title="重命名"
            className={`px-1 text-xs ${isAcademic ? 'text-parchment/50 hover:text-ember' : 'text-[#6b5d52] hover:text-[#8a3a3a]'}`}
            onClick={(e) => { e.stopPropagation(); setEditing(true) }}
          >
            ✎
          </button>
          {isDir && (
            <button
              data-testid="writing-node-create"
              data-path={node.path}
              title="在此分组新建文章"
              className={`px-1 text-xs ${isAcademic ? 'text-parchment/50 hover:text-ember' : 'text-[#6b5d52] hover:text-[#8a3a3a]'}`}
              onClick={(e) => { e.stopPropagation(); doNewFile() }}
            >
              ＋
            </button>
          )}
          <button
            data-testid="writing-node-delete"
            data-path={node.path}
            title={isDir ? '解散分组' : '删除文章'}
            className={`px-1 text-xs ${isAcademic ? 'text-parchment/50 hover:text-red-400' : 'text-[#6b5d52] hover:text-red-600'}`}
            onClick={(e) => { e.stopPropagation(); setConfirmingDelete(true) }}
          >
            🗑
          </button>
        </div>
      </div>

      {isDir && open && (() => {
        const children = node.children ?? []
        const sorted = sortNodesByOrder(children, writingOrder[node.path])
        const here = inlineNew != null && inlineNew.root === root && inlineNew.dir === node.path.slice(root.length + 1)
        const renderChild = (child: WritingTreeNode) => (
          <TreeNode key={child.path} node={child} depth={depth + 1} root={root} parentDir={node.path} siblingPaths={sorted.map(n => n.path)} theme={theme}
            inlineNew={inlineNew} onStartInlineNew={onStartInlineNew} onInlineNewChange={onInlineNewChange} onInlineNewSubmit={onInlineNewSubmit} onInlineNewCancel={onInlineNewCancel} />
        )
        if (!here) return sorted.map(renderChild)
        const idx = sortedInsertIndexForFile(children, writingOrder[node.path], inlineNew.value)
        return (
          <>
            {sorted.slice(0, idx).map(renderChild)}
            <InlineNameInput
              key="__inline_new__"
              dataTestid="writing-inline-new"
              defaultValue={inlineNew.value}
              theme={theme}
              error={inlineNew.error}
              onValueChange={onInlineNewChange}
              onSubmit={onInlineNewSubmit}
              onCancel={onInlineNewCancel}
            />
            {sorted.slice(idx).map(renderChild)}
          </>
        )
      })()}

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
          {parentDir !== root && (
            <button
              className="block w-full text-left px-3 py-1.5 hover:bg-parchment/10 text-parchment/80"
              onClick={() => { closeMenu(); void moveWritingNode({ src: node.path, targetDir: root, index: null }) }}
            >
              移出分组
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
            {isDir ? '解散分组' : '删除'}
          </button>
        </div>
      )}

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

      <ConfirmDialog
        open={confirmingDelete}
        title={isDir ? '解散分组' : '删除'}
        icon="trash"
        confirmLabel="删除"
        confirmVariant="danger"
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={() => {
          setConfirmingDelete(false)
          void (async () => {
            const r = await ipc.writingDelete({ path: node.path })
            if (r.ok) await loadWritingTree()
          })()
        }}
      >
        {isDir ? (
          <p>确定解散分组「{node.name}」？组内 {countFiles(node.children)} 篇文章将移回上一级，不会被删除。</p>
        ) : (
          <p>确定删除《{displayWritingName(node)}》？文件将被永久删除，无法恢复。</p>
        )}
      </ConfirmDialog>
    </div>
  )
}

export function WritingTree({ root, theme = 'academic', inlineNew, onStartInlineNew, onInlineNewChange, onInlineNewSubmit, onInlineNewCancel }: {
  root: WritingRoot; theme?: 'academic' | 'newspaper'
  inlineNew: { root: WritingRoot; dir: string; value: string; error?: string } | null
  onStartInlineNew: (t: { root: WritingRoot; dir: string; value: string }) => void
  onInlineNewChange: (v: string) => void
  onInlineNewSubmit: (v: string) => void
  onInlineNewCancel: () => void
}) {
  const isAcademic = theme !== 'newspaper'
  const tree = useStore(s => s.writingTree)
  const writingOrder = useStore(s => s.writingOrder)
  const moveWritingNode = useStore(s => s.moveWritingNode)
  const [endDrop, setEndDrop] = useState(false)
  const nodes = tree?.[root] ?? []
  const sorted = sortNodesByOrder(nodes, writingOrder[root])
  const here = inlineNew != null && inlineNew.root === root && inlineNew.dir === ''

  const renderChild = (n: WritingTreeNode) => (
    <TreeNode key={n.path} node={n} depth={0} root={root} parentDir={root} siblingPaths={sorted.map(x => x.path)} theme={theme}
      inlineNew={inlineNew} onStartInlineNew={onStartInlineNew} onInlineNewChange={onInlineNewChange} onInlineNewSubmit={onInlineNewSubmit} onInlineNewCancel={onInlineNewCancel} />
  )

  if (here) {
    const idx = sortedInsertIndexForFile(nodes, writingOrder[root], inlineNew.value)
    return (
      <div className="py-1 min-h-[120px]">
        {sorted.slice(0, idx).map(renderChild)}
        <InlineNameInput
          key="__inline_new__"
          dataTestid="writing-inline-new"
          defaultValue={inlineNew.value}
          theme={theme}
          error={inlineNew.error}
          onValueChange={onInlineNewChange}
          onSubmit={onInlineNewSubmit}
          onCancel={onInlineNewCancel}
        />
        {sorted.slice(idx).map(renderChild)}
      </div>
    )
  }

  if (sorted.length === 0) {
    return (
      <div className={`px-3 py-4 text-xs text-center ${isAcademic ? 'text-parchment/40' : 'text-[#6b5d52]/60'}`}>
        {root === 'writing' ? '还没有文章，点击上方 ＋ 新建' : '还没有导入文件，点击上方 ⬆ 导入'}
      </div>
    )
  }

  return (
    <div
      className="py-1 min-h-[120px]"
      onDragOver={(e) => { if (e.target !== e.currentTarget) return; e.preventDefault(); setEndDrop(true) }}
      onDragLeave={(e) => { if (e.target === e.currentTarget) setEndDrop(false) }}
      onDrop={async (e) => {
        if (e.target !== e.currentTarget) return
        e.preventDefault()
        setEndDrop(false)
        const src = e.dataTransfer.getData('text/writing-path')
        if (!src) return
        const srcParent = src.includes('/') ? src.slice(0, src.lastIndexOf('/')) : root
        if (srcParent === root) return // 已在根级,纯末尾排序意义低,忽略
        await moveWritingNode({ src, targetDir: root, index: null })
      }}
    >
      {sorted.map(renderChild)}
      {endDrop && <div data-testid="writing-drop-line" className="mx-2 border-t-2 border-ember pointer-events-none" />}
    </div>
  )
}
