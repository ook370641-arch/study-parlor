import fs from 'node:fs'
import path from 'node:path'
import { ipcMain } from 'electron'
import type { AppConfig } from '../env'
import type { JobBriefingResult, JobBriefingConfig, JobCompany, JobErrorCode, JobProfile } from '@shared/index'
import {
  generateJobBriefing,
  discoverCareerPage,
  jobBriefingFilePath,
  jobBriefingDir,
  generateJobBriefingKeywords,
  generateArticleSearchQuery,
} from '../lib/job-briefing'
import { toJobErrorCode } from '../lib/job-error-codes'
import { deleteSiblingFiles } from '../lib/sibling-files'
import { parseFrontmatter, serializeFrontmatter } from '../lib/frontmatter'
import { getSearchApiKey } from '../lib/credentials'
import { getCurrentState } from './state'
import { normalizeJobProfile, formatJobProfile, isJobProfileEmpty } from '../../src/lib/job-briefing-defaults'

function bumpMockCounter(dir: string, name: string): void {
  try {
    const p = path.join(dir, name)
    let n = 0
    if (fs.existsSync(p)) { n = Number(JSON.parse(fs.readFileSync(p, 'utf8')).count ?? 0) || 0 }
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(p, JSON.stringify({ count: n + 1 }), 'utf8')
  } catch { /* best-effort */ }
}

function validateDate(date: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('Invalid job briefing date format')
  }
}

let activeJobAbort: AbortController | null = null

