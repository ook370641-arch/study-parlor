import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/store'
import { ArticleDivider } from '@/components/article-assistant/ArticleDivider'
import { WritingAssistantMessages } from './WritingAssistantMessages'
import { WritingAssistantInput } from './WritingAssistantInput'
import { CompanionBoard } from '@/components/writing/CompanionBoard'

export function WritingAssistantPanel() {
  const open = useStore((s) => s.writingAssistantOpen)
  const width = useStore((s) => s.writingAssistantWidth)
  const setOpen = useStore((s) => s.setWritingAssistantOpen)
  const setWidth = useStore((s) => s.setWritingAssistantWidth)
  const panelMode = useStore((s) => s.writingPanelMode)
  const setPanelMode = useStore((s) => s.setWritingPanelMode)
  const writingFile = useStore((s) => s.writingFile)
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
              <div className="flex items-center gap-1">
                <button
                  data-testid="writing-panel-tab-assistant"
                  className={`text-[11px] tracking-[0.2em] font-serif px-2 py-1 rounded transition-colors ${panelMode === 'assistant' ? 'text-ember bg-ember/10' : 'text-parchment/60 hover:text-parchment/90'}`}
                  onClick={() => setPanelMode('assistant')}
                >
                  助手
                </button>
                <button
                  data-testid="writing-panel-tab-companion"
                  className={`text-[11px] tracking-[0.2em] font-serif px-2 py-1 rounded transition-colors ${panelMode === 'companion' ? 'text-ember bg-ember/10' : 'text-parchment/60 hover:text-parchment/90'} disabled:opacity-40 disabled:cursor-not-allowed`}
                  onClick={() => setPanelMode('companion')}
                  disabled={!writingFile}
                >
                  对照
                </button>
              </div>
              <button
                data-testid="writing-assistant-close-btn"
                className="text-parchment/60 hover:text-ember text-sm leading-none px-1"
                onClick={() => requestClose()}
                aria-label="关闭"
              >
                ✕
              </button>
            </div>
            {panelMode === 'assistant' ? (
              <>
                <WritingAssistantMessages />
                <WritingAssistantInput />
              </>
            ) : (
              <CompanionBoard />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
