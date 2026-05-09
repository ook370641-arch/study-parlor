import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/store'
import { ChatBubble } from '@/components/ChatBubble'
import { ChatInput } from '@/components/ChatInput'
import { Button } from '@/components/Button'
import { attachSessionListeners, kickoffSession, sendOrInterrupt } from '@/lib/session-runtime'
import { finalizeAndReturnHome } from '@/lib/finalize'
import { ipc } from '@/lib/ipc'

export function Study() {
  const session = useStore(s => s.session)
  const scrollRef = useRef<HTMLDivElement>(null)

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

  // ESC 提示结束
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const ok = window.confirm('结束本次会话?')
        if (ok) onEnd()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const [streamError, setStreamError] = useState<{ code: string; message: string } | null>(null)
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

  const onEnd = async () => {
    try {
      await finalizeAndReturnHome()
    } catch (err: any) {
      useStore.getState().showToast('归档失败:' + (err.message ?? err))
    }
  }

  return (
    <div className="h-full flex flex-col">
      <header className="flex justify-between items-center px-8 py-4 border-b border-slate/30">
        <div className="font-sans text-sm text-parchment/60">
          {session.mode === 'progress' ? '推进' : '检测'} ·
          {session.difficulty === 'high' ? '高' : session.difficulty === 'mid' ? '中' : '低'} ·
          T={session.temperature}
        </div>
        <div className="font-serif">{session.topic}</div>
        <Button variant="ghost" onClick={onEnd}>结束</Button>
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
        {session.streaming && (
          <span className="inline-block w-2 h-5 bg-ember/70 align-middle animate-pulse ml-1" />
        )}
      </div>

      {session.suggestEnd && !session.streaming && (
        <div className="px-8 max-w-4xl w-full mx-auto">
          <div className="my-2 px-4 py-2 bg-ember/10 border border-ember/40 rounded
                          text-sm font-sans text-parchment/80 flex justify-between items-center">
            <span>AI 建议本轮可以结束了。</span>
            <Button onClick={onEnd}>结束并归档</Button>
          </div>
        </div>
      )}

      <div className="px-8 py-4 border-t border-slate/30 max-w-4xl w-full mx-auto">
        <ChatInput onSend={onSend} />
      </div>
    </div>
  )
}
