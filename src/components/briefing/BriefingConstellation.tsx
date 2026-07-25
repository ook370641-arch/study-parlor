import type { BriefingStage } from '@shared/index'
import { useStore } from '@/store'
import { Quote } from '@/components/Quote'
import { useEffect, useRef, useState } from 'react'

interface Station {
  key: string
  label: string       // 短名：待机 / 已归位时显示
  activeLabel: string // 进行中完整文案（沿用原进度列表措辞）
}

const DIGEST_STATIONS: Station[] = [
  { key: 'fetching', label: '采集信号', activeLabel: '正在采集今日信号…' },
  { key: 'extracting', label: '提取信息', activeLabel: '正在提取关键信息…' },
  { key: 'assembling', label: '组装简报', activeLabel: '正在组装夜航简报…' },
  { key: 'finalizing', label: '归档', activeLabel: '正在归档…' },
]

const JOB_STATIONS: Station[] = [
  { key: 'scanning-events', label: '扫描新动态', activeLabel: '正在扫描今日新动态…' },
  { key: 'digging-jobs', label: '深挖岗位', activeLabel: '正在深挖焦点岗位…' },
  { key: 'aggregating-questions', label: '聚合面经', activeLabel: '正在聚合面经高频问题…' },
  { key: 'synthesizing', label: '综合生成', activeLabel: '正在综合生成求职简报…' },
  { key: 'finalizing', label: '归档', activeLabel: '正在归档…' },
]

// 卫星驻留位（百分比坐标，井心固定 50%/44%）。纯 CSS 自适应，不读 window.innerWidth。
const POSTS_4 = [
  { x: 10, y: 12 }, { x: 80, y: 10 },
  { x: 8, y: 62 }, { x: 81, y: 61 },
]
const POSTS_5 = [
  { x: 8, y: 10 }, { x: 44, y: 3 }, { x: 80, y: 10 },
  { x: 7, y: 62 }, { x: 81, y: 62 },
]

// 失败漂移向量：每个卫星在 constellation-failed 时平移，营造"散落"感
const FAIL_DRIFT = [{ x: -6, y: -4 }, { x: 6, y: -5 }, { x: -5, y: 5 }, { x: 7, y: 4 }, { x: 4, y: 6 }]

interface Props {
  stage: BriefingStage
  mode?: 'live' | 'resolved' | 'failed'
}

