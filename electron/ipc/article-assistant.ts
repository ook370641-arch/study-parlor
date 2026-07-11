import fs from 'node:fs'
import path from 'node:path'
import { ipcMain } from 'electron'
import { chatNonStream } from '../lib/kimi'
import { extractJsonObject } from '../lib/extract-json'
import { parseFrontmatter, serializeFrontmatter } from '../lib/frontmatter'
import { dumpRecovery } from '../lib/recovery'
import type { AppConfig } from '../env'
import type {
  ArticleAssistantChunk,
  ArticleAssistantErrorCode,
  ArticleAssistantGuide,
  ArticleAssistantMessage,
  ArticleAssistantSessionFile,
  ArticleAssistantTerm,
} from '@shared/index'

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
}
