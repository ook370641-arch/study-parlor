import { useMemo, useState } from 'react'
import { useStore } from '@/store'
import { SurfaceBackground } from '@/components/SurfaceBackground'
import { BriefingHistoryDrawer } from '@/components/BriefingHistoryDrawer'
import { BriefingSkeleton } from '@/components/BriefingSkeleton'
import { BriefingProgress } from '@/components/BriefingProgress'
import { BriefingError } from '@/components/BriefingError'
import { BriefingHeader } from '@/components/BriefingHeader'
import { SwapPaintingButton } from '@/components/SwapPaintingButton'
import { BriefingSourceSidebar } from '@/components/BriefingSourceSidebar'
import { AnthropicBlogPanel } from '@/components/anthropic/AnthropicBlogPanel'
import { AcademicBriefingLayout, NewspaperBriefingLayout } from '@/components/briefing'
import { formatBriefingDate } from '@/lib/format-briefing-date'
import { parseBriefingMarkdown } from '@/lib/parse-briefing-markdown'
import {
  ACADEMIC_BODY_STYLES,
  NEWSPAPER_BODY_STYLES,
  ACADEMIC_HEADING_STYLES,
  NEWSPAPER_HEADING_STYLES,
} from '@/lib/briefing-font-size'

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
  const source = useStore((s) => s.briefingSource)
  const { list: historyList, loading: historyLoading, error: historyError } = useStore((s) => s.briefingHistory)
  const loadBriefingHistory = useStore((s) => s.loadBriefingHistory)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const today = formatBriefingDate(new Date())

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

  const isAcademic = theme !== 'newspaper'
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

  const isDigestLoading = source === 'digest' && loading
  const isDigestError = source === 'digest' && error
  const emptyState = source === 'digest' && !result && !loading && !error

  return (
    <div
      data-testid="briefing-page"
      className={`relative h-full flex overflow-hidden ${isAcademic ? '' : 'bg-white'}`}
      style={pageStyle}
    >
      {isAcademic && source === 'digest' && <SurfaceBackground surface="briefing" />}
      <BriefingSourceSidebar
        theme={theme}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((c) => !c)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <BriefingHeader
          displayDate={source === 'anthropic' ? 'Anthropic Engineering' : displayDate}
          timeString={
            source === 'digest' && result?.generatedAt
              ? formatGeneratedAt(result.generatedAt, result.date)
              : undefined
          }
          sourceStatus={source === 'digest' ? result?.sourceStatus : undefined}
          cacheWriteFailed={source === 'digest' ? result?.cacheWriteFailed : undefined}
          onRegenerate={source === 'digest' ? handleRegenerate : undefined}
          regenerating={regenerating}
          {...headerHistoryProps}
          showRegenerate={source === 'digest'}
        />

        {source === 'anthropic' ? (
          <AnthropicBlogPanel theme={theme} />
        ) : emptyState ? (
          <main className="relative z-[5] flex-1 flex items-center justify-center px-6">
            <div className="text-center">
              <p className={`mb-6 ${isAcademic ? 'text-parchment/70' : 'text-[#6b5d52]'}`}>
                今日夜航简报尚未生成
              </p>
              <button
                data-testid="briefing-receive-digest-button"
                onClick={() => generateBriefing(today)}
                className={`px-8 py-3 rounded text-[15px] font-serif transition-colors ${
                  isAcademic
                    ? 'bg-ember text-white hover:bg-ember/90'
                    : 'bg-[#1a1a1a] text-white hover:bg-[#333]'
                }`}
              >
                查收日报
              </button>
            </div>
          </main>
        ) : isDigestLoading ? (
          <main className="relative z-[5] flex-1 overflow-y-auto px-6 py-6 max-w-3xl mx-auto">
            {stage ? (
              <BriefingProgress stage={stage} />
            ) : (
              <BriefingSkeleton data-testid="briefing-skeleton" />
            )}
          </main>
        ) : isDigestError ? (
          <main className="relative z-[5] flex-1 flex items-center justify-center px-6">
            <div className={isAcademic ? 'text-parchment' : 'text-[#1a1a1a]'}>
              <BriefingError
                code={error}
                onRetry={() => generateBriefing(today, { force: true })}
              />
            </div>
          </main>
        ) : parsed && result ? (
          <>
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
          </>
        ) : null}
      </div>
    </div>
  )
}
