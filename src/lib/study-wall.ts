import type { Group, PendingArchive, SessionMeta, TopicMeta } from '@shared/index'

export function latestSession(topic: TopicMeta): SessionMeta | undefined {
  return [...topic.sessions].sort((a, b) => b.sessionNumber - a.sessionNumber)[0]
}

export function mergePendingArchives(library: TopicMeta[], pending: PendingArchive[]): TopicMeta[] {
  const result = library.map(topic => ({
    ...topic,
    sessions: topic.sessions.map(session => ({ ...session })),
  }))
  for (const item of pending) {
    let target = result.find(topic => topic.dirName === item.dirName)
    if (!target) {
      target = {
        dirName: item.dirName,
        title: item.topic,
        sessionCount: 0,
        sessions: [],
        last_studied: item.date,
        last_studied_days: 0,
        groupId: 'default',
      }
      result.push(target)
    }
    if (!target.sessions.some(session => session.sessionNumber === item.sessionNumber)) {
      target.sessions.push({
        sessionNumber: item.sessionNumber,
        date: item.date,
        hasReport: false,
        hasTranscript: false,
        hasReview: false,
        hasFable: false,
        fableCount: 0,
        hasDiagram: false,
      })
    }
    target.sessionCount = target.sessions.length
    target.last_studied = item.date
    target.last_studied_days = 0
  }
  return result
}

export function pendingSessionNumbers(pending: PendingArchive[], dirName: string): ReadonlySet<number> {
  return new Set(pending.filter(item => item.dirName === dirName).map(item => item.sessionNumber))
}

export function filterStudyTopics(library: TopicMeta[], activeGroupId: string | null, query: string): TopicMeta[] {
  const needle = query.trim().toLocaleLowerCase()
  return library.filter(topic => {
    if (activeGroupId && topic.groupId !== activeGroupId) return false
    return !needle || `${topic.title}\n${topic.dirName}`.toLocaleLowerCase().includes(needle)
  })
}

export function selectRecommendationGroups(groups: Group[], library: TopicMeta[], activeGroupId: string | null): Group[] {
  const nonEmpty = groups.filter(group => library.some(topic => topic.groupId === group.id))
  return activeGroupId ? nonEmpty.filter(group => group.id === activeGroupId) : nonEmpty.slice(0, 2)
}

export function recommendationExistsInLibrary(recommendationTopic: string, library: TopicMeta[]): boolean {
  const normalized = recommendationTopic.trim().toLocaleLowerCase()
  return library.some(topic =>
    topic.title.trim().toLocaleLowerCase() === normalized || topic.dirName.toLocaleLowerCase() === normalized)
}
