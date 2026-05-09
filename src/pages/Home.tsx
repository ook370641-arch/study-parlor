import { useEffect } from 'react'
import { useStore } from '@/store'
import { Button } from '@/components/Button'
import { InspirationChip } from '@/components/InspirationChip'
import { FileLibrary } from '@/components/FileLibrary'
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
    // 灵感(若缓存超 24h 或为空,异步刷新)
    const stale = inspirations.length === 0
    if (stale) {
      loadInspirations()
    }
  }, [library])

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
          <div className="flex flex-col gap-3">
            <Button
              onClick={() => openPreStudy({ mode: 'progress', topic: '' })}
              className="w-full text-lg py-4">
              新学习
            </Button>

            {inspirationsLoading && (
              <div className="text-sm text-parchment/50 font-sans text-center py-2">
                <span className="inline-block w-4 h-4 border-2 border-parchment/30 border-t-ember rounded-full animate-spin mr-2 align-middle" />
                正在构思...
              </div>
            )}

            {inspirationsError && (
              <button
                onClick={loadInspirations}
                className="text-sm text-parchment/50 font-sans text-center py-2 hover:text-ember transition-colors">
                灵感生成失败，点击重试
              </button>
            )}

            {!inspirationsLoading && !inspirationsError && inspirations.map((t, i) => (
              <InspirationChip key={i} topic={t} />
            ))}

            {unsavedSessions.length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate/30">
                <div className="text-xs text-parchment/50 font-sans mb-2">未完成的会话</div>
                {unsavedSessions.map(s => (
                  <div key={s.id} className="flex items-center justify-between gap-2 py-1">
                    <button
                      onClick={() => restoreSession(s)}
                      className="text-sm text-parchment/70 hover:text-ember transition-colors font-serif truncate"
                    >
                      {s.topic}
                      <span className="font-sans text-xs text-parchment/40 ml-2">
                        {s.mode === 'progress' ? '学习中' : '复习中'}
                      </span>
                    </button>
                    <button
                      onClick={() => removeUnsavedSession(s.id)}
                      className="text-xs text-parchment/30 hover:text-red-400 transition-colors shrink-0"
                    >
                      清除
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mt-16 divider"></div>
        <div className="font-sans text-xs text-parchment/40 text-center mt-6 mb-2">— 学习库 —</div>
        <FileLibrary />
      </div>
    </div>
  )
}
