# 画作背景 (Rothko + Billout) 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Pictures/ 下 ~240 张 Rothko + Billout 画作变成 Cover/Home/Study 三个界面的全屏背景,带启动时随机抽取 + 手动 ↻ 换图 + hover 显示画作署名。

**Architecture:** Path B (Vite 静态目录)——一个 Vite 插件在开发时挂载 `/paintings/` 路由 + 在打包时复制 Pictures 到 `out/renderer/`,同时生成 manifest JSON。主进程零改动。渲染端两个新组件 (`SurfaceBackground` + `SwapPaintingButton`) + Zustand store 三个新字段。

**Tech Stack:** Vite 插件 (CommonJS) + React 18 + TypeScript + Tailwind + Zustand + Vitest

**Spec:** [docs/superpowers/specs/2026-05-11-art-backgrounds-design.md](../specs/2026-05-11-art-backgrounds-design.md)

---

## Phase 1:基础设施 (Vite 插件 + manifest)

### Task 1:写 Vite 插件主体

**Files:**
- Create: `scripts/vite-paintings-plugin.cjs`

写一个 CommonJS Vite 插件。它做三件事:
1. 在 dev 模式启动时生成 manifest 文件
2. 在 dev 模式提供 `/paintings/...` 路由(静态文件服务)
3. 在 build 模式生成 manifest + 复制 Pictures 到 `out/renderer/paintings/`

- [ ] **Step 1:创建文件 `scripts/vite-paintings-plugin.cjs`,粘贴以下完整内容**

```js
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')

const PROJECT_ROOT = path.resolve(__dirname, '..')
const PICTURES_DIR = path.join(PROJECT_ROOT, 'Pictures')
const MANIFEST_OUT = path.join(PROJECT_ROOT, 'src/assets/painting-manifest.json')
const OUTPUT_PAINTINGS_DIR = path.join(PROJECT_ROOT, 'out/renderer/paintings')

const PAINTERS = [
  { name: 'Mark Rothko', dir: 'Mark Rothko', prefix: 'rothko' },
  { name: 'Guy Billout', dir: 'Guy Billout', prefix: 'billout' },
]

const SUBDIR_CATEGORIES = new Set([
  'fine-art', 'early-figurative', 'surrealist', 'transitional',
])

function buildManifest() {
  const all = []
  for (const p of PAINTERS) {
    const indexPath = path.join(PICTURES_DIR, p.dir, 'index.json')
    if (!fs.existsSync(indexPath)) continue
    let items
    try {
      items = JSON.parse(fs.readFileSync(indexPath, 'utf-8'))
    } catch (err) {
      console.warn(`[paintings] failed to parse ${indexPath}: ${err.message}`)
      continue
    }
    for (const item of items) {
      if (!item.file) continue
      const subDir = item.category && SUBDIR_CATEGORIES.has(item.category)
        ? item.category + '/'
        : ''
      const relSegments = [p.dir, ...(subDir ? [subDir.replace(/\/$/, '')] : []), item.file]
      const absPath = path.join(PICTURES_DIR, ...relSegments)
      if (!fs.existsSync(absPath)) continue
      const slug = item.slug || item.file
      const yearMatch = slug.match(/\b(19|20)\d{2}\b/)
      const year = yearMatch ? parseInt(yearMatch[0]) : undefined
      const url = 'paintings/' + relSegments.map(encodeURIComponent).join('/')
      all.push({
        id: `${p.prefix}-${item.n}`,
        painter: p.name,
        title: item.title,
        ...(year ? { year } : {}),
        url,
        ...(item.category ? { category: item.category } : {}),
      })
    }
  }
  return all
}

function writeManifest() {
  const manifest = buildManifest()
  fs.mkdirSync(path.dirname(MANIFEST_OUT), { recursive: true })
  fs.writeFileSync(MANIFEST_OUT, JSON.stringify(manifest, null, 2))
  return manifest.length
}

async function copyDir(src, dest) {
  await fsp.mkdir(dest, { recursive: true })
  for (const entry of await fsp.readdir(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name)
    const d = path.join(dest, entry.name)
    if (entry.isDirectory()) await copyDir(s, d)
    else if (entry.isFile()) await fsp.copyFile(s, d)
  }
}

module.exports = function vitePaintingsPlugin() {
  return {
    name: 'study-parlor-paintings',

    configureServer(server) {
      const count = writeManifest()
      console.log(`[paintings] dev manifest generated: ${count} paintings`)

      server.middlewares.use('/paintings', (req, res, next) => {
        const urlPath = decodeURIComponent(req.url.split('?')[0].replace(/^\/+/, ''))
        const filePath = path.join(PICTURES_DIR, urlPath)
        if (!filePath.startsWith(PICTURES_DIR + path.sep) && filePath !== PICTURES_DIR) {
          res.statusCode = 403
          res.end()
          return
        }
        if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
          return next()
        }
        const ext = path.extname(filePath).toLowerCase()
        const mime = {
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.png': 'image/png',
          '.webp': 'image/webp',
        }[ext] || 'application/octet-stream'
        res.setHeader('Content-Type', mime)
        res.setHeader('Cache-Control', 'public, max-age=3600')
        fs.createReadStream(filePath).pipe(res)
      })
    },

    buildStart() {
      const count = writeManifest()
      console.log(`[paintings] build manifest generated: ${count} paintings`)
    },

    async closeBundle() {
      if (!fs.existsSync(PICTURES_DIR)) {
        console.warn(`[paintings] Pictures dir not found, skip copy: ${PICTURES_DIR}`)
        return
      }
      console.log(`[paintings] copying Pictures → ${OUTPUT_PAINTINGS_DIR}`)
      await copyDir(PICTURES_DIR, OUTPUT_PAINTINGS_DIR)
      console.log(`[paintings] copy complete`)
    },
  }
}

module.exports.buildManifest = buildManifest
module.exports.writeManifest = writeManifest
```

