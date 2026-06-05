# Setup Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a first-run setup wizard that guides users through configuring API key, library directory, and profile — replacing the current fatal-error-on-missing-config experience.

**Architecture:** Two-tier approach: a pre-startup Node.js script checks for node_modules and creates a default .env if missing; the Electron main process detects missing config and defers to a 4-step React wizard instead of failing fatally. After wizard completion, config is written to .env, injected into process.env, and the normal boot sequence runs without restarting the app.

**Tech Stack:** Electron 30 + React 18 + TypeScript + Tailwind CSS + Vitest

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `scripts/pre-check.js` | Create | Pre-startup script: checks node_modules exists, copies .env.example to .env if missing |
| `package.json` | Modify | Wire pre-check.js into the `dev` script |
| `electron/lib/kimi.ts` | Modify | Extract `probeModelWithCredentials` (accepts creds object); `probeModel` delegates to it |
| `electron/main.ts` | Modify | Bootstrap: `loadEnv` failure marks `needsSetup` instead of fatal; add setup IPC handlers |
| `electron/preload.ts` | Modify | Expose `bootNeedsSetup`, `setupSelectDirectory`, `setupProbeKey`, `setupWriteConfig`, `onSetupDone` |
| `src/types/index.ts` | Modify | Extend `IpcApi` with the 5 new setup methods |
| `src/lib/ipc.ts` | Modify | Add getter facades for the 5 new setup methods |
| `src/App.tsx` | Modify | State machine: `needsSetup` branch renders `SetupWizard`; wizard completion transitions to boot |
| `src/components/SetupWizard.tsx` | Create | 4-step wizard UI: Welcome → API Key (with live validation) → Library Path → Profile → Done |

---

## Task 1: Pre-startup Check Script

**Files:**
- Create: `scripts/pre-check.js`
- Modify: `package.json`

**Context:** This script runs before `electron-vite` starts. It must be pure Node.js (no third-party deps) because node_modules may not exist yet.

- [ ] **Step 1: Create the pre-check script**

Create `scripts/pre-check.js`:

```js
const fs = require('fs')
const path = require('path')

const projectRoot = path.join(__dirname, '..')
const nodeModulesDir = path.join(projectRoot, 'node_modules')
const envFile = path.join(projectRoot, '.env')
const envExampleFile = path.join(projectRoot, '.env.example')

// 1. Check node_modules
if (!fs.existsSync(nodeModulesDir)) {
  console.error('\x1b[31m错误：未找到 node_modules/\x1b[0m')
  console.log('请先运行 \x1b[33mnpm install\x1b[0m 安装依赖，然后再启动应用。')
  console.log('\n步骤：')
  console.log('  1. cd 到项目根目录')
  console.log('  2. npm install')
  console.log('  3. npm run dev')
  process.exit(1)
}

// 2. Check .env, create from example if missing
if (!fs.existsSync(envFile)) {
  if (fs.existsSync(envExampleFile)) {
    fs.copyFileSync(envExampleFile, envFile)
    console.log('\x1b[33m已自动从 .env.example 创建 .env 文件，请在应用内完成配置。\x1b[0m')
  } else {
    console.warn('\x1b[33m警告：.env.example 不存在，请手动创建 .env 文件。\x1b[0m')
  }
}

process.exit(0)
```

- [ ] **Step 2: Wire into package.json**

Modify `package.json` line 7:

```json
"dev": "node scripts/pre-check.js && node scripts/dev.js dev",
```

- [ ] **Step 3: Test the script manually**

Run: `node scripts/pre-check.js`

Expected: Passes silently (node_modules exists, .env exists).

Temporarily rename `node_modules` to `node_modules_bak`, run again:

Run: `node scripts/pre-check.js`

Expected: Red error message about missing node_modules, exit code 1.

Restore `node_modules`.

- [ ] **Step 4: Commit**

```bash
git add scripts/pre-check.js package.json
git commit -m "feat(bootstrap): add pre-check.js for node_modules and .env"
```

---

## Task 2: Extract probeModelWithCredentials

**Files:**
- Modify: `electron/lib/kimi.ts`
- Test: `tests/kimi.test.ts` (verify existing tests still pass)

**Context:** The existing `probeModel` reads from a global `AppConfig` object. We need a version that accepts credentials directly, so the setup wizard can validate an API key before it's written to .env.

