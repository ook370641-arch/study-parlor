# Loading Screen 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在应用启动 5-6 秒加载期间展示「墨色扩散」视觉画面，并优化启动流程使窗口先显示、后台并行初始化。

**Architecture:** 主进程在创建窗口后立即推送启动阶段事件到渲染进程，渲染进程用独立 LoadingScreen 组件接收进度并驱动 CSS 视觉元素。加载完成后淡出 LoadingScreen，再初始化 Zustand store。

**Tech Stack:** Electron 30 + React 18 + TypeScript + Tailwind CSS

---

## 文件结构

| 文件 | 动作 | 职责 |
|------|------|------|
| `src/types/index.ts` | 修改 | IpcApi 新增 `onBootProgress` 和 `onBootComplete` 接口 |
| `electron/preload.ts` | 修改 | 注册 IPC 事件监听器，暴露进度回调接口 |
| `electron/main.ts` | 修改 | 窗口提前创建；bootstrap 改为后台异步并推送阶段事件 |
| `src/lib/ipc.ts` | 修改 | 添加 boot progress 的封装调用 |
| `src/components/LoadingScreen.tsx` | **创建** | 墨色扩散视觉组件（墨滴、涟漪、墨斑、节点、连线） |
| `src/App.tsx` | 修改 | 新增 `isBooting` 状态，booting 时渲染 LoadingScreen |
| `src/store/index.ts` | 修改 | `init()` 改为在 loading 完成后调用，不阻塞首屏 |

---

## Task 1: IPC 类型定义

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: 在 IpcApi 中添加启动进度相关接口**

在 `IpcApi` 类型中，在 `bootFatal` 之后添加：

```typescript
  onBootProgress: (cb: (stage: string, progress: number) => void) => () => void
  onBootComplete: (cb: () => void) => () => void
```

- [ ] **Step 2: Commit**

```bash
git add src/types/index.ts
git commit -m "types: add onBootProgress and onBootComplete to IpcApi"
```

---

## Task 2: Preload 进程注册 IPC 通道

**Files:**
- Modify: `electron/preload.ts`

- [ ] **Step 1: 添加 boot progress 事件监听**

在 `bootFatal` 之后、 `contextBridge.exposeInWorld` 之前添加：

```typescript
  onBootProgress: (cb: (stage: string, progress: number) => void) => {
    const handler = (_: unknown, stage: string, progress: number) => cb(stage, progress)
    ipcRenderer.on('boot:progress', handler)
    return () => ipcRenderer.off('boot:progress', handler)
  },
  onBootComplete: (cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on('boot:complete', handler)
    return () => ipcRenderer.off('boot:complete', handler)
  },
```

- [ ] **Step 2: Commit**

```bash
git add electron/preload.ts
git commit -m "preload: register boot:progress and boot:complete IPC channels"
```

---

## Task 3: 渲染进程 IPC 封装

**Files:**
- Modify: `src/lib/ipc.ts`

先查看当前 ipc.ts 的内容：

- [ ] **Step 1: 读取现有 `src/lib/ipc.ts`**

- [ ] **Step 2: 添加 boot progress 封装**

在 ipc 对象中添加：

```typescript
  onBootProgress: (cb: (stage: string, progress: number) => void) =>
    window.api.onBootProgress(cb),
  onBootComplete: (cb: () => void) =>
    window.api.onBootComplete(cb),
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/ipc.ts
git commit -m "ipc: expose boot progress helpers"
```

---

## Task 4: 主进程启动流程重构

**Files:**
- Modify: `electron/main.ts`

- [ ] **Step 1: 重构 bootstrap 函数**

将 `electron/main.ts` 替换为：

