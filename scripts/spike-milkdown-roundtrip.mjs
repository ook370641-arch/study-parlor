#!/usr/bin/env node
// Task 0 spike (决策门 A) — Milkdown md → editor → getMarkdown() 语义保持 + 二次序列化幂等。
// 可重复运行的冒烟脚本：node scripts/spike-milkdown-roundtrip.mjs
// 任一 fixture 语义丢失或二次序列化不稳定 → 退出码 1（决策：回退编辑/预览切换方案）。
import { JSDOM } from 'jsdom'

// ProseMirror 需要浏览器全局。jsdom 提供 document/window。
const dom = new JSDOM('<!doctype html><html><body></body></html>')
// 沿原型链把 window 上 Node 缺失的属性（含 addEventListener 等 EventTarget 方法）挂到 globalThis。
// Node 自带 Event/EventTarget 等类，但 jsdom 的 dispatchEvent 只认 jsdom realm 的事件对象。
// 这些 DOM 类必须强制用 jsdom 版本覆盖。
const FORCE = new Set([
  'Event', 'CustomEvent', 'UIEvent', 'MouseEvent', 'KeyboardEvent', 'InputEvent', 'FocusEvent',
  'DragEvent', 'ClipboardEvent', 'CompositionEvent', 'WheelEvent', 'TouchEvent', 'PointerEvent',
  'EventTarget', 'Node', 'NodeList', 'Element', 'HTMLElement', 'HTMLDocument', 'Document',
  'DocumentFragment', 'Text', 'Comment', 'Range', 'Selection', 'DOMParser', 'XMLSerializer',
  'MutationObserver', 'NamedNodeMap', 'DOMTokenList', 'DataTransfer', 'CSSStyleDeclaration'
])
let proto = dom.window
const seen = new Set()
while (proto && proto !== Object.prototype) {
  for (const key of Object.getOwnPropertyNames(proto)) {
    if (seen.has(key)) continue
    seen.add(key)
    if (key in globalThis && !FORCE.has(key)) continue
    const desc = Object.getOwnPropertyDescriptor(proto, key)
    if (!desc) continue
    try {
      if (typeof desc.value === 'function') {
        Object.defineProperty(globalThis, key, { value: desc.value.bind(dom.window), configurable: true, writable: true })
      } else {
        Object.defineProperty(globalThis, key, { ...desc, configurable: true })
      }
    } catch {
      // 不可配置的全局（如 navigator）跳过。
    }
  }
  proto = Object.getPrototypeOf(proto)
}
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0)
globalThis.cancelAnimationFrame = (id) => clearTimeout(id)

// 必须在全局就绪后再加载 Milkdown / ProseMirror。
const { Editor, rootCtx, defaultValueCtx } = await import('@milkdown/core')
const { commonmark } = await import('@milkdown/preset-commonmark')
const { gfm } = await import('@milkdown/preset-gfm')
const { listener } = await import('@milkdown/plugin-listener')
const { getMarkdown } = await import('@milkdown/utils')

async function roundtrip(md) {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root)
      ctx.set(defaultValueCtx, md)
    })
    .use(commonmark)
    .use(gfm)
    .use(listener)
    .create()
  const out = editor.action(getMarkdown())
  await editor.destroy()
  root.remove()
  return out
}

const FIXTURES = {
  table: {
    md: ['# 标题', '', '| 名称 | 数量 |', '| ---- | ---- |', '| 苹果 | 3 |', '| 梨 | 5 |', ''].join('\n'),
    markers: [/\|\s*名称\s*\|\s*数量\s*\|/, /\|\s*-+\s*\|\s*-+\s*\|/, /\|\s*苹果\s*\|\s*3\s*\|/]
  },
  nestedList: {
    md: ['- 一级 A', '  - 二级 B', '    - 三级 C', '- 一级 D', ''].join('\n'),
    markers: [/^[*-] 一级 A$/m, /^ {2,}[*-] 二级 B$/m, /^ {4,}[*-] 三级 C$/m, /^[*-] 一级 D$/m]
  },
  codeBlock: {
    md: ['前文', '', '```ts', 'const x: number = 1', 'console.log(x)', '```', '', '后文', ''].join('\n'),
    markers: [/```ts\nconst x: number = 1\nconsole\.log\(x\)\n```/, /后文/]
  },
  blockquote: {
    md: ['> 引用第一行', '> 引用第二行', '', '普通段落', ''].join('\n'),
    markers: [/> 引用第一行\n> 引用第二行/, /普通段落/]
  },
  inlineMarks: {
    md: ['**加粗** 与 *斜体* 与 ~~删除线~~ 混排', ''].join('\n'),
    markers: [/\*\*加粗\*\*/, /\*斜体\*/, /~~删除线~~/]
  }
}

let failed = 0
for (const [name, { md, markers }] of Object.entries(FIXTURES)) {
  try {
    const out1 = await roundtrip(md)
    for (const m of markers) {
      if (!m.test(out1)) throw new Error(`marker ${m} lost in output:\n${out1}`)
    }
    const out2 = await roundtrip(out1)
    if (out2 !== out1) throw new Error(`not idempotent:\n--- first ---\n${out1}\n--- second ---\n${out2}`)
    console.log(`PASS ${name}`)
  } catch (err) {
    failed++
    console.error(`FAIL ${name}: ${err.message}`)
  }
}

if (failed > 0) {
  console.error(`\n决策门 A: ${failed} 个 fixture 失败 → 回退编辑/预览切换方案`)
  process.exit(1)
}
console.log('\n决策门 A: 全部通过 → Milkdown 方案通过')
