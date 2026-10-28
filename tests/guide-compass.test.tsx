import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, screen } from '@testing-library/react'
import { GuideCompass } from '../src/components/article-assistant/GuideCompass'

afterEach(() => cleanup())

function root() {
  return screen.getByTestId('guide-compass')
}

describe('GuideCompass', () => {
  it('renders the planning layer and is aria-hidden', () => {
    render(<GuideCompass progress={{ stage: 'planning' }} theme="academic" />)
    expect(root()).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByTestId('guide-compass-planning')).toBeInTheDocument()
    expect(screen.queryByTestId('guide-compass-searching')).not.toBeInTheDocument()
    expect(screen.queryByTestId('guide-compass-writing')).not.toBeInTheDocument()
  })

  it('treats a null progress as planning', () => {
    render(<GuideCompass progress={null} theme="academic" />)
    expect(screen.getByTestId('guide-compass-planning')).toBeInTheDocument()
    expect(root().querySelector('svg')).toHaveAttribute('data-stage', 'planning')
  })

  it('draws one node per query and marks completed ones', () => {
    render(<GuideCompass progress={{ stage: 'searching', done: 2, total: 3 }} theme="academic" />)
    const nodes = screen.getAllByTestId('guide-compass-node')
    expect(nodes).toHaveLength(3)
    expect(nodes.filter((n) => n.getAttribute('data-done') === 'true')).toHaveLength(2)
    expect(nodes.filter((n) => n.getAttribute('data-done') === 'false')).toHaveLength(1)
    expect(screen.getByTestId('guide-compass-searching')).toBeInTheDocument()
  })

  it('caps rendered nodes at 8 and shows a +N overflow label', () => {
    render(<GuideCompass progress={{ stage: 'searching', done: 0, total: 20 }} theme="academic" />)
    expect(screen.getAllByTestId('guide-compass-node')).toHaveLength(8)
    expect(screen.getByText('+12')).toBeInTheDocument()
  })

  it('sizes hit rings by hit count and exposes the raw query', () => {
    render(
      <GuideCompass
        progress={{
          stage: 'searching',
          done: 2,
          total: 3,
          queries: ['zero', 'two', 'three'],
          hits: [0, 2, 3],
        }}
        theme="academic"
      />
    )
    const rings = screen.getAllByTestId('guide-compass-hit-ring')
    expect(rings.map((r) => r.getAttribute('r'))).toEqual(['4', '5.5', '7'])
    const nodes = screen.getAllByTestId('guide-compass-node')
    expect(nodes.map((n) => n.getAttribute('data-query'))).toEqual(['zero', 'two', 'three'])
  })

  it('falls back to r=5 when hits are unknown or negative', () => {
    render(
      <GuideCompass
        progress={{ stage: 'searching', done: 1, total: 2, hits: [1, -1] }}
        theme="newspaper"
      />
    )
    const rings = screen.getAllByTestId('guide-compass-hit-ring')
    expect(rings.map((r) => r.getAttribute('r'))).toEqual(['5.5', '5'])
  })

  it('draws one cell per entry and lights completed ones', () => {
    render(
      <GuideCompass
        progress={{ stage: 'writing', chars: 100, entriesDone: 3, entriesTotal: 5 }}
        theme="academic"
      />
    )
    const cells = screen.getAllByTestId('guide-compass-cell')
    expect(cells).toHaveLength(5)
    expect(cells.filter((c) => c.getAttribute('data-lit') === 'true')).toHaveLength(3)
    expect(screen.getByTestId('guide-compass-writing')).toBeInTheDocument()
  })

  it('caps rendered writing cells at 12', () => {
    render(
      <GuideCompass
        progress={{ stage: 'writing', chars: 0, entriesDone: 0, entriesTotal: 30 }}
        theme="academic"
      />
    )
    expect(screen.getAllByTestId('guide-compass-cell')).toHaveLength(12)
  })

  it('默认保持 84px 高度与固定 viewBox', () => {
    render(<GuideCompass progress={{ stage: 'planning' }} theme="newspaper" />)
    expect(root().style.height).toBe('84px')
    expect(root().querySelector('svg')).toHaveAttribute('viewBox', '0 0 200 200')
  })

  it('height 可覆盖（加载态放大动画）', () => {
    render(<GuideCompass progress={{ stage: 'planning' }} theme="academic" height={220} />)
    expect(root().style.height).toBe('220px')
  })

  it('按阶段平移构图，使实际绘制内容落在视口正中', () => {
    // 侧栏是窄栏，文档只占左半边时会被看成「动画贴在左边」——每阶段各自居中
    const { rerender } = render(<GuideCompass progress={{ stage: 'planning' }} theme="academic" />)
    expect(screen.getByTestId('guide-compass-planning')).toHaveAttribute('transform', 'translate(31 0)')

    rerender(<GuideCompass progress={{ stage: 'searching', done: 1, total: 3 }} theme="academic" />)
    expect(screen.getByTestId('guide-compass-searching')).toHaveAttribute('transform', 'translate(-15 -15.5)')

    rerender(<GuideCompass progress={{ stage: 'writing', chars: 10, entriesDone: 1, entriesTotal: 3 }} theme="academic" />)
    expect(screen.getByTestId('guide-compass-writing')).toHaveAttribute('transform', 'translate(31 0)')
  })
})
