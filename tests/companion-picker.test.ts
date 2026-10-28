import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createElement } from 'react'
import { render, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { useStore } from '@/store'
import { CompanionWritingPicker } from '@/components/article-assistant/CompanionWritingPicker'
import { companionPickerTarget, type CompanionPickerState } from '@/lib/companion-picker'
import type { NoteEntry } from '@shared/index'

// 资格矩阵基座：anthropic 栏目、对照 tab、右栏展开、主区有文章
const base: CompanionPickerState = {
  briefingSource: 'anthropic',
  articlePanelMode: { anthropic: 'companion' },
  articleAssistantGuideCollapsed: false,
  anthropicReaderFilePath: '/lib/blog/a.md',
}

describe('companionPickerTarget', () => {
  it('博客对照条件全满足 → anthropic', () => {
    expect(companionPickerTarget(base)).toBe('anthropic')
  })

  it('非栏目 source（writing）→ null', () => {
    expect(companionPickerTarget({ ...base, briefingSource: 'writing' })).toBeNull()
  })

  it('当前栏目处于导读 tab → null', () => {
    expect(companionPickerTarget({
      ...base,
      articlePanelMode: { anthropic: 'guide' },
    })).toBeNull()
  })

  it('博客对照 tab 激活即具备挑选资格（collapsed 不拒绝）', () => {
    expect(companionPickerTarget({
      briefingSource: 'anthropic',
      articlePanelMode: { anthropic: 'companion' },
      articleAssistantGuideCollapsed: true,
      anthropicReaderFilePath: 'foo.md',
    })).toBe('anthropic')
  })

  it('主区无在读文章 → null', () => {
    expect(companionPickerTarget({ ...base, anthropicReaderFilePath: null })).toBeNull()
  })

  it('书籍对照 tab 且有在读章节 → book', () => {
    expect(companionPickerTarget({
      briefingSource: 'book',
      articlePanelMode: { book: 'companion' },
      articleAssistantGuideCollapsed: false,
      anthropicReaderFilePath: null,
      activeBookChapterPath: '/lib/books/JTBD/chapters/01.md',
    })).toBe('book')
  })

  it('书籍导读 tab 或未打开章节 → null', () => {
    const state: CompanionPickerState = {
      briefingSource: 'book',
      articlePanelMode: { book: 'guide' },
      articleAssistantGuideCollapsed: false,
      anthropicReaderFilePath: null,
      activeBookChapterPath: '/lib/books/JTBD/chapters/01.md',
    }
    expect(companionPickerTarget(state)).toBeNull()
    expect(companionPickerTarget({
      ...state,
      articlePanelMode: { book: 'companion' },
      activeBookChapterPath: null,
    })).toBeNull()
    expect(companionPickerTarget({
      ...state,
      articlePanelMode: { book: 'companion' },
      activeBookChapterPath: undefined,
    })).toBeNull()
  })

  it('其他 source（writing）即便两栏都处于对照 tab → null', () => {
    expect(companionPickerTarget({
      briefingSource: 'writing',
      articlePanelMode: { anthropic: 'companion', book: 'companion' },
      articleAssistantGuideCollapsed: false,
      anthropicReaderFilePath: '/lib/blog/a.md',
      activeBookChapterPath: '/lib/books/JTBD/chapters/01.md',
    })).toBeNull()
  })

  it('书籍栏目缺少 articlePanelMode.book（旧字面量）→ null', () => {
    expect(companionPickerTarget({
      briefingSource: 'book',
      articlePanelMode: {},
      articleAssistantGuideCollapsed: false,
      anthropicReaderFilePath: null,
      activeBookChapterPath: '/lib/books/JTBD/chapters/01.md',
    })).toBeNull()
  })
})

// —— picker 组件：currentTarget 泛化（书籍章节也能新建笔记） ——
const bookNote: NoteEntry = {
  path: 'notes/JTBD-Foreword.md',
  meta: {
    title: 'Intercom on Jobs-to-be-Done · Foreword',
    url: '',
    source: 'book',
    book: 'Intercom on Jobs-to-be-Done',
    rating: 0,
    summary: '',
    highlight: '',
    collected_at: '2026-10-27',
  },
}

beforeEach(() => {
  cleanup()
  useStore.setState({
    notesList: [bookNote],
    notesCategory: 'all',
    notesSortBy: 'time',
    writingTree: null,
    loadNotes: vi.fn(),
    loadWritingTree: vi.fn(),
  } as any)
})

const renderPicker = (props: Record<string, unknown>) =>
  render(createElement(CompanionWritingPicker, { onPickFile: vi.fn(), ...props } as any))

describe('CompanionWritingPicker currentTarget', () => {
  it('noteExists=false → 出现「＋ 新建」，点击后 onCreateNote 的路径交给 onPickFile', async () => {
    const onPick = vi.fn()
    const onCreateNote = vi.fn().mockResolvedValue('notes/JTBD-Chapter2.md')
    const { getByTestId } = renderPicker({
      onPickFile: onPick,
      currentTarget: {
        key: '/lib/books/JTBD/chapters/02.md',
        label: 'Intercom on Jobs-to-be-Done · Chapter 2',
        noteExists: false,
      },
      onCreateNote,
    })
    fireEvent.click(getByTestId('picker-note-create'))
    await waitFor(() => {
      expect(onCreateNote).toHaveBeenCalledTimes(1)
      expect(onPick).toHaveBeenCalledWith('notes/JTBD-Chapter2.md')
    })
  })

  it('noteExists=true → 不出现新建按钮，且按书名+标题高亮对应笔记', () => {
    const { queryByTestId, getByTestId } = renderPicker({
      currentTarget: {
        key: '/lib/books/JTBD/chapters/01.md',
        label: 'Intercom on Jobs-to-be-Done · Foreword',
        noteExists: true,
      },
      onCreateNote: vi.fn(),
    })
    expect(queryByTestId('picker-note-create')).toBeNull()
    expect(getByTestId('picker-note-JTBD-Foreword').getAttribute('data-current')).toBe('true')
  })

  it('onCreateNote 返回 null → 不调 onPickFile', async () => {
    const onPick = vi.fn()
    const { getByTestId } = renderPicker({
      onPickFile: onPick,
      currentTarget: { key: '/lib/books/JTBD/chapters/02.md', label: 'JTBD · Ch2', noteExists: false },
      onCreateNote: vi.fn().mockResolvedValue(null),
    })
    fireEvent.click(getByTestId('picker-note-create'))
    await waitFor(() => expect(onPick).not.toHaveBeenCalled())
  })

  it('currentTarget=null → 用 emptyHint 提示且无新建按钮', () => {
    const { getByTestId, queryByTestId } = renderPicker({
      currentTarget: null,
      onCreateNote: vi.fn(),
      emptyHint: '先选择章节，才能为本章新建笔记',
    })
    expect(getByTestId('picker-hint').textContent).toContain('先选择章节')
    expect(queryByTestId('picker-note-create')).toBeNull()
  })

  it('旧 currentArticle prop 仍可用（向后兼容）', async () => {
    const onPick = vi.fn()
    const findOrCreateArticleNote = vi.fn().mockResolvedValue({ path: 'notes/new.md', created: true })
    useStore.setState({ findOrCreateArticleNote } as any)
    const { getByTestId } = renderPicker({
      onPickFile: onPick,
      currentArticle: { url: 'https://a.com/post', title: 'A 社新文' },
    })
    fireEvent.click(getByTestId('picker-note-create'))
    await waitFor(() => {
      expect(findOrCreateArticleNote).toHaveBeenCalledWith({ title: 'A 社新文', url: 'https://a.com/post' })
      expect(onPick).toHaveBeenCalledWith('notes/new.md')
    })
  })
})
