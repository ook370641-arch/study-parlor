import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/store'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'
import type { Difficulty } from '@shared/index'

export function PreStudyModal() {
  const args = useStore(s => s.preStudyArgs)
  const lastUsed = useStore(s => s.lastUsed)
  const closePreStudy = useStore(s => s.closePreStudy)
  const startSession = useStore(s => s.startSession)
  const patchLastUsed = useStore(s => s.patchLastUsed)

  const [topic, setTopic] = useState(args?.topic ?? '')
  const [difficulty, setDifficulty] = useState<Difficulty>(lastUsed.difficulty)
  const [temperature, setTemperature] = useState<number>(lastUsed.temperature)
  const topicRef = useRef<HTMLInputElement>(null)
  const diffRef  = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!args) return
    setTopic(args.topic)
    setDifficulty(lastUsed.difficulty)
    setTemperature(lastUsed.temperature)

    // 焦点策略
    if (args.file_path) {
      diffRef.current?.querySelector('button')?.focus?.()  // 推荐卡:无主题输入,聚焦难度
    } else if (args.topic) {
      diffRef.current?.querySelector('button')?.focus?.()  // 灵感 chip:主题已填,聚焦难度
    } else {
      topicRef.current?.focus()                              // 新学习:聚焦主题
    }
  }, [args])

  // ESC 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closePreStudy() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!args) return null

  const showTopicInput = !args.file_path  // 推荐卡时不显示

  const onConfirm = async () => {
    const finalTopic = (showTopicInput ? topic : args.topic).trim()
    if (showTopicInput && !finalTopic) return
    await patchLastUsed({ difficulty, temperature })
    startSession({
      mode: args.mode, topic: finalTopic, file_path: args.file_path,
      difficulty, temperature
    })
  }

  return (
    <div className="fixed inset-0 z-40 bg-ink/70 flex items-center justify-center"
         onClick={closePreStudy}>
      <div className="panel w-[480px] p-8 space-y-6" onClick={e => e.stopPropagation()}>
        <div className="font-sans text-xs text-parchment/50">
          {args.mode === 'progress' ? '推进 · 苏格拉底式探索' : '检测 · 掌握度复习'}
        </div>

        {showTopicInput ? (
          <div>
            <div className="field-label mb-2">今夜想学</div>
            <Input ref={topicRef} value={topic}
                   onChange={e => setTopic(e.target.value)}
                   placeholder="主题或一个问题"
                   className="w-full" />
          </div>
        ) : (
          <div className="text-xl">{args.topic}</div>
        )}

        <div ref={diffRef}>
          <div className="field-label mb-2">难度</div>
          <div className="flex gap-2">
            {(['high', 'mid', 'low'] as Difficulty[]).map(d => (
              <button key={d}
                onClick={() => setDifficulty(d)}
                className={`px-4 py-1.5 rounded font-sans text-sm border transition-colors
                  ${difficulty === d
                    ? 'bg-ember text-ink border-ember'
                    : 'border-slate/40 text-parchment/70 hover:border-parchment/60'}`}>
                {d === 'high' ? '高' : d === 'mid' ? '中' : '低'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="field-label mb-2">温度</div>
          <div className="flex gap-2">
            {[0.3, 0.7, 1.0].map(t => (
              <button key={t}
                onClick={() => setTemperature(t)}
                className={`px-4 py-1.5 rounded font-sans text-sm border transition-colors
                  ${temperature === t
                    ? 'bg-ember text-ink border-ember'
                    : 'border-slate/40 text-parchment/70 hover:border-parchment/60'}`}>
                {t.toFixed(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={closePreStudy}>取消</Button>
          <Button onClick={onConfirm}>开始</Button>
        </div>
      </div>
    </div>
  )
}
