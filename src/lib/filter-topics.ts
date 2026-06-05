import type { TopicMeta } from '@shared/index'

export function filterAndSortTopics(topics: TopicMeta[], query: string): TopicMeta[] {
  const normalized = query.toLowerCase().trim()
  const filtered = normalized
    ? topics.filter(t => t.title.toLowerCase().includes(normalized))
    : [...topics]
  return [...filtered].sort((a, b) => {
    return new Date(b.last_studied).getTime() - new Date(a.last_studied).getTime()
  })
}