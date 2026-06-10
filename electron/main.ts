import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import dotenv from 'dotenv'
import { loadEnv } from './env'
import { registerAllIpc } from './ipc'
import { probeModel, probeModelWithCredentials } from './lib/kimi'
import { patchState } from './ipc/state'

dotenv.config()

process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err)
})
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason)
})

let mainWindow: BrowserWindow | null = null
let fatalError: string | null = null
let pendingBootCfg: ReturnType<typeof loadEnv> | null = null

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

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  const isDev = !!process.env.ELECTRON_RENDERER_URL
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
    const cfg = pendingBootCfg
    if (!cfg || !mainWindow || mainWindow.isDestroyed()) return
    pendingBootCfg = null
    await runBootSequence(cfg, mainWindow)
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

  // ===== 阶段 1: 注册 IPC =====
  registerAllIpc(cfg, () => mainWindow)
  await animate('注册服务', 0, 15, 300)

  // ===== 阶段 2: 探活模型（网络请求，最耗时）=====
  const probeStart = Date.now()
  try {
    const probeResult = await probeModel(cfg)
    if (!probeResult.ok) {
      console.warn('[bootstrap] model probe failed:', probeResult.reason)
    }
  } catch (err) {
    console.warn('[bootstrap] model probe error:', err)
  }
  const probeElapsed = Date.now() - probeStart
  // 探活期间进度从 15% 平滑推进到 50%
  await animate('探活模型', 15, 50, Math.max(400, probeElapsed))

  // ===== 阶段 3: 扫描学习库 =====
  await animate('扫描学习库', 50, 75, 500)

  // ===== 阶段 4: 初始化状态 =====
  await animate('初始化状态', 75, 95, 400)

  // ===== 阶段 5: 就绪 =====
  await animate('就绪', 95, 100, 300)
  sendComplete()
}

app.whenReady().then(bootstrap)
app.on('window-all-closed', () => {
  mainWindow = null
  if (process.platform !== 'darwin') app.quit()
})
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) bootstrap()
})
