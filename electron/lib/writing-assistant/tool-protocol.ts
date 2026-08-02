export const MAX_TOOL_CALLS = 3

export type ToolCall =
  | { tool: 'read_local'; ids: string[] }
  | { tool: 'web_search'; query: string }
  | { tool: 'insert_into_article'; markdown: string }

const VALID_TOOLS = ['read_local', 'web_search', 'insert_into_article']

export function extractToolCall(text: string): ToolCall | null {
  const m = text.match(/```tool\s*\n([\s\S]*?)```/)
  if (!m) return null
  let json: unknown
  try { json = JSON.parse(m[1].trim()) } catch { return null }
  if (!json || typeof json !== 'object') return null
  const o = json as Record<string, unknown>
  if (!VALID_TOOLS.includes(o.tool as string)) return null
  if (o.tool === 'read_local' && Array.isArray(o.ids) && o.ids.every((x): x is string => typeof x === 'string'))
    return { tool: 'read_local', ids: o.ids }
  if (o.tool === 'web_search' && typeof o.query === 'string' && o.query.length > 0)
    return { tool: 'web_search', query: o.query }
  if (o.tool === 'insert_into_article' && typeof o.markdown === 'string')
    return { tool: 'insert_into_article', markdown: o.markdown }
  return null
}

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
        // Check if this ``` closes the tool block (must be at start of line or preceded by newline)
        toolBody += buf.slice(0, end)
        buf = buf.slice(end + 3)
        inTool = false
        completed = toolBody
        toolBody = ''
        continue
      }
      const start = buf.indexOf('```tool')
      if (start === -1) {
        // Keep trailing prefix that could become ```tool
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
      // Skip leading newline that may be part of the marker
      const clean = body.replace(/^\n/, '')
      return extractToolCall('```tool\n' + clean + '\n```')
    },
    flush: (): string => { const rest = buf; buf = ''; return rest },
  }
}
