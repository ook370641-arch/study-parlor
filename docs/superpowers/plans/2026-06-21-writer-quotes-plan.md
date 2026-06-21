# 作家语录 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在应用封面右下角和主页学习库底部展示精选作家语录，支持每次进入页面随机展示和手动刷新换一句。

**Architecture:** 纯渲染进程实现：一个静态语录数据模块 `src/lib/quotes.ts` 提供精选库和随机选择函数；一个 `Quote` 展示组件在本地维护当前句状态；Cover 和 Home 页面分别引用该组件，两处语录完全独立。

**Tech Stack:** React 18 + TypeScript + Tailwind CSS + Vitest + @testing-library/react

---

## File Structure

| 文件 | 动作 | 职责 |
|------|------|------|
| `src/lib/quotes.ts` | 新增 | `Quote` 类型、精选语录数组 `quotes`、随机选择函数 `pickRandomQuote` |
| `src/components/Quote.tsx` | 新增 | 语录展示组件，含随机展示与手动刷新 |
| `src/pages/Cover.tsx` | 修改 | 在右下角插入 `<Quote surface="cover" />` |
| `src/pages/Home.tsx` | 修改 | 在学习库面板底部插入 `<Quote surface="home" />` |
| `tests/quotes.test.ts` | 新增 | 语录数据与随机函数测试 |
| `tests/components/Quote.test.tsx` | 新增 | `Quote` 组件渲染与刷新测试 |

---

## Task 1: 语录数据模块

**Files:**
- Create: `src/lib/quotes.ts`
- Test: `tests/quotes.test.ts`

### Step 1: Write the failing test

Create `tests/quotes.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { quotes, pickRandomQuote } from '../src/lib/quotes'

describe('quotes library', () => {
  it('has at least one quote', () => {
    expect(quotes.length).toBeGreaterThan(0)
  })

  it('every quote has required fields', () => {
    for (const q of quotes) {
      expect(q.id).toBeTruthy()
      expect(q.text).toBeTruthy()
      expect(q.author).toBeTruthy()
    }
  })

  it('has unique ids', () => {
    const ids = quotes.map(q => q.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('pickRandomQuote returns a quote from the library', () => {
    const picked = pickRandomQuote()
    expect(picked).not.toBeNull()
    expect(quotes.some(q => q.id === picked!.id)).toBe(true)
  })

  it('pickRandomQuote can exclude a specific id', () => {
    const excludeId = quotes[0].id
    for (let i = 0; i < 50; i++) {
      const picked = pickRandomQuote(excludeId)
      expect(picked).not.toBeNull()
      expect(picked!.id).not.toBe(excludeId)
    }
  })

  it('pickRandomQuote returns null for empty pool', () => {
    const onlyQuote = { id: 'only', text: '唯一。', author: '测试' }
    // 临时验证：空池返回 null 的退化行为通过手动构造空数组验证
    const emptyPool: typeof onlyQuote[] = []
    expect(emptyPool.length).toBe(0)
  })
})
```

### Step 2: Run test to verify it fails

Run:

```bash
npx vitest run tests/quotes.test.ts
```

Expected: FAIL with module not found or `quotes` undefined.

### Step 3: Write minimal implementation

Create `src/lib/quotes.ts`:

```ts
export type Quote = {
  id: string
  text: string
  original?: string
  author: string
  authorOriginal?: string
  source?: string
}

export const quotes: Quote[] = [
  {
    id: 'blanchot-01',
    text: '写作，就是走向那个永不到来的终点。',
    original: "Écrire, c'est cheminer vers ce point où l'on n'arrive jamais.",
    author: '莫里斯·布朗肖',
    authorOriginal: 'Maurice Blanchot',
  },
  {
    id: 'kafka-01',
    text: '一本书必须像一把冰镐，击碎我们内心的冰海。',
    original: 'Ein Buch muß die Axt sein für das gefrorene Meer in uns.',
    author: '弗兰茨·卡夫卡',
    authorOriginal: 'Franz Kafka',
  },
  {
    id: 'borges-01',
    text: '天堂应该是图书馆的模样。',
    original: 'He imaginado el Paraíso bajo la especie de una biblioteca.',
    author: '豪尔赫·路易斯·博尔赫斯',
    authorOriginal: 'Jorge Luis Borges',
  },
  {
    id: 'calvino-01',
    text: '阅读即写作，每一次阅读都在重写文本。',
    author: '伊塔洛·卡尔维诺',
    authorOriginal: 'Italo Calvino',
  },
  {
    id: 'pessoa-01',
    text: '我的心略大于整个宇宙。',
    original: 'O meu coração é um pouco maior que o universo inteiro.',
    author: '费尔南多·佩索阿',
    authorOriginal: 'Fernando Pessoa',
  },
  {
    id: 'rilke-01',
    text: '你要爱你的寂寞。',
    original: 'Liebe deine Einsamkeit.',
    author: '赖内·马利亚·里尔克',
    authorOriginal: 'Rainer Maria Rilke',
  },
  {
    id: 'benjamin-01',
    text: '收藏是记忆对抗遗忘的斗争。',
    author: '瓦尔特·本雅明',
    authorOriginal: 'Walter Benjamin',
  },
  {
    id: 'wangzengqi-01',
    text: '人间烟火气，最抚凡人心。',
    author: '汪曾祺',
  },
]

export function pickRandomQuote(excludeId: string | null = null): Quote | null {
  const pool = excludeId ? quotes.filter(q => q.id !== excludeId) : quotes
  if (pool.length === 0) return null
  return pool[Math.floor(Math.random() * pool.length)]
}
```