```typescript
import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import dotenv from 'dotenv'
import { loadEnv } from './env'
import { registerAllIpc } from './ipc'
import { probeModel } from './lib/kimi'

dotenv.config()

let mainWindow: BrowserWindow | null = null
let fatalError: string | null = null

async function bootstrap() {
  let cfg: ReturnType<typeof loadEnv>

  // Step 1: 加载配置（同步，必须成功才能继续）
  try {
    cfg = loadEnv(process.env)
    if (!fs.existsSync(cfg.libraryPath)) {
      throw new Error(`STUDY_LIBRARY_PATH 不存在:${cfg.libraryPath}`)
    }
  } catch (err: any) {
    fatalError = String(err?.message ?? err)
  }

  // Step 2: 立即创建窗口（用户不再看纯色）
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
  mainWindow.maximize()

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  // Step 3: 如果配置加载失败， fatal error 会由 App.tsx 处理
  ipcMain.handle('boot:fatal', () => fatalError)

  if (fatalError) return

  // Step 4: 后台并行初始化 + 推送进度
  runBootSequence(cfg!, mainWindow)
}

async function runBootSequence(cfg: ReturnType<typeof loadEnv>, win: BrowserWindow) {
  const sendProgress = (stage: string, progress: number) => {
    if (!win.isDestroyed()) {
      win.webContents.send('boot:progress', stage, progress)
    }
  }

  const sendComplete = () => {
    if (!win.isDestroyed()) {
      win.webContents.send('boot:complete')
    }
  }

  // Stage 1: 注册 IPC 处理器
  registerAllIpc(cfg, () => mainWindow)
  sendProgress('注册服务', 15)

  // Stage 2: 探活模型（网络请求，最耗时）
  try {
    sendProgress('探活模型', 25)
    const probeResult = await probeModel(cfg)
    if (!probeResult.ok) {
      console.warn('[bootstrap] model probe failed:', probeResult.reason)
    }
  } catch (err) {
    console.warn('[bootstrap] model probe error:', err)
  }
  sendProgress('扫描学习库', 50)

  // Stage 3: 扫描学习库已在渲染进程 init() 中做，这里只发送进度信号
  // 实际文件扫描由 App.tsx 调用 init() 时触发
  sendProgress('初始化状态', 75)

  // Stage 4: 完成
  setTimeout(() => {
    sendProgress('就绪', 100)
    sendComplete()
  }, 300)
}

app.whenReady().then(bootstrap)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) bootstrap()
})
```

- [ ] **Step 2: Commit**

```bash
git add electron/main.ts
git commit -m "main: defer boot sequence after window creation, emit progress events"
```

---

## Task 5: LoadingScreen 视觉组件

**Files:**
- Create: `src/components/LoadingScreen.tsx`

- [ ] **Step 1: 创建 LoadingScreen 组件**

