import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/store'
import { ChatBubble } from '@/components/ChatBubble'
import { ChatInput } from '@/components/ChatInput'
import { Button } from '@/components/Button'
import { attachSessionListeners, kickoffSession, sendOrInterrupt } from '@/lib/session-runtime'
import { finalizeAndReturnHome } from '@/lib/finalize'
import { getTemperatureLabel } from '@/lib/temperature-label'
import { getDifficultyLabel } from '@/lib/difficulty-label'
import { sanitizeDirName } from '@/lib/sanitize-dir-name'
import { ipc } from '@/lib/ipc'
import { ArchiveLoadingOverlay } from '@/components/ArchiveLoadingOverlay'
import { ArchiveReportModal } from '@/components/ArchiveReportModal'
import { StarOrbit } from '@/components/StarOrbit'
import { SurfaceBackground } from '@/components/SurfaceBackground'
import { StudyControlsGroup } from '@/components/StudyControlsGroup'
import { useTerminology } from '@/lib/terminology'
import { ExternalMaterialsCard } from '@/components/ExternalMaterialsCard'
import { ExternalSummaryPanel } from '@/components/ExternalSummaryPanel'
import { Quote } from '@/components/Quote'
import { STUDY_FONT_STYLES, normalizeStudyFontSize } from '@/lib/study-font-size'

