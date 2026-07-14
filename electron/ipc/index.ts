import type { BrowserWindow } from 'electron'
import type { AppConfig } from '../env'
import { registerConfigIpc } from './config'
import { registerFilesIpc } from './files'
import { registerStateIpc } from './state'
import { registerLlmIpc } from './llm'
import { registerSessionsIpc } from './sessions'
import { registerBriefingIpc } from './briefing'
import { registerJobBriefingIpc } from './job-briefing'
import { getCurrentState } from './state'
import { DEFAULT_JOB_BRIEFING_CONFIG } from '../lib/job-briefing'
import { registerSearchIpc } from './search'
import { registerAnthropicIpc } from './anthropic'
import { registerArticleAssistantIpc } from './article-assistant'
import { registerAnnotationsIpc } from './annotations'
import { registerAppIpc } from './app'

export function registerAllIpc(cfg: AppConfig, getMainWindow: () => BrowserWindow | null) {
  registerConfigIpc()
  registerFilesIpc(cfg)
  registerStateIpc()
  registerLlmIpc(cfg, getMainWindow)
  registerSessionsIpc()
  registerBriefingIpc(cfg)
  registerJobBriefingIpc(cfg, () => getCurrentState().jobBriefingConfig ?? DEFAULT_JOB_BRIEFING_CONFIG)
  registerSearchIpc(cfg)
  registerAnthropicIpc(cfg)
  registerArticleAssistantIpc(cfg)
  registerAnnotationsIpc(cfg)
  registerAppIpc()
}
