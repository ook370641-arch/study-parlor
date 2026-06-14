# Settings Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an in-app Settings page to Study Parlor so users can view and edit API Key, Base URL, Model, and study library directory, with API Key validation and a manual-restart notice after saving.

**Architecture:** Reuse the existing `.env` persistence layer and setup wizard IPC (`setupProbeKey`, `setupSelectDirectory`). Add a small config IPC layer (`getConfig`/`writeConfig`) and a new `Settings` page that mirrors the `Profile`/`Extension` full-screen overlay style. Store navigation state in the existing Zustand `Page` union.

**Tech Stack:** Electron 30, React 18, TypeScript, Tailwind CSS, Zustand, Vitest.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `electron/env.ts` | Add `saveEnv()` to serialize `AppConfig` back to `.env` |
| `tests/env.test.ts` | Unit tests for `saveEnv()` |
| `electron/ipc/config.ts` | New IPC handlers: `config:get`, `config:write` |
| `electron/ipc/index.ts` | Register `registerConfigIpc()` |
| `src/types/index.ts` | Add `getConfig` / `writeConfig` to `IpcApi` |
| `electron/preload.ts` | Bridge new IPC calls to renderer |
| `src/lib/ipc.ts` | Expose typed facade for new IPC |
| `src/pages/Settings.tsx` | New settings page component |
| `tests/settings.test.tsx` | Unit tests for settings page |
| `src/store/index.ts` | Add `'settings'` to `Page` union |
| `src/App.tsx` | Render `<Settings />` when `currentPage === 'settings'` |
| `src/pages/Home.tsx` | Add "设置" button to top-right, shift existing buttons |

---

### Task 1: Add `saveEnv()` to serialize config back to `.env`

**Files:**
- Modify: `electron/env.ts`
- Test: `tests/env.test.ts`

**Why:** The settings page writes config changes back to `.env`. We need a serializer that preserves unknown lines and updates only the four known keys.

- [ ] **Step 1: Write the failing test**

First, update the import at the top of `tests/env.test.ts`:

```ts
import { loadEnv, saveEnv } from '@electron/env'
```

Then add the following at the end of the file, before the final `})`:

```ts
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

describe('saveEnv', () => {
  let tmpDir: string
  let envPath: string
  const originalCwd = process.cwd()

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-env-'))
    envPath = path.join(tmpDir, '.env')
    process.chdir(tmpDir)
  })

  afterEach(() => {
    process.chdir(originalCwd)
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('writes four config keys to .env', () => {
    saveEnv({
      apiKey: 'sk-kimi-new',
      baseUrl: 'https://api.kimi.com/coding/v1',
      model: 'kimi-k2.6',
      libraryPath: 'C:/new-library'
    })
    const content = fs.readFileSync(envPath, 'utf-8')
    expect(content).toContain('KIMI_API_KEY=sk-kimi-new')
    expect(content).toContain('STUDY_LIBRARY_PATH=C:/new-library')
    expect(content).toContain('KIMI_BASE_URL=https://api.kimi.com/coding/v1')
    expect(content).toContain('KIMI_MODEL=kimi-k2.6')
  })

  it('updates existing keys and preserves unknown lines', () => {
    fs.writeFileSync(envPath, '# comment\nKIMI_API_KEY=old\nUNKNOWN=value\n')
    saveEnv({
      apiKey: 'sk-kimi-new',
      baseUrl: 'https://api.kimi.com/coding/v1',
      model: 'kimi-k2.6',
      libraryPath: 'C:/new-library'
    })
    const content = fs.readFileSync(envPath, 'utf-8')
    expect(content).toContain('KIMI_API_KEY=sk-kimi-new')
    expect(content).toContain('# comment')
    expect(content).toContain('UNKNOWN=value')
    expect(content).not.toContain('KIMI_API_KEY=old')
  })

  it('appends keys that do not exist', () => {
    fs.writeFileSync(envPath, 'KIMI_API_KEY=only\n')
    saveEnv({
      apiKey: 'only',
      baseUrl: 'https://api.kimi.com/coding/v1',
      model: 'kimi-k2.6',
      libraryPath: 'C:/new-library'
    })
    const content = fs.readFileSync(envPath, 'utf-8')
    expect(content).toContain('KIMI_BASE_URL=https://api.kimi.com/coding/v1')
    expect(content).toContain('KIMI_MODEL=kimi-k2.6')
    expect(content).toContain('STUDY_LIBRARY_PATH=C:/new-library')
  })

  it('sanitizes model before writing', () => {
    saveEnv({
      apiKey: 'sk-kimi-x',
      baseUrl: 'https://api.kimi.com/coding/v1',
      model: '\x1b[1mkimi-k2.6\x1b[0m',
      libraryPath: 'C:/foo'
    })
    const content = fs.readFileSync(envPath, 'utf-8')
    expect(content).toContain('KIMI_MODEL=kimi-k2.6')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
npx vitest run tests/env.test.ts
```

