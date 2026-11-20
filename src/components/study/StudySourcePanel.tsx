import { useMemo, useRef, useState } from 'react'
import type { Group } from '@shared/index'
import { BriefingListColumn } from '@/components/BriefingListColumn'
import { ArchiveReportModal } from '@/components/ArchiveReportModal'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { GuidePopover } from '@/components/GuidePopover'
import { openStudyTopicFromTree, withSessionReplaced, withStudySaved } from '@/lib/study-navigation'
import { filterStudyTopics, mergePendingArchives } from '@/lib/study-wall'
import { useStore } from '@/store'

export function StudySourcePanel() {
  const theme = useStore(state => state.briefingTheme)
  const collapsed = useStore(state => state.studyListCollapsed)
  const toggleCollapsed = useStore(state => state.toggleStudyList)
  const groups = useStore(state => state.groups)
  const library = useStore(state => state.library)
  const pendingArchives = useStore(state => state.pendingArchives)
  const pendingReports = useStore(state => state.pendingReports)
  const unsavedSessions = useStore(state => state.unsavedSessions)
  const activeGroupId = useStore(state => state.activeGroupId)
  const expandedGroups = useStore(state => state.studyExpandedGroups)
  const expandedTopics = useStore(state => state.studyExpandedTopics)
  const selectedDirName = useStore(state => state.studySelectedDirName)
  const selectedSessionNumber = useStore(state => state.studySelectedSessionNumber)
  const query = useStore(state => state.studySearchQuery)
  const openPreStudy = useStore(state => state.openPreStudy)
  const [creating, setCreating] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Group | null>(null)
  const [guideOpen, setGuideOpen] = useState(false)
  const [reportDirName, setReportDirName] = useState<string | null>(null)
  const guideRef = useRef<HTMLButtonElement>(null)
  const merged = useMemo(() => mergePendingArchives(library, pendingArchives), [library, pendingArchives])
  const effectiveGroups = groups.length > 0 ? groups : [{ id: 'default', name: '默认', color: '#d97757' }]
  const firstUnsaved = unsavedSessions[0]
  const pendingReport = reportDirName ? pendingReports[reportDirName] ?? merged.find(topic => topic.dirName === reportDirName)?.pendingReport : undefined
  const isAcademic = theme !== 'newspaper'

  const openWall = async (groupId: string | null) => {
    await withStudySaved(async () => {
      const state = useStore.getState()
      state.setActiveGroup(groupId)
      state.openStudyWall()
      await state.setBriefingSource('study')
      if (useStore.getState().currentPage !== 'briefing') await useStore.getState().goto('briefing')
    })
  }

  const submitCreate = () => {
    const name = newGroupName.trim()
    if (name) void useStore.getState().createGroup(name)
    setNewGroupName('')
    setCreating(false)
  }

  const submitRename = (id: string) => {
    const name = renameValue.trim()
    if (name) void useStore.getState().renameGroup(id, name)
    setRenaming(null)
    setRenameValue('')
  }

  return (<>
    <BriefingListColumn
      collapsed={collapsed}
      onToggle={toggleCollapsed}
      theme={theme}
      width={80}
      title="学习"
      headerExtra={<button ref={guideRef} type="button" data-testid="group-guide-button" onClick={() => setGuideOpen(true)} className="text-xs opacity-60 hover:opacity-100" title="分组使用指南">?</button>}
    >
      <div className="space-y-3 p-3">
        <button data-testid="new-topic-button" onClick={() => openPreStudy({ mode: 'progress', topic: '' })} className="w-full rounded-md bg-ember px-3 py-2 text-sm font-medium text-ink">新学习</button>
        <input data-testid="study-topic-search" value={query} onChange={event => useStore.getState().setStudySearchQuery(event.target.value)} placeholder="搜索主题……" className={`w-full rounded border bg-transparent px-3 py-2 text-xs outline-none ${isAcademic ? 'border-parchment/15 text-parchment placeholder:text-parchment/30' : 'border-[#1a1a1a]/15 text-[#1a1a1a]'}`} />

        {firstUnsaved && (
          <div className={`rounded-md border p-3 ${isAcademic ? 'border-ember/30 bg-ember/5' : 'border-[#d97757]/30 bg-[#d97757]/5'}`}>
            <div className="text-[10px] opacity-50">未完成的会话</div>
            <div data-testid="unsaved-session-title" className="mt-1 truncate font-serif text-sm">{firstUnsaved.topic}</div>
            <div className="mt-2 flex gap-3 text-xs">
              <button data-testid="continue-unsaved-button" onClick={() => void withSessionReplaced(() => useStore.getState().restoreSession(firstUnsaved))} className="text-ember">继续</button>
              <button data-testid="burn-unsaved-button" onClick={() => { useStore.getState().burnLiveSession(firstUnsaved.id); useStore.getState().removeUnsavedSession(firstUnsaved.id) }} className="opacity-50 hover:text-red-400">焚毁</button>
            </div>
          </div>
        )}

        <button data-testid="group-tab-all" onClick={() => void openWall(null)} className={`w-full rounded px-2 py-1.5 text-left text-xs ${activeGroupId === null ? 'bg-parchment/10 text-ember' : 'opacity-60'}`}>全部</button>
        <div className="space-y-2">
          {effectiveGroups.map(group => {
            const expanded = expandedGroups[group.id] ?? true
            const groupMatches = query.trim() && group.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
            const topics = groupMatches ? merged.filter(topic => topic.groupId === group.id) : filterStudyTopics(merged, group.id, query)
            if (query.trim() && !groupMatches && topics.length === 0) return null
            return (
              <section key={group.id}>
                <div className="group flex items-center gap-1">
                  <button data-testid={`study-group-toggle-${group.id}`} aria-label={`${expanded ? '收起' : '展开'}${group.name}`} onClick={() => useStore.getState().toggleStudyGroup(group.id)} className="w-5 opacity-60">{expanded ? '▾' : '▸'}</button>
                  {renaming === group.id ? (
                    <input data-testid="group-rename-input" value={renameValue} onChange={event => setRenameValue(event.target.value)} onBlur={() => submitRename(group.id)} onKeyDown={event => { if (event.key === 'Enter') submitRename(group.id); if (event.key === 'Escape') setRenaming(null) }} className="min-w-0 flex-1 rounded border border-ember/50 bg-transparent px-1 py-0.5 text-xs outline-none" autoFocus />
                  ) : (
                    <button data-testid={`group-tab-${group.id}`} onClick={() => void openWall(group.id)} className={`min-w-0 flex-1 truncate text-left text-xs ${activeGroupId === group.id ? 'text-ember' : ''}`}>
                      <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: group.color }} />{group.name}<span className="ml-1 opacity-40">{topics.length}</span>
                    </button>
                  )}
                  {group.id !== 'default' && <button aria-label={`${group.name}更多操作`} onClick={() => setMenuOpen(menuOpen === group.id ? null : group.id)} className="opacity-0 group-hover:opacity-60">⋯</button>}
                </div>
                {menuOpen === group.id && (
                  <div className="ml-6 mt-1 rounded border border-slate/30 bg-ink text-xs text-parchment">
                    <button onClick={() => { setRenaming(group.id); setRenameValue(group.name); setMenuOpen(null) }} className="block w-full px-2 py-1 text-left">重命名</button>
                    <button data-testid="group-delete-button" onClick={() => { setDeleteTarget(group); setMenuOpen(null) }} className="block w-full px-2 py-1 text-left text-red-300">解散分组</button>
                  </div>
                )}
                {expanded && <div className="ml-4 mt-1 space-y-1 border-l border-parchment/10 pl-2">
                  {topics.map(topic => {
                    const topicExpanded = expandedTopics[topic.dirName] ?? false
                    return (
                      <div key={topic.dirName}>
                        <div className="flex items-center gap-1">
                          <button data-testid={`study-topic-toggle-${topic.dirName}`} aria-label={`${topicExpanded ? '收起' : '展开'}${topic.title}会话`} onClick={() => useStore.getState().toggleStudyTopic(topic.dirName)} className="w-4 text-[10px] opacity-40">{topicExpanded ? '▾' : '▸'}</button>
                          <button data-testid={`study-topic-row-${topic.dirName}`} onClick={() => void openStudyTopicFromTree(topic.dirName)} className={`min-w-0 flex-1 truncate text-left text-xs ${selectedDirName === topic.dirName ? 'text-ember' : 'opacity-75 hover:opacity-100'}`}>{topic.title}</button>
                          {(pendingReports[topic.dirName] ?? topic.pendingReport) && <button data-testid={`study-tree-pending-report-badge-${topic.dirName}`} onClick={() => setReportDirName(topic.dirName)} className="shrink-0 text-[9px] text-ember">新报告</button>}
                        </div>
                        {topicExpanded && <div className="ml-5 mt-0.5 space-y-0.5">
                          {[...topic.sessions].sort((a, b) => b.sessionNumber - a.sessionNumber).map(session => {
                            const pending = pendingArchives.some(item => item.dirName === topic.dirName && item.sessionNumber === session.sessionNumber)
                            return <button key={session.sessionNumber} data-testid={`study-session-row-${topic.dirName}-${session.sessionNumber}`} onClick={() => void openStudyTopicFromTree(topic.dirName, session.sessionNumber)} className={`block w-full truncate text-left text-[10px] ${selectedDirName === topic.dirName && selectedSessionNumber === session.sessionNumber ? 'text-ember' : 'opacity-45 hover:opacity-80'}`}>第 {session.sessionNumber} 次 · {pending ? '整理中' : session.hasReview ? '已复习' : session.date.slice(0, 10)}</button>
                          })}
                        </div>}
                      </div>
                    )
                  })}
                </div>}
              </section>
            )
          })}
        </div>

        {creating ? (
          <input data-testid="create-group-input" value={newGroupName} onChange={event => setNewGroupName(event.target.value)} onBlur={submitCreate} onKeyDown={event => { if (event.key === 'Enter') submitCreate(); if (event.key === 'Escape') setCreating(false) }} placeholder="分组名称" className="w-full rounded border border-ember/40 bg-transparent px-2 py-1 text-xs outline-none" autoFocus />
        ) : (
          <button data-testid="create-group-button" onClick={() => setCreating(true)} className="w-full rounded border border-dashed border-parchment/15 py-1.5 text-xs opacity-50 hover:opacity-90">+ 新建分组</button>
        )}
      </div>
      <GuidePopover open={guideOpen} anchorRef={guideRef} onClose={() => setGuideOpen(false)} />
      {deleteTarget && <ConfirmDialog open title="解散分组" icon="warning" confirmLabel="确认解散" confirmVariant="danger" onCancel={() => setDeleteTarget(null)} onConfirm={() => { void useStore.getState().deleteGroup(deleteTarget.id); setDeleteTarget(null) }}>分组内主题会移回默认分组，不会删除任何学习文件。</ConfirmDialog>}
    </BriefingListColumn>
    {reportDirName && pendingReport && <ArchiveReportModal result={pendingReport} onClose={() => { useStore.getState().dismissPendingReport(reportDirName); setReportDirName(null) }} />}
  </>)
}