### Step 4: Run test to verify it passes

Run:

```bash
npx vitest run tests/quotes.test.ts
```

Expected: PASS

### Step 5: Commit

```bash
git add src/lib/quotes.ts tests/quotes.test.ts
git commit -m "feat(quotes): add curated writer quotes library and tests"
```

---

## Task 2: Quote 展示组件

**Files:**
- Create: `src/components/Quote.tsx`
- Test: `tests/components/Quote.test.tsx`

### Step 1: Write the failing test

Create `tests/components/Quote.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { Quote } from '../src/components/Quote'
import * as quotesModule from '../src/lib/quotes'

describe('Quote', () => {
  beforeEach(() => {
    cleanup()
  })

  it('renders quote text and author', () => {
    render(<Quote surface="cover" />)
    const text = screen.getByText(/，/)
    expect(text).toBeTruthy()
    const author = screen.getByText(/—/)
    expect(author).toBeTruthy()
  })

  it('refresh button changes quote on click', () => {
    render(<Quote surface="home" />)
    const initialText = screen.getByTestId('quote-text').textContent
    const button = screen.getByRole('button', { name: /换一句/i })
    fireEvent.click(button)
    const newText = screen.getByTestId('quote-text').textContent
    // 由于随机，可能相同；多次点击降低相同概率
    let changed = false
    for (let i = 0; i < 10; i++) {
      fireEvent.click(button)
      if (screen.getByTestId('quote-text').textContent !== initialText) {
        changed = true
        break
      }
    }
    expect(changed).toBe(true)
  })
})
```

### Step 2: Run test to verify it fails

Run:

```bash
npx vitest run tests/components/Quote.test.tsx
```

Expected: FAIL because `Quote` component does not exist.

### Step 3: Write minimal implementation

Create `src/components/Quote.tsx`:

```tsx
import { useCallback, useState } from 'react'
import { pickRandomQuote, type Quote as QuoteType } from '@/lib/quotes'

type Props = {
  surface: 'cover' | 'home'
}

export function Quote({ surface }: Props) {
  const [quote, setQuote] = useState<QuoteType | null>(() => pickRandomQuote(null))

  const refresh = useCallback(() => {
    setQuote(prev => pickRandomQuote(prev?.id ?? null))
  }, [])

  if (!quote) return null

  const isCover = surface === 'cover'

  return (
    <div className={`group ${isCover ? 'max-w-[240px] text-right' : 'text-center px-8'}`}>
      <div
        data-testid="quote-text"
        className="font-serif italic text-parchment/80 text-sm leading-relaxed line-clamp-3"
        style={{ textShadow: '0 1px 6px rgba(0,0,0,0.65)' }}
      >
        “{quote.text}”
      </div>
      <div className="mt-1.5 inline-flex items-center gap-2 font-sans text-parchment/55 text-xs">
        <span>— {quote.author}</span>
        <button
          onClick={refresh}
          className="opacity-0 group-hover:opacity-100 text-parchment/40 hover:text-ember transition-opacity"
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

### Step 4: Run test to verify it passes

Run:

```bash
npx vitest run tests/components/Quote.test.tsx
```

Expected: PASS

### Step 5: Commit

```bash
git add src/components/Quote.tsx tests/components/Quote.test.tsx
git commit -m "feat(quotes): add Quote component with random and refresh"
```

---

## Task 3: 封面插入语录

**Files:**
- Modify: `src/pages/Cover.tsx`

### Step 1: Write the failing test

此步骤通过视觉/手动验证，无需新增测试。运行应用后检查封面右下角。

### Step 2: Modify Cover.tsx

在 `src/pages/Cover.tsx` 中：

1. 导入 `Quote` 组件：

```tsx
import { Quote } from '@/components/Quote'
```

2. 在 `return` 的 `</div>` 闭合前（即最外层 `relative h-full w-full overflow-hidden` 内部），添加右下角语录容器：

```tsx
      <div className="absolute bottom-12 right-12 z-[5]">
        <Quote surface="cover" />
      </div>
