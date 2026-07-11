import fs from 'node:fs'
import path from 'node:path'
import { ipcMain } from 'electron'
import type { AppConfig } from '../env'
import type { JobBriefingResult, JobBriefingConfig, JobCompany, JobErrorCode } from '@shared/index'
import {
  generateJobBriefing,
  discoverCareerPage,
  jobBriefingFilePath,
  jobBriefingDir,
} from '../lib/job-briefing'
import { parseFrontmatter, serializeFrontmatter } from '../lib/frontmatter'
import { getSearchApiKey } from '../lib/credentials'

function validateDate(date: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('Invalid job briefing date format')
  }
}

export function registerJobBriefingIpc(cfg: AppConfig, getConfig: () => JobBriefingConfig) {
  ipcMain.handle('job-briefing:generate', async (event, args: { date: string; force?: boolean }): Promise<JobBriefingResult> => {
    const sender = event.sender
    const emitProgress = (stage: string, detail?: string) => {
      if (!sender.isDestroyed()) {
        sender.send('briefing:progress', stage, detail)
      }
    }

    const { date } = args
    validateDate(date)
    const filePath = jobBriefingFilePath(cfg, date)

    if (!args.force && fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8')
      const { frontmatter, body } = parseFrontmatter(raw, { filename: path.basename(filePath) })
      const errorMatch = body.trim().match(/^##\s*Error\s*\n\s*(JOB_(MISSING_SEARCH_KEY|NETWORK_ERROR|OFFICIAL_PAGE_FAILED|EXTRACTION_ERROR|EMPTY_RESULTS|CACHE_WRITE_FAILED))$/)
      if (errorMatch) {
        throw new Error(errorMatch[1])
      }

      let sourceStatus = { tavily: 'ok' as const, official: {} as Record<string, 'ok' | 'failed'> }
      try {
        const parsed = JSON.parse(frontmatter.job_sources ?? '[]')
        const official: Record<string, 'ok' | 'failed'> = {}
        for (const s of parsed) {
          if (s.type === 'official' && s.company) {
            official[s.company] = fs.existsSync(filePath) ? 'ok' : 'failed'
          }
        }
        sourceStatus = { tavily: 'ok', official }
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

    // E2E fast path
    if (
      process.env.NODE_ENV === 'test' &&
      process.env.E2E_CONFIG_DIR &&
      process.env.E2E_JOB_BRIEFING_DISABLE_MOCK !== '1'
    ) {
      emitProgress('discovering', 'MOCK')
      emitProgress('scraping', 'MOCK')
      emitProgress('searching', 'MOCK')
      emitProgress('synthesizing', 'MOCK')
      emitProgress('finalizing', 'MOCK')
      const mockContent = `## 优先岗位\n\n### [OFFICIAL] 腾讯 · AI产品经理培训生\n- **城市**: 深圳\n- **薪资**: 年薪 40W+\n- **难度**: ★★★★☆\n- **JD 要点**: 大模型应用、Agent设计\n- **来源**: [原文链接](https://example.com/job)\n\n> 💭 **默会知识**: 需要理解 LLM 能力边界。\n\n## 技能雷达\n\n| 技能 | 频次 |\n|---|---|\n| 大模型 / LLM | 92% |\n| Agent 设计 | 78% |\n\n## 趋势解读\n\n当前市场对 AI 产品经理的要求集中在 LLM 应用落地能力。`
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
        fs.writeFileSync(filePath, fm, 'utf8')
      } catch { /* ignore */ }
      emitProgress('done')
      return {
        title: '求职简报',
        date,
        content: mockContent,
        filePath,
        cached: false,
        generatedAt: new Date().toISOString(),
        sourceStatus: { tavily: 'ok', official: { 腾讯: 'ok' } },
      }
    }

    const config = getConfig()
    const llmCtl = new AbortController()
    const llmTimeout = setTimeout(() => llmCtl.abort(), 300_000)

    try {
      const result = await generateJobBriefing(cfg, config, date, {
        emitProgress: (stage, detail) => emitProgress(stage, detail),
        signal: llmCtl.signal,
      })
      return result
    } catch (err: any) {
      const code = err?.code || 'NETWORK_ERROR'
      throw new Error(`JOB_${code}`)
    } finally {
      clearTimeout(llmTimeout)
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
}
