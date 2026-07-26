import { useStore } from '@/store'
import { Button } from '@/components/Button'
import { GroupRecCard } from '@/components/GroupRecCard'
import { Quote } from '@/components/Quote'
import { StudyLibrary } from '@/components/StudyLibrary'
import { SurfaceBackground } from '@/components/SurfaceBackground'
import { StudyControlsGroup } from '@/components/StudyControlsGroup'
import { StrategyToggle } from '@/components/StrategyToggle'
import { WildCardRecCard } from '@/components/WildCardRecCard'
import { BackToCover } from '@/components/BackToCover'
import { useTerminology } from '@/lib/terminology'

export function Home() {
  const profile = useStore(s => s.profile)
  const library = useStore(s => s.library)
  const groups = useStore(s => s.groups)
  const unsavedSessions = useStore(s => s.unsavedSessions)
  const restoreSession = useStore(s => s.restoreSession)
  const removeUnsavedSession = useStore(s => s.removeUnsavedSession)
  const goto = useStore(s => s.goto)
  const openPreStudy = useStore(s => s.openPreStudy)
  const t = useTerminology()
  const theme = useStore((s) => s.briefingTheme)
  const isAcademic = theme !== 'newspaper'

  const firstUnsaved = unsavedSessions[0]

  return (
    <div className={`h-full p-8 relative ${isAcademic ? '' : 'bg-[#fafaf8]'}`}>
      <BackToCover className="absolute top-4 left-4 z-10" />
      <SurfaceBackground surface="home" />
      <StudyControlsGroup surface="home" className="absolute top-4 right-52 z-10" />
      <Button variant="ghost" theme={theme}
        data-testid="home-settings-button"
        onClick={() => goto('settings')}
        className="absolute top-4 right-36 font-sans text-sm z-10">
        设置
      </Button>
      <Button variant="ghost" theme={theme}
        data-testid="home-profile-button"
        onClick={() => goto('profile')}
        className="absolute top-4 right-20 font-sans text-sm z-10">
        {t.libraryName}
      </Button>
      <Button variant="ghost" theme={theme}
        data-testid="home-extension-button"
        onClick={() => goto('extension')}
        className="absolute top-4 right-4 font-sans text-sm z-10">
        扩展
      </Button>

      <div data-testid="home-greeting" className={`relative z-[5] text-center font-sans text-sm mb-8 ${isAcademic ? 'text-parchment/60' : 'text-[#555]'}`}>
        {t.homeGreeting}，{profile.name}
      </div>

      <div className="relative z-[5] flex gap-6 max-w-6xl mx-auto h-full">
        {/* 左侧：新学习模块 */}
        <div className="w-[360px] shrink-0 flex flex-col gap-4 h-full overflow-y-auto">
          {/* 恢复提示 */}
          {firstUnsaved && (
            <div className={isAcademic ? "bg-ink/70 backdrop-blur-md border border-slate/40 rounded-md p-4" : "bg-white border border-[#1a1a1a]/12 rounded-md p-4"}>
              <div className={`text-xs font-sans mb-2 ${isAcademic ? 'text-parchment/50' : 'text-[#1a1a1a]/50'}`}>{t.unsavedSessionLabel}</div>
              <div className="flex items-center justify-between gap-2">
                <span data-testid="unsaved-session-title" className={`text-sm font-serif truncate ${isAcademic ? 'text-parchment/70' : 'text-[#1a1a1a]/70'}`}>
                  {firstUnsaved.topic}
                </span>
                <div className="flex gap-2 shrink-0">
                  <button
                    data-testid="continue-unsaved-button"
                    onClick={() => restoreSession(firstUnsaved)}
                    className={`text-xs text-ember transition-colors font-sans ${isAcademic ? 'hover:text-parchment' : 'hover:text-[#1a1a1a]'}`}
                  >
                    继续
                  </button>
                  <button
                    data-testid="burn-unsaved-button"
                    onClick={() => removeUnsavedSession(firstUnsaved.id)}
                    className={`text-xs transition-colors font-sans ${isAcademic ? 'text-parchment/30 hover:text-red-400' : 'text-[#1a1a1a]/30 hover:text-red-500'}`}
                  >
                    {t.burnVerb}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 开始新学习 */}
          <Button
            data-testid="new-topic-button"
            onClick={() => openPreStudy({ mode: 'progress', topic: '' })}
            className="w-full text-lg py-4"
          >
            {t.newTopicLabel}
          </Button>

          {/* 从已知推未知 */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between px-1">
              <span className={`text-xs font-sans ${isAcademic ? 'text-parchment/40' : 'text-[#1a1a1a]/40'}`}>{t.continuePrompt}</span>
              <StrategyToggle />
            </div>

            <WildCardRecCard
              onClickTopic={(topic) => openPreStudy({ mode: 'progress', topic })}
            />

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
          <div className="mb-4 shrink-0">
            <Quote surface="home" />
          </div>
          <div data-testid="library-section" className={`text-xs font-sans mb-3 ${isAcademic ? 'text-parchment/40' : 'text-[#1a1a1a]/40'}`}>{t.libraryName}</div>
          <StudyLibrary />
        </div>
      </div>
    </div>
  )
}