- [ ] **Step 2:验证文件存在**

Run: `ls -la scripts/vite-paintings-plugin.cjs`
Expected: 文件存在,大小 > 2KB

### Task 2:写 manifest CLI 包装(给 pretest 用)

**Files:**
- Create: `scripts/build-manifest.cjs`

- [ ] **Step 1:创建文件 `scripts/build-manifest.cjs`,内容如下**

```js
const { writeManifest } = require('./vite-paintings-plugin.cjs')
const count = writeManifest()
console.log(`[manifest] generated ${count} paintings`)
```

- [ ] **Step 2:跑一次验证**

Run: `node scripts/build-manifest.cjs`
Expected:
- 输出 `[manifest] generated N paintings`(N 应该在 240 左右)
- 生成 `src/assets/painting-manifest.json` 文件

- [ ] **Step 3:用 grep 验证 manifest 内容合理**

Run: `head -c 300 src/assets/painting-manifest.json`
Expected: 看到 JSON 数组,每个对象有 `id`、`painter`、`title`、`url` 字段

### Task 3:把插件接入 electron.vite.config.ts

**Files:**
- Modify: `electron.vite.config.ts`

- [ ] **Step 1:在文件顶部 import 区域追加导入**

打开 `electron.vite.config.ts`,在 `import path from 'node:path'` 之后新加一行:

```ts
import paintingsPlugin from './scripts/vite-paintings-plugin.cjs'
```

- [ ] **Step 2:在 `renderer.plugins` 数组追加插件调用**

找到这一段:

```ts
    renderer: {
      root: '.',
      build: { ... },
      plugins: [react()],
```

把 `plugins: [react()]` 改成:

```ts
      plugins: [react(), paintingsPlugin()],
```

- [ ] **Step 3:启动 dev 验证**

Run: `npm run dev`
Expected:
- 终端看到 `[paintings] dev manifest generated: N paintings`
- 应用正常启动(暂时还没有画作背景,这是后面 Task 的事)

- [ ] **Step 4:在浏览器测试 URL 服务**

浏览器或 curl 访问 `http://localhost:5173/paintings/Mark%20Rothko/100-purple-brown.jpg`
Expected: 返回 jpg 图片(浏览器里能看见,或 curl 看到 jpeg 二进制头)

(开发服务器端口可能不是 5173,看 dev 终端输出)

- [ ] **Step 5:停止 dev**

Ctrl+C 关掉 dev 服务

### Task 4:更新 .gitignore + package.json

**Files:**
- Modify: `.gitignore`
- Modify: `package.json`

- [ ] **Step 1:在 `.gitignore` 末尾追加一行**

```
src/assets/painting-manifest.json
```

- [ ] **Step 2:在 `package.json` 的 `scripts` 块添加 `pretest`**

把 `scripts` 块改成:

```json
  "scripts": {
    "dev": "node scripts/dev.js dev",
    "build": "node scripts/dev.js build",
    "preview": "node scripts/dev.js preview",
    "pretest": "node scripts/build-manifest.cjs",
    "test": "vitest run",
    "test:watch": "vitest",
    "package": "electron-vite build && electron-builder --win --config electron-builder.yml"
  },
```

- [ ] **Step 3:Commit Phase 1**

```bash
git add scripts/vite-paintings-plugin.cjs scripts/build-manifest.cjs electron.vite.config.ts .gitignore package.json
git commit -m "feat(art): vite plugin for paintings manifest + dev/build serving"
```

---

## Phase 2:Painting 类型 + paintings.ts (TDD)

### Task 5:添加 Painting 类型

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1:在 `src/types/index.ts` 末尾(在 `declare global` 之前)追加**

```ts
export type Painting = {
  id: string
  painter: 'Mark Rothko' | 'Guy Billout'
  title: string
  year?: number
  url: string
  category?: string
}
```

- [ ] **Step 2:验证 TypeScript 不报错**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 无错误(可能有现存的不相关的 warning,不要紧)

### Task 6:写 paintings.ts 测试 (TDD red)

**Files:**
- Create: `tests/paintings.test.ts`

- [ ] **Step 1:创建测试文件 `tests/paintings.test.ts`,内容**