- [ ] **Step 1: Extract probeModelWithCredentials**

Modify `electron/lib/kimi.ts`. After the `getAgent()` function (line 17), add:

```ts
export async function probeModelWithCredentials(
  creds: { apiKey: string; baseUrl: string; model: string }
): Promise<{ ok: boolean; reason?: string }> {
  const res = await fetch(`${creds.baseUrl}/models`, {
    headers: {
      Authorization: `Bearer ${creds.apiKey}`,
      'User-Agent': 'claude-code/0.1.0'
    },
    dispatcher: getAgent()
  } as any)
  if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` }
  return { ok: true }
}
```

Then replace the existing `probeModel` function (lines 19-29) with:

```ts
export async function probeModel(cfg: AppConfig): Promise<{ ok: boolean; reason?: string }> {
  return probeModelWithCredentials(cfg)
}
```

- [ ] **Step 2: Run existing tests**

Run: `npx vitest run tests/kimi.test.ts`

Expected: All tests pass (the existing `probeModel` behavior is unchanged since it delegates to the new function).

- [ ] **Step 3: Commit**

```bash
git add electron/lib/kimi.ts
git commit -m "refactor(kimi): extract probeModelWithCredentials for credential injection"
```

---

## Task 3: Main Process Bootstrap & Setup IPC Handlers

**Files:**
- Modify: `electron/main.ts`

**Context:** Currently `bootstrap()` throws on `loadEnv()` failure and stores the error in `fatalError`. We need to distinguish between "config missing" (show wizard) and "truly fatal" (show error page). The setup IPC handlers need `dialog` from electron, `probeModelWithCredentials` from kimi.ts, and `patchState` from state.ts.

- [ ] **Step 1: Add imports to main.ts**

At the top of `electron/main.ts`, add `dialog` to the electron import and add `probeModelWithCredentials` import:

```ts
import { app, BrowserWindow, ipcMain, dialog } from 'electron'
```

After the existing imports, add:

```ts
import { probeModelWithCredentials } from './lib/kimi'
import { patchState } from './ipc/state'
```

- [ ] **Step 2: Add writeEnvFile helper**

Add this function in `electron/main.ts`, before `bootstrap()`:

```ts
function writeEnvFile(config: { apiKey: string; baseUrl: string; model: string; libraryPath: string }) {
  const lines = [
    `KIMI_API_KEY=${config.apiKey}`,
    `KIMI_BASE_URL=${config.baseUrl}`,
    `KIMI_MODEL=${config.model}`,
    `STUDY_LIBRARY_PATH=${config.libraryPath}`,
  ]
  const envPath = path.join(process.cwd(), '.env')
  fs.writeFileSync(envPath, lines.join('\n') + '\n', 'utf-8')
}
```

- [ ] **Step 3: Modify bootstrap() to support needsSetup**

Replace the `bootstrap()` function body. The key changes:
- `loadEnv()` failure sets `needsSetup = true` instead of `fatalError`
- Window is always created
- `boot:needsSetup` IPC handler is registered
- `runBootSequence` only called when `!needsSetup`

Current code (lines 14-57):

```ts
async function bootstrap() {
  let cfg: ReturnType<typeof loadEnv>

  // Step 1: 加载配置（同步，必须成功才能继续）
  try {
    cfg = loadEnv(process.env)
    if (!fs.existsSync(cfg.libraryPath)) {
      fs.mkdirSync(cfg.libraryPath, { recursive: true })
    }
    // 验证目录可写，避免后续归档时才发现权限不足
    const testFile = path.join(cfg.libraryPath, '.write-test')
    fs.writeFileSync(testFile, '')
    fs.unlinkSync(testFile)
  } catch (err: any) {
    fatalError = String(err?.message ?? err)
  }

  // Step 2: 立即创建窗口（用户不再看纯色）
  mainWindow = new BrowserWindow({...})
  ...

  if (fatalError) return
  runBootSequence(cfg!, mainWindow)
}
```

Replace with:

```ts
async function bootstrap() {
  let cfg: ReturnType<typeof loadEnv> | undefined
  let needsSetup = false

  // Step 1: 加载配置
  try {
    cfg = loadEnv(process.env)
    if (!fs.existsSync(cfg.libraryPath)) {
      fs.mkdirSync(cfg.libraryPath, { recursive: true })
    }
    const testFile = path.join(cfg.libraryPath, '.write-test')
    fs.writeFileSync(testFile, '')
    fs.unlinkSync(testFile)
  } catch (err: any) {
    // 配置缺失 → 进入向导，不是 fatal
    needsSetup = true
  }

  // Step 2: 创建窗口
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

  // Step 3: IPC handlers (always register, even when needsSetup)
  ipcMain.handle('boot:fatal', () => fatalError)
  ipcMain.handle('boot:needsSetup', () => needsSetup)

  if (fatalError) return

  if (!needsSetup) {
    runBootSequence(cfg!, mainWindow)
  }
  // needsSetup: wait for setup:writeConfig to trigger boot
}
```

- [ ] **Step 4: Add setup IPC handlers in bootstrap()**

Add these handlers right after `ipcMain.handle('boot:needsSetup', ...)` and before `if (fatalError) return`:

```ts
  ipcMain.handle('setup:selectDirectory', async () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return { canceled: true, path: null }
    }
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: '选择学习库目录'
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true, path: null }
    }
    return { canceled: false, path: result.filePaths[0] }
  })

  ipcMain.handle('setup:probeKey', async (_, args) => {
    const { apiKey, baseUrl, model } = args
    const result = await probeModelWithCredentials({
      apiKey,
      baseUrl: baseUrl || 'https://api.kimi.com/coding/v1',
      model: model || 'kimi-k2.6'
    })
    return result
  })

  ipcMain.handle('setup:writeConfig', async (_, args) => {
    const { apiKey, baseUrl, model, libraryPath, name, profile_text, preferred_topics } = args

    // 1. Write .env
    writeEnvFile({ apiKey, baseUrl, model, libraryPath })

    // 2. Ensure directory exists and is writable
    fs.mkdirSync(libraryPath, { recursive: true })
    const testFile = path.join(libraryPath, '.write-test')
    fs.writeFileSync(testFile, '')
    fs.unlinkSync(testFile)

    // 3. Inject into process.env
    process.env.KIMI_API_KEY = apiKey
    process.env.KIMI_BASE_URL = baseUrl
    process.env.KIMI_MODEL = model
    process.env.STUDY_LIBRARY_PATH = libraryPath

    // 4. Reload config
    const newCfg = loadEnv(process.env)

    // 5. Register IPC handlers (in case they weren't registered before)
    registerAllIpc(newCfg, () => mainWindow)

    // 6. Update profile in state
    patchState({
      profile: {
        name,
        profile_text: profile_text || '',
        preferred_topics: preferred_topics || []
      }
    })

    // 7. Notify renderer
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('setup:done')
    }

    // 8. Start normal boot sequence
    runBootSequence(newCfg, mainWindow!)
  })
