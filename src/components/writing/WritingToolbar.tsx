import { useStore } from '@/store'
import { callCommand } from '@milkdown/utils'
import {
  toggleStrongCommand,
  toggleEmphasisCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInOrderedListCommand,
  insertHrCommand,
} from '@milkdown/preset-commonmark'
import { toggleStrikethroughCommand, insertTableCommand } from '@milkdown/preset-gfm'

const TONE_LABELS = {
  parchment: '暖米',
  plain: '素白',
  ink: '墨灰',
} as const

const FONT_SIZE_KEYS = ['sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl', '7xl'] as const

export function WritingToolbar() {
  const fontSize = useStore(s => s.writingFontSize)
  const tone = useStore(s => s.writingTone)
  const setFontSize = useStore(s => s.setWritingFontSize)
  const setTone = useStore(s => s.setWritingTone)
  const act = useStore(s => s.writingEditorAction)

  const exec = (cmd: any, payload?: any) => {
    if (!act) return
    act(callCommand(cmd, payload))
  }

  const cycleFontSize = (dir: 1 | -1) => {
    const idx = FONT_SIZE_KEYS.indexOf(fontSize as (typeof FONT_SIZE_KEYS)[number])
    const next = FONT_SIZE_KEYS[(idx + dir + FONT_SIZE_KEYS.length) % FONT_SIZE_KEYS.length]
    setFontSize(next)
  }

  const cycleTone = () => {
    const tones = ['parchment', 'plain', 'ink'] as const
    const idx = tones.indexOf(tone)
    setTone(tones[(idx + 1) % tones.length])
  }

  return (
    <div className="flex items-center gap-1 px-3 py-1 border-b border-parchment/10 shrink-0 select-none">
      {/* Markdown formatting */}
      <button
        onClick={() => exec(toggleStrongCommand)}
        className="px-1.5 py-0.5 text-xs font-bold text-parchment/60 hover:text-parchment rounded hover:bg-parchment/10"
        title="加粗 (B)"
      >
        B
      </button>
      <button
        onClick={() => exec(toggleEmphasisCommand)}
        className="px-1.5 py-0.5 text-xs italic text-parchment/60 hover:text-parchment rounded hover:bg-parchment/10"
        title="斜体 (I)"
      >
        I
      </button>
      <button
        onClick={() => exec(toggleStrikethroughCommand)}
        className="px-1.5 py-0.5 text-xs line-through text-parchment/60 hover:text-parchment rounded hover:bg-parchment/10"
        title="删除线"
      >
        S
      </button>
      <span className="text-parchment/20 mx-0.5">|</span>
      <button
        onClick={() => exec(wrapInBlockquoteCommand)}
        className="px-1.5 py-0.5 text-xs text-parchment/60 hover:text-parchment rounded hover:bg-parchment/10"
        title="引用"
      >
        ❝
      </button>
      <button
        onClick={() => exec(wrapInBulletListCommand)}
        className="px-1.5 py-0.5 text-xs text-parchment/60 hover:text-parchment rounded hover:bg-parchment/10"
        title="无序列表"
      >
        •
      </button>
      <button
        onClick={() => exec(wrapInOrderedListCommand)}
        className="px-1.5 py-0.5 text-xs text-parchment/60 hover:text-parchment rounded hover:bg-parchment/10"
        title="有序列表"
      >
        1.
      </button>
      <button
        onClick={() => exec(insertHrCommand)}
        className="px-1.5 py-0.5 text-xs text-parchment/60 hover:text-parchment rounded hover:bg-parchment/10"
        title="分割线"
      >
        —
      </button>
      <span className="text-parchment/20 mx-0.5">|</span>
      <button
        onClick={() => exec(insertTableCommand)}
        className="px-1.5 py-0.5 text-xs text-parchment/60 hover:text-parchment rounded hover:bg-parchment/10"
        title="插入表格"
      >
        ▦
      </button>
      <span className="text-parchment/20 mx-0.5">|</span>
      {/* Font size */}
      <button
        onClick={() => cycleFontSize(-1)}
        className="px-1.5 py-0.5 text-xs text-parchment/60 hover:text-parchment rounded hover:bg-parchment/10"
        title="缩小字号"
      >
        A-
      </button>
      <span className="text-[10px] text-parchment/40 w-6 text-center">{fontSize}</span>
      <button
        onClick={() => cycleFontSize(1)}
        className="px-1.5 py-0.5 text-xs text-parchment/60 hover:text-parchment rounded hover:bg-parchment/10"
        title="增大字号"
      >
        A+
      </button>
      <span className="text-parchment/20 mx-0.5">|</span>
      {/* Tone */}
      <button
        onClick={cycleTone}
        className="px-1.5 py-0.5 text-xs text-parchment/60 hover:text-parchment rounded hover:bg-parchment/10"
        title="配色方案"
      >
        🎨
      </button>
      <span className="text-[10px] text-parchment/40 ml-0.5">{TONE_LABELS[tone]}</span>
    </div>
  )
}
