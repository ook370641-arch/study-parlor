import { useEffect } from 'react'
import { useStore } from '@/store'
import { Button } from '@/components/Button'
import { InspirationChip } from '@/components/InspirationChip'
import { StudyLibrary } from '@/components/StudyLibrary'
import { ipc } from '@/lib/ipc'

export function Home() {
  const inspirations = useStore(s => s.inspirations)
  const inspirationsLoading = useStore(s => s.inspirationsLoading)
  const inspirationsError = useStore(s => s.inspirationsError)
  const profile = useStore(s => s.profile)
  const library = useStore(s => s.library)
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
  }, [library])

  const firstUnsaved = unsavedSessions[0]

  return (
    <div className="h-full overflow-y-auto p-8 relative">
      <Button variant="ghost"
        onClick={() => goto('profile')}
        className="absolute top-4 right-4 font-sans text-sm">
        档案
      </Button>

      <div className="text-center text-parchment/60 font-sans text-sm mb-8">
        晚安,{profile.name}
      </div>

      <div className="flex gap-6 max-w-6xl mx-auto">
        {/* 左侧：新学习模块 */}
        <div className="w-[360px] shrink-0 flex flex-col gap-4">
          {/* 恢复提示 */}
          {firstUnsaved && (
            <div className="panel p-4">
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

          {/* 推荐主题 */}
          <div className="flex flex-col gap-2">
            <div className="text-xs text-parchment/40 font-sans px-1">推荐主题</div>

            {inspirationsLoading && (
              <div className="text-sm text-parchment/50 font-sans text-center py-2">
                <span className="inline-block w-4 h-4 border-2 border-parchment/30 border-t-ember rounded-full animate-spin mr-2 align-middle" />
                正在构思...
              </div>
            )}

            {inspirationsError && (
              <button
                onClick={loadInspirations}
                className="text-sm text-parchment/50 font-sans text-center py-2 hover:text-ember transition-colors"
              >
                灵感生成失败，点击重试
              </button>
            )}

            {!inspirationsLoading && !inspirationsError && inspirations.map((t, i) => (
              <InspirationChip key={i} topic={t} />
            ))}
          </div>
        </div>

        {/* 右侧：学习库 */}
        <div className="flex-1 min-w-0">
          <div className="text-xs text-parchment/40 font-sans mb-3">学习库</div>
          <StudyLibrary />
        </div>
      </div>
    </div>
  )
}
