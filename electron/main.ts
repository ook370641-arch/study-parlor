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

  // Step 3: 如果配置加载失败，fatal error 会由 App.tsx 处理
  ipcMain.handle('boot:fatal', () => fatalError)

  if (fatalError) return

  // Step 4: 后台并行初始化 + 推送进度
  runBootSequence(cfg!, mainWindow)
}

async function runBootSequence(cfg: ReturnType<typeof loadEnv>, win: BrowserWindow) {
  // 诊断日志：记录 boot sequence 开始
  console.log('[main:boot] runBootSequence started')

  // 等待 renderer 页面加载完成，确保 IPC 监听器已注册
  if (win.webContents.isLoading()) {
    console.log('[main:boot] waiting for renderer to finish loading...')
    await new Promise<void>(resolve => {
      win.webContents.once('did-finish-load', () => {
        console.log('[main:boot] renderer loaded')
        resolve()
      })
    })
  } else {
    console.log('[main:boot] renderer already loaded')
  }

  const sendProgress = (stage: string, progress: number) => {
    console.log(`[main:boot] sending progress: ${stage} ${progress}%`)
    if (!win.isDestroyed()) {
      win.webContents.send('boot:progress', stage, progress)
    }
  }

  const sendComplete = () => {
    console.log('[main:boot] sending complete')
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
