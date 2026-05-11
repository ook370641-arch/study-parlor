# 学者夜话 · Rothko + Billout 画作背景设计

日期：2026-05-11
设计理念：迈克尔·波兰尼「默会知识」× Mark Rothko 色场 × Guy Billout 清晰线插画
实现路径：Path B · Vite 静态目录（与 `@/assets/cover-library.png` 现有模式一致）

---

## 1. 需求概述

把 Pictures/ 目录下的 ~170 张 Mark Rothko 油画与 ~76 张 Guy Billout 插画作为应用背景置入三个界面（Cover / Home / Study），每个界面在应用启动时独立随机抽一张，用户可通过界面右上角的 ↻ 按钮手动切换。

具体目标：

- 三个界面全屏铺底，UI 元素是半透磨砂的「玻璃盒」漂在画上（圣堂派 · 全沉浸）
- 240+ 张画合并为同一个全池，不做适用性筛选——接受偶发的「亮色 Rothko 在 Study」这种不和谐作为代价
- 应用启动时三个界面独立随机抽画；运行中画作稳定不自动换；点 ↻ 才换
- Hover ↻ 时 tooltip 显示当前画作署名："Mark Rothko · Purple Brown · 1957"
- 画作切换使用 600ms crossfade，不是 instant 突变也不是 slide 戏剧化

---

## 2. 设计哲学

### 2.1 默会知识的两种状态

波兰尼的核心论断："我们知道的，比我们能说出口的更多"（We know more than we can tell）。默会知识有两个面向：

- **作为「地」（ground）**：感觉、氛围、无法直陈的背景。你说不清，但你**感觉**。
- **作为「相」（figure）**：突然的显形、清晰的瞬间。一个细节"咔"地一声把整张图锁住。

### 2.2 两位画家分饰两种状态

| 艺术家 | 角色 | 视觉特征 | 在应用中 |
|------|------|---------|---------|
| Mark Rothko | 地 / ground | 软边色场，无形无叙事 | 沉默的氛围底色 |
| Guy Billout | 相 / figure | 清晰线，极简构图，一处错位 | 突然显形的图像化瞬间 |

虽然两人风格截然不同，但在「圣堂派」全屏铺底的统一处理下，他们都成为屏幕的"地"。区别只在于：Rothko 是纯氛围的地，Billout 是有叙事的地。**应用不对二者做区分使用**——同一池随机，让用户在不同时刻邂逅不同性质的默会知识。

### 2.3 圣堂派 · 全沉浸

画作不是装饰，是**结构**。三个界面统一全屏铺底：
- 画作铺到屏幕边缘
- UI 元素是 `bg-ink/70 + backdrop-blur` 的半透玻璃盒
- 屏幕四角加 vignette 暗化，给玻璃盒以"放置感"

---

## 3. 三个界面的视觉规范

三个界面共用同一套铺法和 vignette，仅 UI 布局不同。

### 3.1 共用基础层

```
z-0: 当前画作 <img> (object-fit: cover, full bleed)
z-0: 新画作 <img> (淡入时层叠在旧图上)
z-1: vignette overlay (固定 CSS gradient)
z-5: 主 UI 内容（玻璃盒 / 文字）
z-10: header / topbar
z-11: 右上角 ↻ 换图按钮 + 其它 top-right 控件
```

**Vignette overlay 公式**（三个界面共用）：

```css
position: absolute;
inset: 0;
pointer-events: none;
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
```

注意：`#0f0a08` 比 tailwind 的 `#2a1f1a` 更深，刻意做"画框"的暗角；画作中心区域几乎不被影响。

**玻璃盒规范**（所有 UI 面板）：

```css
background: rgba(20, 14, 10, 0.78);   /* ≈ bg-ink/78 */
border: 1px solid rgba(232, 213, 183, 0.18);
backdrop-filter: blur(10px);
border-radius: 4px;
```

### 3.2 Cover 封面

- 当前结构（`src/pages/Cover.tsx`）已是全屏 `coverImg` 背景 + gradient overlay + 左下角问候语 + 按钮
- **改动**：
  - 移除硬编码 `import coverImg from '@/assets/cover-library.png'`，改为从画池随机抽
  - 移除 `bg-gradient-to-tr from-ink/85 via-ink/30 to-transparent`，替换为统一 vignette
  - 保留 `shadow-[inset_0_0_120px_rgba(0,0,0,0.55)]`（与 vignette 互补）
  - 顶部右上角加 ↻ 换图按钮
