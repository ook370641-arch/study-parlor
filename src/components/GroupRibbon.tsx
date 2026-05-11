import { useState, useRef, useCallback } from 'react'
import type { Group } from '@shared/index'
import { ConfirmDialog } from './ConfirmDialog'

interface GroupRibbonProps {
  groups: Group[]
  activeGroupId: string | null
  onSelect: (groupId: string | null) => void
  onCreate: (name: string) => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
}

export function GroupRibbon({
  groups,
  activeGroupId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: GroupRibbonProps) {
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Group | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleCreate = useCallback(() => {
    if (newName.trim()) {
      onCreate(newName.trim())
      setNewName('')
      setCreating(false)
    }
  }, [newName, onCreate])

  const handleRename = useCallback((id: string) => {
    if (renameValue.trim()) {
      onRename(id, renameValue.trim())
      setRenaming(null)
      setRenameValue('')
    }
  }, [renameValue, onRename])

  const handleContextMenu = useCallback((e: React.MouseEvent, groupId: string) => {
    e.preventDefault()
    if (groupId === 'default') return
    setMenuOpen(groupId)
  }, [])

  return (
    <div className="relative">
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {/* "All" button */}
        <button
          onClick={() => onSelect(null)}
          className={`shrink-0 px-3 py-1 text-xs font-sans rounded-full transition-colors ${
            activeGroupId === null
              ? 'bg-parchment/20 text-parchment'
              : 'border border-parchment/20 text-parchment/50 hover:border-parchment/40'
          }`}
        >
          全部
        </button>

        {groups.map((group) => (
          <div key={group.id} className="relative shrink-0">
            {renaming === group.id ? (
              <input
                ref={inputRef}
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={() => handleRename(group.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRename(group.id)
                  if (e.key === 'Escape') setRenaming(null)
                }}
                className="px-3 py-1 text-xs font-sans rounded-full bg-ink border border-ember text-parchment w-24 outline-none"
                autoFocus
              />
            ) : (
              <button
                onClick={() => onSelect(group.id)}
                onContextMenu={(e) => handleContextMenu(e, group.id)}
                className={`px-3 py-1 text-xs font-sans rounded-full transition-colors ${
                  activeGroupId === group.id
                    ? 'text-ink'
                    : 'border text-parchment/60 hover:text-parchment'
                }`}
                style={
                  activeGroupId === group.id
                    ? { backgroundColor: group.color }
                    : { borderColor: group.color + '80' }
                }
              >
                {group.name}
              </button>
            )}

            {/* Context menu */}
            {menuOpen === group.id && (
              <div
                className="absolute top-full left-0 mt-1 z-10 bg-ink border border-slate/30 rounded shadow-lg py-1 min-w-[80px]"
                onMouseLeave={() => setMenuOpen(null)}
              >
                <button
                  onClick={() => {
                    setRenaming(group.id)
                    setRenameValue(group.name)
                    setMenuOpen(null)
                  }}
                  className="block w-full text-left px-3 py-1 text-xs text-parchment/70 hover:bg-parchment/10 font-sans"
                >
                  重命名
                </button>
                <button
                  onClick={() => {
                    setDeleteTarget(group)
                    setMenuOpen(null)
                  }}
                  className="block w-full text-left px-3 py-1 text-xs text-red-400 hover:bg-red-400/10 font-sans"
                >
                  删除
                </button>
              </div>
            )}
          </div>
        ))}

        {/* Create button */}
        {creating ? (
          <input
            ref={inputRef}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onBlur={() => {
              if (newName.trim()) handleCreate()
              setCreating(false)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate()
              if (e.key === 'Escape') {
                setCreating(false)
                setNewName('')
              }
            }}
            placeholder="分组名"
            className="px-3 py-1 text-xs font-sans rounded-full bg-ink border border-parchment/30 text-parchment w-24 outline-none placeholder:text-parchment/30"
            autoFocus
          />
        ) : (
          <button
            onClick={() => setCreating(true)}
            className="shrink-0 px-2 py-1 text-xs font-sans rounded-full border border-parchment/15 text-parchment/30 hover:border-parchment/30 hover:text-parchment/50 transition-colors"
          >
            +
          </button>
        )}
      </div>

      {deleteTarget && (
        <ConfirmDialog
          open={true}
          title="解散分组"
          icon="warning"
          confirmLabel="确认解散"
          confirmVariant="danger"
          onConfirm={() => {
            onDelete(deleteTarget.id)
            setDeleteTarget(null)
          }}
          onCancel={() => setDeleteTarget(null)}
        >
          <>
            即将解散分组 <strong style={{ color: '#e8d5b7' }}>「{deleteTarget.name}」</strong>。
            <br /><br />
            该分组下的主题将被移至<strong>默认分组</strong>，主题文件不会被删除。
            <br /><br />
            <span style={{ color: '#8a3a3a', fontWeight: 500 }}>此操作不可撤销。</span>
          </>
        </ConfirmDialog>
      )}
    </div>
  )
}