```ts
import { describe, it, expect } from 'vitest'
import { pickRandom, formatAttribution } from '@/lib/paintings'
import type { Painting } from '@shared/index'

const sample: Painting[] = [
  { id: 'rothko-1', painter: 'Mark Rothko', title: 'Purple Brown', year: 1957, url: 'paintings/a.jpg' },
  { id: 'rothko-2', painter: 'Mark Rothko', title: 'Untitled', url: 'paintings/b.jpg' },
  { id: 'billout-1', painter: 'Guy Billout', title: 'Moon', url: 'paintings/c.jpg' },
]

describe('pickRandom', () => {
  it('returns null for an empty pool', () => {
    expect(pickRandom([], null)).toBeNull()
  })

  it('returns the only painting when pool has one', () => {
    const one = [sample[0]]
    expect(pickRandom(one, null)).toBe(sample[0])
  })

  it('returns a painting from the pool when no exclusion', () => {
    const picked = pickRandom(sample, null)
    expect(picked).not.toBeNull()
    expect(sample).toContain(picked!)
  })

  it('never returns the excluded painting (1000 trials)', () => {
    for (let i = 0; i < 1000; i++) {
      const picked = pickRandom(sample, 'rothko-1')
      expect(picked!.id).not.toBe('rothko-1')
    }
  })

  it('returns null if pool only contains the excluded id', () => {
    expect(pickRandom([sample[0]], 'rothko-1')).toBeNull()
  })
})

describe('formatAttribution', () => {
  it('includes painter, title, and year when year exists', () => {
    expect(formatAttribution(sample[0])).toBe('Mark Rothko · Purple Brown · 1957')
  })

  it('omits year when year is undefined', () => {
    expect(formatAttribution(sample[1])).toBe('Mark Rothko · Untitled')
  })

  it('handles Billout paintings', () => {
    expect(formatAttribution(sample[2])).toBe('Guy Billout · Moon')
  })
})
```

- [ ] **Step 2:跑测试,确认 fail**

Run: `npm test -- paintings`
Expected: 报错 `Cannot find module '@/lib/paintings'`(因为还没实现)

### Task 7:实现 paintings.ts (TDD green)

**Files:**
- Create: `src/lib/paintings.ts`

- [ ] **Step 1:创建 `src/lib/paintings.ts`**

```ts
import manifestData from '@/assets/painting-manifest.json'
import type { Painting } from '@shared/index'

export const manifest: Painting[] = manifestData as Painting[]

export function pickRandom(pool: Painting[], excludeId: string | null): Painting | null {
  const filtered = excludeId ? pool.filter(p => p.id !== excludeId) : pool
  if (filtered.length === 0) return null
  return filtered[Math.floor(Math.random() * filtered.length)]
}

export function formatAttribution(p: Painting): string {
  const parts: string[] = [p.painter, p.title]
  if (typeof p.year === 'number') parts.push(String(p.year))
  return parts.join(' · ')
}
```

- [ ] **Step 2:跑测试,确认 pass**

Run: `npm test -- paintings`
Expected: 全部 7 个测试 pass

- [ ] **Step 3:Commit Phase 2**

```bash
git add src/types/index.ts src/lib/paintings.ts tests/paintings.test.ts
git commit -m "feat(art): Painting type + pickRandom/formatAttribution with tests"
```

---

## Phase 3:Zustand store 集成

### Task 8:添加 store 字段与方法

**Files:**
- Modify: `src/store/index.ts`

- [ ] **Step 1:在 `src/store/index.ts` 顶部 import 区域追加**

找到 `import { ipc } from '@/lib/ipc'`,在它后面新加:

```ts
import { manifest, pickRandom } from '@/lib/paintings'
import type { Painting } from '@shared/index'
```

注意:`Painting` 已经在 `@shared/index` 里(Task 5 已加),但本文件之前的 import 列表可能没列。Modify 现有的 import 那一行加进去——或单独写一行也行。

- [ ] **Step 2:在 `AppStore` 类型定义里追加字段**

找到 `// 临时` 注释下方的区域,在 `groupInspirations: Record<string, NewTopic>` 之后追加:

```ts
  // 画作背景
  currentPaintings: {
    cover: Painting | null
    home: Painting | null
    study: Painting | null
  }
```

- [ ] **Step 3:在 AppStore 的 `// 操作` 区域追加两个方法签名**

找到 `init: () => Promise<void>` 那一行,在它之后追加:

```ts
  initPaintings: () => void
  swapPainting: (surface: 'cover' | 'home' | 'study') => void
```

- [ ] **Step 4:在 store 初始值里追加 `currentPaintings`**

找到 `toast: null,` 这一行,在它之后追加:

```ts
  currentPaintings: { cover: null, home: null, study: null },
```

- [ ] **Step 5:在 `init: async () => {` 函数体末尾、`set({...})` 之后追加调用**

找到现有 init 函数的 `set({ profile: ..., groupMapping: groupsData.mapping })`,在 `})` 之后追加:

```ts
    get().initPaintings()
```

完整的 init 应该长这样:

