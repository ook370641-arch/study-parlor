import { ipcMain } from 'electron'
import { discoverArticles, importArticle, classifyError } from '../lib/anthropic-scraper'
import { deleteAnthropicArticleFile } from '../lib/anthropic-delete'
import { cancelCurrentOperation } from '../lib/anthropic-browser'
import { patchState, getCurrentState } from './state'
import { mergeArticlesByUrl } from '../../src/lib/anthropic-articles'
import type { AppConfig } from '../env'
import type { AnthropicBlogCache, AnthropicArticleMeta } from '@shared/index'
import type { ArticleMetaCache } from '../lib/anthropic-discover'

export function registerAnthropicIpc(cfg: AppConfig) {
  ipcMain.handle('anthropic:discover', async (event) => {
    const prev = getCurrentState().anthropicBlogCache
    const metaCache: ArticleMetaCache = prev?.articleMetaCache ?? {}
    const send = (channel: string, ...payload: unknown[]) => {
      if (event.sender.isDestroyed()) return
      event.sender.send(channel, ...payload)
    }
    const loadingCache: AnthropicBlogCache = {
      lastFetchedAt: prev?.lastFetchedAt ?? null,
      articles: prev?.articles ?? [],
      loading: true,
      error: null,
      sectionStatus: prev?.sectionStatus ?? {},
      articleMetaCache: metaCache,
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
      // 回填批次累计，最终并入主结果——保证回填文章在 reload 后仍在时间线（而不只靠 metaCache 重建）。
      const backfilled: AnthropicArticleMeta[] = []
      const result = await discoverArticles(cfg.libraryPath, {
        metaCache,
        onBackfill: (articles, updatedMetaCache) => {
          backfilled.push(...articles)
          send('anthropic:backfill', { articles })
          patchState({
            anthropicBlogCache: { ...getCurrentState().anthropicBlogCache, articleMetaCache: updatedMetaCache },
          })
        },
      })
      const articles = backfilled.length > 0 ? mergeArticlesByUrl(result.articles, backfilled) : result.articles
      const cache: AnthropicBlogCache = {
        lastFetchedAt: result.lastFetchedAt,
        articles,
        loading: false,
        error: null,
        sectionStatus: result.sectionStatus,
        // runBackfill 原地 mutation 的是同一个 metaCache 对象；最终 patch 必须带上它，
        // 否则顶层浅合并会用缺 articleMetaCache 的 cache 整体替换，抹掉本轮回填结果。
        articleMetaCache: metaCache,
      }
      await patchState({ anthropicBlogCache: cache })
      return { ok: true as const, lastFetchedAt: result.lastFetchedAt, articles, sectionStatus: result.sectionStatus }
    } catch (err) {
      const error = classifyError(err)
      const cache: AnthropicBlogCache = {
        lastFetchedAt: prev?.lastFetchedAt ?? null,
        articles: prev?.articles ?? [],
        loading: false,
        error,
        sectionStatus: prev?.sectionStatus ?? {},
        articleMetaCache: prev?.articleMetaCache ?? {},
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
