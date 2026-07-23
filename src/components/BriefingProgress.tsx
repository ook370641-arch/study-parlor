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
  { key: 'scanning-events', label: '正在扫描今日新动态…' },
  { key: 'digging-jobs', label: '正在深挖焦点岗位…' },
  { key: 'aggregating-questions', label: '正在聚合面经高频问题…' },
  { key: 'synthesizing', label: '正在综合生成求职简报…' },
  { key: 'finalizing', label: '正在归档…' },
]

interface Props {
  stage: BriefingStage
  onCancel?: () => void
}

export function BriefingProgress({ stage, onCancel }: Props) {
  const theme = useStore((s) => s.briefingTheme)
  const source = useStore((s) => s.briefingSource)
  const STAGES = source === 'job-briefing' ? JOB_STAGES : DIGEST_STAGES
  const foundIndex = STAGES.findIndex((s) => s.key === stage)
  // 防御：stage key 不属于当前源（跨源串味等历史遗留状态）时显式回退到
  // 第一阶段激活，不再静默渲染成 5 行全灰（看似「无文字闪烁条」）。
  const currentIndex = foundIndex === -1 ? 0 : foundIndex
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
      {onCancel && (
        <button
          data-testid="briefing-cancel-button"
          onClick={onCancel}
          className={`mt-8 text-sm underline underline-offset-4 ${
            isAcademic ? 'text-parchment/50 hover:text-parchment' : 'text-[#6b5d52] hover:text-[#1a1a1a]'
          }`}
        >
          取消生成
        </button>
      )}
    </div>
  )
}
