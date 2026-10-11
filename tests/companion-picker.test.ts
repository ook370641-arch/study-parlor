import { describe, it, expect } from 'vitest'
import { companionPickerTarget, type CompanionPickerState } from '@/lib/companion-picker'

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

  it('右栏折叠 → null', () => {
    expect(companionPickerTarget({ ...base, articleAssistantGuideCollapsed: true })).toBeNull()
  })

  it('主区无在读文章 → null', () => {
    expect(companionPickerTarget({ ...base, anthropicReaderFilePath: null })).toBeNull()
  })
})