```ts
  init: async () => {
    const [state, library, unsaved, groupsData] = await Promise.all([
      ipc.getState(), ipc.scanLibrary(), ipc.loadSessions(), ipc.loadGroups()
    ])
    set({
      profile: state.profile,
      lastUsed: state.lastUsed,
      inspirations: state.suggested_new_topics?.topics ?? [],
      groupInspirations: state.groupInspirations ?? {},
      session_count: state.ui?.session_count ?? 0,
      library,
      unsavedSessions: unsaved,
      groups: groupsData.groups,
      groupMapping: groupsData.mapping
    })
    get().initPaintings()
  },
```

- [ ] **Step 6:在 init 之后追加 initPaintings + swapPainting 实现**

找到 `init: async () => { ... },` 那个块结束之后,追加:

```ts
  initPaintings: () => {
    set({
      currentPaintings: {
        cover: pickRandom(manifest, null),
        home: pickRandom(manifest, null),
        study: pickRandom(manifest, null),
      }
    })
  },

  swapPainting: (surface) => {
    const current = get().currentPaintings[surface]
    const next = pickRandom(manifest, current?.id ?? null)
    if (!next) return
    set(state => ({
      currentPaintings: { ...state.currentPaintings, [surface]: next }
    }))
  },
```

- [ ] **Step 7:验证 TypeScript 编译**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 无错误

- [ ] **Step 8:启动 dev 验证 store 工作**

Run: `npm run dev`
打开 DevTools console,输入:

```js
useStore.getState().currentPaintings
```

Expected: 看到 `{ cover: {...}, home: {...}, study: {...} }`,三个对象各有 id/painter/title/url

注意:`useStore` 可能不是 window 全局。如果 console 找不到,在 App.tsx 临时加一行 `;(window as any).useStore = useStore` 验证后删掉。或者直接进入应用使用 React DevTools 看 store。

- [ ] **Step 9:停止 dev,Commit Phase 3**

```bash
git add src/store/index.ts
git commit -m "feat(art): store fields for current paintings + init/swap"
```

---

## Phase 4:全局样式

### Task 9:添加画作相关 CSS

**Files:**
- Modify: `src/styles/globals.css`

- [ ] **Step 1:在 `globals.css` 文件末尾(`body { @apply bg-ink ... }` 那行之前)追加**

```css
/* ===== 画作背景 ===== */

@keyframes paintingFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes paintingFadeOut {
  from { opacity: 1; }
  to { opacity: 0; }
}
.painting-fade-in { animation: paintingFadeIn 600ms ease-out forwards; }
.painting-fade-out { animation: paintingFadeOut 600ms ease-out forwards; }

.painting-vignette {
  background:
    linear-gradient(to right,
      rgba(15, 10, 8, 0.55) 0%,
      rgba(15, 10, 8, 0.08) 28%,
      rgba(15, 10, 8, 0.08) 72%,
      rgba(15, 10, 8, 0.55) 100%),
    linear-gradient(to bottom,
      rgba(15, 10, 8, 0.55) 0%,
      rgba(15, 10, 8, 0.05) 18%,
      rgba(15, 10, 8, 0.05) 80%,
      rgba(15, 10, 8, 0.55) 100%),
    radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,0.4) 100%);
  pointer-events: none;
}

.swap-btn {
  width: 36px;
  height: 36px;
  background: rgba(15, 10, 8, 0.55);
  border: 1px solid rgba(232, 213, 183, 0.3);
  border-radius: 9999px;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(6px);
  color: rgba(232, 213, 183, 0.85);
  transition: background-color 250ms ease, border-color 250ms ease, color 250ms ease;
  cursor: pointer;
  z-index: 11;
}
.swap-btn:hover {
  background: rgba(217, 119, 87, 0.85);
  border-color: #d97757;
  color: #0f0a08;
}

@media (prefers-reduced-motion: reduce) {
  .painting-fade-in,
  .painting-fade-out {
    animation: none;
  }
  .swap-btn svg {
    transition: none !important;
  }
}
```

- [ ] **Step 2:确认现有 `@media (prefers-reduced-motion)` 没有冲突**

打开 globals.css 检查,你应该看到两个 `@media (prefers-reduced-motion: reduce)` 块。这是允许的(规则会合并)。不需要合并它们。

(不 commit,跟 Phase 5 一起提交)

---

## Phase 5:通用组件 (SurfaceBackground + SwapPaintingButton)

### Task 10:写 SurfaceBackground 组件

**Files:**
- Create: `src/components/SurfaceBackground.tsx`

- [ ] **Step 1:创建文件 `src/components/SurfaceBackground.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { useStore } from '@/store'

interface Props {
  surface: 'cover' | 'home' | 'study'
}

export function SurfaceBackground({ surface }: Props) {
  const painting = useStore(s => s.currentPaintings[surface])
  const [currentUrl, setCurrentUrl] = useState<string | null>(painting?.url ?? null)
  const [prevUrl, setPrevUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!painting) return
    if (painting.url === currentUrl) return
    setPrevUrl(currentUrl)
    setCurrentUrl(painting.url)
    const t = setTimeout(() => setPrevUrl(null), 700)
    return () => clearTimeout(t)
  }, [painting?.url])

  if (!painting || !currentUrl) return null

  return (
    <div className="absolute inset-0 z-0 pointer-events-none">
      {prevUrl && (
        <img
          src={prevUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover painting-fade-out"
        />
      )}
      <img
        key={currentUrl}
        src={currentUrl}
        alt=""
        className="absolute inset-0 w-full h-full object-cover painting-fade-in"
      />
      <div className="absolute inset-0 painting-vignette" />
    </div>
  )
}
```

