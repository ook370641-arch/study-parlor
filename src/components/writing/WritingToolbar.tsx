import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/store'
import { callCommand } from '@milkdown/utils'
import {
  toggleStrongCommand,
  toggleEmphasisCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInOrderedListCommand,
  insertHrCommand,
  wrapInHeadingCommand,
} from '@milkdown/preset-commonmark'
import { toggleStrikethroughCommand, insertTableCommand } from '@milkdown/preset-gfm'
import { textColorCommand, TEXT_COLOR_PALETTE } from '@/lib/milkdown-text-color'
import { runCollapsedBlockCommand } from '@/lib/milkdown-collapse-selection'

const HEADING_OPTIONS = [
  { label: '正文', level: 0 },
  { label: 'H1', level: 1 },
  { label: 'H2', level: 2 },
  { label: 'H3', level: 3 },
] as const

export function WritingToolbar() {
  const act = useStore(s => s.writingEditorAction)
  const [headingMenuOpen, setHeadingMenuOpen] = useState(false)
  const [colorMenuOpen, setColorMenuOpen] = useState(false)
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
    if (!headingMenuOpen && !colorMenuOpen) return
    const h = () => { setHeadingMenuOpen(false); setColorMenuOpen(false) }
    document.addEventListener('click', h)
    return () => document.removeEventListener('click', h)
  }, [headingMenuOpen, colorMenuOpen])

  return (
    <div className="flex items-center gap-1 px-3 py-1 border-b border-parchment/10 shrink-0 select-none">
      {/* Markdown formatting */}
      <button
        data-testid="writing-toolbar-bold"
        onClick={() => exec(toggleStrongCommand.key)}
        className="px-1.5 py-0.5 text-xs font-bold text-parchment/60 hover:text-parchment rounded hover:bg-parchment/10"
        title="加粗 (B)"
      >
        B
      </button>
      <button
        data-testid="writing-toolbar-italic"
        onClick={() => exec(toggleEmphasisCommand.key)}
        className="px-1.5 py-0.5 text-xs italic text-parchment/60 hover:text-parchment rounded hover:bg-parchment/10"
        title="斜体 (I)"
      >
        I
      </button>
      <button
        data-testid="writing-toolbar-strikethrough"
        onClick={() => exec(toggleStrikethroughCommand.key)}
        className="px-1.5 py-0.5 text-xs line-through text-parchment/60 hover:text-parchment rounded hover:bg-parchment/10"
        title="删除线"
      >
        S
      </button>
      <span className="text-parchment/20 mx-0.5">|</span>
      <button
        data-testid="writing-toolbar-blockquote"
        onClick={() => exec(wrapInBlockquoteCommand.key, undefined, { block: true })}
        className="px-1.5 py-0.5 text-xs text-parchment/60 hover:text-parchment rounded hover:bg-parchment/10"
        title="引用"
      >
        ❝
      </button>
      <button
        data-testid="writing-toolbar-bullet-list"
        onClick={() => exec(wrapInBulletListCommand.key, undefined, { block: true })}
        className="px-1.5 py-0.5 text-xs text-parchment/60 hover:text-parchment rounded hover:bg-parchment/10"
        title="无序列表"
      >
        •
      </button>
      <button
        data-testid="writing-toolbar-ordered-list"
        onClick={() => exec(wrapInOrderedListCommand.key, undefined, { block: true })}
        className="px-1.5 py-0.5 text-xs text-parchment/60 hover:text-parchment rounded hover:bg-parchment/10"
        title="有序列表"
      >
        1.
      </button>
      <button
        data-testid="writing-toolbar-hr"
        onClick={() => exec(insertHrCommand.key)}
        className="px-1.5 py-0.5 text-xs text-parchment/60 hover:text-parchment rounded hover:bg-parchment/10"
        title="分割线"
      >
        —
      </button>
      <span className="text-parchment/20 mx-0.5">|</span>
      <button
        data-testid="writing-toolbar-table"
        onClick={() => exec(insertTableCommand.key)}
        className="px-1.5 py-0.5 text-xs text-parchment/60 hover:text-parchment rounded hover:bg-parchment/10"
        title="插入表格"
      >
        ▦
      </button>
      <span className="text-parchment/20 mx-0.5">|</span>
      {/* Heading level */}
      <div className="relative">
        <button
          data-testid="writing-toolbar-heading"
          onClick={(e) => { e.stopPropagation(); setHeadingMenuOpen(v => !v); setColorMenuOpen(false) }}
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
                onClick={() => { setHeadingMenuOpen(false); exec(wrapInHeadingCommand.key, o.level, { block: true, failMsg: '当前位置不支持标题' }) }}
                className="block w-full text-left px-3 py-1.5 hover:bg-parchment/10 text-parchment/80"
              >
                {o.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {/* Text color */}
      <div className="relative">
        <button
          data-testid="writing-toolbar-color"
          onClick={(e) => { e.stopPropagation(); setColorMenuOpen(v => !v); setHeadingMenuOpen(false) }}
          className="px-1.5 py-0.5 text-xs text-parchment/60 hover:text-parchment rounded hover:bg-parchment/10"
          title="文字颜色"
        >
          A▾
        </button>
        {colorMenuOpen && (
          <div
            className="absolute top-full left-0 z-50 bg-ink border border-parchment/20 rounded shadow-lg py-1 text-xs min-w-[88px]"
            onClick={(e) => e.stopPropagation()}
          >
            {TEXT_COLOR_PALETTE.map(c => (
              <button
                key={c.label}
                data-testid="writing-color-option"
                data-color={c.value ?? ''}
                onClick={() => { setColorMenuOpen(false); exec(textColorCommand.key, { color: c.value }) }}
                className="flex items-center gap-2 w-full text-left px-3 py-1.5 hover:bg-parchment/10 text-parchment/80"
              >
                <span className="inline-block w-3 h-3 rounded-full border border-parchment/30" style={{ background: c.value ?? 'transparent' }} />
                {c.label}
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
