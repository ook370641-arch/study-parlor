import { describe, expect, it, vi, beforeEach } from 'vitest'

// Mock ipc before importing store
vi.mock('@/lib/ipc', () => ({
  ipc: {
    patchState: vi.fn(),
    writingScanTree: vi.fn(),
    writingRead: vi.fn(),
    writingWrite: vi.fn(),
    articleAssistantReadSession: vi.fn(),
  }
}))

vi.mock('@/lib/paintings', () => ({
  manifest: [{ id: 'test', painter: 'Test', title: 'Test', url: '/test.jpg' }],
  pickRandom: vi.fn((manifest: unknown[]) => manifest[0] ?? null)
}))

import { useStore } from '@/store'
import { ipc } from '@/lib/ipc'

describe('writing store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useStore.setState({ writingTree: null, writingFile: null, writingError: null, writingOrder: {}, writingExpandedGroups: {}, htmlDeleteFlush: null })
  })

  describe('loadWritingTree', () => {
    it('填充树数据', async () => {
      vi.mocked(ipc.writingScanTree).mockResolvedValue({
        ok: true,
        value: { writing: [{ name: 'a.md', path: 'writing/a.md', kind: 'file' as const }], repository: [] }
      })

      await useStore.getState().loadWritingTree()

      expect(useStore.getState().writingTree!.writing).toHaveLength(1)
      expect(useStore.getState().writingTree!.writing[0].name).toBe('a.md')
    })

    it('失败时设置 writingError', async () => {
      vi.mocked(ipc.writingScanTree).mockResolvedValue({
        ok: false,
        code: 'WRITING_IO_ERROR' as const,
        message: 'IO 错误'
      })

      await useStore.getState().loadWritingTree()

      expect(useStore.getState().writingTree).toBeNull()
      expect(useStore.getState().writingError).toBe('IO 错误')
    })
  })

  describe('selectWritingFile', () => {
    it('读取文件内容并记录 lastWritingFile', async () => {
      vi.mocked(ipc.writingRead).mockResolvedValue({
        ok: true,
        value: { frontmatter: { title: 'a', type: 'writing' }, body: '# a\n' }
      })

      await useStore.getState().selectWritingFile('writing/a.md')

      expect(useStore.getState().writingFile!.body).toBe('# a\n')
      expect(useStore.getState().writingFile!.path).toBe('writing/a.md')
      expect(useStore.getState().writingFile!.dirty).toBe(false)
      expect(useStore.getState().writingFile!.saving).toBe('idle')
      expect(useStore.getState().lastWritingFile).toBe('writing/a.md')
    })

    it('传入 null 时清空 writingFile', async () => {
      useStore.setState({
        writingFile: { path: 'writing/a.md', body: '# a\n', dirty: false, saving: 'idle' }
      })

      await useStore.getState().selectWritingFile(null)

      expect(useStore.getState().writingFile).toBeNull()
    })

    it('切换前如果 dirty 则自动保存', async () => {
      vi.mocked(ipc.writingWrite).mockResolvedValue({ ok: true, value: null })
      vi.mocked(ipc.writingRead).mockResolvedValue({
        ok: true,
        value: { frontmatter: { title: 'b' }, body: '# b\n' }
      })

      useStore.setState({
        writingFile: { path: 'writing/a.md', body: '# old\n', dirty: true, saving: 'idle' }
      })

      await useStore.getState().selectWritingFile('writing/b.md')

      expect(ipc.writingWrite).toHaveBeenCalledWith({ path: 'writing/a.md', body: '# old\n' })
      expect(useStore.getState().writingFile!.body).toBe('# b\n')
    })

    it('读取失败时设置 writingError', async () => {
      vi.mocked(ipc.writingRead).mockResolvedValue({
        ok: false,
        code: 'WRITING_NOT_FOUND' as const,
        message: '文件不存在'
      })

      await useStore.getState().selectWritingFile('writing/missing.md')

      expect(useStore.getState().writingFile).toBeNull()
      expect(useStore.getState().writingError).toBe('文件不存在')
    })
  })

  describe('selectWritingFile × htmlDeleteFlush', () => {
    it('切换前调用已注册的 flush；flush 失败则中止切换', async () => {
      vi.mocked(ipc.writingRead).mockResolvedValue({
        ok: true,
        value: { frontmatter: { title: 'a', type: 'writing' }, body: '# a\n' }
      })

      const flushFail = vi.fn().mockResolvedValue(false)
      useStore.setState({ htmlDeleteFlush: flushFail })
      await useStore.getState().selectWritingFile('writing/a.md')
      expect(flushFail).toHaveBeenCalledTimes(1)
      expect(useStore.getState().writingFile).toBeNull() // 中止：未读取新文件

      const flushOk = vi.fn().mockResolvedValue(true)
      useStore.setState({ htmlDeleteFlush: flushOk })
      await useStore.getState().selectWritingFile('writing/a.md')
      expect(flushOk).toHaveBeenCalledTimes(1)
      expect(useStore.getState().writingFile?.path).toBe('writing/a.md')
    })

    it('未注册 flush 时正常切换', async () => {
      vi.mocked(ipc.writingRead).mockResolvedValue({
        ok: true,
        value: { frontmatter: { title: 'a', type: 'writing' }, body: '# a\n' }
      })
      await useStore.getState().selectWritingFile('writing/a.md')
      expect(useStore.getState().writingFile?.path).toBe('writing/a.md')
    })
  })

  describe('updateWritingBody', () => {
    it('更新 body 并标记 dirty', () => {
      useStore.setState({
        writingFile: { path: 'writing/a.md', body: '# a\n', dirty: false, saving: 'idle' }
      })

      useStore.getState().updateWritingBody('# 新内容')

      expect(useStore.getState().writingFile!.dirty).toBe(true)
      expect(useStore.getState().writingFile!.body).toBe('# 新内容')
    })

    it('writingFile 为 null 时是 no-op', () => {
      useStore.getState().updateWritingBody('# 新内容')
      expect(useStore.getState().writingFile).toBeNull()
    })
  })

  describe('saveWritingFile', () => {
    it('保存成功后标记 saved', async () => {
      vi.mocked(ipc.writingWrite).mockResolvedValue({ ok: true, value: null })

      useStore.setState({
        writingFile: { path: 'writing/a.md', body: '# 新内容', dirty: true, saving: 'idle' }
      })

      await useStore.getState().saveWritingFile()

      expect(ipc.writingWrite).toHaveBeenCalledWith({ path: 'writing/a.md', body: '# 新内容' })
      expect(useStore.getState().writingFile!.dirty).toBe(false)
      expect(useStore.getState().writingFile!.saving).toBe('saved')
    })

    it('保存失败时标记 error', async () => {
      vi.mocked(ipc.writingWrite).mockResolvedValue({
        ok: false,
        code: 'WRITING_IO_ERROR' as const,
        message: 'IO 错误'
      })

      useStore.setState({
        writingFile: { path: 'writing/a.md', body: '# x', dirty: true, saving: 'idle' }
      })

      await useStore.getState().saveWritingFile()

      expect(useStore.getState().writingFile!.dirty).toBe(true)
      expect(useStore.getState().writingFile!.saving).toBe('error')
    })

    it('不脏时跳过保存', async () => {
      useStore.setState({
        writingFile: { path: 'writing/a.md', body: '# a\n', dirty: false, saving: 'idle' }
      })

      await useStore.getState().saveWritingFile()

      expect(ipc.writingWrite).not.toHaveBeenCalled()
    })

    it('writingFile 为 null 时跳过', async () => {
      await useStore.getState().saveWritingFile()

      expect(ipc.writingWrite).not.toHaveBeenCalled()
    })
  })

  describe('setWritingListTab', () => {
    it('持久化 tab 偏好', () => {
      useStore.getState().setWritingListTab('repository')
      expect(useStore.getState().writingListTab).toBe('repository')
      expect(ipc.patchState).toHaveBeenCalledWith({ writingListTab: 'repository' })
    })
  })

  describe('setWritingGroupExpanded', () => {
    it('写入 store 并 debounce 持久化', () => {
      vi.useFakeTimers()
      useStore.getState().setWritingGroupExpanded('repository/2023', true)
      expect(useStore.getState().writingExpandedGroups['repository/2023']).toBe(true)
      vi.advanceTimersByTime(300)
      expect(ipc.patchState).toHaveBeenCalledWith({ writingExpandedGroups: { 'repository/2023': true } })
      vi.useRealTimers()
    })
  })

  describe('appendWritingOrder', () => {
    it('新路径追加到容器末尾（当前全部子节点写回 + 新路径）', () => {
      useStore.setState({
        writingTree: {
          writing: [{ name: '随笔', path: 'writing/随笔', kind: 'dir' as const, children: [
            { name: 'a.md', path: 'writing/随笔/a.md', kind: 'file' as const },
          ] }],
          repository: [],
        },
        writingOrder: { 'writing/随笔': ['writing/随笔/a.md'] },
      })
      useStore.getState().appendWritingOrder('writing/随笔', 'writing/随笔/new.md')
      expect(useStore.getState().writingOrder['writing/随笔']).toEqual(['writing/随笔/a.md', 'writing/随笔/new.md'])
      expect(ipc.patchState).toHaveBeenCalledWith({ writingOrder: { 'writing/随笔': ['writing/随笔/a.md', 'writing/随笔/new.md'] } })
    })
  })

  describe('writingRenamed', () => {
    it('同步改写 writingExpandedGroups 的前缀', () => {
      useStore.setState({
        writingOrder: { 'writing/随笔': ['writing/随笔/a.md'] },
        writingExpandedGroups: { 'writing/随笔': true, 'writing/随笔/子': false },
      })
      useStore.getState().writingRenamed('writing/随笔', 'writing/散文')
      expect(useStore.getState().writingExpandedGroups).toEqual({ 'writing/散文': true, 'writing/散文/子': false })
    })
  })
})