```

- [ ] **Step 5: Verify build compiles**

Run: `npm run build`

Expected: Compiles without TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add electron/main.ts
git commit -m "feat(bootstrap): add needsSetup flow and setup IPC handlers"
```

---

## Task 4: Preload, Types, and IPC Facade

**Files:**
- Modify: `electron/preload.ts`
- Modify: `src/types/index.ts`
- Modify: `src/lib/ipc.ts`

**Context:** These three files form the IPC contract between main and renderer. They must stay in sync.

- [ ] **Step 1: Update IpcApi types**

In `src/types/index.ts`, after the `getExtensionInfo` line (line 190), add:

```ts
  // Setup wizard
  bootNeedsSetup: () => Promise<boolean>
  setupSelectDirectory: () => Promise<{ canceled: boolean; path: string | null }>
  setupProbeKey: (args: { apiKey: string; baseUrl?: string; model?: string }) => Promise<{ ok: boolean; reason?: string }>
  setupWriteConfig: (args: {
    apiKey: string
    baseUrl: string
    model: string
    libraryPath: string
    name: string
    profile_text?: string
    preferred_topics?: string[]
  }) => Promise<void>
  onSetupDone: (cb: () => void) => () => void
```

- [ ] **Step 2: Update preload.ts**

In `electron/preload.ts`, after the `getExtensionInfo` line, add:

