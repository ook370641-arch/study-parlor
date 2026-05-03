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
