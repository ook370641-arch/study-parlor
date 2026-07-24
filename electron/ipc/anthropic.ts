import { ipcMain } from 'electron'
import { discoverArticles, importArticle } from '../lib/anthropic-scraper'
import { deleteAnthropicArticleFile } from '../lib/anthropic-delete'
import { cancelCurrentOperation } from '../lib/anthropic-browser'
import { patchState, getCurrentState } from './state'
import type { AppConfig } from '../env'
import type { AnthropicErrorCode, AnthropicBlogCache } from '@shared/index'

function classifyError(err: unknown): { code: AnthropicErrorCode; message: string } {
  const msg = err instanceof Error ? err.message : String(err)
  const lower = msg.toLowerCase()
  if (lower.includes('cancelled')) {
    return { code: 'cancelled', message: '导入已取消' }
  }
  if (lower.includes('offline') || lower.includes('network_error') || lower.includes('networkerror')) {
    return { code: 'network-error', message: '网络连接失败，请检查网络后重试' }
  }
  if (lower.includes('timeout')) {
    return { code: 'network-error', message: '请求超时，请稍后重试' }
  }
  if (lower.includes('parse') || lower.includes('json')) {
    return { code: 'parse-error', message: '解析页面失败，Anthropic 网站结构可能已变更' }
  }
  if (lower.includes('load failed')) {
    return { code: 'network-error', message: '页面加载失败，请检查网络后重试' }
  }
  return { code: 'unknown', message: msg || '未知错误' }
}

export function registerAnthropicIpc(cfg: AppConfig) {
  ipcMain.handle('anthropic:discover', async () => {
    const prev = getCurrentState().anthropicBlogCache
    const loadingCache: AnthropicBlogCache = {
      lastFetchedAt: prev?.lastFetchedAt ?? null,
      articles: prev?.articles ?? [],
      loading: true,
      error: null,
    }
    await patchState({ anthropicBlogCache: loadingCache })

    try {
      // E2E hook: force an offline/network failure without touching the network.
      // Gated on NODE_ENV=test + E2E_CONFIG_DIR so unit tests and prod never take it.
      if (
        process.env.NODE_ENV === 'test' &&
        process.env.E2E_CONFIG_DIR &&
        process.env.E2E_ANTHROPIC_OFFLINE === '1'
      ) {
        throw new Error('NETWORK_ERROR: offline (E2E)')
      }
      const result = await discoverArticles(cfg.libraryPath)
      const cache: AnthropicBlogCache = {
        lastFetchedAt: result.lastFetchedAt,
        articles: result.articles,
        loading: false,
        error: null,
      }
      await patchState({ anthropicBlogCache: cache })
      return { ok: true as const, lastFetchedAt: result.lastFetchedAt, articles: result.articles }
    } catch (err) {
      const error = classifyError(err)
      const cache: AnthropicBlogCache = {
        lastFetchedAt: prev?.lastFetchedAt ?? null,
        articles: prev?.articles ?? [],
        loading: false,
        error,
      }
      await patchState({ anthropicBlogCache: cache })
      return { ok: false as const, code: error.code, message: error.message }
    }
  })

  ipcMain.handle('anthropic:importArticle', async (_, url: string) => {
    try {
      const result = await importArticle(url, cfg.libraryPath)
      return { ok: true as const, filePath: result.filePath, wasAlreadySaved: result.wasAlreadySaved }
    } catch (err) {
      const error = classifyError(err)
      return { ok: false as const, code: error.code, message: error.message }
    }
  })

  ipcMain.handle('anthropic:cancelImport', async () => {
    cancelCurrentOperation()
  })

  ipcMain.handle('anthropic:deleteArticle', async (_, args: { filePath: string }) => {
    return deleteAnthropicArticleFile(cfg.libraryPath, args.filePath)
  })
}
