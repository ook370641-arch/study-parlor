import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    patchState: vi.fn().mockResolvedValue(undefined),
    llmGroupInspiration: vi.fn().mockResolvedValue({ topic: 'fallback', hook: 'fallback' }),
  },
}))

import { useStore } from '@/store'
import { GroupRecCard } from '@/components/GroupRecCard'

beforeEach(() => {
  cleanup()
  const groupId = 'g1'
  useStore.setState({
    briefingTheme: 'academic',
    profile: { name: '测试', profile_text: '', preferred_topics: [] },
    groups: [{ id: groupId, name: '哲学', inspiration: '思考存在与认知', createdAt: Date.now(), color: '#8b5a2b' }],
    groupInspirations: { [groupId]: { topic: '先验与经验', hook: '知识从哪里来？' } },
    library: [],
  })
})

describe('GroupRecCard theme', () => {
  it('renders with dark card in academic mode', () => {
    render(
      <GroupRecCard group={useStore.getState().groups[0]} topics={[]} onClickTopic={() => {}} />
    )
    const card = screen.getByTestId('group-rec-card')
    expect(card.className).toContain('bg-ink')
  })

  it('renders with white card in newspaper mode', () => {
    useStore.setState({ briefingTheme: 'newspaper' })
    render(
      <GroupRecCard group={useStore.getState().groups[0]} topics={[]} onClickTopic={() => {}} />
    )
    const card = screen.getByTestId('group-rec-card')
    expect(card.className).toContain('bg-white')
  })

  it('renders recommendation topic and hook', () => {
    render(
      <GroupRecCard group={useStore.getState().groups[0]} topics={[]} onClickTopic={() => {}} />
    )
    expect(screen.getByTestId('group-rec-title')).toHaveTextContent('先验与经验')
  })
})
