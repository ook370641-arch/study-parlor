import type { BriefingStage } from '@shared/index'
import { BriefingConstellation } from '@/components/briefing'

interface Props {
  stage: BriefingStage
}

// 渲染层已升级为夜航星图；stage 防御与 testid 契约由 BriefingConstellation 承担。
export function BriefingProgress({ stage }: Props) {
  return <BriefingConstellation stage={stage} />
}