export function Study() {
  const session = useStore(s => s.session)
  const t = useTerminology()
  const theme = useStore((s) => s.briefingTheme)
  const isAcademic = theme !== 'newspaper'
  const scrollRef = useRef<HTMLDivElement>(null)
  const userScrolledUpRef = useRef(false)

  // 监听滚动，检测用户是否主动向上翻看历史消息
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
      userScrolledUpRef.current = distanceFromBottom > 80
    }
    el.addEventListener('scroll', onScroll)
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  // 左上箭头 = 返回主页:保存快照后直接离开,不中断任何后台工作——
  // 搜索、摘要、流式消息继续跑完(SSE 监听器是模块级的,按 abortId 匹配回 live session),
  // 回来时经 restoreSession 的存活守卫直接切页,看到的就是完整结果。
  // 不触发归档,空对话/卡死状态也能安全退出
  const onBack = async () => {
    if (isExiting) return
    const s = useStore.getState()
    if (!s.session) return
    setIsExiting(true)
    try {
      await s.saveCurrentSession()
    } catch (err) {
      console.error('[onBack] save before exit failed:', err)
    }
    setTimeout(() => {
      s.goto('home')
    }, 700)
  }

  useEffect(() => {
    attachSessionListeners()
    if (session && session.history.length === 0 && !session.streaming) {
      kickoffSession().catch(err => useStore.getState().showToast('启动失败:' + err.message))
    }
  }, [session?.abortId])

  // 自动滚到底；只在用户未主动向上翻看历史时才滚动，避免干扰阅读
  useEffect(() => {
    if (!scrollRef.current) return
    const el = scrollRef.current
    if (!userScrolledUpRef.current) {
      el.scrollTo({ top: el.scrollHeight, behavior: session?.streaming ? 'auto' : 'smooth' })
    }
  }, [session?.history, session?.streaming])

  const [streamError, setStreamError] = useState<{ code: string; message: string } | null>(null)
  const [archiving, setArchiving] = useState(false)
  const [isExiting, setIsExiting] = useState(false)
  const pendingReports = useStore(s => s.pendingReports)
  // 仅查找当前 session 对应主题的待处理报告，防止旧归档弹窗遮住新学习
  const currentDirName = session?.dirName ?? sanitizeDirName(session?.topic ?? '')
  const currentPendingReport = currentDirName ? pendingReports[currentDirName] : null
  const isExternalSummaryOpen = useStore(s => s.isExternalSummaryOpen)
  const closeExternalSummary = useStore(s => s.closeExternalSummary)
  const studyFontSize = useStore(s => s.studyFontSize)
  const increaseStudyFontSize = useStore(s => s.increaseStudyFontSize)
  const decreaseStudyFontSize = useStore(s => s.decreaseStudyFontSize)

  // ESC = 返回(等同左上箭头); 若外部资料摘要面板打开则优先关闭面板
  const onBackRef = useRef(onBack)
  onBackRef.current = onBack
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (useStore.getState().isExternalSummaryOpen) {
        closeExternalSummary()
        return
      }
      onBackRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const off = ipc.onLlmError((sid, err) => {
      if (sid !== session?.abortId) return
      setStreamError(err)
    })
    return off
  }, [session?.abortId])

  if (!session) return null

  const studyFontStyle = STUDY_FONT_STYLES[normalizeStudyFontSize(studyFontSize)]

  const pageShift = isExternalSummaryOpen ? 'max-w-[calc(100vw-760px)] transition-all duration-300 ease-out' : 'transition-all duration-300 ease-out'

  const onSend = (text: string) => sendOrInterrupt(text).catch(err =>
    useStore.getState().showToast('发送失败:' + err.message))

  // 显式归档:仅由"结束并归档"按钮触发(AI 建议结束时出现)
  // 归档在后台运行,用户可通过 overlay 上的返回按钮回到主页
  const onEnd = () => {
    const s = useStore.getState()
    const sess = s.session
    if (!sess) return

    // 立即从未保存会话中移除,避免返回主页后出现在"中断的笔录"
    const unsaved = s.unsavedSessions.find(us => us.topic === sess.topic)
    if (unsaved) s.removeUnsavedSession(unsaved.id)

    // 计算占位信息并加入 pendingArchives,让主页学习库立即显示"归档中"
    const dirName = sess.dirName ?? sanitizeDirName(sess.topic)
    const topicMeta = s.library.find(t => t.dirName === dirName)
    const sessionNumber = topicMeta ? topicMeta.sessionCount + 1 : 1
    s.addPendingArchive({
      dirName,
      topic: sess.topic,
      sessionNumber,
      mode: sess.mode,
      date: new Date().toISOString()
    })

    setArchiving(true)
    finalizeAndReturnHome().catch((err: any) => {
      useStore.getState().showToast('归档失败:' + (err.message ?? err))
      setArchiving(false)
    })
  }

  // 归档中点击返回:直接回主页,不中断后台归档进程
  const onArchiveBack = () => {
    if (isExiting) return
    const sidAtExit = session?.abortId
    setIsExiting(true)
    setTimeout(() => {
      const s = useStore.getState()
      // 仅当 session 未变更时才重置，防止覆盖新 session
      if (s.session?.abortId === sidAtExit) {
        s.resetSession()
      }
    }, 700)
  }

  const handleArchiveClose = () => {
    if (isExiting) return
    const dirName = session?.dirName ?? sanitizeDirName(session?.topic ?? '')
    const sidAtExit = session?.abortId
    setIsExiting(true)
    setTimeout(() => {
      if (dirName) useStore.getState().dismissPendingReport(dirName)
      // 仅当 session 未变更时才重置，防止误销毁新 session
      const s = useStore.getState()
      if (s.session?.abortId === sidAtExit) {
        s.resetSession()
      }
    }, 700)
  }

  // streaming=true 但还没收到任何 assistant 内容 → 显示"正在思考..."
  // 注意:"需要存档吗?" 是自然语,对用户可见,trim 后非空就算"有内容"
  const lastMsg = session.history[session.history.length - 1]
  const assistantHasContent =
    lastMsg?.role === 'assistant' &&
    lastMsg.content.trim().length > 0

  return (
    <>
      {archiving && !currentPendingReport && <ArchiveLoadingOverlay onBack={onArchiveBack} />}

      {/* 仅当用户正在等待归档完成（主动触发归档且未离开）时才弹报告。
          换新 session 后 archiving 为 false，旧报告不会弹窗打断当前学习。 */}
      {archiving && currentPendingReport && (
        <ArchiveReportModal
          result={currentPendingReport}
          onClose={handleArchiveClose}
        />
      )}

      <ExternalSummaryPanel />

      <div data-testid="study-page" className={`relative h-full flex flex-col ${isExiting ? 'study-exit' : ''} ${isAcademic ? '' : 'bg-white'}`}>
      <SurfaceBackground surface="study" />
      {isExiting && (
        <div className="fixed inset-0 z-40 pointer-events-none">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className={`absolute w-1.5 h-1.5 rounded-full ${isAcademic ? 'bg-ember/60' : 'bg-[#1a1a1a]/30'} star-fly-away`}
              style={{
                left: `${20 + i * 15}%`,
                bottom: '20%',
                animationDelay: `${i * 50}ms`,
              }}
            />
          ))}
        </div>
      )}
      <header className={isAcademic
        ? "relative z-[5] flex justify-between items-center px-8 py-4 h-16 bg-ink/70 backdrop-blur-md border-b border-slate/40"
        : "relative z-[5] flex justify-between items-center px-8 py-4 h-16 bg-white border-b border-[#1a1a1a]/10"}>
        <div className="flex items-center">
          <button
            onClick={onBack}
            aria-label="退席"
            className={isAcademic
              ? "text-2xl leading-none text-parchment/70 hover:text-parchment transition-colors px-2 py-1"
              : "text-2xl leading-none text-[#555] hover:text-[#1a1a1a] transition-colors px-2 py-1"}>
            ←
          </button>
          <button
            onClick={decreaseStudyFontSize}
            aria-label="缩小字号"
            title="缩小字号"
            className={isAcademic
              ? "text-lg leading-none text-parchment/70 hover:text-parchment transition-colors px-1 py-1"
              : "text-lg leading-none text-[#555] hover:text-[#1a1a1a] transition-colors px-1 py-1"}>
            -
          </button>
          <button
            onClick={increaseStudyFontSize}
            aria-label="放大字号"
            title="放大字号"
            className={isAcademic
              ? "text-lg leading-none text-parchment/70 hover:text-parchment transition-colors px-1 py-1"
              : "text-lg leading-none text-[#555] hover:text-[#1a1a1a] transition-colors px-1 py-1"}>
            +
          </button>
        </div>
        <div className={`font-serif ${isAcademic ? '' : 'text-[#1a1a1a]'}`}>{session.topic}</div>
        <div className="flex items-center gap-3">
          <StudyControlsGroup surface="study" />
          <div className={`font-sans text-sm ${isAcademic ? 'text-parchment/60' : 'text-[#555]'}`}>
            {session.mode === 'progress' ? t.modeProgress : t.modeReview} ·
            {getDifficultyLabel(session.difficulty, t)} ·
            {t.temperatureLabel}={getTemperatureLabel(session.temperature, t)}
          </div>
        </div>
      </header>

      <div className={`flex-1 min-h-0 flex flex-col overflow-hidden ${pageShift}`}>
      <ExternalMaterialsCard />

      {streamError && (
        <div data-testid="stream-error-banner" className={isAcademic
          ? "relative z-[5] bg-wine/30 backdrop-blur-md border border-wine px-4 py-2 text-sm font-sans"
          : "relative z-[5] bg-red-50 border border-red-200 px-4 py-2 text-sm font-sans text-[#1a1a1a]"}>
          <div className="flex justify-between items-center">
            <span className={isAcademic ? '' : 'text-[#1a1a1a]'}>
              {streamError.code === 'UNAUTHORIZED'
                ? 'API Key 无效：请检查 .env 文件中的 KIMI_API_KEY 是否为真实密钥'
                : `流式失败:${streamError.message}`}
            </span>
            <div className="flex gap-2">
              {streamError.code !== 'UNAUTHORIZED' && (
                <Button data-testid="stream-retry-button" variant="ghost" onClick={() => { setStreamError(null); sendOrInterrupt('继续') }}>重递</Button>
              )}
              <Button data-testid="stream-dismiss-button" variant="ghost" onClick={() => setStreamError(null)}>合上</Button>
            </div>
          </div>
        </div>
      )}

      <div data-testid="message-list" ref={scrollRef} className="relative z-[5] flex-1 overflow-y-auto px-8 py-4 max-w-4xl lg:max-w-6xl w-full mx-auto" style={{ fontSize: studyFontStyle }}>
        <div className="mb-6">
          <Quote surface="study" />
        </div>
        {session.history.map((m, i) => <ChatBubble key={i} msg={m} theme={theme} />)}
        {session.streaming && !assistantHasContent && (
          <div className="flex justify-start my-3">
            <div className={isAcademic
              ? "bg-ink/60 border border-slate/40 px-4 py-3 rounded-md text-parchment/50 font-sans text-sm flex items-center gap-3"
              : "bg-white border border-[#1a1a1a]/10 px-4 py-3 rounded-md text-[#777] font-sans text-sm flex items-center gap-3"}>
              <StarOrbit starCount={3} radius={10} period={2000} tone={isAcademic ? 'night' : 'paper'} />
              整理中…
            </div>
          </div>
        )}
        {session.streaming && assistantHasContent && (
          <span className={`inline-block w-2 h-5 align-middle animate-pulse ml-1 ${isAcademic ? 'bg-ember/70' : 'bg-[#1a1a1a]'}`} />
        )}
      </div>

      {session.archivePending && !session.streaming && (
        <div className="relative z-[5] px-8 max-w-4xl lg:max-w-6xl w-full mx-auto">
          <div data-testid="archive-pending-banner"
               className={isAcademic
                ? "my-2 px-4 py-2 bg-ember/10 border border-ember/40 rounded text-sm font-sans text-parchment/80 flex justify-between items-center"
                : "my-2 px-4 py-2 bg-white border border-[#1a1a1a]/10 rounded text-sm font-sans text-[#1a1a1a] flex justify-between items-center"}>
            <span>{t.archiveConfirmTitle}</span>
            <div className="flex gap-1.5 items-center">
              <Button data-testid="dismiss-archive-button" variant="ghost" onClick={() => useStore.getState().dismissArchive()}>
                {t.archiveDismiss}
              </Button>
              <Button data-testid="archive-button" onClick={onEnd}>{t.archiveConfirm}</Button>
            </div>
          </div>
        </div>
      )}

      <div className={isAcademic
          ? "relative z-[5] bg-ink/70 backdrop-blur-md border-t border-slate/40"
          : "relative z-[5] bg-white border-t border-[#1a1a1a]/10"}>
        <div className="px-8 py-4 max-w-4xl lg:max-w-6xl w-full mx-auto" style={{ fontSize: studyFontStyle }}>
          <ChatInput onSend={onSend} theme={theme} />
        </div>
      </div>
      </div>
    </div>
    </>
  )
}
