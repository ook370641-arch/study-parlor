import { useStore } from '@/store'

interface Props {
  surface: 'cover' | 'home' | 'study' | 'briefing'
  'data-testid'?: string
}

// 画作删除按钮：点击即把当前画作从抽取池永久隐藏（state.json 隐藏名单），
// 无确认、无弹窗，store 内自动换到下一幅。仅封面挂载（由 Cover 控制）。
export function DeletePaintingButton({ surface, 'data-testid': dataTestId }: Props) {
  const hidePainting = useStore(s => s.hidePainting)
  const painting = useStore(s => s.currentPaintings[surface])

  return (
    <button
      data-testid={dataTestId ?? 'painting-delete-button'}
      type="button"
      onClick={() => { void hidePainting(surface) }}
      disabled={!painting}
      className={`swap-btn ${!painting ? 'opacity-50 cursor-default' : ''}`}
      aria-label="移出库"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-4 h-4"
      >
        <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      </svg>
    </button>
  )
}
