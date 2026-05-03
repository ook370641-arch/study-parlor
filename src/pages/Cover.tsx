import { useEffect, useState } from 'react'
import { useStore } from '@/store'
import { Input } from '@/components/Input'
import { Button } from '@/components/Button'

export function Cover() {
  const profile = useStore(s => s.profile)
  const patchProfile = useStore(s => s.patchProfile)
  const goto = useStore(s => s.goto)
  const [name, setName] = useState('')

  // 已有 name → 1.5s 自动进 Home
  useEffect(() => {
    if (profile.name) {
      const t = setTimeout(() => goto('home'), 1500)
      return () => clearTimeout(t)
    }
  }, [profile.name])

  const onEnter = async () => {
    const n = name.trim()
    if (!n) return
    await patchProfile({ name: n })
    goto('home')
  }

  return (
    <div className="h-full flex flex-col items-center justify-center gap-8">
      <div className="w-[640px] aspect-video panel flex items-center justify-center text-parchment/30">
        {/* 占位插画框,待 image gen 后期填入 */}
        <span className="font-sans text-sm">[ 夜读插画 占位 ]</span>
      </div>

      {profile.name ? (
        <div className="text-2xl">夜深了,{profile.name}。</div>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <div className="font-sans text-parchment/60">第一次到来,告诉我你的名字</div>
          <Input value={name} onChange={e => setName(e.target.value)}
                 onKeyDown={e => e.key === 'Enter' && onEnter()}
                 placeholder="..."
                 autoFocus className="w-64 text-center text-lg" />
          <Button onClick={onEnter}>进入夜话</Button>
        </div>
      )}
    </div>
  )
}
