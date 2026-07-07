import { useEffect, useMemo, useState } from 'react'
import { useStore } from '@/store'
import { SurfaceBackground } from '@/components/SurfaceBackground'
import { BriefingHistoryDrawer } from '@/components/BriefingHistoryDrawer'
import { BriefingSkeleton } from '@/components/BriefingSkeleton'
import { BriefingProgress } from '@/components/BriefingProgress'
import { BriefingError } from '@/components/BriefingError'
import { BriefingHeader } from '@/components/BriefingHeader'
import { SwapPaintingButton } from '@/components/SwapPaintingButton'
import { AcademicBriefingLayout, NewspaperBriefingLayout } from '@/components/briefing'
import { formatBriefingDate } from '@/lib/format-briefing-date'
import { parseBriefingMarkdown } from '@/lib/parse-briefing-markdown'
import { ACADEMIC_BODY_STYLES, NEWSPAPER_BODY_STYLES, ACADEMIC_HEADING_STYLES, NEWSPAPER_HEADING_STYLES } from '@/lib/briefing-font-size'
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
  const today = formatBriefingDate(new Date())
  if (date === today) return time
  const dateStr = `${d.getFullYear()} 年 ${String(d.getMonth() + 1).padStart(2, '0')} 月 ${String(d.getDate()).padStart(2, '0')} 日`
  return `${dateStr} · ${time}`
}

export function Briefing() {
  const { result, loading, error } = useStore((s) => s.briefing)
  const theme = useStore((s) => s.briefingTheme)
  const fontSize = useStore((s) => s.briefingFontSize)
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
  const bodyStyle = isAcademic
    ? ACADEMIC_BODY_STYLES[fontSize]
    : NEWSPAPER_BODY_STYLES[fontSize]
  const headingStyle = isAcademic
    ? ACADEMIC_HEADING_STYLES[fontSize]
    : NEWSPAPER_HEADING_STYLES[fontSize]

  const pageStyle = {
    '--briefing-body-size': bodyStyle.size,
    '--briefing-body-weight': String(bodyStyle.weight),
    '--briefing-heading-size': headingStyle.size,
    '--briefing-heading-weight': String(headingStyle.weight),
  } as React.CSSProperties

  const headerHistoryProps = {
    onHistory: () => {
      setDrawerOpen(true)
      loadBriefingHistory()
    },
  }

  if (loading || (!result && !error)) {
    return (
      <div
        data-testid="briefing-page"
        className={`relative h-full flex flex-col overflow-hidden ${isAcademic ? '' : 'bg-white'}`}
        style={pageStyle}
      >
        {isAcademic && <SurfaceBackground surface="briefing" />}
        <BriefingHeader
          displayDate=""
          {...headerHistoryProps}
          showRegenerate
          onRegenerate={() => generateBriefing(today, { force: true })}
        />
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
      <div
        data-testid="briefing-page"
        className={`relative h-full flex flex-col overflow-hidden ${isAcademic ? '' : 'bg-white'}`}
        style={pageStyle}
      >
        {isAcademic && <SurfaceBackground surface="briefing" />}
        <BriefingHeader
          displayDate=""
          {...headerHistoryProps}
          showRegenerate
          onRegenerate={() => generateBriefing(today, { force: true })}
        />
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
      className={`relative h-full flex flex-col overflow-hidden ${isAcademic ? '' : 'bg-white'}`}
      style={pageStyle}
    >
      {isAcademic && <SurfaceBackground surface="briefing" />}
      {isAcademic && (
        <div
          className="fixed inset-0 z-[1] bg-[#0c0806]/[0.72] pointer-events-none"
          aria-hidden="true"
        />
      )}

      <BriefingHeader
        displayDate={displayDate}
        timeString={result.generatedAt ? formatGeneratedAt(result.generatedAt, result.date) : undefined}
        sourceStatus={result.sourceStatus}
        cacheWriteFailed={result.cacheWriteFailed}
        onRegenerate={handleRegenerate}
        regenerating={regenerating}
        {...headerHistoryProps}
        showRegenerate
      />

      {isAcademic && (
        <div className="absolute top-24 right-4 z-10">
          <SwapPaintingButton
            surface="briefing"
            data-testid="briefing-swap-painting-button"
            className="text-parchment/70 hover:text-parchment"
          />
        </div>
      )}

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
