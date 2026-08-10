import type { ToolDef } from '../kimi'

export const MAX_TOOL_CALLS = 3

export type NativeToolCall =
  | { id: string; name: 'read_local'; args: { ids: string[] } }
  | { id: string; name: 'web_search'; args: { query: string } }

export function parseNativeToolCall(raw: { id?: string; name?: string; arguments?: string }): NativeToolCall | null {
  if (!raw || typeof raw.name !== 'string') return null
  let parsed: unknown
  try {
    parsed = raw.arguments ? JSON.parse(raw.arguments) : {}
  } catch { return null }
  if (!parsed || typeof parsed !== 'object') return null
  const id = raw.id ?? ''
  if (raw.name === 'read_local') {
    const o = parsed as { ids?: unknown }
    if (!Array.isArray(o.ids) || !o.ids.every((x): x is string => typeof x === 'string')) return null
    return { id, name: 'read_local', args: { ids: o.ids } }
  }
  if (raw.name === 'web_search') {
    const o = parsed as { query?: unknown }
    if (typeof o.query !== 'string' || o.query.length === 0) return null
    return { id, name: 'web_search', args: { query: o.query } }
  }
  return null
}

export function buildToolDefinitions(searchEnabled: boolean): ToolDef[] {
  const defs: ToolDef[] = [{
    type: 'function',
    function: {
      name: 'read_local',
      description: '读取学习库中的本地资料文件（写作/仓库/学习主题/博客/日报）。ids 必须来自系统提示词的资料目录。',
      parameters: {
        type: 'object',
        properties: { ids: { type: 'array', items: { type: 'string' }, description: '要读取的文件 id 列表' } },
        required: ['ids'],
      },
    },
  }]
  if (searchEnabled) {
    defs.push({
      type: 'function',
      function: {
        name: 'web_search',
        description: '搜索网络获取最新信息或做事实核查。仅在需要最新信息时使用。',
        parameters: {
          type: 'object',
          properties: { query: { type: 'string', description: '搜索关键词' } },
          required: ['query'],
        },
      },
    })
  }
  return defs
}