- [ ] **Step 2:TypeScript 检查**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 无错误

### Task 11:写 SwapPaintingButton 组件

**Files:**
- Create: `src/components/SwapPaintingButton.tsx`

- [ ] **Step 1:创建文件 `src/components/SwapPaintingButton.tsx`**

```tsx
import { useStore } from '@/store'
import { formatAttribution } from '@/lib/paintings'

interface Props {
  surface: 'cover' | 'home' | 'study'
  className?: string
}

export function SwapPaintingButton({ surface, className = '' }: Props) {
  const painting = useStore(s => s.currentPaintings[surface])
  const swap = useStore(s => s.swapPainting)
  const tooltip = painting ? formatAttribution(painting) : ''

  return (
    <button
      type="button"
      onClick={() => swap(surface)}
      title={tooltip}
      className={`swap-btn group ${className}`}
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
  )
}
```

- [ ] **Step 2:TypeScript 检查**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: 无错误

- [ ] **Step 3:Commit Phase 4 + 5**

```bash
git add src/styles/globals.css src/components/SurfaceBackground.tsx src/components/SwapPaintingButton.tsx
git commit -m "feat(art): SurfaceBackground + SwapPaintingButton components + globals.css"
```

---

## Phase 6:Cover 界面集成

### Task 12:把 Cover.tsx 改为使用画作池

**Files:**
- Modify: `src/pages/Cover.tsx`

- [ ] **Step 1:把整个 `src/pages/Cover.tsx` 替换为:**

```tsx
import { useState } from 'react'
import { useStore } from '@/store'
import { Input } from '@/components/Input'
import { Button } from '@/components/Button'
import { SurfaceBackground } from '@/components/SurfaceBackground'
import { SwapPaintingButton } from '@/components/SwapPaintingButton'

export function Cover() {
  const profile = useStore(s => s.profile)
  const patchProfile = useStore(s => s.patchProfile)
  const goto = useStore(s => s.goto)
  const [name, setName] = useState('')

  const onEnter = async () => {
    const n = name.trim()
    if (!n) return
    await patchProfile({ name: n })
    goto('home')
  }

  return (
    <div className="relative h-full w-full overflow-hidden">
      <SurfaceBackground surface="cover" />

      <div className="absolute inset-0 pointer-events-none
                      shadow-[inset_0_0_120px_rgba(0,0,0,0.55)]" />

      <SwapPaintingButton surface="cover" className="absolute top-4 right-4" />

      <div className="absolute bottom-12 left-12 flex flex-col items-start gap-4 max-w-[380px] z-5"
           style={{ textShadow: '0 1px 8px rgba(0,0,0,0.6)' }}>
        {profile.name ? (
          <>
            <div className="text-2xl">夜深了,{profile.name}。</div>
            <Button onClick={() => goto('home')}>开始学习</Button>
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
    </div>
  )
}
```

主要变化:
- 删了 `import coverImg from '@/assets/cover-library.png'`
- 删了 `<img ... />` 那一行
- 删了 `bg-gradient-to-tr from-ink/85 via-ink/30 to-transparent` div
- 加了 `<SurfaceBackground surface="cover" />`
- 加了 `<SwapPaintingButton surface="cover" className="absolute top-4 right-4" />`
- 给左下区域加 `z-5` 和 inline textShadow,确保字稳

- [ ] **Step 2:dev 验证**

Run: `npm run dev`
Expected:
- 应用启动后 Cover 上能看到一张随机画作
- 右上有圆形 ↻ 按钮,点击换图,有淡入淡出
- hover ↻ 看 tooltip 显示画作名
- 左下问候/按钮文字可读

- [ ] **Step 3:停止 dev,Commit**

```bash
git add src/pages/Cover.tsx
git commit -m "feat(art): Cover uses painting pool + swap button"
```

---

## Phase 7:Home 界面集成

### Task 13:Home.tsx 加背景 + 换图按钮

**Files:**
- Modify: `src/pages/Home.tsx`

- [ ] **Step 1:在 `src/pages/Home.tsx` 顶部 import 区域追加**

找到 `import { ipc } from '@/lib/ipc'`,在它后面追加两行:

```tsx
import { SurfaceBackground } from '@/components/SurfaceBackground'
import { SwapPaintingButton } from '@/components/SwapPaintingButton'
```

- [ ] **Step 2:在 Home 组件的根 div 内部最顶部插入 SurfaceBackground + SwapPaintingButton**

找到 `return ( <div className="h-full overflow-y-auto p-8 relative">`。在它的开始 tag 之后、`<Button variant="ghost" onClick={() => goto('profile')} ...>` 之前,插入:

```tsx
      <SurfaceBackground surface="home" />
      <SwapPaintingButton surface="home" className="absolute top-4 right-20" />
```

- [ ] **Step 3:确保下面的内容在画作之上**

