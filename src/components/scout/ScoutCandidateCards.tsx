import { useState } from 'react'
import { useStore } from '@/store'
import type { BriefingTheme, ScoutMessage } from '@shared/index'

export function ScoutCandidateCards({ message, theme = 'academic' }: { message: ScoutMessage; theme?: BriefingTheme }) {
  const confirm = useStore((s) => s.confirmScoutCandidates)
  const streaming = useStore((s) => s.scoutStreaming)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const isAcademic = theme !== 'newspaper'
  const candidates = message.candidates ?? []

  const toggle = (url: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(url)) next.delete(url); else next.add(url)
      return next
    })
  }

  return (
    <div data-testid="scout-candidate-cards" className="mt-2 space-y-2 max-w-[80%]">
      {candidates.map((c, i) => {
        const disabled = c.fetchable === false
        return (
          <button
            key={c.url}
            type="button"
            data-testid={`scout-candidate-${i}`}
            aria-disabled={disabled}
            disabled={disabled || message.candidatesResolved || streaming}
            onClick={() => toggle(c.url)}
            className={`w-full text-left rounded-lg border p-3 transition-colors ${
              disabled
                ? 'opacity-50 cursor-not-allowed ' + (isAcademic ? 'border-parchment/10' : 'border-[#c9c3b8]')
                : selected.has(c.url)
                  ? 'border-ember ' + (isAcademic ? 'bg-ember/10' : 'bg-ember/5')
                  : isAcademic ? 'border-parchment/15 bg-parchment/5 hover:bg-parchment/10' : 'border-[#c9c3b8] bg-white hover:bg-[#faf8f5]'
            }`}
          >
            <p className={`text-sm font-serif ${isAcademic ? 'text-parchment' : 'text-[#1a1a1a]'}`}>
              {selected.has(c.url) && '✓ '}{c.title}
            </p>
            <p className={`text-[10px] mt-0.5 ${isAcademic ? 'text-parchment/40' : 'text-[#6b5d52]/70'}`}>{c.sourceName}</p>
            <p className={`text-xs mt-1 ${isAcademic ? 'text-parchment/60' : 'text-[#6b5d52]'}`}>
              {disabled ? `⚠ ${c.failReason ?? '无法抓取'}` : c.reason}
            </p>
          </button>
        )
      })}
      {!message.candidatesResolved && (
        <div className="flex gap-2">
          <button
            type="button"
            data-testid="scout-confirm-candidates"
            disabled={selected.size === 0 || streaming}
            onClick={() => void confirm(Array.from(selected))}
            className={`px-3 py-1.5 rounded text-xs disabled:opacity-30 ${isAcademic ? 'bg-ember/20 text-parchment hover:bg-ember/30' : 'bg-[#1a1a1a] text-white'}`}
          >抓取选中（{selected.size}）</button>
          <button
            type="button"
            data-testid="scout-confirm-all-candidates"
            disabled={streaming}
            onClick={() => void confirm(candidates.filter((c) => c.fetchable !== false).map((c) => c.url))}
            className={`px-3 py-1.5 rounded text-xs ${isAcademic ? 'text-parchment/60 hover:text-parchment' : 'text-[#6b5d52] hover:text-[#1a1a1a]'}`}
          >全部抓取</button>
        </div>
      )}
    </div>
  )
}
