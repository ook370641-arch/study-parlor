import { describe, it, expect } from 'vitest'
import { companionPickerTarget, type CompanionPickerState } from '@/lib/companion-picker'

// 资格矩阵基座：anthropic 栏目、对照 tab、右栏展开、主区有文章
const base: CompanionPickerState = {
  briefingSource: 'anthropic',
  articlePanelMode: { anthropic: 'companion', scout: 'guide', job: 'guide' },
  articleAssistantGuideCollapsed: false,
  anthropicReaderFilePath: '/lib/blog/a.md',
  scoutTab: 'articles',
  scoutReaderFilePath: '/lib/scout/b.md',
  jobResultFilePath: '/lib/job/2026-09-16.md',
}

describe('companionPickerTarget', () => {
  it('博客对照条件全满足 → anthropic', () => {
    expect(companionPickerTarget(base)).toBe('anthropic')
  })

  it('拾贝对照条件全满足 → scout', () => {
    expect(companionPickerTarget({
      ...base,
      briefingSource: 'scout',
      articlePanelMode: { ...base.articlePanelMode, scout: 'companion' },
    })).toBe('scout')
  })

  it('求职对照条件全满足 → job', () => {
    expect(companionPickerTarget({
      ...base,
      briefingSource: 'job-briefing',
      articlePanelMode: { ...base.articlePanelMode, job: 'companion' },
    })).toBe('job')
  })

  it('非栏目 source（digest/writing）→ null', () => {
    expect(companionPickerTarget({ ...base, briefingSource: 'digest' })).toBeNull()
    expect(companionPickerTarget({ ...base, briefingSource: 'writing' })).toBeNull()
  })

  it('当前栏目处于导读 tab → null', () => {
    expect(companionPickerTarget({
      ...base,
      articlePanelMode: { ...base.articlePanelMode, anthropic: 'guide' },
    })).toBeNull()
  })

  it('右栏折叠 → null', () => {
    expect(companionPickerTarget({ ...base, articleAssistantGuideCollapsed: true })).toBeNull()
  })

  it('主区无在读文章 → null', () => {
    expect(companionPickerTarget({ ...base, anthropicReaderFilePath: null })).toBeNull()
  })

  it('拾贝在 chat tab（即使有 readerFilePath）→ null', () => {
    expect(companionPickerTarget({
      ...base,
      briefingSource: 'scout',
      articlePanelMode: { ...base.articlePanelMode, scout: 'companion' },
      scoutTab: 'chat',
    })).toBeNull()
  })

  it('求职无结果 → null', () => {
    expect(companionPickerTarget({
      ...base,
      briefingSource: 'job-briefing',
      articlePanelMode: { ...base.articlePanelMode, job: 'companion' },
      jobResultFilePath: null,
    })).toBeNull()
  })
})
