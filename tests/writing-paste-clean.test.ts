// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { Editor, rootCtx, defaultValueCtx, schemaCtx } from '@milkdown/core'
import { commonmark } from '@milkdown/preset-commonmark'
import { gfm } from '@milkdown/preset-gfm'
import { Slice, Fragment } from '@milkdown/prose/model'
import { textColorPlugins } from '@/lib/milkdown-text-color'
import { cleanPastedSlice } from '@/lib/milkdown-clipboard'

async function makeSchema() {
  const editor = await Editor.make()
    .use(commonmark).use(gfm).use(textColorPlugins)
    .config(ctx => { ctx.set(rootCtx, document.createElement('div')); ctx.set(defaultValueCtx, '') })
    .create()
  const schema = editor.action(ctx => ctx.get(schemaCtx))
  editor.destroy()
  return schema
}

describe('cleanPastedSlice', () => {
  it('code_block 转 paragraph，多行行间插 hardbreak', async () => {
    const schema = await makeSchema()
    const cb = schema.nodes.code_block.create(null, schema.text('数据需关联核心业务指标'))
    const slice = new Slice(Fragment.from(cb), 0, 0)
    const cleaned = cleanPastedSlice(slice, schema)
    const node = cleaned.content.firstChild!
    expect(node.type.name).toBe('paragraph')
    expect(node.textContent).toBe('数据需关联核心业务指标')
    expect(cleaned.content.childCount).toBe(1)
  })

  it('多行代码块 → 每行之间是 hardbreak，无空白行', async () => {
    const schema = await makeSchema()
    const cb = schema.nodes.code_block.create(null, schema.text('line1\nline2\nline3'))
    const cleaned = cleanPastedSlice(new Slice(Fragment.from(cb), 0, 0), schema)
    const node = cleaned.content.firstChild!
    expect(node.childCount).toBe(5) // text hardbreak text hardbreak text
    expect(node.child(1).type.name).toBe('hardbreak')
    expect(node.child(3).type.name).toBe('hardbreak')
  })

  it('去掉 code 与 textColor mark，保留 strong', async () => {
    const schema = await makeSchema()
    const strong = schema.marks.strong.create()
    const code = schema.marks.inlineCode.create()
    const color = schema.marks.textColor.create({ color: '#d97757' })
    const para = schema.nodes.paragraph.create(null, [
      schema.text('加粗', [strong]),
      schema.text('代码', [code]),
      schema.text('彩色', [color]),
    ])
    const cleaned = cleanPastedSlice(new Slice(Fragment.from(para), 0, 0), schema)
    const p = cleaned.content.firstChild!
    // ProseMirror 会把相邻且 mark 相同的文本节点合并(Fragment.fromArray sameMarkup),
    // 剥离后 '代码'+'彩色' 均无 mark → 合并为一个文本节点,故按「整段文本节点 mark」汇总断言。
    const textMarks = p.content.content
      .filter((n) => n.isText)
      .map((n) => n.marks.map((m) => m.type.name))
    expect(textMarks).toEqual([['strong'], []])
    expect(p.textContent).toBe('加粗代码彩色')
  })
})
