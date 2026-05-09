# 学者夜话(Study Parlor)v1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把已批准的 [设计文档](../specs/2026-05-03-study-parlor-design.md) 落成一个可运行的本地 Electron 单用户学习应用 — 推进 / 检测双 mode,Kimi For Coding 流式对话,.md frontmatter + state.json 持久化,Disco Elysium 视觉。

**Architecture:** 主进程独占 I/O(文件系统、Kimi API、state.json),通过 `contextBridge` 暴露受限 IPC 给 React 渲染进程。Renderer 用 Zustand 单 store + 4 个 page 组件。LLM SSE 在主进程消费,逐 chunk 通过 `webContents.send('llm:chunk', ...)` 推到 renderer。无数据库,文件 + JSON 即真相源。

**Tech Stack:**
- Electron 30.x + electron-vite(主+渲染合一构建)
- React 18 + TypeScript 5
- Vite 5 + Tailwind 3 + shadcn/ui 风格(自写,无运行时依赖)
- Zustand 4(单 store)
- gray-matter(.md frontmatter 解析)
- Vitest(纯逻辑单元测试)
- electron-builder(后期打包,v1 不强制)

**Test Strategy:** 纯逻辑(prompt 装配、推荐算法、frontmatter、state.json 备份)严格 TDD。React 组件以人工目视 + 关键交互的 RTL smoke test 为主。LLM client 用 mock fetch 测协议正确性。

---

## File Structure

```
study-parlor/                              # 项目根 = 当前工作目录
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── electron.vite.config.ts                # electron-vite 配置
├── tailwind.config.ts
├── postcss.config.cjs
├── index.html                             # renderer 入口
├── .env.example                           # 模板,真值不入库
├── .gitignore
├── vitest.config.ts
│
├── electron/                              # 主进程源码
│   ├── main.ts                            # BrowserWindow + 启动 8 步
│   ├── preload.ts                         # contextBridge.exposeInMainWorld
│   ├── env.ts                             # .env 加载 + 校验
│   ├── ipc/
│   │   ├── index.ts                       # 注册全部 ipcMain.handle
│   │   ├── files.ts                       # 库扫描 / 读 / 写 .md
│   │   ├── state.ts                       # state.json 读写
│   │   └── llm.ts                         # Kimi API + 流式
│   ├── lib/
│   │   ├── frontmatter.ts                 # gray-matter wrapper
│   │   ├── prompts.ts                     # 系统 prompt 装配链
│   │   ├── recommend.ts                   # frontmatter 推荐算法
│   │   ├── archive.ts                     # 推进/检测归档逻辑
│   │   └── safe-json.ts                   # state.json + .bak
│   └── prompts/                           # 静态 prompt 模板
│       ├── learner-base.md                # 来自全局 /learner skill
│       ├── mode-review.md
│       ├── difficulty-mid.md
│       ├── difficulty-low.md
│       ├── inspiration.md                 # 灵感主题生成模板
│       ├── archive-progress.md            # 推进归档模板
│       └── archive-review.md              # 检测归档模板
│
├── src/                                   # 渲染进程源码
│   ├── main.tsx                           # React 挂载
│   ├── App.tsx                            # 路由 + Toast 容器
│   ├── pages/
│   │   ├── Cover.tsx
│   │   ├── Home.tsx
│   │   ├── Study.tsx
│   │   └── Profile.tsx
│   ├── components/
│   │   ├── Button.tsx                     # 双层错位 ②
│   │   ├── Input.tsx                      # focus 展开 ②
│   │   ├── PreStudyModal.tsx
│   │   ├── RecCard.tsx
│   │   ├── InspirationChip.tsx
│   │   ├── FileLibrary.tsx
│   │   ├── ChatBubble.tsx
│   │   ├── ChatInput.tsx
│   │   └── Toast.tsx
│   ├── store/
│   │   └── index.ts                       # Zustand store
│   ├── lib/
│   │   └── ipc.ts                         # 类型化 window.api 包装
│   ├── types/
│   │   └── index.ts                       # 跨进程共享类型
│   └── styles/
│       └── globals.css                    # tailwind directives + tokens
│
├── tests/                                 # vitest 单元测试
│   ├── frontmatter.test.ts
│   ├── prompts.test.ts
│   ├── recommend.test.ts
│   ├── safe-json.test.ts
│   ├── archive.test.ts
│   └── llm.test.ts
│
└── docs/superpowers/
    ├── specs/2026-05-03-study-parlor-design.md
    └── plans/2026-05-03-study-parlor.md   # 本文件
```

---

## Phase 索引

| Phase | 任务范围 | Tasks |
|---|---|---|
| **A 基础设施** | 脚手架 / 类型 / 环境 | 1–3 |
| **B 纯逻辑(TDD)** | frontmatter / state.json / prompts / 推荐 / 归档辅助 | 4–8 |
| **C LLM 与 IPC** | Kimi 客户端 / 灵感 + 归档 / learner-base / IPC 主桥 | 9–12 |
| **D 渲染骨架** | store + ipc facade / 全局样式 / 通用 Button + Input | 13–15 |
| **E 页面与会话** | Cover / Home + 推荐 / PreStudy / Study 骨架 / 流式中断 / 归档 / Profile | 16–22 |
| **F 启动与错误** | 8 步启动 + fatal 阻断 / 7 类错误矩阵 | 23–24 |
| **G 收尾** | 视觉收尾 / 端到端走查 / (可选)打包 | 25–27 |

---

## Task 1: 项目脚手架与依赖

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `electron.vite.config.ts`, `tailwind.config.ts`, `postcss.config.cjs`, `index.html`, `.gitignore`, `.env.example`, `vitest.config.ts`
- Create: `electron/main.ts`(最小窗口)
- Create: `src/main.tsx`(Hello world)
- Create: `src/styles/globals.css`

- [ ] **Step 1: 初始化 git 仓库**

```bash
git init
git config user.name "Study Parlor"
git config user.email "noreply@local"
```

- [ ] **Step 2: 写 `package.json`**

```json
{
  "name": "study-parlor",
  "version": "0.1.0",
  "private": true,
  "main": "out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "dotenv": "^16.4.5",
    "gray-matter": "^4.0.3",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "zustand": "^4.5.5"
  },
  "devDependencies": {
    "@types/node": "^20.14.10",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.19",
    "electron": "^30.5.1",
    "electron-vite": "^2.3.0",
    "postcss": "^8.4.40",
    "tailwindcss": "^3.4.7",
    "typescript": "^5.5.4",
    "vite": "^5.4.1",
    "vitest": "^2.0.5"
  }
}
```

