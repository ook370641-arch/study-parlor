import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/store'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'
import type { ContinueTopicSuggestion, Difficulty } from '@shared/index'
import { getTemperatureLabel } from '@/lib/temperature-label'

const ICONS = {
  context: '\u{1F50D}',
  rationale: '\u{27A1}',
  benefit: '\u{1F3AF}',
} as const
import { getDifficultyLabel } from '@/lib/difficulty-label'
import { filterAndSortTopics } from '@/lib/filter-topics'
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
        {suggestion.context && (
          <div className="flex gap-1.5">
            <span className={`text-xs shrink-0 mt-0.5 ${selected ? '' : 'opacity-40'}`}>{ICONS.context}</span>
            <p>{suggestion.context}</p>
          </div>
        )}
        {suggestion.rationale && (
          <div className="flex gap-1.5">
            <span className={`text-xs shrink-0 mt-0.5 ${selected ? '' : 'opacity-40'}`}>{ICONS.rationale}</span>
            <p>{suggestion.rationale}</p>
          </div>
        )}
        {suggestion.benefit && (
          <div className="flex gap-1.5">
            <span className={`text-xs shrink-0 mt-0.5 ${selected ? '' : 'opacity-40'}`}>{ICONS.benefit}</span>
            <p>{suggestion.benefit}</p>
          </div>
        )}
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
  const library = useStore(s => s.library)

  const [topic, setTopic] = useState(args?.topic ?? '')
  const [difficulty, setDifficulty] = useState<Difficulty>(lastUsed.difficulty)
  const [temperature, setTemperature] = useState<number>(lastUsed.temperature)
  const [userRequirement, setUserRequirement] = useState('')
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0)
  const [suggestions, setSuggestions] = useState<ContinueTopicSuggestion[]>([])
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const [suggestionError, setSuggestionError] = useState(false)

  const [topicSource, setTopicSource] = useState<'new' | 'existing'>('new')
  const [selectedDirName, setSelectedDirName] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [customTopic, setCustomTopic] = useState('')

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
    setTopicSource('new')
    setSelectedDirName(null)
    setSearchQuery('')
    setCustomTopic('')

    if (isContinue && args.dirName) {
      const cacheKey = args.dirName
      const cache = topicContinueSuggestions[cacheKey]
      const topicMeta = library.find(t => t.dirName === cacheKey)

      const hasValidCache = cache &&
        cache.suggestions.length > 0 &&
        cache.sessionCount !== undefined &&
        topicMeta !== undefined &&
        cache.sessionCount === topicMeta.sessionCount

      if (hasValidCache) {
        setSuggestions(cache.suggestions)
      } else {
        setLoadingSuggestions(true)
        ipc.llmGenerateContinueSuggestions({ topic: args.topic, dirName: args.dirName })
          .then(result => {
            setSuggestions(result)
            const sessionCount = topicMeta?.sessionCount ?? 0
            useStore.setState(state => ({
              topicContinueSuggestions: {
                ...state.topicContinueSuggestions,
                [cacheKey]: { generatedAt: new Date().toISOString(), sessionCount, suggestions: result }
              }
            }))
            const currentCache = useStore.getState().topicContinueSuggestions
            ipc.patchState({
              topicContinueSuggestions: {
                ...currentCache,
                [cacheKey]: { generatedAt: new Date().toISOString(), sessionCount, suggestions: result }
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
    let finalTopic: string
    let finalDirName: string | undefined

    if (!showTopicInput) {
      // Continue scenario: use args directly
      finalTopic = args.topic.trim()
      finalDirName = args.dirName
    } else if (topicSource === 'existing') {
      // Existing topic + custom sub-topic
      if (!selectedDirName) return
      const selectedTopicMeta = library.find(t => t.dirName === selectedDirName)
      if (!selectedTopicMeta) return
      if (!customTopic.trim()) return
      finalTopic = `${selectedTopicMeta.title} — ${customTopic.trim()}`
      finalDirName = selectedDirName
    } else {
      // New topic
      finalTopic = topic.trim()
      if (!finalTopic) return
      finalDirName = undefined
    }

    const selectedTopic = isContinue && suggestions[selectedSuggestionIndex]
      ? suggestions[selectedSuggestionIndex].title
      : undefined

    await patchLastUsed({ difficulty, temperature })
    startSession({
      mode: args.mode,
      topic: finalTopic,
      dirName: finalDirName,
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
        {/* Header: topic source toggle (only for progress mode without dirName) */}
        {args.mode === 'progress' && !args.dirName && (
          <div className="flex gap-2">
            <button
              onClick={() => {
                setTopicSource('new')
                setSelectedDirName(null)
                setSearchQuery('')
                setCustomTopic('')
              }}
              className={`flex-1 py-2 rounded font-sans text-sm border transition-colors
                ${topicSource === 'new'
                  ? 'bg-ember text-ink border-ember'
                  : 'border-slate/40 text-parchment/70 hover:border-parchment/60'}`}
            >
              全新主题
            </button>
            <button
              onClick={() => {
                setTopicSource('existing')
                setTopic('')
                setSelectedDirName(null)
                setSearchQuery('')
                setCustomTopic('')
              }}
              className={`flex-1 py-2 rounded font-sans text-sm border transition-colors
                ${topicSource === 'existing'
                  ? 'bg-ember text-ink border-ember'
                  : 'border-slate/40 text-parchment/70 hover:border-parchment/60'}`}
            >
              已有主题
            </button>
          </div>
        )}
        {!(args.mode === 'progress' && !args.dirName) && (
          <div className="font-sans text-xs text-parchment/50">
            {args.mode === 'progress' ? '探索新知' : '复习检测'}
          </div>
        )}

        {/* Topic area */}
        {showTopicInput ? (
          topicSource === 'existing' ? (
            <div className="space-y-3">
              {/* Search existing topics */}
              <div>
                <div className="field-label mb-2">选择已有主题</div>
                <Input
                  value={searchQuery}
                  onChange={e => {
                    setSearchQuery(e.target.value)
                    setSelectedDirName(null)
                  }}
                  placeholder="搜索主题..."
                  className="w-full"
                />
              </div>
              {/* Topic list */}
              <div className="max-h-40 overflow-y-auto space-y-1 border border-slate/20 rounded-lg p-2">
                {filterAndSortTopics(library, searchQuery).length === 0 ? (
                  <div className="text-sm text-parchment/40 italic px-2 py-1">
                    {library.length === 0 ? '档案室还空着，先创建一个新主题吧' : '未找到匹配的主题'}
                  </div>
                ) : (
                  filterAndSortTopics(library, searchQuery).map(t => (
                    <button
                      key={t.dirName}
                      onClick={() => setSelectedDirName(t.dirName)}
                      className={`w-full text-left px-3 py-2 rounded text-sm transition-colors
                        ${selectedDirName === t.dirName
                          ? 'bg-ember/10 text-parchment border border-ember/30'
                          : 'text-parchment/70 hover:bg-slate/10 border border-transparent'}`}
                    >
                      <div className="flex items-center justify-between">
                        <span>{t.title}</span>
                        <span className="text-xs text-parchment/40">
                          {t.sessionCount} 次会话 · {t.last_studied_days} 天前
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
              {/* Custom sub-topic input */}
              <div>
                <div className="field-label mb-2">细分方向</div>
                <Input
                  value={customTopic}
                  onChange={e => setCustomTopic(e.target.value)}
                  placeholder="想深入探讨的具体方向..."
                  className="w-full"
                />
              </div>
            </div>
          ) : (
            <div>
              <div className="field-label mb-2">今夜想学</div>
              <Input ref={topicRef} value={topic}
                     onChange={e => setTopic(e.target.value)}
                     placeholder="主题或一个问题"
                     className="w-full" />
            </div>
          )
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
                {getDifficultyLabel(d)}
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