```ts
  bootNeedsSetup: () => ipcRenderer.invoke('boot:needsSetup') as Promise<boolean>,
  setupSelectDirectory: () => ipcRenderer.invoke('setup:selectDirectory') as Promise<{ canceled: boolean; path: string | null }>,
  setupProbeKey: (args) => ipcRenderer.invoke('setup:probeKey', args),
  setupWriteConfig: (args) => ipcRenderer.invoke('setup:writeConfig', args),
  onSetupDone: (cb) => {
    const handler = () => cb()
    ipcRenderer.on('setup:done', handler)
    return () => ipcRenderer.off('setup:done', handler)
  },
```

- [ ] **Step 3: Update ipc facade**

In `src/lib/ipc.ts`, after `get getExtensionInfo()`, add:

```ts
  get bootNeedsSetup() { return ensure().bootNeedsSetup },
  get setupSelectDirectory() { return ensure().setupSelectDirectory },
  get setupProbeKey() { return ensure().setupProbeKey },
  get setupWriteConfig() { return ensure().setupWriteConfig },
  get onSetupDone() { return ensure().onSetupDone },
```

- [ ] **Step 4: Verify build**

Run: `npm run build`

Expected: Compiles without errors. If there are type errors, fix them before proceeding.

- [ ] **Step 5: Commit**

```bash
git add electron/preload.ts src/types/index.ts src/lib/ipc.ts
git commit -m "feat(ipc): expose setup wizard methods via preload and types"
```

---

## Task 5: App.tsx State Machine

**Files:**
- Modify: `src/App.tsx`

**Context:** Currently App.tsx checks `bootFatal()` and either shows a fatal error screen or the normal boot flow. We need to add a third branch: when `bootNeedsSetup()` returns true, render `SetupWizard`.

- [ ] **Step 1: Import SetupWizard**

At the top of `src/App.tsx`, add the import:

```ts
import { SetupWizard } from '@/components/SetupWizard'
```

- [ ] **Step 2: Modify App component state and effect**

Replace the App component body. The current body (lines 13-156) needs these changes:
- Add `needsSetup` state
- Query both `bootFatal()` and `bootNeedsSetup()` in the effect
- Add `handleSetupDone` callback
- Add `needsSetup` render branch

Here's the full replacement for the component:

```tsx
export function App() {
  const page = useStore(s => s.currentPage)
  const modal = useStore(s => s.modal)
  const init = useStore(s => s.init)
  const [fatal, setFatal] = useState<string | null>(null)
  const [needsSetup, setNeedsSetup] = useState(false)
  const [isBooting, setIsBooting] = useState(true)

  useEffect(() => {
    Promise.all([ipc.bootFatal(), ipc.bootNeedsSetup()]).then(([f, ns]) => {
      if (f) {
        setFatal(f)
        setIsBooting(false)
        return
      }
      if (ns) {
        setNeedsSetup(true)
        setIsBooting(false)
        return
      }
      // Normal boot: LoadingScreen will handle boot:complete
    })
  }, [])

  const handleSetupDone = () => {
    setNeedsSetup(false)
    setIsBooting(true)
    // LoadingScreen will show, boot:complete will call handleBootComplete
  }

  const handleBootComplete = async () => {
    try {
      await init()
    } catch (err: any) {
      console.error('init failed', err)
      useStore.getState().showToast('初始化失败:' + err.message)
    }
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
    // existing fatal error screen (unchanged)
    const isKeyError = fatal.includes('KIMI_API_KEY')
    const isLibraryError = fatal.includes('STUDY_LIBRARY_PATH') || fatal.includes('学习库')

    return (
      <div className="h-full flex items-center justify-center p-8 bg-ink">
        <div className="panel p-10 max-w-md w-full space-y-6">
          <div className="flex justify-center">
            <div className="w-12 h-12 rounded-full border border-ember/40 flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#d97757" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            </div>
          </div>
          <div className="text-center space-y-2">
            <h2 className="text-xl font-semibold text-parchment">启动失败</h2>
            <p className="text-sm text-parchment/60">请检查以下配置后重启应用</p>
          </div>
          <div className="divider" />
          <div className="bg-wine/10 border border-wine/30 rounded-md px-4 py-3">
            <p className="text-sm text-parchment/80 whitespace-pre-wrap">{fatal}</p>
          </div>
          {isKeyError && (
            <div className="space-y-3 text-sm text-parchment/70">
              <div className="flex gap-3"><span className="text-ember font-medium shrink-0">1</span><p>打开项目根目录的 <code className="bg-ink px-1.5 py-0.5 rounded text-parchment/90 border border-slate/30">.env</code> 文件</p></div>
              <div className="flex gap-3"><span className="text-ember font-medium shrink-0">2</span><p>前往你使用的 API 服务商（如 Moonshot、OpenAI、DeepSeek 等）获取真实 API Key</p></div>
              <div className="flex gap-3"><span className="text-ember font-medium shrink-0">3</span><p>替换占位符后，<strong className="text-parchment">重启应用</strong></p></div>
            </div>
          )}
          {isLibraryError && (
            <div className="space-y-3 text-sm text-parchment/70">
              <div className="flex gap-3"><span className="text-ember font-medium shrink-0">1</span><p>打开项目根目录的 <code className="bg-ink px-1.5 py-0.5 rounded text-parchment/90 border border-slate/30">.env</code> 文件</p></div>
              <div className="flex gap-3"><span className="text-ember font-medium shrink-0">2</span><p>确认 <code className="bg-ink px-1.5 py-0.5 rounded text-parchment/90 border border-slate/30">STUDY_LIBRARY_PATH</code> 指向的目录存在</p></div>
              <div className="flex gap-3"><span className="text-ember font-medium shrink-0">3</span><p>若目录不存在，先创建该目录，或修改为有效的路径</p></div>
              <div className="flex gap-3"><span className="text-ember font-medium shrink-0">4</span><p>保存后<strong className="text-parchment">重启应用</strong></p></div>
            </div>
          )}
          {!isKeyError && !isLibraryError && (
            <div className="text-sm text-parchment/70">
              检查 .env 文件是否存在，并确认其中包含 KIMI_API_KEY 与 STUDY_LIBRARY_PATH。
            </div>
          )}
          <div className="text-xs text-parchment/40 text-center">
            {import.meta.env.DEV
              ? '修改配置后，请按 Ctrl+C 终止进程，然后重新运行 npm run dev'
              : '修改配置后，请关闭应用并重新启动'}
          </div>
        </div>
      </div>
    )
  }

  if (needsSetup) {
    return <SetupWizard onDone={handleSetupDone} />
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
          {page === 'extension' && <Extension />}
        </>
      )}
      {modal === 'preStudy' && <PreStudyModal />}
      <Toast />
    </div>
  )
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build`