- [ ] **Step 3: 写 `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@shared/*": ["src/types/*"],
      "@electron/*": ["electron/*"]
    }
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

- [ ] **Step 4: 写 `tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "Node",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "out"
  },
  "include": ["electron/**/*", "tests/**/*", "*.config.ts"]
}
```

- [ ] **Step 5: 写 `electron.vite.config.ts`**

```ts
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  main: {
    build: {
      rollupOptions: { input: 'electron/main.ts' },
      outDir: 'out/main'
    }
  },
  preload: {
    build: {
      rollupOptions: { input: 'electron/preload.ts' },
      outDir: 'out/preload'
    }
  },
  renderer: {
    root: '.',
    build: {
      rollupOptions: { input: 'index.html' },
      outDir: 'out/renderer'
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        '@shared': path.resolve(__dirname, 'src/types'),
        '@electron': path.resolve(__dirname, 'electron')
      }
    }
  }
})
```

- [ ] **Step 6: 写 `tailwind.config.ts` + `postcss.config.cjs`**

`tailwind.config.ts`:

```ts
import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Disco Elysium 暗色仪式感
        ink:    '#2a1f1a',  // 深褐 主背景
        parchment: '#e8d5b7',  // 米色 主文字
        ember:  '#d97757',  // 暖橙 强调 / CTA
        slate:  '#3a5a6a',  // 蓝灰 次要 / 阴影偏移
        wine:   '#8a3a3a'   // 深红 警告 / 关键状态
      },
      fontFamily: {
        serif: ['"Source Han Serif SC"', 'Georgia', 'serif'],
        sans:  ['"Source Han Sans SC"', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: []
} satisfies Config
```

`postcss.config.cjs`:

```js
module.exports = {
  plugins: { tailwindcss: {}, autoprefixer: {} }
}
```

- [ ] **Step 7: 写 `index.html` + `src/styles/globals.css` + `src/main.tsx`**

`index.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <title>学者夜话</title>
  </head>
  <body class="bg-ink text-parchment font-serif">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/styles/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html, body, #root { height: 100%; }
```

`src/main.tsx`:

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles/globals.css'

function App() {
  return <div className="p-8 text-2xl">学者夜话 — 启动占位</div>
}

ReactDOM.createRoot(document.getElementById('root')!).render(<App />)
```

- [ ] **Step 8: 写 `electron/main.ts`(最小窗口)**

```ts
import { app, BrowserWindow } from 'electron'
import path from 'node:path'

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#2a1f1a',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => app.quit())
```

- [ ] **Step 9: 写 `electron/preload.ts`(空 stub,后续 Task 13 填充)**

```ts
// 占位,后续在 Task 13 通过 contextBridge 暴露 window.api
export {}
```

- [ ] **Step 10: 写 `.gitignore` 和 `.env.example`**

`.gitignore`:

```
node_modules/
out/
dist/
.env
~/.studyparlor/
*.log
.DS_Store
```

`.env.example`:

```
KIMI_API_KEY=sk-kimi-replace-me
KIMI_BASE_URL=https://api.kimi.com/coding/v1
KIMI_MODEL=kimi-k2.6
STUDY_LIBRARY_PATH=c:\Users\86468\Desktop\工作与学习\学习
```

- [ ] **Step 11: 写 `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts']
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@electron': path.resolve(__dirname, 'electron')
    }
  }
})
```

- [ ] **Step 12: 安装依赖并跑一次 dev**

```bash
npm install
npm run dev
```

Expected: 一个 1280x800 暗褐色窗口,中间显示"学者夜话 — 启动占位"。

- [ ] **Step 13: 提交**

```bash
git add .
git commit -m "chore: bootstrap electron-vite + react + tailwind skeleton"
```

---

## Task 2: 共享类型

**Files:**
- Create: `src/types/index.ts`

- [ ] **Step 1: 写完整的共享类型**

```ts
// src/types/index.ts
export type Difficulty = 'high' | 'mid' | 'low'
export type Mode = 'progress' | 'review'
export type Temperature = 0.3 | 0.7 | 1.0

export type Profile = {
  name: string
  profile_text: string
  preferred_topics: string[]
}

export type Frontmatter = {
  title: string
  created: string                 // ISO 8601
  last_studied?: string
  last_reviewed?: string
  review_count: number
  difficulty: Difficulty
  tags: string[]
}

export type FileMeta = Frontmatter & { file_path: string }

export type RecCard = {
  type: 'continue' | 'review'
  file_path: string
  title: string
}

export type NewTopic = { topic: string; hook: string }

export type Message = { role: 'system' | 'user' | 'assistant'; content: string }

export type StateJson = {
  version: 1
  profile: Profile
  lastUsed: { difficulty: Difficulty; temperature: Temperature }
  recommendation_cache: { generated_at?: string; left?: RecCard; right?: RecCard }
  suggested_new_topics: { generated_at: string; topics: NewTopic[] } | null
  ui: { session_count: number }
}

export type IpcApi = {
  // files
  scanLibrary: () => Promise<FileMeta[]>
  readMd: (path: string) => Promise<{ frontmatter: Frontmatter; body: string }>
  writeProgressMd: (args: { title: string; body: string; difficulty: Difficulty }) => Promise<{ file_path: string }>
  appendReviewRecord: (args: { file_path: string; summary: string }) => Promise<void>
  // state
  getState: () => Promise<StateJson>
  patchState: (patch: Partial<StateJson>) => Promise<void>
  // llm
  llmProbe: () => Promise<{ ok: boolean; reason?: string }>
  llmStart: (args: { messages: Message[]; temperature: number; sessionId: string }) => Promise<void>
  llmAbort: (sessionId: string) => Promise<void>
  llmInspirations: (args: { profile: Profile; existingTitles: string[] }) => Promise<NewTopic[]>
  llmFinalizeProgress: (history: Message[]) => Promise<{ title: string; body: string }>
  llmFinalizeReview: (args: { history: Message[]; existingBody: string }) => Promise<string>
  // events (renderer subscribes)
  onLlmChunk: (cb: (sessionId: string, text: string) => void) => () => void
  onLlmDone: (cb: (sessionId: string) => void) => () => void
  onLlmError: (cb: (sessionId: string, err: { code: string; message: string }) => void) => () => void
}

declare global {
  interface Window {
    api: IpcApi
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add src/types/index.ts
git commit -m "feat(types): shared IPC + domain types"
```

---

## Task 3: 环境加载与校验

**Files:**
- Create: `electron/env.ts`
- Test: `tests/env.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// tests/env.test.ts
import { describe, expect, it } from 'vitest'
import { loadEnv } from '@electron/env'

describe('loadEnv', () => {
  it('throws when KIMI_API_KEY is missing', () => {
    expect(() => loadEnv({})).toThrow(/KIMI_API_KEY/)
  })

  it('returns config with defaults when minimum env present', () => {
    const cfg = loadEnv({
      KIMI_API_KEY: 'sk-kimi-x',
      STUDY_LIBRARY_PATH: 'C:/foo'
    })
    expect(cfg.apiKey).toBe('sk-kimi-x')
    expect(cfg.baseUrl).toBe('https://api.kimi.com/coding/v1')
    expect(cfg.model).toBe('kimi-k2.6')
    expect(cfg.libraryPath).toBe('C:/foo')
  })

  it('respects KIMI_BASE_URL / KIMI_MODEL overrides', () => {
    const cfg = loadEnv({
      KIMI_API_KEY: 'sk-kimi-x',
      KIMI_BASE_URL: 'https://override.example/v1',
      KIMI_MODEL: 'kimi-other',
      STUDY_LIBRARY_PATH: 'C:/foo'
    })
    expect(cfg.baseUrl).toBe('https://override.example/v1')
    expect(cfg.model).toBe('kimi-other')
  })

  it('throws when STUDY_LIBRARY_PATH is missing', () => {
    expect(() =>
      loadEnv({ KIMI_API_KEY: 'sk-kimi-x' })
    ).toThrow(/STUDY_LIBRARY_PATH/)
  })
})
```

- [ ] **Step 2: 跑测试看到失败**

```bash
npm test
```

Expected: 4 failures, "Cannot find module '@electron/env'".

- [ ] **Step 3: 实现最小 env loader**

```ts
// electron/env.ts
export type AppConfig = {
  apiKey: string
  baseUrl: string
  model: string
  libraryPath: string
}

export function loadEnv(env: Record<string, string | undefined>): AppConfig {
  const apiKey = env.KIMI_API_KEY?.trim()
  if (!apiKey) throw new Error('Missing KIMI_API_KEY in .env')

  const libraryPath = env.STUDY_LIBRARY_PATH?.trim()
  if (!libraryPath) throw new Error('Missing STUDY_LIBRARY_PATH in .env')

  return {
    apiKey,
    baseUrl: (env.KIMI_BASE_URL?.trim()) || 'https://api.kimi.com/coding/v1',
    model:   (env.KIMI_MODEL?.trim())    || 'kimi-k2.6',
    libraryPath
  }
}
```

- [ ] **Step 4: 测试通过**

```bash
npm test
```

Expected: 4 passes.

- [ ] **Step 5: 提交**

```bash
git add electron/env.ts tests/env.test.ts
git commit -m "feat(env): load and validate .env into AppConfig"
```

---

## Task 4: Frontmatter 工具

**Files:**
- Create: `electron/lib/frontmatter.ts`
- Test: `tests/frontmatter.test.ts`

- [ ] **Step 1: 写失败测试(覆盖解析、序列化、缺字段补默认)**

```ts
// tests/frontmatter.test.ts
import { describe, expect, it } from 'vitest'
import { parseFrontmatter, serializeFrontmatter } from '@electron/lib/frontmatter'

describe('parseFrontmatter', () => {
  it('parses minimal frontmatter', () => {
    const raw = `---
title: 测试
created: 2025-12-15T20:00:00+08:00
review_count: 0
difficulty: mid
tags: [数学]
---
正文 hello`
    const { frontmatter, body } = parseFrontmatter(raw)
    expect(frontmatter.title).toBe('测试')
    expect(frontmatter.review_count).toBe(0)
    expect(frontmatter.tags).toEqual(['数学'])
    expect(body.trim()).toBe('正文 hello')
  })

  it('fills sensible defaults for missing fields', () => {
    const raw = `---
title: x
---
y`
    const { frontmatter } = parseFrontmatter(raw)
    expect(frontmatter.review_count).toBe(0)
    expect(frontmatter.difficulty).toBe('mid')
    expect(frontmatter.tags).toEqual([])
    expect(frontmatter.created).toMatch(/\d{4}-\d{2}-\d{2}/)
  })
})

describe('serializeFrontmatter', () => {
  it('round-trips a parsed file', () => {
    const original = `---
title: 拓扑学基础
created: 2025-12-15T20:00:00+08:00
last_studied: 2026-04-28T22:13:00+08:00
review_count: 2
difficulty: mid
tags: [数学, 几何]
---
正文段落
`
    const { frontmatter, body } = parseFrontmatter(original)
    const out = serializeFrontmatter(frontmatter, body)
    const reparsed = parseFrontmatter(out)
    expect(reparsed.frontmatter.title).toBe('拓扑学基础')
    expect(reparsed.frontmatter.review_count).toBe(2)
    expect(reparsed.frontmatter.tags).toEqual(['数学', '几何'])
    expect(reparsed.body.trim()).toBe('正文段落')
  })
})
```

- [ ] **Step 2: 跑测试看到失败**

```bash
npm test -- frontmatter
```

- [ ] **Step 3: 实现 frontmatter wrapper**

```ts
// electron/lib/frontmatter.ts
import matter from 'gray-matter'
import type { Frontmatter } from '@shared/index'

export function parseFrontmatter(raw: string): { frontmatter: Frontmatter; body: string } {
  const parsed = matter(raw)
  const data = parsed.data as Partial<Frontmatter>

  const frontmatter: Frontmatter = {
    title:        data.title ?? 'untitled',
    created:      data.created ?? new Date().toISOString(),
    last_studied: data.last_studied,
    last_reviewed: data.last_reviewed,
    review_count: typeof data.review_count === 'number' ? data.review_count : 0,
    difficulty:   data.difficulty ?? 'mid',
    tags:         Array.isArray(data.tags) ? data.tags : []
  }

  return { frontmatter, body: parsed.content }
}

export function serializeFrontmatter(fm: Frontmatter, body: string): string {
  // 保留可选字段为 undefined 时不写 key
  const data: Record<string, unknown> = {
    title: fm.title,
    created: fm.created,
    review_count: fm.review_count,
    difficulty: fm.difficulty,
    tags: fm.tags
  }
  if (fm.last_studied) data.last_studied = fm.last_studied
  if (fm.last_reviewed) data.last_reviewed = fm.last_reviewed
  return matter.stringify(body, data)
}
```

注:`tsconfig.json` 中 `paths` 已对 `@shared/*` → `src/types/*`,但 vitest 的 `resolve.alias` 也得加 `@shared`。补一下:

```ts
// vitest.config.ts 增量
resolve: {
  alias: {
    '@': path.resolve(__dirname, 'src'),
    '@electron': path.resolve(__dirname, 'electron'),
    '@shared': path.resolve(__dirname, 'src/types')
  }
}
```

- [ ] **Step 4: 测试通过**

```bash
npm test -- frontmatter
```

- [ ] **Step 5: 提交**

```bash
git add electron/lib/frontmatter.ts tests/frontmatter.test.ts vitest.config.ts
git commit -m "feat(frontmatter): parse/serialize with gray-matter and defaults"
```

---

## Task 5: state.json 安全读写

**Files:**
- Create: `electron/lib/safe-json.ts`
- Test: `tests/safe-json.test.ts`

- [ ] **Step 1: 写失败测试(成功读 / .bak 回退 / 写时备份)**

```ts
// tests/safe-json.test.ts
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { safeReadJson, safeWriteJson } from '@electron/lib/safe-json'

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sp-'))

describe('safe-json', () => {
  let dir: string
  beforeEach(() => { dir = tmp() })
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

  it('returns fallback when file does not exist', () => {
    const out = safeReadJson(path.join(dir, 'state.json'), { fallback: { a: 1 } })
    expect(out).toEqual({ a: 1 })
  })

  it('returns parsed JSON when file is valid', () => {
    const p = path.join(dir, 'state.json')
    fs.writeFileSync(p, JSON.stringify({ a: 2 }))
    const out = safeReadJson(p, { fallback: { a: 1 } })
    expect(out).toEqual({ a: 2 })
  })

  it('falls back to .bak when main file is corrupted', () => {
    const p = path.join(dir, 'state.json')
    fs.writeFileSync(p, '{not-json')
    fs.writeFileSync(p + '.bak', JSON.stringify({ recovered: true }))
    const out = safeReadJson(p, { fallback: { recovered: false } })
    expect(out).toEqual({ recovered: true })
  })

  it('writes atomically and creates .bak from previous version', () => {
    const p = path.join(dir, 'state.json')
    safeWriteJson(p, { v: 1 })
    safeWriteJson(p, { v: 2 })
    expect(JSON.parse(fs.readFileSync(p, 'utf8'))).toEqual({ v: 2 })
    expect(JSON.parse(fs.readFileSync(p + '.bak', 'utf8'))).toEqual({ v: 1 })
  })
})
```

- [ ] **Step 2: 跑测试看到失败**

```bash
npm test -- safe-json
```

- [ ] **Step 3: 实现**

```ts
// electron/lib/safe-json.ts
import fs from 'node:fs'
import path from 'node:path'

export function safeReadJson<T>(filePath: string, opts: { fallback: T }): T {
  if (!fs.existsSync(filePath)) return opts.fallback
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    const bak = filePath + '.bak'
    if (fs.existsSync(bak)) {
      try { return JSON.parse(fs.readFileSync(bak, 'utf8')) } catch { /* fallthrough */ }
    }
    return opts.fallback
  }
}

export function safeWriteJson(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })

  if (fs.existsSync(filePath)) {
    fs.copyFileSync(filePath, filePath + '.bak')
  }

  const tmp = filePath + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
  fs.renameSync(tmp, filePath)
}
```

- [ ] **Step 4: 测试通过**

```bash
npm test -- safe-json
```

- [ ] **Step 5: 提交**

```bash
git add electron/lib/safe-json.ts tests/safe-json.test.ts
git commit -m "feat(state): atomic JSON write with .bak rollback"
```

---

## Task 6: Prompt 装配

**Files:**
- Create: `electron/lib/prompts.ts`
- Create: `electron/prompts/learner-base.md`(占位,Task 11 替换为 /learner skill 原文)
- Create: `electron/prompts/mode-review.md`
- Create: `electron/prompts/difficulty-mid.md`
- Create: `electron/prompts/difficulty-low.md`
- Test: `tests/prompts.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// tests/prompts.test.ts
import { describe, expect, it } from 'vitest'
import { assemblePrompt } from '@electron/lib/prompts'

const profile = {
  name: '夜读者',
  profile_text: '社科 / 数学跨界,偏直觉理解',
  preferred_topics: ['心理', '数学']
}

describe('assemblePrompt', () => {
  it('progress mode + high difficulty = base + profile only', () => {
    const sys = assemblePrompt({
      mode: 'progress',
      difficulty: 'high',
      profile
    })
    expect(sys).toContain('LEARNER_BASE_PLACEHOLDER')
    expect(sys).toContain('夜读者')
    expect(sys).not.toMatch(/降低探索深度/)
    expect(sys).not.toMatch(/无答案辅助信息/)
    expect(sys).not.toMatch(/掌握度检测/)
  })

  it('progress mode + mid difficulty injects mid suffix', () => {
    const sys = assemblePrompt({ mode: 'progress', difficulty: 'mid', profile })
    expect(sys).toMatch(/降低探索深度/)
  })

  it('progress mode + low difficulty injects low suffix', () => {
    const sys = assemblePrompt({ mode: 'progress', difficulty: 'low', profile })
    expect(sys).toMatch(/无答案辅助信息/)
  })

  it('review mode injects file body and SUGGEST_END marker rule', () => {
    const sys = assemblePrompt({
      mode: 'review',
      difficulty: 'mid',
      profile,
      reviewFileBody: '## 拓扑公理\n...'
    })
    expect(sys).toMatch(/掌握度检测/)
    expect(sys).toContain('## 拓扑公理')
    expect(sys).toMatch(/SUGGEST_END/)
  })

  it('review mode with high difficulty omits mid/low suffix but keeps review block', () => {
    const sys = assemblePrompt({
      mode: 'review',
      difficulty: 'high',
      profile,
      reviewFileBody: 'body'
    })
    expect(sys).toMatch(/掌握度检测/)
    expect(sys).not.toMatch(/降低探索深度/)
  })

  it('order: base → review → difficulty → profile', () => {
    const sys = assemblePrompt({
      mode: 'review',
      difficulty: 'mid',
      profile,
      reviewFileBody: 'B'
    })
    const iBase = sys.indexOf('LEARNER_BASE_PLACEHOLDER')
    const iReview = sys.indexOf('掌握度检测')
    const iDiff = sys.indexOf('降低探索深度')
    const iProfile = sys.indexOf('夜读者')
    expect(iBase).toBeLessThan(iReview)
    expect(iReview).toBeLessThan(iDiff)
    expect(iDiff).toBeLessThan(iProfile)
  })
})
```

- [ ] **Step 2: 写四个 prompt 模板文件(占位 base)**

`electron/prompts/learner-base.md`:

```markdown
LEARNER_BASE_PLACEHOLDER

(Task 11 用全局 /learner skill 原文替换本段)
```

`electron/prompts/mode-review.md`:

```markdown
你正在进行掌握度检测,基础笔记如下:

---
{{file_content}}
---

请直接出第一题,不要客套。题目要能甄别"看过"和"会用"。
完成后追加 [[SUGGEST_END]] 标记。
```

`electron/prompts/difficulty-mid.md`:

```markdown
降低探索深度,核心 + 常见应用即可。卡顿时补前置概念。
```

`electron/prompts/difficulty-low.md`:

```markdown
提问前先给无答案辅助信息(场景铺垫 / 概念框架,但不给结论)。
覆盖核心即可,不深入边界。答错给提示,不反问。
```

- [ ] **Step 3: 实现 `assemblePrompt`**

```ts
// electron/lib/prompts.ts
import fs from 'node:fs'
import path from 'node:path'
import type { Difficulty, Mode, Profile } from '@shared/index'

const PROMPTS_DIR = path.resolve(__dirname, '..', 'prompts')

function read(name: string): string {
  return fs.readFileSync(path.join(PROMPTS_DIR, name), 'utf8').trim()
}

export type AssembleArgs = {
  mode: Mode
  difficulty: Difficulty
  profile: Profile
  reviewFileBody?: string
}

export function assemblePrompt(args: AssembleArgs): string {
  const parts: string[] = []
  parts.push(read('learner-base.md'))

  if (args.mode === 'review') {
    if (!args.reviewFileBody) throw new Error('reviewFileBody required when mode=review')
    parts.push(read('mode-review.md').replace('{{file_content}}', args.reviewFileBody))
  }

  if (args.difficulty === 'mid') parts.push(read('difficulty-mid.md'))
  if (args.difficulty === 'low') parts.push(read('difficulty-low.md'))

  parts.push(formatProfile(args.profile))

  return parts.join('\n\n---\n\n')
}

function formatProfile(p: Profile): string {
  return [
    `# 学习者画像`,
    `姓名:${p.name}`,
    `画像:${p.profile_text}`,
    `偏好领域:${p.preferred_topics.join(' / ')}`
  ].join('\n')
}
```

- [ ] **Step 4: 测试通过**

```bash
npm test -- prompts
```

- [ ] **Step 5: 提交**

```bash
git add electron/lib/prompts.ts electron/prompts/
git add tests/prompts.test.ts
git commit -m "feat(prompts): assembly chain (base → review → difficulty → profile)"
```

---

## Task 7: 推荐算法

**Files:**
- Create: `electron/lib/recommend.ts`
- Test: `tests/recommend.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// tests/recommend.test.ts
import { describe, expect, it } from 'vitest'
import { pickRecommendations } from '@electron/lib/recommend'
import type { FileMeta } from '@shared/index'

const NOW = new Date('2026-05-03T20:00:00+08:00')

const f = (over: Partial<FileMeta>): FileMeta => ({
  file_path: 'x.md',
  title: 'x',
  created: '2025-01-01',
  review_count: 0,
  difficulty: 'mid',
  tags: [],
  ...over
})

describe('pickRecommendations', () => {
  it('returns null/null on empty library', () => {
    const { left, right } = pickRecommendations([], NOW)
    expect(left).toBeNull()
    expect(right).toBeNull()
  })

  it('selects most recent continue + oldest review', () => {
    const lib: FileMeta[] = [
      f({ file_path: 'a.md', title: 'A', last_studied: '2026-05-01T10:00:00+08:00' }),
      f({ file_path: 'b.md', title: 'B', last_studied: '2026-05-03T10:00:00+08:00' }),
      f({ file_path: 'c.md', title: 'C', last_reviewed: '2026-04-20T10:00:00+08:00', review_count: 1 }),
      f({ file_path: 'd.md', title: 'D', last_reviewed: '2026-04-25T10:00:00+08:00', review_count: 2 })
    ]
    const { left, right } = pickRecommendations(lib, NOW)
    expect(left?.type).toBe('continue')
    expect(left?.file_path).toBe('b.md')
    expect(right?.type).toBe('review')
    expect(right?.file_path).toBe('c.md')
  })

  it('excludes review candidates with review_count >= 3', () => {
    const lib: FileMeta[] = [
      f({ file_path: 'a.md', last_reviewed: '2026-04-01', review_count: 3 })
    ]
    const { right } = pickRecommendations(lib, NOW)
    expect(right).toBeNull()
  })

  it('excludes review candidates whose last_reviewed is < 7 days ago', () => {
    const lib: FileMeta[] = [
      f({ file_path: 'a.md', last_reviewed: '2026-05-01T10:00:00+08:00', review_count: 1 })
    ]
    const { right } = pickRecommendations(lib, NOW)
    expect(right).toBeNull()
  })

  it('excludes continue candidates whose last_studied > 3 days ago', () => {
    const lib: FileMeta[] = [
      f({ file_path: 'a.md', last_studied: '2026-04-25T10:00:00+08:00' })
    ]
    const { left } = pickRecommendations(lib, NOW)
    expect(left).toBeNull()
  })

  it('falls back to two continues when no review candidate exists', () => {
    const lib: FileMeta[] = [
      f({ file_path: 'a.md', title: 'A', last_studied: '2026-05-02T10:00:00+08:00' }),
      f({ file_path: 'b.md', title: 'B', last_studied: '2026-05-03T10:00:00+08:00' })
    ]
    const { left, right } = pickRecommendations(lib, NOW)
    expect(left?.type).toBe('continue')
    expect(right?.type).toBe('continue')
    expect(left?.file_path).not.toBe(right?.file_path)
  })

  it('avoids exclude list (for "换一组")', () => {
    const lib: FileMeta[] = [
      f({ file_path: 'a.md', last_studied: '2026-05-03T10:00:00+08:00' }),
      f({ file_path: 'b.md', last_studied: '2026-05-02T10:00:00+08:00' })
    ]
    const { left } = pickRecommendations(lib, NOW, { exclude: ['a.md'] })
    expect(left?.file_path).toBe('b.md')
  })
})
```

- [ ] **Step 2: 跑测试看到失败**

```bash
npm test -- recommend
```

- [ ] **Step 3: 实现**

```ts
// electron/lib/recommend.ts
import type { FileMeta, RecCard } from '@shared/index'

