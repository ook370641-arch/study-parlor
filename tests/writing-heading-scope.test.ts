// @vitest-environment jsdom
// 回归测试:工具栏块级命令(标题等)执行前折叠选区 + 代码块/列表项失败路径。
// 根因:wrapInHeadingCommand = ProseMirror setBlockType,作用于选区内所有文本块,
// 带非空选区点击会铲平全文。修复:src/lib/milkdown-collapse-selection.ts。
// 插件组合与 src/components/writing/WritingEditor.tsx 一致。
import { describe, it, expect } from 'vitest'
import { Editor, rootCtx, defaultValueCtx, editorViewCtx } from '@milkdown/core'
import { commonmark, wrapInHeadingCommand, toggleStrongCommand } from '@milkdown/preset-commonmark'
import { gfm } from '@milkdown/preset-gfm'
import { listener } from '@milkdown/plugin-listener'
import { history } from '@milkdown/plugin-history'
import { clipboard } from '@milkdown/plugin-clipboard'
import { getMarkdown, callCommand } from '@milkdown/utils'
import { TextSelection } from '@milkdown/prose/state'
import { textColorPlugins } from '../src/lib/milkdown-text-color'
import { runCollapsedBlockCommand } from '../src/lib/milkdown-collapse-selection'

async function createEditor(md: string): Promise<Editor> {
  const root = document.createElement('div')
  document.body.appendChild(root)
  return Editor.make()
    .use(commonmark)
    .use(gfm)
    .use(listener)
    .use(history)
    .use(clipboard)
    .use(textColorPlugins)
    .config(ctx => {
      ctx.set(rootCtx, root)
      ctx.set(defaultValueCtx, md)
    })
    .create()
}

function md(editor: Editor): string {
  return editor.action(getMarkdown())
}

/** 顶层节点类型摘要,如 ['paragraph', 'headingL2', 'code_block'] */
function topLevelTypes(editor: Editor): string[] {
  return editor.action(ctx => {
    const view = ctx.get(editorViewCtx)
    const out: string[] = []
    view.state.doc.forEach(node => {
      out.push(node.type.name + (node.type.name === 'heading' ? `L${node.attrs.level}` : ''))
    })
    return out
  })
}

/** 找到包含 snippet 的第一个 text 节点,返回 snippet 起始位置(offset 后可加长度取结尾) */
function findTextPos(editor: Editor, snippet: string): number {
  return editor.action(ctx => {
    const view = ctx.get(editorViewCtx)
    let result = -1
    view.state.doc.descendants((node, pos) => {
      if (result !== -1) return false
      if (node.isText && node.text && node.text.includes(snippet)) {
        result = pos + node.text.indexOf(snippet)
        return false
      }
      return true
    })
    return result
  })
}

function setSelection(editor: Editor, from: number, to = from): void {
  editor.action(ctx => {
    const view = ctx.get(editorViewCtx)
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)))
  })
}

/** 模拟工具栏块级命令路径:折叠选区后执行标题命令 */
function toolbarHeading(editor: Editor, level: number): boolean {
  return editor.action(runCollapsedBlockCommand(wrapInHeadingCommand.key, level))
}

describe('写作工具栏标题命令作用域(折叠选区修复)', () => {
  it('折叠光标:只有当前段变标题', async () => {
    const editor = await createEditor('第一段文字\n\n第二段文字\n\n第三段文字\n')
    setSelection(editor, findTextPos(editor, '第二段'))
    const ok = toolbarHeading(editor, 2)
    expect(ok).toBe(true)
    expect(topLevelTypes(editor)).toEqual(['paragraph', 'headingL2', 'paragraph'])
    editor.destroy()
  })

  it('跨三段选区 + H2:只有选区 head 所在段变标题,其余段原样', async () => {
    const editor = await createEditor('甲段落\n\n乙段落\n\n丙段落\n\n丁段落\n')
    // 用户拖选:甲开头 → 丙结尾(head 落在丙)
    setSelection(editor, findTextPos(editor, '甲段落'), findTextPos(editor, '丙段落') + '丙段落'.length)
    const ok = toolbarHeading(editor, 2)
    expect(ok).toBe(true)
    expect(topLevelTypes(editor)).toEqual(['paragraph', 'paragraph', 'headingL2', 'paragraph'])
    editor.destroy()
  })

  it('全文选区 + H1:除 head 段外文档结构不变', async () => {
    const editor = await createEditor('甲段落\n\n乙段落\n\n丙段落\n\n丁段落\n')
    editor.action(ctx => {
      const view = ctx.get(editorViewCtx)
      const d = view.state.doc
      view.dispatch(view.state.tr.setSelection(TextSelection.create(d, 1, d.content.size - 1)))
    })
    const before = topLevelTypes(editor)
    const ok = toolbarHeading(editor, 1)
    expect(ok).toBe(true)
    const after = topLevelTypes(editor)
    // 结构数量不变,只有一个块变成 heading
    expect(after.length).toBe(before.length)
    expect(after.filter(t => t === 'headingL1').length).toBe(1)
    expect(after.filter(t => t === 'paragraph').length).toBe(before.length - 1)
    editor.destroy()
  })

  it('代码块内 + H2:代码块原样、围栏保留、命令返回 false', async () => {
    const editor = await createEditor('前文\n\n```js\nconst a = 1\n```\n\n后文\n')
    setSelection(editor, findTextPos(editor, 'const a'))
    const ok = toolbarHeading(editor, 2)
    expect(ok).toBe(false)
    expect(topLevelTypes(editor)).toEqual(['paragraph', 'code_block', 'paragraph'])
    const out = md(editor)
    expect(out).toContain('```')
    expect(out).toContain('const a = 1')
    expect(out).not.toContain('##')
    editor.destroy()
  })

  it('列表项内 + H2:返回 false(走工具栏提示路径)', async () => {
    const editor = await createEditor('- 列表项一\n- 列表项二\n')
    setSelection(editor, findTextPos(editor, '列表项一'))
    const ok = toolbarHeading(editor, 2)
    expect(ok).toBe(false)
    expect(topLevelTypes(editor)).toEqual(['bullet_list'])
    editor.destroy()
  })

  it('加粗命令仍作用于整个选区(inline 命令不折叠,确认没误伤)', async () => {
    const editor = await createEditor('甲段落\n\n乙段落\n\n丙段落\n')
    setSelection(editor, findTextPos(editor, '甲段落'), findTextPos(editor, '丙段落') + '丙段落'.length)
    const ok = editor.action(callCommand(toggleStrongCommand.key))
    expect(ok).toBe(true)
    const out = md(editor)
    expect(out).toContain('**甲段落**')
    expect(out).toContain('**乙段落**')
    expect(out).toContain('**丙段落**')
    editor.destroy()
  })
})
