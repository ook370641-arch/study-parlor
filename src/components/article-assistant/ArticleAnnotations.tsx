import { useEffect, useRef, useState, useCallback } from 'react'
import { ipc } from '@/lib/ipc'
import type { ArticleAnnotation, BriefingTheme } from '@shared/index'

interface Props {
  articlePath: string
  articleRef: React.RefObject<HTMLElement | null>
  theme?: BriefingTheme
}

interface GhostData {
  text: string
  paraIndex: number
  left: number
  top: number
}

export function ArticleAnnotations({ articlePath, articleRef, theme = 'academic' }: Props) {
  const isAcademic = theme !== 'newspaper'
  const [annotations, setAnnotations] = useState<ArticleAnnotation[]>([])
  const [openAnnoId, setOpenAnnoId] = useState<string | null>(null)
  const [ghost, setGhost] = useState<GhostData | null>(null)
  const [selectionHighlights, setSelectionHighlights] = useState<Array<{ left: number; top: number; width: number; height: number }>>([])
  const [cardPos, setCardPos] = useState<{ left: number; top: number } | null>(null)
  const [cardAnchorEl, setCardAnchorEl] = useState<HTMLElement | null>(null)
  const ghostRef = useRef<HTMLDivElement | null>(null)
  const markerSpansRef = useRef<Map<string, HTMLElement>>(new Map())
  const nextIdRef = useRef(1)
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
      textSpan.style.background = isAcademic ? 'rgba(217,119,87,0.13)' : 'rgba(217,119,87,0.08)'
      textSpan.style.borderRadius = '2px'
      textSpan.style.padding = '1px 3px'
      textSpan.style.borderBottom = '1px dashed rgba(217,119,87,0.3)'
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
      pen.style.fontSize = '11px'
      pen.style.lineHeight = '1'
      if (anno.note) {
        pen.style.background = '#d97757'
        pen.style.color = '#fff'
      } else {
        pen.style.background = isAcademic ? '#2a1f1a' : '#f5f2ed'
        pen.style.color = '#d97757'
      }
      pen.textContent = '✎'

      pen.addEventListener('click', (e) => {
        e.stopPropagation()
        handlePenClick(anno.id, pen)
      })

      wrap.appendChild(textSpan)
      wrap.appendChild(pen)

      const parent = node.parentNode!
      if (before) parent.insertBefore(document.createTextNode(before), node)
      parent.insertBefore(wrap, node)
      if (after) parent.insertBefore(document.createTextNode(after), node)
      parent.removeChild(node)

      markerSpansRef.current.set(anno.id, wrap)
      return // only first match
    }
  }

  useEffect(() => {
    // Re-apply markers when DOM settles.
    // No dependency array: runs after every render because sibling components
    // (ArticleBodyChunks) can imperatively replace the article's inner HTML
    // without this component's props changing, destroying injected markers.
    const timer = setTimeout(applyMarkers, 100)
    return () => clearTimeout(timer)
  })

  // --- Handle pen click ---
  function handlePenClick(annoId: string, penEl: HTMLElement) {
    setOpenAnnoId(annoId)
    setCardAnchorEl(penEl)

    const container = articleRef.current
    if (container) {
      const penRect = penEl.getBoundingClientRect()
      // 绝对定位的锚点是 reader 的 relative 内容容器（article 的 offsetParent），
      // 不是 article 本身 —— article 上方还有 header，两者原点不同
      const origin = (container.offsetParent as HTMLElement | null) ?? container
      const originRect = origin.getBoundingClientRect()
      setCardPos({
        left: penRect.left - originRect.left - 4,
        top: penRect.top - originRect.top - 10,
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
      // rAF + setTimeout(0) lets the browser settle the selection before we read it
      requestAnimationFrame(() => {
        setTimeout(() => {
          // Clean up old ghost + highlight overlay (a new selection replaces them)
          setGhost(null)
          setSelectionHighlights([])

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
          // 绝对定位的锚点是 reader 的 relative 内容容器（article 的 offsetParent），
          // 不是 article 本身 —— article 上方还有 header，两者原点不同。
          // 坐标 = 视口坐标 - 原点视口坐标（两者同帧测量，滚动自然抵消）
          const origin = (container.offsetParent as HTMLElement | null) ?? container
          const originRect = origin.getBoundingClientRect()

          // Persistent highlight overlay: one rect per selected line
          const rects = Array.from(range.getClientRects()).map((r) => ({
            left: r.left - originRect.left,
            top: r.top - originRect.top,
            width: r.width,
            height: r.height,
          }))
          setSelectionHighlights(rects)

          // Find paragraph index
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

          setGhost({
            text,
            paraIndex,
            left: endRect.right - originRect.left + 2,
            top: endRect.top - originRect.top - 14,
          })
        }, 0)
      })
    }

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      // Clear ghost + highlights only when the click is outside the ghost pen
      // and not on an existing annotation marker
      if (ghostRef.current && !ghostRef.current.contains(target)) {
        if (!target.closest('.anno-wrap')) {
          setGhost(null)
          setSelectionHighlights([])
        }
      } else if (!ghostRef.current) {
        // No ghost pen — clicking anywhere dismisses any leftover highlight
        setSelectionHighlights([])
      }
      // Close card if clicking outside BOTH the marker pen and the note card
      const anchorEl = cardAnchorElRef.current
      if (
        anchorEl &&
        !anchorEl.contains(e.target as Node) &&
        !(e.target as HTMLElement).closest('[data-testid="anno-note-card"]')
      ) {
        doSaveAndClose()
      }
    }

    container.addEventListener('mouseup', handleMouseUp)
    document.addEventListener('mousedown', handleMouseDown)
    return () => {
      container.removeEventListener('mouseup', handleMouseUp)
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
    // Temporary overlay is replaced by the permanent marker (anno-text span)
    setSelectionHighlights([])

    // Apply marker for the new annotation
    setTimeout(() => {
      applyMarkers()
      // Open the card for the new annotation
      const penEl = markerSpansRef.current.get(id)?.querySelector('.anno-pen') as HTMLElement | null
      if (penEl) handlePenClick(id, penEl)
    }, 150)

    // Save immediately (empty note, marker exists)
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
    const updated = annotations.map((a) =>
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

      {/* Ghost pen */}
      {ghost && (
        <div
          ref={ghostRef}
          data-testid="anno-ghost-pen"
          onClick={handleGhostClick}
          style={{
            position: 'absolute',
            left: ghost.left,
            top: ghost.top,
            width: '18px',
            height: '18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            zIndex: 20,
            background: isAcademic ? '#2a1f1a' : '#f5f2ed',
            borderRadius: '50%',
            border: '1.5px solid #d97757',
            fontSize: '11px',
            lineHeight: '1',
            color: '#d97757',
            animation: 'ghostPulse 0.7s ease-in-out infinite alternate',
          }}
        >
          ✎
        </div>
      )}

      {/* Note card */}
      {openAnnoId && openAnno && cardPos && (
        <div
          data-testid="anno-note-card"
          style={{
            position: 'absolute',
            left: cardPos.left,
            top: cardPos.top - 12,
            minWidth: '280px',
            maxWidth: '400px',
            background: cardBg,
            borderLeft: `3px solid ${cardBorder}`,
            borderRadius: '0 6px 6px 0',
            padding: '0.85rem 1rem',
            zIndex: 25,
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
            transform: 'translateY(-100%)',
          }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Triangle pointer */}
          <div
            style={{
              position: 'absolute',
              bottom: '-6px',
              left: '12px',
              width: 0,
              height: 0,
              borderLeft: '6px solid transparent',
              borderRight: '6px solid transparent',
              borderTop: `6px solid ${cardBg}`,
            }}
          />

          <div style={{ fontSize: '10px', letterSpacing: '0.15em', color: cardBorder, marginBottom: '6px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>🖊️ 备注</span>
          </div>

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
              fontSize: '13px',
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

          <div style={{ marginTop: '8px', fontSize: '10px', color: cardMuted, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>{openAnno.createdAt ? `${openAnno.createdAt} · §${openAnno.paragraphIndex}` : '新备注'}</span>
            <button
              data-testid="anno-save-button"
              onClick={() => {
                doSaveAndClose()
              }}
              style={{
                background: cardBorder,
                border: 'none',
                color: '#fff',
                fontSize: '10px',
                padding: '3px 12px',
                borderRadius: '3px',
                cursor: 'pointer',
                fontFamily: 'Georgia, serif',
                marginLeft: 'auto',
              }}
            >
              保存
            </button>
            {openAnno.note && (
              <button
                data-testid="anno-delete-button"
                onClick={() => handleDeleteAnnotation(openAnnoId)}
                style={{
                  background: 'none',
                  border: '1px solid rgba(180,80,80,0.3)',
                  color: '#a06060',
                  fontSize: '10px',
                  padding: '2px 8px',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  fontFamily: 'Georgia, serif',
                }}
              >
                删除
              </button>
            )}
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