- 左下角问候语 + 按钮：保留现有位置，但确保 `text-shadow: 0 1px 8px rgba(0,0,0,0.6)` 让字稳

### 3.3 Home 主页

- 当前 `src/pages/Home.tsx` 是 `h-full overflow-y-auto p-8 relative` 加 `flex gap-6 max-w-6xl mx-auto` 的双列
- **改动**：
  - 新增背景层（<img> + vignette）作为 Home 的第一层 children，position: absolute inset: 0
  - 现有的内容层加 `relative z-5`
  - 顶部右上加 ↻ 按钮，位置 `absolute top-4 right-20`（档案按钮的左侧）
  - 三个面板（unsaved-panel / GroupRecCard / StudyLibrary 的 topic accordion）都改为玻璃盒：
    - `bg-ink/40` → `bg-ink/70 backdrop-blur-md border border-slate/40`

### 3.4 Study 学习页

- 当前 `src/pages/Study.tsx` 是 `h-full flex flex-col` 的三段（header / scroll / input）
- **改动**：
  - 新增背景层（<img> + vignette）作为 Study 第一层，z-0
  - 现有三段加 `relative z-5`
  - Header 已有 `border-b border-slate/30`，改为 `bg-ink/70 backdrop-blur-md border-b border-slate/40`
  - ChatBubble 的 AI 气泡 `bg-ink/60 border border-slate/40` 改为 `bg-ink/65 backdrop-blur-md border border-slate/40`
  - ChatBubble 的 user 气泡 `bg-ember/20 border border-ember/40` 保持
  - Input 区域加 `bg-ink/70 backdrop-blur-md`
  - ↻ 按钮放在 header 内 session-meta **左边**(session-meta 仍在最右)

---

## 4. 画作库架构（Path B · Vite 静态目录）

### 4.1 总体策略

跟现有 `@/assets/cover-library.png` 是同一种思路:**画作作为静态资源,由 Vite 在开发模式服务、在打包时复制到输出目录**。主进程零改动,没有自定义协议,没有新 IPC。

三个组件协作:

1. **Vite 插件**（`scripts/vite-paintings-plugin.cjs`,~50 行）
   - **开发时**:把 Pictures/ 挂载为 `/paintings/` 路由,Vite dev server 直接服务
   - **打包时**:把 Pictures/ 整目录复制到 `out/renderer/paintings/`
   - **构建时**:同时生成 manifest 文件,写到 `src/assets/painting-manifest.json`

2. **Manifest JSON**（`src/assets/painting-manifest.json`,Vite 插件生成,~20KB）
   - 合并 `Pictures/Mark Rothko/index.json` 和 `Pictures/Guy Billout/index.json`
   - 字段:`id / painter / title / year? / url / category?`

3. **渲染端**:`import manifest from '@/assets/painting-manifest.json'` 直接拿到全数组

### 4.2 Painting 类型

```ts
// src/types/index.ts 新增
export type Painting = {
  id: string                              // 'rothko-100', 'billout-021'
  painter: 'Mark Rothko' | 'Guy Billout'
  title: string                           // 'Purple Brown', 'Illumination'
  year?: number                           // 从 slug 正则提取,可能不存在
  url: string                             // 'paintings/Mark%20Rothko/100-purple-brown.jpg'
                                          // 相对路径,dev/prod 都能用
  category?: string                       // 'illustration' / 'early-figurative' / etc.
}
```

