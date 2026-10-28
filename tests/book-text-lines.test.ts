import { describe, it, expect } from 'vitest'
import {
  itemsToLines,
  linesToParagraphs,
  paragraphsToMarkdown,
  itemsToRows,
  rowsToBlocks,
  blocksToMarkdown,
  type TextRow,
} from '../electron/lib/book-parse'

// pdfjs item 的最小构造器：transform = [a,b,c,d,e,f]，e 是 x，f 是 y
const item = (str: string, x: number, y: number, width: number, height = 12) => ({
  str,
  transform: [1, 0, 0, height, x, y],
  width,
  height,
})

describe('itemsToLines', () => {
  it('间距小直接拼接、间距大补空格', () => {
    const items = [
      { str: 'target', transform: [1, 0, 0, 12, 100, 700], width: 36 },
      { str: 'audience.', transform: [1, 0, 0, 12, 140, 700], width: 50 },
      { str: 'Next', transform: [1, 0, 0, 12, 300, 700], width: 26 },
    ]
    // gap 分别 4（≤ 0.35×12≈4.2，CJK 式紧贴）与 110（> 阈值，补空格）
    expect(itemsToLines(items)).toEqual(['targetaudience. Next'])
  })

  it('双栏：同 y 的右栏项若落在另一栏起始列且间距够大，拆成两行', () => {
    // 左栏 x=50 起、右栏 x=400 起；上一行（y=620）首项也在 x=400 → 该 x 被认定为第二栏起点
    const items = [
      item('Header', 400, 620, 80),
      item('Left column text', 50, 600, 260), // 右边界 310，到右栏 400 的 gap = 90
      item('Right column', 400, 600, 120),
      item('More left', 50, 588, 100),
    ]
    expect(itemsToLines(items)).toEqual(['Header', 'Left column text', 'Right column', 'More left'])
  })

  it('无第二栏证据时不拆行：大间距只补空格', () => {
    // 所有行都从 x=50 起，x=400 不构成「另一栏」→ 单栏排版里的宽间距，补一个空格即可
    expect(itemsToLines([item('abc', 50, 700, 60), item('def', 400, 700, 30)])).toEqual(['abc def'])
  })

  it('bbox 重叠（负 gap）视为同一行，不拆栏', () => {
    // 粗体叠加 / 字距紧缩会让后一项回退；真实双栏的 gap 恒为正，负 gap 不是换列信号
    expect(itemsToLines([item('abc', 100, 700, 60), item('def', 150, 700, 30)])).toEqual(['abcdef'])
  })

  it('行序按 y 降序：输入乱序也先上后下', () => {
    const items = [
      item('bottom', 100, 500, 40),
      item('top', 100, 700, 20),
      item('middle', 100, 600, 40),
    ]
    expect(itemsToLines(items)).toEqual(['top', 'middle', 'bottom'])
  })

  it('上标/下标偏移不超过半字号时归入同一行', () => {
    const items = [
      item('E = mc', 100, 700, 50),
      item('2', 150, 703, 6, 7), // 上标：y 偏 3，行基准字号 12 → 3 ≤ 6，仍属同一行
    ]
    // 上标紧贴前文（gap = 0）→ 不补空格
    expect(itemsToLines(items)).toEqual(['E = mc2'])
  })

  it('空字符串与缺失 transform 的 item 被跳过', () => {
    const items = [
      { str: '', transform: [1, 0, 0, 12, 100, 700], width: 0 },
      { str: 'ghost' }, // 没有坐标
      item('kept', 100, 700, 20),
    ]
    expect(itemsToLines(items)).toEqual(['kept'])
  })

  it('items 为空返回空数组', () => {
    expect(itemsToLines([])).toEqual([])
  })
})

describe('linesToParagraphs', () => {
  it('连字符还原 + 完整折行合并成一整句（JTBD 真实文本）', () => {
    const lines = [
      'Our job statement for a 21-year-',
      'old who wants to get a good deal',
      'on a mattress might read: “When I',
      'am shopping for a mattress, give me',
      'one unit of work',
    ]
    const paras = linesToParagraphs(lines)
    expect(paras).toHaveLength(1)
    expect(paras[0]).toContain('21-year-old')
    expect(paras[0]).not.toContain('21-year- old')
    expect(paras[0]).toContain('might read: “When I am shopping')
  })

  it('词尾拆开的普通连字符也还原（augment- + ed）', () => {
    expect(linesToParagraphs(['The feature is augment-', 'ed by research.'])).toEqual([
      'The feature is augmented by research.',
    ])
  })

  it('下一行大写开头时保留连字符（复合词换行）', () => {
    expect(linesToParagraphs(['self-', 'Esteem matters.'])).toEqual(['self-Esteem matters.'])
  })

  it('页码孤行被丢弃', () => {
    expect(linesToParagraphs(['5', 'A real sentence.', '23'])).toEqual(['A real sentence.'])
  })

  it('中文两行直接拼接不加空格', () => {
    expect(linesToParagraphs(['用户真正想完成的任务', '往往藏在表面需求之下。'])).toEqual([
      '用户真正想完成的任务往往藏在表面需求之下。',
    ])
  })

  it('句末标点后不合并，拆成两段', () => {
    expect(linesToParagraphs(['First sentence.', 'Second sentence starts here'])).toEqual([
      'First sentence.',
      'Second sentence starts here',
    ])
  })

  it('问号/感叹号/中文句末标点同样阻断合并', () => {
    expect(linesToParagraphs(['Why?', 'Because.'])).toEqual(['Why?', 'Because.'])
    expect(linesToParagraphs(['真的吗？', '是的！'])).toEqual(['真的吗？', '是的！'])
  })

  it('空行是硬分段', () => {
    expect(linesToParagraphs(['alpha', '', 'beta'])).toEqual(['alpha', 'beta'])
  })

  it('列表标记行强制单独成段', () => {
    expect(linesToParagraphs(['Intro line', '• First item', '1. Second item'])).toEqual([
      'Intro line',
      '• First item',
      '1. Second item',
    ])
  })

  it('输出段落已 trim，纯空白段落被丢弃', () => {
    expect(linesToParagraphs(['   ', '  hello  ', '   '])).toEqual(['hello'])
  })

  it('空输入返回空数组', () => {
    expect(linesToParagraphs([])).toEqual([])
  })
})

