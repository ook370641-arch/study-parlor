import { useEffect } from 'react'
import { useStore } from '@/store'
import { Button } from '@/components/Button'
import { RecCard } from '@/components/RecCard'
import { InspirationChip } from '@/components/InspirationChip'
import { FileLibrary } from '@/components/FileLibrary'
import { ipc } from '@/lib/ipc'
import { pickRecommendations } from '@electron/lib/recommend'

export function Home() {
  const recommendation = useStore(s => s.recommendation)
  const inspirations = useStore(s => s.inspirations)
  const profile = useStore(s => s.profile)
  const library = useStore(s => s.library)
  const setRec = useStore(s => s.setRecommendation)
  const setInsp = useStore(s => s.setInspirations)
  const goto = useStore(s => s.goto)
  const openPreStudy = useStore(s => s.openPreStudy)

  useEffect(() => {
    // 推荐(总是当下重算)
    const { left, right } = pickRecommendations(library, new Date())
    setRec({ left, right })
    ipc.patchState({ recommendation_cache: {
      generated_at: new Date().toISOString(),
      left: left ?? undefined, right: right ?? undefined
    } })

    // 灵感(若缓存超 24h 或为空,异步刷新)
    const stale = inspirations.length === 0
    if (stale) {
      ipc.llmInspirations({
        profile,
        existingTitles: library.map(f => f.title)
      }).then(t => {
        setInsp(t)
        ipc.patchState({ suggested_new_topics: {
          generated_at: new Date().toISOString(),
          topics: t
        }})
      }).catch(() => {})
    }
  }, [])

  return (
    <div className="h-full overflow-y-auto p-8 relative">
      <Button variant="ghost"
        onClick={() => goto('profile')}
        className="absolute top-4 right-4 font-sans text-sm">
        档案
      </Button>

      <div className="max-w-5xl mx-auto pt-8">
        <div className="text-center text-parchment/60 font-sans text-sm mb-12">
          晚安,{profile.name}
        </div>

        <div className="grid grid-cols-3 gap-6">
          <RecCard card={recommendation.left} side="left" />

          <div className="flex flex-col gap-3">
            <Button
              onClick={() => openPreStudy({ mode: 'progress', topic: '' })}
              className="w-full text-lg py-4">
              新学习
            </Button>
            {inspirations.map((t, i) => (
              <InspirationChip key={i} topic={t} />
            ))}
          </div>

          <RecCard card={recommendation.right} side="right" />
        </div>

        <div className="mt-16 divider"></div>
        <div className="font-sans text-xs text-parchment/40 text-center mt-6 mb-2">— 学习库 —</div>
        <FileLibrary />
      </div>
    </div>
  )
}
