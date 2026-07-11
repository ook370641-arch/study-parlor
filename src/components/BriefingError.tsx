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
  MISSING_SEARCH_KEY: { text: '未配置 Tavily API Key，请先在设置中配置。', showRetry: false },
  OFFICIAL_PAGE_FAILED: { text: '部分官方招聘页获取失败，已尝试用 Tavily 补齐。', showRetry: true },
  EXTRACTION_ERROR: { text: '岗位信息提取失败，请重试。', showRetry: true },
  EMPTY_RESULTS: { text: '今日暂无岗位信息，请稍后重试。', showRetry: true },
  CACHE_WRITE_FAILED: { text: '简报已生成，但缓存写入失败。', showRetry: false },
  JOB_MISSING_SEARCH_KEY: { text: '未配置 Tavily API Key，请先在设置中配置。', showRetry: false },
  JOB_NETWORK_ERROR: { text: '网络异常，请检查网络后重试。', showRetry: true },
  JOB_OFFICIAL_PAGE_FAILED: { text: '部分官方招聘页获取失败，已尝试用 Tavily 补齐。', showRetry: true },
  JOB_EXTRACTION_ERROR: { text: '岗位信息提取失败，请重试。', showRetry: true },
  JOB_EMPTY_RESULTS: { text: '今日暂无岗位信息，请稍后重试。', showRetry: true },
  JOB_CACHE_WRITE_FAILED: { text: '简报已生成，但缓存写入失败。', showRetry: false },
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
