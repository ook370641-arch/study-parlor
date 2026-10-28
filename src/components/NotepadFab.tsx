// 迭代记事板全局悬浮入口：固定在界面右下角，所有页面可见。
// 面板自右下角向上展开（见 NotepadPanel），尺寸/字号持久化逻辑不变。
import { useState } from 'react'
import { NotepadPanel } from '@/components/NotepadPanel'
import { useStore } from '@/store'

export function NotepadFab() {
  const [open, setOpen] = useState(false)
  // 旁注聊天窗固定在同一右下角（z-50，但受 z-5 祖先叠层约束），
  // 悬浮球会压住发送按钮（2026-10-27 E2E 回归）。聊天打开时先让出位置。
  const chatOpen = useStore((s) => s.assistantSession?.isOpen ?? false)

  return (
    <>
      {!chatOpen && (
        <button
          data-testid="notepad-fab-button"
          type="button"
          aria-label="记事板"
          onClick={() => setOpen(v => !v)}
          className="fixed bottom-5 right-5 z-30 w-10 h-10 rounded-full
                     border border-parchment/30 bg-[rgba(15,10,8,0.85)] backdrop-blur-md shadow-lg
                     flex items-center justify-center text-parchment/80
                     hover:border-ember/60 hover:text-ember transition-colors"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-4 h-4"
          >
            <path d="M12 20h9"/>
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/>
          </svg>
        </button>
      )}
      <NotepadPanel open={open} onClose={() => setOpen(false)} />
    </>
  )
}
