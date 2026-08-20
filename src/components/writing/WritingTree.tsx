import { useState } from 'react'
import { useStore } from '@/store'
import { ipc } from '@/lib/ipc'
import { sortNodesByOrder, countFiles, displayWritingName, normalizeWritingFileName, normalizeWritingFileRename, writingPreviewKindOf, diaryPrefillName, sortedInsertIndexForFile, writingErrorText } from '@/lib/writing-tree-utils'
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
  const panelMode = useStore(s => s.writingPanelMode)
  const assistantOpen = useStore(s => s.writingAssistantOpen)
  const companionPath = useStore(s => s.companionFile?.path)
  const selectCompanionFile = useStore(s => s.selectCompanionFile)
  const loadWritingTree = useStore(s => s.loadWritingTree)
  const writingOrder = useStore(s => s.writingOrder)
  const reorderWritingSibling = useStore(s => s.reorderWritingSibling)
  const moveWritingNode = useStore(s => s.moveWritingNode)
  const writingRenamed = useStore(s => s.writingRenamed)

  const [dragOver, setDragOver] = useState(false)
  const [dropPos, setDropPos] = useState<'before' | 'after' | null>(null)
  const [prompt, setPrompt] = useState<PromptState | null>(null)

  const isSelected = selectedPath === node.path
  // 对照文高亮仅在「对照模式 + 右栏展开」时显示：切助手模式/折叠右栏/对照槽清空时都不高亮，
  // 避免 companionFile 残留导致灰色框「长存」。
  const isCompanion = assistantOpen && panelMode === 'companion' && companionPath === node.path && !isSelected
  const isDir = node.kind === 'dir'

  // 展开/收起持久化：显式记录优先；无记录时默认——writing 顶层展开、其余收起（仓库默认全收起）
  const expanded = useStore(s => s.writingExpandedGroups)
  const setWritingGroupExpanded = useStore(s => s.setWritingGroupExpanded)
  const appendWritingOrder = useStore(s => s.appendWritingOrder)
  const open = isDir ? (expanded[node.path] ?? (root === 'writing' && depth === 0)) : false

  const handleClick = () => {
    if (editing) return
    if (isDir) { setWritingGroupExpanded(node.path, !open); return }
    // 左键情境化：右栏展开且处于对照 tab → 切换对照文；否则切主文（现状）
    if (assistantOpen && panelMode === 'companion') selectCompanionFile(node.path)
    else selectWritingFile(node.path)
  }

  const doRenameSubmit = async (value: string) => {
    const normalized = normalizeRenameForNode(value, node)
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
  const doNewFile = () => {
    const dir = node.path.slice(root.length + 1)
    const prefill = diaryPrefillName(root, dir, node.children)
    onStartInlineNew({ root, dir, value: prefill })
    if (!open) setWritingGroupExpanded(node.path, true)
  }

  const doNewFolder = () => {
    setPrompt({
      title: '分组名称:',
      onSubmit: async (name) => {
        const dir = node.path.slice(root.length + 1)
        await ipc.writingCreateFolder({ root, dir, name })
        await loadWritingTree()
        if (!open) setWritingGroupExpanded(node.path, true)
        appendWritingOrder(node.path, `${node.path}/${name}`)
      },
    })
  }

  return (
    <div>
      <div
        data-testid="writing-tree-node"
        data-kind={isDir ? 'dir' : 'file'}
        data-companion={isCompanion || undefined}
        className={`group flex items-center gap-1 px-2 py-1 cursor-pointer rounded transition-colors select-none
          ${isSelected
            ? isAcademic ? 'bg-ember/10 text-ember' : 'bg-[#1a1a1a]/10 text-[#1a1a1a]'
            : isAcademic ? 'text-parchment/70 hover:text-parchment hover:bg-parchment/5' : 'text-[#6b5d52] hover:text-[#2a1f1a] hover:bg-black/5'}
          ${isCompanion ? (isAcademic ? 'bg-parchment/8 shadow-[inset_2px_0_0_rgba(232,213,183,0.4)]' : 'bg-[#6b5d52]/10 shadow-[inset_2px_0_0_rgba(42,31,26,0.35)]') : ''}
          ${dragOver ? 'ring-1 ring-ember/50' : ''}
          ${dropPos === 'before' ? 'border-t-2 border-ember' : ''}
          ${dropPos === 'after' ? 'border-b-2 border-ember' : ''}`}
        style={{ fontSize: 'var(--writing-ui-size)', paddingLeft: `${depth * 16 + 8}px` }}
        onClick={handleClick}
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
          // 外部系统文件拖入（md/xlsx/pdf/docx）：导入到分组内部（dragOver 中心）或该行所在目录
          const files = Array.from(e.dataTransfer.files ?? [])
          if (files.length > 0) {
            const into = dragOver && isDir && !dropPos
            setDragOver(false); setDropPos(null)
            await importExternalFiles(files, into ? node.path : parentDir, loadWritingTree)
            return
          }
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
        <span className={`w-6 shrink-0 inline-flex items-center justify-center ${isAcademic ? (isSelected ? 'text-ember' : 'text-parchment/50') : 'text-[#1a1a1a]'}`}>
          {isDir ? <FolderIcon open={open} /> : <FileIconByPath path={node.path} />}
        </span>
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
            <>
              <button
                data-testid="writing-node-create"
                data-path={node.path}
                title="在此分组新建文章"
                className={`px-1 text-xs ${isAcademic ? 'text-parchment/50 hover:text-ember' : 'text-[#6b5d52] hover:text-[#8a3a3a]'}`}
                onClick={(e) => { e.stopPropagation(); doNewFile() }}
              >
                ＋
              </button>
              <button
                data-testid="writing-node-create-folder"
                data-path={node.path}
                title="在此分组新建子分组"
                className={`px-1 text-xs ${isAcademic ? 'text-parchment/50 hover:text-ember' : 'text-[#6b5d52] hover:text-[#8a3a3a]'}`}
                onClick={(e) => { e.stopPropagation(); doNewFolder() }}
              >
                🗀
              </button>
            </>
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
  const loadWritingTree = useStore(s => s.loadWritingTree)
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
        {root === 'writing' ? '还没有文章，点击上方 ＋ 新建' : '还没有文件，点击上方 ＋ 新建或 ⬆ 导入'}
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
        // 外部系统文件拖入（md/xlsx/pdf/docx）：导入到根级
        const files = Array.from(e.dataTransfer.files ?? [])
        if (files.length > 0) {
          await importExternalFiles(files, root, loadWritingTree)
          return
        }
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

// 分组/文章前缀标识（模块私有：不 export，避免破坏 Fast Refresh）
function FolderIcon({ open }: { open: boolean }) {
  return (
    <svg data-testid="writing-tree-folder-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
      {open ? (
        <path d="M6 14l1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" />
      ) : (
        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      )}
    </svg>
  )
}

// 文章行前缀标识（模块私有：不 export，避免破坏 Fast Refresh）；折角文档图标
function DocIcon() {
  return (
    <svg data-testid="writing-tree-doc-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  )
}

// 文件行前缀图标：按扩展名显示类型（模块私有：不 export，避免破坏 Fast Refresh）
function FileIconByPath({ path }: { path: string }) {
  const kind = writingPreviewKindOf(path)
  if (kind === 'xlsx') return <XlsxIcon />
  if (kind === 'pdf') return <PdfIcon />
  if (kind === 'docx') return <DocxIcon />
  return <DocIcon />
}

// xlsx：表格网格
function XlsxIcon() {
  return (
    <svg data-testid="writing-tree-icon-xlsx" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9.5h18" />
      <path d="M9 4v16" />
      <path d="M15 4v16" />
    </svg>
  )
}

// pdf：带字角标方块
function PdfIcon() {
  return (
    <svg data-testid="writing-tree-icon-pdf" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <text x="12" y="15.5" textAnchor="middle" fontSize="9" fontWeight="700" fill="currentColor" stroke="none">PDF</text>
    </svg>
  )
}

// docx：折角文档 + 横线
function DocxIcon() {
  return (
    <svg data-testid="writing-tree-icon-docx" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <path d="M9 13h6" />
      <path d="M9 17h6" />
    </svg>
  )
}

// 系统文件拖入导入：取真实路径 → 调 IPC → 重载树；失败/skipped 仅 console.warn（树刷新即反馈）
async function importExternalFiles(files: File[], targetDir: string, loadWritingTree: () => Promise<void>): Promise<void> {
  const paths = files.map(f => ipc.getPathForFile(f)).filter(p => p.length > 0)
  if (paths.length === 0) return
  const r = await ipc.writingImportPaths({ targetDir, paths })
  if (!r.ok) {
    console.warn('[writing-import]', r.code, r.message)
  } else if (r.value.skipped.length > 0) {
    console.warn('[writing-import] skipped:', r.value.skipped)
  }
  await loadWritingTree()
}

// 重命名归一化：非 md 文件保留原扩展名（如 报表.xlsx → 新报表.xlsx），md 与目录沿用原逻辑
function normalizeRenameForNode(name: string, node: WritingTreeNode): string {
  if (node.kind === 'file' && writingPreviewKindOf(node.path) !== 'md') {
    const dot = node.name.lastIndexOf('.')
    const currentExt = dot === -1 ? '' : node.name.slice(dot + 1)
    return normalizeWritingFileRename(name, currentExt)
  }
  return normalizeWritingFileName(name, node.kind === 'file')
}