Expected: tests fail with `saveEnv is not a function` or similar.

- [ ] **Step 3: Implement `saveEnv()`**

Modify `electron/env.ts`:

```ts
import fs from 'node:fs'
import path from 'node:path'

const ENV_PATH = path.join(process.cwd(), '.env')

export function saveEnv(config: AppConfig): void {
  const model = sanitizeModel(config.model.trim() || 'kimi-k2.6')
  const baseUrl = config.baseUrl.trim() || 'https://api.kimi.com/coding/v1'

  let content = ''
  if (fs.existsSync(ENV_PATH)) {
    content = fs.readFileSync(ENV_PATH, 'utf-8')
  }

  const lines = content.split(/\r?\n/)
  const keys = [
    { key: 'KIMI_API_KEY', value: config.apiKey.trim() },
    { key: 'KIMI_BASE_URL', value: baseUrl },
    { key: 'KIMI_MODEL', value: model },
    { key: 'STUDY_LIBRARY_PATH', value: config.libraryPath.trim() },
  ]

  const updated = new Set<string>()
  const newLines = lines.map((line) => {
    const match = line.match(/^([A-Za-z0-9_]+)=/)
    if (!match) return line
    const entry = keys.find((k) => k.key === match[1])
    if (!entry) return line
    updated.add(entry.key)
    return `${entry.key}=${entry.value}`
  })

  for (const entry of keys) {
    if (!updated.has(entry.key)) {
      newLines.push(`${entry.key}=${entry.value}`)
    }
  }

  fs.writeFileSync(ENV_PATH, newLines.join('\n') + '\n')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
npx vitest run tests/env.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add electron/env.ts tests/env.test.ts
git commit -m "feat(env): add saveEnv to write AppConfig back to .env"
```

---

### Task 2: Add config IPC handlers

**Files:**
- Create: `electron/ipc/config.ts`
- Modify: `electron/ipc/index.ts`

**Why:** The renderer needs a safe way to read and write config. We expose only `getConfig` and `writeConfig` rather than raw filesystem access.

- [ ] **Step 1: Create `electron/ipc/config.ts`**

```ts
import { ipcMain } from 'electron'
import { loadEnv, saveEnv } from '../env'
import type { AppConfig } from '../env'

export function registerConfigIpc() {
  ipcMain.handle('config:get', async (): Promise<AppConfig> => {
    return loadEnv(process.env)
  })

  ipcMain.handle('config:write', async (_, config: AppConfig): Promise<void> => {
    saveEnv(config)
  })
}
```

- [ ] **Step 2: Register the handlers**

Modify `electron/ipc/index.ts`:

```ts
import { registerConfigIpc } from './config'

export function registerAllIpc(cfg: AppConfig, getMainWindow: () => BrowserWindow | null) {
  registerConfigIpc()
  registerFilesIpc(cfg)
  registerStateIpc()
  registerLlmIpc(cfg, getMainWindow)
  registerSessionsIpc()
}
```

- [ ] **Step 3: Commit**

```bash
git add electron/ipc/config.ts electron/ipc/index.ts
git commit -m "feat(ipc): add config:get and config:write handlers"
```

---

### Task 3: Wire IPC through types, preload, and facade

**Files:**
- Modify: `src/types/index.ts`
- Modify: `electron/preload.ts`
- Modify: `src/lib/ipc.ts`

**Why:** TypeScript needs to know about the new IPC on both sides of the bridge.

- [ ] **Step 1: Add types**

In `src/types/index.ts`, add to `IpcApi` (after `getExtensionInfo` is a good spot):

```ts
  // Config
  getConfig: () => Promise<AppConfig>
  writeConfig: (config: AppConfig) => Promise<void>
```

Make sure `AppConfig` is imported at the top of `src/types/index.ts`. Add:

```ts
import type { AppConfig } from '@electron/env'
```

- [ ] **Step 2: Add preload bridge**

