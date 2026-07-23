export type FeedStatus = 'ok' | 'empty' | 'failed'

export function classifyFeed<T>(data: T | null, hasContent: (d: T) => boolean): FeedStatus {
  if (data === null) return 'failed'
  return hasContent(data) ? 'ok' : 'empty'
}

export type FeedOutcome = 'proceed' | 'network-error' | 'feed-empty'

export function resolveFeedOutcome(statuses: FeedStatus[]): FeedOutcome {
  if (statuses.every((s) => s === 'failed')) return 'network-error'
  if (statuses.every((s) => s !== 'ok')) return 'feed-empty'
  return 'proceed'
}
