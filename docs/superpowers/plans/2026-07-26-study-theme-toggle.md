# 学习页版式切换 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 C 页面（Home/Study/Profile/Settings/Extension）新增学术↔报纸版式切换，共享 Briefing 已有的 `briefingTheme` 状态。

**Architecture:** 新建 `StudyControlsGroup` 组件（换画+版式切换按钮组），5 个 C 页面各自引入；所有颜色适配用条件 Tailwind 类名实现，纯视觉替换，不动布局和交互逻辑。

**Tech Stack:** React 18 + TypeScript + Tailwind CSS + Zustand（store 已就绪，无需改动）

---

## 文件结构

| 文件 | 操作 | 职责 |
|---|---|---|
| `src/components/StudyControlsGroup.tsx` | **新建** | 换画按钮 + 版式切换按钮，描边色随主题自适应 |
| `src/styles/globals.css` | 修改 | 新增 `.swap-btn-newspaper` 样式变体 |
| `src/components/SwapPaintingButton.tsx` | 修改 | 增加 `theme` prop，切换 CSS 类 |
| `src/components/SurfaceBackground.tsx` | 修改 | 报纸模式下不渲染 |
| `src/components/ChatBubble.tsx` | 修改 | 新增 `theme` prop，切换气泡配色 |
| `src/components/ChatInput.tsx` | 修改 | 新增 `theme` prop，切换输入框配色 |
| `src/components/Button.tsx` | 修改 | 新增 `theme` prop，ghost 按钮配色切换 |
| `src/components/BackToCover.tsx` | 修改 | 新增 `theme` prop，文字色切换 |
| `src/components/ExternalMaterialsCard.tsx` | 修改 | 新增 `theme` prop |
| `src/pages/Study.tsx` | 修改 | 引入控件组，全页主题适配 |
| `src/pages/Home.tsx` | 修改 | 引入控件组，全页主题适配 |
| `src/pages/Profile.tsx` | 修改 | 引入控件组，全页主题适配 |
| `src/pages/Settings.tsx` | 修改 | 引入控件组，全页主题适配 |
| `src/pages/Extension.tsx` | 修改 | 引入控件组，全页主题适配 |
| `tests/study-controls-group.test.tsx` | **新建** | 控件组组件测试 |
| `tests/study-theme.test.tsx` | **新建** | 页面主题切换测试 |

---

### Task 1: Add `.swap-btn-newspaper` CSS variant

**Files:**
- Modify: `src/styles/globals.css`

- [ ] **Step 1: Add newspaper variant for swap-btn**

在 `.swap-btn` 规则块之后追加：

```css
/* 报纸版式换画按钮：深灰描边/黑字 */
.swap-btn-newspaper {
  background: rgba(255, 255, 255, 0.6);
  border-color: rgba(26, 26, 26, 0.18);
  color: rgba(26, 26, 26, 0.5);
}
.swap-btn-newspaper:hover {
  border-color: rgba(26, 26, 26, 0.35);
  color: rgba(26, 26, 26, 0.8);
}
```

- [ ] **Step 2: Verify CSS compiles**

Run: `npm run dev`（启动后检查无 CSS 编译错误，然后 `Ctrl+C`）

- [ ] **Step 3: Commit**

```bash
git add src/styles/globals.css
git commit -m "style: add .swap-btn-newspaper variant for light theme"
```

---

### Task 2: Update SwapPaintingButton to accept theme

**Files:**
- Modify: `src/components/SwapPaintingButton.tsx`

- [ ] **Step 1: Add `theme` prop and switch CSS class**

将组件修改为：

