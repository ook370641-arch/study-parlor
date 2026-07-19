import { useEffect, useRef, useState } from 'react'

// 12 个神经节点的相对位置（百分比）
const NEURAL_NODES = [
  { x: 30, y: 35 }, { x: 70, y: 30 }, { x: 75, y: 55 },
  { x: 65, y: 70 }, { x: 35, y: 65 }, { x: 25, y: 50 },
  { x: 50, y: 25 }, { x: 80, y: 42 }, { x: 55, y: 75 },
  { x: 40, y: 78 }, { x: 20, y: 40 }, { x: 72, y: 65 },
]

// 节点连接关系 [from, to]
const NEURAL_CONNECTIONS = [
  [0, 5], [5, 1], [1, 2], [2, 3], [3, 4], [4, 0],
  [5, 7], [7, 8], [8, 4], [0, 6], [6, 1], [2, 7], [3, 8],
]

// 5 个墨斑 blob 的配置（threshold 延后，让节点先出现）
const INK_BLOBS = [
  { w: 100, h: 70, dx: 4, dy: -4, rotate: 25, blur: 5, threshold: 35 },
  { w: 80, h: 60, dx: -8, dy: 4, rotate: -30, blur: 6, threshold: 42 },
  { w: 70, h: 80, dx: -2, dy: -8, rotate: 10, blur: 7, threshold: 50 },
  { w: 90, h: 50, dx: 8, dy: 8, rotate: -15, blur: 5, threshold: 58 },
  { w: 60, h: 90, dx: -6, dy: 0, rotate: 40, blur: 8, threshold: 65 },
]

// 4 层涟漪环（threshold 提前）
const RINGS = [
  { size: 60, threshold: 10 },
  { size: 110, threshold: 20 },
  { size: 160, threshold: 30 },
  { size: 220, threshold: 40 },
]

interface LoadingScreenProps {
  onComplete?: () => void
}

