import {
  cloneElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import type { FocusEvent, MouseEvent as ReactMouseEvent, ReactElement, Ref } from 'react'
import { createPortal } from 'react-dom'

export interface TooltipProps {
  /** tooltip 正文（完整文本） */
  content: string
  /** 主题：academic 深底 / newspaper 浅底 */
  theme?: 'academic' | 'newspaper'
  /** 触发延迟（默认 350ms；focus 立即） */
  delay?: number
  children: ReactElement
}

interface TriggerProps {
  ref?: Ref<HTMLElement>
  onMouseEnter?: (e: ReactMouseEvent<HTMLElement>) => void
  onMouseLeave?: (e: ReactMouseEvent<HTMLElement>) => void
  onFocus?: (e: FocusEvent<HTMLElement>) => void
  onBlur?: (e: FocusEvent<HTMLElement>) => void
  'aria-describedby'?: string
}

const THEME_CLASS: Record<NonNullable<TooltipProps['theme']>, string> = {
  academic: 'bg-ink/95 border border-parchment/20 text-parchment/90',
  newspaper: 'bg-white border border-[#1a1a1a]/20 text-[#1a1a1a]',
}

/** tooltip 与触发元素之间的间距 */
const GAP = 6
/** 距离视口边缘的最小留白 */
const MARGIN = 8

/** 单行省略（scrollWidth）或 line-clamp（scrollHeight）任一成立即视为被截断 */
function isTruncated(el: HTMLElement): boolean {
  return el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1
}

export function Tooltip({ content, theme = 'academic', delay = 350, children }: TooltipProps) {
  const id = useId()
  const triggerRef = useRef<HTMLElement | null>(null)
  const tooltipRef = useRef<HTMLDivElement | null>(null)
  const timerRef = useRef<number | null>(null)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  const childProps = (children.props ?? {}) as TriggerProps
  // 保持稳定回调：避免每次渲染都让 React 把 ref 先置 null 再赋值
  const childRefHolder = useRef(childProps.ref)
  childRefHolder.current = childProps.ref

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const hide = useCallback(() => {
    clearTimer()
    setOpen(false)
    setPos(null)
  }, [clearTimer])

  useEffect(() => clearTimer, [clearTimer])

  /** hover：每次进入都重新判断是否被截断（窗口尺寸变化后结果会变） */
  const showAfterDelay = useCallback(() => {
    const el = triggerRef.current
    if (!el || !isTruncated(el)) return
    clearTimer()
    if (delay <= 0) {
      setOpen(true)
      return
    }
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      setOpen(true)
    }, delay)
  }, [clearTimer, delay])

  /** focus：立即显示（同样只在被截断时） */
  const showNow = useCallback(() => {
    const el = triggerRef.current
    if (!el || !isTruncated(el)) return
    clearTimer()
    setOpen(true)
  }, [clearTimer])

  // Escape 关闭
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hide()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, hide])

  // 任何滚动（含内层滚动容器，capture 捕获）都关闭
  useEffect(() => {
    if (!open) return
    const onScroll = () => hide()
    window.addEventListener('scroll', onScroll, true)
    return () => window.removeEventListener('scroll', onScroll, true)
  }, [open, hide])

  // 两段式定位：先挂载隐藏的 tooltip，量到真实尺寸后再 clamp / 翻转
  useLayoutEffect(() => {
    if (!open) return
    const el = triggerRef.current
    const tip = tooltipRef.current
    if (!el || !tip) return

    const rect = el.getBoundingClientRect()
    const tipRect = tip.getBoundingClientRect()

    const maxLeft = Math.max(MARGIN, window.innerWidth - tipRect.width - MARGIN)
    const left = Math.min(Math.max(rect.left, MARGIN), maxLeft)

    const belowTop = rect.bottom + GAP
    const fitsBelow = belowTop + tipRect.height <= window.innerHeight - MARGIN
    const top = fitsBelow ? belowTop : Math.max(MARGIN, rect.top - GAP - tipRect.height)

    setPos({ top, left })
  }, [open, content])

  const setTrigger = useCallback((node: HTMLElement | null) => {
    triggerRef.current = node
    const ref = childRefHolder.current
    if (typeof ref === 'function') ref(node)
    else if (ref && typeof ref === 'object') (ref as { current: HTMLElement | null }).current = node
  }, [])

  const trigger = cloneElement(children as ReactElement<Record<string, unknown>>, {
    ref: setTrigger,
    onMouseEnter: (e: ReactMouseEvent<HTMLElement>) => {
      childProps.onMouseEnter?.(e)
      showAfterDelay()
    },
    onMouseLeave: (e: ReactMouseEvent<HTMLElement>) => {
      childProps.onMouseLeave?.(e)
      hide()
    },
    onFocus: (e: FocusEvent<HTMLElement>) => {
      childProps.onFocus?.(e)
      showNow()
    },
    onBlur: (e: FocusEvent<HTMLElement>) => {
      childProps.onBlur?.(e)
      hide()
    },
    'aria-describedby': [childProps['aria-describedby'], id].filter(Boolean).join(' '),
  } as Record<string, unknown>)

  return (
    <>
      {trigger}
      {open && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={tooltipRef}
              id={id}
              role="tooltip"
              data-testid="tooltip"
              style={{
                position: 'fixed',
                top: pos?.top ?? 0,
                left: pos?.left ?? 0,
                visibility: pos ? 'visible' : 'hidden',
              }}
              className={`pointer-events-none z-[60] max-w-xs whitespace-pre-wrap break-words rounded px-2 py-1 text-[11px] leading-relaxed shadow-xl ${THEME_CLASS[theme]}`}
            >
              {content}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