找到 `<div className="text-center text-parchment/60 font-sans text-sm mb-8">`(那行欢迎语)。把它和它的兄弟 div 都包在一个 `relative z-5` 的容器里。

具体改法:把这一段:

```tsx
      <Button variant="ghost"
        onClick={() => goto('profile')}
        className="absolute top-4 right-4 font-sans text-sm">
        档案
      </Button>

      <div className="text-center text-parchment/60 font-sans text-sm mb-8">
        晚安,{profile.name}
      </div>

      <div className="flex gap-6 max-w-6xl mx-auto">
        {/* 左侧:新学习模块 */}
```

改为(把 max-w-6xl 那个 div 加上 `relative z-5`,greeting 也加上):

```tsx
      <Button variant="ghost"
        onClick={() => goto('profile')}
        className="absolute top-4 right-4 font-sans text-sm z-10">
        档案
      </Button>

      <div className="relative z-5 text-center text-parchment/60 font-sans text-sm mb-8">
        晚安,{profile.name}
      </div>

      <div className="relative z-5 flex gap-6 max-w-6xl mx-auto">
        {/* 左侧:新学习模块 */}
```

注意 SwapPaintingButton 自带 z-11(在 .swap-btn 类里),所以它会浮在档案按钮之上。

- [ ] **Step 4:dev 验证**

Run: `npm run dev`
Expected:
- 进入 Home 后能看到画作背景
- 顶部右侧有 ↻(浮在画上) + 档案(右边缘)
- 点 ↻ 换图,主页画作切换(独立于 Cover 的画作)
- hover ↻ 看 tooltip

注意:面板可能还有点透明度不对(下一个 Task 修),但功能应该没问题。

- [ ] **Step 5:停止 dev**

### Task 14:把 Home 上的面板改成"玻璃盒"

**Files:**
- Modify: `src/pages/Home.tsx`(unsaved-panel)
- Modify: `src/components/GroupRecCard.tsx`
- Modify: `src/components/StudyLibrary.tsx`(TopicAccordion 部分)

- [ ] **Step 1:Home.tsx 的 unsaved 提示面板加 backdrop-blur**

找到 Home.tsx 里这一行:

```tsx
            <div className="panel p-4">
```

把它改成:

```tsx
            <div className="bg-ink/70 backdrop-blur-md border border-slate/40 rounded-md p-4">
```

(把 `.panel` 工具类替换成显式的,因为我们要 backdrop-blur)

- [ ] **Step 2:GroupRecCard.tsx 加 backdrop-blur**

打开 `src/components/GroupRecCard.tsx`。找到 loading 状态的 wrapper:

```tsx
      <div className="bg-ink/40 border border-slate/30 rounded py-3 px-4">
```

替换为:

```tsx
      <div className="bg-ink/70 backdrop-blur-md border border-slate/40 rounded py-3 px-4">
```

找到 error 状态的 button:

```tsx
        className="block w-full text-left bg-ink/40 border border-slate/30 rounded py-3 px-4 hover:border-ember/40 transition-colors"
```

替换为:

```tsx
        className="block w-full text-left bg-ink/70 backdrop-blur-md border border-slate/40 rounded py-3 px-4 hover:border-ember/50 transition-colors"
```

找到主推荐卡 div:

```tsx
      className="relative bg-ink/40 border border-slate/30 rounded overflow-hidden hover:border-ember/50 hover:bg-ink/60 transition-all cursor-pointer group"
```

替换为:

```tsx
      className="relative bg-ink/70 backdrop-blur-md border border-slate/40 rounded overflow-hidden hover:border-ember/60 hover:bg-ink/80 transition-all cursor-pointer group"
```

- [ ] **Step 3:StudyLibrary.tsx TopicAccordion 加 backdrop-blur**

打开 `src/components/StudyLibrary.tsx`。找到 TopicAccordion 的最外层 div:

```tsx
    <div className="border border-slate/30 rounded overflow-hidden">
```

替换为:

```tsx
    <div className="bg-ink/70 backdrop-blur-md border border-slate/40 rounded overflow-hidden">
```

然后找到 accordion 头部点击区域:

```tsx
        className="w-full flex items-center gap-3 px-4 py-3 bg-ink/40 hover:bg-ink/60 transition-colors cursor-pointer select-none"
```

替换为:

```tsx
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-ink/30 transition-colors cursor-pointer select-none"
```

(因为外层已经是 bg-ink/70 了,内层只在 hover 时加深一点)

再找展开区:

