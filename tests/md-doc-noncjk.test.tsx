import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'

vi.mock('@/lib/ipc', () => ({
  ipc: { openExternal: vi.fn() },
}))

import { MarkdownRenderer } from '@/components/md/MarkdownRenderer'

function renderBriefing(content: string) {
  return render(<MarkdownRenderer content={content} fileName="article.md" briefingStyle="academic" hideHeader />)
}

describe('md-doc-noncjk（整篇英文文档标记）', () => {
  beforeEach(() => cleanup())

  it('English-only article body gets md-doc-noncjk on .md-body', () => {
    renderBriefing('## Introduction\n\nGood evaluations help teams ship AI agents.')
    const body = document.querySelector('.md-body')
    expect(body?.classList.contains('md-doc-noncjk')).toBe(true)
  })

  it('mixed/Chinese briefing body does NOT get md-doc-noncjk', () => {
    renderBriefing('## 核心概念\n\n英文原文：Good evaluations help teams.\n\n中文摘要段落。')
    const body = document.querySelector('.md-body')
    expect(body?.classList.contains('md-doc-noncjk')).toBe(false)
  })

  it('English paragraphs are still marked lang="en" regardless of doc-level class', () => {
    renderBriefing('Good evaluations help teams ship AI agents more confidently.')
    expect(document.querySelector('p[lang="en"]')).not.toBeNull()
  })
})
