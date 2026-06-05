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

  // Step 3: 如果配置加载失败，fatal error 会由 App.tsx 处理
  ipcMain.handle('boot:fatal', () => fatalError)

  if (fatalError) return

  // Step 4: 后台并行初始化 + 推送进度
  runBootSequence(cfg!, mainWindow)
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
