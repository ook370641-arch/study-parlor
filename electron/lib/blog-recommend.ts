import fs from 'fs'
import os from 'os'
import path from 'path'
import { loadCatalog } from './writing-catalog'
import { parseFrontmatter } from './frontmatter'
import { chatNonStream } from './kimi'
import { extractJsonObject, extractJsonArray } from './extract-json'
import { searchWeb } from './search'
import { getSearchApiKey } from './credentials'
import { loadCollection } from './blog-collection'
import type { AppConfig } from '../env'
import type { BlogRecommendBatch } from '@shared/index'

export type LocalBlogArticle = {
  sourceUrl: string
  filePath: string   // 相对学习库
  absPath: string
  title: string
  summary: string | null
  section: string | null
  importedAt: string | null
}

export function collectWritingContext(lib: string): {
  count: number
  summaries: { title: string; summary: string }[]
  recentBodies: string[]
} {
  const cat = loadCatalog(lib, 'writing')
  const ts = (e: { mtimeMs?: number; updatedAt?: string }): number => {
    if (e.mtimeMs != null) return e.mtimeMs
    if (e.updatedAt) {
      const t = Date.parse(e.updatedAt)
      if (!Number.isNaN(t)) return t
    }
    return 0
  }
  const items = Object.entries(cat.entries)
    .map(([relPath, e]) => ({ relPath, ...e }))
    .sort((a, b) => ts(b) - ts(a))

  let total = 0
  const summaries: { title: string; summary: string }[] = []
  for (const it of items) {
    const text = `${it.title}\n${it.summary}`
    if (total + text.length > 8000) break
    summaries.push({ title: it.title, summary: it.summary })
    total += text.length
  }

  const recentBodies: string[] = []
  for (const it of items.slice(0, 5)) {
    const p = path.join(lib, it.relPath)
    if (!fs.existsSync(p)) continue
    try {
      const raw = fs.readFileSync(p, 'utf8')
      const { body } = parseFrontmatter(raw, { filename: path.basename(p) })
      recentBodies.push(body.slice(0, 2000))
    } catch { /* skip */ }
  }

  return { count: items.length, summaries, recentBodies }
}

export function collectLocalArticles(lib: string): LocalBlogArticle[] {
  const dir = path.join(lib, 'Anthropic博客')
  const out: LocalBlogArticle[] = []
  const walk = (d: string) => {
    if (!fs.existsSync(d)) return
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, ent.name)
      if (ent.isDirectory()) walk(full)
      else if (ent.isFile() && ent.name.endsWith('.md')) {
        try {
          const raw = fs.readFileSync(full, 'utf8')
          const { frontmatter } = parseFrontmatter(raw, { filename: ent.name })
          if (frontmatter.type !== 'anthropic-article') continue
          if (!frontmatter.source_url) continue
          out.push({
            sourceUrl: frontmatter.source_url,
            filePath: path.relative(lib, full),
            absPath: full,
            title: frontmatter.title ?? ent.name,
            summary: frontmatter.summary ?? null,
            section: frontmatter.section ?? null,
            importedAt: frontmatter.imported_at ?? null,
          })
        } catch { /* skip corrupted */ }
      }
    }
  }
  walk(dir)
  return out
}

export type PickedArticle = { sourceUrl: string; reason: string; gap: string; guide: string }

const PROMPTS_DIR = (() => {
  const candidates = [
    path.resolve(__dirname, '..', 'prompts'),
    path.resolve(__dirname, '..', '..', 'electron', 'prompts'),
  ]
  for (const c of candidates) if (fs.existsSync(c)) return c
  throw new Error('prompts directory not found')
})()
const read = (n: string) => fs.readFileSync(path.join(PROMPTS_DIR, n), 'utf8')

function codeError(code: string): Error {
  return Object.assign(new Error(code), { code })
}

function writeDebug(tag: string, prompt: string, text?: string, extracted?: string): void {
  const debugDir = path.join(os.homedir(), '.studyparlor', 'debug')
  fs.mkdirSync(debugDir, { recursive: true })
  const file = path.join(debugDir, `${tag}-fail-${Date.now()}.txt`)
  fs.writeFileSync(file, `=== Prompt ===\n${prompt}\n\n=== Extracted ===\n${extracted ?? ''}\n\n=== LLM Response ===\n${text ?? ''}`, 'utf8')
}

async function callJson(cfg: AppConfig, prompt: string, signal?: AbortSignal): Promise<string> {
  return chatNonStream(cfg, {
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    thinking: { type: 'enabled', reasoning_effort: 'high' },
    signal,
  })
}

async function extractObjectWithRetry<T>(
  cfg: AppConfig, prompt: string, tag: string, signal?: AbortSignal,
  validate?: (o: T) => boolean
): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await callJson(cfg, prompt, signal)
    const extracted = extractJsonObject(text)
    if (extracted) {
      try {
        const obj = JSON.parse(extracted) as T
        if (!validate || validate(obj)) return obj
        writeDebug(tag, prompt, text, extracted)
      } catch { writeDebug(tag, prompt, text, extracted) }
    } else {
      writeDebug(tag, prompt, text)
    }
  }
  throw codeError('LLM_PARSE_ERROR')
}

