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
import { SwapPaintingButton } from '@/components/SwapPaintingButton'
import { ExternalMaterialsCard } from '@/components/ExternalMaterialsCard'

export function Study() {
  const session = useStore(s => s.session)
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

  // 左上箭头 = 返回主页:中止流、保存为未完成会话、重置 session
  // 不触发归档,空对话/卡死状态也能安全退出
  const onBack = async () => {
    if (isExiting) return
    const s = useStore.getState()
    const sess = s.session
    if (!sess) return
    setIsExiting(true)
    try {
      if (sess.streaming) await ipc.llmAbort(sess.abortId)
      await s.saveCurrentSession()
    } catch (err) {
      console.error('[onBack] save before exit failed:', err)
    }
    setTimeout(() => {
      s.resetSession()
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

  // ESC = 返回(等同左上箭头)
  const onBackRef = useRef(onBack)
  onBackRef.current = onBack
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onBackRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const [streamError, setStreamError] = useState<{ code: string; message: string } | null>(null)
  const [archiving, setArchiving] = useState(false)
  const [isExiting, setIsExiting] = useState(false)
  const archiveResult = useStore(s => s.archiveResult)
  const clearArchiveResult = useStore(s => s.clearArchiveResult)
  useEffect(() => {
    const off = ipc.onLlmError((sid, err) => {
      if (sid !== session?.abortId) return
      setStreamError(err)
    })
    return off
  }, [session?.abortId])

  if (!session) return null

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
    const topicMeta = s.library.find(t => t.dirName === sess.dirName)
    const sessionNumber = sess.dirName && topicMeta
      ? topicMeta.sessionCount + 1
      : 1
    const dirName = sess.dirName ?? sanitizeDirName(sess.topic)
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
    setIsExiting(true)
    setTimeout(() => {
      clearArchiveResult()
      useStore.getState().resetSession()
    }, 700)
  }

  const handleArchiveClose = () => {
    if (isExiting) return
    setIsExiting(true)
    setTimeout(() => {
      clearArchiveResult()
      useStore.getState().resetSession()
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
      {/* Archive loading overlay */}
      {archiving && !archiveResult && <ArchiveLoadingOverlay onBack={onArchiveBack} />}

      {/* Archive report modal */}
      {archiveResult && (
        <ArchiveReportModal
          result={archiveResult}
          onClose={handleArchiveClose}
        />
      )}

      <div data-testid="study-page" className={`relative h-full flex flex-col ${isExiting ? 'study-exit' : ''}`}>
      <SurfaceBackground surface="study" />
      {isExiting && (
        <div className="fixed inset-0 z-40 pointer-events-none">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="absolute w-1.5 h-1.5 rounded-full bg-ember/60 star-fly-away"
              style={{
                left: `${20 + i * 15}%`,
                bottom: '20%',
                animationDelay: `${i * 50}ms`,
              }}
            />
          ))}
        </div>
      )}
      <header className="relative z-[5] flex justify-between items-center px-8 py-4 bg-ink/70 backdrop-blur-md border-b border-slate/40">
        <button
          onClick={onBack}
          aria-label="退席"
          className="text-2xl leading-none text-parchment/70 hover:text-parchment transition-colors px-2 py-1">
          ←
        </button>
        <div className="font-serif">{session.topic}</div>
        <div className="flex items-center gap-3">
          <SwapPaintingButton surface="study" />
          <div className="font-sans text-sm text-parchment/60">
            {session.mode === 'progress' ? '探索新知' : '复习检测'} ·
            {getDifficultyLabel(session.difficulty)} ·
            腔调={getTemperatureLabel(session.temperature)}
          </div>
        </div>
      </header>

      <ExternalMaterialsCard />

      {streamError && (
        <div className="relative z-[5] bg-wine/30 backdrop-blur-md border border-wine px-4 py-2 text-sm font-sans">
          <div className="flex justify-between items-center">
            <span>
              {streamError.code === 'UNAUTHORIZED'
                ? 'API Key 无效：请检查 .env 文件中的 KIMI_API_KEY 是否为真实密钥'
                : `流式失败:${streamError.message}`}
            </span>
            <div className="flex gap-2">
              {streamError.code !== 'UNAUTHORIZED' && (
                <Button variant="ghost" onClick={() => { setStreamError(null); sendOrInterrupt('继续') }}>重递</Button>
              )}
              <Button variant="ghost" onClick={() => setStreamError(null)}>合上</Button>
            </div>
          </div>
        </div>
      )}

      <div data-testid="message-list" ref={scrollRef} className="relative z-[5] flex-1 overflow-y-auto px-8 py-4 max-w-4xl w-full mx-auto">
        {session.history.map((m, i) => <ChatBubble key={i} msg={m} />)}
        {session.streaming && !assistantHasContent && (
          <div className="flex justify-start my-3">
            <div className="bg-ink/60 border border-slate/40 px-4 py-3 rounded-md
                            text-parchment/50 font-sans text-sm flex items-center gap-3">
              <StarOrbit starCount={3} radius={10} period={2000} />
              整理中…
            </div>
          </div>
        )}
        {session.streaming && assistantHasContent && (
          <span className="inline-block w-2 h-5 bg-ember/70 align-middle animate-pulse ml-1" />
        )}
      </div>

      {session.archivePending && !session.streaming && (
        <div className="relative z-[5] px-8 max-w-4xl w-full mx-auto">
          <div data-testid="archive-pending-banner"
               className="my-2 px-4 py-2 bg-ember/10 border border-ember/40 rounded
                          text-sm font-sans text-parchment/80 flex justify-between items-center">
            <span>是否封存？一旦归档，就不再更改。</span>
            <div className="flex gap-1.5 items-center">
              <Button variant="ghost" onClick={() => useStore.getState().dismissArchive()}>
                暂不封存
              </Button>
              <Button data-testid="archive-button" onClick={onEnd}>封存。它从此成为档案。</Button>
            </div>
          </div>
        </div>
      )}

      <div className="relative z-[5] bg-ink/70 backdrop-blur-md border-t border-slate/40">
        <div className="px-8 py-4 max-w-4xl w-full mx-auto">
          <ChatInput onSend={onSend} />
        </div>
      </div>
    </div>
    </>
  )
}
