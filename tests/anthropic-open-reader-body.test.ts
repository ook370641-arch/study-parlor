import { describe, it, expect, vi, beforeEach } from 'vitest'

const patchState = vi.fn(async () => undefined)
vi.mock('@/lib/ipc', () => ({
  ipc: { patchState: (...args: unknown[]) => patchState(...args) },
}))

import { useStore } from '@/store'

const FILE = '/lib/Anthropic博客/a.md'
const OTHER = '/lib/Anthropic博客/b.md'

describe('openAnthropicReader 不清空已加载的同一篇正文', () => {
  beforeEach(() => {
    patchState.mockClear()
    useStore.setState({
      anthropicReaderFilePath: null,
      anthropicReaderBody: null,
      anthropicReaderTitle: null,
      lastAnthropicReaderFile: null,
      constitutionReportOpen: false,
      recommendViewBatch: null,
    } as any)
  })

  // 回归：reload 后「恢复上次阅读」effect 与列表点行会先后触发同一次 open。
  // 后到的 open 若把 body 置 null，AnthropicBlogPanel 的挂载条件
  // `readerFilePath && readerBody` 变 false，旁注面板与右侧 tab 直接消失，
  // 而 Reader 不会再读盘回填（effect 依赖未变）。
  it('同一篇且已有正文：保留正文与标题，仍更新最后阅读', async () => {
    useStore.setState({ anthropicReaderFilePath: FILE, anthropicReaderBody: '正文', anthropicReaderTitle: 'A' } as any)

    await useStore.getState().openAnthropicReader(FILE)

    const s = useStore.getState()
    expect(s.anthropicReaderBody).toBe('正文')
    expect(s.anthropicReaderTitle).toBe('A')
    expect(s.anthropicReaderFilePath).toBe(FILE)
    expect(s.lastAnthropicReaderFile).toBe(FILE)
  })

  it('换一篇：清空正文，等 Reader 重新读盘', async () => {
    useStore.setState({ anthropicReaderFilePath: FILE, anthropicReaderBody: '正文', anthropicReaderTitle: 'A' } as any)

    await useStore.getState().openAnthropicReader(OTHER)

    const s = useStore.getState()
    expect(s.anthropicReaderFilePath).toBe(OTHER)
    expect(s.anthropicReaderBody).toBeNull()
    expect(s.anthropicReaderTitle).toBeNull()
  })

  it('同一篇但正文尚未加载：保持 null，不误留旧内容', async () => {
    useStore.setState({ anthropicReaderFilePath: FILE, anthropicReaderBody: null, anthropicReaderTitle: null } as any)

    await useStore.getState().openAnthropicReader(FILE)

    expect(useStore.getState().anthropicReaderBody).toBeNull()
  })
})
