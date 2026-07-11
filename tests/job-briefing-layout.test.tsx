import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { JobBriefingRenderer } from '../src/components/job-briefing/JobBriefingRenderer'

const sampleContent = `## 优先岗位

### [OFFICIAL] 腾讯 · AI产品经理培训生
- **城市**: 深圳
- **薪资**: 年薪 40W+
- **难度**: ★★★★☆
- **JD 要点**: 大模型应用、Agent设计
- **来源**: [原文链接](https://example.com/job)

> 💭 **默会知识**: 需要理解 LLM 能力边界。

## 技能雷达

| 技能 | 频次 |
|---|---|
| 大模型 / LLM | 92% |
| Agent 设计 | 78% |

## 趋势解读

当前市场对 AI 产品经理的要求集中在 LLM 应用落地能力。
`

describe('JobBriefingRenderer', () => {
  beforeEach(() => cleanup())

  it('renders job cards', () => {
    render(<JobBriefingRenderer content={sampleContent} theme="academic" fontSize="base" />)
    expect(screen.getByText('腾讯 · AI产品经理培训生')).toBeInTheDocument()
    expect(screen.getAllByTestId('job-briefing-card')).toHaveLength(1)
  })

  it('renders job card details (city, salary, tacit knowledge)', () => {
    render(<JobBriefingRenderer content={sampleContent} theme="academic" fontSize="base" />)
    expect(screen.getByText('城市：深圳')).toBeInTheDocument()
    expect(screen.getByText('薪资：年薪 40W+')).toBeInTheDocument()
    expect(screen.getByText(/需要理解 LLM 能力边界/)).toBeInTheDocument()
  })

  it('renders skill bars', () => {
    render(<JobBriefingRenderer content={sampleContent} theme="academic" fontSize="base" />)
    expect(screen.getAllByTestId('job-briefing-skill-row')).toHaveLength(2)
    expect(screen.getByText('大模型 / LLM')).toBeInTheDocument()
    expect(screen.getByText('92%')).toBeInTheDocument()
  })

  it('renders external link with target and rel', () => {
    render(<JobBriefingRenderer content={sampleContent} theme="academic" fontSize="base" />)
    const link = screen.getByText('原文链接')
    expect(link).toHaveAttribute('href', 'https://example.com/job')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('renders newspaper theme without crashing', () => {
    render(<JobBriefingRenderer content={sampleContent} theme="newspaper" fontSize="base" />)
    expect(screen.getByText('腾讯 · AI产品经理培训生')).toBeInTheDocument()
    expect(screen.getAllByTestId('job-briefing-skill-row')).toHaveLength(2)
  })

  it('renders empty content without crashing', () => {
    const { container } = render(<JobBriefingRenderer content="" theme="academic" fontSize="base" />)
    expect(container.querySelectorAll('[data-testid="job-briefing-card"]')).toHaveLength(0)
  })
})
