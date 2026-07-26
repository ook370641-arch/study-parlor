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
 *
 * fresh 必须在 loading→result 完成的那一次 render 中即为 true（同步推导），
 * 否则抵达动画会滞后一帧——内容先完整可见（data-arrival="revisit"），
 * 再跳到 opacity:0 开始动画（data-arrival="fresh"），表现为闪白或无动画。
 */
export function useGenerationTransition(
  key: string,
  loading: boolean,
  hasResult: boolean,
  hasError: boolean,
): { phase: GenerationPhase; fresh: boolean } {
  const [phase, setPhase] = useState<GenerationPhase>('idle')
  const timers = useRef<number[]>([])

  // ---- fresh：同步推导（render 阶段，零滞后帧） ----
  const freshRef = useRef(false)
  const prevKey = useRef(key)
  const prevLoading = useRef(loading)

  // key 变更 → 在 render 阶段归零所有 per-key 状态
  if (prevKey.current !== key) {
    prevKey.current = key
    freshRef.current = false
    prevLoading.current = loading
  }

  // 检测 loading→!loading 跳变：上一帧 loading=true，本帧 loading=false 且拿到了结果
  if (prevLoading.current && !loading && hasResult && !hasError) {
    freshRef.current = true
  }

  // 保存本帧 loading 供下一帧比较
  prevLoading.current = loading

  // ---- phase：useEffect 管理（定时器/异步过渡，逻辑不变） ----

  useEffect(() => {
    timers.current.forEach(clearTimeout)
    timers.current = []
    setPhase('idle')
  }, [key])

  const wasLoading = useRef(false)

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

  return { phase, fresh: freshRef.current }
}