async function stageProfile(cfg: AppConfig, ctx: ReturnType<typeof collectWritingContext>, signal?: AbortSignal) {
  const prompt = read('blog-profile-queries-v2.md')
    .replace('{{summaries}}', ctx.summaries.map((s, i) => `第${i + 1}篇《${s.title}》：${s.summary}`).join('\n'))
    .replace('{{recentBodies}}', ctx.recentBodies.map((b, i) => `[近期原文${i + 1}]\n${b}`).join('\n\n'))
  return extractObjectWithRetry<{ focus: string; profile: string; gaps: string[]; queries: string[] }>(
    cfg, prompt, 'blog-profile', signal,
    o => typeof o.focus === 'string' && o.focus.length > 0
      && typeof o.profile === 'string'
      && Array.isArray(o.gaps) && Array.isArray(o.queries)
  )
}

async function stagePick(
  cfg: AppConfig,
  args: {
    profile: string; gaps: string[]; searchHits: string; pool: LocalBlogArticle[];
  },
  signal?: AbortSignal
): Promise<PickedArticle[]> {
  const poolText = args.pool.map((a, i) => `${i + 1}. ${a.sourceUrl} | ${a.title} | ${a.summary ?? ''}`).join('\n')
  const prompt = read('blog-recommend-pick-v2.md')
    .replace('{{profile}}', args.profile)
    .replace('{{gaps}}', args.gaps.join('\n'))
    .replace('{{searchHits}}', args.searchHits || '(无)')
    .replace('{{pool}}', poolText)
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await callJson(cfg, prompt, signal)
    const extracted = extractJsonArray(text)
    if (extracted) {
      try {
        const arr = JSON.parse(extracted) as { source_url?: string; reason?: string; gap?: string; guide?: string }[]
        const valid = new Set(args.pool.map(a => a.sourceUrl))
        const picks = arr
          .filter(x => x.source_url && valid.has(x.source_url))
          .slice(0, 5)
          .map(x => ({ sourceUrl: x.source_url!, reason: x.reason ?? '', gap: x.gap ?? '', guide: x.guide ?? '' }))
        if (picks.length === 0 || picks.some(p => !p.guide)) throw new Error('shape')
        return picks
      } catch { writeDebug('blog-pick', prompt, text, extracted) }
    } else {
      writeDebug('blog-pick', prompt, text)
    }
  }
  throw codeError('LLM_PARSE_ERROR')
}

export async function runBlogRecommend(
  cfg: AppConfig,
  opts: { signal?: AbortSignal; onStage?: (s: 'context' | 'profile' | 'search' | 'pick') => void }
): Promise<{ batch: BlogRecommendBatch; picks: PickedArticle[] }> {
  const lib = cfg.libraryPath
  const col = loadCollection(lib)

  opts.onStage?.('context')
  const ctx = collectWritingContext(lib)
  if (ctx.count === 0) throw codeError('NO_WRITING_CONTEXT')

  opts.onStage?.('profile')
  const profile = await stageProfile(cfg, ctx, opts.signal)

  opts.onStage?.('search')
  let searchHits = ''
  let searchUsed = false
  try {
    const key = await getSearchApiKey()
    if (key) {
      const lines: string[] = []
      for (const q of profile.queries ?? []) {
        const res = await searchWeb({
          query: q, apiKey: key, maxResults: 5, signal: opts.signal,
          includeDomains: ['anthropic.com', 'transformer-circuits.pub', 'claude.com'],
        })
        for (const r of res) lines.push(`${r.title}\n${r.url}\n${r.content.slice(0, 400)}`)
      }
      searchHits = lines.join('\n\n')
      searchUsed = lines.length > 0
    }
  } catch { searchUsed = false }

  opts.onStage?.('pick')
  const pool = collectLocalArticles(lib)
    .filter(a => !col.dismissed.includes(a.sourceUrl))
    .filter(a => !col.read.some(r => r.sourceUrl === a.sourceUrl))
    .sort((a, b) => (b.importedAt ?? '').localeCompare(a.importedAt ?? ''))
    .slice(0, 80)
  if (pool.length === 0) throw codeError('NO_LOCAL_ARTICLES')

  const picks = await stagePick(cfg, { profile: profile.profile, gaps: profile.gaps ?? [], searchHits, pool }, opts.signal)

  const batch: BlogRecommendBatch = {
    batch: (col.history[0]?.batch ?? 0) + 1,
    generatedAt: new Date().toISOString(),
    focus: profile.focus,
    profile: profile.profile,
    gaps: profile.gaps ?? [],
    queries: profile.queries ?? [],
    searchUsed,
    picks: picks.map(p => {
      const a = pool.find(x => x.sourceUrl === p.sourceUrl)
      return { sourceUrl: p.sourceUrl, title: a?.title ?? p.sourceUrl, filePath: a?.absPath ?? '', reason: p.reason, gap: p.gap, guide: p.guide }
    }),
  }
  return { batch, picks }
}
