// 注意:本文件被渲染进程使用,禁止引入 node 内置模块(ipc-state §5)。
// code_block collapsed 视图态 attr(设计 2026-08-23 §4):
// extendSchema 加 collapsed(默认 false);preset 的 toMarkdown 只读 language,
// collapsed 天然不进序列化。注册顺序必须在 commonmark 之后(同名 slice 后者覆盖)。
import { codeBlockSchema } from '@milkdown/preset-commonmark'
import type { MilkdownPlugin } from '@milkdown/ctx'

const extendedCodeBlockSchema = codeBlockSchema.extendSchema((prev) => (ctx) => {
  const base = prev(ctx)
  return {
    ...base,
    attrs: {
      ...base.attrs,
      collapsed: { default: false, validate: 'boolean' },
    },
  }
})

export const codeblockSchemaPlugins: MilkdownPlugin[] = [extendedCodeBlockSchema]