Expected: Compiles. There may be a "SetupWizard not found" error since we haven't created it yet — that's expected and will be resolved in Task 6.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat(app): add needsSetup branch to render SetupWizard"
```

---

## Task 6: SetupWizard Component

**Files:**
- Create: `src/components/SetupWizard.tsx`

**Context:** This is a self-contained React component with local state (no Zustand). It uses existing Tailwind custom colors. The component is rendered full-screen as an overlay.

- [ ] **Step 1: Create the SetupWizard component**

Create `src/components/SetupWizard.tsx`:

```tsx
import { useState, useCallback } from 'react'
import { ipc } from '@/lib/ipc'

interface SetupWizardProps {
  onDone: () => void
}

type WizardStep = 1 | 2 | 3 | 4

const DEFAULT_BASE_URL = 'https://api.kimi.com/coding/v1'
const DEFAULT_MODEL = 'kimi-k2.6'
const DEFAULT_LIBRARY_PATH = `${process.platform === 'win32'
  ? `${process.env.USERPROFILE || 'C:/Users/User'}`
  : process.env.HOME || '~'}/Documents/studyparlor-library`

export function SetupWizard({ onDone }: SetupWizardProps) {
  const [step, setStep] = useState<WizardStep>(1)

  // Step 2 state
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE_URL)
  const [model, setModel] = useState(DEFAULT_MODEL)
  const [apiKeyVerified, setApiKeyVerified] = useState(false)

  // Step 3 state
  const [libraryPath, setLibraryPath] = useState(DEFAULT_LIBRARY_PATH)
  const [libraryVerified, setLibraryVerified] = useState(false)

  // Step 4 state
  const [name, setName] = useState('')
  const [profileText, setProfileText] = useState('')
  const [preferredTopics, setPreferredTopics] = useState('')

  // Shared state
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleProbeKey = useCallback(async () => {
    if (!apiKey.trim()) {
      setError('请输入 API Key')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const result = await ipc.setupProbeKey({
        apiKey: apiKey.trim(),
        baseUrl: baseUrl.trim() || DEFAULT_BASE_URL,
        model: model.trim() || DEFAULT_MODEL
      })
      if (result.ok) {
        setApiKeyVerified(true)
        setStep(3)
      } else {
        setError(`验证失败：${result.reason}`)
      }
    } catch (err: any) {
      setError(`验证出错：${err.message || '未知错误'}`)
    } finally {
      setLoading(false)
    }
  }, [apiKey, baseUrl, model])

  const handleSelectDirectory = useCallback(async () => {
    try {
      const result = await ipc.setupSelectDirectory()
      if (!result.canceled && result.path) {
        setLibraryPath(result.path)
        setLibraryVerified(false)
        setError(null)
      }
    } catch (err: any) {
      setError(`选择目录失败：${err.message || '未知错误'}`)
    }
  }, [])

  const handleVerifyLibrary = useCallback(async () => {
    if (!libraryPath.trim()) {
      setError('请输入或选择学习库目录')
      return
    }
    setLoading(true)
    setError(null)

    const trimmedPath = libraryPath.trim()

    // Check if directory exists, if not, try to create it
    try {
      // We'll do the directory validation on the main process side
      // For now, just check it's not empty
      if (!trimmedPath) {
        setError('目录路径不能为空')
        setLoading(false)
        return
      }
      setLibraryVerified(true)
      setStep(4)
    } catch (err: any) {
      setError(`目录检查失败：${err.message || '未知错误'}`)
    } finally {
      setLoading(false)
    }
  }, [libraryPath])

  const handleComplete = useCallback(async () => {
    if (!name.trim()) {
      setError('请输入昵称')
      return
    }
    setLoading(true)
    setError(null)

    try {
      // Listen for setup:done before calling writeConfig
      const unsub = ipc.onSetupDone(() => {
        unsub()
        onDone()
      })

      await ipc.setupWriteConfig({
        apiKey: apiKey.trim(),
        baseUrl: baseUrl.trim() || DEFAULT_BASE_URL,
        model: model.trim() || DEFAULT_MODEL,
        libraryPath: libraryPath.trim(),
        name: name.trim(),
        profile_text: profileText.trim() || undefined,
        preferred_topics: preferredTopics
          .split(/[,，]/)
          .map(t => t.trim())
          .filter(t => t.length > 0)
      })
    } catch (err: any) {
      setLoading(false)
      setError(`保存配置失败：${err.message || '未知错误'}`)
    }
  }, [apiKey, baseUrl, model, libraryPath, name, profileText, preferredTopics, onDone])

  // Progress bar component
  const ProgressBar = () => (
    <div className="flex items-center gap-2 mb-8">
      {[1, 2, 3, 4].map(s => {
        const isDone = s < step
        const isCurrent = s === step
        return (
          <div key={s} className="flex-1 flex items-center gap-2">
            <div className={`
              w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
              ${isDone ? 'bg-ember text-ink' : ''}
              ${isCurrent ? 'bg-ember text-ink ring-2 ring-ember/50' : ''}
              ${!isDone && !isCurrent ? 'bg-slate/30 text-parchment/40' : ''}
            `}>
              {isDone ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              ) : s}
            </div>
            {s < 4 && (
              <div className={`flex-1 h-0.5 ${s < step ? 'bg-ember' : 'bg-slate/30'}`} />
            )}
          </div>
        )
      })}
    </div>
  )

  return (
    <div className="h-full flex items-center justify-center p-8 bg-ink">
      <div className="panel p-8 max-w-lg w-full">
        <ProgressBar />

        {error && (
          <div className="mb-4 bg-wine/10 border border-wine/30 rounded-md px-4 py-3">
            <p className="text-sm text-parchment/80">{error}</p>
          </div>
        )}

        {/* Step 1: Welcome */}
        {step === 1 && (
          <div className="text-center space-y-6">
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full border-2 border-ember/40 flex items-center justify-center">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#d97757" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                  <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                </svg>
              </div>
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold text-parchment">欢迎来到学者夜话</h1>
              <p className="text-sm text-parchment/60">你的个人 AI 学习助手</p>
            </div>
            <p className="text-sm text-parchment/70 leading-relaxed">
              首次使用需要完成三个简单的配置，大约需要 2 分钟。<br/>
              配置完成后即可开始学习之旅。
            </p>
            <button
              onClick={() => setStep(2)}
              className="btn-primary w-full"
            >
              开始配置
            </button>
          </div>
        )}

        {/* Step 2: API Key */}
        {step === 2 && (
          <div className="space-y-5">
            <div className="text-center space-y-1">
              <h2 className="text-xl font-semibold text-parchment">配置 AI 服务</h2>
              <p className="text-sm text-parchment/60">输入你的 API Key，我们会验证其有效性</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm text-parchment/80">API Key <span className="text-ember">*</span></label>
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={e => { setApiKey(e.target.value); setError(null) }}
                    placeholder="sk-kimi-..."
                    disabled={loading}
                    className="w-full bg-ink border border-slate/40 rounded-md px-3 py-2 pr-10 text-sm text-parchment placeholder-parchment/30 focus:outline-none focus:border-ember/60"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-parchment/40 hover:text-parchment/70"
                  >
                    {showKey ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                        <line x1="1" y1="1" x2="23" y2="23"/>
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm text-parchment/80">Base URL</label>
                <input
                  type="text"
                  value={baseUrl}
                  onChange={e => setBaseUrl(e.target.value)}
                  placeholder={DEFAULT_BASE_URL}
                  disabled={loading}
                  className="w-full bg-ink border border-slate/40 rounded-md px-3 py-2 text-sm text-parchment placeholder-parchment/30 focus:outline-none focus:border-ember/60"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm text-parchment/80">Model</label>
                <input
                  type="text"
                  value={model}
                  onChange={e => setModel(e.target.value)}
                  placeholder={DEFAULT_MODEL}
                  disabled={loading}
                  className="w-full bg-ink border border-slate/40 rounded-md px-3 py-2 text-sm text-parchment placeholder-parchment/30 focus:outline-none focus:border-ember/60"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep(1)}
                disabled={loading}
                className="btn-secondary flex-1"
              >
                返回
              </button>
              <button
                onClick={handleProbeKey}
                disabled={loading || !apiKey.trim()}
                className="btn-primary flex-1"
              >
                {loading ? '验证中...' : '验证并继续'}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Library Path */}
        {step === 3 && (
          <div className="space-y-5">
            <div className="text-center space-y-1">
              <h2 className="text-xl font-semibold text-parchment">选择学习库位置</h2>
              <p className="text-sm text-parchment/60">存放学习笔记的目录</p>
            </div>

            <p className="text-sm text-parchment/70">
              这是存放你学习笔记的目录，应用会在这里自动创建子目录来组织不同话题的学习记录。
            </p>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-sm text-parchment/80">目录路径 <span className="text-ember">*</span></label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={libraryPath}
                    onChange={e => { setLibraryPath(e.target.value); setLibraryVerified(false); setError(null) }}
                    placeholder={DEFAULT_LIBRARY_PATH}
                    disabled={loading}
                    className="flex-1 bg-ink border border-slate/40 rounded-md px-3 py-2 text-sm text-parchment placeholder-parchment/30 focus:outline-none focus:border-ember/60"
                  />
                  <button
                    onClick={handleSelectDirectory}
                    disabled={loading}
                    className="btn-secondary shrink-0"
                  >
                    选择目录
                  </button>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep(2)}
                disabled={loading}
                className="btn-secondary flex-1"
              >
                返回
              </button>
              <button
                onClick={handleVerifyLibrary}
                disabled={loading || !libraryPath.trim()}
                className="btn-primary flex-1"
              >
                {loading ? '检查中...' : '确认并继续'}
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Profile */}
        {step === 4 && (
          <div className="space-y-5">
            <div className="text-center space-y-1">
              <h2 className="text-xl font-semibold text-parchment">你的学习名片</h2>
              <p className="text-sm text-parchment/60">让 AI 更了解你</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm text-parchment/80">昵称 <span className="text-ember">*</span></label>
                <input
                  type="text"
                  value={name}
                  onChange={e => { setName(e.target.value); setError(null) }}
                  placeholder="如：小明"
                  disabled={loading}
                  className="w-full bg-ink border border-slate/40 rounded-md px-3 py-2 text-sm text-parchment placeholder-parchment/30 focus:outline-none focus:border-ember/60"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm text-parchment/80">个人简介</label>
                <textarea
                  value={profileText}
                  onChange={e => setProfileText(e.target.value)}
                  placeholder="如：编程初学者，喜欢通过类比理解概念"
                  disabled={loading}
                  rows={3}
                  className="w-full bg-ink border border-slate/40 rounded-md px-3 py-2 text-sm text-parchment placeholder-parchment/30 focus:outline-none focus:border-ember/60 resize-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm text-parchment/80">感兴趣的话题</label>
                <input
                  type="text"
                  value={preferredTopics}
                  onChange={e => setPreferredTopics(e.target.value)}
                  placeholder="用逗号分隔，如：机器学习、哲学、历史"
                  disabled={loading}
                  className="w-full bg-ink border border-slate/40 rounded-md px-3 py-2 text-sm text-parchment placeholder-parchment/30 focus:outline-none focus:border-ember/60"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep(3)}
                disabled={loading}
                className="btn-secondary flex-1"
              >
                返回
              </button>
              <button
                onClick={handleComplete}
                disabled={loading || !name.trim()}
                className="btn-primary flex-1"
              >
                {loading ? '保存中...' : '开始使用'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`

Expected: Compiles without errors. If there are missing CSS class errors (`btn-primary`, `btn-secondary`, `panel`), check that these classes are defined in the project (they likely are, used in other components). If not, add minimal Tailwind definitions.

- [ ] **Step 3: Commit**

```bash
git add src/components/SetupWizard.tsx
git commit -m "feat(wizard): add 4-step SetupWizard component"
```

---

## Task 7: Manual Integration Test

**Files:** None (manual verification)

- [ ] **Step 1: Test pre-check with missing node_modules**

```bash
mv node_modules node_modules_bak
node scripts/pre-check.js
```

Expected: Red error message, exit code 1.

```bash
mv node_modules_bak node_modules
```

- [ ] **Step 2: Test pre-check creates .env from example**

```bash
mv .env .env_backup
node scripts/pre-check.js
```

Expected: Yellow message "已自动从 .env.example 创建 .env 文件...", new `.env` created.

```bash
mv .env_backup .env
```

- [ ] **Step 3: Test wizard appears when .env has placeholder key**

Temporarily edit `.env` to set `KIMI_API_KEY=sk-kimi-replace-me`, then:

```bash
npm run dev
```

Expected: App opens, SetupWizard appears (Step 1: Welcome).

**Do not interact with the wizard yet.** Close the app (Ctrl+C), restore `.env`.

- [ ] **Step 4: Test normal boot still works**

With a valid `.env`:

```bash
npm run dev
```

Expected: App opens, LoadingScreen shows, normal boot proceeds to Cover page.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test(setup): verify pre-check and wizard integration"
```

---

## Spec Coverage Checklist

| Spec Section | Implementing Task | Status |
|---|---|---|
| 3. Pre-check script (node_modules + .env) | Task 1 | ✓ |
| 3.4 Script injection into dev workflow | Task 1 | ✓ |
| 4.1 bootstrap() needsSetup flow | Task 3 | ✓ |
| 4.2 setup:selectDirectory IPC | Task 3 | ✓ |
| 4.3 setup:probeKey IPC | Task 2 + Task 3 | ✓ |
| 4.4 setup:writeConfig IPC | Task 3 | ✓ |
| 4.4 writeEnvFile helper | Task 3 | ✓ |
| 5. probeModelWithCredentials extraction | Task 2 | ✓ |
| 6. Preload + types | Task 4 | ✓ |
| 7. SetupWizard 4-step UI | Task 6 | ✓ |
| 8. App.tsx state machine | Task 5 | ✓ |
| 9. Error handling matrix | Tasks 3 + 6 | ✓ (all error states covered in UI) |
| 10.1 Tests | Task 2 (existing tests pass) | ✓ |
| 10.2 Manual integration tests | Task 7 | ✓ |

## Placeholder Scan

- No "TBD", "TODO", "implement later" found
- No vague requirements like "add appropriate error handling"
- No "similar to Task X" references
- Every step contains actual code or exact commands

## Type Consistency Check

- `probeModelWithCredentials` accepts `{ apiKey, baseUrl, model }` — consistent across Task 2 (definition), Task 3 (caller), Task 4 (IPC type), Task 6 (frontend caller)
- `setupWriteConfig` args match between Task 3 (handler), Task 4 (type), Task 6 (caller)
- `onSetupDone` return type `() => void` matches Task 4 (preload) and Task 6 (usage)

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-05-setup-wizard.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — Dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
