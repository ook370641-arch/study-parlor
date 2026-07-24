interface Props {
  displayDate: string
  timeString?: string
  sourceStatus?: Record<string, 'ok' | 'failed' | 'empty'>
  cacheWriteFailed?: boolean
  theme: 'academic' | 'newspaper'
}

export function BriefingMetaLine({ displayDate, timeString, sourceStatus, cacheWriteFailed, theme }: Props) {
  const isAcademic = theme !== 'newspaper'
  const metaClass = isAcademic ? 'text-xs text-parchment/50 font-sans' : 'text-xs text-[#555] font-sans'

  const knownLabels: Record<string, string> = {
    x: 'X',
    blogs: '博客',
    podcasts: '播客',
    tavily: 'Tavily',
    events: '新动态',
    jobs: '岗位检索',
    questions: '面经聚合',
  }

  const failedSources = sourceStatus
    ? Object.entries(sourceStatus)
        .filter(([, status]) => status === 'failed')
        .map(([key]) => {
          if (key.startsWith('official:')) return `${key.slice(9)} 官方页`
          return knownLabels[key] ?? key
        })
    : []
  const sourceStatusTitle = failedSources.length > 0
    ? `来源获取失败：${failedSources.join('、')}`
    : '全部来源获取成功'

  const emptySources = sourceStatus
    ? Object.entries(sourceStatus)
        .filter(([, status]) => status === 'empty')
        .map(([key]) => knownLabels[key] ?? key)
    : []

  return (
    <div className={metaClass} data-testid="briefing-generated-at">
      {displayDate}
      {timeString && ` · ${timeString}`}
      {failedSources.length > 0 && (
        <span
          className="ml-2 text-wine"
          data-testid="briefing-source-status"
          title={sourceStatusTitle}
        >
          {failedSources.join('、')} 获取失败
        </span>
      )}
      {emptySources.length > 0 && (
        <span
          className={`ml-2 ${isAcademic ? 'text-parchment/50' : 'text-[#6b5d52]'}`}
          data-testid="briefing-source-empty"
          title={`来源暂无更新：${emptySources.join('、')}`}
        >
          {emptySources.join('、')} 暂无更新
        </span>
      )}
      {cacheWriteFailed && (
        <span className="ml-2 text-wine" data-testid="briefing-cache-write-failed">
          （本次未写入缓存）
        </span>
      )}
    </div>
  )
}
