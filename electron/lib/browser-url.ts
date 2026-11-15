export function isAllowedBrowserUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export function browserTargetForInput(input: string): string {
  const value = input.trim()
  if (!value) return ''
  if (isAllowedBrowserUrl(value)) return new URL(value).toString()

  const local = /^(localhost|127(?:\.\d+){3}|0\.0\.0\.0)(?::\d+)?(?:[/?#]|$)/i.test(value)
  const hasScheme = !local && /^[a-z][a-z\d+.-]*:/i.test(value)
  const looksLikeHost = !/\s/.test(value) && (
    local || /^[^\s/?#]+\.[^\s/?#]+/.test(value)
  )
  if (!hasScheme && looksLikeHost) {
    const candidate = `${local ? 'http' : 'https'}://${value}`
    if (isAllowedBrowserUrl(candidate)) return new URL(candidate).toString()
  }

  return `https://www.bing.com/search?q=${encodeURIComponent(value)}`
}
