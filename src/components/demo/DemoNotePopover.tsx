import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '@/store'
import { DEMO_NOTES, applyDemoNoteOverrides } from '@/lib/demo-notes'
import type { DemoNote } from '@/lib/demo-notes'
import type { BriefingFontSize, BriefingTheme } from '@shared/index'

interface Props {
  /** 说明条目 id；null 表示关闭 */
  noteId: DemoNote['id'] | null
  anchorRef: React.RefObject<HTMLElement | null>
  onClose: () => void
  theme?: BriefingTheme
}

/**
 * 说明弹层宽高。
 *
 * 这一组文案是给「第一次看这个功能的人」读的结构化材料（主张 → 定位 → 工作流 →
 * 场景 → 取舍 → 指标 → 追问），380px 宽会把每一行都折成两三行，演示时无法一眼扫读。
 * 因此放宽到 460px，并允许在 84vh 内滚动；小窗口下由下面的 viewport 收敛逻辑兜住。
 */
const PANEL_WIDTH = 460
const PANEL_MAX_HEIGHT_VH = 84
const PANEL_MAX_HEIGHT_PX = 760

/** 字号档位对应的整体缩放（CSS zoom，参照写作 HTML 预览的 WRITING_HTML_ZOOM 先例）。
 *  复用简报十档，base=1，每档约 +0.11 */
const FONT_ZOOM: Record<BriefingFontSize, number> = {
  sm: 0.89, base: 1, lg: 1.11, xl: 1.22, '2xl': 1.33,
  '3xl': 1.44, '4xl': 1.55, '5xl': 1.66, '6xl': 1.77, '7xl': 1.88,
}
const FONT_SIZES = Object.keys(FONT_ZOOM) as BriefingFontSize[]
/** 拖拽边缘的最小/最大尺寸约束 */
const MIN_PANEL_W = 320
const MIN_PANEL_H = 220
type Corner = 'nw' | 'ne' | 'sw' | 'se'

/**
 * 取锚点的可视矩形。
 *
 * 五个入口的锚点都是 `<span className="contents">`（为了不在布局里多一层），
 * 而 display:contents 自身没有盒子，getBoundingClientRect 返回全 0，
 * 直接拿来定位会把弹层甩到左上角。这里退回到它的第一个子元素（真正的按钮）。
 */
function anchorRect(anchor: HTMLElement): DOMRect {
  const rect = anchor.getBoundingClientRect()
  if (rect.width > 0 || rect.height > 0) return rect
  const child = anchor.firstElementChild
  return child ? child.getBoundingClientRect() : rect
}

/** 去掉 contentEditable 可能插入的不换行空格，并收掉首尾空白 */
function readEditableText(el: HTMLElement): string {
  const raw = el.innerText ?? el.textContent ?? ''
  return raw.replace(/\u00a0/g, ' ').trim()
}

/** 把光标放到内容末尾（进入编辑后直接接着改） */
function focusAtEnd(el: HTMLElement) {
  el.focus()
  const range = document.createRange()
  range.selectNodeContents(el)
  range.collapse(false)
  const sel = window.getSelection()
  sel?.removeAllRanges()
  sel?.addRange(range)
}

/**
 * 可编辑文本块。
 *
 * 刻意做成非受控：外部只在 `text` 变化且元素未聚焦时写回 textContent。
 * 若让 React 管理 children，用户输入期间任何父级重渲染（定位、主题切换）
 * 都会把光标和未提交内容冲掉。
 */
function EditableText({
  path,
  text,
  editing,
  className,
  onCommit,
}: {
  path: string
  text: string
  editing: boolean
  className?: string
  onCommit: (path: string, text: string) => void
}) {
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (document.activeElement === el) return
    if (el.textContent !== text) el.textContent = text
  }, [text, editing])

  const commit = () => {
    const el = ref.current
    if (!el) return
    const next = readEditableText(el)
    if (!next) {
      // 清空 = 回退默认。store 里删掉改写后 text 不变，effect 不会重跑，
      // 这里必须自己把 DOM 还原，否则界面上会留一段空白。
      el.textContent = text
      onCommit(path, '')
      return
    }
    if (next === text) {
      if (el.textContent !== text) el.textContent = text
      return
    }
    onCommit(path, next)
  }

  return (
    <span
      ref={ref}
      data-testid={`demo-note-edit-${path}`}
      data-edit-path={path}
      contentEditable={editing}
      suppressContentEditableWarning
      spellCheck={false}
      onBlur={editing ? commit : undefined}
      onPaste={
        editing
          ? (e) => {
              // 只接受纯文本，避免把外部 HTML 粘进弹层
              e.preventDefault()
              const plain = e.clipboardData.getData('text/plain')
              if (typeof document.execCommand === 'function') {
                document.execCommand('insertText', false, plain)
              }
            }
          : undefined
      }
      onKeyDown={
        editing
          ? (e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                e.currentTarget.blur()
              } else if (e.key === 'Escape') {
                // Esc 只放弃当前块的改动，不退出编辑模式、不关闭弹层
                e.preventDefault()
                e.stopPropagation()
                const el = e.currentTarget
                el.textContent = text
                el.blur()
              }
            }
          : undefined
      }
      className={className}
    />
  )
}

