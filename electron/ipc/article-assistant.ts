import fs from 'node:fs'
import path from 'node:path'
import { ipcMain } from 'electron'
import { chatNonStream } from '../lib/kimi'
import { extractJsonObject } from '../lib/extract-json'
import type { AppConfig } from '../env'
import type {
  ArticleAssistantChunk,
  ArticleAssistantErrorCode,
  ArticleAssistantGuide,
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
}