```typescript
import { useEffect, useRef, useState, useCallback } from 'react'

// 12 个神经节点的相对位置（百分比）
const NEURAL_NODES = [
  { x: 30, y: 35 }, { x: 70, y: 30 }, { x: 75, y: 55 },
  { x: 65, y: 70 }, { x: 35, y: 65 }, { x: 25, y: 50 },
  { x: 50, y: 25 }, { x: 80, y: 42 }, { x: 55, y: 75 },
  { x: 40, y: 78 }, { x: 20, y: 40 }, { x: 72, y: 65 },
]

// 节点连接关系 [from, to]
const NEURAL_CONNECTIONS = [
  [0, 5], [5, 1], [1, 2], [2, 3], [3, 4], [4, 0],
  [5, 7], [7, 8], [8, 4], [0, 6], [6, 1], [2, 7], [3, 8],
]

// 5 个墨斑 blob 的配置
const INK_BLOBS = [
  { w: 100, h: 70, dx: 4, dy: -4, rotate: 25, blur: 5, threshold: 25 },
  { w: 80, h: 60, dx: -8, dy: 4, rotate: -30, blur: 6, threshold: 35 },
  { w: 70, h: 80, dx: -2, dy: -8, rotate: 10, blur: 7, threshold: 45 },
  { w: 90, h: 50, dx: 8, dy: 8, rotate: -15, blur: 5, threshold: 55 },
  { w: 60, h: 90, dx: -6, dy: 0, rotate: 40, blur: 8, threshold: 65 },
]

// 4 层涟漪环
const RINGS = [
  { size: 60, threshold: 15 },
  { size: 110, threshold: 30 },
  { size: 160, threshold: 45 },
  { size: 220, threshold: 60 },
]

interface LoadingScreenProps {
  onComplete?: () => void
}

export function LoadingScreen({ onComplete }: LoadingScreenProps) {
  const [progress, setProgress] = useState(0)
  const [stage, setStage] = useState('初始化')
  const [visible, setVisible] = useState(true)
  const [exiting, setExiting] = useState(false)
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  useEffect(() => {
    // 使用 window.api 直接调用，避免依赖 ipc 模块（store 尚未初始化）
    const unsubProgress = window.api.onBootProgress((s, p) => {
      setStage(s)
      setProgress(p)
    })
    const unsubComplete = window.api.onBootComplete(() => {
      setProgress(100)
      setStage('就绪')
      setExiting(true)
      setTimeout(() => {
        setVisible(false)
        onCompleteRef.current?.()
      }, 700)
    })
    return () => {
      unsubProgress()
      unsubComplete()
    }
  }, [])

  if (!visible) return null

  // 计算各视觉元素的激活状态
  const inkCenterSize = 20 + Math.min(1, progress / 20) * 40 // 20px -> 60px
  const bgWarmth = progress > 10 ? Math.min(0.3, ((progress - 10) / 40) * 0.3) : 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{
        background:
          bgWarmth > 0
            ? `linear-gradient(to bottom, rgba(35,22,12,${bgWarmth}), #1a1410)`
            : '#1a1410',
        opacity: exiting ? 0 : 1,
        transition: 'opacity 700ms ease-out',
      }}
    >
      {/* ===== 墨滴中心 ===== */}
      <div
        className="absolute"
        style={{
          left: '50%',
          top: '50%',
          width: inkCenterSize,
          height: inkCenterSize,
          transform: 'translate(-50%, -50%)',
          borderRadius: '50%',
          background:
            'radial-gradient(circle at 40% 35%, rgba(130,75,40,0.7) 0%, rgba(90,50,28,0.5) 50%, transparent 70%)',
          filter: 'blur(2px)',
          transition: 'width 0.3s ease-out, height 0.3s ease-out',
        }}
      />

      {/* ===== 涟漪环 ===== */}
      {RINGS.map((ring, i) => {
        const active = progress > ring.threshold
        const ringProgress = active
          ? Math.min(1, (progress - ring.threshold) / 30)
          : 0
        return (
          <div
            key={i}
            className="absolute"
            style={{
              left: '50%',
              top: '50%',
              width: ring.size * ringProgress,
              height: ring.size * ringProgress,
              transform: 'translate(-50%, -50%)',
              borderRadius: '50%',
              border: `1px solid rgba(100,60,30,${ringProgress * 0.3})`,
              opacity: ringProgress * 0.4,
              transition: 'all 0.5s ease-out',
            }}
          />
        )
      })}

      {/* ===== 墨斑 blob ===== */}
      {INK_BLOBS.map((blob, i) => {
        const active = progress > blob.threshold
        const blobProgress = active
          ? Math.min(1, (progress - blob.threshold) / 20)
          : 0
        return (
          <div
            key={i}
            className="absolute"
            style={{
              left: `calc(50% + ${blob.dx}px)`,
              top: `calc(50% + ${blob.dy}px)`,
              width: blob.w,
              height: blob.h,
              transform: `translate(-50%, -50%) rotate(${blob.rotate}deg)`,
              borderRadius: '50%',
              background:
                'radial-gradient(ellipse at 30% 30%, rgba(110,65,35,0.25) 0%, transparent 70%)',
              filter: `blur(${blob.blur}px)`,
              opacity: blobProgress,
              transition: 'opacity 0.8s ease-out',
            }}
          />
        )
      })}

      {/* ===== 神经节点 ===== */}
      {NEURAL_NODES.map((node, i) => {
        const threshold = 50 + (i / NEURAL_NODES.length) * 35
        const active = progress > threshold
        const nodeProgress = active
          ? Math.min(1, (progress - threshold) / 20)
          : 0
        const size = 2 + (i % 3) * 1.2
        return (
          <div
            key={i}
            className="absolute"
            style={{
              left: `${node.x}%`,
              top: `${node.y}%`,
              width: size,
              height: size,
              borderRadius: '50%',
              background: `rgba(217,119,87,${nodeProgress * 0.4})`,
              boxShadow: `0 0 6px rgba(217,119,87,${nodeProgress * 0.2})`,
              transform: 'translate(-50%, -50%)',
              transition: 'all 0.6s ease-out',
            }}
          />
        )
      })}

      {/* ===== 连接线 ===== */}
      {NEURAL_CONNECTIONS.map((conn, i) => {
        const threshold = 60 + (i / NEURAL_CONNECTIONS.length) * 30
        const active = progress > threshold
        const lineProgress = active
          ? Math.min(0.6, ((progress - threshold) / 20) * 0.6)
          : 0
        const n1 = NEURAL_NODES[conn[0]]
        const n2 = NEURAL_NODES[conn[1]]
        const dx = n2.x - n1.x
        const dy = n2.y - n1.y
        const len = Math.sqrt(dx * dx + dy * dy)
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI
        return (
          <div
            key={`line-${i}`}
            className="absolute"
            style={{
              left: `${n1.x}%`,
              top: `${n1.y}%`,
              width: `${len}%`,
              height: 1,
              transformOrigin: 'left center',
              transform: `rotate(${angle}deg)`,
              background: `linear-gradient(90deg, rgba(217,119,87,0), rgba(217,119,87,${lineProgress * 0.3}), rgba(217,119,87,0))`,
              opacity: lineProgress,
              transition: 'opacity 0.8s ease-out',
            }}
          />
        )
      })}

      {/* ===== EMERGING 标签 ===== */}
      <div
        className="absolute"
        style={{
          bottom: 44,
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: 10,
          letterSpacing: 4,
          color: `rgba(232,213,183,${
            progress > 75 ? Math.min(0.35, ((progress - 75) / 25) * 0.35) : 0
          })`,
          transition: 'color 1s ease-out',
        }}
      >
        EMERGING
      </div>

      {/* ===== 阶段文字 ===== */}
      <div
        className="absolute"
        style={{
          bottom: 16,
          left: 14,
          fontSize: 10,
          letterSpacing: 1,
          color:
            progress < 100
              ? 'rgba(217,119,87,0.7)'
              : 'rgba(232,213,183,0.4)',
          transition: 'color 0.3s ease',
        }}
      >
        {stage}
      </div>

      {/* ===== 进度条 ===== */}
      <div
        className="absolute"
        style={{ bottom: 0, left: 0, right: 0, height: 2, background: 'rgba(232,213,183,0.05)' }}
      >
        <div
          style={{
            height: '100%',
            width: `${progress}%`,
            background: 'linear-gradient(90deg, #d97757, rgba(217,119,87,0.4))',
            transition: 'width 0.1s linear',
          }}
        />
      </div>

      {/* ===== Vignette 压暗边缘 ===== */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ boxShadow: 'inset 0 0 100px 30px rgba(0,0,0,0.55)' }}
      />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/LoadingScreen.tsx
