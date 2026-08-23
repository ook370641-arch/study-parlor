// 注意:本文件被渲染进程使用,禁止引入 node 内置模块(ipc-state §5)。
// 代码块语法高亮(设计 2026-08-23 §3):refractor → inline decorations。
// 只注册常用语言子集(控制 bundle);不支持的语言静默跳过。
// 装饰重算粒度 = 整个 doc(笔记体量下足够;docChanged 才重算)。
import { $prose } from '@milkdown/utils'
import { Plugin, PluginKey } from '@milkdown/prose/state'
import { Decoration, DecorationSet } from '@milkdown/prose/view'
import type { MilkdownPlugin } from '@milkdown/ctx'
import type { Node as PMNode } from '@milkdown/prose/model'
import { refractor } from 'refractor'
// 注册顺序即依赖顺序(typescript 依赖 javascript,jsx/tsx 依赖 markup/javascript/typescript)
import refractorMarkup from 'refractor/lang/markup.js'
import refractorCss from 'refractor/lang/css.js'
import refractorClike from 'refractor/lang/clike.js'
import refractorJavascript from 'refractor/lang/javascript.js'
import refractorTypescript from 'refractor/lang/typescript.js'
import refractorJsx from 'refractor/lang/jsx.js'
import refractorTsx from 'refractor/lang/tsx.js'
import refractorPython from 'refractor/lang/python.js'
import refractorBash from 'refractor/lang/bash.js'
import refractorJson from 'refractor/lang/json.js'
import refractorYaml from 'refractor/lang/yaml.js'
import refractorMarkdown from 'refractor/lang/markdown.js'
import refractorSql from 'refractor/lang/sql.js'

for (const lang of [
  refractorMarkup, refractorCss, refractorClike, refractorJavascript,
  refractorTypescript, refractorJsx, refractorTsx, refractorPython,
  refractorBash, refractorJson, refractorYaml, refractorMarkdown, refractorSql,
]) {
  refractor.register(lang)
}

/** 把 refractor hast 子树展平成 (offset, length, classes) 片段 */
function collectTokens(
  node: { type: string; value?: string; children?: any[]; properties?: { className?: string[] } },
  pos: number,
  classes: string[],
  out: { from: number; to: number; cls: string }[],
): number {
  if (node.type === 'text') {
    const len = node.value!.length
    if (len > 0 && classes.length > 0) out.push({ from: pos, to: pos + len, cls: classes.join(' ') })
    return pos + len
  }
  let cur = pos
  const cls = node.type === 'element'
    ? [...classes, ...(node.properties?.className ?? [])]
    : classes
  for (const child of node.children ?? []) cur = collectTokens(child, cur, cls, out)
  return cur
}

function buildDecorations(doc: PMNode): DecorationSet {
  const decos: Decoration[] = []
  doc.descendants((node, pos) => {
    if (node.type.name !== 'code_block') return true
    const lang = node.attrs.language as string
    if (!lang || !refractor.registered(lang)) return true
    const text = node.textContent
    if (!text) return true
    try {
      const tree = refractor.highlight(text, lang) as unknown as { children: any[] }
      const spans: { from: number; to: number; cls: string }[] = []
      let cur = pos + 1 // 代码文本从节点内容起点开始
      for (const child of tree.children) cur = collectTokens(child, cur, [], spans)
      for (const s of spans) decos.push(Decoration.inline(s.from, s.to, { class: s.cls }))
    } catch {
      // 高亮失败静默降级为纯文本
    }
    return true
  })
  return DecorationSet.create(doc, decos)
}

const KEY = new PluginKey<DecorationSet>('STUDY_PARLOR_CODEBLOCK_HIGHLIGHT')

const codeblockHighlight = $prose(() =>
  new Plugin({
    key: KEY,
    state: {
      init: (_, state) => buildDecorations(state.doc),
      apply: (tr, old, _oldState, newState) => (tr.docChanged ? buildDecorations(newState.doc) : old),
    },
    props: {
      decorations: (state) => KEY.getState(state),
    },
  }),
)

export const codeblockHighlightPlugins: MilkdownPlugin[] = [codeblockHighlight]
