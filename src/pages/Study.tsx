import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/store'
import { ChatBubble } from '@/components/ChatBubble'
import { ChatInput } from '@/components/ChatInput'
import { Button } from '@/components/Button'
import { attachSessionListeners, kickoffSession, sendOrInterrupt } from '@/lib/session-runtime'
import { finalizeAndReturnHome } from '@/lib/finalize'
import { ipc } from '@/lib/ipc'
import { ArchiveLoadingOverlay } from '@/components/ArchiveLoadingOverlay'
import { ArchiveReportModal } from '@/components/ArchiveReportModal'

export function Study() {
  const session = useStore(s => s.session)
  const scrollRef = useRef<HTMLDivElement>(null)

  // 左上箭头 = 返回主页:中止流、保存为未完成会话、重置 session
  // 不触发归档,空对话/卡死状态也能安全退出
  const onBack = async () => {
    const s = useStore.getState()
    const sess = s.session
    if (!sess) return
    try {
      if (sess.streaming) await ipc.llmAbort(sess.abortId)
      await s.saveCurrentSession()
    } catch (err) {
      console.error('[onBack] save before exit failed:', err)
    }
    s.resetSession()
  }

  useEffect(() => {
    attachSessionListeners()
    if (session && session.history.length === 0 && !session.streaming) {
      kickoffSession().catch(err => useStore.getState().showToast('启动失败:' + err.message))
    }
  }, [session?.abortId])

  // 自动滚到底
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [session?.history])

  // ESC = 返回(等同左上箭头)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onBack()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const [streamError, setStreamError] = useState<{ code: string; message: string } | null>(null)
  const [archiving, setArchiving] = useState(false)
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
  const onEnd = async () => {
    setArchiving(true)
    try {
      await finalizeAndReturnHome()
    } catch (err: any) {
      useStore.getState().showToast('归档失败:' + (err.message ?? err))
      setArchiving(false)
    }
    // finalizeAndReturnHome sets archiveResult on success;
    // archiving state stays true until user dismisses the modal
  }

  const handleArchiveClose = () => {
    clearArchiveResult()
    useStore.getState().resetSession()
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
      {archiving && !archiveResult && <ArchiveLoadingOverlay />}

      {/* Archive report modal */}
      {archiveResult && (
        <ArchiveReportModal
          result={archiveResult}
          onClose={handleArchiveClose}
        />
      )}

      <div className="h-full flex flex-col">
      <header className="flex justify-between items-center px-8 py-4 border-b border-slate/30">
        <button
          onClick={onBack}
          aria-label="返回"
          className="text-2xl leading-none text-parchment/70 hover:text-parchment transition-colors px-2 py-1">
          ←
        </button>
        <div className="font-serif">{session.topic}</div>
        <div className="font-sans text-sm text-parchment/60">
          {session.mode === 'progress' ? '推进' : '检测'} ·
          {session.difficulty === 'high' ? '高' : session.difficulty === 'mid' ? '中' : '低'} ·
          T={session.temperature}
        </div>
      </header>

      {streamError && (
        <div className="bg-wine/30 border border-wine px-4 py-2 text-sm font-sans">
          <div className="flex justify-between items-center">
            <span>
              {streamError.code === 'UNAUTHORIZED'
                ? 'API Key 无效：请检查 .env 文件中的 KIMI_API_KEY 是否为真实密钥'
                : `流式失败:${streamError.message}`}
            </span>
            <div className="flex gap-2">
              {streamError.code !== 'UNAUTHORIZED' && (
                <Button variant="ghost" onClick={() => { setStreamError(null); sendOrInterrupt('继续') }}>重试</Button>
              )}
              <Button variant="ghost" onClick={() => setStreamError(null)}>关闭</Button>
            </div>
          </div>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-8 py-4 max-w-4xl w-full mx-auto">
        {session.history.map((m, i) => <ChatBubble key={i} msg={m} />)}
        {session.streaming && !assistantHasContent && (
          <div className="flex justify-start my-3">
            <div className="bg-ink/60 border border-slate/40 px-4 py-3 rounded-md
                            text-parchment/50 font-sans text-sm flex items-center gap-2">
              <span className="inline-block w-1.5 h-1.5 bg-ember/70 rounded-full animate-pulse" />
              正在思考...
            </div>
          </div>
        )}
        {session.streaming && assistantHasContent && (
          <span className="inline-block w-2 h-5 bg-ember/70 align-middle animate-pulse ml-1" />
        )}
      </div>

      {session.archivePending && !session.streaming && (
        <div className="px-8 max-w-4xl w-full mx-auto">
          <div className="my-2 px-4 py-2 bg-ember/10 border border-ember/40 rounded
                          text-sm font-sans text-parchment/80 flex justify-between items-center">
            <span>AI 询问是否归档此次学习</span>
            <div className="flex gap-1.5 items-center">
              <Button variant="ghost" onClick={() => useStore.getState().dismissArchive()}>
                暂不归档
              </Button>
              <Button onClick={onEnd}>归档此次学习</Button>
            </div>
          </div>
        </div>
      )}

      <div className="px-8 py-4 border-t border-slate/30 max-w-4xl w-full mx-auto">
        <ChatInput onSend={onSend} />
      </div>
    </div>
    </>
  )
}
