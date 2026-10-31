import { useEffect, useRef, useState, useCallback } from 'react'
import { flushSync } from 'react-dom'
import { ipc } from '@/lib/ipc'
import { isSelectionActiveIn } from '@/lib/selection-busy'
import { ANNOTATION_NOTE_SIZES, ANNOTATION_UI_SIZES } from '@/lib/briefing-font-size'
import { useStore } from '@/store'
import type { AnnotationHighlightColor, ArticleAnnotation, BriefingTheme, BriefingFontSize } from '@shared/index'

const HIGHLIGHT_COLORS: Record<AnnotationHighlightColor, string> = {
  ember: 'rgba(217,119,87,0.32)',
  gold: 'rgba(224,184,80,0.34)',
  green: 'rgba(104,166,120,0.32)',
  blue: 'rgba(100,149,207,0.32)',
}
const HIGHLIGHT_COLOR_ORDER: AnnotationHighlightColor[] = ['ember', 'gold', 'green', 'blue']

interface Props {
  articlePath: string
  articleRef: React.RefObject<HTMLElement | null>
  theme?: BriefingTheme
  briefingFontSize: BriefingFontSize
}

interface GhostData {
  text: string
  paraIndex: number
  left: number
  top: number
}

export function ArticleAnnotations({ articlePath, articleRef, theme = 'academic', briefingFontSize }: Props) {
  const isAcademic = theme !== 'newspaper'
  const noteSize = ANNOTATION_NOTE_SIZES[briefingFontSize]
  const uiSize = ANNOTATION_UI_SIZES[briefingFontSize]
  const annotationHighlightColor = useStore((s) => s.annotationHighlightColor) ?? 'gold'
  const setAnnotationHighlightColor = useStore((s) => s.setAnnotationHighlightColor)
  // 备注卡片估算高度（padding + 标题 + textarea×3 + 底部行）：判断上方空间是否足够，
  // 不足则翻转到锚点下方，避免卡片被裁剪出视口
  const CARD_EST_HEIGHT = 140
  // 翻转朝下时卡片与幽灵笔（高约 18px）之间的间距
  const GHOST_PEN_GAP = 22
  const [annotations, setAnnotations] = useState<ArticleAnnotation[]>([])
  const [openAnnoId, setOpenAnnoId] = useState<string | null>(null)
  const [ghost, setGhost] = useState<GhostData | null>(null)
  const [colorMenuOpen, setColorMenuOpen] = useState(false)
  const [selectionHighlights, setSelectionHighlights] = useState<Array<{ left: number; top: number; width: number; height: number }>>([])
  const [cardPos, setCardPos] = useState<{ left: number; top: number; below?: boolean } | null>(null)
  const [cardAnchorEl, setCardAnchorEl] = useState<HTMLElement | null>(null)
  const ghostRef = useRef<HTMLDivElement | null>(null)
  const markerSpansRef = useRef<Map<string, HTMLElement>>(new Map())
  const nextIdRef = useRef(1)
  const selectingRef = useRef(false)
  // Refs to avoid stale closure issues in event handlers
  const annotationsRef = useRef(annotations)
  annotationsRef.current = annotations
  const openAnnoIdRef = useRef(openAnnoId)
  openAnnoIdRef.current = openAnnoId
  const cardAnchorElRef = useRef(cardAnchorEl)
  cardAnchorElRef.current = cardAnchorEl

  // --- Load annotations ---
  useEffect(() => {
    ipc.annotationsRead(articlePath).then((list) => {
      setAnnotations(list)
      const maxId = list.reduce((max, a) => {
        const num = parseInt(a.id.replace('a', ''), 10)
        return num > max ? num : max
      }, 0)
      nextIdRef.current = maxId + 1
    }).catch((err) => {
      console.error('[anno] failed to read annotations:', err)
    })
  }, [articlePath])

  // --- Inject markers into DOM ---
  const applyMarkers = useCallback(() => {
    const container = articleRef.current
    if (!container || annotations.length === 0) return

    // Clean up old markers
    markerSpansRef.current.forEach((el) => {
      const parent = el.parentNode
      if (parent) {
        parent.replaceChild(document.createTextNode(el.getAttribute('data-anno-text') ?? ''), el)
      }
    })
    markerSpansRef.current.clear()

    const paragraphs = Array.from(container.querySelectorAll('p'))
    if (paragraphs.length === 0) return

    for (const anno of annotations) {
      const para = paragraphs[anno.paragraphIndex - 1]
      if (!para) continue
      applyMarkerToParagraph(para, anno)
    }
  }, [annotations, articleRef])

  function applyMarkerToParagraph(para: HTMLElement, anno: ArticleAnnotation) {
    // Find text node containing selectedText
    const walker = document.createTreeWalker(para, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        // Skip text inside existing anno-wrap
        const parent = node.parentElement
        if (parent?.closest('.anno-wrap')) return NodeFilter.FILTER_REJECT
        return NodeFilter.FILTER_ACCEPT
      },
    })

    let node: Text | null
    while ((node = walker.nextNode() as Text | null)) {
      const idx = node.textContent?.indexOf(anno.selectedText) ?? -1
      if (idx === -1) continue

      const before = node.textContent!.slice(0, idx)
      const match = node.textContent!.slice(idx, idx + anno.selectedText.length)
      const after = node.textContent!.slice(idx + anno.selectedText.length)

      const wrap = document.createElement('span')
      wrap.className = 'anno-wrap'
      wrap.setAttribute('data-anno-id', anno.id)
      wrap.setAttribute('data-anno-text', anno.selectedText)
      wrap.style.position = 'relative'
      wrap.style.display = 'inline'

      const textSpan = document.createElement('span')
      textSpan.setAttribute('data-testid', 'anno-marked-text')
      textSpan.className = 'anno-text'
      textSpan.style.background = anno.kind === 'highlight'
        ? HIGHLIGHT_COLORS[anno.highlightColor ?? 'gold']
        : isAcademic ? 'rgba(217,119,87,0.13)' : 'rgba(217,119,87,0.08)'
      textSpan.style.borderRadius = '2px'
      textSpan.style.padding = '1px 3px'
      if (anno.kind !== 'highlight') {
        textSpan.style.borderBottom = '1px dashed rgba(217,119,87,0.3)'
      }
      textSpan.textContent = match

      const pen = document.createElement('span')
      pen.setAttribute('data-testid', 'anno-marker-pen')
      pen.className = `anno-pen${anno.note ? ' has-note' : ''}`
      pen.setAttribute('data-anno-id', anno.id)
      pen.style.position = 'absolute'
      pen.style.top = '-9px'
      pen.style.right = '-7px'
      pen.style.display = 'inline-flex'
      pen.style.alignItems = 'center'
      pen.style.justifyContent = 'center'
      pen.style.width = '18px'
      pen.style.height = '18px'
      pen.style.cursor = 'pointer'
      pen.style.borderRadius = '50%'
      pen.style.border = '1.5px solid #d97757'
      pen.style.zIndex = '3'
      pen.style.transition = 'transform 0.15s, background 0.15s'
      pen.style.pointerEvents = 'none'
      pen.style.fontSize = uiSize.pen
      pen.style.lineHeight = '1'
      if (anno.note) {
        pen.style.background = '#d97757'
        pen.style.color = '#fff'
      } else {
        pen.style.background = isAcademic ? '#2a1f1a' : '#f5f2ed'
        pen.style.color = '#d97757'
      }
      pen.textContent = '✎'

      // Click handler on wrapper (not pen) so the pen doesn't block text selection
      wrap.addEventListener('click', (e) => {
        e.stopPropagation()
        handlePenClick(anno.id, wrap)
      })

      wrap.appendChild(textSpan)
      if (anno.kind !== 'highlight') wrap.appendChild(pen)

      const parent = node.parentNode!
      if (before) parent.insertBefore(document.createTextNode(before), node)
      parent.insertBefore(wrap, node)
      if (after) parent.insertBefore(document.createTextNode(after), node)
      parent.removeChild(node)

      markerSpansRef.current.set(anno.id, wrap)
      return // only first match
    }
  }

  // applyMarkers 的最新版本经 ref 暴露给 MutationObserver，避免闭包捕获旧 annotations
  const applyMarkersRef = useRef(applyMarkers)
  applyMarkersRef.current = applyMarkers
  const observerRef = useRef<MutationObserver | null>(null)

  // 执行 applyMarkers 时先断开 observer：
  // applyMarkers 自身的 DOM 变更若被 observer 记录会再次触发自身（无限循环）
  const pendingApplyRef = useRef(false)
  const runApplyMarkers = useCallback(() => {
    // Don't modify DOM during active text selection — it clears the browser selection.
    // 「选区未收敛」也算活跃：划选结束到 Ctrl+C 之间若拆分文本节点，复制会丢内容。
    if (isSelectionActiveIn(articleRef.current, selectingRef.current)) {
      pendingApplyRef.current = true
      return
    }
    const obs = observerRef.current
    const container = articleRef.current
    obs?.disconnect()
    applyMarkersRef.current()
    if (obs && container) {
      obs.observe(container, { childList: true, subtree: true })
    }
  }, [articleRef])

  // 选区收敛后补应用被延迟的 marker 重放
  useEffect(() => {
    const retry = () => {
      if (pendingApplyRef.current && !isSelectionActiveIn(articleRef.current, selectingRef.current)) {
        pendingApplyRef.current = false
        runApplyMarkers()
      }
    }
    document.addEventListener('mouseup', retry)
    document.addEventListener('selectionchange', retry)
    return () => {
      document.removeEventListener('mouseup', retry)
      document.removeEventListener('selectionchange', retry)
    }
  }, [articleRef, runApplyMarkers])

  // annotations 或文章变化时重放标记（100ms settle 等 ArticleBodyChunks 写完 DOM）
  useEffect(() => {
    const timer = setTimeout(runApplyMarkers, 100)
    return () => clearTimeout(timer)
  }, [annotations, articlePath, runApplyMarkers])

  // 兄弟组件（ArticleBodyChunks）命令式替换文章 DOM 时重放标记。
  // 替代原先「每次渲染后全量 TreeWalker」的轮询 —— 那是展开列/滚动/导读拖拽卡顿的主因。
  useEffect(() => {
    const container = articleRef.current
    if (!container) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const observer = new MutationObserver(() => {
      clearTimeout(timer)
      timer = setTimeout(runApplyMarkers, 100)
    })
    observerRef.current = observer
    observer.observe(container, { childList: true, subtree: true })
    return () => {
      clearTimeout(timer)
      observer.disconnect()
      if (observerRef.current === observer) observerRef.current = null
    }
  }, [articleRef, articlePath, runApplyMarkers])

  // --- Handle annotation marker click ---
  function handlePenClick(annoId: string, anchorEl: HTMLElement) {
    setOpenAnnoId(annoId)
    setCardAnchorEl(anchorEl)

    const container = articleRef.current
    if (container) {
      const anchorRect = anchorEl.getBoundingClientRect()
      // 绝对定位的锚点是 reader 的 relative 内容容器（article 的 offsetParent），
      // 不是 article 本身 —— article 上方还有 header，两者原点不同
      const origin = (container.offsetParent as HTMLElement | null) ?? container
      const originRect = origin.getBoundingClientRect()
      // 卡片默认向上弹出（translateY(-100%)）。锚点距容器顶部不足卡片高度时
      // 上方会被裁剪到视口外（选中首段加备注时保存按钮不可达），翻转到锚点下方。
      const spaceAbove = anchorRect.top - originRect.top
      const below = spaceAbove < CARD_EST_HEIGHT
      setCardPos({
        left: anchorRect.left - originRect.left - 4,
        top: anchorRect.top - originRect.top - 10,
        below,
      })
    }
  }

  // --- E2E helper: bypass DOM event system for reliable ghost pen triggering ---
  useEffect(() => {
    const container = articleRef.current
    if (!container) return

    ;(window as any).__e2e_triggerGhostPen = (paraEl: Element, startOffset: number, endOffset: number) => {
      const firstText = Array.from(paraEl.childNodes).find(
        (n): n is Text => n.nodeType === Node.TEXT_NODE && (n.textContent?.length ?? 0) > 0,
      )
      if (!firstText) return

      const range = document.createRange()
      range.setStart(firstText, Math.min(startOffset, firstText.textContent?.length ?? 0))
      range.setEnd(firstText, Math.min(endOffset, firstText.textContent?.length ?? 0))

      const sel = window.getSelection()
      if (!sel) return
      sel.removeAllRanges()
      sel.addRange(range)

      const text = sel.toString().trim()
      if (text.length < 2) return

      const endRange = range.cloneRange()
      endRange.collapse(false)
      const endRect = endRange.getBoundingClientRect()
      // 绝对定位的锚点是 reader 的 relative 内容容器（article 的 offsetParent），
      // 不是 article 本身 —— article 上方还有 header，两者原点不同
      const origin = (container.offsetParent as HTMLElement | null) ?? container
      const originRect = origin.getBoundingClientRect()

      // Mirror handleMouseUp: persistent highlight overlay rects
      const rects = Array.from(range.getClientRects()).map((r) => ({
        left: r.left - originRect.left,
        top: r.top - originRect.top,
        width: r.width,
        height: r.height,
      }))

      const paras = Array.from(container.querySelectorAll('p'))
      const paraIndex = paras.indexOf(paraEl as HTMLParagraphElement) + 1

      setOpenAnnoId(null)
      setCardPos(null)
      setCardAnchorEl(null)
      setSelectionHighlights(rects)
      setGhost({
        text,
        paraIndex,
        left: endRect.right - originRect.left + 2,
        top: endRect.top - originRect.top - 14,
      })
    }

    return () => {
      delete (window as any).__e2e_triggerGhostPen
    }
  }, [articleRef])

  // --- Handle text selection (ghost pen) ---
  useEffect(() => {
    const container = articleRef.current
    if (!container) return

    const handleMouseUp = () => {
      selectingRef.current = false
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || !sel.rangeCount) return
      const range = sel.getRangeAt(0)
      if (!container.contains(range.commonAncestorContainer)) return
      const text = sel.toString().trim()
      if (text.length < 2) return

      // Close any open card
      setOpenAnnoId(null)
      setCardPos(null)
      setCardAnchorEl(null)

      // Get position at end of selection
      const endRange = range.cloneRange()
      endRange.collapse(false)
      const endRect = endRange.getBoundingClientRect()
      const origin = (container.offsetParent as HTMLElement | null) ?? container
      const originRect = origin.getBoundingClientRect()

      const rects = Array.from(range.getClientRects()).map((r) => ({
        left: r.left - originRect.left,
        top: r.top - originRect.top,
        width: r.width,
        height: r.height,
      }))

      let paraIndex = 1
      let node: Node | null = range.commonAncestorContainer
      while (node && node !== container) {
        if (node.nodeName === 'P') {
          const paras = Array.from(container.querySelectorAll('p'))
          paraIndex = paras.indexOf(node as HTMLParagraphElement) + 1
          break
        }
        node = node.parentNode
      }

      flushSync(() => {
        setGhost(null)
        setColorMenuOpen(false)
        setSelectionHighlights([])
      })

      flushSync(() => {
        setSelectionHighlights(rects)
        setGhost({
          text,
          paraIndex,
          left: endRect.right - originRect.left + 2,
          top: endRect.top - originRect.top - 14,
        })
      })
    }

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      // Track potential text selection start — prevents applyMarkers from modifying
      // DOM during drag-selection, which would clear the browser's selection range
      if (container.contains(target)) {
        selectingRef.current = true
      }
      // Only clear ghost + highlight when clicking truly outside the active selection UI
      const isInsideGhost = ghostRef.current?.contains(target) ?? false
      const isInsideHighlight = target.closest('[data-testid="anno-selection-highlight"]') !== null
      const isInsideMarker = target.closest('.anno-wrap') !== null
      const isInsideNoteCard = target.closest('[data-testid="anno-note-card"]') !== null

      if (!isInsideGhost && !isInsideHighlight && !isInsideMarker && !isInsideNoteCard) {
        setGhost(null)
        setColorMenuOpen(false)
        setSelectionHighlights([])
      }
      // Close card if clicking outside BOTH the marker pen and the note card.
      // Defer via setTimeout so React state updates don't disrupt text selection
      // initiation which also happens on mousedown.
      const anchorEl = cardAnchorElRef.current
      if (
        anchorEl &&
        !anchorEl.contains(target) &&
        !target.closest('[data-testid="anno-note-card"]')
      ) {
        setTimeout(() => doSaveAndClose(), 0)
      }
    }

    document.addEventListener('mouseup', handleMouseUp)
    document.addEventListener('mousedown', handleMouseDown)
    return () => {
      document.removeEventListener('mouseup', handleMouseUp)
      document.removeEventListener('mousedown', handleMouseDown)
    }
  }, [articleRef])

  // --- Create annotation from ghost pen ---
  function handleGhostClick() {
    if (!ghost) return

    const id = `a${nextIdRef.current++}`
    const now = new Date().toISOString().slice(0, 10)
    const newAnno: ArticleAnnotation = {
      id,
      selectedText: ghost.text,
      note: '',
      paragraphIndex: ghost.paraIndex,
      createdAt: now,
      updatedAt: now,
    }

    const updated = [...annotations, newAnno]
    setAnnotations(updated)
    setGhost(null)
    setColorMenuOpen(false)
    // Temporary overlay is replaced by the permanent marker (anno-text span)
    setSelectionHighlights([])

    // Apply marker for the new annotation
    setTimeout(() => {
      applyMarkers()
      // Open the card for the new annotation
      const wrapEl = markerSpansRef.current.get(id) as HTMLElement | null
      if (wrapEl) handlePenClick(id, wrapEl)
    }, 150)

    // Save immediately (empty note, marker exists)
    ipc.annotationsWrite(articlePath, updated)
  }

  function handleHighlightClick() {
    if (!ghost) return

    const id = `a${nextIdRef.current++}`
    const now = new Date().toISOString().slice(0, 10)
    const newAnno: ArticleAnnotation = {
      id,
      selectedText: ghost.text,
      note: '',
      paragraphIndex: ghost.paraIndex,
      createdAt: now,
      updatedAt: now,
      kind: 'highlight',
      highlightColor: annotationHighlightColor,
    }

    const updated = [...annotations, newAnno]
    setAnnotations(updated)
    setGhost(null)
    setColorMenuOpen(false)
    setSelectionHighlights([])
    ipc.annotationsWrite(articlePath, updated)
  }

  // --- Save and close card ---
  function doSaveAndClose() {
    const annoId = openAnnoIdRef.current
    if (!annoId) return
    // Read textarea value before unmounting
    const ta = document.querySelector('.anno-note-textarea') as HTMLTextAreaElement | null
    const noteText = ta?.value?.trim() ?? ''
    const currentAnno = annotationsRef.current.find((a) => a.id === annoId)
    if (currentAnno && noteText !== currentAnno.note) {
      handleSaveNote(annoId, noteText)
    }
    setOpenAnnoId(null)
    setCardPos(null)
    setCardAnchorEl(null)
  }

  function handleSaveNote(annoId: string, noteText: string) {
    const now = new Date().toISOString().slice(0, 10)
    const updated = annotationsRef.current.map((a) =>
      a.id === annoId
        ? { ...a, note: noteText, updatedAt: now, createdAt: a.createdAt || now }
        : a
    )
    setAnnotations(updated)
    ipc.annotationsWrite(articlePath, updated)

    // Update pen style
    const pen = markerSpansRef.current.get(annoId)?.querySelector('.anno-pen') as HTMLElement | null
    if (pen && noteText) {
      pen.style.background = '#d97757'
      pen.style.color = '#fff'
    }
  }

  function handleDeleteAnnotation(annoId: string) {
    const wrap = markerSpansRef.current.get(annoId)
    if (wrap) {
      const text = wrap.getAttribute('data-anno-text') ?? ''
      wrap.parentNode?.replaceChild(document.createTextNode(text), wrap)
      markerSpansRef.current.delete(annoId)
    }
    const updated = annotations.filter((a) => a.id !== annoId)
    setAnnotations(updated)
    setOpenAnnoId(null)
    setCardPos(null)
    setCardAnchorEl(null)
    ipc.annotationsWrite(articlePath, updated)
  }

  function handleHighlightColorChange(annoId: string, color: AnnotationHighlightColor) {
    const now = new Date().toISOString().slice(0, 10)
    const updated = annotations.map((a) =>
      a.id === annoId ? { ...a, highlightColor: color, updatedAt: now } : a
    )
    setAnnotations(updated)
    ipc.annotationsWrite(articlePath, updated)
  }

  // --- E2E helpers for save/delete: bypass DOM event system ---
  useEffect(() => {
    ;(window as any).__e2e_saveAnnotation = () => {
      const ta = document.querySelector('.anno-note-textarea') as HTMLTextAreaElement | null
      const noteText = ta?.value?.trim() ?? ''
      if (!openAnnoId) return
      const currentAnno = annotations.find((a) => a.id === openAnnoId)
      if (currentAnno && noteText !== currentAnno.note) {
        handleSaveNote(openAnnoId, noteText)
      }
      setOpenAnnoId(null)
      setCardPos(null)
      setCardAnchorEl(null)
    }
    ;(window as any).__e2e_deleteAnnotation = (annoId?: string) => {
      const id = annoId ?? openAnnoIdRef.current
      if (!id) return
      handleDeleteAnnotation(id)
    }
    return () => {
      delete (window as any).__e2e_saveAnnotation
      delete (window as any).__e2e_deleteAnnotation
    }
  })

  const openAnno = annotations.find((a) => a.id === openAnnoId)

  // Card colors by theme
  const cardBg = isAcademic ? '#241b16' : '#f5f2ed'
  const cardText = isAcademic ? '#d4c5b0' : '#1a1a1a'
  const cardMuted = isAcademic ? '#8a7a6a' : '#6b5d52'
  const cardBorder = '#d97757'

  return (
    <>
      {/* Persistent selection highlight overlay (same coordinate space as the ghost pen) */}
      {selectionHighlights.map((rect, i) => (
        <div
          key={`hl-${i}`}
          data-testid="anno-selection-highlight"
          style={{
            position: 'absolute',
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
            background: isAcademic ? 'rgba(217,119,87,0.13)' : 'rgba(217,119,87,0.08)',
            borderRadius: '2px',
            pointerEvents: 'none',
            zIndex: 2,
          }}
        />
      ))}

      {/* Selection annotation tools */}
      {ghost && (
        <div
          ref={ghostRef}
          style={{
            position: 'absolute',
            left: ghost.left,
            top: ghost.top,
            display: 'flex',
            alignItems: 'center',
            zIndex: 20,
            background: isAcademic ? '#2a1f1a' : '#f5f2ed',
            borderRadius: '4px',
            border: '1.5px solid #d97757',
            fontSize: uiSize.pen,
            lineHeight: '1',
            color: '#d97757',
          }}
        >
          <button
            data-testid="anno-ghost-pen"
            title="备注"
            onClick={handleGhostClick}
            style={{
              width: '22px', height: '22px', padding: 0, border: 'none',
              background: 'transparent', color: '#d97757', cursor: 'pointer',
              fontSize: uiSize.pen, animation: 'ghostPulse 0.7s ease-in-out infinite alternate',
            }}
          >
            ✎
          </button>
          <button
            data-testid="anno-highlight-button"
            title="高亮"
            onClick={handleHighlightClick}
            style={{
              width: '24px', height: '22px', padding: 0, border: 'none',
              borderLeft: '1px solid rgba(217,119,87,0.4)',
              background: HIGHLIGHT_COLORS[annotationHighlightColor],
              color: isAcademic ? '#e8d5b7' : '#2a1f1a', cursor: 'pointer',
            }}
          >
            ▰
          </button>
          <button
            data-testid="anno-highlight-color-toggle"
            title="选择高亮色"
            onClick={() => setColorMenuOpen((open) => !open)}
            style={{
              width: '18px', height: '22px', padding: 0, border: 'none',
              borderLeft: '1px solid rgba(217,119,87,0.4)',
              background: 'transparent', color: '#d97757', cursor: 'pointer', fontSize: '9px',
            }}
          >
            ▾
          </button>
          {colorMenuOpen && (
            <div
              data-testid="anno-highlight-color-menu"
              style={{
                position: 'absolute', top: '26px', right: 0, display: 'flex', gap: '4px',
                padding: '5px', background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: '4px',
              }}
            >
              {HIGHLIGHT_COLOR_ORDER.map((color) => (
                <button
                  key={color}
                  data-testid={`anno-highlight-color-${color}`}
                  title={color}
                  onClick={() => {
                    setAnnotationHighlightColor(color)
                    setColorMenuOpen(false)
                  }}
                  style={{
                    width: '18px', height: '18px', padding: 0, cursor: 'pointer',
                    background: HIGHLIGHT_COLORS[color], border: `1px solid ${color === annotationHighlightColor ? cardBorder : 'transparent'}`,
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Note card */}
      {openAnnoId && openAnno && cardPos && (
        <div
          data-testid="anno-note-card"
          style={{
            position: 'absolute',
            left: cardPos.left,
            top: cardPos.below ? cardPos.top + GHOST_PEN_GAP : cardPos.top - 12,
            minWidth: '280px',
            maxWidth: '400px',
            background: cardBg,
            borderLeft: `3px solid ${cardBorder}`,
            borderRadius: '0 6px 6px 0',
            padding: '0.85rem 1rem',
            zIndex: 25,
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
            transform: cardPos.below ? undefined : 'translateY(-100%)',
          }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Triangle pointer */}
          <div
            style={{
              position: 'absolute',
              ...(cardPos.below
                ? { top: '-6px', borderBottom: `6px solid ${cardBg}`, borderTop: 'none' }
                : { bottom: '-6px', borderTop: `6px solid ${cardBg}` }),
              left: '12px',
              width: 0,
              height: 0,
              borderLeft: '6px solid transparent',
              borderRight: '6px solid transparent',
            }}
          />

          <div style={{ fontSize: uiSize.small, letterSpacing: '0.15em', color: cardBorder, marginBottom: '6px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>{openAnno.kind === 'highlight' ? '高亮' : '🖊️ 备注'}</span>
          </div>

          {openAnno.kind !== 'highlight' && (
          <textarea
            autoFocus
            data-testid="anno-note-textarea"
            className="anno-note-textarea"
            defaultValue={openAnno.note}
            placeholder="写下你的想法…"
            rows={3}
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: cardText,
              fontSize: noteSize,
              fontStyle: 'italic',
              lineHeight: '1.6',
              fontFamily: 'Georgia, serif',
              resize: 'none',
              padding: 0,
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') doSaveAndClose()
            }}
          />
          )}

          <div style={{ marginTop: '8px', fontSize: uiSize.small, color: cardMuted, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>{openAnno.createdAt ? `${openAnno.createdAt} · §${openAnno.paragraphIndex}` : '新备注'}</span>
            {openAnno.kind === 'highlight' && HIGHLIGHT_COLOR_ORDER.map((color) => (
              <button
                key={color}
                data-testid={`anno-highlight-color-${color}`}
                title={color}
                onClick={() => handleHighlightColorChange(openAnno.id, color)}
                style={{
                  width: '18px', height: '18px', padding: 0, cursor: 'pointer',
                  background: HIGHLIGHT_COLORS[color],
                  border: `1px solid ${color === (openAnno.highlightColor ?? 'gold') ? cardBorder : 'transparent'}`,
                }}
              />
            ))}
            <button
              data-testid="anno-delete-button"
              onClick={() => handleDeleteAnnotation(openAnnoId)}
              style={{
                background: 'none',
                border: '1px solid rgba(180,80,80,0.3)',
                color: '#a06060',
                fontSize: uiSize.small,
                padding: '2px 8px',
                borderRadius: '3px',
                cursor: 'pointer',
                fontFamily: 'Georgia, serif',
                marginLeft: 'auto',
              }}
            >
              删除
            </button>
          </div>
        </div>
      )}

      {/* Ghost pen pulse keyframes */}
      <style>{`
        @keyframes ghostPulse {
          from { box-shadow: 0 0 0 2px rgba(217, 119, 87, 0.2); }
          to   { box-shadow: 0 0 0 6px rgba(217, 119, 87, 0.05); }
        }
      `}</style>
    </>
  )
}
