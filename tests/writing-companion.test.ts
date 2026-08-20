import { describe, expect, it, vi, beforeEach } from 'vitest'

// Mock ipc before importing store（照抄 writing-assistant-store.test.ts 模式）
vi.mock('@/lib/ipc', () => ({
  ipc: {
    patchState: vi.fn(),
    writingScanTree: vi.fn(),
    writingRead: vi.fn(),
    writingReadPreview: vi.fn(),
    writingWrite: vi.fn(),
    writingAssistantAbort: vi.fn(),
    articleAssistantReadSession: vi.fn(),
    getState: vi.fn(),
    scanLibrary: vi.fn(),
    loadSessions: vi.fn(),
    loadGroups: vi.fn(),
  }
}))

vi.mock('@/lib/paintings', () => ({
  manifest: [{ id: 'test', painter: 'Test', title: 'Test', url: '/test.jpg' }],
  pickRandom: vi.fn((manifest: unknown[]) => manifest[0] ?? null),
  preloadPaintings: vi.fn(),
}))

import { useStore } from '@/store'
import { ipc } from '@/lib/ipc'

const mdFile = (path: string, body = '', dirty = false) =>
  ({ path, body, kind: 'md' as const, dirty, saving: 'idle' as const })

describe('writing companion store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useStore.setState({
      writingFile: null,
      writingAssistant: null,
      writingAssistantSnapshotLit: false,
      writingError: null,
      toast: null,
    })
    // 新字段隔离重置仅在实现挂载后生效，保持「初始值」用例的 RED 真实性
    const s = useStore.getState() as any
    if ('writingPanelMode' in s) {
      useStore.setState({ writingPanelMode: 'assistant', writingCompanionMap: {}, companionFile: null } as any)
    }
    vi.mocked(ipc.patchState).mockResolvedValue(undefined)
    vi.mocked(ipc.writingWrite).mockResolvedValue({ ok: true, value: null })
    vi.mocked(ipc.articleAssistantReadSession).mockResolvedValue(null)
  })

  it('初始：panelMode=assistant，companionFile=null，companionMap={}', () => {
    const s = useStore.getState()
    expect(s.writingPanelMode).toBe('assistant')
    expect(s.companionFile).toBeNull()
    expect(s.writingCompanionMap).toEqual({})
  })

  it('setWritingPanelMode 切模式并 patchState 持久化', () => {
    useStore.getState().setWritingPanelMode('companion')
    expect(useStore.getState().writingPanelMode).toBe('companion')
    expect(ipc.patchState).toHaveBeenCalledWith({ writingPanelMode: 'companion' })

    useStore.getState().setWritingPanelMode('assistant')
    expect(useStore.getState().writingPanelMode).toBe('assistant')
    expect(ipc.patchState).toHaveBeenCalledWith({ writingPanelMode: 'assistant' })
  })

  it('selectCompanionFile：装载 md 并写入映射（patchState 含 writingCompanionMap）', async () => {
    useStore.setState({ writingFile: mdFile('writing/main.md', '# 主文') })
    vi.mocked(ipc.writingRead).mockResolvedValue({ ok: true, value: { frontmatter: {}, body: '# 对照文' } })

    await useStore.getState().selectCompanionFile('writing/comp.md')

    expect(ipc.writingRead).toHaveBeenCalledWith({ path: 'writing/comp.md' })
    const c = useStore.getState().companionFile
    expect(c).toMatchObject({ path: 'writing/comp.md', body: '# 对照文', kind: 'md', dirty: false, saving: 'idle' })
    expect(useStore.getState().writingCompanionMap).toEqual({ 'writing/main.md': 'writing/comp.md' })
    expect(ipc.patchState).toHaveBeenCalledWith({ writingCompanionMap: { 'writing/main.md': 'writing/comp.md' } })
  })

  it('selectCompanionFile：path 等于当前主文 → 拒绝，toast，状态不变', async () => {
    useStore.setState({ writingFile: mdFile('writing/main.md', '# 主文') })

    await useStore.getState().selectCompanionFile('writing/main.md')

    expect(useStore.getState().toast?.message).toBe('该文章已在主编辑区打开')
    expect(useStore.getState().companionFile).toBeNull()
    expect(useStore.getState().writingCompanionMap).toEqual({})
    expect(ipc.writingRead).not.toHaveBeenCalled()
    expect(ipc.patchState).not.toHaveBeenCalled()
  })

  it('selectCompanionFile：旧对照文 dirty → 先 saveCompanionFile 再切换', async () => {
    useStore.setState({
      writingFile: mdFile('writing/main.md'),
      companionFile: mdFile('writing/old.md', '旧改动', true),
      writingCompanionMap: { 'writing/main.md': 'writing/old.md' },
    })
    vi.mocked(ipc.writingRead).mockResolvedValue({ ok: true, value: { frontmatter: {}, body: '# 新对照' } })

    await useStore.getState().selectCompanionFile('writing/new.md')

    expect(ipc.writingWrite).toHaveBeenCalledWith({ path: 'writing/old.md', body: '旧改动' })
    const writeOrder = vi.mocked(ipc.writingWrite).mock.invocationCallOrder[0]
    const readOrder = vi.mocked(ipc.writingRead).mock.invocationCallOrder[0]
    expect(writeOrder).toBeLessThan(readOrder)
    expect(useStore.getState().companionFile).toMatchObject({ path: 'writing/new.md', body: '# 新对照', dirty: false })
    expect(useStore.getState().writingCompanionMap['writing/main.md']).toBe('writing/new.md')
  })

  it('非 md 对照文走 writingReadPreview 分支（kind=pdf）', async () => {
    useStore.setState({ writingFile: mdFile('writing/main.md') })
    vi.mocked(ipc.writingReadPreview).mockResolvedValue({
      ok: true,
      value: { kind: 'pdf', title: 'doc', content: 'PDF 文本', truncated: false },
    })

    await useStore.getState().selectCompanionFile('writing/doc.pdf')

    expect(ipc.writingReadPreview).toHaveBeenCalledWith({ path: 'writing/doc.pdf' })
    expect(ipc.writingRead).not.toHaveBeenCalled()
    expect(useStore.getState().companionFile).toMatchObject({
      path: 'writing/doc.pdf', kind: 'pdf', body: 'PDF 文本', truncated: false, dirty: false, saving: 'idle',
    })
  })

  it('读取失败 → 清映射 + toast + companionFile=null', async () => {
    useStore.setState({
      writingFile: mdFile('writing/main.md'),
      writingCompanionMap: { 'writing/main.md': 'writing/old.md' },
    })
    vi.mocked(ipc.writingRead).mockResolvedValue({ ok: false, code: 'WRITING_NOT_FOUND', message: '文件不存在' })

    await useStore.getState().selectCompanionFile('writing/gone.md')

    expect(useStore.getState().companionFile).toBeNull()
    expect(useStore.getState().writingCompanionMap).toEqual({})
    expect(ipc.patchState).toHaveBeenCalledWith({ writingCompanionMap: {} })
    expect(useStore.getState().toast).not.toBeNull()
  })

  it('selectWritingFile 切主文：对照文 dirty 先保存；有映射则恢复新主文的对照文', async () => {
    useStore.setState({
      writingPanelMode: 'companion',
      writingFile: mdFile('writing/a.md', '# A'),
      companionFile: mdFile('writing/comp-a.md', 'A 对照改动', true),
      writingCompanionMap: { 'writing/a.md': 'writing/comp-a.md', 'writing/b.md': 'writing/comp-b.md' },
    })
    vi.mocked(ipc.writingRead).mockImplementation(async ({ path }: any) => {
      if (path === 'writing/b.md') return { ok: true, value: { frontmatter: {}, body: '# B 主文' } } as any
      if (path === 'writing/comp-b.md') return { ok: true, value: { frontmatter: {}, body: '# B 对照' } } as any
      return { ok: false, code: 'WRITING_NOT_FOUND', message: 'x' } as any
    })

    await useStore.getState().selectWritingFile('writing/b.md')

    // 旧对照文 dirty 先存
    expect(ipc.writingWrite).toHaveBeenCalledWith({ path: 'writing/comp-a.md', body: 'A 对照改动' })
    const writeOrder = vi.mocked(ipc.writingWrite).mock.invocationCallOrder[0]
    const firstReadOrder = vi.mocked(ipc.writingRead).mock.invocationCallOrder[0]
    expect(writeOrder).toBeLessThan(firstReadOrder)
    // 主文切换 + 映射对照文恢复
    expect(useStore.getState().writingFile?.path).toBe('writing/b.md')
    expect(useStore.getState().companionFile).toMatchObject({ path: 'writing/comp-b.md', body: '# B 对照', dirty: false })
    // 助手会话仍绑定新主文（articlePath 机制不受影响）
    expect(ipc.articleAssistantReadSession).toHaveBeenCalledWith({ parentPath: 'writing/b.md', parentType: 'writing' })
  })

  it('selectWritingFile 切主文：映射值恰为旧主文时仍恢复（同文拒绝时序回归）', async () => {
    // E2E 暴露的时序 bug：A→B 映射，切到 B 再切回 A 时，旧主文正是映射值 B。
    // 若恢复对照文在主文 set 之前调用 selectCompanionFile，会被"同文拒绝"误拦。
    useStore.setState({
      writingPanelMode: 'companion',
      writingFile: mdFile('writing/b.md', '# B'),
      companionFile: null,
      writingCompanionMap: { 'writing/a.md': 'writing/b.md' },
    })
    vi.mocked(ipc.writingRead).mockImplementation(async ({ path }: any) => {
      if (path === 'writing/a.md') return { ok: true, value: { frontmatter: {}, body: '# A 主文' } } as any
      if (path === 'writing/b.md') return { ok: true, value: { frontmatter: {}, body: '# B 对照' } } as any
      return { ok: false, code: 'WRITING_NOT_FOUND', message: 'x' } as any
    })

    await useStore.getState().selectWritingFile('writing/a.md')

    expect(useStore.getState().writingFile?.path).toBe('writing/a.md')
    expect(useStore.getState().companionFile).toMatchObject({ path: 'writing/b.md', body: '# B 对照', dirty: false })
  })

  it('selectWritingFile 切主文：无映射 → companionFile 清空', async () => {
    useStore.setState({
      writingPanelMode: 'companion',
      writingFile: mdFile('writing/a.md', '# A'),
      companionFile: mdFile('writing/comp-a.md', '# A 对照'),
      writingCompanionMap: { 'writing/a.md': 'writing/comp-a.md' },
    })
    vi.mocked(ipc.writingRead).mockResolvedValue({ ok: true, value: { frontmatter: {}, body: '# C 主文' } })

    await useStore.getState().selectWritingFile('writing/c.md')

    expect(useStore.getState().writingFile?.path).toBe('writing/c.md')
    expect(useStore.getState().companionFile).toBeNull()
    // 映射表原样保留（旧主文的映射不清）
    expect(useStore.getState().writingCompanionMap).toEqual({ 'writing/a.md': 'writing/comp-a.md' })
  })

  it('closeCompanion：dirty 先存，清槽，panelMode 回 assistant，映射保留', async () => {
    useStore.setState({
      writingPanelMode: 'companion',
      writingFile: mdFile('writing/main.md'),
      companionFile: mdFile('writing/comp.md', '对照改动', true),
      writingCompanionMap: { 'writing/main.md': 'writing/comp.md' },
    })

    await useStore.getState().closeCompanion()

    expect(ipc.writingWrite).toHaveBeenCalledWith({ path: 'writing/comp.md', body: '对照改动' })
    expect(useStore.getState().companionFile).toBeNull()
    expect(useStore.getState().writingPanelMode).toBe('assistant')
    expect(ipc.patchState).toHaveBeenCalledWith({ writingPanelMode: 'assistant' })
    // 映射保留（v1 不做显式清除）
    expect(useStore.getState().writingCompanionMap).toEqual({ 'writing/main.md': 'writing/comp.md' })
  })

  it('saveAllDirtyWriting：主文+对照文中 dirty 者各存一次，clean 者不写', async () => {
    useStore.setState({
      writingFile: mdFile('writing/main.md', '主文改动', true),
      companionFile: mdFile('writing/comp.md', '对照改动', true),
    })

    await useStore.getState().saveAllDirtyWriting()

    expect(ipc.writingWrite).toHaveBeenCalledTimes(2)
    expect(ipc.writingWrite).toHaveBeenCalledWith({ path: 'writing/main.md', body: '主文改动' })
    expect(ipc.writingWrite).toHaveBeenCalledWith({ path: 'writing/comp.md', body: '对照改动' })

    // 两侧 clean 后不再写
    vi.mocked(ipc.writingWrite).mockClear()
    useStore.setState(s => ({
      writingFile: s.writingFile ? { ...s.writingFile, dirty: false } : null,
      companionFile: s.companionFile ? { ...s.companionFile, dirty: false } : null,
    }))
    await useStore.getState().saveAllDirtyWriting()
    expect(ipc.writingWrite).not.toHaveBeenCalled()

    // 仅对照文 dirty → 只存对照文
    useStore.setState(s => ({
      companionFile: s.companionFile ? { ...s.companionFile, dirty: true } : null,
    }))
    await useStore.getState().saveAllDirtyWriting()
    expect(ipc.writingWrite).toHaveBeenCalledTimes(1)
    expect(ipc.writingWrite).toHaveBeenCalledWith({ path: 'writing/comp.md', body: '对照改动' })
  })

  it('防竞态：连续两次 selectCompanionFile，过期结果被丢弃（companionSelectSeq）', async () => {
    useStore.setState({ writingFile: mdFile('writing/main.md') })
    let resolveFirst!: (v: any) => void
    vi.mocked(ipc.writingRead)
      .mockImplementationOnce(() => new Promise(res => {
        resolveFirst = () => res({ ok: true, value: { frontmatter: {}, body: '第一份（过期）' } })
      }))
      .mockResolvedValue({ ok: true, value: { frontmatter: {}, body: '第二份' } })

    const p1 = useStore.getState().selectCompanionFile('writing/one.md')
    await useStore.getState().selectCompanionFile('writing/two.md')
    resolveFirst()
    await p1

    expect(useStore.getState().companionFile).toMatchObject({ path: 'writing/two.md', body: '第二份' })
    expect(useStore.getState().writingCompanionMap).toEqual({ 'writing/main.md': 'writing/two.md' })
  })

  it('旧 state.json 无新字段 → 合并默认值不炸（ipc-state §3）', async () => {
    // 强制回到「字段不存在」状态：先前用例的 setState 会把新字段注入运行时 state，
    // 不重置为 undefined 的话本用例会因污染而假绿
    useStore.setState({ writingPanelMode: undefined, writingCompanionMap: undefined } as any)
    vi.mocked(ipc.getState).mockResolvedValue({
      version: 1,
      profile: { grade: ' undergrad', major: 'cs' },
      lastUsed: { difficulty: 'mid', temperature: 0.7 },
      groupInspirations: {},
      ui: { session_count: 0 },
      inspirationStrategy: 'v2',
      fableStyleTags: [],
      lastFableTags: [],
      topicContinueSuggestions: {},
      // truthy，避免 init 后台触发 refreshWildcardInspiration
      wildcardInspiration: { title: 'x', description: 'y' },
    } as any)
    vi.mocked(ipc.scanLibrary).mockResolvedValue([])
    vi.mocked(ipc.loadSessions).mockResolvedValue([])
    vi.mocked(ipc.loadGroups).mockResolvedValue({ groups: [], mapping: {} } as any)

    await useStore.getState().init()

    expect(useStore.getState().writingPanelMode).toBe('assistant')
    expect(useStore.getState().writingCompanionMap).toEqual({})
    expect(useStore.getState().companionFile).toBeNull()
  })
})
