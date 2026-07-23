import { useEffect, useMemo, useState } from 'react'
import { useStore } from '@/store'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import type { BriefingHistoryItem } from '@/components/BriefingDateColumn'
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
import { WritingListColumn } from '@/components/writing/WritingListColumn'
import { WritingBoard } from '@/components/writing/WritingBoard'
import { WritingAssistantPanel } from '@/components/writing-assistant/WritingAssistantPanel'
import { isJobProfileEmpty } from '@/lib/job-briefing-defaults'
import { AcademicBriefingLayout, NewspaperBriefingLayout, BriefingVeil, BriefingEmptyState } from '@/components/briefing'
import { formatBriefingDate, formatDisplayDate } from '@/lib/format-briefing-date'
import { parseBriefingMarkdown } from '@/lib/parse-briefing-markdown'
import {
  ACADEMIC_BODY_STYLES,
  NEWSPAPER_BODY_STYLES,
  ACADEMIC_HEADING_STYLES,
  NEWSPAPER_HEADING_STYLES,
} from '@/lib/briefing-font-size'

// 非组件导出会破坏 React Fast Refresh（hmr invalidate 一路推到 App 整树重挂载），
// 日期 helper 统一放在 @/lib/format-briefing-date（ui-styling §10）。
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
  const jobStage = useStore((s) => s.jobBriefingStage)
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
  const jobProfile = useStore((s) => s.jobProfile)
  const goto = useStore((s) => s.goto)
  const [profileHintDismissed, setProfileHintDismissed] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<BriefingHistoryItem[] | null>(null)
  const deleteBriefings = useStore((s) => s.deleteBriefings)
  const deleteJobBriefings = useStore((s) => s.deleteJobBriefings)
  const cancelBriefing = useStore((s) => s.cancelBriefing)
  const cancelJobBriefing = useStore((s) => s.cancelJobBriefing)

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
      {isAcademic && <BriefingVeil />}
      <BriefingSourceSidebar
        theme={theme}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((c) => !c)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Digest renders the swap button inside the article body (AcademicBriefingLayout);
            anthropic renders its own inside AnthropicArticleReader;
            only job-briefing keeps the page-level one. */}
        {isAcademic && source !== 'digest' && source !== 'anthropic' && source !== 'writing' && (
          <div className="absolute top-24 right-4 z-10">
            <SwapPaintingButton
              surface="briefing"
              data-testid="briefing-swap-painting-button"
              className="text-parchment/70 hover:text-parchment"
            />
          </div>
        )}
        <BriefingHeader
          showJobProfileEntry={isJob}
          displayDate={source === 'writing' ? '写作' : source === 'anthropic' ? 'Anthropic Engineering' : isJob ? jobDisplayDate : displayDate}
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
                ? { ...jobResult.sourceStatus.official, events: jobResult.sourceStatus.events, jobs: jobResult.sourceStatus.jobs, questions: jobResult.sourceStatus.questions }
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
                onDelete={(items) => setPendingDelete(items)}
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
                onDelete={(items) => setPendingDelete(items)}
                todayLabel="生成简报"
                theme={theme}
              />
            </BriefingListColumn>
          )}

          {source === 'writing' && (
            <BriefingListColumn
              collapsed={dateColumnCollapsed}
              onToggle={() => setDateColumnCollapsed((c) => !c)}
              theme={theme}
              width={64}
              title="文章"
            >
              <WritingListColumn />
            </BriefingListColumn>
          )}

          <div className="flex-1 flex flex-col min-w-0">
            {source === 'writing' ? (
              <main className="relative z-[5] flex-1">
                <WritingBoard />
              </main>
            ) : source === 'anthropic' ? (
              <AnthropicBlogPanel theme={theme} />
            ) : isJob ? (
              jobEmptyState ? (
                <BriefingEmptyState
                  hint="今日求职简报尚未生成"
                  buttonLabel="生成求职简报"
                  buttonTestId="briefing-receive-job-button"
                  onReceive={() => generateJobBriefing(today)}
                />
              ) : isJobLoading ? (
                <main className="relative z-[5] flex-1 overflow-y-auto px-6 py-6 max-w-3xl mx-auto">
                  {jobStage ? (
                    <BriefingProgress stage={jobStage} onCancel={cancelJobBriefing} />
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
                  {isJobProfileEmpty(jobProfile) && !profileHintDismissed && (
                    <div
                      data-testid="job-briefing-profile-hint"
                      className={`max-w-3xl mx-auto mb-6 flex items-center gap-3 rounded-lg border px-4 py-3 text-sm ${
                        isAcademic ? 'border-ember/40 bg-ember/10 text-parchment' : 'border-[#d97757]/40 bg-[#d97757]/10 text-[#1a1a1a]'
                      }`}
                    >
                      <span className="flex-1">完善求职档案（意向岗位、方向、经历）以获得个性化岗位适配与高频问题。</span>
                      <button
                        data-testid="job-briefing-profile-hint-goto"
                        onClick={() => goto('settings')}
                        className="shrink-0 px-3 py-1 rounded bg-ember text-white text-xs hover:bg-ember/90"
                      >
                        去设置
                      </button>
                      <button
                        data-testid="job-briefing-profile-hint-dismiss"
                        onClick={() => setProfileHintDismissed(true)}
                        className="shrink-0 text-xs opacity-60 hover:opacity-100"
                        aria-label="关闭提示"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                  <JobBriefingRenderer content={jobResult.content} theme={theme} fontSize={fontSize} />
                </main>
              ) : null
            ) : emptyState ? (
              <BriefingEmptyState
                hint="今日夜航简报尚未生成"
                buttonLabel="查收日报"
                buttonTestId="briefing-receive-digest-button"
                onReceive={() => generateBriefing(today)}
              />
            ) : isDigestLoading ? (
              <main className="relative z-[5] flex-1 overflow-y-auto px-6 py-6 max-w-3xl mx-auto">
                {stage ? (
                  <BriefingProgress stage={stage} onCancel={cancelBriefing} />
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
                    filePath={result.filePath}
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
                    filePath={result.filePath}
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
      {source === 'writing' && <WritingAssistantPanel />}
      <ConfirmDialog
        open={pendingDelete !== null}
        title="删除简报"
        icon="trash"
        confirmLabel="删除"
        confirmVariant="danger"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          const items = pendingDelete ?? []
          setPendingDelete(null)
          const paths = items.map((i) => i.filePath)
          if (source === 'job-briefing') {
            void deleteJobBriefings(paths)
          } else {
            void deleteBriefings(paths)
          }
        }}
      >
        <p>即将删除 {pendingDelete?.length ?? 0} 篇简报：</p>
        <ul className="list-disc pl-5 mt-2">
          {(pendingDelete ?? []).map((i) => (
            <li key={i.date}>{i.date}</li>
          ))}
        </ul>
        <p className="mt-2">删除「今天」的简报后，再次点击今天将重新生成。</p>
        <p className="mt-2">将同时删除所选简报的旁注对话、标注与导读。</p>
      </ConfirmDialog>
    </div>
  )
}
