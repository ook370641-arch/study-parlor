import type { BriefingStage } from '@shared/index'

const STAGES: { key: BriefingStage; label: string }[] = [
  { key: 'fetching', label: '正在采集今日信号…' },
  { key: 'extracting', label: '正在提取关键信息…' },
  { key: 'assembling', label: '正在组装夜航简报…' },
  { key: 'finalizing', label: '正在归档…' },
]

interface Props {
  stage: BriefingStage
}

export function BriefingProgress({ stage }: Props) {
  const currentIndex = STAGES.findIndex((s) => s.key === stage)
  return (
    <div data-testid="briefing-progress" className="flex flex-col items-center justify-center h-full">
      <div className="space-y-5">
        {STAGES.map((s, idx) => {
          const done = idx < currentIndex
          const active = idx === currentIndex
          return (
            <div
              key={s.key}
              data-testid={`briefing-progress-step-${s.key}`}
              className="flex items-center gap-3"
            >
              <div
                className={`w-3 h-3 rounded-full border ${
                  done
                    ? 'bg-ember border-ember'
                    : active
                      ? 'bg-parchment border-parchment'
                      : 'border-parchment/30'
                }`}
              />
              <span
                className={`font-sans text-sm ${
                  done
                    ? 'text-parchment/50'
                    : active
                      ? 'text-parchment'
                      : 'text-parchment/30'
                }`}
              >
                {s.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