In `electron/preload.ts`, add to the `api` object (after `getExtensionInfo`):

```ts
  getConfig: () => ipcRenderer.invoke('config:get'),
  writeConfig: (config) => ipcRenderer.invoke('config:write', config),
```

- [ ] **Step 3: Add facade**

In `src/lib/ipc.ts`, add after `getExtensionInfo`:

```ts
  get getConfig() { return ensure().getConfig },
  get writeConfig() { return ensure().writeConfig },
```

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts electron/preload.ts src/lib/ipc.ts
git commit -m "feat(ipc): expose getConfig and writeConfig to renderer"
```

---

### Task 4: Add `settings` to navigation model

**Files:**
- Modify: `src/store/index.ts`
- Modify: `src/App.tsx`

**Why:** The app needs to know about the new page.

- [ ] **Step 1: Update Page union**

In `src/store/index.ts`:

```ts
type Page = 'cover' | 'home' | 'study' | 'profile' | 'extension' | 'settings'
```

- [ ] **Step 2: Render Settings page**

In `src/App.tsx`, import and render:

```ts
import { Settings } from '@/pages/Settings'
```

And in the page switch block:

```tsx
{page === 'settings' && <Settings />}
```

- [ ] **Step 3: Commit**

```bash
git add src/store/index.ts src/App.tsx
git commit -m "feat(nav): add settings page to router"
```

---

### Task 5: Add Settings button to Home page

**Files:**
- Modify: `src/pages/Home.tsx`

**Why:** Provide the entry point from the home screen, to the left of the "卷宗" button.

- [ ] **Step 1: Shift existing buttons and add Settings**

Modify the top-right button block in `src/pages/Home.tsx`:

```tsx
      <SwapPaintingButton surface="home" className="absolute top-4 right-52 z-10" />
      <Button variant="ghost"
        onClick={() => goto('settings')}
        className="absolute top-4 right-36 font-sans text-sm z-10">
        设置
      </Button>
      <Button variant="ghost"
        onClick={() => goto('profile')}
        className="absolute top-4 right-20 font-sans text-sm z-10">
        卷宗
      </Button>
      <Button variant="ghost"
        onClick={() => goto('extension')}
        className="absolute top-4 right-4 font-sans text-sm z-10">
        扩展
      </Button>
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/Home.tsx
git commit -m "feat(home): add settings button to top-right"
```

---

### Task 6: Implement the Settings page component

**Files:**
- Create: `src/pages/Settings.tsx`
- Test: `tests/settings.test.tsx`

**Why:** This is the core UI for editing config.

- [ ] **Step 1: Write the failing test**

Create `tests/settings.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Settings } from '@/pages/Settings'
import { ipc } from '@/lib/ipc'

vi.mock('@/lib/ipc', () => ({
  ipc: {
    getConfig: vi.fn(),
    writeConfig: vi.fn(),
    setupProbeKey: vi.fn(),
    setupSelectDirectory: vi.fn()
  }
}))

