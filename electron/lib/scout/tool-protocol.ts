export const MAX_TOOL_CALLS = 3

export type ScoutCandidateInput = {
  title: string
  url: string
  sourceName: string
  reason: string
}

export type ToolCall =
  | { tool: 'web_search'; query: string }
  | { tool: 'propose_candidates'; candidates: ScoutCandidateInput[] }
  | { tool: 'fetch_and_save'; urls: string[] }
  | { tool: 'read_article'; url: string }

const VALID_TOOLS = ['web_search', 'propose_candidates', 'fetch_and_save', 'read_article']

function isCandidate(x: unknown): x is ScoutCandidateInput {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  return typeof o.title === 'string' && typeof o.url === 'string'
    && typeof o.sourceName === 'string' && typeof o.reason === 'string'
}

export function extractToolCall(text: string): ToolCall | null {
  const m = text.match(/```tool\s*\n([\s\S]*?)```/)
  if (!m) return null
  let json: unknown
  try { json = JSON.parse(m[1].trim()) } catch { return null }
  if (!json || typeof json !== 'object') return null
  const o = json as Record<string, unknown>
  if (!VALID_TOOLS.includes(o.tool as string)) return null
  if (o.tool === 'web_search' && typeof o.query === 'string' && o.query.length > 0)
    return { tool: 'web_search', query: o.query }
  if (o.tool === 'propose_candidates' && Array.isArray(o.candidates) && o.candidates.length > 0 && o.candidates.every(isCandidate))
    return { tool: 'propose_candidates', candidates: o.candidates as ScoutCandidateInput[] }
  if (o.tool === 'fetch_and_save' && Array.isArray(o.urls) && o.urls.length > 0 && o.urls.every((x): x is string => typeof x === 'string'))
    return { tool: 'fetch_and_save', urls: o.urls }
  if (o.tool === 'read_article' && typeof o.url === 'string' && o.url.length > 0)
    return { tool: 'read_article', url: o.url }
  return null
}

// --- 以下与写作助手 tool-protocol.ts 的 createToolBuffer 逐字相同 ---
export function createToolBuffer() {
  let buf = ''
  let inTool = false
  let toolBody = ''
  let completed: string | null = null

  const feed = (chunk: string): string => {
    buf += chunk
    let out = ''
    for (;;) {
      if (inTool) {
        const end = buf.indexOf('```')
        if (end === -1) { toolBody += buf; buf = ''; return out }
        toolBody += buf.slice(0, end)
        buf = buf.slice(end + 3)
        inTool = false
        completed = toolBody
        toolBody = ''
        continue
      }
      const start = buf.indexOf('```tool')
      if (start === -1) {
        const m = buf.match(/`{1,3}(t|to|too|tool)?$/)
        const tail = m?.[0] ?? ''
        const keep = tail && buf.endsWith(tail) ? tail.length : 0
        out += buf.slice(0, buf.length - keep)
        buf = buf.slice(buf.length - keep)
        return out
      }
      out += buf.slice(0, start)
      buf = buf.slice(start + '```tool'.length)
      inTool = true
    }
  }

  return {
    feed,
    takeTool: (): ToolCall | null => {
      if (completed === null) return null
      const body = completed
      completed = null
      const clean = body.replace(/^\n/, '')
      return extractToolCall('```tool\n' + clean + '\n```')
    },
    flush: (): string => { const rest = buf; buf = ''; return rest },
  }
}
