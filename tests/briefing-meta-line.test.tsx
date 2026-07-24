import { describe, expect, it } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { BriefingMetaLine } from '@/components/briefing/BriefingMetaLine'

describe('BriefingMetaLine', () => {
  it('renders generated time and failed sources with testids', () => {
    cleanup()
    render(
      <BriefingMetaLine
        displayDate="2026 年 07 月 24 日"
        timeString="08:30"
        sourceStatus={{ x: 'failed', blogs: 'ok', podcasts: 'empty' }}
        cacheWriteFailed
        theme="academic"
      />
    )
    expect(screen.getByTestId('briefing-generated-at')).toHaveTextContent('2026 年 07 月 24 日')
    expect(screen.getByTestId('briefing-generated-at')).toHaveTextContent('08:30')
    expect(screen.getByTestId('briefing-source-status')).toHaveTextContent('X 获取失败')
    expect(screen.getByTestId('briefing-source-empty')).toHaveTextContent('播客 暂无更新')
    expect(screen.getByTestId('briefing-cache-write-failed')).toBeInTheDocument()
  })

  it('renders nothing extra when all sources ok', () => {
    cleanup()
    render(<BriefingMetaLine displayDate="D" theme="academic" />)
    expect(screen.getByTestId('briefing-generated-at')).toHaveTextContent('D')
    expect(screen.queryByTestId('briefing-source-status')).not.toBeInTheDocument()
    expect(screen.queryByTestId('briefing-source-empty')).not.toBeInTheDocument()
    expect(screen.queryByTestId('briefing-cache-write-failed')).not.toBeInTheDocument()
  })
})
