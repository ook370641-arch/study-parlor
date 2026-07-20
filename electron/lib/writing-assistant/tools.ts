import fs from 'node:fs'
import path from 'node:path'
import type { AppConfig } from '../../env'
import { readWritingFile } from '../writing-tree'
import type { ToolCall } from './tool-protocol'
import type { WritingToolEvent } from '../../../src/types'
import type { IndexEntry } from './prompt'

/**
 * Resolve a source-type:id pair to a file path within the library.
 * Returns null for unreadable sources (e.g., web).
 */
function resolveSourcePath(lib: string, type: string, idPath: string): string | null {
  switch (type) {
    case 'writing':
      return path.join(lib, 'writing', idPath)
    case 'repository':
      return path.join(lib, 'repository', idPath)
    case 'blog':
      return path.join(lib, 'Anthropic博客', idPath)
    case 'digest':
      return path.join(lib, '夜航简报', idPath)
    case 'study': {
      // Find the latest session's 学习报告.md
      const topicDir = path.join(lib, idPath)
      if (!fs.existsSync(topicDir)) return null
      try {
        const sessions = fs.readdirSync(topicDir, { withFileTypes: true })
          .filter(s => s.isDirectory())
          .sort((a, b) => b.name.localeCompare(a.name))
        for (const s of sessions) {
          const reportPath = path.join(topicDir, s.name, '学习报告.md')
          if (fs.existsSync(reportPath)) return reportPath
        }
      } catch { /* fall through */ }
      return null
    }
    case 'job': {
      // Job briefings are in the library root with a job- prefix pattern
      return path.join(lib, idPath)
    }
    default:
      return null
  }
}

export async function executeTool(
  cfg: AppConfig,
  call: ToolCall,
  opts: {
    send: (e: WritingToolEvent) => void
    sessionId: string
    useSearch: boolean
    getSearchApiKey?: () => Promise<string | null>
    searchWeb?: (o: { query: string; apiKey: string; maxResults?: number }) => Promise<Array<{ title: string; url: string; content: string }>>
    index?: IndexEntry[]
  }
): Promise<string> {
  if (call.tool === 'read_local') {
    opts.send({ sessionId: opts.sessionId, phase: 'start', tool: 'read_local', ids: call.ids })

    // If ids is empty or contains 'index', return full catalog
    if (call.ids.length === 0 || call.ids.includes('index')) {
      const catalogText = (opts.index || []).map(e =>
        `- [${e.type}] ${e.id} — ${e.title}: ${e.summary}`
      ).join('\n')
      opts.send({ sessionId: opts.sessionId, phase: 'done', tool: 'read_local', ids: call.ids })
      return '可用资料列表：\n' + (catalogText || '(暂无资料)')
    }

    // Read each file
    const results: string[] = []
    for (const id of call.ids) {
      try {
        // Parse type:path format
        const colonIdx = id.indexOf(':')
        if (colonIdx === -1) { results.push(`⚠️ 无效 id 格式: ${id}`); continue }

        const type = id.slice(0, colonIdx)
        const relPath = id.slice(colonIdx + 1)

        const absPath = resolveSourcePath(cfg.libraryPath, type, relPath)
        if (!absPath) {
          results.push(`⚠️ 不支持的来源类型: ${type}`)
          continue
        }

        if (!fs.existsSync(absPath)) {
          results.push(`⚠️ 文件不存在: ${id}`)
          continue
        }

        const raw = fs.readFileSync(absPath, 'utf-8')
        // Parse frontmatter for title
        let title = id
        let body = raw
        const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n?/)
        if (fmMatch) {
          const fmTitle = fmMatch[1].match(/^title:\s*(.+)$/m)
          if (fmTitle) title = fmTitle[1].trim().replace(/^["']|["']$/g, '')
          body = raw.slice(fmMatch[0].length)
        }
        results.push(`### [${type}] ${title}\n\n${body}`)
      } catch {
        results.push(`⚠️ id 不存在或无法读取: ${id}`)
      }
    }

    opts.send({ sessionId: opts.sessionId, phase: 'done', tool: 'read_local', ids: call.ids })
    return results.join('\n\n---\n\n')
  }

  if (call.tool === 'web_search') {
    if (!opts.useSearch) return '网络搜索未开启（用户关闭了 🔍 开关）。'
    try {
      const apiKey = opts.getSearchApiKey ? await opts.getSearchApiKey() : null
      if (!apiKey) return '搜索 API Key 未配置。'
      const results = await (opts.searchWeb!)({ query: call.query, apiKey, maxResults: 8 })
      return results.map((r, i) =>
        `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.content?.slice(0, 300) || ''}`
      ).join('\n\n')
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code
      if (code === 'NO_RESULTS') return `搜索「${call.query}」未找到结果。`
      return `搜索「${call.query}」时出错，请稍后重试。`
    }
  }

  // insert_into_article
  opts.send({ sessionId: opts.sessionId, phase: 'done', tool: 'insert_into_article', markdown: call.markdown })
  return '已插入到编辑器光标处。'
}
