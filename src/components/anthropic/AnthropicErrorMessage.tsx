import type { AnthropicError, AnthropicErrorCode, BriefingTheme } from '@shared/index'

interface Props {
  error: AnthropicError | null | undefined
  onRetry?: () => void
  retryLabel?: string
  className?: string
  theme?: BriefingTheme
}

const CODE_TITLE: Record<AnthropicErrorCode, string> = {
  'browser-init-failed': '浏览器初始化失败',
  'network-error': '网络异常',
  'parse-error': '页面解析失败',
  'import-failed': '导入失败',
  cancelled: '已取消',
  unknown: '出现错误',
}

export function AnthropicErrorMessage({
  error,
  onRetry,
  retryLabel = '重试',
  className = '',
  theme = 'academic',
}: Props) {
  if (!error) return null

  const title = CODE_TITLE[error.code] ?? CODE_TITLE.unknown
  const isAcademic = theme === 'academic'

  return (
    <div
      data-testid="anthropic-error-message"
      className={`rounded border p-4 ${
        isAcademic
          ? 'border-wine/50 bg-wine/10 text-parchment'
          : 'border-[#c9c3b8] bg-[#f5f2ed] text-[#1a1a1a]'
      } ${className}`}
    >
      <p className="font-medium">{title}</p>
      <p className={`mt-1 text-sm ${isAcademic ? 'text-parchment/80' : 'text-[#555]'}`}>
        {error.message}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className={`mt-3 text-sm ${
            isAcademic
              ? 'text-ember hover:underline'
              : 'rounded bg-[#1a1a1a] px-3 py-1.5 text-white hover:bg-[#333]'
          }`}
        >
          {retryLabel}
        </button>
      )}
    </div>
  )
}
