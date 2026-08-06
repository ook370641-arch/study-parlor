import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '@/store'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import type { BriefingHistoryItem } from '@/components/BriefingDateColumn'
import { SurfaceBackground } from '@/components/SurfaceBackground'
import { BriefingListColumn } from '@/components/BriefingListColumn'
import { BriefingDateColumn } from '@/components/BriefingDateColumn'
import { BriefingProgress } from '@/components/BriefingProgress'
import { BriefingError } from '@/components/BriefingError'
import { SwapPaintingButton } from '@/components/SwapPaintingButton'
import { BriefingSourceSidebar } from '@/components/BriefingSourceSidebar'
import { AnthropicBlogPanel } from '@/components/anthropic/AnthropicBlogPanel'
import { ScoutPanel } from '@/components/scout/ScoutPanel'
import { ArticleAssistantPanel } from '@/components/article-assistant'
import { JobBriefingRenderer, JobProfilePanel, JobAssistantPanel } from '@/components/job-briefing'
import { WritingListColumn } from '@/components/writing/WritingListColumn'
import { WritingBoard } from '@/components/writing/WritingBoard'
import { WritingAssistantPanel } from '@/components/writing-assistant/WritingAssistantPanel'
import { isJobProfileEmpty } from '@/lib/job-briefing-defaults'
import { AcademicBriefingLayout, NewspaperBriefingLayout, BriefingEmptyState, BriefingMetaLine } from '@/components/briefing'
import { CollectionView } from '@/components/briefing/CollectionView'
import { CandlelightLayer } from '@/components/briefing/CandlelightLayer'
import { PaintingPlate } from '@/components/briefing/PaintingPlate'
import { formatBriefingDate, formatDisplayDate } from '@/lib/format-briefing-date'
import { parseBriefingMarkdown } from '@/lib/parse-briefing-markdown'
import { useGenerationTransition } from '@/lib/use-generation-transition'
import { useReadingFinished } from '@/lib/use-reading-finished'
import {
  ACADEMIC_BODY_STYLES,
  NEWSPAPER_BODY_STYLES,
  ACADEMIC_HEADING_STYLES,
  NEWSPAPER_HEADING_STYLES,
  BRIEFING_LIST_STYLES,
  BRIEFING_QUOTE_SIZES,
} from '@/lib/briefing-font-size'

