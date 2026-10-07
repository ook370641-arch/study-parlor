import { useState } from 'react'
import { useStore } from '@/store'
import { Input } from '@/components/Input'
import { Button } from '@/components/Button'
import { SurfaceBackground } from '@/components/SurfaceBackground'
import { SwapPaintingButton } from '@/components/SwapPaintingButton'
import { DeletePaintingButton } from '@/components/DeletePaintingButton'
import { PaintingCropButton } from '@/components/PaintingCropButton'
import { Quote } from '@/components/Quote'

export function Cover() {
  const profile = useStore(s => s.profile)
  const patchProfile = useStore(s => s.patchProfile)
  const goto = useStore(s => s.goto)
  const paintingDeleteEnabled = useStore(s => s.paintingDeleteEnabled)
  const coverNotepad = useStore(s => s.coverNotepad)
  const setCoverNotepad = useStore(s => s.setCoverNotepad)
  const [name, setName] = useState('')
  const [notepadOpen, setNotepadOpen] = useState(false)

  const briefingButtonClass = `bg-parchment text-ink shadow-[3px_3px_0_0_#d97757]
    hover:translate-x-[1px] hover:translate-y-[1px]
    hover:shadow-[2px_2px_0_0_#d97757]
    active:translate-x-[3px] active:translate-y-[3px]
    active:shadow-none
    transition-[transform,box-shadow] duration-100`

  const onEnter = async () => {
    const n = name.trim()
    if (!n) return
    await patchProfile({ name: n })
    goto('home')
  }

  return (
    <div className="relative h-full w-full overflow-hidden">
      <SurfaceBackground surface="cover" />

      <div className="absolute inset-0 pointer-events-none
                      shadow-[inset_0_0_120px_rgba(0,0,0,0.55)]" />

      <div className="absolute top-4 right-4 flex items-center gap-2">
        <SwapPaintingButton surface="cover" />
        {paintingDeleteEnabled && <DeletePaintingButton surface="cover" />}
        <PaintingCropButton />
        <button
          data-testid="cover-notepad-button"
          type="button"
          className="swap-btn"
          aria-label="记事板"
          onClick={() => setNotepadOpen(v => !v)}
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
      </div>

      {notepadOpen && (
        <div className="absolute top-14 right-4 z-20 w-80 rounded-lg border border-parchment/30
                        bg-[rgba(15,10,8,0.85)] backdrop-blur-md p-3 shadow-lg">
          <div className="mb-2 text-xs text-parchment/60">迭代记事板 · 自动保存</div>
          <textarea
            data-testid="cover-notepad-textarea"
            value={coverNotepad}
            onChange={e => setCoverNotepad(e.target.value)}
            placeholder="记下可以迭代的点……"
            rows={10}
            className="w-full resize-y rounded bg-transparent p-2 text-sm text-parchment
                       placeholder:text-parchment/40 border border-parchment/20
                       focus:outline-none focus:border-ember/60"
          />
        </div>
      )}

      <div className="absolute bottom-12 left-12 right-12 z-[5] flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6">
        <div className="flex flex-col items-start gap-4 max-w-[380px]"
             style={{ textShadow: '0 1px 8px rgba(0,0,0,0.6)' }}>
        {profile.name ? (
          <>
            <div className="text-2xl">迷路了吗，{profile.name}</div>
            <Button data-testid="cover-light-button" onClick={() => goto('home')}>点亮灯火</Button>
            <Button
              data-testid="cover-briefing-button"
              onClick={() => goto('briefing')}
              className={briefingButtonClass}
            >
              夜航简报
            </Button>
          </>
        ) : (
          <>
            <div className="font-sans text-parchment/60">第一次到来,告诉我你的名字</div>
            <Input data-testid="cover-name-input" value={name} onChange={e => setName(e.target.value)}
                   onKeyDown={e => e.key === 'Enter' && onEnter()}
                   placeholder="..."
                   autoFocus className="w-64 text-lg" />
            <Button data-testid="cover-enter-button" onClick={onEnter} disabled={!name.trim()}>进入夜话</Button>
            <Button
              data-testid="cover-briefing-button"
              onClick={() => goto('briefing')}
              disabled={!name.trim()}
              className={briefingButtonClass}
            >
              夜航简报
            </Button>
          </>
        )}
        </div>
        <Quote surface="cover" />
      </div>
    </div>
  )
}
