/**
 * 从文本中提取第一个指定 XML 标签的内容。
 * 支持多行内容、标签前后空白。
 */
export function extractXmlTag(text: string, tag: string): string | null {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`)
  const m = text.match(re)
  return m ? m[1].trim() : null
}

/**
 * 从文本中提取所有同名 XML 标签的内容，返回数组。
 */
export function extractXmlTags(text: string, tag: string): string[] {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g')
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    out.push(m[1].trim())
  }
  return out
}

/**
 * 从 LLM 返回的任意文本中提取第一个 {...} JSON 对象。
 * 处理前后文字、markdown 代码块、多余空格等噪音。
 */
export function extractJsonObject(text: string): string | null {
  text = text.trim()

  // 1. 去除 markdown 代码块包装（```json ... ```）
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (codeBlockMatch) {
    text = codeBlockMatch[1].trim()
  }

  // 2. 从文本中找第一个 { 作为 JSON 对象起始，允许 { 和 " 之间有空白
  let start = -1
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') {
      let j = i + 1
      while (j < text.length && /\s/.test(text[j])) j++
      if (j < text.length && text[j] === '"') {
        start = i
        break
      }
    }
  }
  if (start === -1) return null

  let depth = 0
  let inString = false
  let escape = false
  let end = -1

  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (escape) {
      escape = false
      continue
    }
    if (ch === '\\' && inString) {
      escape = true
      continue
    }
    if (ch === '"' && !inString) {
      inString = true
      continue
    }
    if (ch === '"' && inString) {
      inString = false
      continue
    }
    if (!inString) {
      if (ch === '{') depth++
      if (ch === '}') depth--
      if (depth === 0) {
        end = i
        break
      }
    }
  }

  if (end !== -1) return text.slice(start, end + 1)

  // Fallback: 括号平衡失败时，尝试直接截取第一个 { 到最后一个 }
  const fallback = text.slice(start).match(/\{[\s\S]*?\}(?=\s*$)/)
  if (fallback) {
    try {
      JSON.parse(fallback[0])
      return fallback[0]
    } catch {}
  }

  return null
}

/**
 * 从 LLM 返回的任意文本中提取第一个 [...] JSON 数组。
 * 处理前后文字、markdown 代码块、多余空格等噪音。
 */
export function extractJsonArray(text: string): string | null {
  text = text.trim()

  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (codeBlockMatch) {
    text = codeBlockMatch[1].trim()
  }

  const start = text.indexOf('[')
  if (start === -1) return null

  let depth = 0
  let inString = false
  let escape = false
  let end = -1

  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (escape) {
      escape = false
      continue
    }
    if (ch === '\\' && inString) {
      escape = true
      continue
    }
    if (ch === '"' && !inString) {
      inString = true
      continue
    }
    if (ch === '"' && inString) {
      inString = false
      continue
    }
    if (!inString) {
      if (ch === '[') depth++
      if (ch === ']') depth--
      if (depth === 0) {
        end = i
        break
      }
    }
  }

  if (end !== -1) return text.slice(start, end + 1)

  const fallback = text.slice(start).match(/\[[\s\S]*?\](?=\s*$)/)
  if (fallback) {
    try {
      JSON.parse(fallback[0])
      return fallback[0]
    } catch {}
  }

  return null
}
