import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import dotenv from 'dotenv'
import { loadEnv, saveEnv, setConfigDir, setStateDir, getEnvPath } from './env'
import { registerAllIpc } from './ipc'
import { probeModel, probeModelWithCredentials } from './lib/kimi'
import { patchState } from './ipc/state'
import { resolveAppPaths } from './lib/app-paths'

// In packaged builds cwd is not writable for our config — macOS launches the
// .app with cwd=/ (read-only system volume → EROFS), Windows uses the install
// dir (may be Program Files → EPERM, and wiped on uninstall/update).
//
// We therefore keep runtime state (state.json) under the user's home dir
// (~/.studyparlor) by default. Dev mode keeps .env in cwd for convenience,
// but still writes state.json to ~/.studyparlor so dev and packaged builds
// share the same profile.
//
// E2E tests can override both dirs for full isolation.
const paths = resolveAppPaths({
  cwd: process.cwd(),
  homeDir: os.homedir(),
  e2eConfigDir: process.env.E2E_CONFIG_DIR,
  isPackaged: app.isPackaged,
})

setConfigDir(paths.configDir)
setStateDir(paths.stateDir)

if (process.env.E2E_CONFIG_DIR || !app.isPackaged) {
  // Only override userData/cache for isolated environments (E2E and dev).
  // Packaged builds keep Electron defaults under %APPDATA%/study-parlor.
  fs.mkdirSync(paths.userData, { recursive: true })
  fs.mkdirSync(paths.cache, { recursive: true })
  app.setPath('userData', paths.userData)
  app.setPath('cache', paths.cache)
}

dotenv.config({ path: getEnvPath() })

process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err)
})
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason)
})

let mainWindow: BrowserWindow | null = null
let fatalError: string | null = null
let pendingBootCfg: ReturnType<typeof loadEnv> | null = null
let bootCompleted = false
let bootT0 = 0
function bootTs(): string {
  if (!bootT0) bootT0 = Date.now()
  return `[+${String(Date.now() - bootT0).padStart(5, '0')}ms]`
}

const isDev = !!process.env.ELECTRON_RENDERER_URL

if (isDev) {
  app.commandLine.appendSwitch('remote-debugging-port', '9222')
}

function verifyPackagedResources(): string | null {
  if (process.env.ELECTRON_RENDERER_URL) return null
  const required = [
    path.join(__dirname, '../preload/index.js'),
    path.join(__dirname, '../renderer/index.html')
  ]
  for (const file of required) {
    if (!fs.existsSync(file)) {
      return `打包资源缺失: ${file}`
    }
  }
  return null
}

async function bootstrap() {
  bootT0 = Date.now()
  console.log('[bootstrap] start', bootTs())

  // E2E tests can inject a temporary library path via environment variable.
  if (process.env.E2E_STUDY_LIBRARY_PATH) {
    process.env.STUDY_LIBRARY_PATH = process.env.E2E_STUDY_LIBRARY_PATH
    console.log('[bootstrap] E2E library override:', process.env.STUDY_LIBRARY_PATH, bootTs())
  }

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
    console.log('[bootstrap] env loaded, library:', cfg.libraryPath, bootTs())
  } catch (err: any) {
    // 配置缺失 → 进入向导，不是 fatal
    console.log('[bootstrap] setup required:', err.message, bootTs())
    needsSetup = true
  }

  // Step 1.5: 打包后资源路径校验（仅生产模式）
  const resourceError = verifyPackagedResources()
  if (resourceError) {
    fatalError = resourceError
    console.error('[bootstrap] resource check failed:', resourceError)
  }

  // Step 2: 创建窗口（无论配置结果如何）
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
  console.log('[bootstrap] window created', bootTs())

  mainWindow.webContents.on('did-start-loading', () => {
    console.log('[bootstrap] renderer did-start-loading', bootTs())
  })
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[bootstrap] renderer did-finish-load', bootTs())
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  // Keep external links in the system browser instead of navigating the app window.
  const isExternalLink = (targetUrl: string, currentUrl: string): boolean => {
    if (!/^https?:\/\//.test(targetUrl)) return false
    try {
      const target = new URL(targetUrl)
      const base = new URL(currentUrl || 'http://localhost')
      return target.origin !== base.origin
    } catch {
      return false
    }
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalLink(url, mainWindow?.webContents.getURL() ?? '')) {
      shell.openExternal(url).catch(err => console.error('[shell] openExternal failed:', err))
    }
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isExternalLink(url, mainWindow?.webContents.getURL() ?? '')) {
      event.preventDefault()
      shell.openExternal(url).catch(err => console.error('[shell] openExternal failed:', err))
    }
  })

  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          isDev
            ? "default-src 'self'; script-src 'self' 'unsafe-inline'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; connect-src 'self' https://api.kimi.com"
            : "default-src 'self'; script-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; connect-src 'self' https://api.kimi.com"
        ]
      }
    })
  })

  // Step 3: IPC handlers
  ipcMain.handle('boot:fatal', () => fatalError)
  ipcMain.handle('boot:needsSetup', () => needsSetup)

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
    // E2E tests can bypass the network probe for reliability.
    if (process.env.E2E_SKIP_PROBE === '1') {
      return { ok: true }
    }
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

    // Mark setup as done BEFORE writing .env, because Vite dev server watches
    // .env and triggers a full-reload of the renderer — the reloaded page will
    // query boot:needsSetup immediately, so it must already be false.
    needsSetup = false

    // 1. Write .env
    saveEnv({ apiKey, baseUrl, model, libraryPath })

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

    // 5. Update profile in state
    patchState({
      profile: {
        name,
        profile_text: profile_text || '',
        preferred_topics: preferred_topics || []
      }
    })

    // 6. Store config for when renderer requests boot
    pendingBootCfg = newCfg

    // 7. Notify renderer setup is done (triggers page transition to LoadingScreen)
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('setup:done')
    }
  })

  if (fatalError) return

  // Renderer calls this when LoadingScreen mounts and is ready to receive events
  ipcMain.handle('boot:start', async () => {
    console.log('[bootstrap] boot:start invoked', bootTs())
    if (!mainWindow || mainWindow.isDestroyed()) return { alreadyCompleted: false }
    if (bootCompleted) {
      console.log('[bootstrap] boot already completed, sending boot:complete on reload', bootTs())
      mainWindow.webContents.send('boot:complete')
      return { alreadyCompleted: true }
    }
    const cfg = pendingBootCfg
    if (!cfg) return { alreadyCompleted: false }
    pendingBootCfg = null
    console.log('[bootstrap] boot sequence start', bootTs())
    await runBootSequence(cfg, mainWindow)
    bootCompleted = true
    console.log('[bootstrap] boot sequence complete', bootTs())
    return { alreadyCompleted: false }
  })

  if (!needsSetup) {
    pendingBootCfg = cfg!
  }
  // needsSetup: wait for setup:writeConfig to trigger boot
}

