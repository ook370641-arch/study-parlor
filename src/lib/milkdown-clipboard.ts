// 注意:本文件被渲染进程使用,禁止引入 node 内置模块(ipc-state §5)。
// 粘贴清洗核心:外部粘贴的 slice 统一去掉行内/块级代码与 textColor 颜色,
// 使粘贴进来的内容字体统一(设计:2026-08-11-writing-paste-and-formatting-design.md §A)。
import { Fragment, Slice, Node, Schema, DOMParser } from '@milkdown/prose/model'
import { $prose } from '@milkdown/utils'
import { parserCtx, schemaCtx, serializerCtx } from '@milkdown/core'
import { isTextOnlySlice } from '@milkdown/prose'
import { Plugin, PluginKey } from '@milkdown/prose/state'
import { sanitizeExternalHTML } from './milkdown-paste-plain'
import type { MilkdownPlugin, Ctx } from '@milkdown/ctx'
import type { EditorView } from '@milkdown/prose/view'

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

/** 判断 html 是否含「真实格式」标签;否则按纯文本 markdown 解析 */
const RICH_HTML_RE = /<(?:strong|b|em|i|a|ul|ol|table|blockquote|h[1-6]|img|pre)[\s>]/i

function isPureText(content: any): boolean {
  if (!content) return false
  if (Array.isArray(content)) {
    if (content.length > 1) return false
    return isPureText(content[0])
  }
  const child = content.content
  if (child) return isPureText(child)
  return content.type === 'text'
}

function dispatchPasteSlice(view: EditorView, slice: Slice): boolean {
  const node = isTextOnlySlice(slice)
  if (node) {
    view.dispatch(view.state.tr.replaceSelectionWith(node, true))
    return true
  }
  try {
    view.dispatch(view.state.tr.replaceSelection(slice))
    return true
  } catch {
    return false
  }
}

export const milkdownClipboardPlugins: MilkdownPlugin[] = [
  $prose((ctx: Ctx) => {
    const schema = ctx.get(schemaCtx)
    return new Plugin({
      key: new PluginKey('STUDY_PARLOR_CLIPBOARD'),
      props: {
        // 复制方向:编辑器内复制产出 markdown(与 Milkdown clipboard 一致)
        clipboardTextSerializer: (slice: any) => {
          const serializer = ctx.get(serializerCtx)
          if (isPureText(slice.content.toJSON())) return slice.content.textBetween(0, slice.content.size, '\n\n')
          const doc = schema.topNodeType.createAndFill(undefined, slice.content)
          if (!doc) return ''
          return serializer(doc)
        },
        handlePaste: (view: EditorView, event: any, _preProcessedSlice: any) => {
          const parser = ctx.get(parserCtx)
          const editable = view.props.editable?.(view.state) ?? true
          const clipboardData = event.clipboardData
          if (!editable || !clipboardData) return false
          if (view.state.selection.$from.node().type.spec.code) return false
          const text = clipboardData.getData('text/plain')
          const html = clipboardData.getData('text/html')
          // 内部复制(ProseMirror 标记)交还默认,完整保留颜色/代码/标题
          if (html.includes('data-pm-slice')) return false
          if (html.length === 0 && text.length === 0) return false
          let slice: Slice
          if (html.length > 0 && RICH_HTML_RE.test(html)) {
            const sanitized = sanitizeExternalHTML(html)
            const template = document.createElement('template')
            template.innerHTML = sanitized
            slice = DOMParser.fromSchema(schema).parseSlice(template.content as any)
          } else {
            const parsed = parser(text)
            if (!parsed || typeof parsed === 'string') return false
            // 注意:Milkdown parser 返回 Node(而非 Slice),需显式包成闭合 slice。
            slice = new Slice(parsed.content, 0, 0)
          }
          slice = cleanPastedSlice(slice, schema)
          return dispatchPasteSlice(view, slice)
        },
      },
    })
  }),
]
