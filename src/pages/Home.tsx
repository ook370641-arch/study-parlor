import { useEffect } from 'react'
import { useStore } from '@/store'
import { Button } from '@/components/Button'
import { GroupRecCard } from '@/components/GroupRecCard'
import { StudyLibrary } from '@/components/StudyLibrary'
import { ipc } from '@/lib/ipc'
import { SurfaceBackground } from '@/components/SurfaceBackground'
import { SwapPaintingButton } from '@/components/SwapPaintingButton'
import { StrategyToggle } from '@/components/StrategyToggle'

export function Home() {
  const inspirations = useStore(s => s.inspirations)
  const profile = useStore(s => s.profile)
  const library = useStore(s => s.library)
  const groups = useStore(s => s.groups)
  const unsavedSessions = useStore(s => s.unsavedSessions)
  const restoreSession = useStore(s => s.restoreSession)
  const removeUnsavedSession = useStore(s => s.removeUnsavedSession)
  const setInsp = useStore(s => s.setInspirations)
  const setInspLoading = useStore(s => s.setInspirationsLoading)
  const setInspError = useStore(s => s.setInspirationsError)
  const goto = useStore(s => s.goto)
  const openPreStudy = useStore(s => s.openPreStudy)

  const loadInspirations = () => {
    setInspLoading(true)
    setInspError(false)
    ipc.llmInspirations({
      profile,
      existingTitles: library.map(f => f.title)
    }).then(t => {
      setInsp(t)
      ipc.patchState({ suggested_new_topics: {
        generated_at: new Date().toISOString(),
        topics: t
      }})
    }).catch(() => {
      setInspError(true)
    }).finally(() => {
      setInspLoading(false)
    })
  }

  useEffect(() => {
    const stale = inspirations.length === 0
    if (stale) {
      loadInspirations()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [library])

  const firstUnsaved = unsavedSessions[0]

  return (
    <div className="h-full p-8 relative">
      <SurfaceBackground surface="home" />
      <SwapPaintingButton surface="home" className="absolute top-4 right-20" />
      <Button variant="ghost"
        onClick={() => goto('profile')}
        className="absolute top-4 right-4 font-sans text-sm z-10">
        档案
      </Button>

      <div className="relative z-[5] text-center text-parchment/60 font-sans text-sm mb-8">
        晚安,{profile.name}
      </div>

      <div className="relative z-[5] flex gap-6 max-w-6xl mx-auto h-full">
        {/* 左侧：新学习模块 */}
        <div className="w-[360px] shrink-0 flex flex-col gap-4 h-full overflow-y-auto">
          {/* 恢复提示 */}
          {firstUnsaved && (
            <div className="bg-ink/70 backdrop-blur-md border border-slate/40 rounded-md p-4">
              <div className="text-xs text-parchment/50 font-sans mb-2">未完成的会话</div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-parchment/70 font-serif truncate">
                  {firstUnsaved.topic}
                </span>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => restoreSession(firstUnsaved)}
                    className="text-xs text-ember hover:text-parchment transition-colors font-sans"
                  >
                    继续
                  </button>
                  <button
                    onClick={() => removeUnsavedSession(firstUnsaved.id)}
                    className="text-xs text-parchment/30 hover:text-red-400 transition-colors font-sans"
                  >
                    丢弃
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 开始新学习 */}
          <Button
            onClick={() => openPreStudy({ mode: 'progress', topic: '' })}
            className="w-full text-lg py-4"
          >
            开始新学习
          </Button>

          {/* 从已知推未知 */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs text-parchment/40 font-sans">从已知推未知</span>
              <StrategyToggle />
            </div>

            {groups.map((group) => {
              const groupTopics = library
                .filter((t) => t.groupId === group.id)
                .map((t) => ({ dirName: t.dirName, title: t.title }))
              if (groupTopics.length === 0) return null
              return (
                <GroupRecCard
                  key={group.id}
                  group={group}
                  topics={groupTopics}
                  onClickTopic={(topic) =>
                    openPreStudy({ mode: 'progress', topic })
                  }
                />
              )
            })}
          </div>
        </div>

        {/* 右侧：学习库 */}
        <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden">
          <div className="text-xs text-parchment/40 font-sans mb-3">学习库</div>
          <StudyLibrary />
        </div>
      </div>
    </div>
  )
}