```tsx
import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/store'
import { SWAP_TOTAL_MS } from '@/lib/motion-presets'
import { PaintingLabel } from './PaintingLabel'
import type { BriefingTheme } from '@shared/index'

interface Props {
  surface: 'cover' | 'home' | 'study' | 'briefing'
  theme?: BriefingTheme
  className?: string
  'data-testid'?: string
}

export function SwapPaintingButton({ surface, theme, className = '', 'data-testid': dataTestId }: Props) {
  const swap = useStore(s => s.swapPainting)
  const [locked, setLocked] = useState(false)
  const lockTimer = useRef<number | null>(null)

  useEffect(() => () => { if (lockTimer.current) clearTimeout(lockTimer.current) }, [])

  const onSwap = () => {
    if (locked) return
    setLocked(true)
    swap(surface)
    lockTimer.current = window.setTimeout(() => setLocked(false), SWAP_TOTAL_MS)
  }

  const isNewspaper = theme === 'newspaper'

  return (
    <span className={`group inline-flex relative ${className}`}>
      <button
        data-testid={dataTestId}
        type="button"
        onClick={onSwap}
        disabled={locked}
        className={`${isNewspaper ? 'swap-btn-newspaper' : 'swap-btn'} ${locked ? 'opacity-50 cursor-default' : ''}`}
        aria-label="换一幅画"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-4 h-4 transition-transform duration-300 group-hover:rotate-180"
        >
          <path d="M21 12a9 9 0 1 1-3.51-7.13M21 4v5h-5"/>
        </svg>
      </button>
      <PaintingLabel surface={surface} className="absolute top-full right-0 whitespace-nowrap" />
    </span>
  )
}
```

关键变化：
- 新增 `theme?: BriefingTheme` prop
- `isNewspaper` 时使用 `swap-btn-newspaper` 类名替换 `swap-btn`

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors

- [ ] **Step 3: Commit**

```bash
git add src/components/SwapPaintingButton.tsx
git commit -m "feat: add theme prop to SwapPaintingButton for newspaper variant"
```

---

### Task 3: Create StudyControlsGroup component

**Files:**
- Create: `src/components/StudyControlsGroup.tsx`

- [ ] **Step 1: Write the component**

```tsx
import { useStore } from '@/store'
import { SwapPaintingButton } from './SwapPaintingButton'

interface Props {
  surface: 'home' | 'study'
  className?: string
}

export function StudyControlsGroup({ surface, className = '' }: Props) {
  const theme = useStore((s) => s.briefingTheme)
  const setTheme = useStore((s) => s.setBriefingTheme)
  const isAcademic = theme !== 'newspaper'

  const toggleTheme = () => {
    setTheme(isAcademic ? 'newspaper' : 'academic')
  }

  const btnCls = isAcademic
    ? 'border-parchment/25 text-parchment/50 hover:text-parchment hover:border-parchment/40'
    : 'border-[#2a1f1a]/25 text-[#2a1f1a]/50 hover:text-[#2a1f1a] hover:border-[#2a1f1a]/40'

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {isAcademic && (
        <SwapPaintingButton
          surface={surface}
          theme={theme}
          data-testid="study-controls-swap-painting"
        />
      )}
      <button
        type="button"
        data-testid="study-controls-theme-toggle"
        onClick={toggleTheme}
        className={`w-7 h-7 rounded-full border flex items-center justify-center transition-colors ${btnCls}`}
        title={isAcademic ? '切换报纸版式' : '切换学术版式'}
      >
        {isAcademic ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="3" y1="9" x2="21" y2="9" />
            <line x1="9" y1="21" x2="9" y2="9" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
          </svg>
        )}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/StudyControlsGroup.tsx
git commit -m "feat: add StudyControlsGroup (swap painting + theme toggle)"
```

---

### Task 4: Update SurfaceBackground to hide in newspaper

**Files:**
- Modify: `src/components/SurfaceBackground.tsx`

- [ ] **Step 1: Read theme from store and conditionally render**

在组件顶部添加 theme 读取，报纸模式下返回 null：

```tsx
import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/store'
import { SWAP_DROP_DELAY_MS, SWAP_TOTAL_MS } from '@/lib/motion-presets'

// ... VIGNETTE_STYLE 保持不变 ...

interface Props {
  surface: 'cover' | 'home' | 'study' | 'briefing'
}

export function SurfaceBackground({ surface }: Props) {
  const theme = useStore((s) => s.briefingTheme)
  const painting = useStore(s => s.currentPaintings[surface])
  // ... 其余逻辑不变 ...

  // 报纸版式不渲染画作背景
  if (theme === 'newspaper') return null

  // ... 后续渲染逻辑不变 ...
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/components/SurfaceBackground.tsx
git commit -m "feat: hide SurfaceBackground in newspaper theme"
```

