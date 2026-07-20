import fs from 'node:fs'
import path from 'node:path'
import type { AppConfig } from '../../env'
import type { WritingSourceType } from '../../../src/types'
import { scanRoot } from '../writing-tree'
import { loadCatalog } from '../writing-catalog'

export type IndexEntry = { id: string; type: WritingSourceType; title: string; summary: string }

/** Subdirectories inside the library root to skip during study-topic scanning. */
const SKIP_DIRS = new Set(['writing', 'repository', '夜航简报', 'Anthropic博客', '.assets', '.git', 'node_modules'])

/**
 * Scan the user's library and build a flat list of readable resources.
 *
 * For MVP: writing + repository come from their .catalog.json entries.
 * Study topics come from scanning top-level dirs for their title (frontmatter of
 * the latest session's 学习报告.md).
 */
export async function buildWritingIndex(cfg: AppConfig): Promise<IndexEntry[]> {
  const entries: IndexEntry[] = []
  const lib = cfg.libraryPath

  // ── 1. writing/ catalog ─────────────────────────────────────
  try {
    const wCat = loadCatalog(lib, 'writing')
    for (const [relPath, entry] of Object.entries(wCat.entries)) {
      entries.push({
        id: `writing:${relPath}`,
        type: 'writing',
        title: entry.title || path.basename(relPath, '.md'),
        summary: entry.summary || '',
      })
    }
  } catch { /* catalog missing or unreadable — skip */ }

  // ── 2. repository/ catalog ──────────────────────────────────
  try {
    const rCat = loadCatalog(lib, 'repository')
    for (const [relPath, entry] of Object.entries(rCat.entries)) {
      entries.push({
        id: `repository:${relPath}`,
        type: 'repository',
        title: entry.title || path.basename(relPath, '.md'),
        summary: entry.summary || '',
      })
    }
  } catch { /* catalog missing or unreadable — skip */ }

  // ── 3. Study topics ─────────────────────────────────────────
  try {
    const dirents = fs.readdirSync(lib, { withFileTypes: true })
    for (const d of dirents) {
      if (!d.isDirectory()) continue
      if (SKIP_DIRS.has(d.name)) continue
      const topicPath = path.join(lib, d.name)
      // Try to read the latest session 学习报告.md to get frontmatter title
      let title = d.name
      let summary = ''
      try {
        const sessions = fs.readdirSync(topicPath, { withFileTypes: true })
          .filter(s => s.isDirectory())
          .sort((a, b) => b.name.localeCompare(a.name)) // newest first
        for (const s of sessions) {
          const reportPath = path.join(topicPath, s.name, '学习报告.md')
          if (fs.existsSync(reportPath)) {
            const raw = fs.readFileSync(reportPath, 'utf-8')
            const m = raw.match(/^---\n([\s\S]*?)\n---/)
            if (m) {
              const fmTitle = m[1].match(/^title:\s*(.+)$/m)
              const fmDesc = m[1].match(/^description:\s*(.+)$/m)
              if (fmTitle) title = fmTitle[1].trim().replace(/^["']|["']$/g, '')
              if (fmDesc) summary = fmDesc[1].trim().replace(/^["']|["']$/g, '')
            }
            break
          }
        }
      } catch { /* keep dir name as title */ }
      entries.push({ id: `study:${d.name}`, type: 'study', title, summary })
    }
  } catch { /* library unreadable — skip */ }

  // ── 4. Blog (Anthropic博客/) ─────────────────────────────────
  try {
    const blogDir = path.join(lib, 'Anthropic博客')
    if (fs.existsSync(blogDir)) {
      const blogFiles = fs.readdirSync(blogDir, { withFileTypes: true })
      for (const f of blogFiles) {
        if (!f.isFile() || !f.name.endsWith('.md')) continue
        const guidePath = path.join(blogDir, f.name.replace(/\.md$/, '.guide.md'))
        let title = f.name.replace(/\.md$/, '')
        let summary = ''
        if (fs.existsSync(guidePath)) {
          try {
            const raw = fs.readFileSync(guidePath, 'utf-8')
            const m = raw.match(/^## 背景\n\n([\s\S]*?)(?:\n## |$)/)
            if (m) summary = m[1].trim().slice(0, 200)
          } catch { /* skip */ }
        }
        entries.push({ id: `blog:${f.name}`, type: 'blog', title, summary })
      }
    }
  } catch { /* skip */ }

  // ── 5. Digest (夜航简报/) ────────────────────────────────────
  try {
    const digestDir = path.join(lib, '夜航简报')
    if (fs.existsSync(digestDir)) {
      const digestFiles = fs.readdirSync(digestDir, { withFileTypes: true })
      for (const f of digestFiles) {
        if (!f.isFile() || !f.name.endsWith('.md')) continue
        let title = f.name.replace(/\.md$/, '')
        let summary = ''
        try {
          const raw = fs.readFileSync(path.join(digestDir, f.name), 'utf-8')
          const m = raw.match(/^---\n([\s\S]*?)\n---/)
          if (m) {
            const fmTitle = m[1].match(/^title:\s*(.+)$/m)
            const fmDesc = m[1].match(/^description:\s*(.+)$/m)
            if (fmTitle) title = fmTitle[1].trim().replace(/^["']|["']$/g, '')
            if (fmDesc) summary = fmDesc[1].trim().replace(/^["']|["']$/g, '')
          }
        } catch { /* skip */ }
        entries.push({ id: `digest:${f.name}`, type: 'digest', title, summary })
      }
    }
  } catch { /* skip */ }

  return entries
}

export function buildWritingSystemPrompt(index: IndexEntry[]): string {
  const catalog = index.map(e => `- [${e.type}] ${e.id} — ${e.title}：${e.summary}`).join('\n')
  return `你是用户的写作助手，可以读取用户的学习资料和写作库来辅助写作。

# 可调取资料目录
${catalog || '(暂无资料)'}

# 工具协议
当需要读取资料全文、搜索网络或向编辑器插入内容时，输出一个工具块：

\`\`\`tool
{"tool":"read_local","ids":["writing:随笔/a.md"]}
\`\`\`

规则：
- read_local：ids 必须来自上方目录的 id。ids 为空数组或 ["index"] 时返回完整目录
- web_search：{"tool":"web_search","query":"搜索关键词"}
- insert_into_article：{"tool":"insert_into_article","markdown":"插入内容"}，把 markdown 内容插入用户正在编辑的文章光标处，直接插入无需确认
- 一次只输出一个工具块；工具结果会以 user 消息返回，然后你继续回答
- 不需要工具时禁止输出工具块（直接回答）
- 禁止编造不存在的 id
- 单轮最多 6 次工具调用`
}
