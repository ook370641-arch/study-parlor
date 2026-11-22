import { describe, expect, it } from 'vitest'
import { composeWholeBookNoteBody, splitWholeBookNoteBody } from '@/lib/whole-book-note'

describe('整书笔记正文', () => {
  it('AI 生成前的全部手动内容都是已有全书笔记', () => {
    expect(splitWholeBookNoteBody('我的整体理解')).toEqual({ aiBody: '', original: '我的整体理解' })
  })

  it('重新整理只提取原笔迹，不带入上一版 AI 正文', () => {
    expect(splitWholeBookNoteBody('旧 AI 正文\n\n---\n\n## 原笔迹\n\n已有全书笔记')).toEqual({
      aiBody: '旧 AI 正文',
      original: '已有全书笔记',
    })
  })

  it('AI 正文和原笔迹组合为同一文件，尚未生成时不制造空附录', () => {
    expect(composeWholeBookNoteBody('新 AI 正文', '已有全书笔记')).toBe('新 AI 正文\n\n---\n\n## 原笔迹\n\n已有全书笔记')
    expect(composeWholeBookNoteBody('', '手动输入')).toBe('手动输入')
  })

  it('AI 正文存在时，即使原笔迹为空也保留身份分隔标记', () => {
    expect(composeWholeBookNoteBody('AI 正文', '')).toBe('AI 正文\n\n---\n\n## 原笔迹\n\n')
  })
})