---

### Task 5: Update ChatBubble for theme

**Files:**
- Modify: `src/components/ChatBubble.tsx`

- [ ] **Step 1: Add `theme` prop and conditional styling**

关键改动：气泡和 markdown 组件根据主题切换配色。

```tsx
import type { Message } from '@shared/index'
import type { BriefingTheme } from '@shared/index'
import type { Components } from 'react-markdown'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

function makeChatComponents(isAcademic: boolean): Components {
  const textMain = isAcademic ? 'text-parchment' : 'text-[#1a1a1a]'
  const textMuted = isAcademic ? 'text-parchment/70' : 'text-[#555]'
  const textSubtle = isAcademic ? 'text-parchment/75' : 'text-[#444]'
  const accent = isAcademic ? 'text-ember' : 'text-[#8a3a3a]'
  const accentBg = isAcademic ? 'bg-ember/10' : 'bg-[#8a3a3a]/8'
  const accentBorder = isAcademic ? 'border-ember/30' : 'border-[#8a3a3a]/25'
  const accentLight = isAcademic ? 'border-ember/50 bg-ember/5' : 'border-[#8a3a3a]/30 bg-[#8a3a3a]/4'
  const codeBg = isAcademic ? 'bg-[rgba(42,31,26,0.8)]' : 'bg-[#f0f0ea]'
  const preBg = isAcademic ? 'bg-[#15100d] border-[rgba(148,137,121,0.12)]' : 'bg-[#f5f5f0] border-[#1a1a1a]/10'
  const hrBorder = isAcademic ? 'bg-slate/20' : 'bg-[#1a1a1a]/10'
  const linkHover = isAcademic ? 'hover:text-[#e8a07a]' : 'hover:text-[#6a2a2a]'
  const thBorder = isAcademic ? 'border-slate/15' : 'border-[#1a1a1a]/10'
  const h1Border = isAcademic ? 'border-ember/30' : 'border-[#8a3a3a]/25'
  const strongText = isAcademic ? 'text-parchment/95' : 'text-[#1a1a1a]'

  return {
    p: ({ children }) => <p className="m-0 my-1">{children}</p>,
    strong: ({ children }) => <strong className={`${strongText} font-semibold`}>{children}</strong>,
    em: ({ children }) => <em className={`italic ${textMuted}`}>{children}</em>,
    table: ({ children }) => <table className="w-full border-collapse my-2 text-sm">{children}</table>,
    thead: ({ children }) => <thead className={accentBg}>{children}</thead>,
    th: ({ children }) => (
      <th className={`px-2.5 py-2 text-left border-b ${thBorder} ${accent} text-xs uppercase tracking-wider`}>
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className={`px-2.5 py-1.5 border-b ${thBorder} ${textSubtle}`}>{children}</td>
    ),
    tr: ({ children }) => <tr>{children}</tr>,
    tbody: ({ children }) => <tbody>{children}</tbody>,
    blockquote: ({ children }) => (
      <blockquote className={`my-3 px-3.5 py-2.5 border-l-[3px] ${accentLight} rounded-r`}>
        {children}
      </blockquote>
    ),
    code: ({ children, className }) => {
      const isInline = !className
      if (isInline)
        return (
          <code className={`font-mono text-[13px] ${codeBg} px-1 py-0.5 rounded ${accent}`}>
            {children}
          </code>
        )
      return (
        <pre className={`${preBg} rounded p-3 my-2 overflow-auto`}>
          <code className="bg-transparent p-0 text-inherit font-mono text-[13px] leading-relaxed">
            {children}
          </code>
        </pre>
      )
    },
    ul: ({ children }) => <ul className="my-2 pl-5">{children}</ul>,
    ol: ({ children }) => <ol className="my-2 pl-5">{children}</ol>,
    li: ({ children }) => <li className="my-1">{children}</li>,
    hr: () => <hr className={`border-none my-4 h-px ${hrBorder}`} />,
    a: ({ href, children }) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`${accent} underline decoration-ember/40 ${linkHover}`}
      >
        {children}
      </a>
    ),
    h1: ({ children }) => (
      <h1 className={`font-mono text-lg ${textMain} mb-4 pb-2 border-b ${h1Border}`}>{children}</h1>
    ),
    h2: ({ children }) => <h2 className={`font-mono text-base ${textMain} mt-6 mb-2 font-normal`}>{children}</h2>,
    h3: ({ children }) => <h3 className={`font-mono text-sm ${accent} mt-4 mb-2 font-normal`}>{children}</h3>,
    h4: ({ children }) => (
      <h4 className={`font-mono text-[13px] ${isAcademic ? 'text-ember/80' : 'text-[#8a3a3a]/80'} mt-3 mb-1.5 font-normal`}>{children}</h4>
    ),
  }
}

export function ChatBubble({ msg, theme }: { msg: Message; theme?: BriefingTheme }) {
  if (msg.role === 'system') return null
  const isUser = msg.role === 'user'
  const content = msg.content.trim()
  if (!content) return null

  const isAcademic = theme !== 'newspaper'

  const userBubbleCls = isAcademic
    ? 'bg-ember/20 border border-ember/40 whitespace-pre-wrap'
    : 'bg-[#1a1a1a] text-white whitespace-pre-wrap'

  const assistantBubbleCls = isAcademic
    ? 'bg-ink/65 backdrop-blur-md border border-slate/40'
    : 'bg-white border border-[#1a1a1a]/12'

  return (
    <div data-testid={isUser ? 'user-message' : 'assistant-message'} className={`flex ${isUser ? 'justify-end' : 'justify-start'} my-3`}>
      <div
        className={`max-w-[70%] px-4 py-3 rounded-md leading-relaxed ${isUser ? userBubbleCls : assistantBubbleCls}`}
      >
        {isUser ? (
          content
        ) : (
          <Markdown remarkPlugins={[remarkGfm]} components={makeChatComponents(isAcademic)}>
            {content}
          </Markdown>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/components/ChatBubble.tsx
git commit -m "feat: add theme prop to ChatBubble for newspaper styling"
```

