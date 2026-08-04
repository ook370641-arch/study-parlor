import fs from 'node:fs'
import path from 'node:path'
import { ipcMain } from 'electron'
import { chatNonStream, chatStream, buildChatBody } from '../lib/kimi'
import type { ThinkingConfig } from '../lib/kimi'
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
import { generateArticleSearchQuery } from '../lib/job-briefing'
import { runDigestGuideV2 } from '../lib/guide-v2-pipeline'
import { GUIDE_FORMAT_VERSION } from '../lib/guide-v2'
import type { AppConfig } from '../env'
import type {
  ArticleAnnotation,
  ArticleAssistantChunk,
  ArticleAssistantErrorCode,
  ArticleAssistantGuide,
  ArticleAssistantGuideFile,
  ArticleAssistantMessage,
  ArticleAssistantSessionFile,
  ArticleAssistantTerm,
  AssistantThinkingEffort,
  Message,
} from '@shared/index'

const assistantSessions = new Map<string, AbortController>()

// E2E deterministic mock is active only when BOTH the test NODE_ENV and the
// E2E isolation marker are set. Gating on both keeps unit tests (which run with
// NODE_ENV=test but no E2E_CONFIG_DIR) on the real code path. See rule e2e.md §1.
function isE2EMock(): boolean {
  return process.env.NODE_ENV === 'test' && !!process.env.E2E_CONFIG_DIR
}

