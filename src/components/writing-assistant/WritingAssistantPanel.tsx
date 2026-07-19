import { useStore } from '@/store'
import { WritingAssistantMessages } from './WritingAssistantMessages'
import { WritingAssistantInput } from './WritingAssistantInput'

export function WritingAssistantPanel() {
  const open = useStore((s) => s.writingAssistantOpen)
  const width = useStore((s) => s.writingAssistantWidth)
  const setOpen = useStore((s) => s.setWritingAssistantOpen)

  // Collapsed state: right-edge tab
  if (!open) {
    return (
      <div
        data-testid="writing-assistant-collapsed"
        className="w-6 bg-ember text-white text-xs flex items-center justify-center cursor-pointer shrink-0 select-none"
        style={{ writingMode: 'vertical-rl' }}
        onClick={() => setOpen(true)}
      >
        AI 助手 ▸
      </div>
    )
  }

  // Expanded state: resizable panel
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = useStore.getState().writingAssistantWidth
    const onMove = (ev: MouseEvent) => {
      const w = Math.max(200, Math.min(560, startWidth + (startX - ev.clientX)))
      useStore.getState().setWritingAssistantWidth(w)
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  return (
    <div
      data-testid="writing-assistant-panel"
      className="flex shrink-0 h-full"
      style={{ width }}
    >
      {/* Left resize handle */}
      <div
        data-testid="writing-assistant-resize-handle"
        className="w-0.5 h-full cursor-col-resize hover:bg-ember/50 transition-colors shrink-0"
        onMouseDown={handleMouseDown}
      />

      {/* Panel body */}
      <div className="flex-1 flex flex-col min-w-0 border-l border-parchment/20 bg-[#1a1512]">
        {/* Header */}
        <div className="h-9 flex items-center justify-between px-3 border-b border-parchment/10 shrink-0">
          <span className="text-[11px] tracking-[0.2em] text-parchment/80 font-serif">
            AI 写作助手
          </span>
          <button
            data-testid="writing-assistant-close-btn"
            className="text-parchment/60 hover:text-ember text-sm leading-none px-1"
            onClick={() => setOpen(false)}
            aria-label="关闭"
          >
            ✕
          </button>
        </div>

        {/* Messages */}
        <WritingAssistantMessages />

        {/* Input */}
        <WritingAssistantInput />
      </div>
    </div>
  )
}
