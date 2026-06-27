import { useState } from 'react'
import { useStore } from '@/store'

const STRATEGY_META: Record<string, { label: string; color: string }> = {
  v1: { label: '领域盲区', color: '#d97757' },
  v2: { label: '知识树分支', color: '#7c9cb5' },
  v3: { label: '知识闭环', color: '#6b8f71' },
}

export function StrategyToggle() {
  const inspirationStrategy = useStore((s) => s.inspirationStrategy)
  const setInspirationStrategy = useStore((s) => s.setInspirationStrategy)
  const [hovered, setHovered] = useState(false)

  const cycle = () => {
    const order: Array<'v1' | 'v2' | 'v3'> = ['v1', 'v2', 'v3']
    const idx = order.indexOf(inspirationStrategy)
    const next = order[(idx + 1) % order.length]
    setInspirationStrategy(next)
  }

  const meta = STRATEGY_META[inspirationStrategy]
  const borderColor = meta.color + '80' // 50% opacity

  return (
    <div data-testid="strategy-toggle" className="relative">
      <button
        onClick={cycle}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="w-5 h-5 flex items-center justify-center rounded text-[10px] font-sans font-medium transition-all"
        style={{
          color: meta.color,
          border: `1px solid ${hovered ? meta.color : borderColor}`,
        }}
        title="切换推荐策略"
      >
        {inspirationStrategy}
      </button>
      {hovered && (
        <div className="absolute right-0 top-7 z-20 whitespace-nowrap bg-ink/90 border border-slate/40 rounded px-2 py-1">
          <span className="text-[10px] text-parchment/60 font-sans">
            当前策略: {inspirationStrategy} {meta.label} · 点击切换
          </span>
        </div>
      )}
    </div>
  )
}
