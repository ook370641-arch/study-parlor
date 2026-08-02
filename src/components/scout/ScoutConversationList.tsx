import { useState } from 'react'
import { useStore } from '@/store'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import type { BriefingTheme, ScoutConversationMeta } from '@shared/index'

export function ScoutConversationList({ theme = 'academic' }: { theme?: BriefingTheme }) {
  const conversations = useStore((s) => s.scoutConversations)
  const activeId = useStore((s) => s.scoutActiveConversationId)
  const createConversation = useStore((s) => s.createScoutConversation)
  const selectConversation = useStore((s) => s.selectScoutConversation)
  const renameConversation = useStore((s) => s.renameScoutConversation)
  const deleteConversation = useStore((s) => s.deleteScoutConversation)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [pendingDelete, setPendingDelete] = useState<ScoutConversationMeta | null>(null)
  const isAcademic = theme !== 'newspaper'
  const item = (active: boolean) =>
    `group flex items-center gap-1 rounded px-2 py-1.5 text-xs cursor-pointer transition-colors ${
      active
        ? isAcademic ? 'bg-ember/15 text-parchment' : 'bg-[#1a1a1a]/10 text-[#1a1a1a]'
        : isAcademic ? 'text-parchment/60 hover:bg-parchment/5' : 'text-[#6b5d52] hover:bg-[#1a1a1a]/5'
    }`

  const submitRename = (id: string) => {
    const v = editValue.trim()
    setEditingId(null)
    if (v) void renameConversation(id, v)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-2 shrink-0">
        <button
          type="button"
          data-testid="scout-new-conversation"
          onClick={() => void createConversation()}
          className={`text-xs ${isAcademic ? 'text-ember hover:text-ember/80' : 'text-[#8a3a3a] hover:text-[#6a2a2a]'}`}
        >+ 新建对话</button>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
        {conversations.length === 0 && (
          <p className={`text-center py-8 text-xs ${isAcademic ? 'text-parchment/40' : 'text-[#6b5d52]/60'}`}>
            还没有对话，点上方新建
          </p>
        )}
        {conversations.map((c) => (
          <div
            key={c.id}
            data-testid={`scout-conversation-${c.id}`}
            className={item(c.id === activeId)}
            onClick={() => void selectConversation(c.id)}
          >
            {editingId === c.id ? (
              <input
                autoFocus
                data-testid="scout-conversation-rename-input"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={() => submitRename(c.id)}
                onKeyDown={(e) => { if (e.key === 'Enter') submitRename(c.id); if (e.key === 'Escape') setEditingId(null) }}
                onClick={(e) => e.stopPropagation()}
                className={`flex-1 min-w-0 rounded px-1.5 py-0.5 border outline-none text-xs ${isAcademic ? 'bg-parchment/10 border-ember/30 text-parchment' : 'bg-[#f5f3ef] border-ember/30 text-[#1a1a1a]'}`}
              />
            ) : (
              <span
                className="flex-1 min-w-0 truncate"
                title="点击名称改名"
                onDoubleClick={() => { setEditingId(c.id); setEditValue(c.title) }}
              >{c.title}</span>
            )}
            <button
              type="button"
              data-testid={`scout-conversation-delete-${c.id}`}
              aria-label="删除对话"
              onClick={(e) => { e.stopPropagation(); setPendingDelete(c) }}
              className="opacity-0 group-hover:opacity-100 text-[10px] hover:text-wine shrink-0"
            ><svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>
          </div>
        ))}
      </div>
      <ConfirmDialog
        open={pendingDelete !== null}
        title="删除对话"
        icon="trash"
        confirmLabel="删除"
        confirmVariant="danger"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          const target = pendingDelete
          setPendingDelete(null)
          if (target) void deleteConversation(target.id)
        }}
      >
        <p>即将删除对话「{pendingDelete?.title}」。</p>
        <p className="mt-2">已抓取入库的文章不受影响。</p>
      </ConfirmDialog>
    </div>
  )
}