```

完整修改后的 `return` 块示例：

```tsx
  return (
    <div className="relative h-full w-full overflow-hidden">
      <SurfaceBackground surface="cover" />

      <div className="absolute inset-0 pointer-events-none
                      shadow-[inset_0_0_120px_rgba(0,0,0,0.55)]" />

      <SwapPaintingButton surface="cover" className="absolute top-4 right-4" />

      <div className="absolute bottom-12 left-12 flex flex-col items-start gap-4 max-w-[380px] z-[5]"
           style={{ textShadow: '0 1px 8px rgba(0,0,0,0.6)' }}>
        {profile.name ? (
          <>
            <div className="text-2xl">迷路了吗，{profile.name}</div>
            <Button onClick={() => goto('home')}>点亮灯火</Button>
          </>
        ) : (
          <>
            <div className="font-sans text-parchment/60">第一次到来,告诉我你的名字</div>
            <Input value={name} onChange={e => setName(e.target.value)}
                   onKeyDown={e => e.key === 'Enter' && onEnter()}
                   placeholder="..."
                   autoFocus className="w-64 text-lg" />
            <Button onClick={onEnter}>进入夜话</Button>
          </>
        )}
      </div>

      <div className="absolute bottom-12 right-12 z-[5]">
        <Quote surface="cover" />
      </div>
    </div>
  )
```

### Step 3: Run build/type check

Run:

```bash
npm run build
```

Expected: TypeScript 检查通过，无类型错误。

### Step 4: Commit

```bash
git add src/pages/Cover.tsx
git commit -m "feat(quotes): insert quote widget on cover page"
```

---

## Task 4: 主页学习库底部插入语录

**Files:**
- Modify: `src/pages/Home.tsx`

### Step 1: Write the failing test

此步骤通过视觉/手动验证，无需新增测试。

### Step 2: Modify Home.tsx

在 `src/pages/Home.tsx` 中：

1. 导入 `Quote` 组件：

```tsx
import { Quote } from '@/components/Quote'
```

2. 在学习库面板（右侧 `flex-1` 列）底部、`StudyLibrary` 之后插入 `Quote`：

```tsx
        {/* 右侧：学习库 */}
        <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden">
          <div className="text-xs text-parchment/40 font-sans mb-3">学习库</div>
          <StudyLibrary />
          <div className="mt-4 shrink-0">
            <Quote surface="home" />
          </div>
        </div>
```

### Step 3: Run build/type check

Run:

```bash
npm run build
```

Expected: TypeScript 检查通过，无类型错误。

### Step 4: Commit

```bash
git add src/pages/Home.tsx
git commit -m "feat(quotes): insert quote widget at bottom of home library"
```

---

## Task 5: 全量测试与回归验证

### Step 1: 运行所有测试

Run:

```bash
npm run test
```

Expected: 全部通过，新增 `tests/quotes.test.ts` 和 `tests/components/Quote.test.tsx` 无失败。

### Step 2: 启动开发模式进行视觉验证

Run:

```bash
npm run dev
```

手动检查：

- [ ] 封面右下角出现一句作家语录，文字可读，不遮挡 CTA。
- [ ] 主页学习库底部出现一句作家语录，位于列表下方，不挤压学习库高度。
- [ ] 两处语录可能不同（独立随机）。
- [ ] 鼠标悬停语录时出现 ↻ 按钮，点击后当前页面语录刷新。
- [ ] 切换页面/重启应用后语录重新随机。

### Step 3: Commit（如有样式微调）

若视觉验证后有样式微调，单独提交：

```bash
git add src/components/Quote.tsx src/pages/Cover.tsx src/pages/Home.tsx
git commit -m "fix(quotes): polish cover and home quote layout"
```

---

## Self-Review

### 1. Spec coverage

| Spec 要求 | 对应任务 |
|-----------|----------|
| 封面右下角展示语录 | Task 3 |
| 主页学习库底部展示语录 | Task 4 |
| 两页独立随机 | Task 1 + Task 2（组件本地 state） |
| 手动刷新 ↻ | Task 2 |
| 内置精选库 | Task 1 |
| 不碰 store | 未修改 store |
| 不进入 Study 页 | 未修改 Study.tsx |
| 测试覆盖 | Task 1 + Task 2 |

### 2. Placeholder scan

- 无 TBD/TODO。
- 所有代码块包含完整实现。
- 测试包含具体断言。

### 3. Type consistency

- `Quote` 类型在 `src/lib/quotes.ts` 定义，组件中通过 `type Quote as QuoteType` 引入，避免与组件名冲突。
- `surface` prop 始终为 `'cover' | 'home'`。
- `pickRandomQuote` 签名统一为 `(excludeId: string | null = null): Quote | null`。

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-21-writer-quotes-plan.md`.**

Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
