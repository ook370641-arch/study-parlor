// src/components/PaintingCropButton.tsx
// 封面裁剪：缩略图完整原图 + 琥珀裁剪框（object-cover 可见窗口），拖拽实时联动封面，
// 松手经 paintings:setFocus 写回 Pictures/index.json。dev-only 入口（paintingsEditable）。
import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/store'
import { ipc } from '@/lib/ipc'
import { computeCropGeo, focusToRect, rectToFocus, DEFAULT_FOCUS, type CropGeo } from '@/lib/crop-geometry'

const clamp = (v: number, hi: number) => Math.max(0, Math.min(hi, v))

export function PaintingCropButton() {
  const painting = useStore(s => s.currentPaintings.cover)
  const editable = useStore(s => s.paintingsEditable)
  const setPaintingFocus = useStore(s => s.setPaintingFocus)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null)
  const [stageSize, setStageSize] = useState<{ w: number; h: number } | null>(null)
  const [viewport, setViewport] = useState({ w: 0, h: 0 })
  const stageRef = useRef<HTMLDivElement | null>(null)
  const originalFocusRef = useRef(DEFAULT_FOCUS)
  const geoRef = useRef<CropGeo | null>(null)
  const focusRef = useRef(DEFAULT_FOCUS)

  const focus = painting?.focus ?? DEFAULT_FOCUS
  focusRef.current = focus

  // 面板打开：记录原值（重置目标）+ 初始化视口
  useEffect(() => {
    if (!open) return
    originalFocusRef.current = focusRef.current
    setError(null)
    setImgSize(null)
    setViewport({ w: window.innerWidth, h: window.innerHeight })
  }, [open])

  // 视口 resize：裁剪框宽高比 = 封面视口宽高比，跟随重算
  useEffect(() => {
    if (!open) return
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [open])

  // 测量舞台（图片加载 / resize / 开合后）
  useEffect(() => {
    if (!open) return
    const el = stageRef.current
    if (el) setStageSize({ w: el.clientWidth, h: el.clientHeight })
  }, [open, imgSize, viewport])

  // Esc 关闭
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const geo = open && imgSize && stageSize
    ? computeCropGeo({ imgW: imgSize.w, imgH: imgSize.h, stageW: stageSize.w, stageH: stageSize.h, viewportW: viewport.w, viewportH: viewport.h })
    : null
  geoRef.current = geo

  if (!editable || !painting) return null

  const save = (f: string) => {
    void ipc.paintingsSetFocus({ id: painting.id, focus: f }).then(res => {
      if (!res.ok) setError(res.message)
    })
  }

  const onRectPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!geoRef.current) return
    e.preventDefault()
    const base = focusToRect(focusRef.current, geoRef.current)
    const startX = e.clientX
    const startY = e.clientY
    const move = (ev: PointerEvent) => {
      const g = geoRef.current
      if (!g) return
      const nl = clamp(base.left + ev.clientX - startX, g.rangeX)
      const nt = clamp(base.top + ev.clientY - startY, g.rangeY)
      setPaintingFocus('cover', rectToFocus(nl, nt, g))
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setError(null)
      save(focusRef.current)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const rect = geo ? focusToRect(focus, geo) : null

  return (
    <>
      <button
        data-testid="cover-crop-button"
        type="button"
        className="swap-btn"
        aria-label="裁剪画作"
        onClick={() => setOpen(v => !v)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
          <path d="M6 2v14a2 2 0 0 0 2 2h14" />
          <path d="M18 22V8a2 2 0 0 0-2-2H2" />
        </svg>
      </button>
      {open && (
        <>
          <div data-testid="cover-crop-overlay" className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            data-testid="cover-crop-panel"
            className="absolute top-14 right-4 z-20 w-[340px] rounded-lg border border-parchment/30
                       bg-[rgba(15,10,8,0.85)] backdrop-blur-md p-3 shadow-lg"
          >
            <div className="mb-2 text-xs text-parchment/60">裁剪画作 · 拖拽琥珀框，封面实时联动</div>
            <div ref={stageRef} data-testid="cover-crop-stage" className="relative w-full aspect-[2/1] overflow-hidden">
              <img
                src={painting.url}
                alt=""
                draggable={false}
                className="absolute max-w-none select-none"
                style={geo && imgSize
                  ? { width: imgSize.w * geo.s, height: imgSize.h * geo.s, left: geo.left, top: geo.top }
                  : { visibility: 'hidden' }}
                onLoad={e => setImgSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              />
              {geo && rect && (
                <div
                  data-testid="cover-crop-rect"
                  onPointerDown={onRectPointerDown}
                  className="absolute border-2 border-ember cursor-grab active:cursor-grabbing touch-none"
                  style={{
                    left: geo.left + rect.left,
                    top: geo.top + rect.top,
                    width: geo.rectW,
                    height: geo.rectH,
                    boxShadow: '0 0 0 9999px rgba(10,6,4,0.62)',
                  }}
                />
              )}
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span data-testid="cover-crop-readout" className="text-xs text-parchment/60">焦点 {focus}</span>
              <button
                type="button"
                data-testid="cover-crop-reset"
                className="text-xs text-parchment/60 hover:text-ember"
                onClick={() => { setPaintingFocus('cover', originalFocusRef.current); save(originalFocusRef.current) }}
              >
                重置
              </button>
            </div>
            {error && <div data-testid="cover-crop-error" className="mt-1 text-xs text-red-400">{error}</div>}
          </div>
        </>
      )}
    </>
  )
}
