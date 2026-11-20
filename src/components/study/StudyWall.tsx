import { useMemo, useRef, useState } from 'react'
import { AlbumGrid, AlbumWall } from '@/components/album-wall/AlbumWall'
import { AlbumGroupSection } from '@/components/album-wall/AlbumGroupSection'
import { DemoInfoButton, DemoNotePopover } from '@/components/demo/DemoNotePopover'
import { GravityField } from '@/components/GravityField'
import { GroupRecCard } from '@/components/GroupRecCard'
import { Quote } from '@/components/Quote'
import { StrategyToggle } from '@/components/StrategyToggle'
import { StudyControlsGroup } from '@/components/StudyControlsGroup'
import { WildCardRecCard } from '@/components/WildCardRecCard'
import type { DemoNote } from '@/lib/demo-notes'
import { openStudyTopicFromTree, withSessionReplaced } from '@/lib/study-navigation'
import { filterStudyTopics, mergePendingArchives, recommendationExistsInLibrary, selectRecommendationGroups } from '@/lib/study-wall'
import { useTerminology } from '@/lib/terminology'
import { useStore } from '@/store'
import { StudyTopicCard } from './StudyTopicCard'
import { useStudyGravityDrag } from './useStudyGravityDrag'

export function StudyWall() {
  const theme = useStore(state => state.briefingTheme)
  const profile = useStore(state => state.profile)
  const groups = useStore(state => state.groups)
  const library = useStore(state => state.library)
  const pendingArchives = useStore(state => state.pendingArchives)
  const activeGroupId = useStore(state => state.activeGroupId)
  const query = useStore(state => state.studySearchQuery)
  const expandedGroups = useStore(state => state.studyExpandedGroups)
  const wildcard = useStore(state => state.wildcardInspiration)
  const groupInspirations = useStore(state => state.groupInspirations)
  const unsavedSessions = useStore(state => state.unsavedSessions)
  const openPreStudy = useStore(state => state.openPreStudy)
  const t = useTerminology()
  const [openNote, setOpenNote] = useState<DemoNote['id'] | null>(null)
  const reviewInfoRef = useRef<HTMLSpanElement>(null)
  const chartInfoRef = useRef<HTMLSpanElement>(null)
  const { dragState, beginDrag } = useStudyGravityDrag()
  const merged = useMemo(() => mergePendingArchives(library, pendingArchives), [library, pendingArchives])
  const effectiveGroups = groups.length > 0 ? groups : [{ id: 'default', name: '默认', color: '#d97757' }]
  const visibleGroups = activeGroupId ? effectiveGroups.filter(group => group.id === activeGroupId) : effectiveGroups
  const recommendationGroups = selectRecommendationGroups(effectiveGroups, merged, activeGroupId)
  const isAcademic = theme !== 'newspaper'
  const firstUnsaved = unsavedSessions[0]
  const visibleTopics = filterStudyTopics(merged, activeGroupId, query)

  return (
    <AlbumWall domain="study" testId="study-wall" className={isAcademic ? 'text-parchment' : 'bg-[#f5f2ed] text-[#1a1a1a]'}>
      <header className="relative mb-6 flex items-start justify-between gap-4">
        <div>
          <div data-testid="home-greeting" className="font-serif text-2xl">{t.homeGreeting}，{profile.name}</div>
          <p className="mt-1 text-xs opacity-50">沿分组整理主题，从任何一张卡继续夜谈。</p>
        </div>
        <div className="flex items-center gap-1">
          <span ref={reviewInfoRef} className="contents"><DemoInfoButton noteId="review" testId="demo-info-review" size="icon" label="复习是怎么来的" theme={theme} active={openNote === 'review'} onClick={() => setOpenNote(value => value === 'review' ? null : 'review')} /></span>
          <span ref={chartInfoRef} className="contents"><DemoInfoButton noteId="learning-chart" testId="demo-info-learning-chart" size="icon" label="学习图表是怎么来的" theme={theme} active={openNote === 'learning-chart'} onClick={() => setOpenNote(value => value === 'learning-chart' ? null : 'learning-chart')} /></span>
          <StudyControlsGroup surface="home" />
        </div>
      </header>
      <DemoNotePopover noteId={openNote} anchorRef={openNote === 'learning-chart' ? chartInfoRef : reviewInfoRef} onClose={() => setOpenNote(null)} theme={theme} />
      <Quote surface="home" />

      {firstUnsaved && <div className="my-4 flex items-center justify-between rounded-md border border-ember/25 bg-ember/5 px-4 py-3 text-sm"><span>继续未完成：{firstUnsaved.topic}</span><div className="flex gap-3"><button data-testid="wall-continue-unsaved-button" onClick={() => void withSessionReplaced(() => useStore.getState().restoreSession(firstUnsaved))} className="text-ember">继续</button><button data-testid="wall-burn-unsaved-button" onClick={() => { useStore.getState().burnLiveSession(firstUnsaved.id); useStore.getState().removeUnsavedSession(firstUnsaved.id) }} className="opacity-50 hover:text-red-400">焚毁</button></div></div>}

      <section className="my-6">
        <div className="mb-3 flex items-center justify-between"><h2 className="font-serif text-lg">新主题推荐</h2><StrategyToggle /></div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(!wildcard || !recommendationExistsInLibrary(wildcard.topic, merged)) && <WildCardRecCard onClickTopic={topic => openPreStudy({ mode: 'progress', topic })} />}
          {recommendationGroups.map(group => (!groupInspirations[group.id] || !recommendationExistsInLibrary(groupInspirations[group.id].topic, merged)) && <GroupRecCard key={group.id} group={group} topics={merged.filter(topic => topic.groupId === group.id)} onClickTopic={topic => openPreStudy({ mode: 'progress', topic })} />)}
        </div>
      </section>

      {visibleTopics.length === 0 && query && <div className="py-12 text-center"><p className="opacity-50">没有找到相关主题。</p><button onClick={() => useStore.getState().setStudySearchQuery('')} className="mt-3 text-ember underline">清除搜索</button></div>}
      {merged.length === 0 && <div className="py-16 text-center"><p className="opacity-50">还没有学习主题。</p><button data-testid="study-wall-new-topic-button" onClick={() => openPreStudy({ mode: 'progress', topic: '' })} className="mt-4 rounded bg-ember px-4 py-2 text-ink">开始新学习</button></div>}
      {merged.length > 0 && visibleGroups.map(group => {
        const groupTopics = filterStudyTopics(merged, group.id, query)
        if (activeGroupId && groupTopics.length === 0) return <div key={group.id} className="py-12 text-center"><p className="opacity-50">这个分组还没有主题。</p><button data-testid="study-wall-new-topic-button" onClick={() => openPreStudy({ mode: 'progress', topic: '' })} className="mt-4 text-ember underline">从本组开始</button></div>
        if (!activeGroupId && groupTopics.length === 0 && query) return null
        return (
          <AlbumGroupSection key={group.id} groupKey={group.id} testIdPrefix="study" label={group.name} count={groupTopics.length} collapsed={!(expandedGroups[group.id] ?? true)} onToggle={() => useStore.getState().toggleStudyGroup(group.id)} headerClassName="mb-3 mt-6">
            {groupTopics.length === 0 ? <button data-testid="study-wall-new-topic-button" onClick={() => openPreStudy({ mode: 'progress', topic: '' })} className="py-6 text-sm text-ember underline">从本组开始</button> : <AlbumGrid minWidth={190} testId={`study-group-grid-${group.id}`}>
              {groupTopics.map(topic => <StudyTopicCard key={topic.dirName} topic={topic} group={group} onOpen={selected => void openStudyTopicFromTree(selected.dirName)} onBeginDrag={beginDrag} />)}
            </AlbumGrid>}
          </AlbumGroupSection>
        )
      })}
      {dragState?.active && <GravityField groups={effectiveGroups} topics={library} draggingTopic={dragState.topic} dragPosition={{ x: dragState.currentX, y: dragState.currentY }} />}
    </AlbumWall>
  )
}
