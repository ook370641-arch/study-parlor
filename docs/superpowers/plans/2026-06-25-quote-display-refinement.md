# Quote 展示精细化实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重构 `Quote` 组件，在 Cover、Home、Study 三处以更大字号完整展示中文译文、原文、作者、出处。

**Architecture:** 保持 `Quote` 组件自包含，通过 `surface` prop 区分三处对齐与最大宽度；`quotes.ts` 类型与样本池不变；Study 页在聊天消息列表顶部插入 `Quote`。

**Tech Stack:** React 18 + TypeScript + Tailwind CSS 3.4 + Vitest + Testing Library

---

## 文件清单

| 文件 | 动作 | 说明 |
|------|------|------|
| `src/components/Quote.tsx` | 重写 | 新排版、三 surface 变体、刷新按钮 |
| `src/pages/Study.tsx` | 修改 | 聊天区顶部插入 Quote |
| `tests/components/Quote.test.tsx` | 重写 | 覆盖完整/最小语录、三 surface、刷新 |
| `tests/quotes.test.ts` | 可选修改 | 校验可选字段类型 |

## 前置检查

确保当前在 `fix/critical-warning-issues` 分支（或用户指定的功能分支），并且：

```bash
npm run test
```

通过后再开始修改。

---

### Task 1: 重写 `Quote.tsx`

**Files:**
- Modify: `src/components/Quote.tsx`
- Test: `tests/components/Quote.test.tsx`

#### Step 1: 写新组件的测试

修改 `tests/components/Quote.test.tsx`：

```tsx
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { Quote } from '@/components/Quote'
import * as quotesModule from '@/lib/quotes'

describe('Quote', () => {
  beforeEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  const fullQuote = {
    id: 'test-01',
    text: '测试中文句子。',
    original: 'Test original sentence.',
    author: '测试作者',
    source: '《测试出处》',
  }

  const minimalQuote = {
    id: 'test-02',
    text: '只有中文和作者。',
    author: '作者乙',
  }

  it('renders full quote on cover surface', () => {
    vi.spyOn(quotesModule, 'pickRandomQuote').mockReturnValue(fullQuote)
    render(<Quote surface="cover" />)

    expect(screen.getByTestId('quote-text').textContent).toBe('“测试中文句子。”')
    expect(screen.getByTestId('quote-original').textContent).toBe('Test original sentence.')

    const meta = screen.getByTestId('quote-meta')
    expect(meta.textContent).toContain('测试作者')
    expect(meta.textContent).toContain('《测试出处》')
  })

  it('renders minimal quote without original or source', () => {
    vi.spyOn(quotesModule, 'pickRandomQuote').mockReturnValue(minimalQuote)
    render(<Quote surface="home" />)

    expect(screen.getByTestId('quote-text').textContent).toBe('“只有中文和作者。”')
    expect(screen.queryByTestId('quote-original')).toBeNull()

    const meta = screen.getByTestId('quote-meta')
    expect(meta.textContent).toContain('作者乙')
    expect(meta.textContent).not.toContain('·')
  })

  it('renders all three surfaces without error', () => {
    vi.spyOn(quotesModule, 'pickRandomQuote').mockReturnValue(fullQuote)
    const { rerender } = render(<Quote surface="cover" />)
    expect(screen.getByTestId('quote-text')).toBeTruthy()

    rerender(<Quote surface="home" />)
    expect(screen.getByTestId('quote-text')).toBeTruthy()

    rerender(<Quote surface="study" />)
    expect(screen.getByTestId('quote-text')).toBeTruthy()
  })

  it('refresh button changes quote on click', () => {
    vi.spyOn(quotesModule, 'pickRandomQuote')
      .mockReturnValueOnce(fullQuote)
      .mockReturnValueOnce(minimalQuote)

    render(<Quote surface="home" />)
    const initialText = screen.getByTestId('quote-text').textContent
    const button = screen.getByRole('button', { name: /换一句/i })
    fireEvent.click(button)
    const newText = screen.getByTestId('quote-text').textContent

    expect(newText).not.toBe(initialText)
  })
})
```

#### Step 2: 运行测试，确认失败

```bash
npx vitest run tests/components/Quote.test.tsx
```

Expected: FAIL，因为新 testid 和 `surface="study"` 还不存在。

#### Step 3: 实现 `Quote.tsx`

替换 `src/components/Quote.tsx` 为：

