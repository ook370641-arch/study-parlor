import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/store'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'
import type { ContinueTopicSuggestion, Difficulty } from '@shared/index'
import { getTemperatureLabel } from '@/lib/temperature-label'
import { ipc } from '@/lib/ipc'

type SuggestionCardProps = {
  suggestion: ContinueTopicSuggestion
  selected: boolean
  onSelect: () => void
}

function SuggestionCard({ suggestion, selected, onSelect }: SuggestionCardProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect()
    }
  }

  return (
    <div
      role="radio"
      aria-checked={selected}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      className={`relative cursor-pointer rounded-lg border p-3 transition-colors ${
        selected
          ? 'border-ember/50 bg-ember/10'
          : 'border-slate/20 hover:border-slate/40'
      }`}
    >
      <div className={`absolute top-2.5 right-2.5 w-4 h-4 rounded-full border-2 flex items-center justify-center ${
        selected ? 'border-ember' : 'border-parchment/30'
      }`}>
        {selected && <div className="w-2 h-2 rounded-full bg-ember" />}
      </div>
      <div className={`text-sm font-medium mb-1 pr-6 ${selected ? 'text-parchment' : 'text-parchment/80'}`}>
        {suggestion.title}
      </div>
      <div className={`text-xs leading-relaxed space-y-1 ${selected ? 'text-parchment/70' : 'text-parchment/50'}`}>
        {suggestion.context && <p>{suggestion.context}</p>}
        {suggestion.rationale && <p>{suggestion.rationale}</p>}
        {suggestion.benefit && <p>{suggestion.benefit}</p>}
      </div>
    </div>
  )
}

function SuggestionSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2].map(i => (
        <div key={i} className="rounded-lg border border-slate/20 p-3 animate-pulse">
          <div className="h-4 w-1/3 bg-parchment/10 rounded mb-2" />
          <div className="h-3 w-3/4 bg-parchment/5 rounded" />
        </div>
      ))}
    </div>
  )
}