export function registerJobBriefingIpc(cfg: AppConfig, getConfig: () => JobBriefingConfig) {
  ipcMain.handle('job-briefing:generate', async (event, args: { date: string; force?: boolean }): Promise<JobBriefingResult> => {
    const sender = event.sender
    const emitProgress = (stage: string, detail?: string) => {
      if (!sender.isDestroyed()) {
        sender.send('briefing:progress', 'job', stage, detail)
      }
    }

    const { date } = args
    validateDate(date)
    const filePath = jobBriefingFilePath(cfg, date)

    if (!args.force && fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8')
      const { frontmatter, body } = parseFrontmatter(raw, { filename: path.basename(filePath) })
      const errorMatch = body.trim().match(/^##\s*Error\s*\n\s*(JOB_(MISSING_SEARCH_KEY|NETWORK_ERROR|TAVILY_ERROR|LLM_ERROR|OFFICIAL_PAGE_FAILED|EXTRACTION_ERROR|EMPTY_RESULTS|CACHE_WRITE_FAILED|TIMEOUT))$/)
      if (errorMatch) {
        throw new Error(errorMatch[1])
      }

      let sourceStatus: JobBriefingResult['sourceStatus'] = { events: 'ok', jobs: 'ok', questions: 'ok', official: {} }
      try {
        const parsed = JSON.parse(frontmatter.job_sources ?? '[]')
        const official: Record<string, 'ok' | 'failed'> = {}
        for (const s of parsed) {
          if (s.type === 'official' && s.company) {
            official[s.company] = fs.existsSync(filePath) ? 'ok' : 'failed'
          }
        }
        sourceStatus = { ...sourceStatus, official }
      } catch { /* ignore */ }

      return {
        title: '求职简报',
        date,
        content: body,
        filePath,
        cached: true,
        generatedAt: String(frontmatter.generated_at ?? frontmatter.created ?? new Date().toISOString()),
        sourceStatus,
      }
    }

    const genCtl = new AbortController()
    activeJobAbort = genCtl

    try {
    // E2E fast path
    if (
      process.env.NODE_ENV === 'test' &&
      process.env.E2E_CONFIG_DIR &&
      process.env.E2E_JOB_BRIEFING_DISABLE_MOCK !== '1'
    ) {
      emitProgress('scanning-events', 'MOCK')
      const delayMs = Number(process.env.E2E_JOB_BRIEFING_MOCK_DELAY_MS ?? 0)
      if (delayMs > 0) {
        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(resolve, delayMs)
          genCtl.signal.addEventListener('abort', () => { clearTimeout(t); reject(new Error('JOB_ABORTED')) })
        })
      }
      emitProgress('digging-jobs', 'MOCK')
      emitProgress('aggregating-questions', 'MOCK')
      emitProgress('synthesizing', 'MOCK')
      emitProgress('finalizing', 'MOCK')
      const mockContent = `## 今日新动态

- **[秋招开启] 腾讯** · 2026-07-19 — 2027 届秋招正式启动，AI 产品线首批放出模型产品经理等岗位。
  [原文链接](https://example.com/event)

## 与你最适配的岗位

### [★★★★★] 腾讯 · 模型产品经理（校招）
- **城市**: 深圳
- **薪资**: 25-40K·16薪
- **源自**: [秋招开启] 腾讯 · 2027 届秋招正式启动（今日新动态）
- **JD 要点**: 大模型应用、评测体系搭建
- **为什么适合你**: 你的 RAG 项目经历直接对应 JD 要求。
- **来源**: [投递链接](https://example.com/job)

> 💭 **准备建议**: 复习 RAG 链路拆解。

## 高频考察问题

1. **如何为多解问题确定评测指标？**（高频 · 腾讯模型产品面经 · [原文](https://example.com/mianjing)）
   - 考察意图: 评估候选人的评测体系设计能力。
   - 准备要点: 准备标注一致性方案。

## 趋势解读

腾讯秋招开启释放信号：模型产品岗强调评测体系能力。`
      const fm = serializeFrontmatter('job-briefing', {
        title: '求职简报',
        type: 'job-briefing',
        created: new Date().toISOString(),
        tags: ['job-briefing', 'ai-product'],
        date,
        generated_at: new Date().toISOString(),
        role_keywords: ['AI产品经理'],
        cities: ['北京'],
        companies: ['腾讯'],
        job_sources: JSON.stringify([{ type: 'official', company: '腾讯', url: 'https://example.com/job' }]),
      }, mockContent)
      fs.mkdirSync(jobBriefingDir(cfg), { recursive: true })
      try {
        const tmpPath = filePath + '.tmp'
        fs.writeFileSync(tmpPath, fm, 'utf8')
        fs.renameSync(tmpPath, filePath)
      } catch { /* ignore */ }
      // Write last-job-request.json for E2E request-level assertions
      const e2eDir = process.env.E2E_CONFIG_DIR
      if (e2eDir) bumpMockCounter(e2eDir, 'job-briefing-mock-count.json')
      if (e2eDir) {
        const profile = normalizeJobProfile(getCurrentState().jobProfile)
        const profileText = formatJobProfile(profile)
        // Read the synthesize prompt template and inject profile
        const promptsDir = path.join(process.cwd(), 'electron', 'prompts', 'job-briefing')
        let synthPrompt = ''
        try {
          synthPrompt = fs.readFileSync(
            path.join(promptsDir, 'synthesize.md'), 'utf8'
          ).replace('{{profile}}', profileText)
        } catch {
          synthPrompt = '(prompt template not found)'
        }
        fs.mkdirSync(e2eDir, { recursive: true })
        fs.writeFileSync(
          path.join(e2eDir, 'last-job-request.json'),
          JSON.stringify({
            profile: profileText,
            promptTemplate: synthPrompt,
            hasProfile: profileText.length > 0 && !profileText.includes('未设置'),
          }),
          'utf8'
        )
      }
      emitProgress('done')
      return {
        title: '求职简报',
        date,
        content: mockContent,
        filePath,
        cached: false,
        generatedAt: new Date().toISOString(),
        sourceStatus: { events: 'ok', jobs: 'ok', questions: 'ok', official: { 腾讯: 'ok' } },
      }
    }

    const config = getConfig()
    const profile = normalizeJobProfile(getCurrentState().jobProfile)

    // 不再使用 300s 总预算 signal：各阶段自带超时与降级（chatNonStream 300s、
    // Tavily/页面抓取各自超时），综合生成有独立 300s 计时。总预算曾在长综合
    // 阶段误杀请求，冒出 DOMException code=20（即用户看到的 "JOB_20"）。
    try {
      return await generateJobBriefing(cfg, config, profile, date, {
        emitProgress: (stage, detail) => emitProgress(stage, detail),
        signal: genCtl.signal,
      })
    } catch (err: any) {
      if (genCtl.signal.aborted) throw new Error('JOB_ABORTED')
      throw new Error(`JOB_${toJobErrorCode(err)}`)
    }
    } finally {
      if (activeJobAbort === genCtl) activeJobAbort = null
    }
  })

  ipcMain.handle('job-briefing:list', async (): Promise<{ date: string; filePath: string }[]> => {
    const dir = jobBriefingDir(cfg)
    if (!fs.existsSync(dir)) return []
    const entries = fs.readdirSync(dir)
    const list: { date: string; filePath: string }[] = []
    for (const name of entries) {
      const m = name.match(/^求职简报-(\d{4}-\d{2}-\d{2})\.md$/)
      if (!m) continue
      list.push({ date: m[1], filePath: path.join(dir, name) })
    }
    return list.sort((a, b) => b.date.localeCompare(a.date))
  })

  ipcMain.handle('job-briefing:delete', async (_, args: { filePath: string }) => {
    try {
      const dir = path.resolve(jobBriefingDir(cfg))
      const abs = path.resolve(args.filePath)
      if (!abs.startsWith(dir + path.sep) || !fs.existsSync(abs)) {
        return { ok: false as const, message: '文件不存在或路径非法' }
      }
      fs.rmSync(abs)
      deleteSiblingFiles(abs)
      return { ok: true as const }
    } catch (err: any) {
      return { ok: false as const, message: err.message || String(err) }
    }
  })

  ipcMain.handle('job-briefing:discover-pages', async (): Promise<
    | { ok: true; companies: JobCompany[] }
    | { ok: false; code: JobErrorCode; message: string }
  > => {
    try {
      const apiKey = process.env.TAVILY_API_KEY || (await getSearchApiKey())
      if (!apiKey) {
        return { ok: false, code: 'MISSING_SEARCH_KEY', message: '未配置 Tavily API Key' }
      }

      const config = getConfig()
      const ctl = new AbortController()
      const timeout = setTimeout(() => ctl.abort(), 120_000)

      try {
        const companies: JobCompany[] = []
        for (const company of config.companies) {
          if (ctl.signal.aborted) break
          try {
            const result = await discoverCareerPage(company.name, { apiKey, signal: ctl.signal })
            companies.push({ ...company, careerPageUrl: result.url || company.careerPageUrl })
          } catch (err) {
            companies.push(company)
          }
        }
        return { ok: true, companies }
      } finally {
        clearTimeout(timeout)
      }
    } catch (err: any) {
      return { ok: false, code: 'NETWORK_ERROR', message: err.message || String(err) }
    }
  })

  ipcMain.handle('job-briefing:generate-keywords', async (_, args: { profile: JobProfile }) => {
    const profile = normalizeJobProfile(args.profile)
    if (isJobProfileEmpty(profile)) {
      return { ok: false as const, code: 'EMPTY_PROFILE' as const, message: '求职档案为空，无法生成关键词' }
    }
    try {
      const ctl = new AbortController()
      const timeout = setTimeout(() => ctl.abort(), 60_000)
      try {
        const result = await generateJobBriefingKeywords(cfg, profile, { signal: ctl.signal })
        return { ok: true as const, eventKeywords: result.eventKeywords, jobKeywords: result.jobKeywords }
      } finally {
        clearTimeout(timeout)
      }
    } catch (err: any) {
      return { ok: false as const, code: 'LLM_ERROR' as const, message: err.message || '关键词生成失败' }
    }
  })

  ipcMain.handle('job-briefing:generate-article-search-query', async (_, args: {
    articleContent: string; selection?: string; lastMessage?: string
  }) => {
    try {
      const query = await generateArticleSearchQuery(cfg, args)
      if (!query) {
        return { ok: false as const, code: 'LLM_ERROR' as const, message: '生成的搜索词为空' }
      }
      return { ok: true as const, query }
    } catch (err: any) {
      return { ok: false as const, code: 'LLM_ERROR' as const, message: err.message || '搜索词生成失败' }
    }
  })

  ipcMain.handle('job-briefing:abort', async () => { activeJobAbort?.abort() })
}
