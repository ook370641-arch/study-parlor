import { describe, it, expect } from 'vitest'
import { DEMO_NOTES, applyDemoNoteOverrides, readDemoNotePath } from '@/lib/demo-notes'
import type { DemoNote } from '@/lib/demo-notes'

const base = DEMO_NOTES['guide']

/** 真实文案里各分节的段落/列表/键值分布不一致，路径覆盖用合成样本更稳 */
const sample: DemoNote = {
  id: 'guide',
  title: '标题',
  thesis: '结论句',
  sections: [
    {
      heading: '小节一',
      paragraphs: ['段落零', '段落一'],
      bullets: ['列表零'],
      pairs: [{ key: '键零', value: '值零' }],
    },
    { heading: '小节二', paragraphs: ['段落二'] },
  ],
  qa: [{ q: '问题零', a: '回答零' }],
}

describe('applyDemoNoteOverrides', () => {
  it('无改写时原样返回同一引用', () => {
    expect(applyDemoNoteOverrides(base, undefined)).toBe(base)
    expect(applyDemoNoteOverrides(base, {})).toBe(base)
  })

  it('标题、结论句、分节标题、段落、列表、键值、问答逐字段覆盖', () => {
    const note = applyDemoNoteOverrides(sample, {
      title: '改过的标题',
      thesis: '改过的结论',
      's0.heading': '改过的小节',
      's0.p0': '改过的段落',
      's0.b0': '改过的列表项',
      's0.kv0.key': '改过的键',
      's0.kv0.value': '改过的值',
      'q0.q': '改过的问题',
      'q0.a': '改过的回答',
    })
    expect(note.title).toBe('改过的标题')
    expect(note.thesis).toBe('改过的结论')
    expect(note.sections[0].heading).toBe('改过的小节')
    expect(note.sections[0].paragraphs).toEqual(['改过的段落', '段落一'])
    expect(note.sections[0].bullets?.[0]).toBe('改过的列表项')
    expect(note.sections[0].pairs?.[0]).toEqual({ key: '改过的键', value: '改过的值' })
    expect(note.qa?.[0]).toEqual({ q: '改过的问题', a: '改过的回答' })
    expect(note.sections[1].paragraphs?.[0]).toBe('段落二')
  })

  it('空字符串视为改回默认，避免误删后留白', () => {
    const note = applyDemoNoteOverrides(sample, { thesis: '', 's0.heading': '   ' })
    expect(note.thesis).toBe(sample.thesis)
    expect(note.sections[0].heading).toBe(sample.sections[0].heading)
  })

  it('未知路径被忽略，不污染结构', () => {
    const note = applyDemoNoteOverrides(sample, { 's99.p0': 'X', nonsense: 'Y' })
    expect(note.sections.length).toBe(sample.sections.length)
    expect(note.sections[0].paragraphs?.[0]).toBe('段落零')
  })

  it('不修改原始常量（回退默认仍可用）', () => {
    applyDemoNoteOverrides(sample, { title: 'X', 's0.p0': 'Y' })
    expect(sample.title).toBe('标题')
    expect(sample.sections[0].paragraphs?.[0]).toBe('段落零')
  })
})

describe('readDemoNotePath', () => {
  it('能读回各类路径的当前文本', () => {
    const note = applyDemoNoteOverrides(sample, { title: 'T', 's0.b0': 'B', 'q0.a': 'A' })
    expect(readDemoNotePath(note, 'title')).toBe('T')
    expect(readDemoNotePath(note, 's0.b0')).toBe('B')
    expect(readDemoNotePath(note, 'q0.a')).toBe('A')
    expect(readDemoNotePath(note, 's0.p0')).toBe('段落零')
    expect(readDemoNotePath(note, 's0.kv0.key')).toBe('键零')
  })

  it('越界或非法路径返回 undefined', () => {
    expect(readDemoNotePath(sample, 's99.p0')).toBeUndefined()
    expect(readDemoNotePath(sample, 'nope')).toBeUndefined()
  })
})