async function runBootSequence(cfg: ReturnType<typeof loadEnv>, win: BrowserWindow) {
  // 等待 renderer 页面加载完成，确保 IPC 监听器已注册
  if (win.webContents.isLoading()) {
    await new Promise<void>(resolve => {
      win.webContents.once('did-finish-load', resolve)
    })
  }

  const send = (stage: string, progress: number) => {
    if (!win.isDestroyed()) {
      win.webContents.send('boot:progress', stage, progress)
    }
  }

  const sendComplete = () => {
    if (!win.isDestroyed()) {
      win.webContents.send('boot:complete')
    }
  }

  // 平滑动画推送进度：在 [duration] 毫秒内从 [from] 推进到 [to]
  const animate = async (stage: string, from: number, to: number, duration: number) => {
    const start = Date.now()
    while (true) {
      const elapsed = Date.now() - start
      const t = Math.min(1, elapsed / duration)
      // ease-out cubic
      const ease = 1 - Math.pow(1 - t, 3)
      send(stage, Math.round(from + (to - from) * ease))
      if (t >= 1) break
      await new Promise(r => setTimeout(r, 50)) // 每 50ms 更新一次
    }
  }

  const bootSeqStart = Date.now()

  // ===== 阶段 1: 注册 IPC =====
  console.time('[bootstrap] stage: register IPC')
  console.log('[bootstrap] stage: register IPC', bootTs())
  registerAllIpc(cfg, () => mainWindow)
  await animate('注册服务', 0, 15, 300)
  console.timeEnd('[bootstrap] stage: register IPC')

  // ===== 阶段 2: 探活模型（网络请求，最耗时）=====
  console.time('[bootstrap] stage: probe model')
  console.log('[bootstrap] stage: probe model', bootTs())
  const probeStart = Date.now()
  try {
    const probeResult = await probeModel(cfg)
    if (!probeResult.ok) {
      console.warn('[bootstrap] model probe failed:', probeResult.reason, bootTs())
    }
  } catch (err) {
    console.warn('[bootstrap] model probe error:', err, bootTs())
  }
  const probeElapsed = Date.now() - probeStart
  // 探活期间进度从 15% 平滑推进到 50%
  await animate('探活模型', 15, 50, Math.max(400, probeElapsed))
  console.timeEnd('[bootstrap] stage: probe model')

  // ===== 阶段 3: 扫描学习库 =====
  console.time('[bootstrap] stage: scan library')
  console.log('[bootstrap] stage: scan library', bootTs())
  await animate('扫描学习库', 50, 75, 500)
  console.timeEnd('[bootstrap] stage: scan library')

  // ===== 阶段 4: 初始化状态 =====
  console.time('[bootstrap] stage: init state')
  console.log('[bootstrap] stage: init state', bootTs())
  await animate('初始化状态', 75, 95, 400)
  console.timeEnd('[bootstrap] stage: init state')

  // ===== 阶段 5: 就绪 =====
  console.time('[bootstrap] stage: ready')
  console.log('[bootstrap] stage: ready', bootTs())
  await animate('就绪', 95, 100, 300)
  sendComplete()
  console.timeEnd('[bootstrap] stage: ready')
  console.log('[bootstrap] boot sequence total:', Date.now() - bootSeqStart, 'ms', bootTs())
}

app.whenReady().then(() => {
  console.log('[bootstrap] app.whenReady', bootTs())
  bootstrap()
})
app.on('window-all-closed', () => {
  mainWindow = null
  if (process.platform !== 'darwin') {
    // In dev mode, explicitly close any remaining webContents and exit.
    // This prevents electron.exe from lingering when the user clicks the
    // window close button, which would otherwise keep the DevTools port
    // and Vite dev-server connections alive.
    for (const wc of BrowserWindow.getAllWindows().map(w => w.webContents)) {
      if (!wc.isDestroyed()) wc.close()
    }
    app.quit()
  }
})
app.on('before-quit', () => {
  console.log('[bootstrap] app before-quit')
})
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) bootstrap()
})