const DAY = 86400_000

export function pickRecommendations(
  lib: FileMeta[],
  now: Date,
  opts: { exclude?: string[] } = {}
): { left: RecCard | null; right: RecCard | null } {
  const exclude = new Set(opts.exclude ?? [])
  const pool = lib.filter(f => !exclude.has(f.file_path))

  const continues = pool
    .filter(f => f.last_studied && now.getTime() - new Date(f.last_studied).getTime() <= 3 * DAY)
    .sort((a, b) => new Date(b.last_studied!).getTime() - new Date(a.last_studied!).getTime())

  const reviews = pool
    .filter(f => f.review_count < 3)
    .filter(f => !f.last_reviewed || now.getTime() - new Date(f.last_reviewed).getTime() >= 7 * DAY)
    .sort((a, b) => {
      const aT = a.last_reviewed ? new Date(a.last_reviewed).getTime() : 0
      const bT = b.last_reviewed ? new Date(b.last_reviewed).getTime() : 0
      return aT - bT  // 空值优先(0 最小)
    })

  const toCard = (f: FileMeta, type: 'continue' | 'review'): RecCard => ({
    type, file_path: f.file_path, title: f.title
  })

  // 互补优先:左 continue 右 review
  if (continues[0] && reviews[0] && continues[0].file_path !== reviews[0].file_path) {
    return { left: toCard(continues[0], 'continue'), right: toCard(reviews[0], 'review') }
  }

  // 一边为空 → 同类填充
  if (continues[0] && !reviews[0] && continues[1]) {
    return { left: toCard(continues[0], 'continue'), right: toCard(continues[1], 'continue') }
  }
  if (reviews[0] && !continues[0] && reviews[1]) {
    return { left: toCard(reviews[0], 'review'), right: toCard(reviews[1], 'review') }
  }

  // 只够一边出一张
  return {
    left:  continues[0] ? toCard(continues[0], 'continue')
        : reviews[0]   ? toCard(reviews[0], 'review')
        : null,
    right: null
  }
}
```

- [ ] **Step 4: 测试通过**

```bash
npm test -- recommend
```

- [ ] **Step 5: 提交**

```bash
git add electron/lib/recommend.ts tests/recommend.test.ts
git commit -m "feat(recommend): pick continue/review pair from frontmatter"
```

---

## Task 8: 归档逻辑(纯函数部分)

**Files:**
- Create: `electron/lib/archive.ts`
- Test: `tests/archive.test.ts`

实际写盘 / 调 LLM 在 Task 11/16 接入,这一步只测纯函数:**冲突重命名**、**追加复习记录**、**frontmatter 增量更新**。

- [ ] **Step 1: 写失败测试**

```ts
// tests/archive.test.ts
import { describe, expect, it } from 'vitest'
import {
  resolveTitleConflict,
  buildReviewAppendix,
  bumpReviewFrontmatter
} from '@electron/lib/archive'
import type { Frontmatter } from '@shared/index'

describe('resolveTitleConflict', () => {
  it('returns title.md when no conflict', () => {
    expect(resolveTitleConflict('拓扑学基础', [], new Date('2026-05-03T20:30:00+08:00')))
      .toBe('拓扑学基础.md')
  })

  it('appends -HHMM suffix when title.md already exists', () => {
    expect(resolveTitleConflict('拓扑学基础', ['拓扑学基础.md'], new Date('2026-05-03T22:13:00+08:00')))
      .toBe('拓扑学基础-2213.md')
  })
})

describe('buildReviewAppendix', () => {
  it('formats append block with date and summary', () => {
    const out = buildReviewAppendix(new Date('2026-05-03'), '本次重点考察 σ 代数...')
    expect(out).toContain('## 复习记录 2026-05-03')
    expect(out).toContain('本次重点考察 σ 代数')
  })
})

describe('bumpReviewFrontmatter', () => {
  it('increments review_count and updates last_reviewed', () => {
    const before: Frontmatter = {
      title: 't', created: '2025-01-01', review_count: 1,
      difficulty: 'mid', tags: []
    }
    const after = bumpReviewFrontmatter(before, new Date('2026-05-03T22:00:00+08:00'))
    expect(after.review_count).toBe(2)
    expect(after.last_reviewed).toBe('2026-05-03T14:00:00.000Z')
  })
})
```

- [ ] **Step 2: 跑测试看到失败**

```bash
npm test -- archive
```

- [ ] **Step 3: 实现**

```ts
// electron/lib/archive.ts
import type { Frontmatter } from '@shared/index'

export function resolveTitleConflict(title: string, existingFileNames: string[], now: Date): string {
  const base = `${title}.md`
  if (!existingFileNames.includes(base)) return base
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  return `${title}-${hh}${mm}.md`
}

export function buildReviewAppendix(date: Date, summary: string): string {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `\n\n## 复习记录 ${yyyy}-${mm}-${dd}\n${summary.trim()}\n`
}

export function bumpReviewFrontmatter(fm: Frontmatter, now: Date): Frontmatter {
  return {
    ...fm,
    review_count: fm.review_count + 1,
    last_reviewed: now.toISOString()
  }
}
```

- [ ] **Step 4: 测试通过**

```bash
npm test -- archive
```

- [ ] **Step 5: 提交**

```bash
git add electron/lib/archive.ts tests/archive.test.ts
git commit -m "feat(archive): pure helpers for filename conflict + review appendix"
```

---

## Task 9: Kimi LLM 客户端(协议层)

**Files:**
- Create: `electron/lib/kimi.ts`
- Test: `tests/kimi.test.ts`

仅包覆 fetch 协议,不接 IPC 也不动 Electron。SSE 解析独立实现。

- [ ] **Step 1: 写失败测试(用 vitest 的 fetch mock)**

```ts
// tests/kimi.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { probeModel, chatNonStream, parseSseChunk } from '@electron/lib/kimi'

const cfg = {
  apiKey: 'sk-test',
  baseUrl: 'https://api.kimi.com/coding/v1',
  model: 'kimi-k2.6',
  libraryPath: '/'
}

describe('probeModel', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('returns ok=true when model id is in the list', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: [{ id: 'kimi-k2.6' }, { id: 'kimi-other' }] })
    })) as any)
    const r = await probeModel(cfg)
    expect(r.ok).toBe(true)
  })

  it('returns ok=false with reason when model not in list', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: [{ id: 'kimi-other' }] })
    })) as any)
    const r = await probeModel(cfg)
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/not.*list|kimi-k2.6/i)
  })

  it('uses Bearer auth header', async () => {
    const fetchSpy = vi.fn(async () => ({ ok: true, json: async () => ({ data: [{ id: 'kimi-k2.6' }] }) }))
    vi.stubGlobal('fetch', fetchSpy as any)
    await probeModel(cfg)
    const headers = (fetchSpy.mock.calls[0][1] as RequestInit).headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer sk-test')
  })
})

describe('chatNonStream', () => {
  it('posts to chat/completions with stream:false', async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'hi' } }] })
    }))
    vi.stubGlobal('fetch', fetchSpy as any)

    const r = await chatNonStream(cfg, {
      messages: [{ role: 'user', content: 'q' }],
      temperature: 0.3
    })
    expect(r).toBe('hi')

    const url = fetchSpy.mock.calls[0][0] as string
    expect(url).toBe('https://api.kimi.com/coding/v1/chat/completions')
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string)
    expect(body.stream).toBe(false)
    expect(body.model).toBe('kimi-k2.6')
    expect(body.temperature).toBe(0.3)
  })
})

describe('parseSseChunk', () => {
  it('extracts delta content from data line', () => {
    const out = parseSseChunk('data: {"choices":[{"delta":{"content":"你好"}}]}\n')
    expect(out).toEqual({ kind: 'chunk', text: '你好' })
  })

  it('detects [DONE]', () => {
    expect(parseSseChunk('data: [DONE]\n')).toEqual({ kind: 'done' })
  })

  it('ignores empty / non-data lines', () => {
    expect(parseSseChunk(': keepalive\n')).toEqual({ kind: 'noop' })
    expect(parseSseChunk('\n')).toEqual({ kind: 'noop' })
  })
})
```

- [ ] **Step 2: 跑测试看到失败**

```bash
npm test -- kimi
```

- [ ] **Step 3: 实现**

```ts
// electron/lib/kimi.ts
import type { AppConfig } from '../env'
import type { Message } from '@shared/index'

