// 注意:本文件被渲染进程使用,禁止引入 node 内置模块(ipc-state §5)。
import { $markSchema, $command, $remark } from '@milkdown/utils'
import type { MilkdownPlugin } from '@milkdown/ctx'

export const TEXT_COLOR_PALETTE = [
  { label: '默认', value: null },
  { label: '暖橙', value: '#d97757' },
  { label: '赤红', value: '#b34747' },
  { label: '墨灰', value: '#9c9490' },
  { label: '黑', value: '#1a1a1a' },
] as const satisfies readonly { label: string; value: string | null }[]

const SPAN_OPEN_RE = /^<span\s+style="color:\s*(#[0-9a-fA-F]{3,8})"\s*>$/
const SPAN_CLOSE_RE = /^<\/span\s*>$/

/** 把 mdast 中「<span style="color:X"> … </span>」html 序列改写为 textColor 节点(原地修改 tree)。 */
export function transformSpanHtmlToTextColor(tree: { children?: any[] }): void {
  if (!tree.children) return
  const out: any[] = []
  const kids = tree.children
  for (let i = 0; i < kids.length; i++) {
    const node = kids[i]
    if (node.children) transformSpanHtmlToTextColor(node)
    const m = node.type === 'html' ? SPAN_OPEN_RE.exec(node.value ?? '') : null
    if (m) {
      // 找配对闭合(不支持嵌套 span;遇到下一个开标签或父级末尾视为不闭合,放弃转换)
      let closeIdx = -1
      for (let j = i + 1; j < kids.length; j++) {
        if (kids[j].type === 'html' && SPAN_OPEN_RE.test(kids[j].value ?? '')) break
        if (kids[j].type === 'html' && SPAN_CLOSE_RE.test(kids[j].value ?? '')) { closeIdx = j; break }
      }
      if (closeIdx !== -1) {
        const inner = kids.slice(i + 1, closeIdx)
        const holder = { children: inner }
        transformSpanHtmlToTextColor(holder)
        out.push({ type: 'textColor', data: { color: m[1] }, children: holder.children })
        i = closeIdx
        continue
      }
    }
    out.push(node)
  }
  tree.children = out
}

/** mdast-util-to-markdown 扩展:textColor 节点输出 raw span HTML。 */
export const textColorToMarkdownExtension = {
  handlers: {
    textColor(node: any, _parent: any, state: any, info: any): string {
      const color = node.data?.color ?? ''
      const inner = state.containerPhrasing(node, info)
      return `<span style="color:${color}">${inner}</span>`
    },
  },
}

/** unified 插件:注册 stringify handler + 解析方向 tree 转换。 */
function remarkTextColor(this: any) {
  const data = this.data()
  const list = (data.toMarkdownExtensions ??= [])
  list.push(textColorToMarkdownExtension)
  return (tree: any) => { transformSpanHtmlToTextColor(tree) }
}

export const remarkTextColorPlugin = $remark('remarkTextColor', () => remarkTextColor)

export const textColorSchema = $markSchema('textColor', () => ({
  attrs: { color: { default: '' } },
  inclusive: true,
  parseDOM: [{
    tag: 'span[style*="color"]',
    getAttrs: (dom) => ({ color: (dom as HTMLElement).style.color || '' }),
  }],
  toDOM: (mark) => ['span', { style: `color: ${mark.attrs.color}` }, 0],
  parseMarkdown: {
    match: (node) => node.type === 'textColor',
    runner: (state, node, markType) => {
      const color = (node as any).data?.color ?? ''
      state.openMark(markType, { color })
      state.next((node as any).children ?? [])
      state.closeMark(markType)
    },
  },
  toMarkdown: {
    match: (mark) => mark.type.name === 'textColor',
    runner: (state, mark) => {
      state.withMark(mark, 'textColor', undefined, { data: { color: mark.attrs.color } })
    },
  },
}))

export const textColorCommand = $command('textColor', (ctx) => (payload?: { color: string | null }) => (state, dispatch) => {
  const markType = textColorSchema.type(ctx)
  const { from, to, empty } = state.selection
  if (payload == null || payload.color === null) {
    if (!dispatch) return true
    if (empty) dispatch(state.tr.removeStoredMark(markType))
    else dispatch(state.tr.removeMark(from, to, markType))
    return true
  }
  const mark = markType.create({ color: payload.color })
  if (!dispatch) return true
  if (empty) {
    dispatch(state.tr.addStoredMark(mark))
  } else {
    dispatch(state.tr.removeMark(from, to, markType).addMark(from, to, mark).scrollIntoView())
  }
  return true
})

export const textColorPlugins: MilkdownPlugin[] = [remarkTextColorPlugin, textColorSchema, textColorCommand].flat()
