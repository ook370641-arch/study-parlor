import { Button } from './Button'

interface Props {
  code: string
  onRetry: () => void
}

const MESSAGES: Record<string, { text: string; showRetry: boolean }> = {
  FEED_EMPTY: { text: '今日海面平静，暂无新信号。', showRetry: false },
  NETWORK_ERROR: { text: '信号塔暂时失联，请检查网络后重试。', showRetry: true },
  LLM_ERROR: { text: '简报员暂时无法整理思路，请稍后再试。', showRetry: true },
  ASSEMBLY_ERROR: { text: '简报格式异常，请重试或联系开发者。', showRetry: true },
}

export function BriefingError({ code, onRetry }: Props) {
  const { text, showRetry } = MESSAGES[code] ?? { text: `简报生成失败：${code}`, showRetry: true }
  return (
    <div data-testid="briefing-error-display" className="text-center space-y-4">
      <p>{text}</p>
      {showRetry && (
        <Button data-testid="briefing-retry-button" onClick={onRetry}>
          重试
        </Button>
      )}
    </div>
  )
}