export function LoadingScreen({ onComplete }: LoadingScreenProps) {
  const [progress, setProgress] = useState(0)
  const [stage, setStage] = useState('初始化')
  const [visible, setVisible] = useState(true)
  const [exiting, setExiting] = useState(false)
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  useEffect(() => {
    // 使用 window.api 直接调用，避免依赖 ipc 模块（store 尚未初始化）
    if (!window.api) return
    // boot:complete 事件与 bootStart() 返回的 alreadyCompleted 是两条独立路径，
    // reload 场景下会同时命中。守卫确保 onComplete 只触发一次，
    // 否则 store.init / files:scan 会重复执行。
    let completed = false
    const finish = () => {
      if (completed) return
      completed = true
      setProgress(100)
      setStage('就绪')
      setExiting(true)
      setTimeout(() => {
        setVisible(false)
        onCompleteRef.current?.()
      }, 700)
    }
    const unsubProgress = window.api.onBootProgress((s, p) => {
      setStage(s)
      setProgress(p)
    })
    const unsubComplete = window.api.onBootComplete(finish)
    // Signal main process that we're ready to receive boot events
    window.api.bootStart().then((result) => {
      // If boot already completed before this renderer mounted (e.g. after reload),
      // trigger completion locally to avoid relying on a race-prone event.
      if (result?.alreadyCompleted) finish()
    })
    return () => {
      unsubProgress()
      unsubComplete()
    }
  }, [])

  if (!visible) return null

  // 计算各视觉元素的激活状态
  const inkCenterSize = 20 + Math.min(1, progress / 15) * 40 // 20px -> 60px
  const bgWarmth = progress > 10 ? Math.min(0.3, ((progress - 10) / 40) * 0.3) : 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{
        background:
          bgWarmth > 0
            ? `linear-gradient(to bottom, rgba(35,22,12,${bgWarmth}), #1a1410)`
            : '#1a1410',
        opacity: exiting ? 0 : 1,
        transition: 'opacity 700ms ease-out',
      }}
    >
      {/* ===== 墨滴中心 ===== */}
      <div
        className="absolute"
        style={{
          left: '50%',
          top: '50%',
          width: inkCenterSize,
          height: inkCenterSize,
          transform: 'translate(-50%, -50%)',
          borderRadius: '50%',
          background:
            'radial-gradient(circle at 40% 35%, rgba(130,75,40,0.7) 0%, rgba(90,50,28,0.5) 50%, transparent 70%)',
          filter: 'blur(2px)',
          transition: 'width 0.3s ease-out, height 0.3s ease-out',
        }}
      />

      {/* ===== 涟漪环 ===== */}
      {RINGS.map((ring, i) => {
        const active = progress > ring.threshold
        const ringProgress = active
          ? Math.min(1, (progress - ring.threshold) / 30)
          : 0
        return (
          <div
            key={i}
            className="absolute"
            style={{
              left: '50%',
              top: '50%',
              width: ring.size * ringProgress,
              height: ring.size * ringProgress,
              transform: 'translate(-50%, -50%)',
              borderRadius: '50%',
              border: `1.5px solid rgba(100,60,30,${ringProgress * 0.3})`,
              opacity: ringProgress * 0.4,
              transition: 'all 0.5s ease-out',
            }}
          />
        )
      })}

      {/* ===== 墨斑 blob ===== */}
      {INK_BLOBS.map((blob, i) => {
        const active = progress > blob.threshold
        const blobProgress = active
          ? Math.min(1, (progress - blob.threshold) / 20)
          : 0
        return (
          <div
            key={i}
            className="absolute"
            style={{
              left: `calc(50% + ${blob.dx}px)`,
              top: `calc(50% + ${blob.dy}px)`,
              width: blob.w,
              height: blob.h,
              transform: `translate(-50%, -50%) rotate(${blob.rotate}deg)`,
              borderRadius: '50%',
              background:
                'radial-gradient(ellipse at 30% 30%, rgba(110,65,35,0.25) 0%, transparent 70%)',
              filter: `blur(${blob.blur}px)`,
              opacity: blobProgress,
              transition: 'opacity 0.8s ease-out',
            }}
          />
        )
      })}

      {/* ===== 神经节点 ===== */}
      {NEURAL_NODES.map((node, i) => {
        const threshold = 20 + (i / NEURAL_NODES.length) * 40
        const active = progress > threshold
        const nodeProgress = active
          ? Math.min(1, (progress - threshold) / 25)
          : 0
        const size = 2 + (i % 3) * 1.2
        return (
          <div
            key={i}
            className="absolute"
            style={{
              left: `${node.x}%`,
              top: `${node.y}%`,
              width: size,
              height: size,
              borderRadius: '50%',
              background: `rgba(217,119,87,${nodeProgress * 0.4})`,
              boxShadow: `0 0 8px rgba(217,119,87,${nodeProgress * 0.25})`,
              transform: 'translate(-50%, -50%)',
              transition: 'all 0.6s ease-out',
            }}
          />
        )
      })}

      {/* ===== 连接线 ===== */}
      {NEURAL_CONNECTIONS.map((conn, i) => {
        const threshold = 50 + (i / NEURAL_CONNECTIONS.length) * 35
        const active = progress > threshold
        const lineProgress = active
          ? Math.min(0.6, ((progress - threshold) / 25) * 0.6)
          : 0
        const n1 = NEURAL_NODES[conn[0]]
        const n2 = NEURAL_NODES[conn[1]]
        const dx = n2.x - n1.x
        const dy = n2.y - n1.y
        const len = Math.sqrt(dx * dx + dy * dy)
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI
        return (
          <div
            key={`line-${i}`}
            className="absolute"
            style={{
              left: `${n1.x}%`,
              top: `${n1.y}%`,
              width: `${len}%`,
              height: 1.5,
              transformOrigin: 'left center',
              transform: `rotate(${angle}deg)`,
              background: `linear-gradient(90deg, rgba(217,119,87,0), rgba(217,119,87,${lineProgress * 0.3}), rgba(217,119,87,0))`,
              opacity: lineProgress,
              transition: 'opacity 0.8s ease-out',
            }}
          />
        )
      })}

      {/* ===== EMERGING 标签 ===== */}
      <div
        className="absolute"
        style={{
          bottom: 44,
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: 10,
          letterSpacing: 4,
          color: `rgba(232,213,183,${
            progress > 75 ? Math.min(0.35, ((progress - 75) / 25) * 0.35) : 0
          })`,
          transition: 'color 1s ease-out',
        }}
      >
        EMERGING
      </div>

      {/* ===== 阶段文字 ===== */}
      <div
        className="absolute"
        style={{
          bottom: 16,
          left: 14,
          fontSize: 10,
          letterSpacing: 1,
          color:
            progress < 100
              ? 'rgba(217,119,87,0.7)'
              : 'rgba(232,213,183,0.4)',
          transition: 'color 0.3s ease',
        }}
      >
        {stage}
      </div>

      {/* ===== 进度条 ===== */}
      <div
        className="absolute"
        style={{ bottom: 0, left: 0, right: 0, height: 3, background: 'rgba(232,213,183,0.05)' }}
      >
        <div
          style={{
            height: '100%',
            width: `${progress}%`,
            background: 'linear-gradient(90deg, #d97757, rgba(217,119,87,0.4))',
            transition: 'width 0.1s linear',
          }}
        />
      </div>

      {/* ===== Vignette 压暗边缘 ===== */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ boxShadow: 'inset 0 0 100px 30px rgba(0,0,0,0.55)' }}
      />
    </div>
  )
}
