import { useId } from 'react'
import type { GuideProgress } from '@shared/index'

// ── 导读三阶段罗盘 ────────────────────────────────────────────────────────────
// 纯展示组件：planning / searching / writing 三层画在同一张 SVG 里，靠 data-stage 切换。
// 文案由外层负责（guide-progress 容器里的 label/detail），SVG 内只画图形、不显示百分比。
// 动画全部是 CSS keyframes，prefers-reduced-motion 下统一 animation: none（只留颜色状态）。

const C = {
  ember: '#d97757',
  // 资料夹图标（searching 吸附端）
  folderStroke: { academic: 'rgba(232, 213, 183, 0.55)', newspaper: 'rgba(26, 26, 26, 0.45)' },
  line: { academic: 'rgba(232, 213, 183, 0.22)', newspaper: 'rgba(26, 26, 26, 0.18)' },
  outline: { academic: 'rgba(232, 213, 183, 0.5)', newspaper: 'rgba(26, 26, 26, 0.42)' },
}

// 画面边界：文档轮廓 + 检索节点弧 + 资料夹 + 撰写格子都落在这个范围内。
// 画面边界：方形构图（200×200）。竖排窄栏里横向画面只能高 104/200 倍宽，
// 方形视口才能让「宽度」直接决定画面大小——加载态放大约 2.8 倍。
const DOC = { x: 30, y: 48, w: 78, h: 104 }
const VIEW = { x: 0, y: 0, w: 200, h: 200 }
const VIEW_BOX = `${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`

// 8 个节点沿一条从文档右下角出发、向右上展开的弧排布（固定坐标，越靠右越收拢）
const NODE_POINTS = [
  { x: 118, y: 150 },
  { x: 131, y: 134 },
  { x: 144, y: 120 },
  { x: 157, y: 108 },
  { x: 168, y: 97 },
  { x: 178, y: 88 },
  { x: 186, y: 81 },
  { x: 193, y: 76 },
]
const MAX_NODES = 8
const FOLDER = { x: 172, y: 168, w: 22, h: 15 }
const MAX_CELLS = 12

// 构图居中：每个阶段「实际画出来的内容」的包围盒中心都不在视口正中，
// 直接按视口画会让动画贴在侧栏左侧（2026-10-28 用户走查）。
//   planning  文档 + 旋转虚线环 → x 7..131 / y 38..162 → 中心 (69, 100)
//   searching 文档 + 节点外圈 + 资料夹 → x 30..200 / y 48..183 → 中心 (115, 115.5)
//   writing   只有文档 → x 30..108 / y 48..152 → 中心 (69, 100)
// 按阶段把内容平移到视口中心 (100, 100)，三段画面都视觉居中。
const STAGE_SHIFT: Record<GuideProgress['stage'], [number, number]> = {
  planning: [31, 0],
  searching: [-15, -15.5],
  writing: [31, 0],
}
const shiftOf = (stage: GuideProgress['stage']) =>
  `translate(${STAGE_SHIFT[stage][0]} ${STAGE_SHIFT[stage][1]})`

const KEYFRAMES = `
.gc-scan { animation: gc-scan 2.4s linear infinite; }
.gc-spin { animation: gc-spin 6s linear infinite; transform-box: fill-box; transform-origin: center; }
.gc-pulse { animation: gc-pulse 1.2s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
.gc-blink { animation: gc-blink 1.1s ease-in-out infinite; }
.gc-flow { animation: gc-flow 1.8s linear infinite; }
@keyframes gc-scan { 0% { transform: translateY(0); } 100% { transform: translateY(104px); } }
@keyframes gc-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@keyframes gc-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
@keyframes gc-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.42; } }
@keyframes gc-flow { from { offset-distance: 0%; } to { offset-distance: 100%; } }
@media (prefers-reduced-motion: reduce) {
  .gc-scan, .gc-spin, .gc-pulse, .gc-blink, .gc-flow { animation: none !important; }
}
`

