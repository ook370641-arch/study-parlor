// 注意:本文件被渲染进程使用,禁止引入 node 内置模块(ipc-state §5)。
// 代码块 NodeView 外壳(设计 2026-08-23 §2,模式照抄 milkdown-orbit-hr.ts):
// dom = 面板(header + pre>code contentDOM + 折叠展开条);
// header/expand 的 mousedown 由 stopEvent 拦下(不进 PM 选区逻辑),
// contentDOM 内事件全部放行,保证代码区可编辑。
import { $prose } from '@milkdown/utils'
import { Plugin, PluginKey } from '@milkdown/prose/state'
import type { MilkdownPlugin } from '@milkdown/ctx'
import type { Node as PMNode } from '@milkdown/prose/model'
import type { EditorView } from '@milkdown/prose/view'

function langLabel(node: PMNode): string {
  return (node.attrs.language as string) || '文本'
}

const codeblockView = $prose(() =>
  new Plugin({
    key: new PluginKey('STUDY_PARLOR_CODEBLOCK_VIEW'),
    props: {
      nodeViews: {
        code_block: (node: PMNode, view: EditorView, getPos: () => number | undefined) => {
          const dom = document.createElement('div')
          dom.className = 'writing-codeblock'
          dom.dataset.testid = 'writing-codeblock'

          const header = document.createElement('div')
          header.className = 'writing-codeblock-header'
          header.contentEditable = 'false'

          const toggle = document.createElement('button')
          toggle.type = 'button'
          toggle.dataset.testid = 'writing-codeblock-toggle'
          toggle.className = 'writing-codeblock-toggle'
          toggle.title = '折叠/展开代码块'

          const lang = document.createElement('span')
          lang.dataset.testid = 'writing-codeblock-lang'
          lang.className = 'writing-codeblock-lang'
          header.append(toggle, lang)

          const body = document.createElement('pre')
          body.className = 'writing-codeblock-body'
          const code = document.createElement('code')
          body.appendChild(code)

          const expand = document.createElement('button')
          expand.type = 'button'
          expand.dataset.testid = 'writing-codeblock-expand'
          expand.className = 'writing-codeblock-expand'
          expand.textContent = '⌄ 展开'
          expand.contentEditable = 'false'

          dom.append(header, body, expand)

          const render = (n: PMNode) => {
            const collapsed = n.attrs.collapsed === true
            dom.dataset.collapsed = collapsed ? 'true' : 'false'
            toggle.textContent = collapsed ? '▸' : '▾'
            toggle.setAttribute('aria-expanded', String(!collapsed))
            lang.textContent = langLabel(n)
            expand.style.display = collapsed ? '' : 'none'
          }
          render(node)

          const setCollapsed = (collapsed: boolean) => {
            const pos = typeof getPos === 'function' ? getPos() : undefined
            if (typeof pos !== 'number') return
            const cur = view.state.doc.nodeAt(pos)
            if (!cur || cur.type.name !== 'code_block') return
            view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...cur.attrs, collapsed }))
            view.focus()
          }
          toggle.addEventListener('mousedown', (e) => {
            e.preventDefault()
            const pos = typeof getPos === 'function' ? getPos() : undefined
            if (typeof pos !== 'number') return
            const cur = view.state.doc.nodeAt(pos)
            if (!cur) return
            setCollapsed(cur.attrs.collapsed !== true)
          })
          expand.addEventListener('mousedown', (e) => { e.preventDefault(); setCollapsed(false) })

          return {
            dom,
            contentDOM: code,
            // header/expand 的交互事件由外壳自己处理,其余(含 pre padding 点击落光标)放行 PM
            stopEvent: (event: Event) => {
              const t = event.target
              return t instanceof Node && (header.contains(t) || expand.contains(t))
            },
            // header/expand 的 DOM 变化不是文档变更;code 内的 mutation(含 characterData
            // 文本节点)必须放行,否则编辑不生效。Node 此处是 DOM 全局构造器,勿与 PMNode 混。
            ignoreMutation: (m: MutationRecord) =>
              !(m.target === code || (m.target instanceof Node && code.contains(m.target))),
            update: (n: PMNode) => {
              if (n.type.name !== 'code_block') return false
              render(n)
              return true
            },
          }
        },
      },
    },
  }),
)

export const codeblockViewPlugins: MilkdownPlugin[] = [codeblockView]
