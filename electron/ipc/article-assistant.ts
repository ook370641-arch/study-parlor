import fs from 'node:fs'
import path from 'node:path'
import { ipcMain } from 'electron'
import { chatNonStream, chatStream } from '../lib/kimi'
import { searchWeb } from '../lib/search'
import { getSearchApiKey } from '../lib/credentials'
import { extractJsonObject } from '../lib/extract-json'
import { parseFrontmatter, serializeFrontmatter } from '../lib/frontmatter'
import { dumpRecovery } from '../lib/recovery'
import {
  buildAssistantSystemPrompt,
  buildAssistantUserPrompt,
  formatSearchResults,
} from '../lib/article-assistant-prompt'
import type { AppConfig } from '../env'
import type {
  ArticleAssistantChunk,
  ArticleAssistantErrorCode,
  ArticleAssistantGuide,
  ArticleAssistantGuideFile,
  ArticleAssistantMessage,
  ArticleAssistantSessionFile,
  ArticleAssistantTerm,
  Message,
} from '@shared/index'

const assistantSessions = new Map<string, AbortController>()

// E2E deterministic mock is active only when BOTH the test NODE_ENV and the
// E2E isolation marker are set. Gating on both keeps unit tests (which run with
// NODE_ENV=test but no E2E_CONFIG_DIR) on the real code path. See rule e2e.md §1.
function isE2EMock(): boolean {
  return process.env.NODE_ENV === 'test' && !!process.env.E2E_CONFIG_DIR
}

function typedError(code: ArticleAssistantErrorCode, message: string): Error & { code: ArticleAssistantErrorCode } {
  const err = new Error(message) as Error & { code: ArticleAssistantErrorCode }
  err.code = code
  return err
}