```tsx
      <div className={`bg-ink/20 overflow-hidden transition-all duration-300 ease-out ${open ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0'}`}>
```

替换为:

```tsx
      <div className={`bg-ink/30 overflow-hidden transition-all duration-300 ease-out ${open ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0'}`}>
```

- [ ] **Step 4:dev 验证**

Run: `npm run dev`
Expected:
- 进 Home,所有面板有玻璃感(画作隐约透过)
- 推荐卡 hover 时变化合理
- 主题列表展开/收起仍正常工作

- [ ] **Step 5:停止 dev,Commit**

```bash
git add src/pages/Home.tsx src/components/GroupRecCard.tsx src/components/StudyLibrary.tsx
git commit -m "feat(art): Home with painting background + glass panels"
```

---

## Phase 8:Study 界面集成

### Task 15:Study.tsx 加背景 + header 内换图按钮

**Files:**
- Modify: `src/pages/Study.tsx`

- [ ] **Step 1:在 `src/pages/Study.tsx` 顶部 import 区域追加**

找到 `import { StarOrbit } from '@/components/StarOrbit'`,在它后面追加:

```tsx
import { SurfaceBackground } from '@/components/SurfaceBackground'
import { SwapPaintingButton } from '@/components/SwapPaintingButton'
```

- [ ] **Step 2:在 main wrapper 内插入 SurfaceBackground**

找到这一行:

```tsx
      <div className={`h-full flex flex-col ${isExiting ? 'study-exit' : ''}`}>
```

改成(加 `relative`,因为 SurfaceBackground 用 absolute):

```tsx
      <div className={`relative h-full flex flex-col ${isExiting ? 'study-exit' : ''}`}>
        <SurfaceBackground surface="study" />
```

- [ ] **Step 3:给 header 加玻璃盒样式 + 加 ↻**

找到 header 那一段:

```tsx
      <header className="flex justify-between items-center px-8 py-4 border-b border-slate/30">
        <button
          onClick={onBack}
          aria-label="返回"
          className="text-2xl leading-none text-parchment/70 hover:text-parchment transition-colors px-2 py-1">
          ←
        </button>
        <div className="font-serif">{session.topic}</div>
        <div className="font-sans text-sm text-parchment/60">
          {session.mode === 'progress' ? '推进' : '检测'} ·
          {session.difficulty === 'high' ? '高' : session.difficulty === 'mid' ? '中' : '低'} ·
          T={session.temperature}
        </div>
      </header>
```

替换为:

```tsx
      <header className="relative z-5 flex justify-between items-center px-8 py-4 bg-ink/70 backdrop-blur-md border-b border-slate/40">
        <button
          onClick={onBack}
          aria-label="返回"
          className="text-2xl leading-none text-parchment/70 hover:text-parchment transition-colors px-2 py-1">
          ←
        </button>
        <div className="font-serif">{session.topic}</div>
        <div className="flex items-center gap-3">
          <SwapPaintingButton surface="study" />
          <div className="font-sans text-sm text-parchment/60">
            {session.mode === 'progress' ? '推进' : '检测'} ·
            {session.difficulty === 'high' ? '高' : session.difficulty === 'mid' ? '中' : '低'} ·
            T={session.temperature}
          </div>
        </div>
      </header>
```

(↻ 在 session-meta 左边,header 整体变成玻璃盒)

- [ ] **Step 4:给 scroll 区和 input 区加 z-5**

找到 scroll 区:

```tsx
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-8 py-4 max-w-4xl w-full mx-auto">
```

改为:

```tsx
      <div ref={scrollRef} className="relative z-5 flex-1 overflow-y-auto px-8 py-4 max-w-4xl w-full mx-auto">
```

找到 input 区:

```tsx
      <div className="px-8 py-4 border-t border-slate/30 max-w-4xl w-full mx-auto">
```

改为(加玻璃盒,但 max-w 要去掉因为 backdrop-blur 需要在全宽生效——把宽度限制放到 ChatInput 自己处理):

```tsx
      <div className="relative z-5 bg-ink/70 backdrop-blur-md border-t border-slate/40">
        <div className="px-8 py-4 max-w-4xl w-full mx-auto">
```

然后在 `<ChatInput onSend={onSend} />` 之后多加一个 `</div>` 闭合外层 wrapper。

实际改完应该长这样:

```tsx
      <div className="relative z-5 bg-ink/70 backdrop-blur-md border-t border-slate/40">
        <div className="px-8 py-4 max-w-4xl w-full mx-auto">
          <ChatInput onSend={onSend} />
        </div>
      </div>
```

- [ ] **Step 5:archivePending 提示区也加 z-5**

找到这段(archive 提示):

```tsx
      {session.archivePending && !session.streaming && (
        <div className="px-8 max-w-4xl w-full mx-auto">
```

改为:

```tsx
      {session.archivePending && !session.streaming && (
        <div className="relative z-5 px-8 max-w-4xl w-full mx-auto">
```

- [ ] **Step 6:streamError 区也加 z-5**

找到:

```tsx
      {streamError && (
        <div className="bg-wine/30 border border-wine px-4 py-2 text-sm font-sans">
```

改为:

```tsx
      {streamError && (
        <div className="relative z-5 bg-wine/30 backdrop-blur-md border border-wine px-4 py-2 text-sm font-sans">
```

### Task 16:Study 子组件玻璃化 (ChatBubble + ChatInput)

**Files:**
- Modify: `src/components/ChatBubble.tsx`
- Modify: `src/components/ChatInput.tsx`

- [ ] **Step 1:ChatBubble.tsx AI 气泡加 backdrop-blur**

打开 `src/components/ChatBubble.tsx`。找到这一段:

```tsx
      <div className={`max-w-[70%] px-4 py-3 rounded-md whitespace-pre-wrap leading-relaxed
        ${isUser
          ? 'bg-ember/20 border border-ember/40'
          : 'bg-ink/60 border border-slate/40'}`}>
```

替换为:

```tsx
      <div className={`max-w-[70%] px-4 py-3 rounded-md whitespace-pre-wrap leading-relaxed
        ${isUser
          ? 'bg-ember/20 border border-ember/40'
          : 'bg-ink/65 backdrop-blur-md border border-slate/40'}`}>
```

(只改 AI 气泡——user 气泡的 ember 色已经足够清晰)

- [ ] **Step 2:ChatInput.tsx textarea 加 backdrop-blur**

打开 `src/components/ChatInput.tsx`。找到:

```tsx
        className="flex-1 bg-ink/40 border border-slate/40 rounded p-3
                   text-parchment placeholder:text-parchment/30
                   focus:outline-none focus:border-ember resize-none
                   font-serif" />
```

替换为:

```tsx
        className="flex-1 bg-ink/60 backdrop-blur-sm border border-slate/40 rounded p-3
                   text-parchment placeholder:text-parchment/30
                   focus:outline-none focus:border-ember resize-none
                   font-serif" />
```

- [ ] **Step 3:dev 验证**

Run: `npm run dev`
Expected:
- 进入 Study 看到画作背景
- header 是玻璃盒(画作隐约从底下透出)
- ↻ 在 session-meta 左边,点击换图
- chat 气泡:用户的(右侧)依旧 ember,AI 的(左侧)有 backdrop-blur 玻璃感
- input 区是玻璃盒,textarea 有 backdrop-blur
- ESC 退出 + 星点飞散 + studyExit 动画仍然正常

- [ ] **Step 4:停止 dev,Commit**

```bash
git add src/pages/Study.tsx src/components/ChatBubble.tsx src/components/ChatInput.tsx
git commit -m "feat(art): Study with painting background + glass header/bubbles/input"
```

---

## Phase 9:构建 + 打包验证

### Task 17:验证构建

**Files:**
- 无修改,只是跑命令

- [ ] **Step 1:跑构建**

Run: `npm run build`
Expected:
- 终端最后看到 `[paintings] build manifest generated: N paintings`
- 紧接着 `[paintings] copying Pictures → ...out/renderer/paintings`
- `[paintings] copy complete`
- 整个构建无错误

- [ ] **Step 2:确认 out/renderer/paintings 存在且有内容**

Run: `ls "out/renderer/paintings/Mark Rothko/" | head -5`
Expected: 看到 jpg 文件列表

- [ ] **Step 3:确认 manifest 在 dev 模式后还能用**

Run: `cat src/assets/painting-manifest.json | head -c 500`
Expected: 看到 JSON 数组

### Task 18:打包验证

- [ ] **Step 1:打包 Windows nsis**

Run: `npm run package`
Expected: 没有报错,`release/` 目录里出现 `学者夜话-X.X.X-x64.exe`

- [ ] **Step 2:打开 release/win-unpacked/resources 看看 Pictures 在不在**

Run: `ls "release/win-unpacked/resources/app/out/renderer/paintings/" 2>/dev/null | head -3 || echo "PATH_DIFFERS"`

如果输出 `PATH_DIFFERS`,试试:

Run: `find release -name "100-purple-brown.jpg" 2>/dev/null`

确认这张测试画在打包产物里某处。

Expected: 至少能找到一张已知存在的画作文件,路径在 release/ 之内。

- [ ] **Step 3:运行打包后的 exe(手动)**

打开文件管理器,双击 `release/学者夜话-0.1.0-x64.exe`,完成安装。
启动应用。
Expected:
- 启动后 Cover 看到画作
- 进入 Home 看到画作
- 开始一次学习,Study 也看到画作
- 三个界面都能 ↻ 换图

- [ ] **Step 4:不需要 commit,因为 Phase 9 只是验证**

如果上述每一步都通过,实施完成。

---

## 完成检查清单

- [ ] Phase 1:`npm run dev` 输出 `[paintings] dev manifest generated: N paintings`,浏览器能访问 `/paintings/Mark%20Rothko/100-purple-brown.jpg`
- [ ] Phase 2:`npm test -- paintings` 全部 7 个 pass
- [ ] Phase 3:DevTools console `useStore.getState().currentPaintings` 三个 surface 各有一张画
- [ ] Phase 5:Cover 上能看到 ↻ 按钮 + 画作 + tooltip
- [ ] Phase 7:Home 上画作 + 玻璃面板正常
- [ ] Phase 8:Study 上画作 + header 内 ↻ + 玻璃气泡 + 玻璃 input
- [ ] Phase 9:`npm run build` 输出 copy paintings 日志;打包后启动 exe 三个界面都能看到画
- [ ] git log 看到 8 个左右 commit,信息清晰

---

## 不在本实施范围

- 寓言 / 归档报告 / 空状态界面的 Billout 专属配图 — 另一个独立工作
- 智能筛选 / 主题相关推荐 / 用户偏好学习 — 永久全池随机
- Pictures 增删后的自动 reload — 目前需要重启 dev
- 自动换图(运行中) — 已确认不做