// 非组件导出会破坏 React Fast Refresh（hmr invalidate 一路推到 App 整树重挂载），
// 日期 helper 统一放在 @/lib/format-briefing-date（ui-styling §10）。
function formatGeneratedAt(iso: string, _date: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export function Briefing() {
  const { result, loading, error } = useStore((s) => s.briefing)
  const theme = useStore((s) => s.briefingTheme)
  const fontSize = useStore((s) => s.briefingFontSize)
  const increase = useStore((s) => s.increaseBriefingFontSize)
  const decrease = useStore((s) => s.decreaseBriefingFontSize)
  const writingUISize = useStore((s) => s.writingUIFontSize)
  const increaseWritingUI = useStore((s) => s.increaseWritingUIFontSize)
  const decreaseWritingUI = useStore((s) => s.decreaseWritingUIFontSize)
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
  const digestViewingDate = useStore((s) => s.briefingViewingDate)
  const digestGen = useStore((s) => s.briefingGeneration)
  const jobViewingDate = useStore((s) => s.jobBriefingViewingDate)
  const jobGen = useStore((s) => s.jobBriefingGeneration)
  const terms = useStore((s) => s.assistantSession?.guide?.chunks.flatMap((c) => c.terms) ?? [])
  const guideChunks = useStore((s) => s.assistantSession?.guide?.chunks ?? [])
  const [dateColumnCollapsed, setDateColumnCollapsed] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const jobProfile = useStore((s) => s.jobProfile)
  const [profileHintDismissed, setProfileHintDismissed] = useState(false)
  const [jobProfilePanelOpen, setJobProfilePanelOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<BriefingHistoryItem[] | null>(null)
  const deleteBriefings = useStore((s) => s.deleteBriefings)
  const deleteJobBriefings = useStore((s) => s.deleteJobBriefings)
  const cancelBriefing = useStore((s) => s.cancelBriefing)
  const cancelJobBriefing = useStore((s) => s.cancelJobBriefing)
  const collectionViewOpen = useStore((s) => s.collectionViewOpen)
  const openCollectionView = useStore((s) => s.openCollectionView)

  const today = formatBriefingDate(new Date())

  // 视图日期（null = 今天）与"正在观看后台生成"标志：生成不再占用视图桶，
  // 生成中切换日期/来源只改 viewingDate，后台 promise 不受影响。
  // watching 要求 confirmed（收到过真实进度事件）——缓存读的投机登记不触发仪式。
  const digestViewDate = digestViewingDate ?? today
  const digestWatching = digestGen?.status === 'running' && digestGen.confirmed && digestGen.date === digestViewDate
  const jobViewDate = jobViewingDate ?? today
  const jobWatching = jobGen?.status === 'running' && jobGen.confirmed && jobGen.date === jobViewDate

  // Reading finished — colophon + candle breath + mark-read
  const digestMainRef = useRef<HTMLElement>(null)
  const digestSentinelRef = useRef<HTMLDivElement>(null)
  const digestFinished = useReadingFinished(digestMainRef, digestSentinelRef, result?.filePath)
  const digestRead = useStore((s) => s.briefingRead.digest)
  const breathCandle = useStore((s) => s.breathCandle)
  const markBriefingRead = useStore((s) => s.markBriefingRead)

  useEffect(() => {
    if (!digestFinished || !result) return
    breathCandle()
    void markBriefingRead('digest', result.date)
  }, [digestFinished])

  const jobMainRef = useRef<HTMLElement>(null)
  const jobSentinelRef = useRef<HTMLDivElement>(null)
  const jobFinished = useReadingFinished(jobMainRef, jobSentinelRef, jobResult?.filePath)
  const jobRead = useStore((s) => s.briefingRead['job-briefing'])

  useEffect(() => {
    if (!jobFinished || !jobResult) return
    breathCandle()
    void markBriefingRead('job-briefing', jobResult.date)
  }, [jobFinished])

  // Generation ceremony orchestration — 喂 watching 而非桶 loading：
  // 缓存查看（loading 一闪而过）不触发仪式，只有真实生成的 true→false 跳变才 fresh。
  const { phase: digestPhase, fresh: digestFresh } = useGenerationTransition(
    `digest:${digestViewDate}`, digestWatching, !!result, !!error,
  )
  const { phase: jobPhase, fresh: jobFresh } = useGenerationTransition(
    `job:${jobViewDate}`, jobWatching, !!jobResult, !!jobError,
  )

  // Stamp briefingArrivedAt when constellation begins its depart (F4→F5 handoff).
  // The veil flash starts AS the constellation fades, so the light breaks through.
  useEffect(() => {
    if (digestPhase === 'departing') {
      useStore.setState({ briefingArrivedAt: Date.now() })
    }
  }, [digestPhase])
  useEffect(() => {
    if (jobPhase === 'departing') {
      useStore.setState({ briefingArrivedAt: Date.now() })
    }
  }, [jobPhase])

  // Preserve last stage for mode="failed" rendering
  const lastDigestStage = useRef(stage)
  if (stage) lastDigestStage.current = stage
  const lastJobStage = useRef(jobStage)
  if (jobStage) lastJobStage.current = jobStage

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
  const fontSizeBtnCls = isAcademic
    ? 'border-parchment/25 text-parchment/50 hover:text-parchment hover:border-parchment/40'
    : 'border-[#2a1f1a]/25 text-[#2a1f1a]/50 hover:text-[#2a1f1a] hover:border-[#2a1f1a]/40'
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
    '--briefing-list-title-size': BRIEFING_LIST_STYLES[fontSize].title,
    '--briefing-list-meta-size': BRIEFING_LIST_STYLES[fontSize].meta,
    '--briefing-quote-size': BRIEFING_QUOTE_SIZES[fontSize],
  } as React.CSSProperties

  const isDigestError = source === 'digest' && error
  const emptyState = source === 'digest' && !result && !loading && !error

  const isJob = source === 'job-briefing'
  const isJobError = isJob && jobError
  const jobEmptyState = isJob && !jobResult && !jobLoading && !jobError

  return (
    <div
      data-testid="briefing-page"
      className={`relative h-full flex overflow-hidden ${isAcademic ? 'gap-2 p-2' : 'bg-white'}`}
      style={pageStyle}
    >
      {isAcademic && <SurfaceBackground surface="briefing" />}
      {isAcademic && (
        <div
          data-testid="briefing-dark-overlay"
          className="fixed inset-0 z-[1] bg-[#0c0806]/[0.72] pointer-events-none"
          aria-hidden="true"
        />
      )}

      <BriefingSourceSidebar
        theme={theme}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((c) => !c)}
      />

      <div
        data-testid="briefing-content-shell"
        className="flex-1 flex flex-col min-w-0"
      >
        {/* Top-right controls: job-briefing (always page-level) + digest empty/loading/error state.
            博客/写作在内部组件自行渲染；digest 有结果时由 reading-pane 渲染。 */}
        {(source === 'digest' && !result) && (
          <div className="fixed top-6 right-4 z-20 flex items-start gap-1">
            <button type="button" data-testid="briefing-font-size-decrease"
              disabled={fontSize === 'sm'}
              onClick={decrease}
              className={`w-9 h-9 rounded-full border flex items-center justify-center text-sm disabled:opacity-20 disabled:cursor-not-allowed ${fontSizeBtnCls}`}
              title="减小字号">−</button>
            <button type="button" data-testid="briefing-font-size-increase"
              disabled={fontSize === '7xl'}
              onClick={increase}
              className={`w-9 h-9 rounded-full border flex items-center justify-center text-sm disabled:opacity-20 disabled:cursor-not-allowed ${fontSizeBtnCls}`}
              title="增大字号">+</button>
            {isAcademic && (
              <SwapPaintingButton
                surface="briefing"
                data-testid="briefing-swap-painting-button"
                className="text-parchment/70 hover:text-parchment"
              />
            )}
          </div>
        )}
        <div className="flex-1 flex min-h-0">
          {source === 'digest' && (
            <BriefingListColumn
              collapsed={dateColumnCollapsed}
              onToggle={() => setDateColumnCollapsed((c) => !c)}
              theme={theme}
              width={44}
              title="日期"
            >
              <BriefingDateColumn
                collapsed={dateColumnCollapsed}
                history={historyList}
                currentDate={digestViewDate}
                today={today}
                onSelect={(date) => generateBriefing(date)}
                onReceiveToday={() => generateBriefing(today)}
                todayLabel="今日"
                onDelete={(items) => setPendingDelete(items)}
                theme={theme}
                generatedDates={[
                  ...historyList.map((h: { date: string }) => h.date),
                  ...(result?.date ? [result.date] : []),
                ]}
                readDates={digestRead}
                collection={{ active: collectionViewOpen, onOpen: () => void openCollectionView() }}
              />
            </BriefingListColumn>
          )}

          {isJob && (
            <BriefingListColumn
              collapsed={dateColumnCollapsed}
              onToggle={() => setDateColumnCollapsed((c) => !c)}
              theme={theme}
              width={44}
              title="日期"
            >
              <BriefingDateColumn
                collapsed={dateColumnCollapsed}
                history={jobHistoryList}
                currentDate={jobViewDate}
                today={today}
                onSelect={(date) => generateJobBriefing(date)}
                onReceiveToday={() => generateJobBriefing(today)}
                onDelete={(items) => setPendingDelete(items)}
                todayLabel="今日"
                theme={theme}
                generatedDates={[
                  ...jobHistoryList.map((h: { date: string }) => h.date),
                  ...(jobResult?.date ? [jobResult.date] : []),
                ]}
                readDates={jobRead}
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
              <WritingListColumn theme={theme} collapsed={dateColumnCollapsed} />
            </BriefingListColumn>
          )}

          <div className="flex-1 flex flex-col min-w-0">
            {source === 'digest' && collectionViewOpen ? (
              <div className="relative flex-1 flex flex-col min-h-0">
                <div className="absolute top-4 right-4 z-20 flex items-start gap-1">
                  <button type="button" data-testid="briefing-font-size-decrease"
                    disabled={fontSize === 'sm'} onClick={decrease}
                    className={`w-9 h-9 rounded-full border flex items-center justify-center text-sm disabled:opacity-20 disabled:cursor-not-allowed ${fontSizeBtnCls}`}
                    title="减小字号">−</button>
                  <button type="button" data-testid="briefing-font-size-increase"
                    disabled={fontSize === '7xl'} onClick={increase}
                    className={`w-9 h-9 rounded-full border flex items-center justify-center text-sm disabled:opacity-20 disabled:cursor-not-allowed ${fontSizeBtnCls}`}
                    title="增大字号">+</button>
                  {isAcademic && <SwapPaintingButton surface="briefing" data-testid="briefing-swap-painting-button" className="text-parchment/70 hover:text-parchment" />}
                </div>
                <CollectionView theme={theme} />
              </div>
            ) : source === 'writing' ? (
              <main className="relative z-[5] flex-1">
                <div className="absolute top-4 right-4 z-20 flex items-start gap-1">
                  <button type="button" data-testid="writing-ui-font-size-decrease"
                    disabled={writingUISize === 'sm'}
                    onClick={() => void decreaseWritingUI()}
                    className={`w-9 h-9 rounded-full border flex items-center justify-center text-sm disabled:opacity-20 disabled:cursor-not-allowed ${fontSizeBtnCls}`}
                    title="减小界面字号">−</button>
                  <button type="button" data-testid="writing-ui-font-size-increase"
                    disabled={writingUISize === '7xl'}
                    onClick={() => void increaseWritingUI()}
                    className={`w-9 h-9 rounded-full border flex items-center justify-center text-sm disabled:opacity-20 disabled:cursor-not-allowed ${fontSizeBtnCls}`}
                    title="增大界面字号">+</button>
                  {isAcademic && (
                    <SwapPaintingButton
                      surface="briefing"
                      data-testid="briefing-swap-painting-button"
                      className="text-parchment/70 hover:text-parchment"
                    />
                  )}
                </div>
                <WritingBoard />
              </main>
            ) : source === 'anthropic' ? (
              <AnthropicBlogPanel theme={theme} />
            ) : source === 'scout' ? (
              <ScoutPanel theme={theme} />
            ) : isJob ? (
              jobEmptyState ? (
                <BriefingEmptyState
                  hint="今日求职简报尚未生成"
                  buttonLabel="今日"
                  buttonTestId="briefing-receive-job-button"
                  onReceive={() => generateJobBriefing(today)}
                />
              ) : (jobPhase === 'generating' || jobPhase === 'resolved' || jobPhase === 'departing') && !jobResult ? (
                <div className={`relative flex-1 min-h-0 w-[95%] max-w-[1600px] min-w-[520px] mx-auto ${jobPhase === 'departing' ? 'constellation-depart' : ''}`}>
                  <div className="absolute top-4 right-0 z-20 flex items-start gap-1">
                    <button type="button" data-testid="briefing-font-size-decrease"
                      disabled={fontSize === 'sm'} onClick={decrease}
                      className={`w-9 h-9 rounded-full border flex items-center justify-center text-sm disabled:opacity-20 disabled:cursor-not-allowed ${fontSizeBtnCls}`}
                      title="减小字号">−</button>
                    <button type="button" data-testid="briefing-font-size-increase"
                      disabled={fontSize === '7xl'} onClick={increase}
                      className={`w-9 h-9 rounded-full border flex items-center justify-center text-sm disabled:opacity-20 disabled:cursor-not-allowed ${fontSizeBtnCls}`}
                      title="增大字号">+</button>
                    {isAcademic && <SwapPaintingButton surface="briefing" data-testid="briefing-swap-painting-button" className="text-parchment/70 hover:text-parchment" />}
                  </div>
                  <main className="relative z-[5] h-full overflow-y-auto px-6 py-6">
                  <BriefingProgress
                    stage={lastJobStage.current ?? 'scanning-events'}
                    mode={jobPhase === 'resolved' ? 'resolved' : 'live'}
                    onCancel={cancelJobBriefing}
                  />
                </main>
                </div>
              ) : jobPhase === 'failing' ? (
                <div className="relative flex-1 min-h-0 w-[95%] max-w-[1600px] min-w-[520px] mx-auto">
                  <div className="absolute top-4 right-0 z-20 flex items-start gap-1">
                    <button type="button" data-testid="briefing-font-size-decrease"
                      disabled={fontSize === 'sm'} onClick={decrease}
                      className={`w-9 h-9 rounded-full border flex items-center justify-center text-sm disabled:opacity-20 disabled:cursor-not-allowed ${fontSizeBtnCls}`}
                      title="减小字号">−</button>
                    <button type="button" data-testid="briefing-font-size-increase"
                      disabled={fontSize === '7xl'} onClick={increase}
                      className={`w-9 h-9 rounded-full border flex items-center justify-center text-sm disabled:opacity-20 disabled:cursor-not-allowed ${fontSizeBtnCls}`}
                      title="增大字号">+</button>
                    {isAcademic && <SwapPaintingButton surface="briefing" data-testid="briefing-swap-painting-button" className="text-parchment/70 hover:text-parchment" />}
                  </div>
                  <main className="relative z-[5] h-full overflow-y-auto px-6 py-6">
                  <BriefingProgress stage={lastJobStage.current ?? 'scanning-events'} mode="failed" />
                </main>
                </div>
              ) : isJobError ? (
                <main className="relative z-[5] flex-1 flex items-center justify-center px-6">
                  <div className={isAcademic ? 'text-parchment' : 'text-[#1a1a1a]'}>
                    <BriefingError
                      code={jobError}
                      onRetry={() => generateJobBriefing(jobViewDate, { force: true })}
                    />
                  </div>
                </main>
              ) : jobResult ? (
                <div data-testid="job-briefing-reading-pane" data-arrival={jobFresh ? 'fresh' : 'revisit'} className="relative flex-1 flex flex-col min-h-0">
                <div className="absolute top-4 right-4 z-20 flex items-start gap-1">
                  <button type="button" data-testid="briefing-font-size-decrease"
                    disabled={fontSize === 'sm'} onClick={decrease}
                    className={`w-9 h-9 rounded-full border flex items-center justify-center text-sm disabled:opacity-20 disabled:cursor-not-allowed ${fontSizeBtnCls}`}
                    title="减小字号">−</button>
                  <button type="button" data-testid="briefing-font-size-increase"
                    disabled={fontSize === '7xl'} onClick={increase}
                    className={`w-9 h-9 rounded-full border flex items-center justify-center text-sm disabled:opacity-20 disabled:cursor-not-allowed ${fontSizeBtnCls}`}
                    title="增大字号">+</button>
                  {isAcademic && <SwapPaintingButton surface="briefing" data-testid="briefing-swap-painting-button" className="text-parchment/70 hover:text-parchment" />}
                </div>
                <main ref={jobMainRef} className="relative z-[5] flex-1 overflow-y-auto px-6 py-6">
                  {isAcademic && <PaintingPlate />}
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
                        onClick={() => setJobProfilePanelOpen(true)}
                        className="shrink-0 px-3 py-1 rounded bg-ember text-white text-xs hover:bg-ember/90"
                      >
                        填写档案
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
                  {jobResult && (
                    <div className="w-[95%] max-w-[1600px] min-w-[520px] mx-auto mb-2 flex items-center justify-between">
                      <BriefingMetaLine
                        displayDate={jobDisplayDate}
                        timeString={jobResult.generatedAt ? formatGeneratedAt(jobResult.generatedAt, jobResult.date) : undefined}
                        sourceStatus={{ ...jobResult.sourceStatus.official, events: jobResult.sourceStatus.events, jobs: jobResult.sourceStatus.jobs, questions: jobResult.sourceStatus.questions }}
                        cacheWriteFailed={jobResult.cacheWriteFailed}
                        theme={theme}
                      />
                      <button
                        data-testid="job-profile-panel-trigger"
                        onClick={() => setJobProfilePanelOpen(true)}
                        className="shrink-0 ml-3 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-[#3a3028] bg-[#2a1f1a]/60 text-[#a09080] text-xs hover:text-[#e0d5c0] hover:border-[#d97757] transition-colors"
                        title="求职档案设置"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-70">
                          <circle cx="12" cy="12" r="3"/>
                          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
                        </svg>
                        求职档案
                      </button>
                    </div>
                  )}
                  <JobBriefingRenderer content={jobResult.content} theme={theme} fontSize={fontSize} finished={jobFinished} alreadyRead={jobResult ? jobRead.includes(jobResult.date) : false} />
                  <div ref={jobSentinelRef} data-testid="briefing-volume-end" />
                </main>
                </div>
              ) : null
            ) : emptyState ? (
              <BriefingEmptyState
                hint="今日夜航简报尚未生成"
                buttonLabel="今日"
                buttonTestId="briefing-receive-digest-button"
                onReceive={() => generateBriefing(today)}
              />
            ) : (digestPhase === 'generating' || digestPhase === 'resolved' || digestPhase === 'departing') && !result ? (
              <main className={`relative z-[5] flex-1 overflow-y-auto px-6 py-6 w-full max-w-3xl mx-auto ${digestPhase === 'departing' ? 'constellation-depart' : ''}`}>
                <BriefingProgress
                  stage={lastDigestStage.current ?? 'fetching'}
                  mode={digestPhase === 'resolved' ? 'resolved' : 'live'}
                  onCancel={cancelBriefing}
                />
              </main>
            ) : digestPhase === 'failing' ? (
              <main className="relative z-[5] flex-1 overflow-y-auto px-6 py-6 w-full max-w-3xl mx-auto">
                <BriefingProgress stage={lastDigestStage.current ?? 'fetching'} mode="failed" />
              </main>
            ) : isDigestError ? (
              <main className="relative z-[5] flex-1 flex items-center justify-center px-6">
                <div className={isAcademic ? 'text-parchment' : 'text-[#1a1a1a]'}>
                  <BriefingError
                    code={error}
                    onRetry={() => generateBriefing(digestViewDate, { force: true })}
                  />
                </div>
              </main>
            ) : parsed && result ? (
              <div data-testid="briefing-reading-pane" data-arrival={digestFresh ? 'fresh' : 'revisit'} className="relative flex-1 flex min-h-0">
                <div className="absolute top-4 right-4 z-20 flex items-start gap-1">
                  <button type="button" data-testid="briefing-font-size-decrease"
                    disabled={fontSize === 'sm'}
                    onClick={decrease}
                    className={`w-9 h-9 rounded-full border flex items-center justify-center text-sm disabled:opacity-20 disabled:cursor-not-allowed ${fontSizeBtnCls}`}
                    title="减小字号">−</button>
                  <button type="button" data-testid="briefing-font-size-increase"
                    disabled={fontSize === '7xl'}
                    onClick={increase}
                    className={`w-9 h-9 rounded-full border flex items-center justify-center text-sm disabled:opacity-20 disabled:cursor-not-allowed ${fontSizeBtnCls}`}
                    title="增大字号">+</button>
                  {isAcademic && (
                    <SwapPaintingButton
                      surface="briefing"
                      data-testid="briefing-swap-painting-button"
                      className="text-parchment/70 hover:text-parchment"
                    />
                  )}
                </div>
                {isAcademic ? (
                  <AcademicBriefingLayout
                    result={result}
                    parsed={parsed}
                    displayDate={displayDate}
                    timeString={result.generatedAt ? formatGeneratedAt(result.generatedAt, result.date) : undefined}
                    sourceStatus={result.sourceStatus}
                    cacheWriteFailed={result.cacheWriteFailed}
                    terms={terms}
                    chunks={guideChunks}
                    filePath={result.filePath}
                    containerRef={digestMainRef}
                    sentinelRef={digestSentinelRef}
                    finished={digestFinished}
                    alreadyRead={result ? digestRead.includes(result.date) : false}
                  />
                ) : (
                  <NewspaperBriefingLayout
                    result={result}
                    parsed={parsed}
                    displayDate={displayDate}
                    timeString={result.generatedAt ? formatGeneratedAt(result.generatedAt, result.date) : undefined}
                    sourceStatus={result.sourceStatus}
                    cacheWriteFailed={result.cacheWriteFailed}
                    terms={terms}
                    chunks={guideChunks}
                    filePath={result.filePath}
                    containerRef={digestMainRef}
                    sentinelRef={digestSentinelRef}
                    finished={digestFinished}
                    alreadyRead={result ? digestRead.includes(result.date) : false}
                  />
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {source === 'digest' && result?.filePath && !collectionViewOpen && (
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
        <JobAssistantPanel
          articlePath={jobResult.filePath}
          articleTitle={jobResult.title}
          articleContent={jobResult.content ?? ''}
        />
      )}
      {source === 'writing' && (
        <WritingAssistantPanel />
      )}
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
      <JobProfilePanel
        open={jobProfilePanelOpen && isJob}
        onClose={() => setJobProfilePanelOpen(false)}
      />
      <CandlelightLayer />
    </div>
  )
}
