import { describe, it, expect, vi, beforeEach } from 'vitest'

const annotationsRead = vi.fn()
const articleAssistantReadSession = vi.fn()
const writingCreateFile = vi.fn()
const writingWrite = vi.fn()
vi.mock('@/lib/ipc', () => ({
  ipc: {
    annotationsRead: (...args: unknown[]) => annotationsRead(...args),
    articleAssistantReadSession: (...args: unknown[]) => articleAssistantReadSession(...args),
    writingCreateFile: (...args: unknown[]) => writingCreateFile(...args),
    writingWrite: (...args: unknown[]) => writingWrite(...args),
  },
}))

import { useStore } from '@/store'

const FULL_TEXT = 'FULL ARTICLE BODY SHOULD NOT APPEAR'

beforeEach(() => {
  vi.clearAllMocks()
  useStore.setState({ showToast: vi.fn() } as any)
  writingCreateFile.mockResolvedValue({ ok: true, value: { path: '/lib/writing/x.md' } })
  writingWrite.mockResolvedValue({ ok: true })
})

describe('transferArticleToWriting', () => {
  it('writes structured annotations + chat sections without the full text', async () => {
    annotationsRead.mockResolvedValue([
      { id: 'a1', selectedText: '简单方案', note: '赞同', paragraphIndex: 2, createdAt: '2026-07-24', updatedAt: '2026-07-24' },
    ])
    articleAssistantReadSession.mockResolvedValue({
      filePath: '/x.assistant.md', createdAt: '', updatedAt: '',
      messages: [
        { role: 'user', content: '为什么不用多智能体？' },
        { role: 'assistant', content: '复杂度有成本。' },
      ],
    })
    await useStore.getState().transferArticleToWriting({
      name: 'Building Effective Agents', content: FULL_TEXT,
      sourceType: 'anthropic', sourcePath: '/lib/Anthropic博客/x.md',
    })
    const body = writingWrite.mock.calls[0][0].body as string
    expect(body).toContain('## 标注摘录')
    expect(body).toContain('「简单方案」（§2）')
    expect(body).toContain('批注：赞同')
    expect(body).toContain('## 旁注对话')
    expect(body).toContain('**用户**：为什么不用多智能体？')
    expect(body).not.toContain(FULL_TEXT)
  })

  it('degrades to （无） sections when reads fail', async () => {
    annotationsRead.mockRejectedValue(new Error('no file'))
    articleAssistantReadSession.mockRejectedValue(new Error('no file'))
    await useStore.getState().transferArticleToWriting({
      name: 'X', content: FULL_TEXT, sourceType: 'digest', sourcePath: '/lib/b.md',
    })
    const body = writingWrite.mock.calls[0][0].body as string
    expect(body).toContain('## 标注摘录\n\n（无）')
    expect(body).toContain('## 旁注对话\n\n（无）')
  })

  it('treats empty note as （无批注）', async () => {
    annotationsRead.mockResolvedValue([
      { id: 'a1', selectedText: '片段', note: '', paragraphIndex: 1, createdAt: '2026-07-24', updatedAt: '2026-07-24' },
    ])
    articleAssistantReadSession.mockResolvedValue(null)
    await useStore.getState().transferArticleToWriting({
      name: 'X', content: FULL_TEXT, sourceType: 'digest', sourcePath: '/lib/b.md',
    })
    const body = writingWrite.mock.calls[0][0].body as string
    expect(body).toContain('批注：（无批注）')
  })
})