function promptsDir(): string {
  const candidates = [
    path.resolve(__dirname, '..', 'prompts'),
    path.resolve(__dirname, '..', '..', 'electron', 'prompts'),
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  throw new Error(`article-assistant prompts dir not found. Tried: ${candidates.join(', ')}`)
}

function isValidTerm(value: unknown): value is ArticleAssistantTerm {
  const o = value as Record<string, unknown> | null
  return !!o && typeof o.term === 'string' && typeof o.translation === 'string' && typeof o.explanation === 'string'
}

function isValidChunk(value: unknown): value is ArticleAssistantChunk {
  const o = value as Record<string, unknown> | null
  return !!o && typeof o.heading === 'string' && typeof o.summary === 'string' && Array.isArray(o.terms) && o.terms.every(isValidTerm)
}

function isValidGuide(value: unknown): value is ArticleAssistantGuide {
  const o = value as Record<string, unknown> | null
  return !!o && typeof o.background === 'string' && Array.isArray(o.chunks) && o.chunks.every(isValidChunk)
}

function sessionPathFor(parentPath: string): string {
  const parsed = path.parse(parentPath)
  return path.join(parsed.dir, `${parsed.name}.assistant.md`)
}

function guidePathFor(parentPath: string): string {
  const parsed = path.parse(parentPath)
  return path.join(parsed.dir, `${parsed.name}.guide.md`)
}

export function serializeGuide(guide: ArticleAssistantGuide): string {
  const chunks = guide.chunks.map((c, i) => {
    const terms = c.terms.length
      ? '\n\n' + c.terms.map((t) => `**上下文（context）**：${t.term}（${t.translation}）— ${t.explanation}`).join('\n\n')
      : ''
    return `## §${i + 1} ${c.heading}\n\n${c.summary}${terms}`
  }).join('\n\n')
  return `# 背景\n\n${guide.background}\n\n${chunks}`
}

export function parseAssistantGuideBody(body: string): ArticleAssistantGuide | null {
  const lines = body.split('\n')
  let background = ''
  let i = 0
  if (lines[0]?.startsWith('# ')) {
    i = 1
    while (i < lines.length && lines[i].trim() === '') i++
    const bgLines: string[] = []
    while (i < lines.length && !lines[i].startsWith('## ')) {
      if (lines[i].trim()) bgLines.push(lines[i].trim())
      i++
    }
    background = bgLines.join(' ')
  }

  const chunks: ArticleAssistantChunk[] = []
  while (i < lines.length) {
    const headingMatch = lines[i].match(/^## §\d+\s+(.+)$/)
    if (!headingMatch) { i++; continue }
    const heading = headingMatch[1].trim()
    i++
    while (i < lines.length && lines[i].trim() === '') i++
    const summaryLines: string[] = []
    const terms: ArticleAssistantTerm[] = []
    while (i < lines.length && !lines[i].startsWith('## ')) {
      const line = lines[i]
      const termMatch = line.match(/^\*\*上下文（context）\*\*：(.+?)（(.+?)）—\s*(.+)$/)
      if (termMatch) {
        terms.push({ term: termMatch[1].trim(), translation: termMatch[2].trim(), explanation: termMatch[3].trim() })
      } else if (line.trim()) {
        summaryLines.push(line.trim())
      }
      i++
    }
    chunks.push({ heading, summary: summaryLines.join(' '), terms })
  }

  if (!background && chunks.length === 0) return null
  return { background, chunks }
}

function assertInsideLibrary(targetPath: string, libraryPath: string): void {
  const root = path.resolve(libraryPath)
  const resolved = path.resolve(targetPath)
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw typedError('SAVE_ERROR', `Refusing to write outside library: ${resolved}`)
  }
}

export function parseAssistantSessionBody(body: string): ArticleAssistantMessage[] {
  const messages: ArticleAssistantMessage[] = []
  const sections = body.split(/^## /m).slice(1)
  for (const section of sections) {
    const nl = section.indexOf('\n')
    const heading = (nl === -1 ? section : section.slice(0, nl)).trim()
    const content = (nl === -1 ? '' : section.slice(nl + 1)).trim()
    if (heading.startsWith('用户')) messages.push({ role: 'user', content })
    else if (heading.startsWith('助手')) messages.push({ role: 'assistant', content })
  }
  return messages
}

export function registerArticleAssistantIpc(cfg: AppConfig) {
  ipcMain.handle(
    'articleAssistant:generateGuide',
    async (_, args: { articleContent: string; articleType: 'briefing' | 'anthropic-article'; articleTitle?: string }) => {
      // E2E deterministic mock: return a fixed valid guide without calling the LLM.
      if (isE2EMock()) {
        const mockGuide: ArticleAssistantGuide = {
          background: '这是一段用于 E2E 测试的文章背景介绍，说明本文讨论 AI 对齐与安全。',
          chunks: [
            {
              heading: 'AI Safety',
              summary: '本段介绍 Constitutional AI 的核心思想与动机。',
              terms: [
                {
                  term: 'Constitutional AI',
                  translation: '宪法式 AI',
                  explanation: '一种用一组书面原则约束模型行为、减少人工标注的对齐方法。',
                },
              ],
            },
          ],
        }
        return mockGuide
      }

      const promptPath = path.join(promptsDir(), 'digest-guide.md')
      const system = fs.existsSync(promptPath) ? fs.readFileSync(promptPath, 'utf8') : ''
      const user = `Article title: ${args.articleTitle ?? 'Untitled'}\n\n${args.articleContent}`

      try {
        const raw = await chatNonStream(cfg, {
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          temperature: 0.7,
        })

        const extracted = extractJsonObject(raw)
        if (!extracted) {
          throw typedError('GUIDE_JSON_ERROR', 'Failed to extract JSON object from LLM response')
        }

        let guide: unknown
        try {
          guide = JSON.parse(extracted)
        } catch (parseErr) {
          throw typedError(
            'GUIDE_JSON_ERROR',
            parseErr instanceof Error ? parseErr.message : 'Guide JSON parse failed'
          )
        }

        if (!isValidGuide(guide)) {
          throw typedError('GUIDE_JSON_ERROR', 'Guide JSON missing required fields or invalid shape')
        }

        return guide
      } catch (err) {
        const code = (err as Error & { code?: ArticleAssistantErrorCode }).code
        if (code === 'GUIDE_ABORT' || code === 'GUIDE_JSON_ERROR') throw err
        throw typedError('GUIDE_LLM_ERROR', err instanceof Error ? err.message : String(err))
      }
    }
  )

  ipcMain.handle(
    'articleAssistant:writeSession',
    async (
      _,
      args: {
        parentPath: string
        parentType: 'briefing' | 'anthropic-article'
        messages: ArticleAssistantMessage[]
      }
    ): Promise<{ filePath: string }> => {
      const parsed = path.parse(args.parentPath)
      const sessionPath = sessionPathFor(args.parentPath)
      assertInsideLibrary(sessionPath, cfg.libraryPath)

      const body = args.messages
        .map((m) => `## ${m.role === 'user' ? '用户' : '助手'}\n\n${m.content}\n`)
        .join('\n')

      const now = new Date().toISOString()
      let createdAt = now
      if (fs.existsSync(sessionPath)) {
        try {
          const existing = parseFrontmatter(fs.readFileSync(sessionPath, 'utf8'), {
            filename: path.basename(sessionPath),
          })
          createdAt = existing.frontmatter.created_at ?? existing.frontmatter.created
        } catch {
          createdAt = now
        }
      }

      const fm = {
        title: '旁注记录',
        type: 'article-assistant' as const,
        created: createdAt,
        created_at: createdAt,
        updated_at: now,
        parent_path: args.parentPath,
        parent_type: args.parentType,
        tags: [] as string[],
      }

      try {
        fs.mkdirSync(path.dirname(sessionPath), { recursive: true })
        fs.writeFileSync(sessionPath, serializeFrontmatter('article-assistant', fm, body), 'utf8')
      } catch (err) {
        dumpRecovery(`${parsed.name}.assistant.md`, body)
        throw typedError('SAVE_ERROR', err instanceof Error ? err.message : String(err))
      }

      return { filePath: sessionPath }
    }
  )

  ipcMain.handle(
    'articleAssistant:readSession',
    async (
      _,
      args: { parentPath: string; parentType: 'briefing' | 'anthropic-article' }
    ): Promise<ArticleAssistantSessionFile | null> => {
      const sessionPath = sessionPathFor(args.parentPath)
      if (!fs.existsSync(sessionPath)) return null

      try {
        const { frontmatter, body } = parseFrontmatter(fs.readFileSync(sessionPath, 'utf8'), {
          filename: path.basename(sessionPath),
        })
        return {
          filePath: sessionPath,
          messages: parseAssistantSessionBody(body),
          createdAt: frontmatter.created_at ?? frontmatter.created,
          updatedAt: frontmatter.updated_at ?? frontmatter.created,
        }
      } catch {
        return null
      }
    }
  )

  ipcMain.handle(
    'articleAssistant:sendMessage',
    async (
      event,
      args: {
        sessionId: string
        articleContent: string
        articleType: 'briefing' | 'anthropic-article'
        messages: ArticleAssistantMessage[]
        selection?: string
        useSearch?: boolean
        guide?: ArticleAssistantGuide | null
      }
    ): Promise<void> => {
      const send = (channel: string, ...payload: unknown[]) => {
        if (event.sender.isDestroyed()) return
        event.sender.send(channel, ...payload)
      }

      // E2E deterministic mock: skip real search/LLM and emit fixed events keyed
      // by sessionId. The AbortController is still registered so abort() works.
      if (isE2EMock()) {
        const ctl = new AbortController()
        assistantSessions.set(args.sessionId, ctl)
        try {
          if (args.useSearch) {
            send('articleAssistant:searchDone', args.sessionId, {
              searchSources: [
                {
                  title: 'Constitutional AI（测试来源）',
                  url: 'https://arxiv.org/abs/2212.08073',
                  snippet: 'Constitutional AI 的原始论文摘要（E2E mock）。',
                },
              ],
            })
          }
          for (const chunk of ['这是一段', 'E2E 测试的', '旁注回复。']) {
            if (ctl.signal.aborted) return
            send('llm:chunk', args.sessionId, chunk)
          }
          if (!ctl.signal.aborted) send('llm:done', args.sessionId)
        } finally {
          assistantSessions.delete(args.sessionId)
        }
        return
      }

      // --- search phase (only when useSearch) ---
      let searchSources: { title: string; url: string; snippet: string }[] | undefined
      let searchError: 'NO_RESULTS' | 'SEARCH_ERROR' | undefined
      if (args.useSearch) {
        const apiKey = await getSearchApiKey()
        if (!apiKey) {
          searchError = 'SEARCH_ERROR'
        } else {
          const query = [args.selection, args.messages.at(-1)?.content]
            .filter(Boolean)
            .join(' ')
            .trim()
          try {
            const results = await searchWeb({ query, apiKey, maxResults: 8 })
            searchSources = results.map((r) => ({
              title: r.title,
              url: r.url,
              snippet: r.content.slice(0, 300),
            }))
          } catch (err) {
            searchError =
              (err as Error & { code?: string })?.code === 'NO_RESULTS' ? 'NO_RESULTS' : 'SEARCH_ERROR'
          }
        }
        send('articleAssistant:searchDone', args.sessionId, { searchSources, searchError })
      }

      // --- assemble prompt ---
      const searchResults = searchSources
        ? formatSearchResults(
            searchSources.map((s) => ({ title: s.title, url: s.url, content: s.snippet }))
          )
        : undefined
      const userPrompt = buildAssistantUserPrompt({
        articleContent: args.articleContent,
        guide: args.guide ?? null,
        selection: args.selection,
        messages: args.messages,
        searchResults,
      })
      const llmMessages: Message[] = [
        { role: 'system', content: buildAssistantSystemPrompt() },
        { role: 'user', content: userPrompt },
      ]

      // --- stream ---
      const ctl = new AbortController()
      assistantSessions.set(args.sessionId, ctl)
      try {
        await chatStream(
          cfg,
          { messages: llmMessages, temperature: 0.7, signal: ctl.signal },
          (chunk) => send('llm:chunk', args.sessionId, chunk)
        )
        send('llm:done', args.sessionId)
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return
        const code = (err as Error & { code?: string })?.code
        const mapped: ArticleAssistantErrorCode =
          code === 'TIMEOUT'
            ? 'CHAT_TIMEOUT'
            : code === 'NETWORK_ERROR'
              ? 'CHAT_NETWORK_ERROR'
              : 'CHAT_LLM_ERROR'
        send('llm:error', args.sessionId, {
          code: mapped,
          message: String((err as Error)?.message ?? err),
        })
      } finally {
        assistantSessions.delete(args.sessionId)
      }
    }
  )

  ipcMain.handle(
    'articleAssistant:writeGuide',
    async (
      _,
      args: { parentPath: string; parentType: 'briefing' | 'anthropic-article'; guide: ArticleAssistantGuide }
    ): Promise<{ filePath: string }> => {
      const parsed = path.parse(args.parentPath)
      const guidePath = guidePathFor(args.parentPath)
      assertInsideLibrary(guidePath, cfg.libraryPath)

      const now = new Date().toISOString()
      const fm = {
        title: '导读',
        type: 'article-assistant' as const,
        created: now,
        created_at: now,
        updated_at: now,
        parent_path: args.parentPath,
        parent_type: args.parentType,
        generated_at: now,
        tags: [] as string[],
      }
      const body = serializeGuide(args.guide)

      try {
        fs.mkdirSync(path.dirname(guidePath), { recursive: true })
        fs.writeFileSync(guidePath, serializeFrontmatter('article-assistant', fm, body), 'utf8')
      } catch (err) {
        dumpRecovery(`${parsed.name}.guide.md`, body)
        throw typedError('SAVE_ERROR', err instanceof Error ? err.message : String(err))
      }

      return { filePath: guidePath }
    }
  )

  ipcMain.handle(
    'articleAssistant:readGuide',
    async (
      _,
      args: { parentPath: string; parentType: 'briefing' | 'anthropic-article' }
    ): Promise<ArticleAssistantGuideFile | null> => {
      const guidePath = guidePathFor(args.parentPath)
      if (!fs.existsSync(guidePath)) return null

      try {
        const { frontmatter, body } = parseFrontmatter(fs.readFileSync(guidePath, 'utf8'), {
          filename: path.basename(guidePath),
        })
        const guide = parseAssistantGuideBody(body)
        if (!guide) return null
        return {
          filePath: guidePath,
          guide,
          generatedAt: (frontmatter as unknown as Record<string, unknown>).generated_at as string | undefined ?? frontmatter.created,
        }
      } catch {
        return null
      }
    }
  )

  ipcMain.handle('articleAssistant:abort', async (_, args: { sessionId: string }) => {
    assistantSessions.get(args.sessionId)?.abort()
    assistantSessions.delete(args.sessionId)
  })
}
