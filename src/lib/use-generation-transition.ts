import { useEffect, useRef, useState } from 'react'

export type GenerationPhase = 'idle' | 'generating' | 'resolved' | 'departing' | 'failing' | 'failed'

/** 成功收束（光子坠心绽光）时长 */
export const RESOLVED_MS = 900
/** 星图退潮时长 */
export const DEPART_MS = 600
/** 失败收束（屏息 400ms + 漂移褪冷 600ms）时长 */
export const FAILING_MS = 1000

/**
 * 生成→阅读/错误的过渡状态机（F4/F5 的编排核心）。
 * fresh：本次 key 内是否经历过 resolved（= 新抵达，配享有抵达动画；revisit 不重演）。
 * key = `${source}:${date}`，切换即归零（快速切换无残留）。
 */
export function useGenerationTransition(
  key: string,
  loading: boolean,
  hasResult: boolean,
  hasError: boolean,
): { phase: GenerationPhase; fresh: boolean } {
  const [phase, setPhase] = useState<GenerationPhase>('idle')
  const [fresh, setFresh] = useState(false)
  const timers = useRef<number[]>([])
  const wasLoading = useRef(false)

  useEffect(() => {
    timers.current.forEach(clearTimeout)
    timers.current = []
    wasLoading.current = false
    setPhase('idle')
    setFresh(false)
  }, [key])

  useEffect(() => {
    const clear = () => { timers.current.forEach(clearTimeout); timers.current = [] }
    if (loading) {
      wasLoading.current = true
      setPhase('generating')
      return clear
    }
    if (wasLoading.current) {
      wasLoading.current = false
      if (hasError) {
        setPhase('failing')
        timers.current.push(window.setTimeout(() => setPhase('failed'), FAILING_MS))
      } else if (hasResult) {
        setFresh(true)
        setPhase('resolved')
        timers.current.push(window.setTimeout(() => setPhase('departing'), RESOLVED_MS))
        timers.current.push(window.setTimeout(() => setPhase('idle'), RESOLVED_MS + DEPART_MS))
      } else {
        setPhase('idle') // 取消：冻结回中性
      }
      return clear
    }
    if (hasError) setPhase('failed')
    return clear
  }, [loading, hasResult, hasError])

  return { phase, fresh }
}
