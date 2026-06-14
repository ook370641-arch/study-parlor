import type { BrowserWindow } from 'electron'
import type { AppConfig } from '../env'
import { registerConfigIpc } from './config'
import { registerFilesIpc } from './files'
import { registerStateIpc } from './state'
import { registerLlmIpc } from './llm'
import { registerSessionsIpc } from './sessions'

export function registerAllIpc(cfg: AppConfig, getMainWindow: () => BrowserWindow | null) {
  registerConfigIpc()
  registerFilesIpc(cfg)
  registerStateIpc()
  registerLlmIpc(cfg, getMainWindow)
  registerSessionsIpc()
}
