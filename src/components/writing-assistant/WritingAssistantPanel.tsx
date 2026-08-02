import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/store'
import { ArticleDivider } from '@/components/article-assistant/ArticleDivider'
import { WritingAssistantMessages } from './WritingAssistantMessages'
import { WritingAssistantInput } from './WritingAssistantInput'

export function WritingAssistantPanel() {
  const open = useStore((s) => s.writingAssistantOpen)
  const width = useStore((s) => s.writingAssistantWidth)
  const setOpen = useStore((s) => s.setWritingAssistantOpen)
  const setWidth = useStore((s) => s.setWritingAssistantWidth)
  const [closing, setClosing] = useState(false)
  const closeTimer = useRef<number | null>(null)

  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current) }, [])
  useEffect(() => { if (open) setClosing(false) }, [open])

  const requestClose = () => {
    if (closing) return
    setClosing(true)
    closeTimer.current = window.setTimeout(() => setOpen(false), 200)
  }

  return (
    <div data-testid="writing-assistant-panel" className={`relative z-[5] flex h-full shrink-0 ${!open ? '' : (closing ? 'panel-depart' : 'panel-arise')}`}>
      <ArticleDivider
        collapsed={!open}
        onToggleCollapse={() => {
          if (open) {
            requestClose()
          } else {
            setOpen(true)
          }
        }}
        onResize={(w) => {
          const maxWidth = window.innerWidth * 0.45
          if (w < 40) {
            if (open) requestClose()
          } else {
            if (!open) setOpen(true)
            setWidth(Math.max(200, Math.min(w, maxWidth)))
          }
        }}
        theme="academic"
      />
      {open && (
        <div data-testid="writing-assistant-panel-content" className="h-full overflow-hidden" style={{ width }}>
          <div className="h-full flex flex-col min-w-0 border-l border-parchment/20 bg-[#1a1512]">
            <div className="h-9 flex items-center justify-between px-3 border-b border-parchment/10 shrink-0">
              <span className="text-[11px] tracking-[0.2em] text-parchment/80 font-serif">AI 写作助手</span>
              <button
                data-testid="writing-assistant-close-btn"
                className="text-parchment/60 hover:text-ember text-sm leading-none px-1"
                onClick={() => requestClose()}
                aria-label="关闭"
              >
                ✕
              </button>
            </div>
            <WritingAssistantMessages />
            <WritingAssistantInput />
          </div>
        </div>
      )}
    </div>
  )
}