---

### Task 6: Update ChatInput for theme

**Files:**
- Modify: `src/components/ChatInput.tsx`

- [ ] **Step 1: Add `theme` prop and conditional styling**

```tsx
import { useState, KeyboardEvent } from 'react'
import { Button } from '@/components/Button'
import type { BriefingTheme } from '@shared/index'

export function ChatInput({ onSend, disabled, theme }: {
  onSend: (text: string) => void
  disabled?: boolean
  theme?: BriefingTheme
}) {
  const [val, setVal] = useState('')
  const send = () => {
    const t = val.trim()
    if (!t) return
    onSend(t)
    setVal('')
  }
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const isAcademic = theme !== 'newspaper'

  const inputCls = isAcademic
    ? 'bg-ink/60 backdrop-blur-sm border-slate/40 text-parchment placeholder:text-parchment/30 focus:border-ember'
    : 'bg-white border-[#1a1a1a]/15 text-[#1a1a1a] placeholder:text-[#999] focus:border-[#1a1a1a]'

  return (
    <div className="flex gap-3 items-end">
      <textarea data-testid="chat-input" value={val} onChange={e => setVal(e.target.value)} onKeyDown={onKey}
        rows={2} disabled={disabled}
        placeholder="输入..."
        className={`flex-1 border rounded p-3 resize-none font-serif focus:outline-none ${inputCls}`} />
      <Button data-testid="send-button" onClick={send} disabled={disabled} theme={theme}>递出</Button>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/components/ChatInput.tsx
git commit -m "feat: add theme prop to ChatInput for newspaper styling"
```

---

### Task 7: Update Button for theme

**Files:**
- Modify: `src/components/Button.tsx`

- [ ] **Step 1: Add `theme` prop for ghost variant**

