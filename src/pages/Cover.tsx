import { useState } from 'react'
import { useStore } from '@/store'
import { Input } from '@/components/Input'
import { Button } from '@/components/Button'
import { SurfaceBackground } from '@/components/SurfaceBackground'
import { SwapPaintingButton } from '@/components/SwapPaintingButton'

export function Cover() {
  const profile = useStore(s => s.profile)
  const patchProfile = useStore(s => s.patchProfile)
  const goto = useStore(s => s.goto)
  const [name, setName] = useState('')

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

      <SwapPaintingButton surface="cover" className="absolute top-4 right-4" />

      <div className="absolute bottom-12 left-12 flex flex-col items-start gap-4 max-w-[380px] z-[5]"
           style={{ textShadow: '0 1px 8px rgba(0,0,0,0.6)' }}>
        {profile.name ? (
          <>
            <div className="text-2xl">迷路了吗，{profile.name}</div>
            <Button onClick={() => goto('home')}>点亮灯火</Button>
          </>
        ) : (
          <>
            <div className="font-sans text-parchment/60">第一次到来,告诉我你的名字</div>
            <Input value={name} onChange={e => setName(e.target.value)}
                   onKeyDown={e => e.key === 'Enter' && onEnter()}
                   placeholder="..."
                   autoFocus className="w-64 text-lg" />
            <Button onClick={onEnter}>进入夜话</Button>
          </>
        )}
      </div>
    </div>
  )
}
