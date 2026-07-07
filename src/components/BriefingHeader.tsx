import { useStore } from '@/store'
import { BackToCover } from './BackToCover'
import { Button } from './Button'
import { BriefingThemeToggle } from './briefing/BriefingThemeToggle'
import type { BriefingSourceStatus } from '@shared/index'

interface Props {
  displayDate: string
  timeString?: string
  sourceStatus?: BriefingSourceStatus
  cacheWriteFailed?: boolean
  onRegenerate?: () => void
  regenerating?: boolean
  onHistory: () => void
  showRegenerate?: boolean
}

export function BriefingHeader({
  displayDate,
  timeString,
  sourceStatus,
  cacheWriteFailed,
  onRegenerate,
  regenerating,
  onHistory,
  showRegenerate = false,
}: Props) {
  const theme = useStore((s) => s.briefingTheme)
  const fontSize = useStore((s) => s.briefingFontSize)
  const increase = useStore((s) => s.increaseBriefingFontSize)
  const decrease = useStore((s) => s.decreaseBriefingFontSize)

  const isAcademic = theme === 'academic'

  const headerBase = 'relative z-[5] flex items-center justify-between px-8 py-4 border-b'
  const headerTheme = isAcademic
    ? 'bg-ink/70 border-slate/40 backdrop-blur-md'
    : 'bg-[#f7f5f0] border-[#1a1a1a]'

  const titleClass = isAcademic ? 'text-xl font-serif text-parchment' : 'text-xl text-[#1a1a1a]'
  const metaClass = isAcademic ? 'text-xs text-parchment/50 font-sans' : 'text-xs text-[#555] font-sans'
  const ghostOverride = isAcademic ? '' : 'text-[#1a1a1a] hover:text-[#555]'
  const backOverride = isAcademic ? '' : 'text-[#1a1a1a] hover:text-[#555]'

  const canDecrease = fontSize !== 'sm'
  const canIncrease = fontSize !== 'xl'

  const sourceLabel = (label: string, status: 'ok' | 'failed') =>
    `${label} ${status === 'ok' ? '✓' : '✗'}`

  const failedSources = sourceStatus
    ? Object.entries(sourceStatus)
        .filter(([, status]) => status === 'failed')
        .map(([key]) => ({ x: 'X', blogs: '博客', podcasts: '播客' }[key] ?? key))
    : []
  const sourceStatusTitle = failedSources.length > 0
    ? `来源获取失败：${failedSources.join('、')}`
    : '全部来源获取成功'

  return (
    <header className={`${headerBase} ${headerTheme}`}>
      <BackToCover className={backOverride} />
      <div className="text-center">
        <h1 className={titleClass}>夜航简报</h1>
        <div className={metaClass} data-testid="briefing-generated-at">
          {displayDate}
          {timeString && ` · ${timeString}`}
          {sourceStatus && (
            <span
              className="ml-2"
              data-testid="briefing-source-status"
              title={sourceStatusTitle}
            >
              {sourceLabel('X', sourceStatus.x)} · {sourceLabel('博客', sourceStatus.blogs)} · {sourceLabel('播客', sourceStatus.podcasts)}
            </span>
          )}
          {cacheWriteFailed && (
            <span className="ml-2 text-wine" data-testid="briefing-cache-write-failed">
              （本次未写入缓存）
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          onClick={decrease}
          disabled={!canDecrease}
          data-testid="briefing-font-size-decrease"
          className={ghostOverride}
          title="减小字号"
        >
          A-
        </Button>
        <Button
          variant="ghost"
          onClick={increase}
          disabled={!canIncrease}
          data-testid="briefing-font-size-increase"
          className={ghostOverride}
          title="增大字号"
        >
          A+
        </Button>
        {showRegenerate && (
          <Button
            variant="ghost"
            onClick={onRegenerate}
            disabled={regenerating}
            data-testid="briefing-regenerate-button"
            className={ghostOverride}
          >
            {regenerating ? '生成中...' : '重新生成'}
          </Button>
        )}
        <Button
          variant="ghost"
          onClick={onHistory}
          data-testid="briefing-history-button"
          className={ghostOverride}
        >
          往期
        </Button>
        <BriefingThemeToggle />
      </div>
    </header>
  )
}