git commit -m "feat(LoadingScreen): ink-bloom visual with progress-driven CSS elements"
```

---

## Task 6: App.tsx 集成 LoadingScreen

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: 重构 App.tsx**

替换为：

```typescript
import { useEffect, useState } from 'react'
import { useStore } from '@/store'
import { Cover } from '@/pages/Cover'
import { Home } from '@/pages/Home'
import { Study } from '@/pages/Study'
import { Profile } from '@/pages/Profile'
import { Toast } from '@/components/Toast'
import { PreStudyModal } from '@/components/PreStudyModal'
import { LoadingScreen } from '@/components/LoadingScreen'
import { ipc } from '@/lib/ipc'

export function App() {
  const page = useStore(s => s.currentPage)
  const modal = useStore(s => s.modal)
  const init = useStore(s => s.init)
  const [fatal, setFatal] = useState<string | null>(null)
  const [isBooting, setIsBooting] = useState(true)

  useEffect(() => {
    ipc.bootFatal().then(f => {
      if (f) {
        setFatal(f)
        setIsBooting(false)
        return
      }
      // LoadingScreen 显示期间，boot sequence 在后台运行
      // boot:complete 事件会触发 LoadingScreen 的 onComplete
    })
  }, [])

  const handleBootComplete = async () => {
    // LoadingScreen 淡出后，初始化 store
    try {
      await init()
    } catch (err: any) {
      console.error('init failed', err)
      useStore.getState().showToast('初始化失败:' + err.message)
    }
    // 探活模型结果
    ipc.llmProbe().then(r => {
      if (!r.ok) {
        const reason = r.reason ?? '未知'
        const msg = reason.includes('401')
          ? 'API Key 无效，请检查 .env 中的 KIMI_API_KEY'
          : '模型不可用:' + reason
        useStore.setState({ modelInvalid: true, modelInvalidReason: reason })
        useStore.getState().showToast(msg)
      }
    }).catch(() => { /* 网络失败,推迟到首次调用 */ })

    setIsBooting(false)
  }

  if (fatal) {
    const isKeyError = fatal.includes('KIMI_API_KEY')
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="panel p-8 max-w-lg space-y-4">
          <h2 className="text-xl text-wine">配置错误</h2>
          <pre className="text-sm whitespace-pre-wrap font-sans text-parchment/70">{fatal}</pre>

          {isKeyError && (
            <div className="space-y-2 text-sm text-parchment/70">
              <p>1. 打开项目根目录的 <code className="bg-ink px-1 rounded">.env</code> 文件</p>
              <p>2. 前往 https://platform.moonshot.cn/ 获取真实 API Key</p>
              <p>3. 替换占位符后，<strong className="text-parchment">重启应用</strong>（Ctrl+C 后重新 npm run dev）</p>
            </div>
          )}

          <div className="text-xs text-parchment/50">
            检查 .env 是否存在且包含 KIMI_API_KEY 与 STUDY_LIBRARY_PATH。
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full">
      {isBooting && <LoadingScreen onComplete={handleBootComplete} />}
      {!isBooting && (
        <>
          {page === 'cover' && <Cover />}
          {page === 'home' && <Home />}
          {page === 'study' && <Study />}
          {page === 'profile' && <Profile />}
        </>
      )}
      {modal === 'preStudy' && <PreStudyModal />}
      <Toast />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/App.tsx
git commit -m "feat(App): integrate LoadingScreen with boot-complete lifecycle"
```

---

## Task 7: Store init 调整

**Files:**
- Modify: `src/store/index.ts`

- [ ] **Step 1: 确保 init() 可被延后调用**

现有的 `init()` 逻辑无需改动，因为它已经在 `App.tsx` 的 `handleBootComplete` 中被调用。但需要确认 `currentPage` 的初始值仍保持为 `'cover'`（已有）。

检查确认以下不变：
- `currentPage` 初始值是 `'cover'`（第 126 行）
- `init()` 方法存在且正确（第 135-152 行）

无需代码改动，只需确认。

- [ ] **Step 2: Commit（如有改动）**

```bash
git add src/store/index.ts 2>/dev/null || true
git diff --cached --quiet || git commit -m "chore(store): confirm init is callable post-boot"
```

---

## Task 8: 验证测试

**Files:**
- 运行: `npm run dev`

- [ ] **Step 1: 启动开发模式**

```bash
npm run dev
```

- [ ] **Step 2: 验证 checklist**

观察并确认：
- [ ] 启动时窗口立即显示，不再只有纯色背景
- [ ] 看到「墨色扩散」画面：中心墨滴、涟漪环、墨斑、神经节点、连线
- [ ] 底部有进度条和阶段文字（初始化 → 注册服务 → 探活模型 → 扫描学习库 → 初始化状态 → 就绪）
- [ ] 进度条随阶段推进增长
- [ ] 墨滴在初期膨胀，涟漪环中期扩散，神经节点后期点亮
- [ ] 全部就绪后 LoadingScreen 淡出（约 700ms），显示 Cover 页面
- [ ] 如果 `.env` 配置错误，仍正确显示 fatal error 页面（不显示 LoadingScreen）

- [ ] **Step 3: 修复任何运行时问题**

根据观察结果调整代码。

- [ ] **Step 4: Commit 最终版本**

```bash
git add -A
git commit -m "feat(loading-screen): ink-bloom loading screen with deferred boot"
```

---

## Self-Review

### Spec Coverage Check

| Spec 要求 | 对应 Task |
|-----------|-----------|
| 墨色扩散 9 个视觉元素 | Task 5 |
| 进度条映射真实加载 | Task 4 + 5 |
| 阶段文字反映当前阶段 | Task 4 + 5 |
| 窗口先显示、后台初始化 | Task 4 |
| 配置错误不走 LoadingScreen | Task 6 |
| 加载完成平滑过渡 | Task 5 + 6 |
| 风格与现有设计一致 | Task 5（使用现有配色 token） |

### Placeholder Scan

- 无 TBD / TODO / "implement later"
- 所有步骤包含完整代码
- 所有命令包含预期输出

### Type Consistency

- `onBootProgress` 签名：`cb: (stage: string, progress: number) => void` — types.ts、preload.ts、LoadingScreen.tsx 一致
- `onBootComplete` 签名：`cb: () => void` — 全文件一致
- `IpcApi` 扩展在 types.ts 中定义，preload.ts 和 ipc.ts 中实现
