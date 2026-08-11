// 注意:本文件被渲染进程使用,禁止引入 node 内置模块(ipc-state §5)。
// 工具栏 SVG 图标(蜡烛=引用、轨道=分割线),文案来自设计 visual 对齐稿。
export function QuoteIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 2.5c1.15 1.9 2.05 3.4 2.05 4.9a2.05 2.05 0 1 1-4.1 0c0-1.5.9-3 2.05-4.9z" fill="#d97757" />
      <rect x="9.6" y="9.5" width="4.8" height="11" rx="1.2" fill="currentColor" opacity="0.75" />
    </svg>
  )
}

export function HrIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M2.5 12h19" stroke="currentColor" strokeWidth="1.2" opacity="0.7" strokeLinecap="round" />
      <ellipse cx="12" cy="12" rx="7" ry="2.3" stroke="currentColor" strokeWidth="1" opacity="0.4" />
      <circle cx="12" cy="12" r="2.1" fill="#d97757" />
      <circle cx="19" cy="10.4" r="0.9" fill="currentColor" opacity="0.6" />
    </svg>
  )
}
