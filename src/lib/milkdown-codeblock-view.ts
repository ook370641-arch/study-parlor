// 注意:本文件被渲染进程使用,禁止引入 node 内置模块(ipc-state §5)。
// 代码块 NodeView 外壳(设计 2026-08-23 §2,模式照抄 milkdown-orbit-hr.ts):
// dom = 面板(header + pre>code contentDOM + 折叠展开条);
// header/expand 的 mousedown 由 stopEvent 拦下(不进 PM 选区逻辑),
// contentDOM 内事件全部放行,保证代码区可编辑。
import { $prose } from '@milkdown/utils'
import { Plugin, PluginKey } from '@milkdown/prose/state'
import type { MilkdownPlugin } from '@milkdown/ctx'
import type { Node as PMNode } from '@milkdown/prose/model'
import type { EditorView, ViewMutationRecord } from '@milkdown/prose/view'
import { useStore } from '@/store'
import { codeblockHash } from './codeblock-collapse'

function langLabel(node: PMNode): string {
  return (node.attrs.language as string) || '文本'
}

// 折叠偏好只与「某文件」绑定,故插件做成工厂(filePath 进闭包)。
// 编辑器由 WritingBoard/CompanionBoard 以 key={file.path} 按文件重挂载,
// 故 filePath 在单个编辑器实例生命周期内稳定。
function codeblockView(filePath: string) {
  return $prose(() =>
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
            // 同步折叠偏好到 state.json(视图态,不进 .md)
            const h = codeblockHash(String(cur.attrs.language ?? ''), cur.textContent)
            const list = [...(useStore.getState().writingCodeblockCollapsed[filePath] ?? [])]
            if (collapsed) list.push(h)
            else {
              const i = list.indexOf(h)
              if (i >= 0) list.splice(i, 1)
            }
            useStore.getState().replaceWritingCodeblockCollapsed(filePath, list)
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
            ignoreMutation: (m: ViewMutationRecord) =>
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
}

// 打开文件时恢复折叠偏好:store 里某 hash 出现 N 次 → 折叠文档中前 N 个该 hash 的块;
// 匹配上的 hash 写回 store(清理已删除块的残留条目)。创建后 setTimeout(0) 异步执行,
// 避免在 PM 视图构建期 dispatch 触发嵌套 update。
function codeblockCollapseRestore(filePath: string) {
  return $prose(() =>
    new Plugin({
      key: new PluginKey('STUDY_PARLOR_CODEBLOCK_COLLAPSE_RESTORE'),
      view: (view) => {
        const timer = setTimeout(() => {
          try {
            const stored = useStore.getState().writingCodeblockCollapsed[filePath] ?? []
            if (stored.length === 0) return
            const remaining = new Map<string, number>()
            for (const h of stored) remaining.set(h, (remaining.get(h) ?? 0) + 1)
            const tr = view.state.tr
            let changed = false
            const matched: string[] = []
            view.state.doc.descendants((node, pos) => {
              if (node.type.name !== 'code_block' || node.attrs.collapsed) return true
              const h = codeblockHash(String(node.attrs.language ?? ''), node.textContent)
              const n = remaining.get(h) ?? 0
              if (n > 0) {
                remaining.set(h, n - 1)
                matched.push(h)
                tr.setNodeMarkup(pos, undefined, { ...node.attrs, collapsed: true })
                changed = true
              }
              return true
            })
            if (changed) view.dispatch(tr)
            if (matched.length !== stored.length) {
              useStore.getState().replaceWritingCodeblockCollapsed(filePath, matched)
            }
          } catch {
            // 恢复失败静默:折叠是纯视图偏好,不应阻断编辑器启动
          }
        }, 0)
        return {
          update: () => {},
          destroy: () => clearTimeout(timer),
        }
      },
    }),
  )
}

export function codeblockViewPlugins(filePath: string): MilkdownPlugin[] {
  return [codeblockView(filePath), codeblockCollapseRestore(filePath)]
}
