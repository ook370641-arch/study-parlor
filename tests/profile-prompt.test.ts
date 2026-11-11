import { describe, expect, it } from 'vitest'
import { withProfilePrompt } from '@electron/lib/profile-prompt'
import type { Message, Profile } from '@shared/index'

const profile: Profile = { name: '夜读者', profile_text: '偏直觉理解', preferred_topics: ['心理', '数学'] }
const user: Message = { role: 'user', content: '生成导读' }

describe('withProfilePrompt', () => {
  it('没有 system 时前置卷宗且保持用户消息顺序', () => {
    const result = withProfilePrompt([user], profile)
    expect(result[0]).toEqual({ role: 'system', content: expect.stringContaining('夜读者') })
    expect(result[0].content).toContain('偏直觉理解')
    expect(result[0].content).toContain('心理 / 数学')
    expect(result[1]).toBe(user)
  })

  it('已有 system 时追加且不复制消息', () => {
    const system: Message = { role: 'system', content: '你是写作助手' }
    const result = withProfilePrompt([system, user], profile)
    expect(result).toHaveLength(2)
    expect(result[0].content).toBe('你是写作助手\n\n---\n\n# 学习者卷宗\n姓名:夜读者\n画像:偏直觉理解\n偏好领域:心理 / 数学')
    expect(system.content).toBe('你是写作助手')
  })

  it('空画像原样返回', () => {
    const messages = [user]
    expect(withProfilePrompt(messages, { name: '', profile_text: '', preferred_topics: [] })).toBe(messages)
  })
})