```tsx
import { ButtonHTMLAttributes, forwardRef } from 'react'
import type { BriefingTheme } from '@shared/index'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost'
  theme?: BriefingTheme
}

export const Button = forwardRef<HTMLButtonElement, Props>(
  ({ variant = 'primary', theme, className = '', children, ...rest }, ref) => {
    const isNewspaper = theme === 'newspaper'

    if (variant === 'ghost') {
      return (
        <button ref={ref}
          className={`px-4 py-2 transition-colors ${
            isNewspaper
              ? 'text-[#555] hover:text-[#1a1a1a]'
              : 'text-parchment/80 hover:text-parchment'
          } ${className}`}
          {...rest}>
          {children}
        </button>
      )
    }
    return (
      <button ref={ref}
        className={`relative inline-block px-6 py-2 font-sans
                    bg-ember text-ink
                    shadow-[3px_3px_0_0_#3a5a6a]
                    hover:translate-x-[1px] hover:translate-y-[1px]
                    hover:shadow-[2px_2px_0_0_#3a5a6a]
                    active:translate-x-[3px] active:translate-y-[3px]
                    active:shadow-none
                    transition-[transform,box-shadow] duration-100
                    ${className}`}
        {...rest}>
        {children}
      </button>
    )
  }
)
Button.displayName = 'Button'
```

注：primary 按钮保持 ember 配色不变（与简报报纸版式一致，主按钮始终琥珀色）。

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/components/Button.tsx
git commit -m "feat: add theme prop to Button ghost variant"
```

---

### Task 8: Update BackToCover and ExternalMaterialsCard

**Files:**
- Modify: `src/components/BackToCover.tsx`
- Modify: `src/components/ExternalMaterialsCard.tsx`

- [ ] **Step 1: Update BackToCover**

```tsx
import { useStore } from '@/store'

interface Props {
  className?: string
}

export function BackToCover({ className = '' }: Props) {
  const goto = useStore(s => s.goto)
  const theme = useStore((s) => s.briefingTheme)
  const isAcademic = theme !== 'newspaper'

  return (
    <button
      onClick={() => goto('cover')}
      aria-label="返回封面"
      className={`text-2xl leading-none transition-colors px-2 py-1 ${
        isAcademic
          ? 'text-parchment/70 hover:text-parchment'
          : 'text-[#555] hover:text-[#1a1a1a]'
      } ${className}`}
    >
      ←
    </button>
  )
}
```

- [ ] **Step 2: Update ExternalMaterialsCard**

在组件顶部读取 theme：

```tsx
// 在组件内添加：
const theme = useStore((s) => s.briefingTheme)
const isAcademic = theme !== 'newspaper'

// 容器卡片：
const cardCls = isAcademic
  ? 'bg-ink/60 backdrop-blur-md border-slate/30'
  : 'bg-white border-[#1a1a1a]/10'

// 展开按钮 hover：
const headerHoverCls = isAcademic
  ? 'hover:bg-parchment/5'
  : 'hover:bg-[#1a1a1a]/3'

// 标题文字：
const titleCls = isAcademic ? 'text-parchment/90' : 'text-[#1a1a1a]'

// 展开区边框：
const expandedBorderCls = isAcademic ? 'border-slate/20' : 'border-[#1a1a1a]/8'

// 摘要文字：
const summaryCls = isAcademic ? 'text-parchment/90' : 'text-[#1a1a1a]'

// 加载文字：
const loadingCls = isAcademic ? 'text-parchment/50' : 'text-[#777]'

// 错误文字同理
```

将所有对应的硬编码类名替换为变量。

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/components/BackToCover.tsx src/components/ExternalMaterialsCard.tsx
git commit -m "feat: add theme support to BackToCover and ExternalMaterialsCard"
```

---

### Task 9: Update Study.tsx page

**Files:**
- Modify: `src/pages/Study.tsx`

- [ ] **Step 1: Apply theme to Study page**

引入 `StudyControlsGroup`，替换独立的 `SwapPaintingButton`。Header、消息区、输入区、错误/归档横幅全部条件配色。

核心改动点（完整 diff）：

```tsx
// 新增 import
import { StudyControlsGroup } from '@/components/StudyControlsGroup'
import type { BriefingTheme } from '@shared/index'

// 在组件内读取 theme：
const theme = useStore((s) => s.briefingTheme)
const isAcademic = theme !== 'newspaper'

// 页面容器：
const pageCls = isAcademic
  ? 'relative h-full flex flex-col'
  : 'relative h-full flex flex-col bg-[#fafaf8]'

// 退出动画 overlay 不变

// Header：
const headerCls = isAcademic
  ? 'bg-ink/70 backdrop-blur-md border-b border-slate/40'
  : 'bg-white border-b border-[#1a1a1a]/10'

// 退席按钮（用 BackToCover 已处理，或内联条件）：
// 已由 BackToCover 组件内部处理

// 话题标题：
const topicCls = isAcademic ? 'font-serif' : 'font-serif text-[#1a1a1a]'

// 模式信息：
const infoCls = isAcademic
  ? 'text-parchment/60'
  : 'text-[#555]'

// 错误横幅：
const errorBannerCls = isAcademic
  ? 'bg-wine/30 backdrop-blur-md border border-wine'
  : 'bg-red-50 border border-red-200'

// 错误文字：
const errorTextCls = isAcademic ? '' : 'text-[#1a1a1a]'

// 消息列表区背景通过 pageCls 处理

// 思考中容器：
const thinkingCls = isAcademic
  ? 'bg-ink/60 border border-slate/40 text-parchment/50'
  : 'bg-white border border-[#1a1a1a]/10 text-[#777]'

// 归档横幅：
const archiveBannerCls = isAcademic
  ? 'bg-ember/10 border border-ember/40 text-parchment/80'
  : 'bg-amber-50 border border-amber-200 text-[#1a1a1a]'

// 底部输入区：
const inputAreaCls = isAcademic
  ? 'bg-ink/70 backdrop-blur-md border-t border-slate/40'
  : 'bg-white border-t border-[#1a1a1a]/10'

// Header 右侧控件组替换旧的 SwapPaintingButton：
// 旧: <SwapPaintingButton data-testid="swap-painting-button" surface="study" />
// 新: <StudyControlsGroup surface="study" />

// 流式光标
const cursorCls = isAcademic
  ? 'bg-ember/70'
  : 'bg-[#1a1a1a]'

// ChatBubble 传入 theme
<ChatBubble key={i} msg={m} theme={theme} />

// ChatInput 传入 theme
<ChatInput onSend={onSend} theme={theme} />

// StarOrbit 传入 tone
<StarOrbit starCount={3} radius={10} period={2000} tone={isAcademic ? 'night' : 'paper'} />
```

将上述所有变量替换到 JSX 对应位置。

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Run existing tests**

```bash
npx vitest run tests/study-theme.test.tsx 2>/dev/null || echo "no existing test file, expected"
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/Study.tsx
git commit -m "feat: apply theme switching to Study page"
```

---

### Task 10: Update Home.tsx page

**Files:**
- Modify: `src/pages/Home.tsx`

- [ ] **Step 1: Apply theme to Home page**

引入 `StudyControlsGroup`，替换旧的独立 `SwapPaintingButton`。页面容器、卡片、文字全部条件配色。

```tsx
// 新增 import
import { StudyControlsGroup } from '@/components/StudyControlsGroup'

// 读取 theme
const theme = useStore((s) => s.briefingTheme)
const isAcademic = theme !== 'newspaper'

// 页面容器：
const pageCls = isAcademic
  ? 'h-full p-8 relative'
  : 'h-full p-8 relative bg-[#fafaf8]'

// 问候语：
const greetingCls = isAcademic
  ? 'text-parchment/60'
  : 'text-[#555]'

// 未保存会话卡片：
const unsavedCardCls = isAcademic
  ? 'bg-ink/70 backdrop-blur-md border border-slate/40'
  : 'bg-white border border-[#1a1a1a]/12'

// 未保存标题/文字颜色同理...
// 新学习按钮（primary 不变）
// 续谈推荐标签
// Quote 已自动处理
// 学习库标签

// 右上角按钮组替换：
// 旧: <SwapPaintingButton surface="home" className="absolute top-4 right-52 z-10" />
// 新: <StudyControlsGroup surface="home" className="absolute top-4 right-52 z-10" />
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/pages/Home.tsx
git commit -m "feat: apply theme switching to Home page"
```

---

### Task 11: Update Profile, Settings, Extension pages

**Files:**
- Modify: `src/pages/Profile.tsx`
- Modify: `src/pages/Settings.tsx`
- Modify: `src/pages/Extension.tsx`

- [ ] **Step 1: Profile.tsx — 读取 theme + 引入控件组 + 条件配色**

核心模式（两态：查看/编辑）：

```tsx
import { StudyControlsGroup } from '@/components/StudyControlsGroup'

const theme = useStore((s) => s.briefingTheme)
const isAcademic = theme !== 'newspaper'

// 面板容器：
const panelCls = isAcademic
  ? 'bg-ink/72 backdrop-blur-md border border-slate/30'
  : 'bg-white border border-[#1a1a1a]/10'

// 标题分隔线：
const dividerCls = isAcademic ? 'border-slate/25' : 'border-[#1a1a1a]/8'

// 退出/返回按钮：
const backBtnCls = isAcademic
  ? 'text-parchment/70 hover:text-parchment'
  : 'text-[#555] hover:text-[#1a1a1a]'

// 标签文字：
const labelCls = isAcademic ? 'text-parchment/50' : 'text-[#888]'

// 值文字：
const valueCls = isAcademic ? 'text-parchment' : 'text-[#1a1a1a]'
const accentValueCls = isAcademic ? 'text-ember' : 'text-[#8a3a3a]'

// 编辑态输入框：
const inputCls = isAcademic
  ? 'bg-ink/50 border-slate/40'
  : 'bg-white border-[#1a1a1a]/12'

// 难度/温度按钮（未选中）：
const tagCls = isAcademic
  ? 'text-parchment/70 border-slate/40 hover:border-slate/60'
  : 'text-[#555] border-[#1a1a1a]/12 hover:border-[#1a1a1a]/25'

// 右上角替换 SwapPaintingButton 为 StudyControlsGroup
```

应用到查看态和编辑态两处。

- [ ] **Step 2: Settings.tsx — 同上模式**

```tsx
import { StudyControlsGroup } from '@/components/StudyControlsGroup'

const theme = useStore((s) => s.briefingTheme)
const isAcademic = theme !== 'newspaper'

// 面板、标题、配置区卡片、输入框、标签、错误提示、成功提示
// 均按 isAcademic 条件切换
```

- [ ] **Step 3: Extension.tsx — 同上模式**

```tsx
import { StudyControlsGroup } from '@/components/StudyControlsGroup'

const theme = useStore((s) => s.briefingTheme)
const isAcademic = theme !== 'newspaper'

// 面板、侧栏按钮（选中/未选中）、详情卡片、代码块、返回按钮
// 均按 isAcademic 条件切换
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add src/pages/Profile.tsx src/pages/Settings.tsx src/pages/Extension.tsx
git commit -m "feat: apply theme switching to Profile, Settings, Extension pages"
```

---

### Task 12: Write component tests

**Files:**
- Create: `tests/study-controls-group.test.tsx`

- [ ] **Step 1: Write StudyControlsGroup tests**

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useStore } from '@/store'
import { StudyControlsGroup } from '@/components/StudyControlsGroup'

// Mock store
beforeEach(() => {
  useStore.setState({
    briefingTheme: 'academic',
    currentPaintings: {
      home: { url: '/test.jpg', painter: 'Test', title: 'Test' },
      study: { url: '/test.jpg', painter: 'Test', title: 'Test' },
      cover: { url: '/test.jpg', painter: 'Test', title: 'Test' },
      briefing: { url: '/test.jpg', painter: 'Test', title: 'Test' },
    },
  })
})

describe('StudyControlsGroup', () => {
  it('renders both buttons in academic mode', () => {
    render(<StudyControlsGroup surface="home" />)
    expect(screen.getByTestId('study-controls-swap-painting')).toBeInTheDocument()
    expect(screen.getByTestId('study-controls-theme-toggle')).toBeInTheDocument()
  })

  it('hides swap painting button in newspaper mode', () => {
    useStore.setState({ briefingTheme: 'newspaper' })
    render(<StudyControlsGroup surface="home" />)
    expect(screen.queryByTestId('study-controls-swap-painting')).not.toBeInTheDocument()
    expect(screen.getByTestId('study-controls-theme-toggle')).toBeInTheDocument()
  })

  it('toggles theme on button click', async () => {
    const user = userEvent.setup()
    render(<StudyControlsGroup surface="home" />)
    const toggle = screen.getByTestId('study-controls-theme-toggle')
    expect(useStore.getState().briefingTheme).toBe('academic')
    await user.click(toggle)
    expect(useStore.getState().briefingTheme).toBe('newspaper')
    await user.click(toggle)
    expect(useStore.getState().briefingTheme).toBe('academic')
  })

  it('shows correct title on theme toggle button', () => {
    render(<StudyControlsGroup surface="home" />)
    expect(screen.getByTestId('study-controls-theme-toggle')).toHaveAttribute('title', '切换报纸版式')

    useStore.setState({ briefingTheme: 'newspaper' })
    render(<StudyControlsGroup surface="home" />)
    // Re-render picks up new theme
  })
})
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run tests/study-controls-group.test.tsx
```

Expected: 4 tests pass

- [ ] **Step 3: Commit**

```bash
git add tests/study-controls-group.test.tsx
git commit -m "test: add StudyControlsGroup component tests"
```

---

### Task 13: Write page-level theme test

**Files:**
- Create: `tests/study-theme.test.tsx`

- [ ] **Step 1: Write Study page theme rendering test**

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useStore } from '@/store'
import { Study } from '@/pages/Study'

beforeEach(() => {
  useStore.setState({
    briefingTheme: 'academic',
    session: {
      abortId: 'test-session',
      topic: '测试话题',
      mode: 'progress' as const,
      difficulty: 'mid' as const,
      temperature: 0.7,
      history: [
        { role: 'user' as const, content: '什么是先验？' },
        { role: 'assistant' as const, content: '先验指不依赖于经验的知识...' },
      ],
      streaming: false,
      dirName: null,
      archivePending: false,
    },
    currentPaintings: {
      study: { url: '/test.jpg', painter: 'Test', title: 'Test' },
    } as any,
    externalMaterials: null,
  })
})

describe('Study page theme switching', () => {
  it('renders academic theme by default', () => {
    const { container } = render(<Study />)
    expect(screen.getByTestId('study-page')).toBeInTheDocument()
    // SurfaceBackground should be present in academic mode
    expect(screen.getByTestId('surface-background')).toBeInTheDocument()
  })

  it('hides SurfaceBackground in newspaper theme', () => {
    useStore.setState({ briefingTheme: 'newspaper' })
    render(<Study />)
    expect(screen.queryByTestId('surface-background')).not.toBeInTheDocument()
  })

  it('renders theme toggle in header', () => {
    render(<Study />)
    expect(screen.getByTestId('study-controls-theme-toggle')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run tests/study-theme.test.tsx
```

- [ ] **Step 3: Commit**

```bash
git add tests/study-theme.test.tsx
git commit -m "test: add Study page theme switching tests"
```

---

### Task 14: Final verification

- [ ] **Step 1: Run all changed tests**

```bash
npx vitest run tests/study-controls-group.test.tsx tests/study-theme.test.tsx tests/swap-painting-button.test.tsx
```

Expected: all pass

- [ ] **Step 2: Typecheck full project**

```bash
npx tsc --noEmit
```

Expected: no new errors

- [ ] **Step 3: Run affected E2E tests**

```bash
node scripts/e2e-changed.js --run
```

- [ ] **Step 4: Commit final**

```bash
git add -A
git commit -m "feat: complete study pages theme toggle implementation"
```
