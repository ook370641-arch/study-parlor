import type { AnthropicError, AnthropicErrorCode } from '@shared/index'

interface Props {
  error: AnthropicError | null | undefined
  onRetry?: () => void
  retryLabel?: string
  className?: string
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
}: Props) {
  if (!error) return null

  const title = CODE_TITLE[error.code] ?? CODE_TITLE.unknown

  return (
    <div
      data-testid="anthropic-error-message"
      className={`rounded border border-wine/50 bg-wine/10 p-4 text-parchment ${className}`}
    >
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm text-parchment/80">{error.message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 text-sm text-ember hover:underline"
        >
          {retryLabel}
        </button>
      )}
    </div>
  )
}