describe('Settings', () => {
  beforeEach(() => {
    vi.mocked(ipc.getConfig).mockResolvedValue({
      apiKey: 'sk-kimi-test',
      baseUrl: 'https://api.kimi.com/coding/v1',
      model: 'kimi-k2.6',
      libraryPath: 'C:/test-library'
    })
    vi.mocked(ipc.writeConfig).mockResolvedValue(undefined)
    vi.mocked(ipc.setupProbeKey).mockResolvedValue({ ok: true })
    vi.mocked(ipc.setupSelectDirectory).mockResolvedValue({ canceled: true, path: null })
  })

  it('renders current config values', async () => {
    render(<Settings />)
    await waitFor(() => expect(screen.getByDisplayValue('C:/test-library')).toBeInTheDocument())
    expect(screen.getByDisplayValue('https://api.kimi.com/coding/v1')).toBeInTheDocument()
    expect(screen.getByDisplayValue('kimi-k2.6')).toBeInTheDocument()
  })

  it('toggles API key visibility', async () => {
    render(<Settings />)
    await waitFor(() => expect(screen.getByDisplayValue('sk-kimi-test')).toBeInTheDocument())
    const input = screen.getByDisplayValue('sk-kimi-test')
    expect(input).toHaveAttribute('type', 'password')
    fireEvent.click(screen.getByText('显示'))
    expect(input).toHaveAttribute('type', 'text')
  })

  it('disables save and verify when API key is empty', async () => {
    render(<Settings />)
    await waitFor(() => expect(screen.getByDisplayValue('sk-kimi-test')).toBeInTheDocument())
    const keyInput = screen.getByDisplayValue('sk-kimi-test')
    fireEvent.change(keyInput, { target: { value: '' } })
    expect(screen.getByText('保存')).toBeDisabled()
    expect(screen.getByText('验证连接')).toBeDisabled()
  })

  it('calls writeConfig with form values on save', async () => {
    render(<Settings />)
    await waitFor(() => expect(screen.getByDisplayValue('sk-kimi-test')).toBeInTheDocument())
    fireEvent.click(screen.getByText('保存'))
    await waitFor(() => {
      expect(ipc.writeConfig).toHaveBeenCalledWith({
        apiKey: 'sk-kimi-test',
        baseUrl: 'https://api.kimi.com/coding/v1',
        model: 'kimi-k2.6',
        libraryPath: 'C:/test-library'
      })
    })
  })

  it('calls setupProbeKey when verify clicked', async () => {
    render(<Settings />)
    await waitFor(() => expect(screen.getByDisplayValue('sk-kimi-test')).toBeInTheDocument())
    fireEvent.click(screen.getByText('验证连接'))
    await waitFor(() => {
      expect(ipc.setupProbeKey).toHaveBeenCalledWith({
        apiKey: 'sk-kimi-test',
        baseUrl: 'https://api.kimi.com/coding/v1',
        model: 'kimi-k2.6'
      })
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/settings.test.tsx
```

Expected: fails because `Settings` component does not exist.

- [ ] **Step 3: Implement Settings page**

Create `src/pages/Settings.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { useStore } from '@/store'
import { Button } from '@/components/Button'
import { SurfaceBackground } from '@/components/SurfaceBackground'
import { SwapPaintingButton } from '@/components/SwapPaintingButton'
import { ipc } from '@/lib/ipc'
import type { AppConfig } from '@electron/env'

const DEFAULT_BASE_URL = 'https://api.kimi.com/coding/v1'
const DEFAULT_MODEL = 'kimi-k2.6'

type VerifyStatus =
  | { kind: 'idle'; message: '从未验证' }
  | { kind: 'loading'; message: '验证中...' }
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string }

export function Settings() {
  const goto = useStore(s => s.goto)
  const showToast = useStore(s => s.showToast)

  const [initialConfig, setInitialConfig] = useState<AppConfig | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [model, setModel] = useState('')
  const [libraryPath, setLibraryPath] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [verifyStatus, setVerifyStatus] = useState<VerifyStatus>({ kind: 'idle', message: '从未验证' })

  useEffect(() => {
    let mounted = true
    ipc.getConfig().then(cfg => {
      if (!mounted) return
      setInitialConfig(cfg)
      setApiKey(cfg.apiKey)
      setBaseUrl(cfg.baseUrl)
      setModel(cfg.model)
      setLibraryPath(cfg.libraryPath)
    }).catch(err => {
      setError(err.message || '读取配置失败')
    })
    return () => { mounted = false }
  }, [])

  const resetForm = () => {
    if (!initialConfig) return
    setApiKey(initialConfig.apiKey)
    setBaseUrl(initialConfig.baseUrl)
    setModel(initialConfig.model)
    setLibraryPath(initialConfig.libraryPath)
    setError(null)
    setVerifyStatus({ kind: 'idle', message: '从未验证' })
  }

  const handleSelectDirectory = async () => {
    try {
      const result = await ipc.setupSelectDirectory()
      if (!result.canceled && result.path) {
        setLibraryPath(result.path)
      }
    } catch (err: any) {
      setError(err.message || '选择目录失败')
    }
  }

  const handleVerify = async () => {
    setError(null)
    setVerifyStatus({ kind: 'loading', message: '验证中...' })
    try {
      const result = await ipc.setupProbeKey({
        apiKey: apiKey.trim(),
        baseUrl: baseUrl.trim() || DEFAULT_BASE_URL,
        model: model.trim() || DEFAULT_MODEL
      })
      if (result.ok) {
        setVerifyStatus({ kind: 'success', message: '连接正常' })
      } else {
        setVerifyStatus({ kind: 'error', message: result.reason || '验证失败' })
      }
    } catch (err: any) {
      const msg = err?.message || String(err)
      if (msg.includes('401') || msg.includes('UNAUTHORIZED')) {
        setVerifyStatus({ kind: 'error', message: 'API Key 无效' })
      } else if (msg.includes('TIMEOUT') || msg.includes('timeout')) {
        setVerifyStatus({ kind: 'error', message: '网络超时' })
      } else {
        setVerifyStatus({ kind: 'error', message: '验证失败，请检查配置' })
      }
    }
  }

  const handleSave = async () => {
    setError(null)
    const config: AppConfig = {
      apiKey: apiKey.trim(),
      baseUrl: baseUrl.trim() || DEFAULT_BASE_URL,
      model: model.trim() || DEFAULT_MODEL,
      libraryPath: libraryPath.trim()
    }
    try {
      await ipc.writeConfig(config)
      setInitialConfig(config)
      showToast('配置已保存，重启后生效')
    } catch (err: any) {
      setError(err.message || '保存配置失败')
    }
  }

  const canSave = apiKey.trim().length > 0 && libraryPath.trim().length > 0
  const canVerify = apiKey.trim().length > 0

  return (
    <div className="fixed inset-0">
      <SurfaceBackground surface="home" />
      <SwapPaintingButton surface="home" className="absolute top-4 right-4 z-10" />

      <div className="absolute top-10 left-6 right-6 bottom-5 z-10">
        <div className="max-w-3xl mx-auto h-full flex flex-col">
          <div className="bg-ink/72 backdrop-blur-md border border-slate/30 rounded-xl flex flex-col h-full overflow-hidden">
            <div className="flex justify-between items-center px-6 pt-5 pb-3 border-b border-slate/25 shrink-0">
              <h2 className="text-2xl font-serif font-semibold">设置 · 仪器调校</h2>
              <button
                onClick={() => goto('home')}
                className="text-parchment/70 hover:text-parchment text-sm bg-transparent border-none cursor-pointer font-sans"
              >
                返回夜话
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-5">
              {error && (
                <div className="mb-4 bg-wine/10 border border-wine/40 rounded-md px-4 py-3">
                  <p className="text-sm text-parchment/80">{error}</p>
                </div>
              )}

              {/* AI 服务 */}
              <div className="bg-parchment/5 border border-slate/20 rounded-lg p-4 mb-4">
                <h3 className="text-ember font-semibold mb-4">AI 服务</h3>

                <div className="space-y-4">
                  <div>
                    <div className="text-[11px] text-parchment/60 font-sans mb-1">API Key</div>
                    <div className="flex gap-2">
                      <input
                        type={showKey ? 'text' : 'password'}
                        value={apiKey}
                        onChange={e => setApiKey(e.target.value)}
                        placeholder="sk-kimi-..."
                        className="flex-1 bg-ink/50 border border-slate/40 rounded-md px-3 py-2 text-sm text-parchment placeholder:text-parchment/30 focus:outline-none focus:border-ember/60"
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey(!showKey)}
                        className="px-3 py-2 border border-slate/40 rounded-md text-sm text-parchment/80 hover:text-parchment transition-colors shrink-0"
                      >
                        {showKey ? '隐藏' : '显示'}
                      </button>
                    </div>
                    {!canVerify && (
                      <div className="text-xs text-wine mt-1">请输入 API Key</div>
                    )}
                  </div>

                  <div>
                    <div className="text-[11px] text-parchment/60 font-sans mb-1">Base URL</div>
                    <input
                      type="text"
                      value={baseUrl}
                      onChange={e => setBaseUrl(e.target.value)}
                      placeholder={DEFAULT_BASE_URL}
                      className="w-full bg-ink/50 border border-slate/40 rounded-md px-3 py-2 text-sm text-parchment placeholder:text-parchment/30 focus:outline-none focus:border-ember/60"
                    />
                  </div>

                  <div>
                    <div className="text-[11px] text-parchment/60 font-sans mb-1">Model</div>
                    <input
                      type="text"
                      value={model}
                      onChange={e => setModel(e.target.value)}
                      placeholder={DEFAULT_MODEL}
                      className="w-full bg-ink/50 border border-slate/40 rounded-md px-3 py-2 text-sm text-parchment placeholder:text-parchment/30 focus:outline-none focus:border-ember/60"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3 mt-4">
                  <Button onClick={handleVerify} disabled={!canVerify}>
                    验证连接
                  </Button>
                  <span className={`text-xs ${
                    verifyStatus.kind === 'error' ? 'text-wine' :
                    verifyStatus.kind === 'success' ? 'text-green-400' :
                    'text-parchment/40'
                  }`}>
                    {verifyStatus.message}
                  </span>
                </div>
              </div>

              {/* 学习库 */}
              <div className="bg-parchment/5 border border-slate/20 rounded-lg p-4 mb-4">
                <h3 className="text-ember font-semibold mb-4">学习库</h3>
                <div>
                  <div className="text-[11px] text-parchment/60 font-sans mb-1">目录路径</div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={libraryPath}
                      onChange={e => setLibraryPath(e.target.value)}
                      className="flex-1 bg-ink/50 border border-slate/40 rounded-md px-3 py-2 text-sm text-parchment placeholder:text-parchment/30 focus:outline-none focus:border-ember/60"
                    />
                    <button
                      type="button"
                      onClick={handleSelectDirectory}
                      className="px-3 py-2 border border-slate/40 rounded-md text-sm text-parchment/80 hover:text-parchment transition-colors shrink-0"
                    >
                      选择目录
                    </button>
                  </div>
                </div>
              </div>

              {/* 保存 */}
              <div className="flex flex-col gap-3">
                <div className="flex gap-3">
                  <Button onClick={handleSave} disabled={!canSave}>
                    保存
                  </Button>
                  <Button variant="ghost" onClick={resetForm}>
                    作废
                  </Button>
                </div>
                <div className="text-xs text-parchment/40 border-l-2 border-slate/30 pl-3">
                  保存后需重启应用，改动才会生效。
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/settings.test.tsx
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Settings.tsx tests/settings.test.tsx
git commit -m "feat(settings): add settings page with config editing and validation"
```

---

### Task 7: Verify end-to-end

**Files:** none (manual verification)

**Why:** Confirm the UI, IPC, and `.env` writing work together in the real app.

- [ ] **Step 1: Start the app in dev mode**

```bash
npm run dev
```

- [ ] **Step 2: Open Settings from home page**

On the home page, click the new "设置" button (to the left of "卷宗"). Confirm the Settings page opens with the title "设置 · 仪器调校".

- [ ] **Step 3: Confirm current config is displayed**

Check that the API Key, Base URL, Model, and Library Path fields show the values from your `.env` file.

- [ ] **Step 4: Test API Key verification**

Enter a valid API Key and click "验证连接". Confirm the status changes to "连接正常". Then enter an invalid key and confirm it shows "API Key 无效".

- [ ] **Step 5: Test directory selection**

Click "选择目录" and pick a folder. Confirm the path field updates.

- [ ] **Step 6: Save and inspect `.env`**

Change the API Key or library path, click "保存", and confirm the toast appears. Then open `.env` in the project root and verify the values were written. Also confirm unknown lines and comments in `.env` were preserved.

- [ ] **Step 7: Restart and confirm**

Close and restart the app. Open Settings again and confirm the new values are displayed.

- [ ] **Step 8: Commit verification notes (optional)**

If you made any small fixes during verification, commit them:

```bash
git add ...
git commit -m "fix(settings): address verification findings"
```

---

## Self-Review

### Spec coverage

| Spec requirement | Plan task |
|------------------|-----------|
| 主页右上角新增"设置"入口 | Task 5 |
| 独立"设置"页面 | Task 4, Task 6 |
| 可编辑 API Key / Base URL / Model / 学习库目录 | Task 6 |
| API Key 实时探活验证 | Task 6 |
| 把配置写回 `.env` | Task 1, Task 2 |
| 保存后提示手动重启 | Task 6 |
| Base URL / Model 为空时回退默认值 | Task 1 (`saveEnv`), Task 6 (`handleSave`) |
| 保留 `.env` 中未知行和注释 | Task 1 tests |
| 视觉风格与 Extension/Profile 一致 | Task 6 (uses same card classes) |

### Placeholder scan

No TBD, TODO, or vague steps. Every task includes exact file paths, code, and commands.

### Type consistency

- `AppConfig` is defined in `electron/env.ts` and imported in `src/types/index.ts` via `@electron/env` alias.
- `getConfig` returns `Promise<AppConfig>`, `writeConfig` takes `AppConfig`.
- `setupProbeKey` signature matches existing usage.

### Gaps found and addressed

- Added `sanitizeModel` call inside `saveEnv` to keep model writing consistent with `loadEnv`.
- Added tests for empty-key disabled states on the Settings page.
- Explicitly set `right-*` Tailwind classes for four-button layout.
