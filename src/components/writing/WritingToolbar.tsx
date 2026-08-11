import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/store'
import { callCommand } from '@milkdown/utils'
import {
  wrapInBlockquoteCommand,
  insertHrCommand,
  wrapInHeadingCommand,
} from '@milkdown/preset-commonmark'
import { runCollapsedBlockCommand } from '@/lib/milkdown-collapse-selection'
import { QuoteIcon, HrIcon } from '@/lib/writing-toolbar-icons.tsx'
import { editorViewCtx } from '@milkdown/core'
import { Selection, TextSelection } from '@milkdown/prose/state'

const HEADING_OPTIONS = [
  { label: '正文', level: 0 },
  { label: 'H1', level: 1 },
  { label: 'H2', level: 2 },
  { label: 'H3', level: 3 },
] as const

// 分割线插入后光标落到下一行(设计 spec §E)。
// 复用 runCollapsedBlockCommand:先折叠非空选区到 head,再执行 insertHrCommand。
// 注意 insertHrCommand 完成后光标停留在插入点上方的段落(其后方插了一个空段+hr),
// 因此以「插入点(selection.from)之后的第一个 hr」定位新 hr —— 不会误命中光标下方
// 已存在的旧分隔线;若 hr 下方已有内容则光标放其行首,否则补一个空段落并放光标。
function insertHrBelow(ctx: any): boolean {
  const ok = runCollapsedBlockCommand(insertHrCommand.key)(ctx)
  if (ok === false) return false
  const view = ctx.get(editorViewCtx)
  const doc = view.state.doc
  const selFrom = view.state.selection.from
  let hrPos = -1
  doc.descendants((node: any, pos: number) => {
    if (node.type.name === 'hr' && pos >= selFrom && hrPos === -1) hrPos = pos
    return true
  })
  if (hrPos < 0) return true // 没找到新 hr,不动光标
  const after = hrPos + 1 // hr nodeSize === 1 → after = hr 之后的位置
  const next = doc.nodeAt(after) // hr 下方原本的节点
  let tr = view.state.tr
  let targetPos: number
  if (next) {
    targetPos = after + 1 // 下一块内容行首
  } else {
    tr = tr.replaceWith(after, after, view.state.schema.nodes.paragraph.create())
    targetPos = after + 1
  }
  try {
    tr.setSelection(TextSelection.create(tr.doc, targetPos))
  } catch {
    tr.setSelection(Selection.near(tr.doc.resolve(targetPos)))
  }
  view.dispatch(tr.scrollIntoView())
  return true
}

export function WritingToolbar() {
  const act = useStore(s => s.writingEditorAction)
  const [headingMenuOpen, setHeadingMenuOpen] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const hintTimer = useRef<number | null>(null)

  const showHint = (msg: string) => {
    setHint(msg)
    if (hintTimer.current !== null) window.clearTimeout(hintTimer.current)
    hintTimer.current = window.setTimeout(() => { setHint(null); hintTimer.current = null }, 2500)
  }

  useEffect(() => () => {
    if (hintTimer.current !== null) window.clearTimeout(hintTimer.current)
  }, [])

  // act 本身不回传值(WritingEditor 侧箭头函数无 return),在闭包里同步接命令返回值。
  const exec = (cmd: any, payload?: any, opts?: { block?: boolean; failMsg?: string }) => {
    if (!act) return
    let ok: boolean | undefined
    const runner = opts?.block ? runCollapsedBlockCommand(cmd, payload) : callCommand(cmd, payload)
    act((ctx: any) => { ok = runner(ctx) })
    if (ok === false) showHint(opts?.failMsg ?? '当前位置不支持该操作')
  }

  // 菜单外点击关闭（沿用 WritingTree 的 document click 模式）。
  // 按钮与菜单自身 stopPropagation，因此这里只会收到真正的外部点击。
  useEffect(() => {
    if (!headingMenuOpen) return
    const h = () => { setHeadingMenuOpen(false) }
    document.addEventListener('click', h)
    return () => document.removeEventListener('click', h)
  }, [headingMenuOpen])

  return (
    <div className="flex items-center gap-1 px-3 py-1 border-b border-parchment/10 shrink-0 select-none">
      {/* Markdown formatting */}
      <button
        data-testid="writing-toolbar-blockquote"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => exec(wrapInBlockquoteCommand.key, undefined, { block: true })}
        className="px-1.5 py-0.5 text-xs text-parchment/60 hover:text-parchment rounded hover:bg-parchment/10"
        title="引用"
      >
        <QuoteIcon />
      </button>
      <button
        data-testid="writing-toolbar-hr"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => { if (!act) return; act((ctx: any) => { const ok = insertHrBelow(ctx); if (ok === false) showHint('当前位置不支持该操作') }) }}
        className="px-1.5 py-0.5 text-xs text-parchment/60 hover:text-parchment rounded hover:bg-parchment/10"
        title="分割线"
      >
        <HrIcon />
      </button>
      <span className="text-parchment/20 mx-0.5">|</span>
      {/* Heading level */}
      <div className="relative">
        <button
          data-testid="writing-toolbar-heading"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => { e.stopPropagation(); setHeadingMenuOpen(v => !v) }}
          className="px-1.5 py-0.5 text-xs text-parchment/60 hover:text-parchment rounded hover:bg-parchment/10"
          title="标题级别"
        >
          H▾
        </button>
        {headingMenuOpen && (
          <div
            className="absolute top-full left-0 z-50 bg-ink border border-parchment/20 rounded shadow-lg py-1 text-xs min-w-[72px]"
            onClick={(e) => e.stopPropagation()}
          >
            {HEADING_OPTIONS.map(o => (
              <button
                key={o.label}
                data-testid="writing-heading-option"
                data-level={o.level}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { setHeadingMenuOpen(false); exec(wrapInHeadingCommand.key, o.level, { block: true, failMsg: '当前位置不支持标题' }) }}
                className="block w-full text-left px-3 py-1.5 hover:bg-parchment/10 text-parchment/80"
              >
                {o.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {hint && (
        <span data-testid="writing-toolbar-hint" className="ml-2 text-xs text-ember/90">
          {hint}
        </span>
      )}
    </div>
  )
}