export function PreStudyModal() {
  const args = useStore(s => s.preStudyArgs)
  const lastUsed = useStore(s => s.lastUsed)
  const closePreStudy = useStore(s => s.closePreStudy)
  const startSession = useStore(s => s.startSession)
  const patchLastUsed = useStore(s => s.patchLastUsed)
  const topicContinueSuggestions = useStore(s => s.topicContinueSuggestions)

  const [topic, setTopic] = useState(args?.topic ?? '')
  const [difficulty, setDifficulty] = useState<Difficulty>(lastUsed.difficulty)
  const [temperature, setTemperature] = useState<number>(lastUsed.temperature)
  const [userRequirement, setUserRequirement] = useState('')
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0)
  const [suggestions, setSuggestions] = useState<ContinueTopicSuggestion[]>([])
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const [suggestionError, setSuggestionError] = useState(false)

  const topicRef = useRef<HTMLInputElement>(null)
  const diffRef = useRef<HTMLDivElement>(null)

  const isContinue = !!(args?.dirName && args.mode === 'progress')
  const showTopicInput = !args?.dirName

  // Load continue suggestions when modal opens for continue scenario
  useEffect(() => {
    if (!args) return

    // Reset state every time modal opens
    setTopic(args.topic)
    setDifficulty(lastUsed.difficulty)
    setTemperature(lastUsed.temperature)
    setUserRequirement('')
    setSelectedSuggestionIndex(0)
    setSuggestions([])
    setLoadingSuggestions(false)
    setSuggestionError(false)

    if (isContinue && args.dirName) {
      const cacheKey = args.dirName
      const cache = topicContinueSuggestions[cacheKey]
      if (cache && cache.suggestions.length > 0) {
        setSuggestions(cache.suggestions)
      } else {
        setLoadingSuggestions(true)
        ipc.llmGenerateContinueSuggestions({ topic: args.topic, dirName: args.dirName })
          .then(result => {
            setSuggestions(result)
            // Persist to frontend store so it's available on next open
            useStore.setState(state => ({
              topicContinueSuggestions: {
                ...state.topicContinueSuggestions,
                [cacheKey]: { generatedAt: new Date().toISOString(), suggestions: result }
              }
            }))
            // Also persist to backend state.json
            const currentCache = useStore.getState().topicContinueSuggestions
            ipc.patchState({
              topicContinueSuggestions: {
                ...currentCache,
                [cacheKey]: { generatedAt: new Date().toISOString(), suggestions: result }
              }
            })
          })
          .catch(err => {
            console.error('[PreStudyModal] Failed to load suggestions:', err)
            setSuggestionError(true)
            setSuggestions([])
          })
          .finally(() => setLoadingSuggestions(false))
      }
    }
  }, [args?.dirName, args?.mode, args?.topic])

  // Focus strategy
  useEffect(() => {
    if (!args) return
    // Capture args values before timeout to avoid stale closure
    const hasDirName = !!args.dirName
    const hasTopic = !!args.topic
    // Small delay to ensure DOM is ready after state reset
    const timer = setTimeout(() => {
      if (hasDirName) {
        diffRef.current?.querySelector('button')?.focus?.()
      } else if (hasTopic) {
        diffRef.current?.querySelector('button')?.focus?.()
      } else {
        topicRef.current?.focus()
      }
    }, 0)
    return () => clearTimeout(timer)
  }, [args])

  // ESC close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closePreStudy() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closePreStudy])

  if (!args) return null

  const onConfirm = async () => {
    const finalTopic = (showTopicInput ? topic : args.topic).trim()
    if (showTopicInput && !finalTopic) return

    const selectedTopic = isContinue && suggestions[selectedSuggestionIndex]
      ? suggestions[selectedSuggestionIndex].title
      : undefined

    await patchLastUsed({ difficulty, temperature })
    startSession({
      mode: args.mode,
      topic: finalTopic,
      dirName: args.dirName,
      file_path: args.file_path,
      difficulty,
      temperature,
      userRequirement: userRequirement.trim() || undefined,
      selectedTopic
    })
  }

  return (
    <div className="fixed inset-0 z-40 bg-ink/70 flex items-center justify-center"
         onClick={closePreStudy}>
      <div className="panel w-[480px] p-8 space-y-6 max-h-[90vh] overflow-y-auto"
           onClick={e => e.stopPropagation()}>
        {/* Header label */}
        <div className="font-sans text-xs text-parchment/50">
          {args.mode === 'progress' ? '探索新知' : '复习检测'}
        </div>

        {/* Topic area */}
        {showTopicInput ? (
          <div>
            <div className="field-label mb-2">今夜想学</div>
            <Input ref={topicRef} value={topic}
                   onChange={e => setTopic(e.target.value)}
                   placeholder="主题或一个问题"
                   className="w-full" />
          </div>
        ) : (
          <div className="text-xl text-parchment">{args.topic}</div>
        )}

        {/* Continue suggestions (only for continue scenario) */}
        {isContinue && (
          <div>
            <div className="field-label mb-2">续谈方向</div>
            {loadingSuggestions ? (
              <SuggestionSkeleton />
            ) : suggestions.length > 0 ? (
              <div className="space-y-2">
                {suggestions.map((suggestion, index) => (
                  <SuggestionCard
                    key={index}
                    suggestion={suggestion}
                    selected={selectedSuggestionIndex === index}
                    onSelect={() => setSelectedSuggestionIndex(index)}
                  />
                ))}
              </div>
            ) : suggestionError ? (
              <div className="text-sm text-parchment/40 italic">
                推荐加载失败，请检查网络后重试
              </div>
            ) : (
              <div className="text-sm text-parchment/40 italic">
                暂无推荐，自由发挥即可
              </div>
            )}
          </div>
        )}

        {/* User requirement textarea (all scenarios) */}
        <div>
          <div className="field-label mb-2">附加要求</div>
          <textarea
            value={userRequirement}
            onChange={e => setUserRequirement(e.target.value)}
            placeholder="例如：多给我一些代码示例 / 用更直观的比喻 / 重点讲数学推导..."
            maxLength={200}
            className="w-full bg-transparent border border-slate/30 rounded-lg px-3 py-2 text-sm text-parchment placeholder:text-parchment/30 focus:outline-none focus:border-ember/50 resize-none"
            rows={3}
          />
          <div className="text-right text-xs text-parchment/30 mt-1">
            {userRequirement.length}/200
          </div>
        </div>

        {/* Difficulty selection */}
        <div ref={diffRef}>
          <div className="field-label mb-2">审讯强度</div>
          <div className="flex gap-2">
            {(['high', 'mid', 'low'] as Difficulty[]).map(d => (
              <button key={d}
                onClick={() => setDifficulty(d)}
                className={`px-4 py-1.5 rounded font-sans text-sm border transition-colors
                  ${difficulty === d
                    ? 'bg-ember text-ink border-ember'
                    : 'border-slate/40 text-parchment/70 hover:border-parchment/60'}`}>
                {d === 'high' ? '追至墙角' : d === 'mid' ? '互相试探' : '先暖暖场'}
              </button>
            ))}
          </div>
        </div>

        {/* Temperature selection */}
        <div>
          <div className="field-label mb-2">腔调</div>
          <div className="flex gap-2">
            {[0.3, 0.7, 1.0].map(t => (
              <button key={t}
                onClick={() => setTemperature(t)}
                className={`px-4 py-1.5 rounded font-sans text-sm border transition-colors
                  ${temperature === t
                    ? 'bg-ember text-ink border-ember'
                    : 'border-slate/40 text-parchment/70 hover:border-parchment/60'}`}>
                {getTemperatureLabel(t)}
              </button>
            ))}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={closePreStudy}>撤回</Button>
          <Button onClick={onConfirm}>开始</Button>
        </div>
      </div>
    </div>
  )
}