URL 用相对路径(无前导 `/`)且空格 URL 编码,这样 dev (http) 和 prod (file://) 都能正确解析。

### 4.3 Vite 插件实现

```js
// scripts/vite-paintings-plugin.cjs
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')

const PICTURES_DIR = path.resolve(__dirname, '..', 'Pictures')
const MANIFEST_OUT = path.resolve(__dirname, '..', 'src/assets/painting-manifest.json')

function buildManifest() {
  const painters = [
    { name: 'Mark Rothko', dir: 'Mark Rothko', prefix: 'rothko' },
    { name: 'Guy Billout', dir: 'Guy Billout', prefix: 'billout' },
  ]
  const all = []
  for (const p of painters) {
    const indexPath = path.join(PICTURES_DIR, p.dir, 'index.json')
    if (!fs.existsSync(indexPath)) continue
    const items = JSON.parse(fs.readFileSync(indexPath, 'utf-8'))
    for (const item of items) {
      if (!item.file) continue

      // 推断子目录(早期/超现实/过渡/fine-art)
      const subDir = item.category && ['fine-art', 'early-figurative', 'surrealist', 'transitional'].includes(item.category)
        ? item.category + '/'
        : ''
      const relPath = path.join(p.dir, subDir + item.file).split(path.sep).join('/')
      const absPath = path.join(PICTURES_DIR, p.dir, subDir + item.file)

      if (!fs.existsSync(absPath)) continue  // 跳过缺失文件

      const slug = item.slug || item.file
      const yearMatch = slug.match(/\b(19|20)\d{2}\b/)
      const year = yearMatch ? parseInt(yearMatch[0]) : undefined

      all.push({
        id: `${p.prefix}-${item.n}`,
        painter: p.name,
        title: item.title,
        year,
        url: 'paintings/' + relPath.split('/').map(encodeURIComponent).join('/'),
        category: item.category,
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
    else await fsp.copyFile(s, d)
  }
}

module.exports = function vitePaintingsPlugin() {
  return {
    name: 'study-parlor-paintings',

    // 开发模式:把 Pictures 挂载为静态目录
    configureServer(server) {
      const count = writeManifest()
      console.log(`[paintings] manifest generated: ${count} paintings`)

      server.middlewares.use('/paintings', (req, res, next) => {
        const urlPath = decodeURIComponent(req.url.split('?')[0])
        const filePath = path.join(PICTURES_DIR, urlPath)
        if (!filePath.startsWith(PICTURES_DIR)) {
          res.statusCode = 403; res.end(); return
        }
        if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
          return next()
        }
        const ext = path.extname(filePath).toLowerCase()
        const mime = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' }[ext] || 'application/octet-stream'
        res.setHeader('Content-Type', mime)
        fs.createReadStream(filePath).pipe(res)
      })
    },

    // 构建模式:生成 manifest + 复制 Pictures 到输出目录
    async buildStart() {
      const count = writeManifest()
      console.log(`[paintings] manifest generated: ${count} paintings`)
    },
    async closeBundle() {
      // 注:本插件挂在 renderer config 上,所以 closeBundle 时输出目录是 out/renderer
      const outPaintings = path.resolve(__dirname, '..', 'out/renderer/paintings')
      console.log(`[paintings] copying Pictures → ${outPaintings}`)
      await copyDir(PICTURES_DIR, outPaintings)
    },
  }
}
```

### 4.4 接入 Vite 配置

```ts
// electron.vite.config.ts
import paintingsPlugin from './scripts/vite-paintings-plugin.cjs'

// renderer.plugins 数组里追加:
plugins: [react(), paintingsPlugin()]
```

### 4.5 渲染端使用

```ts
// src/lib/paintings.ts (新)
import manifestData from '@/assets/painting-manifest.json'
import type { Painting } from '@shared/index'

export const manifest: Painting[] = manifestData as Painting[]

export function pickRandom(excludeId: string | null): Painting | null {
  if (manifest.length === 0) return null
  const pool = excludeId ? manifest.filter(p => p.id !== excludeId) : manifest
  return pool[Math.floor(Math.random() * pool.length)]
}

export function formatAttribution(p: Painting): string {
  const parts = [p.painter, p.title]
  if (p.year) parts.push(String(p.year))
  return parts.join(' · ')
}
```

---

## 5. 状态管理（Zustand store 变更）

```ts
// src/store/index.ts 新增字段
type AppStore = {
  // ... 现有字段 ...

  // 画作背景(三个界面各持有一张当前画作)
  currentPaintings: {
    cover: Painting | null
    home: Painting | null
    study: Painting | null
  }

  // 操作
  initPaintings: () => void                              // 在 init() 里同步调用
  swapPainting: (surface: 'cover' | 'home' | 'study') => void
}
```

实现:

```ts
import { pickRandom } from '@/lib/paintings'

// 字段初始值
currentPaintings: { cover: null, home: null, study: null },

// 方法实现
initPaintings() {
  set({
    currentPaintings: {
      cover: pickRandom(null),
      home: pickRandom(null),
      study: pickRandom(null),
    }
  })
},
swapPainting(surface) {
  const current = get().currentPaintings[surface]
  const next = pickRandom(current?.id ?? null)
  if (!next) return
  set(state => ({
    currentPaintings: { ...state.currentPaintings, [surface]: next }
  }))
}
```

**启动顺序**：App.tsx 的 `init()` 已有的初始化序列里追加一句 `initPaintings()`(同步,因为 manifest 已经在 import 阶段加载好了)。

**不持久化到 state.json** — 画作选择每次启动重新抽,符合"每次启动换一张"的设计。

---

## 6. 组件清单

### 6.1 新组件

#### `SurfaceBackground.tsx`

通用的背景层组件,三个界面共用:

```tsx
// src/components/SurfaceBackground.tsx
import { useEffect, useState } from 'react'
import { useStore } from '@/store'

interface Props { surface: 'cover' | 'home' | 'study' }

export function SurfaceBackground({ surface }: Props) {
  const painting = useStore(s => s.currentPaintings[surface])
  const [prevUrl, setPrevUrl] = useState<string | null>(null)
  const [currentUrl, setCurrentUrl] = useState<string | null>(painting?.url ?? null)

  useEffect(() => {
    if (!painting) return
    if (painting.url !== currentUrl) {
      setPrevUrl(currentUrl)
      setCurrentUrl(painting.url)
      const t = setTimeout(() => setPrevUrl(null), 700)
      return () => clearTimeout(t)
    }
  }, [painting?.url])

  if (!painting) return null

  return (
    <div className="absolute inset-0 z-0 pointer-events-none">
      {prevUrl && (
        <img src={prevUrl}
             className="absolute inset-0 w-full h-full object-cover painting-fade-out"
             alt="" />
      )}
      {currentUrl && (
        <img src={currentUrl}
             className="absolute inset-0 w-full h-full object-cover painting-fade-in"
             alt="" />
      )}
      <div className="absolute inset-0 painting-vignette" />
    </div>
  )
}
```

#### `SwapPaintingButton.tsx`

```tsx
// src/components/SwapPaintingButton.tsx
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
      onClick={() => swap(surface)}
      title={tooltip}
      className={`swap-btn group ${className}`}
      aria-label="换一幅画"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
           strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
           className="w-4 h-4 transition-transform group-hover:rotate-180">
        <path d="M21 12a9 9 0 1 1-3.51-7.13M21 4v5h-5"/>
      </svg>
    </button>
  )
}
```

### 6.2 修改的文件

| 文件 | 改动 |
|------|------|
| `src/pages/Cover.tsx` | 替换硬编码 cover 图,注入 `<SurfaceBackground surface="cover">` + `<SwapPaintingButton surface="cover" className="top-4 right-4">` |
| `src/pages/Home.tsx` | 在根 div 顶部加 `<SurfaceBackground surface="home">` + 右上加 `<SwapPaintingButton surface="home" className="top-4 right-20">`(档案按钮左侧),内容层加 `relative z-5` |
| `src/pages/Study.tsx` | 同上但 ↻ 放在 header 内,session-meta 左边 |
| `src/components/StudyLibrary.tsx` | TopicAccordion `bg-ink/40 hover:bg-ink/60` → `bg-ink/70 backdrop-blur-md hover:bg-ink/80` |
| `src/components/GroupRecCard.tsx` | rec-card `bg-ink/40 hover:bg-ink/60` → `bg-ink/70 backdrop-blur-md hover:bg-ink/80` |
| `src/components/ChatBubble.tsx` | AI 气泡 `bg-ink/60` → `bg-ink/65 backdrop-blur-md` |
| `src/components/ChatInput.tsx` | textarea `bg-ink/40` → `bg-ink/60 backdrop-blur-sm` |
| `src/store/index.ts` | 新增 `currentPaintings / initPaintings / swapPainting`,在现有 `init()` 末尾追加 `get().initPaintings()` 调用 |
| `src/styles/globals.css` | 新增 painting-fade-in/out/vignette/swap-btn keyframes 与类 |
| `src/types/index.ts` | 新增 `Painting` 类型 |
| `electron.vite.config.ts` | renderer.plugins 追加 `paintingsPlugin()` |
| `scripts/vite-paintings-plugin.cjs` (新) | 见 §4.3 |
| `src/lib/paintings.ts` (新) | 见 §4.5 |
| `src/assets/painting-manifest.json` (生成) | Vite 插件自动生成,**.gitignore 加上** |
| `.gitignore` | 添加 `src/assets/painting-manifest.json` |

**主进程零改动**:`electron/main.ts`、`electron/preload.ts`、`electron/ipc/*.ts`、`src/types/index.ts` 的 IpcApi 都不动。

---

## 7. 样式规范（globals.css 追加）

```css
/* 画作淡入淡出 */
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

/* 共用 vignette */
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

/* 换图按钮 */
.swap-btn {
  position: absolute;
  width: 36px; height: 36px;
  background: rgba(15, 10, 8, 0.55);
  border: 1px solid rgba(232, 213, 183, 0.3);
  border-radius: 9999px;
  display: flex; align-items: center; justify-content: center;
  backdrop-filter: blur(6px);
  color: rgba(232, 213, 183, 0.85);
  transition: all 250ms ease;
  cursor: pointer;
  z-index: 11;
}
.swap-btn:hover {
  background: rgba(217, 119, 87, 0.85);
  border-color: #d97757;
  color: #0f0a08;
}

/* reduced motion 降级 */
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

---

## 8. 技术约束

### 8.1 性能

- **图片懒加载**:浏览器对 `<img>` 默认就有 LRU 缓存。每个界面只挂一两张 img,内存可控
- **GPU 友好**:所有动画用 `opacity` 和 `transform`
- **backdrop-blur**:Chromium 在 Electron 里 backdrop-filter 性能良好,每个面板最多一层 blur
- **文件大小**:Rothko 平均 ~20KB(总 ~3.5MB)、Billout 平均 ~250KB(总 ~19MB)——合计 ~23MB,打包后增量可接受

### 8.2 可访问性

- 所有动画遵循 `prefers-reduced-motion`,关闭 crossfade 和按钮旋转
- 换图按钮有 `aria-label="换一幅画"`,tooltip 用 native `title` 属性
- 玻璃盒文字与画作的对比度由 vignette 和高 opacity 背景保证;文字保持 parchment 色 `#e8d5b7` 与玻璃盒底色对比 ≥ 4.5:1

### 8.3 边界与降级

- **manifest 为空(Pictures 目录不存在/没图)**:`currentPaintings` 三项都为 null,`SurfaceBackground` 不渲染,body 的 bg-ink 兜底
- **某张画文件 404**:浏览器 img 静默失败,vignette 仍渲染。下次 swap 即可避开
- **打包后 Pictures 找不到**:Vite 插件 `closeBundle` 复制了一份到 `out/renderer/paintings/`,electron-builder.yml 的 `out/**/*` 已经包含
- **`painting-manifest.json` 文件不存在(测试或冷启动)**:`paintings.ts` 中 `import manifestData from '@/assets/painting-manifest.json'` 会编译报错。`package.json` 的 `test` 脚本前需要先跑一次 manifest 生成。本仓库可在 `package.json` 加 `"pretest": "node scripts/build-manifest.cjs"`(或干脆把生成逻辑做成可独立调用的小脚本)。

### 8.4 路径与编码

- Pictures 子目录名含空格("Mark Rothko" / "Guy Billout")——manifest 中的 url 已经 URL 编码("Mark%20Rothko")
- Dev 用 http://,prod 用 file://——相对路径都能解析

---

## 9. 未来增删画作的工作流(给用户的操作手册)

### 加几张新画

1. 把新 `.jpg` 文件放进 `Pictures/Mark Rothko/`(或 `Guy Billout/`)
2. 编辑同目录的 `index.json`,追加一条:
   ```json
   {
     "n": 172,
     "title": "Title Here",
     "file": "172-new-painting.jpg",
     "slug": "new-painting-1965",
     "category": "color-field"
   }
   ```
   - `n`:递增的序号(不能与已有的重复)
   - `file`:必填,文件名要对得上
   - `title`:tooltip 显示用
   - `slug`:可选,若含 4 位年份则会自动作为 `year`
3. **重启 `npm run dev`**(或重新 `npm run build` 打包)——Vite 插件自动重新扫描、重新生成 manifest

### 删几张画

1. 删 `Pictures/<画家>/<文件>.jpg`
2. **不需要**修改 `index.json`——插件会自动过滤掉文件不存在的条目
3. 重启 dev / rebuild

### 加新画家(比如想加 Hopper)

1. 新建 `Pictures/Edward Hopper/` 目录,放图片
2. 写 `Pictures/Edward Hopper/index.json`(格式照 Rothko 抄)
3. 修改 `scripts/vite-paintings-plugin.cjs`,在 `painters` 数组里加一项:
   ```js
   { name: 'Edward Hopper', dir: 'Edward Hopper', prefix: 'hopper' },
   ```
4. 重启 dev

### 完全换一套画

1. 改 `scripts/vite-paintings-plugin.cjs` 顶部的 `PICTURES_DIR` 常量,或把 Pictures 整目录换掉
2. 重启 dev

---

## 10. 实施顺序建议

### Phase 1:基础设施

1. 写 `scripts/vite-paintings-plugin.cjs` 完整逻辑
2. 在 `electron.vite.config.ts` 接入插件
3. 跑一次 `npm run dev`,确认:
   - 终端输出 `[paintings] manifest generated: N paintings`(N 应该 ≈ 240)
   - `src/assets/painting-manifest.json` 文件被生成
   - 浏览器访问 `http://localhost:5173/paintings/Mark%20Rothko/100-purple-brown.jpg` 能看到图

### Phase 2:类型与工具

4. `src/types/index.ts` 加 `Painting` 类型
5. 写 `src/lib/paintings.ts`(`pickRandom` + `formatAttribution`)
6. `src/store/index.ts` 加 `currentPaintings / initPaintings / swapPainting`,在 `init()` 里调用
7. `globals.css` 追加 keyframes + 类
8. 浏览器 console `useStore.getState().currentPaintings` 应该看到三张随机画

### Phase 3:通用组件

9. 写 `SurfaceBackground.tsx`
10. 写 `SwapPaintingButton.tsx`
11. 临时挂在 Cover.tsx 测试 ↻ 是否能 crossfade + tooltip 是否对

### Phase 4:三个界面集成

12. Cover.tsx:替换 cover-library.png,注入新组件
13. Home.tsx:注入,调整左右上角的 ↻ 位置
14. Study.tsx:注入,header 内放 ↻
15. 调整玻璃盒透明度:ChatBubble / ChatInput / GroupRecCard / StudyLibrary / Home unsaved-panel

### Phase 5:打包验证

16. `npm run build` 看终端是否输出 `[paintings] copying Pictures → out/renderer/paintings`
17. `npm run package` 生成安装包
18. 安装并启动,确认三个界面的画作都能正常显示

---

## 11. 测试要点

- 启动时三个界面**独立**抽画(三张不应该相同——但理论上有 1/240 概率相同,只要逻辑对就行)
- 点 ↻ 后画作变化,且 `pickRandom` 排除 `current.id` 后不会出同一张
- crossfade 600ms 视觉平滑,中间没有"先黑后亮"的闪烁
- Hover ↻ 显示 tooltip("Mark Rothko · Purple Brown · 1957")
- 切换页面(Home ↔ Study)回来后画作保持不变
- 应用重启后三个界面再次随机抽
- `prefers-reduced-motion` 模式下 crossfade 失效,画作仍能切换(只是切得突兀)
- 打包后启动,画作能正常显示(最常见的 deploy bug)

---

## 12. 不在本次范围

- 智能筛选 / 画池打分 / 主题相关推荐 — 用户明确选了"全池随机不筛选"
- 按时间 / 进度自动换图 — 用户选了"仅启动时 + 手动"
- 用户偏好学习(哪些画被频繁切走)— 后续可加,本轮不做
- 寓言 / 归档报告 / 空状态界面的 Billout 专属配图 — 这些是另一个独立工作,本轮只管三个主界面背景
- Pictures 增删后的自动 reload(目前需要重启 dev) — 后续若需要可加 chokidar 文件监听