describe('paragraphsToMarkdown', () => {
  it('段间空行连接、过滤空段', () => {
    expect(paragraphsToMarkdown(['A', '', 'B', 'C'])).toBe('A\n\nB\n\nC')
  })

  it('空数组返回空字符串', () => {
    expect(paragraphsToMarkdown([])).toBe('')
  })
})

// 直接构造视觉行：x0 默认 100、宽 500、字号 12
const row = (text: string, y: number, opts: { x0?: number; width?: number; h?: number } = {}): TextRow => ({
  text,
  y,
  h: opts.h ?? 12,
  x0: opts.x0 ?? 100,
  x1: (opts.x0 ?? 100) + (opts.width ?? 500),
})

describe('itemsToRows', () => {
  it('保留行高与左右边界', () => {
    const rows = itemsToRows([item('Hello', 100, 700, 60), item('world', 170, 700, 40)])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ text: 'Hello world', y: 700, h: 12, x0: 100, x1: 210 })
  })

  it('双栏拆行后各自带自己的 x 范围', () => {
    const rows = itemsToRows([
      item('Header', 400, 620, 80),
      item('Left column text', 50, 600, 260),
      item('Right column', 400, 600, 120),
    ])
    const right = rows.find((r) => r.text === 'Right column')!
    expect(right.x0).toBe(400)
    expect(right.x1).toBe(520)
  })
})

describe('rowsToBlocks（行距 / 字号 / 缩进判段）', () => {
  it('段间距 2 倍行距处断段', () => {
    const blocks = rowsToBlocks([
      row('Line one', 700),
      row('Line two', 680),
      row('New paragraph', 640),
      row('continues here', 620),
    ])
    expect(blocks.map((b) => b.text)).toEqual(['Line one Line two', 'New paragraph continues here'])
  })

  it('字号显著大于正文 → 标题层级', () => {
    const blocks = rowsToBlocks([
      row('Introduction', 700, { h: 24 }),
      row('body line one', 660),
      row('body line two', 640),
    ])
    expect(blocks[0]).toEqual({ kind: 'h2', text: 'Introduction' })
    expect(blocks[1].kind).toBe('p')
  })

  it('中等放大字号 → h3', () => {
    const blocks = rowsToBlocks([
      row('Section', 700, { h: 15 }),
      row('body one', 660),
      row('body two', 640),
    ])
    expect(blocks[0]).toEqual({ kind: 'h3', text: 'Section' })
  })

  it('首行缩进视为新段（无额外段间距也能断开）', () => {
    const blocks = rowsToBlocks([
      row('First paragraph line', 700),
      row('second line of it', 680),
      row('Indented new paragraph', 660, { x0: 124, width: 300 }),
    ])
    expect(blocks.map((b) => b.text)).toEqual(['First paragraph line second line of it', 'Indented new paragraph'])
  })

  it('页码与页眉页脚被丢弃', () => {
    const blocks = rowsToBlocks(
      [
        row('Book Title', 970, { width: 100 }),
        row('Body text here', 700),
        row('42', 30, { width: 10 }),
      ],
      { pageHeight: 1000 }
    )
    expect(blocks.map((b) => b.text)).toEqual(['Body text here'])
  })

  it('没有行距信号时退回标点判段，不会并成一段', () => {
    const blocks = rowsToBlocks([row('First sentence.', 700), row('Second sentence.', 700)])
    expect(blocks.map((b) => b.text)).toEqual(['First sentence.', 'Second sentence.'])
  })

  it('多行长标题续成同一个标题，不拆成两个', () => {
    const blocks = rowsToBlocks([
      row('Observe how people solve the problem now (i.e. what job they', 700, { h: 15 }),
      row('currently use)', 680, { h: 15 }),
      row('body text', 640),
      row('more body text', 620),
    ])
    expect(blocks[0]).toEqual({
      kind: 'h3',
      text: 'Observe how people solve the problem now (i.e. what job they currently use)',
    })
  })

  it('blocksToMarkdown 输出标题与空行分段', () => {
    expect(
      blocksToMarkdown([
        { kind: 'h2', text: 'Intro' },
        { kind: 'p', text: 'A' },
        { kind: 'h3', text: 'Detail' },
      ])
    ).toBe('## Intro\n\nA\n\n### Detail')
  })
})
