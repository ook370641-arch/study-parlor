import type { BriefingStage } from '@shared/index'
import { useStore } from '@/store'
import { BriefingConstellation } from '@/components/briefing'

interface Props {
  stage: BriefingStage
  onCancel?: () => void
}

export function BriefingProgress({ stage, onCancel }: Props) {
  const theme = useStore((s) => s.briefingTheme)
  const isAcademic = theme !== 'newspaper'

  return (
    <div className="flex flex-col items-center justify-center h-full">
      <BriefingConstellation stage={stage} />
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