export async function probeModel(cfg: AppConfig): Promise<{ ok: boolean; reason?: string }> {
  const res = await fetch(`${cfg.baseUrl}/models`, {
    headers: { Authorization: `Bearer ${cfg.apiKey}` }
  })
  if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` }
  const data = await res.json() as { data?: { id: string }[] }
  const ids = (data.data ?? []).map(m => m.id)
  if (!ids.includes(cfg.model)) {
    return { ok: false, reason: `${cfg.model} not in available list (${ids.length} models)` }
  }
  return { ok: true }
}

export async function chatNonStream(
  cfg: AppConfig,
  args: { messages: Message[]; temperature: number }
): Promise<string> {
  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: cfg.model,
      stream: false,
      temperature: args.temperature,
      messages: args.messages
    })
  })
  if (!res.ok) throw new Error(`Kimi non-stream HTTP ${res.status}`)
  const json = await res.json() as { choices: { message: { content: string } }[] }
  return json.choices[0]?.message?.content ?? ''
}

export type SseEvent =
  | { kind: 'chunk'; text: string }
  | { kind: 'done' }
  | { kind: 'noop' }

export function parseSseChunk(line: string): SseEvent {
  const trimmed = line.trim()
  if (!trimmed.startsWith('data:')) return { kind: 'noop' }
  const payload = trimmed.slice(5).trim()
  if (payload === '[DONE]') return { kind: 'done' }
  try {
    const json = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] }
    const text = json.choices?.[0]?.delta?.content ?? ''
    return { kind: 'chunk', text }
  } catch {
    return { kind: 'noop' }
  }
}

export async function chatStream(
  cfg: AppConfig,
  args: { messages: Message[]; temperature: number; signal: AbortSignal },
  onChunk: (text: string) => void
): Promise<void> {
  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: cfg.model,
      stream: true,
      temperature: args.temperature,
      messages: args.messages
    }),
    signal: args.signal
  })
  if (!res.ok || !res.body) throw new Error(`Kimi stream HTTP ${res.status}`)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let idx
    while ((idx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 1)
      const ev = parseSseChunk(line)
      if (ev.kind === 'chunk') onChunk(ev.text)
      if (ev.kind === 'done') return
    }
  }
}
```

- [ ] **Step 4: 测试通过**

```bash
npm test -- kimi
```

- [ ] **Step 5: 提交**

```bash
git add electron/lib/kimi.ts tests/kimi.test.ts
git commit -m "feat(llm): Kimi client — probe, non-stream, SSE parser"
```

---

## Task 10: 灵感主题 LLM 调用 + 归档 LLM 调用

**Files:**
- Create: `electron/prompts/inspiration.md`
- Create: `electron/prompts/archive-progress.md`
- Create: `electron/prompts/archive-review.md`
- Create: `electron/lib/llm-tasks.ts`
- Test: `tests/llm-tasks.test.ts`

只测 prompt 装填正确 + 输出解析容错。LLM 本身用 mock。

- [ ] **Step 1: 写三个模板**

`electron/prompts/inspiration.md`:

```markdown
你正在为 {{name}} 推荐 2 个新的学习主题。

学习者画像:{{profile_text}}
偏好领域:{{preferred_topics}}
已学过(避免重复):{{existing_titles}}

请输出 2 个具体、单次会话能讲完的主题,严格 JSON 数组,不要任何额外文字:
[
  { "topic": "主题名", "hook": "一句话引子(不超 16 字)" },
  { "topic": "主题名", "hook": "一句话引子(不超 16 字)" }
]
```

`electron/prompts/archive-progress.md`:

```markdown
以下是一段苏格拉底式学习对话。请输出严格 JSON,不要其他文字:

{
  "title":  "8 字以内的主题标题",
  "body":   "一份精炼的笔记正文(markdown,300-600 字),不是对话原文,而是把这次探索得出的核心理解组织成可日后翻阅的笔记。"
}

对话:
{{transcript}}
```

`electron/prompts/archive-review.md`:

```markdown
以下是一次掌握度检测对话的全部内容。请输出 100-200 字的中文摘要,只总结**这一次复习里出现的关键问答与暴露出的薄弱点**,不要重复笔记原文。直接输出文本,不要 JSON。

笔记原文(供参考,不要复制):
{{existing_body}}

复习对话:
{{transcript}}
```

- [ ] **Step 2: 写失败测试**

```ts
// tests/llm-tasks.test.ts
import { describe, expect, it, vi } from 'vitest'
import {
  generateInspirations,
  finalizeProgress,
  finalizeReview
} from '@electron/lib/llm-tasks'

const cfg = { apiKey: 'k', baseUrl: 'https://x', model: 'm', libraryPath: '/' }
const profile = { name: '张三', profile_text: 'p', preferred_topics: ['a', 'b'] }

describe('generateInspirations', () => {
  it('parses valid JSON array', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '[{"topic":"X","hook":"hx"},{"topic":"Y","hook":"hy"}]' } }]
      })
    })) as any)
    const out = await generateInspirations(cfg, { profile, existingTitles: ['a.md'] })
    expect(out).toHaveLength(2)
    expect(out[0].topic).toBe('X')
  })

  it('returns empty array on parse failure (graceful)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'not json at all' } }] })
    })) as any)
    const out = await generateInspirations(cfg, { profile, existingTitles: [] })
    expect(out).toEqual([])
  })

  it('passes existingTitles into prompt', async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true, json: async () => ({ choices: [{ message: { content: '[]' } }] })
    }))
    vi.stubGlobal('fetch', fetchSpy as any)
    await generateInspirations(cfg, { profile, existingTitles: ['拓扑学基础', '贝叶斯入门'] })
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string)
    expect(body.messages[0].content).toContain('拓扑学基础')
    expect(body.messages[0].content).toContain('贝叶斯入门')
  })
})

describe('finalizeProgress', () => {
  it('extracts title and body from JSON response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"title":"拓扑入门","body":"# 笔记\\n核心..."}' } }]
      })
    })) as any)
    const out = await finalizeProgress(cfg, [
      { role: 'user', content: '今夜想学:拓扑' },
      { role: 'assistant', content: '...' }
    ])
    expect(out.title).toBe('拓扑入门')
    expect(out.body).toMatch(/^# 笔记/)
  })

  it('falls back to deterministic title on parse failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, json: async () => ({ choices: [{ message: { content: 'oops' } }] })
    })) as any)
    const out = await finalizeProgress(cfg, [{ role: 'user', content: '今夜想学:拓扑' }])
    expect(out.title).toBe('未命名笔记')
    expect(out.body).toContain('LLM 归档失败')
  })
})

describe('finalizeReview', () => {
  it('returns the raw text response trimmed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '\n本次复习暴露 σ 代数概念混淆。  ' } }] })
    })) as any)
    const out = await finalizeReview(cfg, {
      history: [{ role: 'assistant', content: 'q' }],
      existingBody: 'note body'
    })
    expect(out).toBe('本次复习暴露 σ 代数概念混淆。')
  })
})
```

- [ ] **Step 3: 实现**

```ts
// electron/lib/llm-tasks.ts
import fs from 'node:fs'
import path from 'node:path'
import { chatNonStream } from './kimi'
import type { AppConfig } from '../env'
import type { Profile, NewTopic, Message } from '@shared/index'

const PROMPTS_DIR = path.resolve(__dirname, '..', 'prompts')
const read = (n: string) => fs.readFileSync(path.join(PROMPTS_DIR, n), 'utf8')

const transcript = (h: Message[]) =>
  h.filter(m => m.role !== 'system')
    .map(m => `${m.role === 'user' ? '学者' : 'AI'}:${m.content}`)
    .join('\n\n')

export async function generateInspirations(
  cfg: AppConfig,
  args: { profile: Profile; existingTitles: string[] }
): Promise<NewTopic[]> {
  const prompt = read('inspiration.md')
    .replace('{{name}}', args.profile.name)
    .replace('{{profile_text}}', args.profile.profile_text)
    .replace('{{preferred_topics}}', args.profile.preferred_topics.join(' / '))
    .replace('{{existing_titles}}', args.existingTitles.join(' / '))

  try {
    const text = await chatNonStream(cfg, {
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7
    })
    const json = JSON.parse(text) as NewTopic[]
    return Array.isArray(json) ? json.slice(0, 2) : []
  } catch {
    return []
  }
}

export async function finalizeProgress(
  cfg: AppConfig,
  history: Message[]
): Promise<{ title: string; body: string }> {
  const prompt = read('archive-progress.md').replace('{{transcript}}', transcript(history))
  try {
    const text = await chatNonStream(cfg, {
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3
    })
    const json = JSON.parse(text) as { title: string; body: string }
    if (!json.title || !json.body) throw new Error('shape')
    return json
  } catch {
    return {
      title: '未命名笔记',
      body: '> LLM 归档失败,原始对话已保留为草稿:\n\n' + transcript(history)
    }
  }
}

export async function finalizeReview(
  cfg: AppConfig,
  args: { history: Message[]; existingBody: string }
): Promise<string> {
  const prompt = read('archive-review.md')
    .replace('{{existing_body}}', args.existingBody)
    .replace('{{transcript}}', transcript(args.history))
  try {
    const text = await chatNonStream(cfg, {
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3
    })
    return text.trim()
  } catch {
    return '(复习摘要生成失败,本次对话未自动总结)'
  }
}
```

- [ ] **Step 4: 测试通过**

```bash
npm test -- llm-tasks
```

- [ ] **Step 5: 提交**

```bash
git add electron/lib/llm-tasks.ts electron/prompts/inspiration.md electron/prompts/archive-*.md tests/llm-tasks.test.ts
git commit -m "feat(llm): inspiration + finalize tasks with parse fallback"
```

---

## Task 11: 替换 learner-base.md 为真正的 /learner skill 原文

**Files:**
- Modify: `electron/prompts/learner-base.md`(全量替换占位)

注:`/learner` 全局 skill 在 `C:/Users/86468/.claude/skills/learner/SKILL.md`(已确认存在)。该文件含 6.3KB 苏格拉底式教学指令。

- [ ] **Step 1: 复制 learner skill 内容**

```bash
cp "C:/Users/86468/.claude/skills/learner/SKILL.md" electron/prompts/learner-base.md
```

- [ ] **Step 2: 用 Read 工具检查内容,确认无 frontmatter / 非纯 prompt 文字残留**

如果 SKILL.md 顶部有 yaml frontmatter(`---\nname: ...\n---`),手动删掉,只保留 system prompt 主体。

- [ ] **Step 3: 更新 prompts.test.ts 中的占位 assertion**

把 `expect(sys).toContain('LEARNER_BASE_PLACEHOLDER')` 改成 `expect(sys.length).toBeGreaterThan(500)`(/learner 实际长度肯定 > 500)。所有其他 assertion 不变。

- [ ] **Step 4: 跑测试**

```bash
npm test
```

预期:全绿。

- [ ] **Step 5: 提交**

```bash
git add electron/prompts/learner-base.md tests/prompts.test.ts
git commit -m "feat(prompts): replace placeholder with /learner skill content"
```

---

## Task 12: IPC 注册与 preload 桥

**Files:**
- Create: `electron/ipc/files.ts`
- Create: `electron/ipc/state.ts`
- Create: `electron/ipc/llm.ts`
- Create: `electron/ipc/index.ts`
- Modify: `electron/preload.ts`
- Modify: `electron/main.ts`

这是 v1 唯一的"集成点":主进程 IPC handler + preload 暴露 `window.api`。不写 unit test,而是在最末用 dev 启动后用 DevTools 控制台调用一两个 api 验证。

- [ ] **Step 1: 写 `electron/ipc/files.ts`**

```ts
// electron/ipc/files.ts
import fs from 'node:fs'
import path from 'node:path'
import { ipcMain } from 'electron'
import { parseFrontmatter, serializeFrontmatter } from '../lib/frontmatter'
import { resolveTitleConflict, buildReviewAppendix, bumpReviewFrontmatter } from '../lib/archive'
import type { AppConfig } from '../env'
import type { FileMeta, Frontmatter } from '@shared/index'

export function registerFilesIpc(cfg: AppConfig) {
  ipcMain.handle('files:scan', async (): Promise<FileMeta[]> => {
    const root = cfg.libraryPath
    if (!fs.existsSync(root)) return []
    const files = fs.readdirSync(root).filter(n => n.endsWith('.md'))
    return files.map(name => {
      const fp = path.join(root, name)
      const raw = fs.readFileSync(fp, 'utf8')
      const { frontmatter } = parseFrontmatter(raw)
      return { ...frontmatter, file_path: fp }
    })
  })

  ipcMain.handle('files:read', async (_, file_path: string) => {
    const raw = fs.readFileSync(file_path, 'utf8')
    return parseFrontmatter(raw)
  })

  ipcMain.handle('files:writeProgress', async (_, args: {
    title: string; body: string; difficulty: 'high' | 'mid' | 'low'
  }) => {
    const now = new Date()
    const existing = fs.readdirSync(cfg.libraryPath).filter(n => n.endsWith('.md'))
    const fileName = resolveTitleConflict(args.title, existing, now)
    const file_path = path.join(cfg.libraryPath, fileName)
    const fm: Frontmatter = {
      title: args.title,
      created: now.toISOString(),
      last_studied: now.toISOString(),
      review_count: 0,
      difficulty: args.difficulty,
      tags: []
    }
    fs.writeFileSync(file_path, serializeFrontmatter(fm, args.body), 'utf8')
    return { file_path }
  })

  ipcMain.handle('files:appendReview', async (_, args: { file_path: string; summary: string }) => {
    const raw = fs.readFileSync(args.file_path, 'utf8')
    const { frontmatter, body } = parseFrontmatter(raw)
    const now = new Date()
    const newFm = bumpReviewFrontmatter(frontmatter, now)
    const newBody = body.trimEnd() + buildReviewAppendix(now, args.summary)
    fs.writeFileSync(args.file_path, serializeFrontmatter(newFm, newBody), 'utf8')
  })
}
```

- [ ] **Step 2: 写 `electron/ipc/state.ts`**

```ts
// electron/ipc/state.ts
import { ipcMain } from 'electron'
import path from 'node:path'
import os from 'node:os'
import { safeReadJson, safeWriteJson } from '../lib/safe-json'
import type { StateJson } from '@shared/index'

const STATE_FILE = path.join(os.homedir(), '.studyparlor', 'state.json')

const DEFAULT: StateJson = {
  version: 1,
  profile: { name: '', profile_text: '', preferred_topics: [] },
  lastUsed: { difficulty: 'mid', temperature: 0.7 },
  recommendation_cache: {},
  suggested_new_topics: null,
  ui: { session_count: 0 }
}

export function registerStateIpc() {
  ipcMain.handle('state:get', async (): Promise<StateJson> => {
    return safeReadJson(STATE_FILE, { fallback: DEFAULT })
  })

  ipcMain.handle('state:patch', async (_, patch: Partial<StateJson>) => {
    const cur = safeReadJson(STATE_FILE, { fallback: DEFAULT })
    const next = { ...cur, ...patch }
    safeWriteJson(STATE_FILE, next)
  })
}

export function getCurrentState(): StateJson {
  return safeReadJson(STATE_FILE, { fallback: DEFAULT })
}
```

- [ ] **Step 3: 写 `electron/ipc/llm.ts`(带 abort + sessionId 路由)**

```ts
// electron/ipc/llm.ts
import { ipcMain, BrowserWindow } from 'electron'
import type { AppConfig } from '../env'
import { probeModel, chatStream } from '../lib/kimi'
import { generateInspirations, finalizeProgress, finalizeReview } from '../lib/llm-tasks'
import type { Message, Profile } from '@shared/index'

const sessions = new Map<string, AbortController>()

export function registerLlmIpc(cfg: AppConfig, getMainWindow: () => BrowserWindow | null) {
  ipcMain.handle('llm:probe', async () => probeModel(cfg))

  ipcMain.handle('llm:start', async (_, args: {
    sessionId: string; messages: Message[]; temperature: number
  }) => {
    const win = getMainWindow()
    if (!win) return
    const ctl = new AbortController()
    sessions.set(args.sessionId, ctl)

    try {
      await chatStream(
        cfg,
        { messages: args.messages, temperature: args.temperature, signal: ctl.signal },
        chunk => win.webContents.send('llm:chunk', args.sessionId, chunk)
      )
      win.webContents.send('llm:done', args.sessionId)
    } catch (err: any) {
      if (err?.name === 'AbortError') return  // 主动中断,不算错
      win.webContents.send('llm:error', args.sessionId, {
        code: 'STREAM_FAIL',
        message: String(err?.message ?? err)
      })
    } finally {
      sessions.delete(args.sessionId)
    }
  })

  ipcMain.handle('llm:abort', async (_, sessionId: string) => {
    sessions.get(sessionId)?.abort()
    sessions.delete(sessionId)
  })

  ipcMain.handle('llm:inspirations', async (_, args: {
    profile: Profile; existingTitles: string[]
  }) => generateInspirations(cfg, args))

  ipcMain.handle('llm:finalizeProgress', async (_, history: Message[]) =>
    finalizeProgress(cfg, history))

  ipcMain.handle('llm:finalizeReview', async (_, args: {
    history: Message[]; existingBody: string
  }) => finalizeReview(cfg, args))
}
```

- [ ] **Step 4: 写 `electron/ipc/index.ts`**

```ts
// electron/ipc/index.ts
import type { BrowserWindow } from 'electron'
import type { AppConfig } from '../env'
import { registerFilesIpc } from './files'
import { registerStateIpc } from './state'
import { registerLlmIpc } from './llm'

export function registerAllIpc(cfg: AppConfig, getMainWindow: () => BrowserWindow | null) {
  registerFilesIpc(cfg)
  registerStateIpc()
  registerLlmIpc(cfg, getMainWindow)
}
```

- [ ] **Step 5: 写 preload 桥**

```ts
// electron/preload.ts
import { contextBridge, ipcRenderer } from 'electron'
import type { IpcApi } from '@shared/index'

const api: IpcApi = {
  scanLibrary: () => ipcRenderer.invoke('files:scan'),
  readMd: (p) => ipcRenderer.invoke('files:read', p),
  writeProgressMd: (a) => ipcRenderer.invoke('files:writeProgress', a),
  appendReviewRecord: (a) => ipcRenderer.invoke('files:appendReview', a),

  getState: () => ipcRenderer.invoke('state:get'),
  patchState: (p) => ipcRenderer.invoke('state:patch', p),

  llmProbe: () => ipcRenderer.invoke('llm:probe'),
  llmStart: (a) => ipcRenderer.invoke('llm:start', a),
  llmAbort: (s) => ipcRenderer.invoke('llm:abort', s),
  llmInspirations: (a) => ipcRenderer.invoke('llm:inspirations', a),
  llmFinalizeProgress: (h) => ipcRenderer.invoke('llm:finalizeProgress', h),
  llmFinalizeReview: (a) => ipcRenderer.invoke('llm:finalizeReview', a),

  onLlmChunk: (cb) => {
    const handler = (_: unknown, sid: string, text: string) => cb(sid, text)
    ipcRenderer.on('llm:chunk', handler)
    return () => ipcRenderer.off('llm:chunk', handler)
  },
  onLlmDone: (cb) => {
    const handler = (_: unknown, sid: string) => cb(sid)
    ipcRenderer.on('llm:done', handler)
    return () => ipcRenderer.off('llm:done', handler)
  },
  onLlmError: (cb) => {
    const handler = (_: unknown, sid: string, err: { code: string; message: string }) => cb(sid, err)
    ipcRenderer.on('llm:error', handler)
    return () => ipcRenderer.off('llm:error', handler)
  }
}

contextBridge.exposeInMainWorld('api', api)
```

- [ ] **Step 6: 修改 `electron/main.ts` 接入 env + IPC**

```ts
// electron/main.ts
import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import dotenv from 'dotenv'
import { loadEnv } from './env'
import { registerAllIpc } from './ipc'

dotenv.config()

let mainWindow: BrowserWindow | null = null

async function createWindow() {
  const cfg = loadEnv(process.env)
  registerAllIpc(cfg, () => mainWindow)

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#2a1f1a',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => app.quit())
```

- [ ] **Step 7: 用户准备 `.env`(实施期人工)**

```bash
cp .env.example .env
# 用户编辑 .env,填入真实 KIMI_API_KEY 和 STUDY_LIBRARY_PATH
```

- [ ] **Step 8: 跑 dev,DevTools 验证**

```bash
npm run dev
```

DevTools Console:

```js
await window.api.scanLibrary()
// 期待:[ {title, last_studied, ...}, ... ] 17 个对象
await window.api.getState()
// 期待:DEFAULT(因为还没写过 state.json)
```

- [ ] **Step 9: 提交**

```bash
git add electron/ipc/ electron/preload.ts electron/main.ts
git commit -m "feat(ipc): wire files/state/llm handlers + preload bridge"
```

---

## Task 13: Zustand 全局 store + IPC 同步

**Files:**
- Create: `src/store/index.ts`
- Create: `src/lib/ipc.ts`(类型化 facade,renderer 侧统一入口)

- [ ] **Step 1: 写 `src/lib/ipc.ts`**

```ts
// src/lib/ipc.ts —— renderer 侧的 typed facade
import type { IpcApi } from '@shared/index'

const ensure = (): IpcApi => {
  if (!window.api) throw new Error('window.api missing — preload not wired?')
  return window.api
}

export const ipc = {
  get scanLibrary() { return ensure().scanLibrary },
  get readMd() { return ensure().readMd },
  get writeProgressMd() { return ensure().writeProgressMd },
  get appendReviewRecord() { return ensure().appendReviewRecord },
  get getState() { return ensure().getState },
  get patchState() { return ensure().patchState },
  get llmProbe() { return ensure().llmProbe },
  get llmStart() { return ensure().llmStart },
  get llmAbort() { return ensure().llmAbort },
  get llmInspirations() { return ensure().llmInspirations },
  get llmFinalizeProgress() { return ensure().llmFinalizeProgress },
  get llmFinalizeReview() { return ensure().llmFinalizeReview },
  get onLlmChunk() { return ensure().onLlmChunk },
  get onLlmDone() { return ensure().onLlmDone },
  get onLlmError() { return ensure().onLlmError }
}
```

- [ ] **Step 2: 写 `src/store/index.ts`**

```ts
// src/store/index.ts
import { create } from 'zustand'
import type {
  Difficulty, FileMeta, Message, NewTopic, Profile, RecCard, StateJson, Mode
} from '@shared/index'
import { ipc } from '@/lib/ipc'

type Page = 'cover' | 'home' | 'study' | 'profile'

type Session = {
  mode: Mode
  topic: string
  file_path?: string
  difficulty: Difficulty
  temperature: number
  history: Message[]
  streaming: boolean
  abortId: string                 // sessionId 给 IPC 用
  suggestEnd: boolean
}

type AppStore = {
  // 持久化
  profile: Profile
  lastUsed: { difficulty: Difficulty; temperature: number }
  recommendation: { left: RecCard | null; right: RecCard | null }
  inspirations: NewTopic[]

  // 派生
  library: FileMeta[]
  modelInvalid: boolean
  modelInvalidReason?: string

  // 临时
  session: Session | null
  currentPage: Page
  modal: 'preStudy' | null
  preStudyArgs: { mode: Mode; topic: string; file_path?: string } | null
  toast: { message: string; ts: number } | null

  // 操作
  init: () => Promise<void>
  goto: (p: Page) => void
  openPreStudy: (a: { mode: Mode; topic: string; file_path?: string }) => void
  closePreStudy: () => void
  startSession: (a: {
    mode: Mode; topic: string; file_path?: string
    difficulty: Difficulty; temperature: number
  }) => void
  appendChunk: (text: string) => void
  finishStreaming: () => void
  pushUserMessage: (text: string) => void
  abortAndReplaceUser: (text: string) => Promise<void>
  endSession: () => void
  resetSession: () => void
  showToast: (m: string) => void
  setRecommendation: (r: { left: RecCard | null; right: RecCard | null }) => void
  setInspirations: (t: NewTopic[]) => void
  patchProfile: (p: Partial<Profile>) => Promise<void>
  patchLastUsed: (l: Partial<{ difficulty: Difficulty; temperature: number }>) => Promise<void>
}

export const useStore = create<AppStore>((set, get) => ({
  profile: { name: '', profile_text: '', preferred_topics: [] },
  lastUsed: { difficulty: 'mid', temperature: 0.7 },
  recommendation: { left: null, right: null },
  inspirations: [],
  library: [],
  modelInvalid: false,
  session: null,
  currentPage: 'cover',
  modal: null,
  preStudyArgs: null,
  toast: null,

  init: async () => {
    const [state, library] = await Promise.all([ipc.getState(), ipc.scanLibrary()])
    set({
      profile: state.profile,
      lastUsed: state.lastUsed,
      recommendation: {
        left:  state.recommendation_cache.left  ?? null,
        right: state.recommendation_cache.right ?? null
      },
      inspirations: state.suggested_new_topics?.topics ?? [],
      library
    })
  },

  goto: (p) => set({ currentPage: p }),
  openPreStudy: (a) => set({ modal: 'preStudy', preStudyArgs: a }),
  closePreStudy: () => set({ modal: null, preStudyArgs: null }),

  startSession: (a) => {
    const sid = crypto.randomUUID()
    set({
      session: {
        mode: a.mode, topic: a.topic, file_path: a.file_path,
        difficulty: a.difficulty, temperature: a.temperature,
        history: [], streaming: false, abortId: sid, suggestEnd: false
      },
      modal: null,
      preStudyArgs: null,
      currentPage: 'study'
    })
  },

  appendChunk: (text) => set(s => {
    if (!s.session) return s
    const history = [...s.session.history]
    const last = history[history.length - 1]
    if (last?.role === 'assistant') {
      history[history.length - 1] = { ...last, content: last.content + text }
    } else {
      history.push({ role: 'assistant', content: text })
    }
    const suggestEnd = s.session.suggestEnd ||
      (history[history.length - 1]?.content.includes('[[SUGGEST_END]]') ?? false)
    return { session: { ...s.session, history, streaming: true, suggestEnd } }
  }),

  finishStreaming: () => set(s => s.session
    ? { session: { ...s.session, streaming: false } }
    : s),

  pushUserMessage: (text) => set(s => {
    if (!s.session) return s
    return { session: { ...s.session, history: [...s.session.history, { role: 'user', content: text }] } }
  }),

  abortAndReplaceUser: async (text) => {
    const s = get()
    if (!s.session) return
    if (s.session.streaming) {
      await ipc.llmAbort(s.session.abortId)
      // chunk 流可能还在飞,先把 streaming 关掉等下条 done 信号
    }
    set(state => state.session
      ? { session: { ...state.session,
          streaming: false,
          history: [...state.session.history, { role: 'user', content: text }] } }
      : state)
  },

  endSession: () => {
    // 占位,实际 finalize 流程由 Study 页触发
  },

  resetSession: () => set({ session: null, currentPage: 'home' }),
  showToast: (message) => set({ toast: { message, ts: Date.now() } }),
  setRecommendation: (r) => set({ recommendation: r }),
  setInspirations: (t) => set({ inspirations: t }),

  patchProfile: async (p) => {
    const next = { ...get().profile, ...p }
    set({ profile: next })
    await ipc.patchState({ profile: next } as Partial<StateJson>)
  },

  patchLastUsed: async (l) => {
    const next = { ...get().lastUsed, ...l }
    set({ lastUsed: next })
    await ipc.patchState({ lastUsed: next } as Partial<StateJson>)
  }
}))
```

- [ ] **Step 3: 提交**

```bash
git add src/store/index.ts src/lib/ipc.ts
git commit -m "feat(store): zustand store + typed ipc facade"
```

---

## Task 14: 主题颜色微调 + 通用样式 token

**Files:**
- Modify: `src/styles/globals.css`

- [ ] **Step 1: 加 base layer 与通用 utility(滚动条、选中色、focus ring)**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  ::selection { @apply bg-ember/40 text-parchment; }
  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-thumb { @apply bg-slate/40 rounded; }
  ::-webkit-scrollbar-thumb:hover { @apply bg-slate/70; }
}

