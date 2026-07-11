import type { BriefingStage } from '@shared/index'
import { useStore } from '@/store'
import { StarOrbit } from '@/components/StarOrbit'

const DIGEST_STAGES: { key: BriefingStage; label: string }[] = [
  { key: 'fetching', label: '正在采集今日信号…' },
  { key: 'extracting', label: '正在提取关键信息…' },
  { key: 'assembling', label: '正在组装夜航简报…' },
  { key: 'finalizing', label: '正在归档…' },
]

const JOB_STAGES: { key: BriefingStage; label: string }[] = [
  { key: 'discovering', label: '正在发现招聘页…' },
  { key: 'scraping', label: '正在抓取官方招聘页…' },
  { key: 'searching', label: '正在检索全网岗位…' },
  { key: 'synthesizing', label: '正在综合生成求职简报…' },
  { key: 'finalizing', label: '正在归档…' },
]

interface Props {
  stage: BriefingStage
}

export function BriefingProgress({ stage }: Props) {
  const theme = useStore((s) => s.briefingTheme)
  const source = useStore((s) => s.briefingSource)
  const STAGES = source === 'job-briefing' ? JOB_STAGES : DIGEST_STAGES
  const currentIndex = STAGES.findIndex((s) => s.key === stage)
  const isAcademic = theme === 'academic'
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
              {active ? (
                <StarOrbit starCount={3} radius={6} period={2000} />
              ) : (
                <div
                  className={`w-3 h-3 rounded-full border ${
                    done
                      ? 'bg-ember border-ember'
                      : isAcademic
                        ? 'border-parchment/30'
                        : 'border-[#1a1a1a]/30'
                  }`}
                />
              )}
              <span
                className={`font-sans text-xl font-bold ${
                  done
                    ? isAcademic
                      ? 'text-parchment/50'
                      : 'text-[#1a1a1a]/50'
                    : active
                      ? isAcademic
                        ? 'text-parchment'
                        : 'text-[#1a1a1a]'
                      : isAcademic
                        ? 'text-parchment/30'
                        : 'text-[#1a1a1a]/30'
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
