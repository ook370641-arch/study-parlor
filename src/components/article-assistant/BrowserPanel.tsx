import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ipc } from '@/lib/ipc'
import type { BrowserBounds, BrowserViewState, BriefingTheme } from '@shared/index'

const EMPTY_STATE: BrowserViewState = {
  url: '', title: '', loading: false, canGoBack: false, canGoForward: false, error: null,
}

function boundsFor(element: HTMLElement): BrowserBounds {
  const rect = element.getBoundingClientRect()
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height)),
  }
}

function IconButton({ label, testId, disabled, onClick, children }: {
  label: string
  testId: string
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button type="button" aria-label={label} title={label} data-testid={testId} disabled={disabled} onClick={onClick}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-sm text-parchment/60 transition-colors hover:bg-parchment/10 hover:text-parchment disabled:opacity-25 disabled:hover:bg-transparent">
      {children}
    </button>
  )
}

export function BrowserPanel({ theme = 'academic' }: { theme?: BriefingTheme }) {
  const placeholderRef = useRef<HTMLDivElement>(null)
  const addressFocusedRef = useRef(false)
  const [viewState, setViewState] = useState<BrowserViewState>(EMPTY_STATE)
  const [address, setAddress] = useState('')

  useEffect(() => {
    const element = placeholderRef.current
    if (!element) return
    let active = true
    const offState = ipc.onBrowserState((state) => {
      if (!active) return
      setViewState(state)
      if (!addressFocusedRef.current) setAddress(state.url)
    })
    const updateBounds = () => {
      if (active) void ipc.browserSetBounds(boundsFor(element))
    }
    const observer = new ResizeObserver(updateBounds)
    observer.observe(element)
    window.addEventListener('resize', updateBounds)
    void ipc.browserShow({ bounds: boundsFor(element) }).then((state) => {
      if (!active) {
        void ipc.browserHide()
        return
      }
      setViewState(state)
      if (!addressFocusedRef.current) setAddress(state.url)
    }).catch(() => {
      if (active) setViewState((current) => ({ ...current, error: '浏览器启动失败' }))
    })
    return () => {
      active = false
      observer.disconnect()
      window.removeEventListener('resize', updateBounds)
      offState()
      void ipc.browserHide()
    }
  }, [])

  const navigate = async (value = address) => {
    if (!value.trim()) return
    const state = await ipc.browserNavigate(value)
    setViewState(state)
    if (!addressFocusedRef.current) setAddress(state.url)
  }

  const isAcademic = theme === 'academic'

  return (
    <div data-testid="browser-panel" className={`flex h-full min-h-0 flex-col ${isAcademic ? '' : 'bg-[#f5f2ed]'}`}>
      <form
        className={`flex shrink-0 items-center gap-0.5 border-b p-2 ${isAcademic ? 'border-parchment/10' : 'border-[#1a1a1a]/10'}`}
        onSubmit={(event) => {
          event.preventDefault()
          void navigate().catch(() => setViewState((current) => ({ ...current, error: '网页加载失败' })))
        }}
      >
        <IconButton label="后退" testId="browser-back" disabled={!viewState.canGoBack} onClick={() => void ipc.browserGoBack()}>←</IconButton>
        <IconButton label="前进" testId="browser-forward" disabled={!viewState.canGoForward} onClick={() => void ipc.browserGoForward()}>→</IconButton>
        <IconButton label="刷新" testId="browser-reload" onClick={() => void ipc.browserReload()}>↻</IconButton>
        <input
          data-testid="browser-address"
          aria-label="网址或搜索关键词"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          onFocus={() => { addressFocusedRef.current = true }}
          onBlur={() => {
            addressFocusedRef.current = false
            setAddress(viewState.url)
          }}
          placeholder="输入网址或搜索"
          spellCheck={false}
          className={`mx-1 h-7 min-w-0 flex-1 rounded border px-2 text-xs outline-none focus:border-ember/60 ${isAcademic ? 'border-parchment/15 bg-black/20 text-parchment/80 placeholder:text-parchment/30' : 'border-[#1a1a1a]/15 bg-white text-[#4b423b] placeholder:text-[#8a7d72]'}`}
        />
        <IconButton label="网页内查找" testId="browser-find-open" onClick={() => undefined}>⌕</IconButton>
        <IconButton label="用系统浏览器打开" testId="browser-open-external" disabled={!viewState.url} onClick={() => void ipc.browserOpenExternal()}>↗</IconButton>
      </form>
      {viewState.error && (
        <div className="flex shrink-0 items-center gap-2 bg-ember/10 px-3 py-2 text-xs text-ember">
          <span className="min-w-0 flex-1 truncate">{viewState.error}</span>
          <button type="button" className="shrink-0 hover:underline" onClick={() => void navigate(viewState.url || address)}>重试</button>
        </div>
      )}
      <div ref={placeholderRef} data-testid="browser-view-placeholder" className={`min-h-0 flex-1 ${isAcademic ? 'bg-[#17110f]' : 'bg-white'}`} />
    </div>
  )
}