function toThinkingConfig(effort?: AssistantThinkingEffort): ThinkingConfig {
  return effort && effort !== 'off' ? { type: 'enabled', reasoning_effort: effort } : { type: 'disabled' }
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

function sessionPathFor(parentPath: string, libraryPath?: string): string {
  const parsed = path.parse(parentPath)
  const base = libraryPath && !path.isAbsolute(parentPath) ? libraryPath : ''
  return path.join(base, parsed.dir, `${parsed.name}.assistant.md`)
}

function guidePathFor(parentPath: string, libraryPath?: string): string {
  const parsed = path.parse(parentPath)
  const base = libraryPath && !path.isAbsolute(parentPath) ? libraryPath : ''
  return path.join(base, parsed.dir, `${parsed.name}.guide.md`)
}

function resolveParentPath(parentPath: string, libraryPath: string): string {
  return path.isAbsolute(parentPath) ? parentPath : path.join(libraryPath, parentPath)
}

export function serializeGuide(guide: ArticleAssistantGuide): string {
  const chunks = guide.chunks.map((c, i) => {
    const terms = c.terms.length
      ? '\n\n' + c.terms.map((t) => `**上下文（context）**：${t.term}（${t.translation}）— ${t.explanation}`).join('\n\n')
      : ''
    return `## §${i + 1} ${c.heading}\n\n${c.context ?? c.summary ?? ''}${terms}`
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

function splitSessionSections(body: string): string[] {
  const sections: string[] = []
  let inSnapshot = false
  let current = ''
  for (const line of body.split('\n')) {
    if (line.trim() === '<!-- snapshot:start -->') {
      inSnapshot = true
      current += line + '\n'
      continue
    }
    if (line.trim() === '<!-- snapshot:end -->') {
      inSnapshot = false
      current += line + '\n'
      continue
    }
    if (!inSnapshot && /^## (用户|助手)/.test(line)) {
      if (current.trim()) sections.push(current.trimEnd())
      current = line.slice(3) + '\n'
      continue
    }
    current += line + '\n'
  }
  if (current.trim()) sections.push(current.trimEnd())
  return sections
}

export function serializeAssistantSessionBody(messages: ArticleAssistantMessage[]): string {
  return messages
    .map((m) => {
      const selLine =
        m.role === 'user' && m.selection?.trim()
          ? `> 选段：${m.selection.trim().replace(/\s*\n\s*/g, ' ')}\n\n`
          : ''
      const snapshotBlock =
        m.role === 'user' && m.snapshot?.trim()
          ? `<!-- snapshot:start -->\n${m.snapshot.trim()}\n<!-- snapshot:end -->\n\n`
          : ''
      const reasoningLine =
        m.role === 'assistant' && m.reasoning?.trim()
          ? `<!-- reasoning:start -->\n${m.reasoning.trim()}\n<!-- reasoning:end -->\n\n`
          : ''
      return `## ${m.role === 'user' ? '用户' : '助手'}\n\n${selLine}${snapshotBlock}${reasoningLine}${m.content}\n`
    })
    .join('\n')
}

export function parseAssistantSessionBody(body: string): ArticleAssistantMessage[] {
  const messages: ArticleAssistantMessage[] = []
  const sections = splitSessionSections(body)
  for (const section of sections) {
    const nl = section.indexOf('\n')
    const heading = (nl === -1 ? section : section.slice(0, nl)).trim()
    let content = (nl === -1 ? '' : section.slice(nl + 1)).trim()
    if (heading.startsWith('用户')) {
      let selection: string | undefined
      let snapshot: string | undefined
      if (content.startsWith('> 选段：')) {
        const lineEnd = content.indexOf('\n')
        selection = content.slice('> 选段：'.length, lineEnd === -1 ? undefined : lineEnd).trim()
        content = (lineEnd === -1 ? '' : content.slice(lineEnd + 1)).trim()
      }
      if (content.startsWith('<!-- snapshot:start -->')) {
        const startTagEnd = content.indexOf('\n')
        const afterStart = content.slice(startTagEnd + 1)
        const endIdx = afterStart.indexOf('\n<!-- snapshot:end -->')
        if (endIdx !== -1) {
          snapshot = afterStart.slice(0, endIdx).trim()
          const afterEnd = afterStart.slice(endIdx + '\n<!-- snapshot:end -->'.length)
          content = afterEnd.trim()
        }
      }
      messages.push({ role: 'user', content, selection, snapshot })
    } else if (heading.startsWith('助手')) {
      let reasoning: string | undefined
      if (content.startsWith('<!-- reasoning:start -->')) {
        const startTagEnd = content.indexOf('\n')
        const afterStart = content.slice(startTagEnd + 1)
        const endIdx = afterStart.indexOf('\n<!-- reasoning:end -->')
        if (endIdx !== -1) {
          reasoning = afterStart.slice(0, endIdx).trim()
          const afterEnd = afterStart.slice(endIdx + '\n<!-- reasoning:end -->'.length)
          content = afterEnd.trim()
        }
      }
      messages.push({ role: 'assistant', content, reasoning })
    }
  }
  return messages
}

export function registerArticleAssistantIpc(cfg: AppConfig) {
  ipcMain.handle(
    'articleAssistant:generateGuide',
    async (event, args: { articleContent: string; articleType: 'briefing' | 'anthropic-article' | 'web-article'; articleTitle?: string; entriesTotal?: number }) => {
      const send = (channel: string, ...payload: unknown[]) => {
        if (event.sender.isDestroyed()) return
        event.sender.send(channel, ...payload)
      }
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

      // E2E deterministic mock: return a fixed valid guide without calling the LLM.
      if (isE2EMock()) {
        if (args.articleType === 'briefing') {
          // v2 mock：合成三阶段进度事件（带延时，给 E2E 留出断言窗口），返回 context 格式导读
          const entriesTotal = Math.max(args.entriesTotal ?? 1, 1)
          send('articleAssistant:guideProgress', { stage: 'planning' })
          await sleep(400)
          send('articleAssistant:guideProgress', { stage: 'searching', done: 1, total: 2 })
          await sleep(500)
          send('articleAssistant:guideProgress', { stage: 'searching', done: 2, total: 2 })
          for (let i = 1; i <= 5; i++) {
            await sleep(400)
            send('articleAssistant:guideProgress', {
              stage: 'writing',
              chars: i * 240,
              entriesDone: Math.min(i >= 3 ? 1 : 0, entriesTotal),
              entriesTotal,
            })
          }
          const mockGuideV2: ArticleAssistantGuide = {
            background: '这是一份 E2E 测试简报的整体背景：本期条目共同反映了 AI Agent 工程化落地的争论。',
            chunks: [
              {
                heading: 'AI Safety',
                context: 'Constitutional AI 出自 Anthropic 2022 年的同名论文，是用成文原则替代人工反馈的对齐路线（E2E mock 背景铺陈）。',
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
          return mockGuideV2
        }
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

      // digest 走 v2 背景铺陈管线；其余类型沿用旧的单次摘要式调用
      if (args.articleType === 'briefing') {
        const v2PromptPath = path.join(promptsDir(), 'digest-guide-v2.md')
        const systemV2 = fs.existsSync(v2PromptPath) ? fs.readFileSync(v2PromptPath, 'utf8') : ''
        try {
          return await runDigestGuideV2(
            cfg,
            {
              system: systemV2,
              articleContent: args.articleContent,
              articleTitle: args.articleTitle,
              entriesTotal: args.entriesTotal,
            },
            (p) => send('articleAssistant:guideProgress', p)
          )
        } catch (err) {
          const code = (err as Error & { code?: string }).code
          if (code === 'GUIDE_JSON_ERROR') throw err
          throw typedError('GUIDE_LLM_ERROR', err instanceof Error ? err.message : String(err))
        }
      }

      // 旧路径（anthropic-article / web-article）
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
          thinking: { type: 'enabled', reasoning_effort: 'max' },
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
        parentType: 'briefing' | 'anthropic-article' | 'writing' | 'web-article'
        messages: ArticleAssistantMessage[]
      }
    ): Promise<{ filePath: string }> => {
      const parsed = path.parse(resolveParentPath(args.parentPath, cfg.libraryPath))
      const sessionPath = sessionPathFor(args.parentPath, cfg.libraryPath)
      assertInsideLibrary(sessionPath, cfg.libraryPath)

      const body = serializeAssistantSessionBody(args.messages)

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
      args: { parentPath: string; parentType: 'briefing' | 'anthropic-article' | 'web-article' }
    ): Promise<ArticleAssistantSessionFile | null> => {
      const sessionPath = sessionPathFor(args.parentPath, cfg.libraryPath)
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
      } catch (err) {
        console.warn('[article-assistant] readSession failed for', sessionPath, err)
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
        articleType: 'briefing' | 'anthropic-article' | 'web-article'
        messages: ArticleAssistantMessage[]
        annotations?: ArticleAnnotation[]
        selection?: string
        useSearch?: boolean
        guide?: ArticleAssistantGuide | null
        socraticMode?: boolean
        thinkingEffort?: AssistantThinkingEffort
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
          // 走真实装配链并落盘最终请求体，供 E2E 做请求级断言（不改变 mock 推送行为）
          const mockSources = [
            {
              title: 'Constitutional AI（测试来源）',
              url: 'https://arxiv.org/abs/2212.08073',
              snippet: 'Constitutional AI 的原始论文摘要（E2E mock）。',
            },
          ]
          const searchResults = args.useSearch
            ? formatSearchResults(mockSources.map((s) => ({ title: s.title, url: s.url, content: s.snippet })))
            : undefined
          const userPrompt = buildAssistantUserPrompt({
            articleContent: args.articleContent,
            guide: args.guide ?? null,
            annotations: args.annotations,
            selection: args.selection,
            messages: args.messages,
            searchResults,
            socratic: args.socraticMode,
          })
          const requestBody = buildChatBody(cfg, {
            messages: [
              { role: 'system', content: buildAssistantSystemPrompt(args.socraticMode ?? true) },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0.7,
            stream: true,
            thinking: toThinkingConfig(args.thinkingEffort),
          })
          fs.writeFileSync(
            path.join(process.env.E2E_CONFIG_DIR as string, 'last-assistant-request.json'),
            JSON.stringify(requestBody, null, 2),
            'utf8'
          )

          if (args.useSearch) {
            send('articleAssistant:searchDone', args.sessionId, { searchSources: mockSources })
          }
          if (args.thinkingEffort && args.thinkingEffort !== 'off') {
            for (const chunk of ['先梳理', '文章结构。']) {
              if (ctl.signal.aborted) return
              send('articleAssistant:reasoningChunk', args.sessionId, chunk)
            }
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
        console.log('[article-assistant] search phase started')
        const apiKey = await getSearchApiKey()
        if (!apiKey) {
          searchError = 'SEARCH_ERROR'
        } else {
          let query: string
          try {
            query = await generateArticleSearchQuery(cfg, {
              articleContent: args.articleContent,
              selection: args.selection,
              lastMessage: args.messages.at(-1)?.content,
            })
          } catch (err) {
            console.warn('[article-assistant] smart query generation failed, falling back to concatenation', err)
            // Fallback: preserve old concatenation behavior
            query = [args.selection, args.messages.at(-1)?.content]
              .filter(Boolean)
              .join(' ')
              .trim()
          }
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
        annotations: args.annotations,
        selection: args.selection,
        messages: args.messages,
        searchResults,
        socratic: args.socraticMode,
      })
      const llmMessages: Message[] = [
        { role: 'system', content: buildAssistantSystemPrompt(args.socraticMode ?? true) },
        { role: 'user', content: userPrompt },
      ]

      // --- stream ---
      const ctl = new AbortController()
      assistantSessions.set(args.sessionId, ctl)
      try {
        await chatStream(
          cfg,
          { messages: llmMessages, temperature: 0.7, signal: ctl.signal, thinking: toThinkingConfig(args.thinkingEffort) },
          (chunk) => send('llm:chunk', args.sessionId, chunk),
          (reasoning) => send('articleAssistant:reasoningChunk', args.sessionId, reasoning)
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
      args: { parentPath: string; parentType: 'briefing' | 'anthropic-article' | 'web-article'; guide: ArticleAssistantGuide }
    ): Promise<{ filePath: string }> => {
      const parsed = path.parse(resolveParentPath(args.parentPath, cfg.libraryPath))
      const guidePath = guidePathFor(args.parentPath, cfg.libraryPath)
      assertInsideLibrary(guidePath, cfg.libraryPath)

      const now = new Date().toISOString()
      const isV2 = args.guide.chunks.some((c) => typeof c.context === 'string' && c.context.length > 0)
      const fm = {
        title: '导读',
        type: 'article-assistant' as const,
        created: now,
        created_at: now,
        updated_at: now,
        parent_path: args.parentPath,
        parent_type: args.parentType,
        generated_at: now,
        ...(isV2 ? { guide_version: GUIDE_FORMAT_VERSION } : {}),
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
      args: { parentPath: string; parentType: 'briefing' | 'anthropic-article' | 'web-article' }
    ): Promise<ArticleAssistantGuideFile | null> => {
      const guidePath = guidePathFor(args.parentPath, cfg.libraryPath)
      if (!fs.existsSync(guidePath)) return null

      try {
        const { frontmatter, body } = parseFrontmatter(fs.readFileSync(guidePath, 'utf8'), {
          filename: path.basename(guidePath),
        })
        const guide = parseAssistantGuideBody(body)
        if (!guide) return null
        const fmRecord = frontmatter as unknown as Record<string, unknown>
        return {
          filePath: guidePath,
          guide,
          generatedAt: (fmRecord.generated_at as string | undefined) ?? frontmatter.created,
          guideVersion: typeof fmRecord.guide_version === 'number' ? fmRecord.guide_version : undefined,
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
