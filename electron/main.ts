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
}

app.whenReady().then(bootstrap)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) bootstrap()
})
