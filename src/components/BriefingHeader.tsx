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
}

export function BriefingHeader({
  displayDate,
  timeString,
  sourceStatus,
  cacheWriteFailed,
}: Props) {
  const theme = useStore((s) => s.briefingTheme)
  const fontSize = useStore((s) => s.briefingFontSize)
  const increase = useStore((s) => s.increaseBriefingFontSize)
  const decrease = useStore((s) => s.decreaseBriefingFontSize)

  const isAcademic = theme === 'academic'

  const headerBase = 'relative z-[5] flex items-center px-8 py-4 border-b'
  const headerTheme = isAcademic
    ? 'bg-ink/70 border-slate/40 backdrop-blur-md'
    : 'bg-white border-[#1a1a1a]'

  const titleClass = isAcademic ? 'text-xl font-serif text-parchment' : 'text-xl text-[#1a1a1a]'
  const metaClass = isAcademic ? 'text-xs text-parchment/50 font-sans' : 'text-xs text-[#555] font-sans'
  const ghostOverride = isAcademic ? '' : 'text-[#1a1a1a] hover:text-[#555]'
  const backOverride = isAcademic ? '' : 'text-[#1a1a1a] hover:text-[#555]'

  const canDecrease = fontSize !== 'sm'
  const canIncrease = fontSize !== '7xl'

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
      <div className="absolute left-1/2 -translate-x-1/2 text-center">
        <h1 className={titleClass}>夜航简报</h1>
        <div className={metaClass} data-testid="briefing-generated-at">
          {displayDate}
          {timeString && ` · ${timeString}`}
          {sourceStatus && failedSources.length > 0 && (
            <span
              className="ml-2 text-wine"
              data-testid="briefing-source-status"
              title={sourceStatusTitle}
            >
              {failedSources.join('、')} 获取失败
            </span>
          )}
          {cacheWriteFailed && (
            <span className="ml-2 text-wine" data-testid="briefing-cache-write-failed">
              （本次未写入缓存）
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 ml-auto">
        <Button
          variant="ghost"
          onClick={decrease}
          disabled={!canDecrease}
          data-testid="briefing-font-size-decrease"
          className={ghostOverride}
          title="减小字号"
        >
          -
        </Button>
        <Button
          variant="ghost"
          onClick={increase}
          disabled={!canIncrease}
          data-testid="briefing-font-size-increase"
          className={ghostOverride}
          title="增大字号"
        >
          +
        </Button>
        <BriefingThemeToggle />
      </div>
    </header>
  )
}