@layer components {
  .field-label  { @apply text-parchment/70 text-sm font-sans tracking-wide; }
  .panel        { @apply bg-ink/70 border border-slate/40 rounded-md; }
  .divider      { @apply border-t border-slate/30; }
}

html, body, #root { height: 100%; }
body { @apply bg-ink text-parchment font-serif antialiased; }
```

- [ ] **Step 2: 提交**

```bash
git add src/styles/globals.css
git commit -m "style: tokens + scrollbar + selection palette"
```

---

## Task 15: 通用组件 — Button(双层错位 ②)+ Input(focus 展开 ②)

**Files:**
- Create: `src/components/Button.tsx`
- Create: `src/components/Input.tsx`

- [ ] **Step 1: 写 Button**

```tsx
// src/components/Button.tsx
import { ButtonHTMLAttributes, forwardRef } from 'react'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost'
}

export const Button = forwardRef<HTMLButtonElement, Props>(
  ({ variant = 'primary', className = '', children, ...rest }, ref) => {
    if (variant === 'ghost') {
      return (
        <button ref={ref}
          className={`px-4 py-2 text-parchment/80 hover:text-parchment transition-colors ${className}`}
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

- [ ] **Step 2: 写 Input(focus 展开 ②)**

```tsx
// src/components/Input.tsx
import { InputHTMLAttributes, forwardRef } from 'react'

type Props = InputHTMLAttributes<HTMLInputElement>

export const Input = forwardRef<HTMLInputElement, Props>(
  ({ className = '', ...rest }, ref) => (
    <input ref={ref}
      className={`bg-ink/40 border-b border-parchment/30 px-3 py-2
                  text-parchment placeholder:text-parchment/30
                  focus:outline-none focus:border-ember
                  origin-bottom transform-gpu
                  transition-transform duration-200 ease-out
                  focus:scale-y-[1.05] focus:scale-x-[1.02]
                  ${className}`}
      {...rest} />
  )
)
Input.displayName = 'Input'
```

- [ ] **Step 3: 提交**

```bash
git add src/components/Button.tsx src/components/Input.tsx
git commit -m "feat(ui): Button (双层错位 ②) + Input (focus 展开 ②)"
```

---

## Task 16: App router + Cover 页

**Files:**
- Modify: `src/main.tsx`(替换为真正 mount)
- Create: `src/App.tsx`
- Create: `src/pages/Cover.tsx`
- Create: `src/components/Toast.tsx`

- [ ] **Step 1: 写 Toast 组件**

```tsx
// src/components/Toast.tsx
import { useEffect } from 'react'
import { useStore } from '@/store'

export function Toast() {
  const toast = useStore(s => s.toast)
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => useStore.setState({ toast: null }), 2000)
    return () => clearTimeout(t)
  }, [toast?.ts])
  if (!toast) return null
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 px-4 py-2
                    panel text-parchment shadow-lg z-50 font-sans text-sm">
      {toast.message}
    </div>
  )
}
```

- [ ] **Step 2: 写 Cover 页**

```tsx
// src/pages/Cover.tsx
import { useEffect, useState } from 'react'
import { useStore } from '@/store'
import { Input } from '@/components/Input'
import { Button } from '@/components/Button'

export function Cover() {
  const profile = useStore(s => s.profile)
  const patchProfile = useStore(s => s.patchProfile)
  const goto = useStore(s => s.goto)
  const [name, setName] = useState('')

  // 已有 name → 1.5s 自动进 Home
  useEffect(() => {
    if (profile.name) {
      const t = setTimeout(() => goto('home'), 1500)
      return () => clearTimeout(t)
    }
  }, [profile.name])

  const onEnter = async () => {
    const n = name.trim()
    if (!n) return
    await patchProfile({ name: n })
    goto('home')
  }

  return (
    <div className="h-full flex flex-col items-center justify-center gap-8">
      <div className="w-[640px] aspect-video panel flex items-center justify-center text-parchment/30">
        {/* 占位插画框,待 image gen 后期填入 */}
        <span className="font-sans text-sm">[ 夜读插画 占位 ]</span>
      </div>

      {profile.name ? (
        <div className="text-2xl">夜深了,{profile.name}。</div>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <div className="font-sans text-parchment/60">第一次到来,告诉我你的名字</div>
          <Input value={name} onChange={e => setName(e.target.value)}
                 onKeyDown={e => e.key === 'Enter' && onEnter()}
                 placeholder="..."
                 autoFocus className="w-64 text-center text-lg" />
          <Button onClick={onEnter}>进入夜话</Button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: 写 App.tsx 路由 + 初始化**

```tsx
// src/App.tsx
import { useEffect } from 'react'
import { useStore } from '@/store'
import { Cover } from '@/pages/Cover'
import { Toast } from '@/components/Toast'
import { ipc } from '@/lib/ipc'

export function App() {
  const page = useStore(s => s.currentPage)
  const init = useStore(s => s.init)

  useEffect(() => {
    init().catch(err => {
      console.error('init failed', err)
      useStore.getState().showToast('初始化失败:' + err.message)
    })

    // 探活模型
    ipc.llmProbe().then(r => {
      if (!r.ok) {
        useStore.setState({ modelInvalid: true, modelInvalidReason: r.reason })
        useStore.getState().showToast('模型不可用:' + (r.reason ?? '未知'))
      }
    }).catch(() => { /* 网络失败,推迟到首次调用 */ })
  }, [])

  return (
    <div className="h-full">
      {page === 'cover'   && <Cover />}
      {page === 'home'    && <div className="p-8">[Home 占位] (Task 18 实现)</div>}
      {page === 'study'   && <div className="p-8">[Study 占位] (Task 20)</div>}
      {page === 'profile' && <div className="p-8">[Profile 占位] (Task 22)</div>}
      <Toast />
    </div>
  )
}
```

- [ ] **Step 4: 修改 src/main.tsx**

```tsx
// src/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './styles/globals.css'

ReactDOM.createRoot(document.getElementById('root')!).render(<App />)
```

- [ ] **Step 5: 跑 dev 走查**

```bash
npm run dev
```

期待:首次进 = Cover 输入框,输入名字 → Enter 进 Home 占位;重启后 Cover 显示 "夜深了,XXX",1.5s 后自动进 Home。

- [ ] **Step 6: 提交**

```bash
git add src/App.tsx src/main.tsx src/pages/Cover.tsx src/components/Toast.tsx
git commit -m "feat(ui): cover page + app router + init flow"
```

---

## Task 17: Home 页布局 + 文件库

**Files:**
- Create: `src/pages/Home.tsx`
- Create: `src/components/RecCard.tsx`
- Create: `src/components/InspirationChip.tsx`
- Create: `src/components/FileLibrary.tsx`
- Modify: `src/App.tsx`(挂 Home)

PreStudy 模态在 Task 18 实现;此处只负责呈现 + 点击调用 store action。

- [ ] **Step 1: 写 RecCard**

```tsx
// src/components/RecCard.tsx
import { useStore } from '@/store'
import type { RecCard as RecCardType } from '@shared/index'

export function RecCard({ card, side }: { card: RecCardType | null; side: 'left' | 'right' }) {
  const openPreStudy = useStore(s => s.openPreStudy)

  if (!card) return <div className="panel h-48 flex items-center justify-center text-parchment/30 font-sans text-sm">—</div>

  const isContinue = card.type === 'continue'
  const onClick = () => openPreStudy({
    mode: isContinue ? 'progress' : 'review',
    topic: card.title,
    file_path: card.file_path
  })

  return (
    <button onClick={onClick}
      className="panel h-48 w-full p-6 text-left hover:border-ember/60
                 transition-colors flex flex-col justify-between group">
      <div className="font-sans text-xs text-parchment/50">
        {isContinue ? '继续学习' : '复习'}
      </div>
      <div className="text-xl font-serif">{card.title}</div>
      <div className="font-sans text-xs text-parchment/40 group-hover:text-ember transition-colors">
        {side === 'left' ? '←' : '→'} 进入会话
      </div>
    </button>
  )
}
```

- [ ] **Step 2: 写 InspirationChip**

```tsx
// src/components/InspirationChip.tsx
import { useStore } from '@/store'
import type { NewTopic } from '@shared/index'

export function InspirationChip({ topic }: { topic: NewTopic }) {
  const openPreStudy = useStore(s => s.openPreStudy)
  return (
    <button
      onClick={() => openPreStudy({ mode: 'progress', topic: topic.topic })}
      className="block w-full text-left px-4 py-2
                 bg-ink/40 border border-slate/30 rounded
                 hover:border-ember/60 transition-colors group">
      <div className="text-parchment/90">💡 {topic.topic}</div>
      <div className="text-xs text-parchment/50 font-sans mt-1 group-hover:text-ember/70">
        {topic.hook}
      </div>
    </button>
  )
}
```

- [ ] **Step 3: 写 FileLibrary**

```tsx
// src/components/FileLibrary.tsx
import { useStore } from '@/store'

export function FileLibrary() {
  const library = useStore(s => s.library)
  const openPreStudy = useStore(s => s.openPreStudy)

  if (library.length === 0) {
    return <div className="text-center text-parchment/40 font-sans text-sm py-8">学习库为空</div>
  }

  return (
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 py-6">
      {library.map(f => (
        <button key={f.file_path}
          onClick={() => openPreStudy({
            mode: f.last_studied ? 'review' : 'progress',  // 首次默认走推进延学逻辑由 PreStudy 决定
            topic: f.title,
            file_path: f.file_path
          })}
          className="text-parchment/70 hover:text-ember transition-colors font-serif">
          {f.title}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: 写 Home 页(三栏 + 文件库 + 右上 Profile)**

```tsx
// src/pages/Home.tsx
import { useEffect } from 'react'
import { useStore } from '@/store'
import { Button } from '@/components/Button'
import { RecCard } from '@/components/RecCard'
import { InspirationChip } from '@/components/InspirationChip'
import { FileLibrary } from '@/components/FileLibrary'
import { ipc } from '@/lib/ipc'
import { pickRecommendations } from '@electron/lib/recommend'  // 复用纯函数(只 import 纯逻辑,不引用 fs / electron 模块)

export function Home() {
  const recommendation = useStore(s => s.recommendation)
  const inspirations = useStore(s => s.inspirations)
  const profile = useStore(s => s.profile)
  const library = useStore(s => s.library)
  const setRec = useStore(s => s.setRecommendation)
  const setInsp = useStore(s => s.setInspirations)
  const goto = useStore(s => s.goto)
  const openPreStudy = useStore(s => s.openPreStudy)

  useEffect(() => {
    // 推荐(总是当下重算)
    const { left, right } = pickRecommendations(library, new Date())
    setRec({ left, right })
    ipc.patchState({ recommendation_cache: {
      generated_at: new Date().toISOString(),
      left: left ?? undefined, right: right ?? undefined
    } })

    // 灵感(若缓存超 24h 或为空,异步刷新)
    const stale = inspirations.length === 0
      // 缓存时效另由 state 中 generated_at 判定;这里简化:启动总刷
    if (stale) {
      ipc.llmInspirations({
        profile,
        existingTitles: library.map(f => f.title)
      }).then(t => {
        setInsp(t)
        ipc.patchState({ suggested_new_topics: {
          generated_at: new Date().toISOString(),
          topics: t
        }})
      }).catch(() => {})
    }
  }, [])

  return (
    <div className="h-full overflow-y-auto p-8 relative">
      <Button variant="ghost"
        onClick={() => goto('profile')}
        className="absolute top-4 right-4 font-sans text-sm">
        档案
      </Button>

      <div className="max-w-5xl mx-auto pt-8">
        <div className="text-center text-parchment/60 font-sans text-sm mb-12">
          晚安,{profile.name}
        </div>

        <div className="grid grid-cols-3 gap-6">
          <RecCard card={recommendation.left} side="left" />

          <div className="flex flex-col gap-3">
            <Button
              onClick={() => openPreStudy({ mode: 'progress', topic: '' })}
              className="w-full text-lg py-4">
              新学习
            </Button>
            {inspirations.map((t, i) => (
              <InspirationChip key={i} topic={t} />
            ))}
          </div>

          <RecCard card={recommendation.right} side="right" />
        </div>

        <div className="mt-16 divider"></div>
        <div className="font-sans text-xs text-parchment/40 text-center mt-6 mb-2">— 学习库 —</div>
        <FileLibrary />
      </div>
    </div>
  )
}
```

- [ ] **Step 5: 把 Home 接进 App.tsx**

修改 App.tsx 的路由分支:

```tsx
import { Home } from '@/pages/Home'
// ...
{page === 'home' && <Home />}
```

- [ ] **Step 6: 跑 dev 走查**

```bash
npm run dev
```

注:由于尚未实现 PreStudy 模态,点卡片 / chip / [新学习] 当前仅会触发 store 状态(modal: 'preStudy' 但无 UI)。**先确认布局正确**,模态在 Task 18 接入。

- [ ] **Step 7: 提交**

```bash
git add src/pages/Home.tsx src/components/Rec*.tsx src/components/InspirationChip.tsx src/components/FileLibrary.tsx src/App.tsx
git commit -m "feat(ui): home with 3-column recommendation + library"
```

---

## Task 18: PreStudy 模态

**Files:**
- Create: `src/components/PreStudyModal.tsx`
- Modify: `src/App.tsx`(渲染模态)

模态行为(spec § 5.4):
- 来自 [新学习] → 主题输入空白,焦点在主题输入
- 来自灵感 chip → 主题预填,焦点在难度
- 来自推荐卡 → 无主题输入,只选难度/温度

- [ ] **Step 1: 写 PreStudyModal**

```tsx
// src/components/PreStudyModal.tsx
import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/store'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'
import type { Difficulty } from '@shared/index'

export function PreStudyModal() {
  const args = useStore(s => s.preStudyArgs)
  const lastUsed = useStore(s => s.lastUsed)
  const closePreStudy = useStore(s => s.closePreStudy)
  const startSession = useStore(s => s.startSession)
  const patchLastUsed = useStore(s => s.patchLastUsed)

  const [topic, setTopic] = useState(args?.topic ?? '')
  const [difficulty, setDifficulty] = useState<Difficulty>(lastUsed.difficulty)
  const [temperature, setTemperature] = useState<number>(lastUsed.temperature)
  const topicRef = useRef<HTMLInputElement>(null)
  const diffRef  = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!args) return
    setTopic(args.topic)
    setDifficulty(lastUsed.difficulty)
    setTemperature(lastUsed.temperature)

    // 焦点策略
    if (args.file_path) {
      diffRef.current?.querySelector('button')?.focus?.()  // 推荐卡:无主题输入,聚焦难度
    } else if (args.topic) {
      diffRef.current?.querySelector('button')?.focus?.()  // 灵感 chip:主题已填,聚焦难度
    } else {
      topicRef.current?.focus()                              // 新学习:聚焦主题
    }
  }, [args])

  // ESC 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closePreStudy() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!args) return null

  const showTopicInput = !args.file_path  // 推荐卡时不显示

  const onConfirm = async () => {
    const finalTopic = (showTopicInput ? topic : args.topic).trim()
    if (showTopicInput && !finalTopic) return
    await patchLastUsed({ difficulty, temperature })
    startSession({
      mode: args.mode, topic: finalTopic, file_path: args.file_path,
      difficulty, temperature
    })
  }

  return (
    <div className="fixed inset-0 z-40 bg-ink/70 flex items-center justify-center"
         onClick={closePreStudy}>
      <div className="panel w-[480px] p-8 space-y-6" onClick={e => e.stopPropagation()}>
        <div className="font-sans text-xs text-parchment/50">
          {args.mode === 'progress' ? '推进 · 苏格拉底式探索' : '检测 · 掌握度复习'}
        </div>

        {showTopicInput ? (
          <div>
            <div className="field-label mb-2">今夜想学</div>
            <Input ref={topicRef} value={topic}
                   onChange={e => setTopic(e.target.value)}
                   placeholder="主题或一个问题"
                   className="w-full" />
          </div>
        ) : (
          <div className="text-xl">{args.topic}</div>
        )}

        <div ref={diffRef}>
          <div className="field-label mb-2">难度</div>
          <div className="flex gap-2">
            {(['high', 'mid', 'low'] as Difficulty[]).map(d => (
              <button key={d}
                onClick={() => setDifficulty(d)}
                className={`px-4 py-1.5 rounded font-sans text-sm border transition-colors
                  ${difficulty === d
                    ? 'bg-ember text-ink border-ember'
                    : 'border-slate/40 text-parchment/70 hover:border-parchment/60'}`}>
                {d === 'high' ? '高' : d === 'mid' ? '中' : '低'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="field-label mb-2">温度</div>
          <div className="flex gap-2">
            {[0.3, 0.7, 1.0].map(t => (
              <button key={t}
                onClick={() => setTemperature(t)}
                className={`px-4 py-1.5 rounded font-sans text-sm border transition-colors
                  ${temperature === t
                    ? 'bg-ember text-ink border-ember'
                    : 'border-slate/40 text-parchment/70 hover:border-parchment/60'}`}>
                {t.toFixed(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={closePreStudy}>取消</Button>
          <Button onClick={onConfirm}>开始</Button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 在 App.tsx 渲染模态**

```tsx
import { PreStudyModal } from '@/components/PreStudyModal'
// ...
const modal = useStore(s => s.modal)
// ...
return (
  <div className="h-full">
    {/* pages */}
    {modal === 'preStudy' && <PreStudyModal />}
    <Toast />
  </div>
)
```

- [ ] **Step 3: 跑 dev 走查 — 三种入口**

依次点击:
1. [新学习] → 主题字段空白,焦点在主题输入
2. 灵感 chip → 主题预填该 topic,焦点在难度
3. 推荐卡 → 无主题输入,只看难度/温度
4. ESC 关闭模态
5. 选完点"开始" → 跳到 Study 占位页(下一任务接 chat)

- [ ] **Step 4: 提交**

```bash
git add src/components/PreStudyModal.tsx src/App.tsx
git commit -m "feat(ui): PreStudy modal with three entry behaviors"
```

---

## Task 19: Study 页骨架(消息列表 + 输入)

**Files:**
- Create: `src/pages/Study.tsx`
- Create: `src/components/ChatBubble.tsx`
- Create: `src/components/ChatInput.tsx`
- Modify: `src/App.tsx`(挂 Study)

会话启动消息(progress 自动发"今夜想学:..."、review 不发)在 Task 20 接 LLM 时一起接入。本 Task 只搭 UI 骨架。

- [ ] **Step 1: 写 ChatBubble**

```tsx
// src/components/ChatBubble.tsx
import type { Message } from '@shared/index'

export function ChatBubble({ msg }: { msg: Message }) {
  if (msg.role === 'system') return null
  const isUser = msg.role === 'user'
  // 不渲染 [[SUGGEST_END]] 标记给用户看
  const content = msg.content.replace('[[SUGGEST_END]]', '').trim()
  if (!content) return null

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} my-3`}>
      <div className={`max-w-[70%] px-4 py-3 rounded-md whitespace-pre-wrap leading-relaxed
        ${isUser
          ? 'bg-ember/20 border border-ember/40'
          : 'bg-ink/60 border border-slate/40'}`}>
        {content}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 写 ChatInput**

```tsx
// src/components/ChatInput.tsx
import { useState, KeyboardEvent } from 'react'
import { Button } from '@/components/Button'

export function ChatInput({ onSend, disabled }: {
  onSend: (text: string) => void
  disabled?: boolean
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
  return (
    <div className="flex gap-3 items-end">
      <textarea value={val} onChange={e => setVal(e.target.value)} onKeyDown={onKey}
        rows={2} disabled={disabled}
        placeholder="Enter 发送 / Shift+Enter 换行"
        className="flex-1 bg-ink/40 border border-slate/40 rounded p-3
                   text-parchment placeholder:text-parchment/30
                   focus:outline-none focus:border-ember resize-none
                   font-serif" />
      <Button onClick={send} disabled={disabled}>发送</Button>
    </div>
  )
}
```

- [ ] **Step 3: 写 Study 骨架**

```tsx
// src/pages/Study.tsx
import { useStore } from '@/store'
import { ChatBubble } from '@/components/ChatBubble'
import { ChatInput } from '@/components/ChatInput'
import { Button } from '@/components/Button'

export function Study() {
  const session = useStore(s => s.session)
  if (!session) return null

  const onSend = (text: string) => {
    useStore.getState().pushUserMessage(text)
    // 真正流式调用在 Task 20
  }

  const onEnd = () => { /* 在 Task 21 接 finalize */ }

  return (
    <div className="h-full flex flex-col">
      <header className="flex justify-between items-center px-8 py-4 border-b border-slate/30">
        <div className="font-sans text-sm text-parchment/60">
          {session.mode === 'progress' ? '推进' : '检测'} ·
          {session.difficulty === 'high' ? '高' : session.difficulty === 'mid' ? '中' : '低'} ·
          T={session.temperature}
        </div>
        <div className="font-serif">{session.topic}</div>
        <Button variant="ghost" onClick={onEnd}>结束</Button>
      </header>

      <div className="flex-1 overflow-y-auto px-8 py-4 max-w-4xl w-full mx-auto">
        {session.history.map((m, i) => <ChatBubble key={i} msg={m} />)}
        {session.streaming && (
          <div className="text-parchment/40 font-sans text-xs ml-2 animate-pulse">…</div>
        )}
      </div>

      <div className="px-8 py-4 border-t border-slate/30 max-w-4xl w-full mx-auto">
        <ChatInput onSend={onSend} disabled={session.streaming && !session.suggestEnd} />
      </div>
    </div>
  )
}
```

注:`disabled` 设计为 `streaming && !suggestEnd`,实际 Task 20 会改成"始终能发,新消息触发 abort"。本 step 先有静态结构。

- [ ] **Step 4: 挂载到 App.tsx**

```tsx
import { Study } from '@/pages/Study'
{page === 'study' && <Study />}
```

- [ ] **Step 5: 跑 dev 走查**

```bash
npm run dev
```

走查:从 Home 启动一次推进会话 → 跳到 Study 页 → 看到 header(模式/难度/温度/主题/结束按钮)、空消息区、输入框。

- [ ] **Step 6: 提交**

```bash
git add src/pages/Study.tsx src/components/ChatBubble.tsx src/components/ChatInput.tsx src/App.tsx
git commit -m "feat(ui): study page skeleton with header / list / input"
```

---

## Task 20: Study 流式 + 中断 + 启动消息

**Files:**
- Modify: `src/pages/Study.tsx`(接 LLM)
- Create: `src/lib/session-runtime.ts`(挂 IPC 监听 + 启动逻辑)

- [ ] **Step 1: 写 `src/lib/session-runtime.ts`**

```ts
// src/lib/session-runtime.ts
import { useStore } from '@/store'
import { ipc } from '@/lib/ipc'
import { assemblePrompt } from '@electron/lib/prompts'  // 注:assemblePrompt 在主进程依赖 fs;renderer 不能直接 import。这一行会编译失败 / 运行错。
                                                            // 这里需要在 IPC 一侧组装 system prompt。
                                                            // 见 Step 2 调整方案。
```

⚠️ **设计修正**:`assemblePrompt` 依赖 `fs` 读取 prompt 文件,renderer 进程没有 fs。系统 prompt 必须在主进程组装。改方案:

- 新增 IPC `llm:assembleSystem`,renderer 把 mode/difficulty/profile/reviewFileBody 传过来,主进程返回组装好的 string。
- 或:`llm:start` 接收高层参数(mode/difficulty 等),主进程内部组装 system 后再调 `chatStream`。**推荐后者**,接口更小。

- [ ] **Step 2: 调整 IPC 协议(对 `llm:start` 升级)**

修改 `src/types/index.ts` 中 `IpcApi.llmStart` 签名:

```ts
llmStart: (args: {
  sessionId: string
  mode: Mode
  difficulty: Difficulty
  profile: Profile
  reviewFileBody?: string
  history: Message[]      // 不含 system,主进程自动注入
  temperature: number
}) => Promise<void>
```

修改 `electron/ipc/llm.ts` 的 `llm:start` handler:

```ts
import { assemblePrompt } from '../lib/prompts'

ipcMain.handle('llm:start', async (_, args: {
  sessionId: string
  mode: Mode
  difficulty: Difficulty
  profile: Profile
  reviewFileBody?: string
  history: Message[]
  temperature: number
}) => {
  const win = getMainWindow(); if (!win) return
  const ctl = new AbortController()
  sessions.set(args.sessionId, ctl)

  const system = assemblePrompt({
    mode: args.mode, difficulty: args.difficulty,
    profile: args.profile, reviewFileBody: args.reviewFileBody
  })
  const messages: Message[] = [{ role: 'system', content: system }, ...args.history]

  try {
    await chatStream(cfg, { messages, temperature: args.temperature, signal: ctl.signal },
      chunk => win.webContents.send('llm:chunk', args.sessionId, chunk))
    win.webContents.send('llm:done', args.sessionId)
  } catch (err: any) {
    if (err?.name === 'AbortError') return
    win.webContents.send('llm:error', args.sessionId, {
      code: 'STREAM_FAIL', message: String(err?.message ?? err)
    })
  } finally { sessions.delete(args.sessionId) }
})
```

同步修改 `electron/preload.ts` 中 `llmStart` 的转发(参数原样透传)。

- [ ] **Step 3: 写真正的 session-runtime**

```ts
// src/lib/session-runtime.ts
import { useStore } from '@/store'
import { ipc } from '@/lib/ipc'

let unsubChunk: (() => void) | null = null
let unsubDone: (() => void) | null = null
let unsubError: (() => void) | null = null

export function attachSessionListeners() {
  unsubChunk?.(); unsubDone?.(); unsubError?.()
  unsubChunk = ipc.onLlmChunk((sid, text) => {
    const s = useStore.getState().session
    if (!s || s.abortId !== sid) return
    useStore.getState().appendChunk(text)
  })
  unsubDone = ipc.onLlmDone((sid) => {
    const s = useStore.getState().session
    if (!s || s.abortId !== sid) return
    useStore.getState().finishStreaming()
  })
  unsubError = ipc.onLlmError((sid, err) => {
    const s = useStore.getState().session
    if (!s || s.abortId !== sid) return
    useStore.getState().finishStreaming()
    useStore.getState().showToast('流式失败:' + err.message)
  })
}

export async function kickoffSession() {
  const s = useStore.getState()
  if (!s.session) return

  let history = s.session.history
  let reviewFileBody: string | undefined
  if (s.session.mode === 'progress' && history.length === 0) {
    history = [{ role: 'user', content: `今夜想学:${s.session.topic}` }]
    useStore.setState(state => state.session
      ? { session: { ...state.session, history, streaming: true } }
      : state)
  } else if (s.session.mode === 'review') {
    if (!s.session.file_path) throw new Error('review session needs file_path')
    const { body } = await ipc.readMd(s.session.file_path)
    reviewFileBody = body
    useStore.setState(state => state.session
      ? { session: { ...state.session, streaming: true } }
      : state)
  }

  await ipc.llmStart({
    sessionId: s.session.abortId,
    mode: s.session.mode,
    difficulty: s.session.difficulty,
    profile: s.profile,
    reviewFileBody,
    history,
    temperature: s.session.temperature
  })
}

export async function sendOrInterrupt(text: string) {
  const s = useStore.getState()
  if (!s.session) return
  if (s.session.streaming) {
    await s.abortAndReplaceUser(text)
  } else {
    s.pushUserMessage(text)
  }
  // 触发新一轮
  useStore.setState(state => state.session
    ? { session: { ...state.session, streaming: true } }
    : state)
  await ipc.llmStart({
    sessionId: useStore.getState().session!.abortId,
    mode: s.session.mode,
    difficulty: s.session.difficulty,
    profile: s.profile,
    reviewFileBody: s.session.file_path
      ? (await ipc.readMd(s.session.file_path)).body : undefined,
    history: useStore.getState().session!.history,
    temperature: s.session.temperature
  })
}
```

- [ ] **Step 4: 修改 Study 页接入**

```tsx
// src/pages/Study.tsx
import { useEffect, useRef } from 'react'
import { useStore } from '@/store'
import { ChatBubble } from '@/components/ChatBubble'
import { ChatInput } from '@/components/ChatInput'
import { Button } from '@/components/Button'
import { attachSessionListeners, kickoffSession, sendOrInterrupt } from '@/lib/session-runtime'

export function Study() {
  const session = useStore(s => s.session)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    attachSessionListeners()
    if (session && session.history.length === 0 && !session.streaming) {
      kickoffSession().catch(err => useStore.getState().showToast('启动失败:' + err.message))
    }
  }, [session?.abortId])

  // 自动滚到底
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [session?.history])

  // ESC 提示结束
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const ok = window.confirm('结束本次会话?')
        if (ok) onEnd()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!session) return null

  const onSend = (text: string) => sendOrInterrupt(text).catch(err =>
    useStore.getState().showToast('发送失败:' + err.message))

  const onEnd = () => { /* Task 21 接 finalize */ }

  return (
    <div className="h-full flex flex-col">
      <header className="flex justify-between items-center px-8 py-4 border-b border-slate/30">
        <div className="font-sans text-sm text-parchment/60">
          {session.mode === 'progress' ? '推进' : '检测'} ·
          {session.difficulty === 'high' ? '高' : session.difficulty === 'mid' ? '中' : '低'} ·
          T={session.temperature}
        </div>
        <div className="font-serif">{session.topic}</div>
        <Button variant="ghost" onClick={onEnd}>结束</Button>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-8 py-4 max-w-4xl w-full mx-auto">
        {session.history.map((m, i) => <ChatBubble key={i} msg={m} />)}
        {session.streaming && (
          <div className="text-parchment/40 font-sans text-xs ml-2 animate-pulse">…</div>
        )}
      </div>

      <div className="px-8 py-4 border-t border-slate/30 max-w-4xl w-full mx-auto">
        <ChatInput onSend={onSend} />
      </div>
    </div>
  )
}
```

- [ ] **Step 5: 跑 dev 端到端走查**

```bash
npm run dev
```

走查:
1. Home → [新学习] → 输 "拓扑" → 开始 → Study 应自动发出"今夜想学:拓扑"并开始流式
2. 流式中再输入新消息发送 → 旧流被打断,新消息接上,LLM 重新流式
3. 检测 mode:从推荐卡(复习)进入 → LLM 直接出第一题(无 user message 前奏)
4. ESC → 弹确认对话框

- [ ] **Step 6: 提交**

```bash
git add src/pages/Study.tsx src/lib/session-runtime.ts src/types/index.ts electron/ipc/llm.ts electron/preload.ts
git commit -m "feat(study): SSE streaming + abort/interrupt + auto-kickoff"
```

---

## Task 21: 推进归档(写新 .md)

**Files:**
- Modify: `src/pages/Study.tsx`(填 onEnd 行为)
- Create: `src/lib/finalize.ts`

- [ ] **Step 1: 写 `src/lib/finalize.ts`**

```ts
// src/lib/finalize.ts
import { useStore } from '@/store'
import { ipc } from '@/lib/ipc'

export async function finalizeAndReturnHome() {
  const s = useStore.getState()
  const sess = s.session
  if (!sess) return

  // 若仍在 streaming,先 abort
  if (sess.streaming) await ipc.llmAbort(sess.abortId)

  if (sess.mode === 'progress') {
    const { title, body } = await ipc.llmFinalizeProgress(sess.history)
    const { file_path } = await ipc.writeProgressMd({
      title, body, difficulty: sess.difficulty
    })
    s.showToast(`《${title}》已归档`)
    // 库列表刷新
    const lib = await ipc.scanLibrary()
    useStore.setState({ library: lib })
  } else {
    if (!sess.file_path) throw new Error('review session has no file_path')
    const { body: existingBody } = await ipc.readMd(sess.file_path)
    const summary = await ipc.llmFinalizeReview({ history: sess.history, existingBody })
    await ipc.appendReviewRecord({ file_path: sess.file_path, summary })
    s.showToast(`《${sess.topic}》复习记录已追加`)
    const lib = await ipc.scanLibrary()
    useStore.setState({ library: lib })
  }

  s.resetSession()
}
```

- [ ] **Step 2: 在 Study 接 onEnd**

```tsx
// src/pages/Study.tsx 增量
import { finalizeAndReturnHome } from '@/lib/finalize'

const onEnd = async () => {
  try {
    await finalizeAndReturnHome()
  } catch (err: any) {
    useStore.getState().showToast('归档失败:' + (err.message ?? err))
  }
}
```

- [ ] **Step 3: 添加 [[SUGGEST_END]] 检测自动提示**

在 Study 页面加一个 effect:当 `session.suggestEnd` 变 true 时,在 chat 区底部显示一个"建议结束"小提示(不强制弹窗,用户主动点结束)。

```tsx
// src/pages/Study.tsx 在 chat 列表下、ChatInput 上方加:
{session.suggestEnd && !session.streaming && (
  <div className="mx-8 my-2 px-4 py-2 bg-ember/10 border border-ember/40 rounded
                  text-sm font-sans text-parchment/80 flex justify-between items-center">
    <span>AI 建议本轮可以结束了。</span>
    <Button onClick={onEnd}>结束并归档</Button>
  </div>
)}
```

- [ ] **Step 4: 跑 dev 端到端走查**

走查推进 mode:
1. Home → [新学习] → 输入主题 → 完整对话几轮
2. 点 [结束] → 等待 1-2 秒(非流式 LLM 调用) → 跳回 Home + toast"《XXX》已归档"
3. Home 文件库列表里出现新主题
4. 重启 app → 仍可见

走查检测 mode:
1. Home → 推荐卡(复习)→ 进入会话 → 几轮问答
2. 点 [结束] → 跳回 Home + toast
3. 检查原 .md frontmatter:`review_count` +1,`last_reviewed` 更新
4. 检查正文末尾追加了 `## 复习记录 YYYY-MM-DD ...`

- [ ] **Step 5: 提交**

```bash
git add src/lib/finalize.ts src/pages/Study.tsx
git commit -m "feat(session): finalize progress (new .md) + review (frontmatter+append)"
```

---

## Task 22: Profile 页

**Files:**
- Create: `src/pages/Profile.tsx`
- Modify: `src/App.tsx`(挂 Profile)

- [ ] **Step 1: 写 Profile 页**

```tsx
// src/pages/Profile.tsx
import { useState } from 'react'
import { useStore } from '@/store'
import { Button } from '@/components/Button'
import { Input } from '@/components/Input'

export function Profile() {
  const profile = useStore(s => s.profile)
  const lastUsed = useStore(s => s.lastUsed)
  const patchProfile = useStore(s => s.patchProfile)
  const patchLastUsed = useStore(s => s.patchLastUsed)
  const goto = useStore(s => s.goto)
  const showToast = useStore(s => s.showToast)

  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(profile.name)
  const [text, setText] = useState(profile.profile_text)
  const [topics, setTopics] = useState(profile.preferred_topics.join('、'))
  const [difficulty, setDifficulty] = useState(lastUsed.difficulty)
  const [temperature, setTemperature] = useState(lastUsed.temperature)

  const onSave = async () => {
    await patchProfile({
      name: name.trim() || profile.name,
      profile_text: text.trim(),
      preferred_topics: topics.split(/[、,,]/).map(s => s.trim()).filter(Boolean)
    })
    await patchLastUsed({ difficulty, temperature })
    setEditing(false)
    showToast('已保存')
  }

  if (!editing) {
    return (
      <div className="max-w-2xl mx-auto p-8 space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-serif">个人档案</h2>
          <Button variant="ghost" onClick={() => goto('home')}>返回</Button>
        </div>
        <div className="panel p-6 space-y-4">
          <div><span className="field-label">姓名:</span>{profile.name}</div>
          <div><span className="field-label">画像:</span>{profile.profile_text || '(空)'}</div>
          <div><span className="field-label">偏好领域:</span>{profile.preferred_topics.join(' · ') || '(空)'}</div>
          <div><span className="field-label">默认难度:</span>{lastUsed.difficulty}</div>
          <div><span className="field-label">默认温度:</span>{lastUsed.temperature}</div>
        </div>
        <Button onClick={() => setEditing(true)}>编辑</Button>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto p-8 space-y-4">
      <h2 className="text-2xl font-serif">编辑档案</h2>

      <div>
        <div className="field-label mb-1">姓名</div>
        <Input value={name} onChange={e => setName(e.target.value)} className="w-full" />
      </div>

      <div>
        <div className="field-label mb-1">画像(自由文本)</div>
        <textarea rows={4}
          value={text} onChange={e => setText(e.target.value)}
          className="w-full bg-ink/40 border border-slate/40 rounded p-3
                     text-parchment focus:outline-none focus:border-ember font-serif" />
      </div>

      <div>
        <div className="field-label mb-1">偏好领域(用 、 或 , 分隔)</div>
        <Input value={topics} onChange={e => setTopics(e.target.value)} className="w-full" />
      </div>

      <div>
        <div className="field-label mb-1">默认难度</div>
        <div className="flex gap-2">
          {(['high', 'mid', 'low'] as const).map(d => (
            <button key={d}
              onClick={() => setDifficulty(d)}
              className={`px-4 py-1.5 rounded font-sans text-sm border
                ${difficulty === d ? 'bg-ember text-ink border-ember' : 'border-slate/40'}`}>
              {d}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="field-label mb-1">默认温度</div>
        <div className="flex gap-2">
          {[0.3, 0.7, 1.0].map(t => (
            <button key={t}
              onClick={() => setTemperature(t)}
              className={`px-4 py-1.5 rounded font-sans text-sm border
                ${temperature === t ? 'bg-ember text-ink border-ember' : 'border-slate/40'}`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-3 pt-4">
        <Button onClick={onSave}>保存</Button>
        <Button variant="ghost" onClick={() => setEditing(false)}>取消</Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 挂载到 App.tsx**

```tsx
import { Profile } from '@/pages/Profile'
{page === 'profile' && <Profile />}
```

- [ ] **Step 3: 跑 dev 走查**

走查:Home 右上"档案" → Profile 视图 → 编辑 → 保存(toast)→ 返回。重启验证持久化。

- [ ] **Step 4: 提交**

```bash
git add src/pages/Profile.tsx src/App.tsx
git commit -m "feat(ui): profile view + edit"
```

---

## Task 23: 启动 8 步与配置错误阻断

**Files:**
- Modify: `electron/main.ts`(完整 8 步)
- Modify: `src/App.tsx`(显示阻断弹窗)

按 spec § 8 完成启动顺序:
1. 加载 .env(缺 KIMI_API_KEY 阻断)
2. 读 state.json(损坏 → .bak + toast,在 IPC 已实现)
3. 扫描 STUDY_LIBRARY_PATH/*.md(失败 → toast)
4. 异步 model probe
5. 计算左右推荐(已在 Home effect 完成)
6. 异步刷灵感(已在 Home effect 完成)
7. 创建 BrowserWindow
8. 渲染 Cover

第 1、2、3、4、7、8 已在前面任务零散完成,这一步只补"配置错误阻断"。

- [ ] **Step 1: 主进程捕获 loadEnv 失败 → IPC 暴露 fatal**

```ts
// electron/main.ts 改造
import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import dotenv from 'dotenv'
import { loadEnv } from './env'
import { registerAllIpc } from './ipc'

dotenv.config()

let mainWindow: BrowserWindow | null = null
let fatalError: string | null = null

async function bootstrap() {
  try {
    const cfg = loadEnv(process.env)
    if (!fs.existsSync(cfg.libraryPath)) {
      throw new Error(`STUDY_LIBRARY_PATH 不存在:${cfg.libraryPath}`)
    }
    registerAllIpc(cfg, () => mainWindow)
  } catch (err: any) {
    fatalError = String(err?.message ?? err)
  }

  ipcMain.handle('boot:fatal', () => fatalError)

  mainWindow = new BrowserWindow({
    width: 1280, height: 800, backgroundColor: '#2a1f1a',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true, nodeIntegration: false
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(bootstrap)
app.on('window-all-closed', () => app.quit())
```

- [ ] **Step 2: preload 暴露 `bootFatal`**

```ts
// electron/preload.ts 新增
bootFatal: () => ipcRenderer.invoke('boot:fatal'),
```

并在 IpcApi 类型中加 `bootFatal: () => Promise<string | null>`。

- [ ] **Step 3: App.tsx 在 init 前先查 fatal**

```tsx
// src/App.tsx 增量
const [fatal, setFatal] = useState<string | null>(null)

useEffect(() => {
  ipc.bootFatal().then(f => {
    if (f) { setFatal(f); return }
    init().catch(...)
    ipc.llmProbe().then(...)
  })
}, [])

if (fatal) {
  return (
    <div className="h-full flex items-center justify-center p-8">
      <div className="panel p-8 max-w-lg space-y-4">
        <h2 className="text-xl text-wine">配置错误</h2>
        <pre className="text-sm whitespace-pre-wrap font-sans text-parchment/70">{fatal}</pre>
        <div className="text-xs text-parchment/50">
          检查 .env 是否存在且包含 KIMI_API_KEY 与 STUDY_LIBRARY_PATH。
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 跑 dev 验证**

故意改坏 .env(注释掉 KIMI_API_KEY)→ 重启 → 应见配置错误阻断屏。改回 → 正常进入。

- [ ] **Step 5: 提交**

```bash
git add electron/main.ts electron/preload.ts src/App.tsx src/types/index.ts
git commit -m "feat(boot): fatal config error blocks UI; library path validated"
```

---

## Task 24: 错误处理矩阵

**Files:**
- Modify: `electron/lib/kimi.ts`(细化错误码)
- Modify: `src/lib/session-runtime.ts`(stream 错误显示)
- Modify: `src/lib/finalize.ts`(写盘失败 → recovery dir)
- Create: `electron/lib/recovery.ts`

按 spec § 7 七类错误:

| 类别 | 实现位置 |
|---|---|
| 网络 / 5xx 临时故障 | kimi.ts 抛 `STREAM_FAIL`,Study 顶部红条提示 + 重试按钮 |
| 401 token 失效 | bootFatal 模式 |
| 429 限流 | kimi.ts 检测 status 429 → 30s 后重试 + toast |
| 404 model not found | probeModel 已处理 + Profile 引导 |
| 文件 IO 失败 | finalize 失败 → recovery dir 落盘 + toast |
| state.json 损坏 | 已在 safe-json 实现 |
| LLM 输出异常 | 用户始终能手动 `[结束]`(已实现);超长截断在本任务加 |

- [ ] **Step 1: kimi.ts 区分 429**

```ts
// electron/lib/kimi.ts chatStream 增量
if (res.status === 429) {
  const e: any = new Error('Rate limited')
  e.code = 'RATE_LIMIT'
  throw e
}
if (!res.ok || !res.body) {
  const e: any = new Error(`HTTP ${res.status}`)
  e.code = res.status === 401 ? 'UNAUTHORIZED' : 'STREAM_FAIL'
  throw e
}
```

- [ ] **Step 2: llm IPC handler 转发 code**

```ts
// electron/ipc/llm.ts 修改 catch
} catch (err: any) {
  if (err?.name === 'AbortError') return
  win.webContents.send('llm:error', args.sessionId, {
    code: err?.code ?? 'STREAM_FAIL',
    message: String(err?.message ?? err)
  })
}
```

- [ ] **Step 3: Study 页加错误条 + 重试**

```tsx
// src/pages/Study.tsx 增量
const [streamError, setStreamError] = useState<{ code: string; message: string } | null>(null)
useEffect(() => {
  const off = ipc.onLlmError((sid, err) => {
    if (sid !== session?.abortId) return
    setStreamError(err)
  })
  return off
}, [session?.abortId])

// 渲染:在消息区上方
{streamError && (
  <div className="bg-wine/30 border border-wine px-4 py-2 text-sm font-sans flex justify-between items-center">
    <span>流式失败:{streamError.message}</span>
    <div className="flex gap-2">
      <Button variant="ghost" onClick={() => { setStreamError(null); sendOrInterrupt('继续') }}>重试</Button>
      <Button variant="ghost" onClick={() => setStreamError(null)}>取消</Button>
    </div>
  </div>
)}
```

- [ ] **Step 4: 写 recovery 模块 + finalize 失败兜底**

```ts
// electron/lib/recovery.ts
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const DIR = path.join(os.homedir(), '.studyparlor', 'recovery')

export function dumpRecovery(filename: string, content: string) {
  fs.mkdirSync(DIR, { recursive: true })
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  fs.writeFileSync(path.join(DIR, `${ts}-${filename}`), content, 'utf8')
}
```

新增 IPC `files:recoveryDump`,主进程调用 `dumpRecovery`。renderer finalize.ts 在 try/catch 中失败 → dump + toast 提示路径。

- [ ] **Step 5: history 截断(spec § 7 末条)**

```ts
// src/lib/session-runtime.ts 在 sendOrInterrupt 内,组装 history 前:
const MAX_PAIRS = 30  // 30 轮 ≈ 60 条
const history = state.session!.history.slice(-MAX_PAIRS * 2)
```

- [ ] **Step 6: 跑 dev 走查 — 故意触发**

测试:
- 改 KIMI_API_KEY 为错的(只改最后一个字符,保留格式) → 启动应该不阻断,LLM 调用时收到 401 → toast 出现
- 用 stub mock 把 fetch 改成抛 5xx → 看到红条 + 重试按钮
- 模型不在线探活 toast(可以临时把 .env 中 KIMI_MODEL 改成不存在的)

- [ ] **Step 7: 提交**

```bash
git add electron/lib/kimi.ts electron/lib/recovery.ts electron/ipc/ src/pages/Study.tsx src/lib/session-runtime.ts src/lib/finalize.ts
git commit -m "feat(errors): rate limit / stream fail / recovery dump / history truncation"
```

---

## Task 25: 视觉收尾

**Files:**
- Modify: `src/pages/Cover.tsx`(占位插画框样式)
- Modify: `src/styles/globals.css`(暗色滚动条 / 按钮焦点环)

主要做"看起来不像未完成项目":
- Cover-b 插画框加木质纹理 / 微噪点 background
- 按钮 focus 时的 ring 与暖橙协调
- Study 流式光标动画
- Toast 入场动画

- [ ] **Step 1: 给 Cover 插画位加纹理 background**

```tsx
// Cover.tsx 中插画 div 改:
<div className="w-[640px] aspect-video relative overflow-hidden rounded-md
                bg-gradient-to-br from-slate/30 to-ink
                border border-slate/40
                shadow-[inset_0_0_60px_rgba(0,0,0,0.4)]
                flex items-center justify-center">
  <span className="font-sans text-sm text-parchment/30 tracking-widest">
    [ 夜读插画 待 image gen 填入 ]
  </span>
</div>
```

- [ ] **Step 2: globals.css 加 focus ring**

```css
@layer base {
  :focus-visible {
    @apply outline-none ring-1 ring-ember/60 ring-offset-2 ring-offset-ink;
  }
}
```

- [ ] **Step 3: Study 流式光标**

把 `<div className="...animate-pulse">…</div>` 换成 inline cursor:

```tsx
{session.streaming && (
  <span className="inline-block w-2 h-5 bg-ember/70 align-middle animate-pulse ml-1" />
)}
```

- [ ] **Step 4: Toast 入场动画**

```css
/* globals.css */
@keyframes fadeInDown { from { opacity: 0; transform: translate(-50%, -8px) } to { opacity: 1; transform: translate(-50%, 0) } }
.toast-enter { animation: fadeInDown 200ms ease-out; }
```

```tsx
// Toast.tsx
<div className="...toast-enter ...">
```

- [ ] **Step 5: 跑 dev 目视**

- [ ] **Step 6: 提交**

```bash
git add src/pages/Cover.tsx src/styles/globals.css src/components/Toast.tsx src/pages/Study.tsx
git commit -m "style: visual polish — texture, focus ring, streaming cursor, toast anim"
```

---

## Task 26: 端到端走查与修补

**Files:**
- 仅修补,不新建

按以下脚本完整跑一遍,记录 bug,修一个提交一次。

- [ ] **Step 1: 路径 1 — 全新用户**

1. 删 `~/.studyparlor/state.json`
2. 启动 → Cover(空名字)
3. 输 "Tester" → 进 Home
4. Home 应:左中右三栏 + 文件库下方 + 灵感 chip(异步出现)
5. 点 [新学习] → PreStudy → 输 "测试主题" → 选 中/0.7 → 开始
6. Study:LLM 流出第一条问 / 来回 3 轮 → 点结束
7. 跳回 Home + toast "《XXX》已归档"
8. 文件库列表新增 1 项

- [ ] **Step 2: 路径 2 — 复习**

1. 重启
2. Home → 文件库点最早学过的某个 .md → PreStudy(无主题输入)→ 选难度温度 → 开始
3. Study(检测 mode):LLM 直接出第一题
4. 完成后结束 → 跳回 + toast
5. 用 VSCode 打开该 .md:frontmatter `last_reviewed` / `review_count` 已更新,正文末尾追加 `## 复习记录 ...`

- [ ] **Step 3: 路径 3 — 流式中断**

1. 启动一次推进会话,等 LLM 流到一半
2. 立刻输入新消息发送
3. 旧流应停止,新轮开始,history 中保留旧的半截 + 新 user message + 新 assistant 回复

- [ ] **Step 4: 路径 4 — 推荐刷新**

1. 重启 → Home(若有 last_studied 在 3 天内的文件,左卡应是"继续学习"该文件)
2. 检查右卡是否选了符合复习候选条件的最早笔记

- [ ] **Step 5: 路径 5 — Profile 编辑**

1. Home → 档案 → 编辑画像 + 偏好 → 保存
2. 返回 Home → 重新点 [新学习](会触发新一轮灵感缓存检查)
3. 重启 → 验证保存生效

- [ ] **Step 6: 修补一个,提交一次**

```bash
git add <file>
git commit -m "fix(<area>): <短描述>"
```

- [ ] **Step 7: 整体复盘 commit**

```bash
git commit --allow-empty -m "test: e2e walkthrough passed — v1 ready"
```

---

## Task 27: (可选)打包

**Files:**
- Create: `electron-builder.yml`
- Modify: `package.json` 添加 `package` script

仅当用户希望脱离 dev 环境运行时执行。v1 不做强制。

- [ ] **Step 1: 安装 electron-builder**

```bash
npm i -D electron-builder
```

- [ ] **Step 2: 写 `electron-builder.yml`**

```yaml
appId: com.local.studyparlor
productName: 学者夜话
directories:
  output: release
files:
  - out/**/*
  - package.json
extraMetadata:
  main: out/main/index.js
win:
  target:
    - target: nsis
      arch: [x64]
  artifactName: 学者夜话-${version}-${arch}.${ext}
```

- [ ] **Step 3: 加 script**

```json
"package": "electron-vite build && electron-builder --win --config electron-builder.yml"
```

- [ ] **Step 4: 跑打包**

```bash
npm run package
```

输出在 `release/` 目录的 NSIS 安装包。

- [ ] **Step 5: 提交**

```bash
git add electron-builder.yml package.json
git commit -m "chore: electron-builder config for windows nsis"
```

---

## Self-Review

**1. Spec coverage**

| Spec § | Task(s) |
|---|---|
| § 0 一句话定位 / § 1 v1 范围 | 全计划 |
| § 2 技术栈 | Task 1 |
| § 3.1 项目目录 | Task 1 / 12(electron+ipc 出现) |
| § 3.2 学习库根目录(.env 覆盖) | Task 1(.env.example) / 3(env 校验) |
| § 3.3 frontmatter schema | Task 4(frontmatter)/ 12(写新 .md) |
| § 3.4 state.json schema | Task 2(types) / 5(safe-json) / 12(state IPC) |
| § 3.5 .env | Task 1 |
| § 4.1–4.2 三轴正交 / 装配链 | Task 6(prompts.ts) |
| § 4.3 难度 mid/low 文本 | Task 6(模板文件) |
| § 4.4 检测 mode 模板 + SUGGEST_END | Task 6(模板) / 11(替换 base) / 21(checkbox 检测) |
| § 4.5 API 调用结构 | Task 9 |
| § 4.6 模型探活 / k2.6 默认 / 下架 toast | Task 9 / 16(App init) |
| § 4.7 流式与中断 | Task 9 / 20 |
| § 4.8 会话生命周期(progress / review 区分归档) | Task 21 |
| § 5.1 页面树 | Task 16(Cover)/ 17(Home)/ 18(PreStudy)/ 19-20(Study)/ 22(Profile) |
| § 5.2 状态机 | 同上 |
| § 5.3 Zustand schema | Task 13 |
| § 5.4 关键交互(ESC / 中断 / 重名 / 三种 PreStudy 入口) | Task 8(重名)/ 18(三入口)/ 20(ESC + 中断) |
| § 5.5 视觉锁定(cover-b / button② / input②) | Task 15 / 16 / 25 |
| § 6.1–6.2 三栏 + 候选条件 | Task 7 / 17 |
| § 6.3 灵感 LLM | Task 10 / 17 |
| § 6.4 文件库 | Task 17 |
| § 7 错误处理 7 类 | Task 24 |
| § 8 启动 8 步 | Task 23 |

无遗漏。

**2. Placeholder 扫描**

- Task 11 的 `LEARNER_BASE_PLACEHOLDER` 是有意占位,会在 Task 11 用真文件替换 — 不算 placeholder 失败。
- 无 "TBD" / "TODO" / "implement later"。

**3. 类型一致性**

- `IpcApi.llmStart` 在 Task 2 定义为基础签名,在 Task 20 升级(加 mode/difficulty/profile/reviewFileBody),已显式说明在 Task 20 修改 `src/types/index.ts`,前后引用一致。
- `RecCard` 在 Task 2 含 title 字段(spec § 3.4 没明说,但 Task 7 / 17 都需要),全计划一致使用。
- Zustand store 字段命名(`recommendation` vs `recommendation_cache`)有意区分:store 是 RecCard pair,state.json 是带 generated_at 的包装,转换在 init / Home effect 完成,无歧义。

**4. 依赖闭环**

- `assemblePrompt` 主进程 fs 依赖 → 仅在主进程调用,renderer 通过 `llm:start` 间接触发,Task 20 已修正接口让主进程内部装配。
- recommend.ts 是纯函数,renderer 直接 import 无副作用(Vite + tsconfig paths 已支持跨目录 import)。

无需补漏。

---

## 开放问题(不阻塞实施)

(从 spec § 10 继承)

- [ ] 检测 mode 的"复习记录"摘要 prompt 还需根据真实运行结果调试简洁度
- [ ] Cover 页中央插画 — 待 image gen 后期填入
- [ ] 三栏在窄屏(< 1024px)下的折叠策略

---

> 本计划完成后,使用 superpowers:subagent-driven-development(推荐) 或 superpowers:executing-plans 逐任务实施。




