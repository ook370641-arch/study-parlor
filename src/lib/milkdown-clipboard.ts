// 注意:本文件被渲染进程使用,禁止引入 node 内置模块(ipc-state §5)。
// 粘贴清洗核心:外部粘贴的 slice 统一去掉行内/块级代码与 textColor 颜色,
// 使粘贴进来的内容字体统一(设计:2026-08-11-writing-paste-and-formatting-design.md §A)。
import { Fragment, Slice, Node, Schema } from '@milkdown/prose/model'

export function cleanPastedSlice(slice: Slice, schema: Schema): Slice {
  return new Slice(cleanFragment(slice.content, schema), slice.openStart, slice.openEnd)
}

function cleanFragment(frag: Fragment, schema: Schema): Fragment {
  const out: Node[] = []
  frag.forEach(child => {
    if (child.type.name === 'code_block') {
      out.push(codeBlockToParagraph(child, schema))
    } else if (child.isText) {
      out.push(stripInlineMarks(child))
    } else {
      const cleaned = cleanFragment(child.content, schema)
      out.push(cleaned === child.content ? child : child.copy(cleaned))
    }
  })
  return Fragment.from(out)
}

function codeBlockToParagraph(node: Node, schema: Schema): Node {
  const lines = node.textContent.split('\n')
  const content: Node[] = []
  lines.forEach((line, i) => {
    if (i > 0) content.push(schema.nodes.hardbreak.create())
    if (line) content.push(schema.text(line))
  })
  return schema.nodes.paragraph.create(null, content)
}

function stripInlineMarks(node: Node): Node {
  // 注意:Milkdown v7 commonmark 的行内代码 mark 类型名为 inlineCode(而非 code),
  // 只按 schema 实际存在的 mark 名过滤。
  const kept = node.marks.filter(m => m.type.name !== 'inlineCode' && m.type.name !== 'textColor')
  return kept.length === node.marks.length ? node : node.mark(kept)
}
