import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, act, within } from '@testing-library/react'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    patchState: vi.fn().mockResolvedValue(undefined),
    writingOpenInSystem: vi.fn().mockResolvedValue({ ok: true, value: null }),
    writingWrite: vi.fn().mockResolvedValue({ ok: true, value: null }),
    writingRead: vi.fn(),
    writingReadPreview: vi.fn(),
  },
}))

// Milkdown 整体 mock（照抄 writing-editor.test.tsx），让真实 WritingEditor 可挂载
vi.mock('@milkdown/react', () => ({
  MilkdownProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Milkdown: () => <div data-testid="milkdown-root" />,
  useEditor: (_factory: unknown, _deps: unknown[]) => ({ loading: false, get: () => null }),
}))
vi.mock('@milkdown/core', () => ({ Editor: { make: () => ({ use() { return this }, config() { return this } }) }, rootCtx: 'rootCtx', defaultValueCtx: 'defaultValueCtx' }))
vi.mock('@milkdown/preset-commonmark', () => ({ commonmark: 'commonmark', codeBlockSchema: { extendSchema: () => 'extendedCodeBlockSchema' } }))
vi.mock('@milkdown/preset-gfm', () => ({ gfm: 'gfm' }))
vi.mock('@milkdown/plugin-listener', () => ({ listener: 'listener', listenerCtx: { markdownUpdated: vi.fn() } }))
vi.mock('@milkdown/plugin-history', () => ({ history: 'history' }))
vi.mock('@milkdown/plugin-clipboard', () => ({ clipboard: 'clipboard' }))

// 助手消息/输入与 markdown 渲染用轻量 stub（照抄 writing-assistant-panel.test.tsx 模式）
vi.mock('@/components/writing-assistant/WritingAssistantMessages', () => ({
  WritingAssistantMessages: () => <div data-testid="wa-messages" />,
}))
vi.mock('@/components/writing-assistant/WritingAssistantInput', () => ({
  WritingAssistantInput: () => <div data-testid="wa-input" />,
}))
vi.mock('@/components/md/MarkdownContent', () => ({
  MarkdownContent: ({ children }: { children?: React.ReactNode }) => <div data-testid="md-content">{children}</div>,
}))

import { useStore } from '@/store'
import { WritingAssistantPanel } from '@/components/writing-assistant/WritingAssistantPanel'
import { WritingEditor } from '@/components/writing/WritingEditor'

const mdCompanion = (path = '/lib/writing/companion.md', body = '对照正文') =>
  ({ path, body, kind: 'md' as const, dirty: false, saving: 'idle' as const })

describe('companion pane', () => {
  beforeEach(() => {
    cleanup()
    useStore.setState({
      writingAssistantOpen: true,
      writingAssistantWidth: 320,
      writingAssistant: null,
      writingPanelMode: 'assistant',
      writingCompanionMap: {},
      companionFile: null,
      writingFile: { path: '/lib/writing/main.md', body: '主文', kind: 'md', dirty: false, saving: 'idle' },
      writingEditorAction: null,
      toast: null,
    } as any)
  })

  it('默认渲染助手 tab 内容；点对照 tab → 切到对照模式', () => {
    render(<WritingAssistantPanel />)
    expect(screen.getByTestId('writing-panel-tab-assistant')).toBeInTheDocument()
    expect(screen.getByTestId('writing-panel-tab-companion')).toBeInTheDocument()
    expect(screen.getByTestId('wa-messages')).toBeInTheDocument()
    expect(screen.getByTestId('wa-input')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('writing-panel-tab-companion'))
    expect(useStore.getState().writingPanelMode).toBe('companion')
    expect(screen.queryByTestId('wa-messages')).not.toBeInTheDocument()
  })

  it('对照模式无 companionFile → 空态引导文案（companion-empty）', () => {
    useStore.setState({ writingPanelMode: 'companion' })
    render(<WritingAssistantPanel />)
    expect(screen.getByTestId('companion-empty')).toBeInTheDocument()
    expect(screen.getByText('点击左侧文件树中的一篇文章，在此展开对照')).toBeInTheDocument()
  })

  it('主区无文章（writingFile=null）→ 对照 tab 置灰 disabled', () => {
    useStore.setState({ writingFile: null })
    render(<WritingAssistantPanel />)
    expect(screen.getByTestId('writing-panel-tab-companion')).toBeDisabled()
    expect(screen.getByTestId('writing-panel-tab-assistant')).not.toBeDisabled()
  })

  it('对照模式有 md companionFile → 渲染编辑器宿主', () => {
    useStore.setState({ writingPanelMode: 'companion', companionFile: mdCompanion() })
    render(<WritingAssistantPanel />)
    expect(screen.getByTestId('companion-board')).toBeInTheDocument()
    expect(screen.getByTestId('milkdown-root')).toBeInTheDocument()
    // 头部信息行：文件名去 .md 后缀
    expect(screen.getByTestId('companion-filename')).toHaveTextContent('companion')
  })

  it('对照模式有非 md companionFile（pdf）→ 渲染 ReadonlyPreview', () => {
    useStore.setState({
      writingPanelMode: 'companion',
      companionFile: { path: '/lib/writing/ref.pdf', body: 'pdf 摘要', kind: 'pdf' as const, dirty: false, saving: 'idle' as const },
    })
    render(<WritingAssistantPanel />)
    expect(screen.getByTestId('companion-board')).toBeInTheDocument()
    expect(screen.getByTestId('writing-readonly-preview')).toBeInTheDocument()
    expect(screen.getByTestId('writing-preview-kind')).toHaveTextContent('PDF')
  })

  it('✕ → closeCompanion：回助手模式、清对照槽', async () => {
    useStore.setState({ writingPanelMode: 'companion', companionFile: mdCompanion() })
    render(<WritingAssistantPanel />)
    await act(async () => { fireEvent.click(screen.getByTestId('companion-close')) })
    expect(useStore.getState().writingPanelMode).toBe('assistant')
    expect(useStore.getState().companionFile).toBeNull()
  })

  it('对照编辑器挂载/卸载不触碰全局 toolbar action（registerToolbarAction=false）', () => {
    // 对照组：主编辑器（默认 prop）挂载即注册、卸载即清理
    const main = render(<WritingEditor initial="a" onChange={() => {}} />)
    const mainAction = useStore.getState().writingEditorAction
    expect(mainAction).not.toBeNull()

    // 对照编辑器挂载：不得覆盖主编辑器注册
    useStore.setState({ writingPanelMode: 'companion', companionFile: mdCompanion('/lib/writing/c.md') })
    const pane = render(<WritingAssistantPanel />)
    // within(container)：render 返回的查询默认绑 baseElement=document.body，会误中主编辑器
    expect(within(pane.container).getByTestId('milkdown-root')).toBeInTheDocument()
    expect(useStore.getState().writingEditorAction).toBe(mainAction)

    // 对照编辑器卸载：不得清掉主编辑器注册
    pane.unmount()
    expect(useStore.getState().writingEditorAction).toBe(mainAction)

    main.unmount()
    expect(useStore.getState().writingEditorAction).toBeNull()
  })
})