export function BriefingConstellation({ stage, mode = 'live' }: Props) {
  const theme = useStore((s) => s.briefingTheme)
  const source = useStore((s) => s.briefingSource)
  const digestDetail = useStore((s) => s.briefingStageDetail)
  const jobDetail = useStore((s) => s.jobBriefingStageDetail)
  const pulseAt = useStore((s) => s.briefingPulseAt)
  const [pulse, setPulse] = useState(false)
  const [blooming, setBlooming] = useState(false)
  const lastBeat = useRef(0)
  const pulseTimer = useRef<number | null>(null)

  useEffect(() => {
    if (!pulseAt || mode !== 'live') return
    if (pulseAt - lastBeat.current < 400) return
    lastBeat.current = pulseAt
    setPulse(true)
    pulseTimer.current = window.setTimeout(() => setPulse(false), 240)
    return () => { if (pulseTimer.current) clearTimeout(pulseTimer.current) }
  }, [pulseAt, mode])

  const isAcademic = theme !== 'newspaper'
  const isJob = source === 'job-briefing'
  const stations = isJob ? JOB_STATIONS : DIGEST_STATIONS
  const posts = isJob ? POSTS_5 : POSTS_4
  const detail = isJob ? jobDetail : digestDetail

  // 防御：stage key 不属于当前源（跨源串味等历史遗留状态）时回退第一站激活。
  const foundIndex = stations.findIndex((s) => s.key === stage)
  const currentIndex = foundIndex === -1 ? 0 : foundIndex

  useEffect(() => {
    if (mode !== 'live' || currentIndex === 0) return
    setBlooming(true)
    const t = setTimeout(() => setBlooming(false), 800)
    return () => clearTimeout(t)
  }, [currentIndex, mode])

  // 主色：Academic digest = 琥珀；Academic job = 星蓝（源标识，spec §4）；Newspaper = 墨色。
  const accent = !isAcademic ? '#1a1a1a' : isJob ? '#7fa8d9' : '#d97757'
  const inkStrong = isAcademic ? '#f5e6cc' : '#1a1a1a'
  const inkSoft = isAcademic ? '#e8d5b7' : '#1a1a1a'
  const dimText = isAcademic ? 'rgba(232,213,183,0.65)' : 'rgba(26,26,26,0.55)'

  const checking = mode === 'live' && stations[currentIndex]?.key === 'finalizing'
  const wellState = mode === 'resolved' ? 'resolved' : mode === 'failed' ? 'failed' : checking ? 'checking' : 'live'

  return (
    <div
      data-testid="briefing-progress"
      className={`constellation-animated relative h-full w-full overflow-hidden ${mode === 'failed' ? 'constellation-failed' : ''}`}
    >
      <div data-testid="briefing-constellation" className="absolute inset-0">
      {/* 引力线：卫星驻留位 → 井心 */}
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        {stations.map((s, i) => (
          <line
            key={s.key}
            x1={posts[i].x}
            y1={posts[i].y}
            x2={50}
            y2={44}
            stroke={accent}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            strokeDasharray="4,4"
            opacity={i === currentIndex ? 0.7 : i < currentIndex ? 0.5 : 0.22}
          />
        ))}
      </svg>

      {/* 轨道环 */}
      <div
        className="absolute rounded-full pointer-events-none"
        style={{ left: '50%', top: '44%', transform: 'translate(-50%,-50%)', width: 220, height: 220, border: `1px dashed ${accent}38` }}
      />
      <div
        className="absolute rounded-full pointer-events-none opacity-60"
        style={{ left: '50%', top: '44%', transform: 'translate(-50%,-50%)', width: 340, height: 340, border: `1px dashed ${accent}38` }}
      />

      {/* 引力井 */}
      <div
        data-testid="briefing-constellation-well"
        data-state={wellState}
        className={`absolute flex flex-col items-center justify-center rounded-full ${
          mode === 'resolved' ? 'constellation-well-resolved constellation-well-bloom' : ''
        } ${blooming ? 'constellation-well-bloom' : ''}`}
        style={{
          left: '50%', top: '44%',
          transform: `translate(-50%,-50%) scale(${pulse ? 1.015 : 1})`,
          transition: 'transform 240ms ease',
          width: 96, height: 96,
          border: `2px solid ${accent}`,
          background: `${accent}1a`,
          boxShadow: `0 0 24px ${accent}59, 0 0 60px ${accent}26`,
        }}
      >
        {(checking || mode === 'resolved') && (
          <>
            <div className="constellation-photon p1" />
            <div className="constellation-photon p2" />
          </>
        )}
        <div className="font-serif text-[13px]" style={{ color: inkStrong }}>
          {isJob ? '求职' : '夜航'}
        </div>
        {!checking && (
          <div
            key={currentIndex}
            className="font-sans text-[9px] mt-0.5"
            style={{ color: accent, animation: 'wellPulse 600ms ease-out' }}
          >
            {mode === 'resolved' ? stations.length : currentIndex} / {stations.length} 已归位
          </div>
        )}
      </div>

      {/* 卫星（stage 胶囊）；testid 沿用旧进度条契约 */}
      {stations.map((s, i) => {
        const done = i < currentIndex
        const active = i === currentIndex
        return (
          <div
            key={s.key}
            data-testid={`briefing-progress-step-${s.key}`}
            data-state={done ? 'done' : active ? 'active' : 'pending'}
            className={`absolute px-2.5 py-1 rounded font-sans text-[11px] whitespace-nowrap ${done ? 'sat-docked' : ''}`}
            style={{
              left: `${posts[i].x}%`,
              top: `${posts[i].y}%`,
              // 右列驻留位（x > 50）的胶囊向左延伸，避免窄宽度下被 overflow-hidden 裁切。
              transform: !done && posts[i].x > 50 ? 'translateX(-100%)' : undefined,
              transition: done ? 'all 700ms cubic-bezier(0.34, 1.4, 0.5, 1)' : 'all 500ms ease',
              ['--fail-dx' as string]: `${FAIL_DRIFT[i % FAIL_DRIFT.length].x}px`,
              ['--fail-dy' as string]: `${FAIL_DRIFT[i % FAIL_DRIFT.length].y}px`,
              background: isAcademic ? 'rgba(26,21,18,0.92)' : 'rgba(255,255,255,0.92)',
              border: `1px solid ${done || active ? accent : isAcademic ? 'rgba(232,213,183,0.2)' : 'rgba(26,26,26,0.2)'}`,
              color: done ? accent : active ? inkStrong : dimText,
              boxShadow: active ? `0 0 12px ${accent}66` : 'none',
            }}
          >
            {done ? `✓ ${s.label}` : active ? `◉ ${s.activeLabel}` : s.label}
          </div>
        )
      })}

      {/* 井下方：当前站主文案 + detail 副标题 */}
      <div className="absolute left-0 right-0 text-center pointer-events-none" style={{ top: 'calc(44% + 60px)' }}>
        <div className="font-serif text-[14px]" style={{ color: inkSoft }}>
          {stations[currentIndex].activeLabel}
        </div>
        {detail && (
          <div className="font-sans text-[10px] mt-1.5" style={{ color: dimText }}>
            {detail}
          </div>
        )}
      </div>

      {/* 底部常驻语录 */}
      <div className="absolute left-0 right-0 bottom-3 flex justify-center pointer-events-none">
        <div className="pointer-events-auto">
          <Quote surface="briefing" />
        </div>
      </div>
      </div>
    </div>
  )
}
