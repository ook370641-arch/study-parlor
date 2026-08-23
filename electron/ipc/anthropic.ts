import { ipcMain } from 'electron'
import { discoverArticles, importArticle, classifyError } from '../lib/anthropic-scraper'
import { deleteAnthropicArticleFile } from '../lib/anthropic-delete'
import { cancelCurrentOperation } from '../lib/anthropic-browser'
import { patchState, getCurrentState } from './state'
import { mergeArticlesByUrl } from '../../src/lib/anthropic-articles'
import type { AppConfig } from '../env'
import type { AnthropicBlogCache, AnthropicArticleMeta } from '@shared/index'
import type { ArticleMetaCache } from '../lib/anthropic-discover'
import { loadCollection, saveCollection, addManualEntry, removeEntry, applyRecommend } from '../lib/blog-collection'
import { writeArticleBody } from '../lib/article-io'
import { runBlogRecommend, collectLocalArticles } from '../lib/blog-recommend'
import type { BlogRecommendErrorCode, BlogCollectionEntry } from '@shared/index'

let recommendAbort: AbortController | null = null

function recommendErrorCode(err: unknown): BlogRecommendErrorCode {
  const c = (err as { code?: string })?.code
  if (c === 'NO_WRITING_CONTEXT' || c === 'NO_LOCAL_ARTICLES' || c === 'LLM_PARSE_ERROR' || c === 'ABORTED') return c
  return 'LLM_ERROR'
}

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
      // E2E hook: discover returns ok without touching the network, then asynchronously
      // emits a single backfill article (mirrors Task 4 runBackfill). Gated identically
      // to E2E_ANTHROPIC_OFFLINE so unit tests and prod never take it. The mock article
      // is merged into the persisted cache (same merge semantics as the real flow), so it
      // survives a renderer reload and the metaCache line in the final patch is preserved
      // (Task 8 backfill-event + articleMetaCache persistence E2E).
      if (
        process.env.NODE_ENV === 'test' &&
        process.env.E2E_CONFIG_DIR &&
        process.env.E2E_ANTHROPIC_BACKFILL === '1'
      ) {
        const now = new Date().toISOString()
        const mockArticle: AnthropicArticleMeta = {
          url: 'https://alignment.anthropic.com/2026/e2e-backfill/',
          title: 'E2E Backfill 回填文章',
          summary: 'E2E 回填摘要',
          publishedAt: '2026-07-20T00:00:00.000Z',
          imageUrl: null,
          section: 'alignment',
        }
        const articles = mergeArticlesByUrl(prev?.articles ?? [], [mockArticle])
        const cache: AnthropicBlogCache = {
          lastFetchedAt: now,
          articles,
          loading: false,
          error: null,
          sectionStatus: prev?.sectionStatus ?? {},
          articleMetaCache: metaCache,
        }
        // 持久化合并后的缓存（reload 后文章仍在 state.json），但 discover 返回值用原始列表——
        // backfill 事件是渲染侧唯一入场路径，确保「初始无该文 → 事件到达新行出现」在 IPC 层真实成立。
        await patchState({ anthropicBlogCache: cache })
        setTimeout(() => {
          send('anthropic:backfill', { articles: [mockArticle] })
        }, 1200)
        return {
          ok: true as const,
          lastFetchedAt: now,
          articles: prev?.articles ?? [],
          sectionStatus: cache.sectionStatus,
        }
      }
      // 回填批次累计，最终并入主结果——保证回填文章在 reload 后仍在时间线（而不只靠 metaCache 重建）。
      const backfilled: AnthropicArticleMeta[] = []
      const result = await discoverArticles(cfg.libraryPath, {
        metaCache,
        onBackfill: (articles, updatedMetaCache) => {
          backfilled.push(...articles)
          send('anthropic:backfill', { articles })
          const cur = getCurrentState().anthropicBlogCache ?? ({} as AnthropicBlogCache)
          patchState({
            anthropicBlogCache: { ...cur, articleMetaCache: updatedMetaCache },
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
      const listingMeta = getCurrentState().anthropicBlogCache?.articles.find((a) => a.url === url) ?? null
      const result = await importArticle(url, cfg.libraryPath, listingMeta)
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

  ipcMain.handle('anthropic:writeArticleBody', async (_, args: { filePath: string; body: string }) => {
    try {
      writeArticleBody(cfg.libraryPath, args.filePath, args.body)
      return { ok: true as const }
    } catch (err) {
      const c = (err as { code?: string })?.code
      return { ok: false as const, code: c === 'ARTICLE_PATH_FORBIDDEN' ? 'ARTICLE_PATH_FORBIDDEN' as const : 'ARTICLE_WRITE_ERROR' as const }
    }
  })

  ipcMain.handle('anthropic:collectionRead', async () => {
    return { ok: true as const, collection: loadCollection(cfg.libraryPath) }
  })

  ipcMain.handle('anthropic:collectionAdd', async (_, args: { sourceUrl: string; filePath: string; title: string }) => {
    const next = addManualEntry(loadCollection(cfg.libraryPath), args)
    saveCollection(cfg.libraryPath, next)
    return { ok: true as const, collection: next }
  })

  ipcMain.handle('anthropic:collectionRemove', async (_, args: { sourceUrl: string }) => {
    const next = removeEntry(loadCollection(cfg.libraryPath), args.sourceUrl)
    saveCollection(cfg.libraryPath, next)
    return { ok: true as const, collection: next }
  })

  ipcMain.handle('anthropic:recommendStart', async (event) => {
    if (recommendAbort) return { ok: false as const, code: 'ALREADY_RUNNING' as const }
    const ac = new AbortController()
    recommendAbort = ac
    const send = (channel: string, ...payload: unknown[]) => {
      if (!event.sender.isDestroyed()) event.sender.send(channel, ...payload)
    }
    void (async () => {
      try {
        // E2E mock：确定性推荐，不触网、不依赖真实本地文件。gate 同 E2E_ANTHROPIC_OFFLINE。
        if (process.env.NODE_ENV === 'test' && process.env.E2E_CONFIG_DIR && process.env.E2E_ANTHROPIC_RECOMMEND === '1') {
          const col = loadCollection(cfg.libraryPath)
          const batch = {
            batch: (col.history[0]?.batch ?? 0) + 1,
            generatedAt: new Date().toISOString(),
            profile: 'E2E 画像：正在研究 AI 对齐',
            gaps: ['E2E 缺口'],
            queries: ['alignment'],
            searchUsed: false,
          }
          const pickEntries: BlogCollectionEntry[] = [{
            sourceUrl: 'https://alignment.anthropic.com/e2e-recommend/',
            filePath: 'Anthropic博客/2026-08/e2e-recommend.md',
            title: 'E2E 推荐文章',
            addedAt: new Date().toISOString(),
            origin: 'recommend' as const,
            reason: 'E2E 推荐理由',
            gap: 'E2E 缺口',
            batch: batch.batch,
          }]
          const next = applyRecommend(col, batch, pickEntries)
          saveCollection(cfg.libraryPath, next)
          send('anthropic:recommendStage', { stage: 'context' })
          setTimeout(() => {
            send('anthropic:recommendStage', { stage: 'pick' })
            send('anthropic:recommendDone', { ok: true, collection: next })
          }, 100)
          return
        }
        const { batch, picks } = await runBlogRecommend(cfg, { signal: ac.signal, onStage: (s) => send('anthropic:recommendStage', { stage: s }) })
        const pool = collectLocalArticles(cfg.libraryPath)
        const now = new Date().toISOString()
        const pickEntries: BlogCollectionEntry[] = picks.map(p => {
          const a = pool.find(x => x.sourceUrl === p.sourceUrl)
          return { sourceUrl: p.sourceUrl, filePath: a?.filePath ?? '', title: a?.title ?? p.sourceUrl, addedAt: now, origin: 'recommend' as const, reason: p.reason, gap: p.gap, batch: batch.batch }
        })
        const next = applyRecommend(loadCollection(cfg.libraryPath), batch, pickEntries)
        saveCollection(cfg.libraryPath, next)
        send('anthropic:recommendDone', { ok: true, collection: next })
      } catch (err) {
        if (ac.signal.aborted) send('anthropic:recommendDone', { ok: false, code: 'ABORTED' })
        else send('anthropic:recommendDone', { ok: false, code: recommendErrorCode(err) })
      } finally {
        recommendAbort = null
      }
    })()
    return { ok: true as const }
  })

  ipcMain.handle('anthropic:recommendCancel', async () => {
    recommendAbort?.abort()
  })
}