/**
 * Demo 信息弹层：与 GuidePopover 同一定位/关闭范式（锚点下方、视口内收敛、
 * Esc / 点击外部 / 窗口 resize 关闭），但内容模板化：
 * 结论句 → 分节（标题 + 段落/列表/键值）→ 可被追问的问答。
 *
 * 点击「编辑」进入编辑模式：每段文字独立可改，失焦即写入 state.json；
 * 结构（分节、条目数量）固定，只允许改文本。
 */
export function DemoNotePopover({ noteId, anchorRef, onClose, theme = 'academic' }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null)
  const [editing, setEditing] = useState(false)
  /** 用户拖角落后的自由几何（显式 left/top/w/h）；null = 未拖过，锚点定位 + 内容自适应高 */
  const [geom, setGeom] = useState<{ left: number; top: number; w: number; h: number } | null>(null)
  const geomRef = useRef(geom)
  geomRef.current = geom
  const isAcademic = theme !== 'newspaper'

  const overrides = useStore((s) => (noteId ? s.demoNoteOverrides[noteId] : undefined))
  const setDemoNoteOverride = useStore((s) => s.setDemoNoteOverride)
  const resetDemoNoteOverrides = useStore((s) => s.resetDemoNoteOverrides)
  const demoNoteFontSize = useStore((s) => s.demoNoteFontSize)
  const setDemoNoteFontSize = useStore((s) => s.setDemoNoteFontSize)
  const note = useMemo(
    () => (noteId ? applyDemoNoteOverrides(DEMO_NOTES[noteId], overrides) : null),
    [noteId, overrides]
  )

  const updatePosition = useCallback(() => {
    const panel = panelRef.current
    const anchor = anchorRef.current
    if (!panel || !anchor) return
    const rect = anchorRect(anchor)
    const margin = 8
    const gap = 8
    const panelHeight = panel.getBoundingClientRect().height

    let top = rect.bottom + gap
    // 下方放不下就翻到锚点上方；再不行就贴顶
    if (top + panelHeight > window.innerHeight - margin) {
      top = Math.max(margin, rect.top - gap - panelHeight)
    }
    // 用户拖大面板后可能顶出视口下缘，统一往视口内夹（比视口还高时贴顶，内容区自己滚）
    top = Math.min(Math.max(top, margin), Math.max(margin, window.innerHeight - margin - panelHeight))

    // 默认右对齐锚点（入口多在界面右侧），再夹进视口。
    // 视口比面板还窄时（小窗口），宽度收敛到视口内，避免左右都被裁掉。
    const width = Math.min(PANEL_WIDTH, window.innerWidth - margin * 2)
    let left = rect.right - width
    left = Math.min(Math.max(left, margin), window.innerWidth - width - margin)

    setPos({ left, top, width })
  }, [anchorRef])

  const bumpFont = (dir: 1 | -1) => {
    const cur = FONT_SIZES.indexOf(demoNoteFontSize)
    const next = FONT_SIZES[Math.max(0, Math.min(FONT_SIZES.length - 1, cur + dir))]
    if (next !== demoNoteFontSize) setDemoNoteFontSize(next)
  }

  /** 四角拖拽：se 只改宽高，sw/ne/nw 同时平移对边（面板转自由浮动，不再跟随锚点）。 */
  const startResize = (corner: Corner) => (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation()
    const handle = e.currentTarget
    handle.setPointerCapture?.(e.pointerId)
    const startX = e.clientX
    const startY = e.clientY
    const start = geomRef.current ?? {
      left: pos?.left ?? 0,
      top: pos?.top ?? 0,
      w: pos?.width ?? PANEL_WIDTH,
      h: panelRef.current?.getBoundingClientRect().height || MIN_PANEL_H,
    }
    const margin = 8

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      const maxW = window.innerWidth - margin * 2
      const maxH = window.innerHeight - margin * 2
      // 左右向：右角加宽、左角左缘外扩（right 边固定）；上下向同理。
      // 左/上角的位置 = 起点 - 尺寸增量，保证对边不动
      const w = Math.round(Math.min(Math.max(start.w + (corner === 'nw' || corner === 'sw' ? -dx : dx), MIN_PANEL_W), maxW))
      const h = Math.round(Math.min(Math.max(start.h + (corner === 'nw' || corner === 'ne' ? -dy : dy), MIN_PANEL_H), maxH))
      let left = start.left
      if (corner === 'nw' || corner === 'sw') left -= w - start.w
      let top = start.top
      if (corner === 'nw' || corner === 'ne') top -= h - start.h
      left = Math.round(Math.min(Math.max(left, margin), window.innerWidth - w - margin))
      top = Math.round(Math.min(Math.max(top, margin), window.innerHeight - h - margin))
      setGeom({ left, top, w, h })
    }
    const onUp = (ev: PointerEvent) => {
      handle.removeEventListener('pointermove', onMove)
      handle.removeEventListener('pointerup', onUp)
      if (handle.hasPointerCapture?.(ev.pointerId)) handle.releasePointerCapture(ev.pointerId)
    }
    handle.addEventListener('pointermove', onMove)
    handle.addEventListener('pointerup', onUp)
  }

  // 换条目时退出编辑模式（是否保存由失焦提交决定）
  useEffect(() => {
    setEditing(false)
    setPos(null)
  }, [noteId])

  // 字号档位变化会改变内容高度，重新定位（用户拖过的自由几何不动，内容区自己滚）
  useEffect(() => {
    if (!noteId || geomRef.current) return
    updatePosition()
    const raf = requestAnimationFrame(updatePosition)
    return () => cancelAnimationFrame(raf)
  }, [demoNoteFontSize, noteId, updatePosition])

  useEffect(() => {
    if (!noteId) return
    // 先挂载（pos=null，visibility 隐藏）量高度，再定位；编辑条出现会改变高度，重算
    updatePosition()
    const raf = requestAnimationFrame(updatePosition)

    const commitFocused = () => {
      const el = document.activeElement as HTMLElement | null
      if (el && panelRef.current?.contains(el) && el.getAttribute('data-edit-path')) el.blur()
    }
    const onResize = () => {
      commitFocused()
      onClose()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (editing) {
        setEditing(false)
        return
      }
      onClose()
    }
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (panelRef.current?.contains(target)) return
      if (anchorRef.current?.contains(target)) return
      // 编辑中点击外部：先让聚焦块失焦落盘，再关闭，避免未提交内容丢失
      commitFocused()
      onClose()
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('keydown', onKeyDown)
    document.addEventListener('mousedown', onMouseDown, true)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('mousedown', onMouseDown, true)
    }
  }, [noteId, editing, onClose, updatePosition, anchorRef])

  const commitEdit = useCallback(
    (path: string, text: string) => {
      if (!noteId) return
      setDemoNoteOverride(noteId, path, text)
    },
    [noteId, setDemoNoteOverride]
  )

  if (!noteId || !note || typeof document === 'undefined') return null

  const shell = isAcademic
    ? 'bg-[#1e1612] border-parchment/20 text-parchment'
    : 'bg-[#faf8f4] border-[#1a1a1a]/20 text-[#1a1a1a]'
  const muted = isAcademic ? 'text-parchment/60' : 'text-[#6b5d52]'
  const body = isAcademic ? 'text-parchment/90' : 'text-[#1a1a1a]/90'
  const heading = isAcademic ? 'text-ember' : 'text-[#8a3a3a]'
  /** 编辑态下给每个可改块一个可见的落点 */
  const editMark = editing
    ? `cursor-text rounded-sm outline-none ${
        isAcademic ? 'bg-ember/[0.07] ring-1 ring-ember/25' : 'bg-[#8a3a3a]/[0.06] ring-1 ring-[#8a3a3a]/25'
      }`
    : ''

  // 挂到 body：书籍列的滚动容器带 transform（willChange/translateZ），会让
  // position: fixed 的后代改为相对该容器定位并被 overflow 裁掉——左下角入口
  // 的说明就被压在列里。portal 出去后不受任何父级堆叠上下文/裁剪影响，
  // 再配 z-[9999] 保证说明永远在最外层。
  return createPortal(
    <div
      ref={panelRef}
      data-testid={`demo-note-popover-${note.id}`}
      role="dialog"
      aria-label={note.title}
      className={`fixed z-[9999] rounded-xl border shadow-2xl p-4 flex flex-col ${shell}`}
      style={{
        width: geom?.w ?? pos?.width ?? PANEL_WIDTH,
        height: geom?.h ?? undefined,
        maxHeight: geom ? undefined : `min(${PANEL_MAX_HEIGHT_VH}vh, ${PANEL_MAX_HEIGHT_PX}px)`,
        left: geom?.left ?? pos?.left ?? 0,
        top: geom?.top ?? pos?.top ?? 0,
        visibility: pos ? 'visible' : 'hidden',
        scrollbarWidth: 'thin',
        scrollbarColor: '#d97757 transparent',
      }}
    >
      {/* zoom 包裹内容（不含拖拽手柄）：字号三档整体缩放，参照写作 HTML 预览 */}
      <div className="min-h-0 flex-1 flex flex-col" style={{ zoom: FONT_ZOOM[demoNoteFontSize] }}>
      <div className="flex items-start justify-between gap-3 mb-2 shrink-0">
        <div className={`text-[13px] font-serif font-semibold leading-snug ${body}`}>
          <EditableText
            path="title"
            text={note.title}
            editing={editing}
            onCommit={commitEdit}
            className={editMark}
          />
        </div>
        <span className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            data-testid="demo-note-font-dec"
            onClick={() => bumpFont(-1)}
            disabled={demoNoteFontSize === 'sm'}
            aria-label="缩小说明字号"
            title="缩小字号"
            className={`h-5 min-w-5 px-0.5 rounded border text-[11px] leading-none transition-opacity hover:opacity-100 disabled:opacity-25 opacity-70 ${
              isAcademic ? 'border-parchment/25 text-parchment/70' : 'border-[#1a1a1a]/25 text-[#1a1a1a]/70'
            }`}
          >
            −
          </button>
          <button
            type="button"
            data-testid="demo-note-font-inc"
            onClick={() => bumpFont(1)}
            disabled={demoNoteFontSize === '7xl'}
            aria-label="放大说明字号"
            title="放大字号"
            className={`h-5 min-w-5 px-0.5 rounded border text-[11px] leading-none transition-opacity hover:opacity-100 disabled:opacity-25 opacity-70 ${
              isAcademic ? 'border-parchment/25 text-parchment/70' : 'border-[#1a1a1a]/25 text-[#1a1a1a]/70'
            }`}
          >
            ＋
          </button>
        </span>
        <button
          type="button"
          data-testid="demo-note-close"
          onClick={onClose}
          aria-label="关闭说明"
          className={`shrink-0 text-sm leading-none px-1 ${muted} hover:opacity-100 opacity-70`}
        >
          ✕
        </button>
      </div>

      <div
        className={`mb-3 shrink-0 rounded-md px-2.5 py-2 text-[11.5px] leading-relaxed ${
          isAcademic ? 'bg-ember/10 text-parchment/85' : 'bg-[#d97757]/10 text-[#3a2c24]'
        }`}
      >
        <EditableText
          path="thesis"
          text={note.thesis}
          editing={editing}
          onCommit={commitEdit}
          className={`block ${editMark}`}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1 space-y-3.5">
        {note.context && (
          <section>
            <h4 className={`mb-1 text-[11px] font-semibold tracking-[0.12em] ${heading}`}>你现在看到的是什么</h4>
            <p className={`text-[12px] leading-relaxed ${muted}`}>
              <EditableText
                path="context"
                text={note.context}
                editing={editing}
                onCommit={commitEdit}
                className={`block whitespace-pre-wrap ${editMark}`}
              />
            </p>
          </section>
        )}

        {note.steps && note.steps.length > 0 && (
          <section>
            <h4 className={`mb-1 text-[11px] font-semibold tracking-[0.12em] ${heading}`}>它怎么跑</h4>
            <ol className="space-y-1.5">
              {note.steps.map((step, i) => (
                <li key={i} className="flex gap-2">
                  <span
                    aria-hidden="true"
                    className={`mt-[1px] shrink-0 w-[15px] h-[15px] rounded-full border text-[9px] leading-[13px] text-center font-sans ${
                      isAcademic ? 'border-ember/40 text-ember/80' : 'border-[#8a3a3a]/40 text-[#8a3a3a]'
                    }`}
                  >
                    {i + 1}
                  </span>
                  <div className="flex-1">
                    <div className={`text-[12px] font-medium ${body}`}>
                      <EditableText
                        path={`st${i}.title`}
                        text={step.title}
                        editing={editing}
                        onCommit={commitEdit}
                        className={editMark}
                      />
                    </div>
                    <div className={`mt-0.5 text-[11.5px] leading-relaxed ${muted}`}>
                      <EditableText
                        path={`st${i}.detail`}
                        text={step.detail}
                        editing={editing}
                        onCommit={commitEdit}
                        className={`block whitespace-pre-wrap ${editMark}`}
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}

        {note.sections.map((s, i) => (
          <section key={i}>
            {s.heading && (
              <h4 className={`mb-1 text-[11px] font-semibold tracking-[0.12em] ${heading}`}>
                <EditableText
                  path={`s${i}.heading`}
                  text={s.heading}
                  editing={editing}
                  onCommit={commitEdit}
                  className={editMark}
                />
              </h4>
            )}
            {s.paragraphs?.map((p, j) => (
              <p key={j} className={`mb-1.5 text-[12px] leading-relaxed ${body}`}>
                <EditableText
                  path={`s${i}.p${j}`}
                  text={p}
                  editing={editing}
                  onCommit={commitEdit}
                  className={`block whitespace-pre-wrap ${editMark}`}
                />
              </p>
            ))}
            {s.bullets && (
              <ul className="space-y-1">
                {s.bullets.map((b, j) => (
                  <li key={j} className={`flex gap-1.5 text-[12px] leading-relaxed ${body}`}>
                    <span className={`mt-[3px] shrink-0 ${muted}`}>·</span>
                    <EditableText
                      path={`s${i}.b${j}`}
                      text={b}
                      editing={editing}
                      onCommit={commitEdit}
                      className={`flex-1 whitespace-pre-wrap ${editMark}`}
                    />
                  </li>
                ))}
              </ul>
            )}
            {s.pairs && (
              <dl className="space-y-1.5">
                {s.pairs.map((pair, j) => (
                  <div
                    key={j}
                    className={`rounded border px-2 py-1.5 ${
                      isAcademic ? 'border-parchment/10' : 'border-[#1a1a1a]/10'
                    }`}
                  >
                    <dt className={`text-[11.5px] font-medium ${body}`}>
                      <EditableText
                        path={`s${i}.kv${j}.key`}
                        text={pair.key}
                        editing={editing}
                        onCommit={commitEdit}
                        className={editMark}
                      />
                    </dt>
                    <dd className={`mt-0.5 text-[11.5px] leading-relaxed ${muted}`}>
                      <EditableText
                        path={`s${i}.kv${j}.value`}
                        text={pair.value}
                        editing={editing}
                        onCommit={commitEdit}
                        className={`block whitespace-pre-wrap ${editMark}`}
                      />
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </section>
        ))}

        {note.metrics && note.metrics.length > 0 && (
          <section>
            <h4 className={`mb-1 text-[11px] font-semibold tracking-[0.12em] ${heading}`}>怎么判断有没有价值</h4>
            <dl className="grid grid-cols-2 gap-1.5">
              {note.metrics.map((metric, i) => (
                <div
                  key={i}
                  className={`rounded border px-2 py-1.5 ${
                    isAcademic ? 'border-ember/20 bg-ember/[0.04]' : 'border-[#8a3a3a]/15 bg-[#8a3a3a]/[0.03]'
                  }`}
                >
                  <dt className={`text-[11.5px] font-medium leading-snug ${isAcademic ? 'text-ember' : 'text-[#8a3a3a]'}`}>
                    <EditableText
                      path={`m${i}.label`}
                      text={metric.label}
                      editing={editing}
                      onCommit={commitEdit}
                      className={editMark}
                    />
                  </dt>
                  <dd className={`mt-0.5 text-[10.5px] leading-relaxed ${muted}`}>
                    <EditableText
                      path={`m${i}.detail`}
                      text={metric.detail}
                      editing={editing}
                      onCommit={commitEdit}
                      className={`block whitespace-pre-wrap ${editMark}`}
                    />
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {note.qa && note.qa.length > 0 && (
          <section>
            <h4 className={`mb-1 text-[11px] font-semibold tracking-[0.12em] ${heading}`}>可能被追问</h4>
            <div className="space-y-2">
              {note.qa.map((item, i) => (
                <div
                  key={i}
                  className={`rounded border px-2 py-1.5 ${
                    isAcademic ? 'border-parchment/10' : 'border-[#1a1a1a]/10'
                  }`}
                >
                  <div className={`text-[11.5px] font-medium ${body}`}>
                    Q：
                    <EditableText
                      path={`q${i}.q`}
                      text={item.q}
                      editing={editing}
                      onCommit={commitEdit}
                      className={editMark}
                    />
                  </div>
                  <div className={`mt-0.5 text-[11.5px] leading-relaxed ${muted}`}>
                    A：
                    <EditableText
                      path={`q${i}.a`}
                      text={item.a}
                      editing={editing}
                      onCommit={commitEdit}
                      className={editMark}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <div className={`mt-2 shrink-0 flex items-center justify-between gap-2 text-[10.5px] ${muted}`}>
        {editing ? (
          <>
            <span data-testid="demo-note-edit-hint">编辑中 · Enter 保存 / Esc 撤销本处</span>
            <span className="flex items-center gap-2">
              <button
                type="button"
                data-testid="demo-note-reset"
                onClick={() => resetDemoNoteOverrides(note.id)}
                className="hover:opacity-100 opacity-70"
              >
                恢复默认
              </button>
              <button
                type="button"
                data-testid="demo-note-done"
                onClick={() => setEditing(false)}
                className="px-1.5 py-0.5 rounded border border-current hover:opacity-100 opacity-80"
              >
                完成
              </button>
            </span>
          </>
        ) : (
          <>
            <span className="opacity-40 select-none">默认只读</span>
            <button
              type="button"
              data-testid="demo-note-edit"
              onClick={() => setEditing(true)}
              className="px-1.5 py-0.5 rounded border border-current hover:opacity-100 opacity-70"
            >
              编辑
            </button>
          </>
        )}
      </div>
      </div>

      {/* 四角拖拽手柄：任一角都可拉大；左上角类会把面板顶开（转自由浮动） */}
      {(['nw', 'ne', 'sw', 'se'] as Corner[]).map((corner) => (
        <div
          key={corner}
          data-resize-handle={corner}
          data-testid={`demo-note-resize-${corner}`}
          onPointerDown={startResize(corner)}
          className={`absolute w-4 h-4 touch-none transition-colors ${
            corner === 'nw'
              ? '-left-[2px] -top-[2px] cursor-nwse-resize rounded-br'
              : corner === 'ne'
                ? '-right-[2px] -top-[2px] cursor-nesw-resize rounded-bl'
                : corner === 'sw'
                  ? '-left-[2px] -bottom-[2px] cursor-nesw-resize rounded-tr'
                  : '-right-[2px] -bottom-[2px] cursor-nwse-resize rounded-tl'
          } ${isAcademic ? 'hover:bg-ember/25' : 'hover:bg-[#8a3a3a]/20'}`}
        />
      ))}
    </div>,
    document.body
  )
}

/** 通用 `i` 触发器：与分组栏（GroupRibbon）同款的 italic 小圆钮，保持全应用一致 */
export function DemoInfoButton({
  noteId,
  testId,
  active,
  onClick,
  label = '查看说明',
  theme = 'academic',
  size = 'sm',
}: {
  noteId: DemoNote['id']
  testId: string
  active: boolean
  onClick: () => void
  label?: string
  theme?: BriefingTheme
  size?: 'sm' | 'icon'
}) {
  const isAcademic = theme !== 'newspaper'
  const hidden = useStore((s) => s.demoNotesHidden.includes(noteId))
  if (hidden) return null
  const base = active
    ? isAcademic
      ? 'border-ember/60 text-ember bg-ember/10'
      : 'border-[#8a3a3a]/60 text-[#8a3a3a] bg-[#8a3a3a]/10'
    : isAcademic
      ? 'border-parchment/15 text-parchment/30 hover:border-parchment/30 hover:text-parchment/60'
      : 'border-[#1a1a1a]/15 text-[#1a1a1a]/35 hover:border-[#1a1a1a]/30 hover:text-[#1a1a1a]/70'

  if (size === 'icon') {
    return (
      <button
        type="button"
        data-testid={testId}
        aria-pressed={active}
        aria-label={label}
        title={label}
        onClick={onClick}
        className={`shrink-0 w-7 h-7 rounded-full border flex items-center justify-center text-[11px] font-serif italic transition-colors ${base}`}
      >
        i
      </button>
    )
  }

  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={active}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`shrink-0 px-2.5 py-1 text-[11px] font-serif italic rounded-full border transition-colors ${base}`}
    >
      i
    </button>
  )
}