```tsx
import { useCallback, useState } from 'react'
import { pickRandomQuote, type Quote as QuoteType } from '@/lib/quotes'

type Props = {
  surface: 'cover' | 'home' | 'study'
}

export function Quote({ surface }: Props) {
  const [quote, setQuote] = useState<QuoteType | null>(() =>
    pickRandomQuote({ excludeId: null })
  )

  const refresh = useCallback(() => {
    setQuote(prev => pickRandomQuote({ excludeId: prev?.id ?? null }) ?? prev)
  }, [])

  if (!quote) return null

  const isCover = surface === 'cover'

  return (
    <div
      className={`group ${
        isCover
          ? 'max-w-[420px] text-right'
          : 'max-w-3xl mx-auto text-center'
      }`}
    >
      <div
        data-testid="quote-text"
        className="font-serif text-[26px] leading-relaxed text-parchment line-clamp-3"
        style={{ textShadow: '0 1px 8px rgba(0,0,0,0.75)' }}
      >
        “{quote.text}”
      </div>

      {quote.original && (
        <div
          data-testid="quote-original"
          className="mt-2 font-serif italic text-sm leading-relaxed text-parchment/60 line-clamp-2"
          style={{ textShadow: '0 1px 6px rgba(0,0,0,0.65)' }}
        >
          {quote.original}
        </div>
      )}

      <div className="mt-3 inline-flex items-center gap-2 font-sans text-sm text-parchment/80">
        <span data-testid="quote-meta">
          — {quote.author}
          {quote.source && (
            <>
              <span className="mx-1.5 text-parchment/40">·</span>
              {quote.source}
            </>
          )}
        </span>
        <button
          onClick={refresh}
          className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-parchment/40 hover:text-ember transition-opacity"
          aria-label="换一句"
          title="换一句"
        >
          ↻
        </button>
      </div>
    </div>
  )
}
```

#### Step 4: 运行测试，确认通过

```bash
npx vitest run tests/components/Quote.test.tsx
```

Expected: PASS。

#### Step 5: 提交

```bash
git add src/components/Quote.tsx tests/components/Quote.test.tsx
git commit -m "feat(quote): redesign Quote with bilingual text, source, and study surface"
```

---

### Task 2: 在 Study 页顶部插入 Quote

**Files:**
- Modify: `src/pages/Study.tsx`

#### Step 1: 修改 `Study.tsx`

在 `src/pages/Study.tsx` 顶部引入 `Quote`：

```tsx
import { Quote } from '@/components/Quote'
```

在聊天消息列表内部、首条消息之前插入：

```tsx
<div data-testid="message-list" ref={scrollRef} className="relative z-[5] flex-1 overflow-y-auto px-8 py-4 max-w-4xl w-full mx-auto">
  <div className="mb-6">
    <Quote surface="study" />
  </div>
  {session.history.map((m, i) => <ChatBubble key={i} msg={m} />)}
  ...
</div>
```

即把以下代码块：

```tsx
<div data-testid="message-list" ref={scrollRef} className="relative z-[5] flex-1 overflow-y-auto px-8 py-4 max-w-4xl w-full mx-auto">
  {session.history.map((m, i) => <ChatBubble key={i} msg={m} />)}
```

替换为：

```tsx
<div data-testid="message-list" ref={scrollRef} className="relative z-[5] flex-1 overflow-y-auto px-8 py-4 max-w-4xl w-full mx-auto">
  <div className="mb-6">
    <Quote surface="study" />
  </div>
  {session.history.map((m, i) => <ChatBubble key={i} msg={m} />)}
```

#### Step 2: 验证 TypeScript 编译

```bash
npx tsc --noEmit
```

Expected: 无错误。

#### Step 3: 提交

```bash
git add src/pages/Study.tsx
git commit -m "feat(study): add Quote to top of chat message list"
```

---

### Task 3: 运行全量测试与构建

#### Step 1: 运行测试

```bash
npm run test
```

Expected: 全部通过。

#### Step 2: 运行生产构建

```bash
npm run build
```

Expected: 无 TypeScript / electron-vite 构建错误。

#### Step 3: 手动验证（可选但推荐）

```bash
npm run dev
```

检查：

- [ ] Cover 右下角 Quote 中文 26px、原文与作者/出处可见、hover 出现刷新按钮。
- [ ] Home 底部 Quote 居中对齐。
- [ ] Study 聊天区顶部 Quote 居中对齐。
- [ ] 缺少 `original` 或 `source` 的语录不显示对应行。

#### Step 4: 提交

```bash
git commit --allow-empty -m "chore: verify quote display refinement"
```

---

## Self-Review Checklist

- [ ] Spec 中所有要求都有对应任务：三 surface、字号、双语/出处、刷新、截断。
- [ ] 没有 TBD / TODO / "适当处理" 等占位符。
- [ ] `Quote` 的 `surface` prop 与 Tailwind 类名在实现和测试中一致。
- [ ] `Study.tsx` 修改不破坏现有消息滚动与自动滚动逻辑。
- [ ] 测试覆盖完整语录、最小语录、三 surface、刷新行为。

## 执行方式

Plan saved to `docs/superpowers/plans/2026-06-25-quote-display-refinement.md`.

**请选择执行方式：**

1. **Subagent-Driven（推荐）** — 每个 Task 派一个独立子代理，我逐条 review。
2. **Inline Execution** — 在当前会话按顺序执行，每个 Task 完成后 checkpoint。