interface Props {
  progress: GuideProgress | null
  theme: 'academic' | 'newspaper'
  /** 容器高度：
   *  - 数字：固定高度（默认 84px 紧凑条）
   *  - 'auto'：按 viewBox 比例自适应——不留上下黑边，画面真正占满宽度 */
  height?: number | string
}

export function GuideCompass({ progress, theme, height = 84 }: Props) {
  const stage = progress?.stage ?? 'planning'
  const line = C.line[theme]
  const outline = C.outline[theme]
  const clipId = `gc-doc-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const boxStyle =
    height === 'auto'
      ? { aspectRatio: `${VIEW.w} / ${VIEW.h}`, width: '100%' }
      : { height }

  return (
    <div data-testid="guide-compass" aria-hidden="true" className="w-full" style={boxStyle}>
      <style>{KEYFRAMES}</style>
      <svg
        viewBox={VIEW_BOX}
        data-stage={stage}
        className="w-full h-full"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={DOC.x} y={DOC.y} width={DOC.w} height={DOC.h} rx={2} />
          </clipPath>
        </defs>

        {stage === 'planning' && (
          <g data-testid="guide-compass-planning" transform={shiftOf('planning')}>
            <rect
              x={DOC.x} y={DOC.y} width={DOC.w} height={DOC.h} rx={2}
              fill="none" stroke={outline} strokeWidth={1}
            />
            {/* ember 扫描光带，自上而下循环（行程 = 文档高度） */}
            <g clipPath={`url(#${clipId})`}>
              <rect x={DOC.x} y={DOC.y} width={DOC.w} height={12} fill={C.ember} opacity={0.18} className="gc-scan" />
            </g>
            {/* 外圈缓慢旋转的虚线环 */}
            <circle
              cx={DOC.x + DOC.w / 2} cy={DOC.y + DOC.h / 2} r={62}
              fill="none" stroke={C.ember} strokeOpacity={0.35}
              strokeDasharray="3 5" className="gc-spin"
            />
          </g>
        )}

        {stage === 'searching' && (() => {
          const searching = progress as Extract<GuideProgress, { stage: 'searching' }>
          const total = Math.max(searching.total, 0)
          const done = searching.done
          const hits = searching.hits
          const queries = searching.queries
          const shown = Math.min(total, MAX_NODES)
          const overflow = total - shown

          return (
            <g data-testid="guide-compass-searching" transform={shiftOf('searching')}>
              {/* 文档轮廓常驻：检索是「从这一章里长出来的线索」，不是悬浮的点 */}
              <rect
                x={DOC.x} y={DOC.y} width={DOC.w} height={DOC.h} rx={2}
                fill="none" stroke={outline} strokeWidth={1}
              />
              {/* 文档右缘 → 资料夹的弧线（从文档边缘起笔） */}
              <polyline
                points={[{ x: DOC.x + DOC.w, y: DOC.y + DOC.h - 4 }, ...NODE_POINTS]
                  .map((p) => `${p.x},${p.y}`)
                  .join(' ')}
                fill="none" stroke={line} strokeWidth={1}
              />

              {NODE_POINTS.slice(0, shown).map((p, i) => {
                const hit = hits?.[i]
                const isDone = i < done
                // 外圈半径按命中数：0 → 4，1-2 → 5.5，>=3 → 7，未知 → 5
                const r = typeof hit === 'number' && hit >= 0
                  ? hit === 0 ? 4 : hit <= 2 ? 5.5 : 7
                  : 5
                const q = queries?.[i]
                const anchor = { x: FOLDER.x + 2, y: FOLDER.y + FOLDER.h / 2 }
                const path = `M ${p.x} ${p.y} Q ${(p.x + anchor.x) / 2} ${p.y + 10} ${anchor.x} ${anchor.y}`
                // 运动圆点用本地坐标：父级 translate 到节点，路径从 (0,0) 出发。
                // 不支持 offset-path 时圆点停在 (0,0)（即节点处），自然退化为静止点。
                const localPath = `M 0 0 Q ${(anchor.x - p.x) / 2} 10 ${anchor.x - p.x} ${anchor.y - p.y}`

                return (
                  <g
                    key={i}
                    data-testid="guide-compass-node"
                    data-done={isDone ? 'true' : 'false'}
                    data-query={q}
                    opacity={isDone || i === done ? 1 : 0.55}
                  >
                    {isDone && (
                      <>
                        <path d={path} fill="none" stroke={C.ember} strokeOpacity={0.5} strokeWidth={1} strokeDasharray="2 3" />
                        {/* 沿路径运动的小圆点；不支持 offset-path 时停在节点处（静止点） */}
                        <g transform={`translate(${p.x} ${p.y})`}>
                          <circle
                            data-testid="guide-compass-traveler"
                            cx={0} cy={0} r={1.6} fill={C.ember}
                            style={{ offsetPath: `path("${localPath}")`, animationDelay: `${(i % 4) * 0.15}s` }}
                            className="gc-flow"
                          />
                        </g>
                      </>
                    )}
                    <circle
                      data-testid="guide-compass-hit-ring"
                      cx={p.x} cy={p.y} r={r}
                      fill="none" stroke={C.ember}
                      strokeOpacity={isDone ? 0.85 : 0.35} strokeWidth={1}
                    />
                    <circle
                      cx={p.x} cy={p.y} r={2.6}
                      fill={isDone ? C.ember : 'none'}
                      stroke={isDone ? 'none' : C.ember}
                      strokeOpacity={0.6} strokeWidth={1}
                      className={i === done ? 'gc-pulse' : undefined}
                    />
                  </g>
                )
              })}

              {/* 资料夹图标（资料归档端） */}
              <g stroke={C.folderStroke[theme]} strokeWidth={1} fill="none">
                <path d={`M ${FOLDER.x} ${FOLDER.y + 2} h 7 l 2 2 h ${FOLDER.w - 9} v ${FOLDER.h - 4} h ${-FOLDER.w} z`} />
              </g>

              {overflow > 0 && (
                <text x={196} y={62} textAnchor="end" fontSize={9} fill={C.ember} fillOpacity={0.8}>
                  +{overflow}
                </text>
              )}
            </g>
          )
        })()}

        {stage === 'writing' && (() => {
          const writing = progress as Extract<GuideProgress, { stage: 'writing' }>
          const cells = Math.min(Math.max(writing.entriesTotal, 0), MAX_CELLS)
          const lit = writing.entriesDone
          return (
            <g data-testid="guide-compass-writing" transform={shiftOf('writing')}>
              <rect
                x={DOC.x} y={DOC.y} width={DOC.w} height={DOC.h} rx={2}
                fill="none" stroke={outline} strokeWidth={1}
              />
              {/* 2 列 × 6 行格子（最多 12 格），填满进度由 data-lit 表达 */}
              {Array.from({ length: cells }, (_, i) => {
                const col = i % 2
                const row = Math.floor(i / 2)
                const x = DOC.x + 8 + col * 33
                const y = DOC.y + 8 + row * 15
                const isLit = i < lit
                return (
                  <rect
                    key={i}
                    data-testid="guide-compass-cell"
                    data-lit={isLit ? 'true' : 'false'}
                    x={x} y={y} width={29} height={10} rx={1}
                    fill={isLit ? C.ember : 'none'}
                    fillOpacity={isLit ? 0.85 : 0}
                    stroke={C.ember}
                    strokeOpacity={isLit ? 0.9 : 0.3}
                    strokeWidth={1}
                    className={i === lit ? 'gc-blink' : undefined}
                  />
                )
              })}
            </g>
          )
        })()}
      </svg>
    </div>
  )
}
