import { describe, it, expect } from 'vitest'
import { parseTocPage, calibrateOffset, sliceChapters, chapterSlug, parseNumberedChapterToc } from '../electron/lib/book-parse'

// JTBD 第 3 物理页的真实抽取文本（标题块 + 尾随页码块，pdfjs 双栏读取顺序）
const JTBD_TOC_PAGE = `2
Table of Contents
Foreword
Introduction
Focus on the job
Understanding your real competitors
More than mattresses: using Jobs-to-be-Done research for software
Getting customers to switch
Where one job stops and another starts
A worse product can do a better job
Abandoning personas: the story behind Job Stories
Designing features using Job Stories
Asking why the right way
Conclusion
3
4
5
10
13
19
23
28
32
36
40
44`

describe('parseTocPage', () => {
  it('解析"标题块 + 页码块"双栏布局（JTBD 真实 fixture）', () => {
    const toc = parseTocPage(JTBD_TOC_PAGE)
    expect(toc).not.toBeNull()
    expect(toc).toHaveLength(12)
    expect(toc![0]).toEqual({ title: 'Foreword', printedPage: 3 })
    expect(toc![11]).toEqual({ title: 'Conclusion', printedPage: 44 })
  })

  it('解析行内"标题 页码"布局', () => {
    const toc = parseTocPage('目录\n第一章 总则 1\n第二章 细则 15\n附录 30')
    expect(toc).toEqual([
      { title: '第一章 总则', printedPage: 1 },
      { title: '第二章 细则', printedPage: 15 },
      { title: '附录', printedPage: 30 },
    ])
  })

  it('解析行内"页码 标题"布局（页码列在左）', () => {
    const toc = parseTocPage('Table of Contents\n3 Foreword\n4 Introduction\n5 Focus on the job\n2')
    expect(toc).toEqual([
      { title: 'Foreword', printedPage: 3 },
      { title: 'Introduction', printedPage: 4 },
      { title: 'Focus on the job', printedPage: 5 },
    ])
  })

  it('非目录页返回 null', () => {
    expect(parseTocPage('It was a bright cold day in April')).toBeNull()
  })

  it('标题数与页码数不匹配时返回 null', () => {
    expect(parseTocPage('Table of Contents\nAlpha\nBeta\n1\n2\n3')).toBeNull()
  })
})

describe('calibrateOffset', () => {
  it('用首章标题定位物理页，算出偏移', () => {
    const toc = [{ title: 'Foreword', printedPage: 3 }]
    const pages = ['cover', 'legal', JTBD_TOC_PAGE, '3\nForeword\nAs one of the earliest architects']
    expect(calibrateOffset(toc, pages)).toBe(1) // 物理页 4 = 印刷页 3
  })

  it('找不到首章标题时返回 0', () => {
    expect(calibrateOffset([{ title: 'Nope', printedPage: 3 }], ['a', 'b'])).toBe(0)
  })
})

describe('sliceChapters', () => {
  it('按偏移切闭区间，末章到 totalPages', () => {
    const toc = [
      { title: 'A', printedPage: 3 },
      { title: 'B', printedPage: 10 },
    ]
    expect(sliceChapters(toc, 1, 51)).toEqual([
      { title: 'A', startPage: 4, endPage: 10 },
      { title: 'B', startPage: 11, endPage: 51 },
    ])
  })
})

describe('chapterSlug', () => {
  it('转小写、空白转连字符、去非法字符、保留中文', () => {
    expect(chapterSlug('Focus on the job')).toBe('focus-on-the-job')
    expect(chapterSlug('第一章: 总则/细则')).toBe('第一章-总则细则')
  })
})

describe('parseNumberedChapterToc', () => {
  it('无页码目录跨页时按章节标题定位正文', () => {
    const result = parseNumberedChapterToc([
      'Getting Real',
      'Table of Contents\nChapter 1: First\nChapter 2: Second',
      'Chapter 3: Third',
      '1: First\nbody one',
      '2: Second\nbody two',
      '3: Third\nbody three',
    ])

    expect(result).toEqual({
      offset: 0,
      slices: [
        { title: 'Chapter 1: First', startPage: 4, endPage: 4 },
        { title: 'Chapter 2: Second', startPage: 5, endPage: 5 },
        { title: 'Chapter 3: Third', startPage: 6, endPage: 6 },
      ],
    })
  })

  it('跨页点线目录只取顶层章节并校准印刷页偏移', () => {
    const result = parseNumberedChapterToc([
      'front matter',
      'Contents\n1 Bayes\'s Theorem 1\n1.1 Conditional probability . . . 1\n2 Computational Statistics 2',
      'Contents ii\n2.1 Distributions . . . 2\n3 Estimation . . . . . 3',
      '1 Bayes\'s Theorem\nbody one',
      '2 Computational Statistics\nbody two',
      '3 Estimation\nbody three',
    ])

    expect(result).toEqual({
      offset: 3,
      slices: [
        { title: '1 Bayes\'s Theorem', startPage: 4, endPage: 4 },
        { title: '2 Computational Statistics', startPage: 5, endPage: 5 },
        { title: '3 Estimation', startPage: 6, endPage: 6 },
      ],
    })
  })

  it('Chapter 加破折号的目录使用归一化标题校准', () => {
    const result = parseNumberedChapterToc([
      'front matter',
      'Contents\nChapter 1 – Introduction 1\nOrigins 1\nChapter 2 – Next Steps 2',
      'Chapter 1 – Introduction\nbody one',
      'Chapter 2 – Next Steps\nbody two',
    ])

    expect(result).toEqual({
      offset: 2,
      slices: [
        { title: 'Chapter 1 – Introduction', startPage: 3, endPage: 3 },
        { title: 'Chapter 2 – Next Steps', startPage: 4, endPage: 4 },
      ],
    })
  })
})
