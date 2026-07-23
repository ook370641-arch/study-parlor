import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { JobBriefingRenderer } from '../src/components/job-briefing/JobBriefingRenderer'

const CONTENT = `## 今日新动态

- **[秋招开启] 腾讯** · 2026-07-19 — 2027 届秋招正式启动，AI 产品线首批放出模型产品经理等岗位。
  [原文链接](https://example.com/event)
- **[线下活动] 字节跳动** · — AI 产品经理闭门分享会，北京。
  [原文链接](https://example.com/event2)

## 与你最适配的岗位

### [★★★★★] 腾讯 · 模型产品经理（校招）
- **城市**: 深圳
- **源自**: [秋招开启] 腾讯 · 2027 届秋招正式启动（今日新动态）
- **JD 要点**: 大模型应用、评测体系搭建
- **为什么适合你**: 你的 RAG 项目经历直接对应 JD 要求。
- **来源**: [投递链接](https://example.com/job)

> 💭 **准备建议**: 复习 RAG 链路拆解。

### [推荐] 百度 · AI产品经理
- **城市**: 北京
- **源自**: 关注列表常规检索
- **JD 要点**: 搜索 AI 化
- **岗位亮点**: 大厂核心搜索业务。
- **来源**: [投递链接](https://example.com/job2)

## 高频考察问题

1. **如何为多解问题确定评测指标？**（高频 · 腾讯模型产品面经 · [原文](https://example.com/mj1)）
   - 考察意图: 评估评测体系设计能力。
   - 准备要点: 准备标注一致性方案。
2. **如何搭建自动化测试链路？**（出现多次 · 字节/百度 · [原文](https://example.com/mj2)）
   - 考察意图: 评估工程化思维。
   - 准备要点: 准备 CI 接入案例。

## 趋势解读

腾讯秋招开启释放信号：模型产品岗强调评测体系能力。`

function renderAcademic(content = CONTENT) {
  return render(<JobBriefingRenderer content={content} theme="academic" fontSize="base" />)
}

describe('JobBriefingRenderer four sections', () => {
  afterEach(cleanup)

  it('renders events timeline with type badge and link', () => {
    renderAcademic()
    const events = screen.getAllByTestId('job-briefing-event')
    expect(events).toHaveLength(2)
    expect(events[0]).toHaveTextContent('秋招开启')
    expect(events[0]).toHaveTextContent('腾讯')
    expect(events[0]).toHaveTextContent('2026-07-19')
    const link = events[0].querySelector('a')
    expect(link).toHaveAttribute('href', 'https://example.com/event')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })

  it('renders job cards with match stars, origin and match reason', () => {
    renderAcademic()
    const cards = screen.getAllByTestId('job-briefing-card')
    expect(cards).toHaveLength(2)
    expect(cards[0]).toHaveTextContent('★★★★★')
    expect(cards[0]).toHaveTextContent('为什么适合你')
    expect(cards[0]).toHaveTextContent('准备建议')
    // 源自今日新动态的卡片有溯源标注
    expect(cards[0].querySelector('[data-testid="job-card-origin"]')).toHaveAttribute('data-today', 'true')
    // 常规检索的卡片不高亮
    expect(cards[1].querySelector('[data-testid="job-card-origin"]')).toHaveAttribute('data-today', 'false')
    expect(cards[1]).toHaveTextContent('岗位亮点')
  })

  it('renders questions as collapsible details', () => {
    renderAcademic()
    const questions = screen.getAllByTestId('job-briefing-question')
    expect(questions).toHaveLength(2)
    expect(questions[0].tagName).toBe('DETAILS')
    expect(questions[0]).toHaveTextContent('如何为多解问题确定评测指标？')
    expect(questions[0]).toHaveTextContent('考察意图')
    expect(questions[0]).toHaveTextContent('准备要点')
  })

  it('renders trends section', () => {
    renderAcademic()
    expect(screen.getByText('趋势解读')).toBeInTheDocument()
    expect(screen.getByText(/模型产品岗强调评测体系能力/)).toBeInTheDocument()
  })

  it('renders 本期暂无 for empty sections without crashing', () => {
    renderAcademic('## 今日新动态\n\n本期暂无\n\n## 与你最适配的岗位\n\n本期暂无\n\n## 高频考察问题\n\n本期暂无\n\n## 趋势解读\n\n本期暂无')
    expect(screen.getAllByText('本期暂无').length).toBeGreaterThan(0)
  })

  it('tolerates events without leading bullet (real LLM output variant)', () => {
    // 真实生成中 LLM 有时省略 `- ` 列表符（2026-07-20 filled-profile 真实输出）
    renderAcademic(`## 今日新动态

**[新岗位] 阿里巴巴** · — 阿里资产部门招聘AI产品经理。
  [原文链接](https://example.com/e1)

## 与你最适配的岗位

本期暂无

## 高频考察问题

本期暂无

## 趋势解读

本期暂无`)
    const events = screen.getAllByTestId('job-briefing-event')
    expect(events).toHaveLength(1)
    expect(events[0]).toHaveTextContent('新岗位')
    expect(events[0]).toHaveTextContent('阿里巴巴')
    expect(events[0].querySelector('a')).toHaveAttribute('href', 'https://example.com/e1')
  })

  it('highlights origin with bracketed event type even without （今日新动态） suffix', () => {
    // 真实生成中 LLM 有时省略（今日新动态）后缀，但保留 [事件类型] 前缀
    renderAcademic(`## 今日新动态

本期暂无

## 与你最适配的岗位

### [★★★★☆] 百度 · AI大模型评估产品经理
- **城市**: 北京
- **源自**: [宣讲会] 百度 · 百度2022校园招聘宣讲活动
- **JD 要点**: 评估标准制定
- **为什么适合你**: 评测经验直接对应。
- **来源**: [投递链接](https://example.com/j1)

## 高频考察问题

本期暂无

## 趋势解读

本期暂无`)
    const origin = screen.getByTestId('job-card-origin')
    expect(origin).toHaveAttribute('data-today', 'true')
  })
})

describe('JobBriefingRenderer quote band and ornaments', () => {
  afterEach(cleanup)

  it('shows the quote band at top in academic theme', () => {
    renderAcademic()
    expect(screen.getByTestId('quote-text')).toBeInTheDocument()
  })

  it('hides the quote band in newspaper theme', () => {
    render(<JobBriefingRenderer content={CONTENT} theme="newspaper" fontSize="base" />)
    expect(screen.queryByTestId('quote-text')).not.toBeInTheDocument()
  })

  it('decorates academic section titles with an aria-hidden amber diamond', () => {
    renderAcademic()
    const heading = screen.getByRole('heading', { name: '今日新动态' })
    const ornament = heading.querySelector('span[aria-hidden="true"]')
    expect(ornament).not.toBeNull()
    expect(ornament!.textContent).toBe('◆')
  })
})
