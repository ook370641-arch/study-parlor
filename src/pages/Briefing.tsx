import { useEffect, useMemo, useState } from 'react'
import { useStore } from '@/store'
import { SurfaceBackground } from '@/components/SurfaceBackground'
import { BriefingListColumn } from '@/components/BriefingListColumn'
import { BriefingDateColumn } from '@/components/BriefingDateColumn'
import { BriefingSkeleton } from '@/components/BriefingSkeleton'
import { BriefingProgress } from '@/components/BriefingProgress'
import { BriefingError } from '@/components/BriefingError'
import { BriefingHeader } from '@/components/BriefingHeader'
import { SwapPaintingButton } from '@/components/SwapPaintingButton'
import { BriefingSourceSidebar } from '@/components/BriefingSourceSidebar'
import { AnthropicBlogPanel } from '@/components/anthropic/AnthropicBlogPanel'
import { ArticleAssistantPanel } from '@/components/article-assistant'
import { JobBriefingRenderer } from '@/components/job-briefing'
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
  const { list: historyList } = useStore((s) => s.briefingHistory)
  const loadBriefingHistory = useStore((s) => s.loadBriefingHistory)
  const jobResult = useStore((s) => s.jobBriefing.result)
  const jobLoading = useStore((s) => s.jobBriefing.loading)
  const jobError = useStore((s) => s.jobBriefing.error)
  const generateJobBriefing = useStore((s) => s.generateJobBriefing)
  const { list: jobHistoryList } = useStore((s) => s.jobBriefingHistory)
  const loadJobBriefingHistory = useStore((s) => s.loadJobBriefingHistory)
  const terms = useStore((s) => s.assistantSession?.guide?.chunks.flatMap((c) => c.terms) ?? [])
  const guideChunks = useStore((s) => s.assistantSession?.guide?.chunks ?? [])
  const [dateColumnCollapsed, setDateColumnCollapsed] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const today = formatBriefingDate(new Date())

  // The date column IS the history UI, so it must load past briefings on mount
  // (and whenever a new briefing is generated) rather than only when a drawer opens.
  useEffect(() => {
    if (source === 'digest') loadBriefingHistory()
    else if (source === 'job-briefing') loadJobBriefingHistory()
  }, [source, loadBriefingHistory, loadJobBriefingHistory, result?.date, jobResult?.date])

  const parsed = result ? parseBriefingMarkdown(result.content) : null
  const displayDate = useMemo(() => (result ? formatDisplayDate(result.date) : ''), [result])
  const jobDisplayDate = useMemo(() => (jobResult ? formatDisplayDate(jobResult.date) : ''), [jobResult])

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

  const isDigestLoading = source === 'digest' && loading
  const isDigestError = source === 'digest' && error
  const emptyState = source === 'digest' && !result && !loading && !error

  const isJob = source === 'job-briefing'
  const isJobLoading = isJob && jobLoading
  const isJobError = isJob && jobError
  const jobEmptyState = isJob && !jobResult && !jobLoading && !jobError

  return (
    <div
      data-testid="briefing-page"
      className={`relative h-full flex overflow-hidden ${isAcademic ? '' : 'bg-white'}`}
      style={pageStyle}
    >
      {isAcademic && <SurfaceBackground surface="briefing" />}
      {isAcademic && (
        <div
          className="fixed inset-0 z-[1] bg-[#0c0806]/[0.72] pointer-events-none"
          aria-hidden="true"
        />
      )}
      <BriefingSourceSidebar
        theme={theme}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((c) => !c)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <BriefingHeader
          displayDate={source === 'anthropic' ? 'Anthropic Engineering' : isJob ? jobDisplayDate : displayDate}
          timeString={
            source === 'digest' && result?.generatedAt
              ? formatGeneratedAt(result.generatedAt, result.date)
              : isJob && jobResult?.generatedAt
                ? formatGeneratedAt(jobResult.generatedAt, jobResult.date)
                : undefined
          }
          sourceStatus={
            source === 'digest'
              ? result?.sourceStatus
              : isJob && jobResult
                ? { ...jobResult.sourceStatus.official, tavily: jobResult.sourceStatus.tavily }
                : undefined
          }
          cacheWriteFailed={
            source === 'digest'
              ? result?.cacheWriteFailed
              : isJob
                ? jobResult?.cacheWriteFailed
                : undefined
          }
        />

        <div className="flex-1 flex min-h-0">
          {source === 'digest' && (
            <BriefingListColumn
              collapsed={dateColumnCollapsed}
              onToggle={() => setDateColumnCollapsed((c) => !c)}
              theme={theme}
              width={64}
              title="日期"
            >
              <BriefingDateColumn
                collapsed={dateColumnCollapsed}
                history={historyList}
                currentDate={result?.date}
                today={today}
                onSelect={(date) => generateBriefing(date)}
                onReceiveToday={() => generateBriefing(today)}
                theme={theme}
              />
            </BriefingListColumn>
          )}

          {isJob && (
            <BriefingListColumn
              collapsed={dateColumnCollapsed}
              onToggle={() => setDateColumnCollapsed((c) => !c)}
              theme={theme}
              width={64}
              title="日期"
            >
              <BriefingDateColumn
                collapsed={dateColumnCollapsed}
                history={jobHistoryList}
                currentDate={jobResult?.date}
                today={today}
                onSelect={(date) => generateJobBriefing(date)}
                onReceiveToday={() => generateJobBriefing(today)}
                todayLabel="生成简报"
                theme={theme}
              />
            </BriefingListColumn>
          )}

          <div className="flex-1 flex flex-col min-w-0">
            {source === 'anthropic' ? (
              <AnthropicBlogPanel theme={theme} />
            ) : isJob ? (
              jobEmptyState ? (
                <main className="relative z-[5] flex-1 flex items-center justify-center px-6">
                  <div className="text-center">
                    <p className={`mb-6 ${isAcademic ? 'text-parchment/70' : 'text-[#6b5d52]'}`}>
                      今日求职简报尚未生成
                    </p>
                    <button
                      data-testid="briefing-receive-job-button"
                      onClick={() => generateJobBriefing(today)}
                      className={`px-8 py-3 rounded text-[15px] font-serif transition-colors ${
                        isAcademic
                          ? 'bg-ember text-white hover:bg-ember/90'
                          : 'bg-[#1a1a1a] text-white hover:bg-[#333]'
                      }`}
                    >
                      生成求职简报
                    </button>
                  </div>
                </main>
              ) : isJobLoading ? (
                <main className="relative z-[5] flex-1 overflow-y-auto px-6 py-6 max-w-3xl mx-auto">
                  {stage ? (
                    <BriefingProgress stage={stage} />
                  ) : (
                    <BriefingSkeleton data-testid="briefing-skeleton" />
                  )}
                </main>
              ) : isJobError ? (
                <main className="relative z-[5] flex-1 flex items-center justify-center px-6">
                  <div className={isAcademic ? 'text-parchment' : 'text-[#1a1a1a]'}>
                    <BriefingError
                      code={jobError}
                      onRetry={() => generateJobBriefing(today, { force: true })}
                    />
                  </div>
                </main>
              ) : jobResult ? (
                <main className="relative z-[5] flex-1 overflow-y-auto px-6 py-6">
                  <JobBriefingRenderer content={jobResult.content} theme={theme} fontSize={fontSize} />
                </main>
              ) : null
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
                {isAcademic ? (
                  <AcademicBriefingLayout
                    result={result}
                    parsed={parsed}
                    displayDate={displayDate}
                    terms={terms}
                    chunks={guideChunks}
                    swapButton={
                      <SwapPaintingButton
                        surface="briefing"
                        data-testid="briefing-swap-painting-button"
                        className="text-parchment/70 hover:text-parchment"
                      />
                    }
                  />
                ) : (
                  <NewspaperBriefingLayout
                    result={result}
                    parsed={parsed}
                    displayDate={displayDate}
                    terms={terms}
                    chunks={guideChunks}
                    swapButton={
                      <SwapPaintingButton
                        surface="briefing"
                        data-testid="briefing-swap-painting-button"
                        className="text-[#555] hover:text-[#1a1a1a]"
                      />
                    }
                  />
                )}
              </>
            ) : null}
          </div>
        </div>
      </div>

      {source === 'digest' && result?.filePath && (
        <ArticleAssistantPanel
          articleType="briefing"
          parentPath={result.filePath}
          articleTitle={result.title}
          articleContent={result.content ?? ''}
          autoGenerateGuide
          theme={theme}
        />
      )}
      {isJob && jobResult?.filePath && (
        <ArticleAssistantPanel
          articleType="briefing"
          parentPath={jobResult.filePath}
          articleTitle={jobResult.title}
          articleContent={jobResult.content ?? ''}
          showGuide={false}
        />
      )}
    </div>
  )
}
