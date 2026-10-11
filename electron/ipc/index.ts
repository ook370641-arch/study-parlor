import type { BrowserWindow } from 'electron'
import type { AppConfig } from '../env'
import { registerConfigIpc } from './config'
import { registerFilesIpc } from './files'
import { registerStateIpc } from './state'
import { registerLlmIpc } from './llm'
import { registerSessionsIpc } from './sessions'
import { registerSearchIpc } from './search'
import { registerAnthropicIpc } from './anthropic'
import { registerArticleAssistantIpc } from './article-assistant'
import { registerAnnotationsIpc } from './annotations'
import { registerAppIpc } from './app'
import { registerWritingIpc } from './writing'
import { registerWritingAssistantIpc } from './writing-assistant'
import { registerPaintingsIpc } from './paintings'

export function registerAllIpc(cfg: AppConfig, getMainWindow: () => BrowserWindow | null) {
  registerConfigIpc(cfg)
  registerFilesIpc(cfg)
  registerStateIpc(cfg)
  registerLlmIpc(cfg, getMainWindow)
  registerSessionsIpc()
  registerSearchIpc(cfg)
  registerAnthropicIpc(cfg)
  registerArticleAssistantIpc(cfg)
  registerAnnotationsIpc(cfg)
  registerWritingIpc(cfg)
  registerWritingAssistantIpc(cfg)
  registerPaintingsIpc()
  registerAppIpc()
}
