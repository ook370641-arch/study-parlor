import { useEffect, useMemo, useState } from 'react'
import { useStore } from '@/store'
import { SurfaceBackground } from '@/components/SurfaceBackground'
import { SwapPaintingButton } from '@/components/SwapPaintingButton'
import { BackToCover } from '@/components/BackToCover'
import { Button } from '@/components/Button'
import { BriefingHistoryDrawer } from '@/components/BriefingHistoryDrawer'
import { BriefingSkeleton } from '@/components/BriefingSkeleton'
import { BriefingProgress } from '@/components/BriefingProgress'
import { BriefingError } from '@/components/BriefingError'
import { AcademicBriefingLayout, NewspaperBriefingLayout, BriefingThemeToggle } from '@/components/briefing'
import { formatBriefingDate } from '@/lib/format-briefing-date'
import { parseBriefingMarkdown } from '@/lib/parse-briefing-markdown'
export function formatDisplayDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  if ([y, m, d].some((n) => Number.isNaN(n))) return dateStr
  return `${y} 年 ${m} 月 ${d} 日`
}

function formatGeneratedAt(iso: string, date: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const time = d.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const today = new Date().toISOString().slice(0, 10)
  if (date === today) return time
  const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return `${dateStr} · ${time}`
}

export function Briefing() {
  const { result, loading, error } = useStore((s) => s.briefing)
  const theme = useStore((s) => s.briefingTheme)
  const generateBriefing = useStore((s) => s.generateBriefing)
  const stage = useStore((s) => s.briefingStage)
  const { list: historyList, loading: historyLoading, error: historyError } = useStore((s) => s.briefingHistory)
  const loadBriefingHistory = useStore((s) => s.loadBriefingHistory)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  const today = formatBriefingDate(new Date())

  useEffect(() => {
    if (!result && !loading && !error) {
      generateBriefing(today)
    }
  }, [result, loading, error, today, generateBriefing])

  const handleRegenerate = async () => {
    if (!result) return
    setRegenerating(true)
    try {
      await generateBriefing(result.date, { force: true })
    } finally {
      setRegenerating(false)
    }
  }

  const parsed = result ? parseBriefingMarkdown(result.content) : null
  const displayDate = useMemo(() => (result ? formatDisplayDate(result.date) : ''), [result])

  const isAcademic = theme === 'academic'
  const headerBase =
    'relative z-[5] flex items-center justify-between px-8 py-4 border-b'
  const headerTheme = isAcademic
    ? 'bg-ink/70 border-slate/40 backdrop-blur-md'
    : 'bg-[#f7f5f0] border-[#1a1a1a]'

  const titleClass = isAcademic ? 'text-xl font-serif text-parchment' : 'text-xl text-[#1a1a1a]'
  const metaClass = isAcademic ? 'text-xs text-parchment/50 font-sans' : 'text-xs text-[#555] font-sans'
  const ghostOverride = isAcademic ? '' : 'text-[#1a1a1a] hover:text-[#555]'
  const backOverride = isAcademic ? '' : 'text-[#1a1a1a] hover:text-[#555]'
  const swapOverride = isAcademic ? '' : 'text-[#1a1a1a] hover:text-[#555]'

  if (loading || (!result && !error)) {
    return (
      <div data-testid="briefing-page" className="relative h-full flex flex-col overflow-hidden">
        {isAcademic && <SurfaceBackground surface="briefing" />}
        <header className={`${headerBase} ${headerTheme}`}>
          <BackToCover className={backOverride} />
          <div className="text-center">
            <h1 className={titleClass}>夜航简报</h1>
          </div>
          <div className="flex items-center gap-1">
            <BriefingThemeToggle />
            <SwapPaintingButton surface="briefing" className={swapOverride} />
          </div>
        </header>
        <main className="relative z-[5] flex-1 overflow-y-auto px-6 py-6 max-w-3xl mx-auto">
          {stage ? (
            <BriefingProgress stage={stage} />
          ) : (
            <BriefingSkeleton data-testid="briefing-skeleton" />
          )}
        </main>
      </div>
    )
  }

  if (error) {
    return (
      <div data-testid="briefing-page" className="relative h-full flex flex-col overflow-hidden">
        {isAcademic && <SurfaceBackground surface="briefing" />}
        <header className={`${headerBase} ${headerTheme}`}>
          <BackToCover className={backOverride} />
          <div className="flex items-center gap-1">
            <BriefingThemeToggle />
            <SwapPaintingButton surface="briefing" className={swapOverride} />
          </div>
        </header>
        <main className="relative z-[5] flex-1 flex items-center justify-center px-6">
          <div className={isAcademic ? 'text-parchment' : 'text-[#1a1a1a]'}>
            <BriefingError
              code={error}
              onRetry={() => generateBriefing(today, { force: true })}
            />
          </div>
        </main>
      </div>
    )
  }

  if (!parsed || !result) return null

  return (
    <div
      data-testid="briefing-page"
      className={`relative h-full flex flex-col overflow-hidden ${isAcademic ? '' : 'bg-[#f7f5f0]'}`}
    >
      {isAcademic && <SurfaceBackground surface="briefing" />}

      <header className={`${headerBase} ${headerTheme}`}>
        <BackToCover className={backOverride} />
        <div className="text-center">
          <h1 className={titleClass}>夜航简报</h1>
          {result && (
            <div className={metaClass}>
              {displayDate} · AI 行业日报
              {result.generatedAt && (
                <span data-testid="briefing-generated-at">
                  {' · 生成于 ' + formatGeneratedAt(result.generatedAt, result.date)}
                </span>
              )}
              {result.cacheWriteFailed && (
                <span data-testid="briefing-cache-write-failed" className="ml-2 text-wine">
                  （本次未写入缓存）
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          {result && !loading && (
            <Button
              variant="ghost"
              onClick={handleRegenerate}
              disabled={regenerating}
              data-testid="briefing-regenerate-button"
              className={ghostOverride}
            >
              {regenerating ? '生成中...' : '重新生成'}
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={() => {
              setDrawerOpen(true)
              loadBriefingHistory()
            }}
            data-testid="briefing-history-button"
            className={ghostOverride}
          >
            往期
          </Button>
          <BriefingThemeToggle />
          <SwapPaintingButton surface="briefing" className={swapOverride} />
        </div>
      </header>

      {isAcademic ? (
        <AcademicBriefingLayout result={result} parsed={parsed} displayDate={displayDate} />
      ) : (
        <NewspaperBriefingLayout result={result} parsed={parsed} displayDate={displayDate} />
      )}

      <BriefingHistoryDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        currentDate={result.date}
        history={historyList}
        loading={historyLoading}
        error={historyError}
        onSelect={(date) => generateBriefing(date)}
      />
    </div>
  )
}
